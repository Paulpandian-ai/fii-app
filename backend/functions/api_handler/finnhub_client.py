"""Finnhub API client for FII api_handler Lambda.

Fetches quotes, candles, company profiles, and basic financials
from Finnhub's free-tier REST API (60 calls/min).

Historical candles: Finnhub first, Yahoo Finance chart API fallback.
(Finnhub free tier does not include US stock candles.)
When upgrading to Finnhub premium, the Yahoo fallback is unused automatically.

API key is read from:
  1. FINNHUB_API_KEY env var (local dev)
  2. FINNHUB_API_KEY_ARN env var -> AWS Secrets Manager
  3. Direct secret name "fii/FINNHUB_API_KEY" -> AWS Secrets Manager
"""

import json
import logging
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_api_key = None
_BASE_URL = "https://finnhub.io/api/v1"
_call_timestamps = []
_MAX_CALLS_PER_MINUTE = 55


def _get_api_key():
    """Retrieve Finnhub API key from env var or Secrets Manager."""
    global _api_key
    if _api_key:
        return _api_key

    # 1) Environment variable (local dev or pre-set)
    env_key = os.environ.get("FINNHUB_API_KEY", "")
    if env_key:
        _api_key = env_key
        return _api_key

    # 2) Secrets Manager via ARN
    arn = os.environ.get("FINNHUB_API_KEY_ARN", "")
    if arn:
        try:
            import boto3
            client = boto3.client("secretsmanager")
            response = client.get_secret_value(SecretId=arn)
            _api_key = response["SecretString"]
            return _api_key
        except Exception as e:
            logger.error(f"[Finnhub] Failed to get key from ARN: {e}")

    # 3) Secrets Manager via secret name
    try:
        import boto3
        client = boto3.client("secretsmanager")
        response = client.get_secret_value(SecretId="fii/FINNHUB_API_KEY")
        _api_key = response["SecretString"]
        return _api_key
    except Exception as e:
        logger.error(f"[Finnhub] Failed to get key from secret name: {e}")

    raise RuntimeError(
        "Finnhub API key not configured. "
        "Set FINNHUB_API_KEY env var, FINNHUB_API_KEY_ARN, "
        "or create secret fii/FINNHUB_API_KEY."
    )


def _rate_limit():
    """Enforce rate limit of 55 calls/minute."""
    now = time.time()
    _call_timestamps[:] = [t for t in _call_timestamps if now - t < 60]
    if len(_call_timestamps) >= _MAX_CALLS_PER_MINUTE:
        wait_time = 60 - (now - _call_timestamps[0]) + 0.1
        if wait_time > 0:
            logger.info(f"[Finnhub] Rate limit reached, waiting {wait_time:.1f}s")
            time.sleep(wait_time)
    _call_timestamps.append(time.time())


def _request(endpoint, params=None, retries=3):
    """Make a rate-limited GET request to Finnhub API."""
    api_key = _get_api_key()
    _rate_limit()

    query_params = {"token": api_key}
    if params:
        query_params.update(params)

    query_string = "&".join(f"{k}={v}" for k, v in query_params.items())
    url = f"{_BASE_URL}/{endpoint}?{query_string}"

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "FII/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 1.0 * (2 ** attempt)
                logger.warning(f"[Finnhub] 429 rate limited, backing off {wait}s")
                time.sleep(wait)
                continue
            logger.error(f"[Finnhub] HTTP {e.code} for {endpoint}: {e.reason}")
            return None
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1.0 * (2 ** attempt))
                continue
            logger.error(f"[Finnhub] Request failed for {endpoint}: {e}")
            return None
    return None


# ─── Public API ───


def get_quote(ticker):
    """Get real-time quote. Returns {price, change, changePercent, prevClose, ...}."""
    data = _request("quote", {"symbol": ticker})
    if not data or data.get("c", 0) == 0:
        return {}
    return {
        "ticker": ticker,
        "price": round(data.get("c", 0), 2),
        "change": round(data.get("d", 0) or 0, 2),
        "changePercent": round(data.get("dp", 0) or 0, 2),
        "high": round(data.get("h", 0), 2),
        "low": round(data.get("l", 0), 2),
        "open": round(data.get("o", 0), 2),
        "prevClose": round(data.get("pc", 0), 2),
        "timestamp": data.get("t", 0),
    }


def get_candles(ticker, resolution="D", from_ts=None, to_ts=None):
    """Get OHLCV candles. Tries Finnhub first, falls back to Yahoo Finance.

    Returns list of {date, open, high, low, close, volume} sorted oldest-first.
    When Finnhub premium is enabled, Finnhub candles are returned directly
    and the Yahoo fallback is never reached.
    """
    candles = _get_candles_finnhub(ticker, resolution, from_ts, to_ts)
    if candles:
        return candles

    # Finnhub free tier doesn't include US stock candles — use Yahoo
    logger.info(f"[Finnhub] No candle data for {ticker}, falling back to Yahoo Finance")
    return _get_candles_yahoo(ticker)


def _get_candles_finnhub(ticker, resolution="D", from_ts=None, to_ts=None):
    """Fetch candles from Finnhub API (works with premium, empty on free tier for US stocks)."""
    now = int(datetime.now(timezone.utc).timestamp())
    if to_ts is None:
        to_ts = now
    if from_ts is None:
        from_ts = to_ts - (365 * 24 * 3600)

    data = _request("stock/candle", {
        "symbol": ticker,
        "resolution": resolution,
        "from": from_ts,
        "to": to_ts,
    })

    if not data or data.get("s") != "ok":
        return []

    candles = []
    timestamps = data.get("t", [])
    opens = data.get("o", [])
    highs = data.get("h", [])
    lows = data.get("l", [])
    closes = data.get("c", [])
    volumes = data.get("v", [])

    for i in range(len(timestamps)):
        candles.append({
            "date": datetime.fromtimestamp(timestamps[i], tz=timezone.utc).strftime("%Y-%m-%d"),
            "open": round(opens[i], 2),
            "high": round(highs[i], 2),
            "low": round(lows[i], 2),
            "close": round(closes[i], 2),
            "volume": int(volumes[i]),
        })
    return candles


def _get_candles_yahoo(ticker):
    """Fetch 1 year of daily OHLCV candles from Yahoo Finance chart API.

    Uses the public v8 chart endpoint — no API key needed.
    Returns same format as Finnhub candles: list of
    {date, open, high, low, close, volume} sorted oldest-first.
    """
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        f"?range=1y&interval=1d&includePrePost=false"
    )
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())

        result = data.get("chart", {}).get("result", [])
        if not result:
            logger.warning(f"[Yahoo] No chart data for {ticker}")
            return []

        chart = result[0]
        timestamps = chart.get("timestamp", [])
        quote = chart.get("indicators", {}).get("quote", [{}])[0]
        opens = quote.get("open", [])
        highs = quote.get("high", [])
        lows = quote.get("low", [])
        closes = quote.get("close", [])
        volumes = quote.get("volume", [])

        candles = []
        for i in range(len(timestamps)):
            # Yahoo sometimes returns None for individual values on holidays
            o = opens[i] if i < len(opens) else None
            h = highs[i] if i < len(highs) else None
            l = lows[i] if i < len(lows) else None
            c = closes[i] if i < len(closes) else None
            v = volumes[i] if i < len(volumes) else None
            if o is None or h is None or l is None or c is None:
                continue
            candles.append({
                "date": datetime.fromtimestamp(timestamps[i], tz=timezone.utc).strftime("%Y-%m-%d"),
                "open": round(o, 2),
                "high": round(h, 2),
                "low": round(l, 2),
                "close": round(c, 2),
                "volume": int(v or 0),
            })

        logger.info(f"[Yahoo] Got {len(candles)} candles for {ticker}")
        return candles

    except Exception as e:
        logger.error(f"[Yahoo] Failed to fetch candles for {ticker}: {e}")
        return []


def get_company_profile(ticker):
    """Get company profile: name, sector, market cap."""
    data = _request("stock/profile2", {"symbol": ticker})
    if not data or not data.get("ticker"):
        return {}
    return {
        "ticker": data.get("ticker", ticker),
        "name": data.get("name", ticker),
        "sector": data.get("finnhubIndustry", ""),
        "marketCap": data.get("marketCapitalization", 0) * 1_000_000,
        "exchange": data.get("exchange", ""),
        "country": data.get("country", ""),
    }


def get_basic_financials(ticker):
    """Get basic financial metrics (PE, beta, 52-week range, etc.)."""
    data = _request("stock/metric", {"symbol": ticker, "metric": "all"})
    if not data or not data.get("metric"):
        return {}
    m = data["metric"]
    return {
        "ticker": ticker,
        "peRatio": m.get("peBasicExclExtraTTM"),
        "forwardPE": m.get("peTTM"),
        "beta": m.get("beta"),
        "fiftyTwoWeekHigh": m.get("52WeekHigh"),
        "fiftyTwoWeekLow": m.get("52WeekLow"),
        "tenDayAvgVolume": m.get("10DayAverageTradingVolume"),
        "revenueGrowthTTM": m.get("revenueGrowthTTMYoy"),
        "epsGrowthTTM": m.get("epsGrowthTTMYoy"),
        "roeTTM": m.get("roeTTM"),
        "debtEquity": m.get("totalDebt/totalEquityQuarterly"),
        "profitMargin": m.get("netProfitMarginTTM"),
        "dividendYield": m.get("dividendYieldIndicatedAnnual"),
        "epsTTM": m.get("epsBasicExclExtraItemsTTM"),
        "epsInclExtra": m.get("epsInclExtraItemsTTM"),
        "revenuePerShareTTM": m.get("revenuePerShareTTM"),
        "bookValuePerShare": m.get("bookValuePerShareQuarterly"),
        "marketCapitalization": m.get("marketCapitalization"),
    }

"""Finnhub API client for FII.

Replaces yfinance with Finnhub's free-tier REST API.
Free tier: 60 calls/min, US stock data, company financials,
earnings, news, and real-time quotes.

All functions return standardized dicts with error handling.
Rate limiter: max 55 calls/min with exponential backoff.
"""

import json
import logging
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_api_key: Optional[str] = None
_BASE_URL = "https://finnhub.io/api/v1"

# Rate limiting: track call timestamps
_call_timestamps: list[float] = []
_MAX_CALLS_PER_MINUTE = 55
_BACKOFF_BASE = 1.0


def _get_api_key() -> str:
    """Retrieve Finnhub API key from Secrets Manager or env var."""
    global _api_key
    if _api_key:
        return _api_key

    # Try environment variable first (for local dev)
    env_key = os.environ.get("FINNHUB_API_KEY", "")
    if env_key:
        _api_key = env_key
        return _api_key

    # Try Secrets Manager
    arn = os.environ.get("FINNHUB_API_KEY_ARN", "")
    if arn:
        try:
            import boto3
            client = boto3.client("secretsmanager")
            response = client.get_secret_value(SecretId=arn)
            _api_key = response["SecretString"]
            return _api_key
        except Exception as e:
            logger.error(f"[Finnhub] Failed to get API key from Secrets Manager: {e}")

    raise RuntimeError("Finnhub API key not configured. Set FINNHUB_API_KEY env var or FINNHUB_API_KEY_ARN.")


def _rate_limit() -> None:
    """Enforce rate limit of 55 calls/minute with backoff."""
    now = time.time()
    # Remove timestamps older than 60 seconds
    _call_timestamps[:] = [t for t in _call_timestamps if now - t < 60]

    if len(_call_timestamps) >= _MAX_CALLS_PER_MINUTE:
        # Wait until the oldest call in the window expires
        wait_time = 60 - (now - _call_timestamps[0]) + 0.1
        if wait_time > 0:
            logger.info(f"[Finnhub] Rate limit reached, waiting {wait_time:.1f}s")
            time.sleep(wait_time)

    _call_timestamps.append(time.time())


def _request(endpoint: str, params: Optional[dict] = None, retries: int = 3) -> Optional[dict]:
    """Make a rate-limited request to Finnhub API with exponential backoff."""
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
                data = json.loads(resp.read().decode())
                return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = _BACKOFF_BASE * (2 ** attempt)
                logger.warning(f"[Finnhub] Rate limited (429), backing off {wait}s")
                time.sleep(wait)
                continue
            logger.error(f"[Finnhub] HTTP {e.code} for {endpoint}: {e.reason}")
            return None
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(_BACKOFF_BASE * (2 ** attempt))
                continue
            logger.error(f"[Finnhub] Request failed for {endpoint}: {e}")
            return None

    return None


# ─── Public API Functions ───


def get_quote(ticker: str) -> dict:
    """Get real-time quote for a ticker.

    Returns: {price, change, changePercent, high, low, open, prevClose, volume, timestamp}
    """
    data = _request("quote", {"symbol": ticker})
    if not data or data.get("c", 0) == 0:
        return {}

    return {
        "ticker": ticker,
        "price": round(data.get("c", 0), 2),         # Current price
        "change": round(data.get("d", 0) or 0, 2),    # Change
        "changePercent": round(data.get("dp", 0) or 0, 2),  # Change %
        "high": round(data.get("h", 0), 2),            # Day high
        "low": round(data.get("l", 0), 2),             # Day low
        "open": round(data.get("o", 0), 2),            # Open
        "prevClose": round(data.get("pc", 0), 2),      # Previous close
        "timestamp": data.get("t", 0),                 # Unix timestamp
    }


def get_candles(ticker: str, resolution: str = "D",
                from_ts: Optional[int] = None, to_ts: Optional[int] = None) -> list[dict]:
    """Get OHLCV candles for a ticker.

    Args:
        ticker: Stock symbol.
        resolution: Candle resolution (1, 5, 15, 30, 60, D, W, M).
        from_ts: Start unix timestamp. Defaults to 1 year ago.
        to_ts: End unix timestamp. Defaults to now.

    Returns: List of {date, open, high, low, close, volume} dicts.
    """
    now = int(datetime.now(timezone.utc).timestamp())
    if to_ts is None:
        to_ts = now
    if from_ts is None:
        from_ts = to_ts - (365 * 24 * 3600)  # 1 year

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


def get_company_profile(ticker: str) -> dict:
    """Get company profile: name, sector, market cap, etc."""
    data = _request("stock/profile2", {"symbol": ticker})
    if not data or not data.get("ticker"):
        return {}

    return {
        "ticker": data.get("ticker", ticker),
        "name": data.get("name", ticker),
        "sector": data.get("finnhubIndustry", ""),
        "marketCap": data.get("marketCapitalization", 0) * 1_000_000,  # Finnhub returns in millions
        "exchange": data.get("exchange", ""),
        "ipo": data.get("ipo", ""),
        "logo": data.get("logo", ""),
        "weburl": data.get("weburl", ""),
        "country": data.get("country", ""),
    }


def get_peers(ticker: str) -> list[str]:
    """Get list of peer tickers for a company."""
    data = _request("stock/peers", {"symbol": ticker})
    if not data or not isinstance(data, list):
        return []
    # Finnhub returns the ticker itself in peers; filter it out
    return [p for p in data if p != ticker][:5]


def get_earnings(ticker: str) -> list[dict]:
    """Get recent earnings data."""
    data = _request("stock/earnings", {"symbol": ticker, "limit": 4})
    if not data or not isinstance(data, list):
        return []

    return [
        {
            "period": e.get("period", ""),
            "actual": e.get("actual"),
            "estimate": e.get("estimate"),
            "surprise": e.get("surprise"),
            "surprisePercent": e.get("surprisePercent"),
        }
        for e in data
    ]


def get_news(ticker: str, days: int = 7) -> list[dict]:
    """Get recent news for a ticker."""
    from_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    to_date = from_date  # Finnhub uses today as default range

    data = _request("company-news", {
        "symbol": ticker,
        "from": (datetime.now(timezone.utc) - __import__("datetime").timedelta(days=days)).strftime("%Y-%m-%d"),
        "to": from_date,
    })

    if not data or not isinstance(data, list):
        return []

    return [
        {
            "headline": n.get("headline", ""),
            "source": n.get("source", ""),
            "url": n.get("url", ""),
            "datetime": n.get("datetime", 0),
            "summary": n.get("summary", "")[:200],
        }
        for n in data[:10]
    ]


def get_basic_financials(ticker: str) -> dict:
    """Get basic financial metrics (PE, margins, 52-week range, beta, etc.)."""
    data = _request("stock/metric", {"symbol": ticker, "metric": "all"})
    if not data or not data.get("metric"):
        return {}

    m = data["metric"]
    return {
        "ticker": ticker,
        "peRatio": m.get("peBasicExclExtraTTM"),
        "forwardPE": m.get("peNTM"),
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


def get_market_data_for_signal(ticker: str) -> dict:
    """Unified function to replace market_data.get_yahoo_finance_data().

    Fetches quote + basic financials + earnings and returns a dict
    compatible with the signal engine's expected format.
    """
    quote = get_quote(ticker)
    financials = get_basic_financials(ticker)
    profile = get_company_profile(ticker)
    earnings_list = get_earnings(ticker)

    current_price = quote.get("price", 0)
    prev_close = quote.get("prevClose", 0)
    high_52w = financials.get("fiftyTwoWeekHigh", 0) or 0
    low_52w = financials.get("fiftyTwoWeekLow", 0) or 0

    # Range position (0 = at 52w low, 1 = at 52w high)
    if high_52w > low_52w and current_price > 0:
        range_position = (current_price - low_52w) / (high_52w - low_52w)
    else:
        range_position = 0.5

    # Earnings surprise from latest quarter
    earnings_surprise_pct = 0
    if earnings_list:
        latest = earnings_list[0]
        sp = latest.get("surprisePercent")
        if sp is not None:
            earnings_surprise_pct = round(float(sp), 2)

    return {
        "ticker": ticker,
        "current_price": round(current_price, 2),
        "fifty_two_week_low": round(low_52w, 2),
        "fifty_two_week_high": round(high_52w, 2),
        "range_position": round(range_position, 4),
        "market_cap": profile.get("marketCap", 0),
        "earnings_surprise_pct": earnings_surprise_pct,
        "beta": round(financials.get("beta") or 1.0, 4),
        "forward_pe": round(financials.get("forwardPE") or 0, 2),
        "relative_return_30d": 0,  # Computed separately if needed
        "companyName": profile.get("name", ticker),
        "sector": profile.get("sector", ""),
    }

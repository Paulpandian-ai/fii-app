"""FII Data Refresh — Scheduled price & technicals cache refresh.

Processes full S&P 500 (503 stocks) + 20 ETFs = 523 securities.
Uses wave-based processing with rate limiting to stay within
Finnhub's free tier (60 calls/min, using 55 as safe limit).

Modes:
  - "prices": Price-only refresh (~1 call/stock, ~10 min for 523)
  - "full": Prices + technicals for TIER_1/TIER_2, prices for TIER_3/ETF
  - "single": Refresh a single ticker (via {"tickers": ["NVDA"]})

Schedule:
  - 9:45 AM ET: Market-open prices
  - Every 30 min during market hours: Price-only
  - 4:30 PM ET: Full daily refresh (prices + technicals)
"""

import json
import logging
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, "/opt/python")

import db
import finnhub_client
import technical_engine
from models import (
    ALL_SECURITIES,
    COMPANY_NAMES,
    ETF_SET,
    STOCK_SECTORS,
    STOCK_UNIVERSE,
    TIER_1_SET,
    TIER_2_SET,
    get_tier,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Rate limiting: 55 Finnhub calls per minute (5 req/min buffer)
CALLS_PER_MINUTE = 55
CALL_INTERVAL = 60.0 / CALLS_PER_MINUTE  # ~1.09 seconds between calls
PROGRESS_INTERVAL = 50  # Log progress every N stocks


def lambda_handler(event, context):
    """Refresh price and technical data for all tracked securities.

    Processes stocks in waves with rate limiting. Logs progress every 50 stocks.
    Individual failures are logged but don't stop the batch.
    """
    mode = event.get("mode", "full")
    tickers = event.get("tickers") or _get_tracked_tickers()

    # Legacy batch support (backwards compatible)
    batch = event.get("batch")
    if batch is not None:
        batch = int(batch)
        batch_size = max(len(tickers) // 4, 50)
        start = (batch - 1) * batch_size
        end = start + batch_size if batch < 4 else len(tickers)
        tickers = tickers[start:end]

    total = len(tickers)
    logger.info(f"[DataRefresh] Starting mode={mode} for {total} tickers")

    results = {"refreshed": 0, "errors": 0, "error_tickers": []}
    start_time = time.time()
    call_count = 0
    window_start = time.time()

    for i, ticker in enumerate(tickers):
        try:
            tier = get_tier(ticker)

            if mode in ("prices", "full"):
                # Price refresh: 2-3 Finnhub calls (quote + profile + financials)
                is_etf = ticker in ETF_SET
                _refresh_price(ticker, is_etf=is_etf)
                call_count += 3

            if mode == "full" and tier in ("TIER_1", "TIER_2"):
                # Full technicals for TIER_1 and TIER_2 only
                _refresh_technicals(ticker)
                call_count += 1
            elif mode == "full" and tier in ("TIER_3", "ETF"):
                # TIER_3 and ETFs get technicals too but computed from price data
                _refresh_technicals(ticker)
                call_count += 1

            results["refreshed"] += 1

            # Rate limiting: ensure we don't exceed 55 calls/min
            elapsed = time.time() - window_start
            if elapsed < 60 and call_count >= CALLS_PER_MINUTE:
                sleep_time = 60 - elapsed + 1
                logger.info(f"[DataRefresh] Rate limit reached ({call_count} calls), sleeping {sleep_time:.0f}s")
                time.sleep(sleep_time)
                call_count = 0
                window_start = time.time()
            elif elapsed >= 60:
                call_count = 0
                window_start = time.time()

            # Minimum delay between stocks
            time.sleep(CALL_INTERVAL)

        except Exception as e:
            logger.error(f"[DataRefresh] Error refreshing {ticker}: {e}")
            results["errors"] += 1
            results["error_tickers"].append(ticker)
            # Store error record
            try:
                db.put_item({
                    "PK": f"REFRESH_ERROR#{datetime.now(timezone.utc).strftime('%Y-%m-%d')}",
                    "SK": ticker,
                    "error": str(e)[:500],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:
                pass

        # Progress logging every PROGRESS_INTERVAL stocks
        if (i + 1) % PROGRESS_INTERVAL == 0:
            elapsed_total = time.time() - start_time
            rate = (i + 1) / elapsed_total * 60 if elapsed_total > 0 else 0
            remaining = (total - i - 1) / rate * 60 if rate > 0 else 0
            logger.info(
                f"[DataRefresh] Progress: {i + 1}/{total} "
                f"({results['refreshed']} ok, {results['errors']} errors) "
                f"Rate: {rate:.0f}/min, ETA: {remaining:.0f}s"
            )
            # Write progress to DynamoDB
            try:
                db.put_item({
                    "PK": "REFRESH_PROGRESS",
                    "SK": "LATEST",
                    "processed": i + 1,
                    "total": total,
                    "refreshed": results["refreshed"],
                    "errors": results["errors"],
                    "mode": mode,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:
                pass

    elapsed_total = time.time() - start_time
    results["timestamp"] = datetime.now(timezone.utc).isoformat()
    results["durationSeconds"] = round(elapsed_total, 1)
    results["totalSecurities"] = total

    logger.info(
        f"[DataRefresh] Complete: {results['refreshed']} refreshed, "
        f"{results['errors']} errors in {elapsed_total:.0f}s"
    )

    return {
        "statusCode": 200,
        "body": json.dumps(results),
    }


def _get_tracked_tickers() -> list[str]:
    """Get full universe of tracked securities."""
    tickers = list(ALL_SECURITIES)

    # Also include any custom watchlist tickers
    try:
        watchlist_items = db.query("WATCHLIST#anonymous")
        for item in (watchlist_items or []):
            for wi in item.get("items", []):
                ticker = wi.get("ticker", "")
                if ticker and ticker not in tickers:
                    tickers.append(ticker)
    except Exception:
        pass

    return tickers


def _refresh_price(ticker: str, is_etf: bool = False) -> None:
    """Fetch and cache current price from Finnhub."""
    quote = finnhub_client.get_quote(ticker)
    if not quote or not quote.get("price"):
        logger.warning(f"[DataRefresh] No price data for {ticker}")
        return

    financials = {}
    profile = {}
    try:
        financials = finnhub_client.get_basic_financials(ticker) or {}
    except Exception:
        pass
    try:
        profile = finnhub_client.get_company_profile(ticker) or {}
    except Exception:
        pass

    sector = profile.get("sector", "") or STOCK_SECTORS.get(ticker, "")
    company_name = profile.get("name", "") or COMPANY_NAMES.get(ticker, ticker)

    cache_item = {
        "PK": f"PRICE#{ticker}",
        "SK": "LATEST",
        "GSI1PK": "PRICES",
        "GSI1SK": f"{str(round(float(quote.get('changePercent', 0) or 0), 2)).zfill(10)}#{ticker}",
        "ticker": ticker,
        "price": str(round(float(quote.get("price", 0) or 0), 2)),
        "previousClose": str(round(float(quote.get("prevClose", 0) or 0), 2)),
        "change": str(round(float(quote.get("change", 0) or 0), 2)),
        "changePercent": str(round(float(quote.get("changePercent", 0) or 0), 2)),
        "marketCap": str(profile.get("marketCap", 0) or 0),
        "fiftyTwoWeekLow": str(round(float(financials.get("fiftyTwoWeekLow", 0) or 0), 2)),
        "fiftyTwoWeekHigh": str(round(float(financials.get("fiftyTwoWeekHigh", 0) or 0), 2)),
        "beta": str(round(float(financials.get("beta", 1.0) or 1.0), 2)),
        "forwardPE": str(round(float(financials.get("forwardPE", 0) or 0), 2)),
        "trailingPE": str(round(float(financials.get("peRatio", 0) or 0), 2)),
        "sector": sector,
        "companyName": company_name,
        "isETF": is_etf,
        "tier": get_tier(ticker),
        "cachedAt": datetime.now(timezone.utc).isoformat(),
    }
    db.put_item(cache_item)


def _refresh_technicals(ticker: str) -> None:
    """Fetch candle data and compute technical indicators."""
    candles = finnhub_client.get_candles(ticker, resolution="D")
    if not candles:
        logger.warning(f"[DataRefresh] No candle data for {ticker}")
        return

    indicators = technical_engine.compute_indicators(candles)
    if indicators.get("error"):
        logger.warning(f"[DataRefresh] Insufficient data for {ticker}: {indicators.get('error')}")
        return

    indicators["ticker"] = ticker
    cache_item = {
        "PK": f"TECHNICALS#{ticker}",
        "SK": "LATEST",
        "ticker": ticker,
        "technicalScore": str(round(float(indicators.get("technicalScore", 5.0)), 1)),
        "indicators": indicators,
        "cachedAt": datetime.now(timezone.utc).isoformat(),
    }
    db.put_item(cache_item)

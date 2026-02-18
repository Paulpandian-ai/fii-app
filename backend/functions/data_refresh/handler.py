"""FII Data Refresh — Scheduled price & technicals cache refresh.

Triggered by EventBridge schedule (every 30 min during market hours,
once daily after close). Refreshes price cache and technical indicators
for all tracked stocks via Finnhub API.

Rate-limited to stay within Finnhub's free tier (60 calls/min).
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
from models import STOCK_UNIVERSE

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    """Refresh price and technical data for all tracked stocks.

    Modes:
    - "prices": Refresh price cache only (fast, ~1 API call/stock)
    - "technicals": Refresh technical indicators (slower, ~2 calls/stock)
    - "full": Both prices and technicals (default for daily run)
    """
    mode = event.get("mode", "full")
    tickers = event.get("tickers") or _get_tracked_tickers()

    logger.info(f"[DataRefresh] Starting mode={mode} for {len(tickers)} tickers")

    results = {"refreshed": 0, "errors": 0, "details": []}

    for ticker in tickers:
        try:
            if mode in ("prices", "full"):
                _refresh_price(ticker)

            if mode in ("technicals", "full"):
                _refresh_technicals(ticker)

            results["refreshed"] += 1
            results["details"].append({"ticker": ticker, "status": "ok"})

            # Rate limit: ~2 seconds between stocks to stay under 55 calls/min
            time.sleep(2)

        except Exception as e:
            logger.error(f"[DataRefresh] Error refreshing {ticker}: {e}")
            results["errors"] += 1
            results["details"].append({"ticker": ticker, "status": "error", "error": str(e)})

    results["timestamp"] = datetime.now(timezone.utc).isoformat()
    logger.info(
        f"[DataRefresh] Complete: {results['refreshed']} refreshed, {results['errors']} errors"
    )

    return {
        "statusCode": 200,
        "body": json.dumps(results),
    }


def _get_tracked_tickers() -> list[str]:
    """Get all tickers that have signals or are in watchlists."""
    tickers = set(STOCK_UNIVERSE)

    # Also include any tickers from user watchlists
    try:
        watchlist_items = db.query("SIGNALS", index_name="GSI1", limit=100)
        for item in watchlist_items:
            ticker = item.get("ticker", "")
            if ticker:
                tickers.add(ticker)
    except Exception:
        pass

    return sorted(tickers)


def _refresh_price(ticker: str) -> None:
    """Fetch and cache current price from Finnhub."""
    quote = finnhub_client.get_quote(ticker)
    if not quote or not quote.get("price"):
        logger.warning(f"[DataRefresh] No price data for {ticker}")
        return

    financials = finnhub_client.get_basic_financials(ticker)
    profile = finnhub_client.get_company_profile(ticker)

    cache_item = {
        "PK": f"PRICE#{ticker}",
        "SK": "LATEST",
        "ticker": ticker,
        "price": str(round(quote.get("price", 0), 2)),
        "previousClose": str(round(quote.get("prevClose", 0), 2)),
        "change": str(round(quote.get("change", 0), 2)),
        "changePercent": str(round(quote.get("changePercent", 0), 2)),
        "marketCap": str(profile.get("marketCap", 0)),
        "fiftyTwoWeekLow": str(round(financials.get("fiftyTwoWeekLow", 0) or 0, 2)),
        "fiftyTwoWeekHigh": str(round(financials.get("fiftyTwoWeekHigh", 0) or 0, 2)),
        "beta": str(round(financials.get("beta", 1.0) or 1.0, 2)),
        "forwardPE": str(round(financials.get("forwardPE", 0) or 0, 2)),
        "trailingPE": str(round(financials.get("peRatio", 0) or 0, 2)),
        "sector": profile.get("sector", ""),
        "companyName": profile.get("name", ticker),
        "cachedAt": datetime.now(timezone.utc).isoformat(),
    }
    db.put_item(cache_item)
    logger.info(f"[DataRefresh] Price cached for {ticker}: ${quote.get('price', 0)}")


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
        "indicators": indicators,
        "cachedAt": datetime.now(timezone.utc).isoformat(),
    }
    db.put_item(cache_item)
    logger.info(
        f"[DataRefresh] Technicals cached for {ticker}: "
        f"score={indicators.get('technicalScore', 'N/A')}"
    )

"""FII Data Refresh — Scheduled price & technicals cache refresh.

Processes full S&P 500 (503 stocks) + 20 ETFs = 523 securities.
Uses wave-based processing with rate limiting to stay within
Finnhub's free tier (60 calls/min, using 55 as safe limit).

Modes:
  - "prices": Price-only refresh (~1 call/stock, ~10 min for 523)
  - "full": Prices + technicals for TIER_1/TIER_2, prices for TIER_3/ETF
  - "signals": Generate AI signals for ALL stocks (no Finnhub API calls)
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
    TIER_1,
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

    # Signals-only mode: generate signals for all tickers, no Finnhub API calls
    if mode == "signals":
        signal_tickers = event.get("tickers")
        if signal_tickers:
            pass  # Use provided tickers list
        elif event.get("ticker"):
            signal_tickers = [event["ticker"]]
        else:
            signal_tickers = _get_tracked_tickers()
        return _run_signal_generation(signal_tickers)

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

            # Generate signals on full refresh
            if mode in ("signals", "full"):
                try:
                    _refresh_signals(ticker)
                except Exception as sig_err:
                    logger.warning(f"[DataRefresh] Signal gen failed for {ticker}: {sig_err}")

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


# ─── Signal Generation ───


def _run_signal_generation(tickers: list[str]) -> dict:
    """Run signal generation for a list of tickers (no Finnhub calls)."""
    total = len(tickers)
    logger.info(f"[SignalGen] Starting signal generation for {total} tickers")
    results = {"generated": 0, "errors": 0, "error_tickers": [], "signals": {}}
    start_time = time.time()

    for i, ticker in enumerate(tickers):
        try:
            _refresh_signals(ticker)
            # Read back the signal to report it
            sig_item = db.get_item(f"SIGNAL#{ticker}", "LATEST")
            if sig_item:
                results["signals"][ticker] = {
                    "signal": sig_item.get("signal"),
                    "score": float(sig_item.get("compositeScore", 0)),
                    "confidence": sig_item.get("confidence"),
                }
            results["generated"] += 1
        except Exception as e:
            logger.error(f"[SignalGen] Error for {ticker}: {e}")
            results["errors"] += 1
            results["error_tickers"].append(ticker)

        if (i + 1) % 10 == 0:
            logger.info(f"[SignalGen] Progress: {i + 1}/{total}")

    elapsed = time.time() - start_time
    results["durationSeconds"] = round(elapsed, 1)
    results["totalTickers"] = total
    results["timestamp"] = datetime.now(timezone.utc).isoformat()

    # Summary
    buy_count = sum(1 for s in results["signals"].values() if s["signal"] == "BUY")
    hold_count = sum(1 for s in results["signals"].values() if s["signal"] == "HOLD")
    sell_count = sum(1 for s in results["signals"].values() if s["signal"] == "SELL")
    logger.info(
        f"[SignalGen] Complete: {results['generated']} signals "
        f"(BUY={buy_count}, HOLD={hold_count}, SELL={sell_count}) "
        f"in {elapsed:.1f}s"
    )

    return {"statusCode": 200, "body": json.dumps(results, default=str)}


def _safe_float(val, default=0.0):
    """Safely convert DynamoDB Decimal or string to float."""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _refresh_signals(ticker: str) -> None:
    """Generate AI signal for a single ticker using existing DynamoDB data.

    Computes a composite score from 6 weighted components using real
    PRICE#, TECHNICALS#, and HEALTH# records. No external API calls.
    """
    # ── Gather existing data ──
    price_data = db.get_item(f"PRICE#{ticker}", "LATEST")
    if not price_data:
        logger.warning(f"[SignalGen] No PRICE# for {ticker}, skipping")
        return

    tech_data = db.get_item(f"TECHNICALS#{ticker}", "LATEST")
    health_data = db.get_item(f"HEALTH#{ticker}", "LATEST")

    # Extract price fields
    change_pct = _safe_float(price_data.get("changePercent"))
    market_cap = _safe_float(price_data.get("marketCap"))
    sector = price_data.get("sector", "") or STOCK_SECTORS.get(ticker, "")
    company_name = price_data.get("companyName", "") or COMPANY_NAMES.get(ticker, ticker)
    beta = _safe_float(price_data.get("beta"), default=1.0)

    # Extract technical fields
    tech_score_raw = None
    rsi = None
    if tech_data:
        tech_score_raw = _safe_float(tech_data.get("technicalScore"), default=None)
        indicators = tech_data.get("indicators") or {}
        if isinstance(indicators, str):
            try:
                indicators = json.loads(indicators)
            except Exception:
                indicators = {}
        rsi = _safe_float(indicators.get("rsi"), default=None)

    # Extract health/fundamental fields
    fund_grade = None
    if health_data:
        analysis = health_data.get("analysis") or {}
        if isinstance(analysis, str):
            try:
                analysis = json.loads(analysis)
            except Exception:
                analysis = {}
        fund_grade = analysis.get("grade")

    # ── Component 1: Price Momentum (25%) ──
    data_sources = 0
    if change_pct > 5.0:
        momentum_score = 9.5
    elif change_pct > 3.0:
        momentum_score = 8.0
    elif change_pct > 1.5:
        momentum_score = 7.0
    elif change_pct > 0.5:
        momentum_score = 6.0
    elif change_pct > -0.5:
        momentum_score = 5.0
    elif change_pct > -1.5:
        momentum_score = 4.0
    elif change_pct > -3.0:
        momentum_score = 3.0
    elif change_pct > -5.0:
        momentum_score = 2.0
    else:
        momentum_score = 1.5
    # Count as real data if we have any price movement info
    if change_pct != 0.0 or price_data.get("price"):
        data_sources += 1

    # ── Component 2: Technical Score (20%) ──
    if tech_score_raw is not None:
        technical_score = max(1.0, min(10.0, tech_score_raw))
        # Adjust with RSI if available
        if rsi is not None:
            if rsi < 30:
                rsi_adj = 7.0 + (30 - rsi) / 30       # 7-8 oversold = bullish
            elif rsi > 70:
                rsi_adj = 3.0 - (rsi - 70) / 30       # 2-3 overbought = bearish
            else:
                rsi_adj = 5.0
            rsi_adj = max(1.0, min(10.0, rsi_adj))
            # Blend: 70% technical score + 30% RSI adjustment
            technical_score = technical_score * 0.7 + rsi_adj * 0.3
        data_sources += 1
    elif rsi is not None:
        if rsi < 30:
            technical_score = 7.0 + (30 - rsi) / 30
        elif rsi > 70:
            technical_score = 3.0 - (rsi - 70) / 30
        else:
            technical_score = 5.0 + (50 - rsi) / 40
        technical_score = max(1.0, min(10.0, technical_score))
        data_sources += 1
    else:
        technical_score = 5.0

    # ── Component 3: Fundamental Health (20%) ──
    grade_map = {
        "A+": 9.5, "A": 9.0, "A-": 8.5,
        "B+": 7.5, "B": 7.0, "B-": 6.5,
        "C+": 5.5, "C": 5.0, "C-": 4.5,
        "D+": 3.5, "D": 3.0, "D-": 2.5,
        "F": 1.5,
    }
    if fund_grade and fund_grade in grade_map:
        fundamental_score = grade_map[fund_grade]
        data_sources += 1
    else:
        fundamental_score = 5.0

    # ── Component 4: Market Cap Stability (10%) ──
    if market_cap and market_cap > 0:
        if market_cap > 200_000_000_000:
            stability_score = 7.5    # Mega cap
        elif market_cap > 50_000_000_000:
            stability_score = 7.0    # Large cap
        elif market_cap > 10_000_000_000:
            stability_score = 6.0    # Mid cap
        elif market_cap > 2_000_000_000:
            stability_score = 5.0    # Small cap
        else:
            stability_score = 4.0    # Micro cap
        data_sources += 1
    else:
        stability_score = 5.0

    # ── Component 5: Sector Momentum (15%) ──
    # Based on the stock's absolute price change as a sector signal
    if change_pct > 2.0:
        sector_score = 8.0
    elif change_pct > 0.5:
        sector_score = 6.5
    elif change_pct > -0.5:
        sector_score = 5.0
    elif change_pct > -2.0:
        sector_score = 3.5
    else:
        sector_score = 2.0
    if sector:
        data_sources += 1

    # ── Component 6: Volatility/Risk (10%) ──
    if beta and beta != 1.0:
        if beta < 1.0 and change_pct > 0:
            volatility_score = 7.0    # Low vol + positive = good
        elif beta > 1.3 and change_pct < -1.0:
            volatility_score = 2.5    # High vol + negative = bad
        elif beta < 0.8:
            volatility_score = 6.5
        elif beta > 1.3:
            volatility_score = 3.5
        else:
            volatility_score = 5.0
        volatility_score = max(1.0, min(10.0, volatility_score))
        data_sources += 1
    else:
        volatility_score = 5.0

    # ── Weighted composite ──
    composite = (
        momentum_score * 0.25
        + technical_score * 0.20
        + fundamental_score * 0.20
        + stability_score * 0.10
        + sector_score * 0.15
        + volatility_score * 0.10
    )
    composite = round(max(1.0, min(10.0, composite)), 1)

    # ── Signal thresholds ──
    if composite >= 7.0:
        signal = "BUY"
    elif composite < 4.0:
        signal = "SELL"
    else:
        signal = "HOLD"

    # ── Confidence ──
    if data_sources >= 5:
        confidence = "HIGH"
    elif data_sources >= 3:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    # ── Write SIGNAL# record ──
    signal_item = {
        "PK": f"SIGNAL#{ticker}",
        "SK": "LATEST",
        "ticker": ticker,
        "companyName": company_name,
        "compositeScore": str(composite),
        "signal": signal,
        "confidence": confidence,
        "sector": sector,
        "dimensionScores": {
            "momentum": str(round(momentum_score, 1)),
            "technical": str(round(technical_score, 1)),
            "fundamental": str(round(fundamental_score, 1)),
            "stability": str(round(stability_score, 1)),
            "sectorMomentum": str(round(sector_score, 1)),
            "volatility": str(round(volatility_score, 1)),
        },
        "dataSources": data_sources,
        "tier": get_tier(ticker),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    db.put_item(signal_item)
    logger.info(
        f"[SignalGen] {ticker}: score={composite}, signal={signal}, "
        f"confidence={confidence}, sources={data_sources}"
    )

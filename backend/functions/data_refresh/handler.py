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

    # Write AGENT_RUN# record for scheduler tracking
    try:
        agent_id = {"prices": "price_refresh", "full": "technicals_refresh",
                     "signals": "signal_generation", "fundamentals": "fundamentals_refresh"
                     }.get(mode, mode)
        db.put_item({
            "PK": f"AGENT_RUN#{agent_id}",
            "SK": datetime.now(timezone.utc).isoformat(),
            "status": "completed",
            "duration": round(elapsed_total, 1),
            "processed": results["refreshed"],
            "errors": results["errors"],
            "trigger": event.get("trigger", "manual"),
        })
    except Exception:
        pass

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
    strong_count = sum(1 for s in results["signals"].values() if s["signal"] in ("Strong", "Favorable"))
    neutral_count = sum(1 for s in results["signals"].values() if s["signal"] == "Neutral")
    weak_count = sum(1 for s in results["signals"].values() if s["signal"] in ("Weak", "Caution"))
    logger.info(
        f"[SignalGen] Complete: {results['generated']} signals "
        f"(Strong/Favorable={strong_count}, Neutral={neutral_count}, Weak/Caution={weak_count}) "
        f"in {elapsed:.1f}s"
    )

    # Write AGENT_RUN# record for scheduler tracking
    try:
        db.put_item({
            "PK": "AGENT_RUN#signal_generation",
            "SK": datetime.now(timezone.utc).isoformat(),
            "status": "completed",
            "duration": round(elapsed, 1),
            "processed": results["generated"],
            "errors": results["errors"],
            "trigger": "signals",
            "detail": f"BUY={buy_count} HOLD={hold_count} SELL={sell_count}",
        })
    except Exception:
        pass

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
    """Generate AI signal for a single ticker using rich DynamoDB data.

    Computes a composite score from 6 weighted components using real
    PRICE#, TECHNICALS# (full indicator suite), and HEALTH# (grade + ratios)
    records. No external API calls.
    """
    # ── Gather existing data ──
    price_data = db.get_item(f"PRICE#{ticker}", "LATEST")
    if not price_data:
        logger.warning(f"[SignalGen] No PRICE# for {ticker}, skipping")
        return

    tech_data = db.get_item(f"TECHNICALS#{ticker}", "LATEST")
    health_data = db.get_item(f"HEALTH#{ticker}", "LATEST")

    # ── Parse price fields ──
    price = _safe_float(price_data.get("price"))
    change_pct = _safe_float(price_data.get("changePercent"))
    market_cap = _safe_float(price_data.get("marketCap"))
    sector = price_data.get("sector", "") or STOCK_SECTORS.get(ticker, "")
    company_name = price_data.get("companyName", "") or COMPANY_NAMES.get(ticker, ticker)

    # ── Parse technical indicators ──
    indicators = {}
    tech_score_raw = None
    if tech_data:
        tech_score_raw = _safe_float(tech_data.get("technicalScore"), default=None)
        indicators = tech_data.get("indicators") or {}
        if isinstance(indicators, str):
            try:
                indicators = json.loads(indicators)
            except Exception:
                indicators = {}

    rsi = _safe_float(indicators.get("rsi"), default=None)
    sma20 = _safe_float(indicators.get("sma20"), default=None)
    sma50 = _safe_float(indicators.get("sma50"), default=None)
    sma200 = _safe_float(indicators.get("sma200"), default=None)
    adx = _safe_float(indicators.get("adx"), default=None)
    atr = _safe_float(indicators.get("atr"), default=None)
    obv = _safe_float(indicators.get("obv"), default=None)

    macd_data = indicators.get("macd") or {}
    if isinstance(macd_data, str):
        try:
            macd_data = json.loads(macd_data)
        except Exception:
            macd_data = {}
    macd_histogram = _safe_float(macd_data.get("histogram"), default=None)

    stoch_data = indicators.get("stochastic") or {}
    if isinstance(stoch_data, str):
        try:
            stoch_data = json.loads(stoch_data)
        except Exception:
            stoch_data = {}
    stoch_k = _safe_float(stoch_data.get("k"), default=None)

    bb_data = indicators.get("bollingerBands") or {}
    if isinstance(bb_data, str):
        try:
            bb_data = json.loads(bb_data)
        except Exception:
            bb_data = {}
    bb_upper = _safe_float(bb_data.get("upper"), default=None)
    bb_lower = _safe_float(bb_data.get("lower"), default=None)

    # ── Parse fundamental / health data ──
    fund_grade = None
    f_score = None
    ratios = {}
    if health_data:
        analysis = health_data.get("analysis") or {}
        if isinstance(analysis, str):
            try:
                analysis = json.loads(analysis)
            except Exception:
                analysis = {}
        fund_grade = analysis.get("grade")
        f_score = _safe_float(analysis.get("fScore"), default=None)
        ratios = analysis.get("ratios") or {}
        if isinstance(ratios, str):
            try:
                ratios = json.loads(ratios)
            except Exception:
                ratios = {}

    pe_ratio = _safe_float(ratios.get("peRatio"), default=None)
    roe = _safe_float(ratios.get("roe"), default=None)
    debt_to_equity = _safe_float(ratios.get("debtToEquity"), default=None)

    # ─────────────────────────────────────────────────
    # Component 1: Multi-Timeframe Momentum (25%)
    # ─────────────────────────────────────────────────
    data_sources = 0
    momentum_signals = 0  # count of bullish vs bearish signals
    momentum_total = 0    # total signals checked
    has_sma_data = False

    # SMA20 crossover (short-term trend)
    if sma20 and price:
        has_sma_data = True
        momentum_total += 1
        if price > sma20:
            momentum_signals += 1  # bullish
        # else bearish (0)

    # SMA50 crossover (medium-term trend)
    if sma50 and price:
        has_sma_data = True
        momentum_total += 1
        if price > sma50:
            momentum_signals += 1

    # Golden/Death Cross: SMA50 vs SMA200
    if sma50 and sma200:
        has_sma_data = True
        momentum_total += 1
        if sma50 > sma200:
            momentum_signals += 1  # golden cross

    # MACD histogram
    if macd_histogram is not None:
        has_sma_data = True
        momentum_total += 1
        if macd_histogram > 0:
            momentum_signals += 1  # bullish momentum

    # Daily changePercent (always available)
    momentum_total += 1
    if change_pct > 0.5:
        momentum_signals += 1
    elif change_pct > -0.5:
        momentum_signals += 0.5  # neutral gets half

    if momentum_total > 0:
        # Convert ratio to 1-10: 0 signals = 1.0, all bullish = 9.5
        ratio = momentum_signals / momentum_total
        momentum_score = 1.0 + ratio * 8.5
    else:
        momentum_score = 5.0

    if has_sma_data or change_pct != 0.0:
        data_sources += 1

    # ─────────────────────────────────────────────────
    # Component 2: Technical Score (20%)
    # ─────────────────────────────────────────────────
    tech_parts = []
    has_tech_data = False

    # 40% pre-computed technicalScore
    if tech_score_raw is not None:
        tech_parts.append(("tech", 0.40, max(1.0, min(10.0, tech_score_raw))))
        has_tech_data = True

    # 25% RSI signal
    if rsi is not None:
        has_tech_data = True
        if rsi < 25:
            rsi_score = 9.0
        elif rsi < 30:
            rsi_score = 7.5
        elif rsi < 40:
            rsi_score = 6.0
        elif rsi <= 60:
            rsi_score = 5.0
        elif rsi <= 70:
            rsi_score = 4.0
        elif rsi <= 75:
            rsi_score = 3.0
        else:
            rsi_score = 1.5
        tech_parts.append(("rsi", 0.25, rsi_score))

    # 20% Stochastic K
    if stoch_k is not None:
        has_tech_data = True
        if stoch_k < 20:
            stoch_score = 8.0
        elif stoch_k < 40:
            stoch_score = 6.0
        elif stoch_k <= 60:
            stoch_score = 5.0
        elif stoch_k <= 80:
            stoch_score = 4.0
        else:
            stoch_score = 2.0
        tech_parts.append(("stoch", 0.20, stoch_score))

    # 15% ADX as trend strength multiplier (applied later)
    adx_multiplier = 1.0
    if adx is not None:
        has_tech_data = True
        if adx > 40:
            adx_multiplier = 1.3
        elif adx > 25:
            adx_multiplier = 1.1
        elif adx < 15:
            adx_multiplier = 0.8

    if tech_parts:
        # Weighted average of available tech parts, renormalized
        total_weight = sum(w for _, w, _ in tech_parts)
        technical_score = sum(w * s for _, w, s in tech_parts) / total_weight
        # Apply ADX multiplier: amplify distance from neutral (5.0)
        distance = technical_score - 5.0
        technical_score = 5.0 + distance * adx_multiplier
        technical_score = max(1.0, min(10.0, technical_score))
        data_sources += 1
    elif has_tech_data:
        technical_score = 5.0
        data_sources += 1
    else:
        technical_score = 5.0

    # ─────────────────────────────────────────────────
    # Component 3: Fundamental Health (20%)
    # ─────────────────────────────────────────────────
    fund_parts = []
    has_fund_data = False

    # 40% grade score
    grade_map = {
        "A+": 9.5, "A": 9.0, "A-": 8.5,
        "B+": 7.5, "B": 7.0, "B-": 6.5,
        "C+": 5.5, "C": 5.0, "C-": 4.5,
        "D+": 3.5, "D": 3.0, "D-": 2.5,
        "F": 1.5,
    }
    if fund_grade and fund_grade in grade_map:
        fund_parts.append(("grade", 0.40, grade_map[fund_grade]))
        has_fund_data = True

    # 15% P/E ratio
    if pe_ratio is not None:
        has_fund_data = True
        if pe_ratio < 0:
            pe_score = 2.0
        elif pe_ratio < 12:
            pe_score = 8.5
        elif pe_ratio < 20:
            pe_score = 7.0
        elif pe_ratio < 30:
            pe_score = 5.5
        elif pe_ratio < 50:
            pe_score = 4.0
        else:
            pe_score = 2.5
        fund_parts.append(("pe", 0.15, pe_score))

    # 15% ROE
    if roe is not None:
        has_fund_data = True
        if roe > 25:
            roe_score = 9.0
        elif roe > 15:
            roe_score = 7.5
        elif roe > 10:
            roe_score = 6.0
        elif roe > 0:
            roe_score = 4.5
        else:
            roe_score = 2.0
        fund_parts.append(("roe", 0.15, roe_score))

    # 15% Debt/Equity
    if debt_to_equity is not None:
        has_fund_data = True
        if debt_to_equity < 0.3:
            de_score = 8.5
        elif debt_to_equity < 0.7:
            de_score = 7.0
        elif debt_to_equity < 1.5:
            de_score = 5.5
        elif debt_to_equity < 3.0:
            de_score = 3.5
        else:
            de_score = 2.0
        fund_parts.append(("de", 0.15, de_score))

    # 15% Piotroski F-Score (0-9 mapped to 1-10)
    if f_score is not None and 0 <= f_score <= 9:
        has_fund_data = True
        piotroski_score = 1.0 + f_score * (9.0 / 9.0)  # 0→1.0, 9→10.0
        fund_parts.append(("fscore", 0.15, piotroski_score))

    if fund_parts:
        total_weight = sum(w for _, w, _ in fund_parts)
        fundamental_score = sum(w * s for _, w, s in fund_parts) / total_weight
        fundamental_score = max(1.0, min(10.0, fundamental_score))
        data_sources += 1
    elif has_fund_data:
        fundamental_score = 5.0
        data_sources += 1
    else:
        fundamental_score = 5.0

    # ─────────────────────────────────────────────────
    # Component 4: Market Cap Stability (10%)
    # ─────────────────────────────────────────────────
    if market_cap and market_cap > 0:
        if market_cap > 200_000_000_000:
            stability_score = 7.5
        elif market_cap > 50_000_000_000:
            stability_score = 7.0
        elif market_cap > 10_000_000_000:
            stability_score = 6.0
        elif market_cap > 2_000_000_000:
            stability_score = 5.0
        else:
            stability_score = 4.0
        data_sources += 1
    else:
        stability_score = 5.0

    # ─────────────────────────────────────────────────
    # Component 5: Sector Momentum + Bollinger (15%)
    # ─────────────────────────────────────────────────
    # Base score from changePercent
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

    # Adjust with Bollinger Band position
    if bb_upper and bb_lower and price and bb_upper != bb_lower:
        bb_position = (price - bb_lower) / (bb_upper - bb_lower)
        bb_position = max(0.0, min(1.0, bb_position))
        if bb_position < 0.2:
            sector_score += 1.5   # near bottom = oversold opportunity
        elif bb_position > 0.8:
            sector_score -= 1.0   # near top = stretched
        sector_score = max(1.0, min(10.0, sector_score))

    if sector:
        data_sources += 1

    # ─────────────────────────────────────────────────
    # Component 6: Volume & Volatility (10%)
    # ─────────────────────────────────────────────────
    if atr is not None and price and price > 0:
        vol_pct = atr / price * 100  # volatility as % of price
        if vol_pct < 2.0 and change_pct > 0:
            volatility_score = 7.5   # low vol + up
        elif vol_pct < 2.0 and change_pct < 0:
            volatility_score = 5.5   # low vol + down (mild concern)
        elif vol_pct > 4.0 and change_pct < -1.0:
            volatility_score = 2.5   # high vol + down
        elif vol_pct > 4.0 and change_pct > 1.0:
            volatility_score = 6.0   # high vol + up (risky but bullish)
        else:
            volatility_score = 5.0
        # OBV confirmation
        if obv is not None:
            if obv > 0 and change_pct > 0:
                volatility_score += 0.5  # volume confirms up move
            elif obv < 0 and change_pct < 0:
                volatility_score -= 0.5  # volume confirms down move
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

    # ── Score label thresholds ──
    score_int = round(composite)
    if score_int >= 9:
        signal = "Strong"
    elif score_int >= 7:
        signal = "Favorable"
    elif score_int >= 5:
        signal = "Neutral"
    elif score_int >= 3:
        signal = "Weak"
    else:
        signal = "Caution"

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

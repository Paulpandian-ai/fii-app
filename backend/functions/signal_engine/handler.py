"""FII Signal Engine — 6-factor analysis pipeline.

Triggered daily at 6AM ET (cron via EventBridge) or on-demand
via API. Analyzes stocks across 18 sub-factors (A1–F3) grouped
into 4 weighted categories:
  - Micro Web (25%): Upstream Suppliers + Downstream Customers
  - Macro Climate (20%): Geopolitics + Monetary
  - Correlations (20%): Sector, Commodity, Sentiment correlations
  - Risk & Performance (15%): EPS, Guidance, Volatility
"""

import json
import logging
import sys
import time
import traceback
from datetime import datetime, timezone

# Lambda adds /opt/python to sys.path for layers automatically.
# This explicit insert ensures it works in all execution contexts.
sys.path.insert(0, "/opt/python")

import db
import s3
import claude_client
import market_data
import finnhub_client
import technical_engine
import sec_edgar
import batch_scorer
from models import (
    ALL_NON_ETF,
    ALL_SECURITIES,
    COMPANY_NAMES,
    DIMENSION_FACTOR_MAP,
    DIMENSION_WEIGHTS,
    ETF_SET,
    FACTOR_IDS,
    FACTOR_NAMES,
    PEER_MAP,
    STOCK_SECTORS,
    STOCK_UNIVERSE,
    TIER_1_SET,
    TIER_2_SET,
    TIER_3_SET,
    compute_composite_score,
    compute_dimension_scores,
    compute_weighted_composite,
    determine_confidence,
    determine_score_label,
    determine_signal,
    get_tier,
    score_to_label,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    """Run the 6-factor signal analysis.

    Routes on event.run_type:
      "daily_light"    — Light refresh: detect changes, update technicals, NO Claude
      "weekly_deep"    — Full Claude-powered analysis for all stocks (Saturday 6AM)
      "process_queue"  — Process urgent scoring queue (hourly during market hours)
      (default)        — Legacy: single ticker or scheduled fan-out
    """
    try:
        run_type = event.get("run_type", "")
        logger.info(
            f"[SignalEngine] Starting at {datetime.now(timezone.utc).isoformat()}, "
            f"run_type={run_type or 'default'}"
        )

        # ── Route based on run_type ──
        if run_type == "daily_light":
            return _run_daily_light_refresh(event)
        if run_type == "weekly_deep":
            return _run_weekly_deep_analysis(event, context)
        if run_type == "process_queue":
            return _run_queue_processor(event)

        # ── Batch mode: score a slice of the stock universe ──
        if event.get("batch_start") is not None:
            return _run_batch_slice(event)

        # ── Legacy: single ticker or scheduled fan-out ──
        tickers = _extract_tickers(event)

        # Single ticker — process it directly (tier-aware)
        if len(tickers) == 1:
            ticker = tickers[0]
            tier = get_tier(ticker)
            logger.info(f"[SignalEngine] Analyzing {ticker} (tier={tier})...")
            result = analyze_ticker(ticker, tier=tier)
            logger.info(
                f"[SignalEngine] {ticker}: score={result['compositeScore']}, "
                f"label={result['score_label']}"
            )

            # Normalize signal distribution across all stocks
            _normalize_signals()

            # Enhanced Claude batch scoring with sourced rationales
            _run_batch_scoring(event, tickers)

            return {
                "statusCode": 200,
                "body": json.dumps({
                    "analyzed": 1,
                    "errors": 0,
                    "results": [
                        {"ticker": result["ticker"], "score": result["compositeScore"], "score_label": result["score_label"]}
                    ],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }),
            }

        # Multiple tickers — fan out as async invocations (one per stock)
        return _fan_out(tickers, context)

    except Exception as e:
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }


def _fan_out(tickers: list[str], context) -> dict:
    """Invoke self asynchronously for each ticker (fire-and-forget)."""
    import boto3

    lambda_client = boto3.client("lambda")
    function_name = context.function_name
    dispatched = []
    errors = []

    for ticker in tickers:
        try:
            lambda_client.invoke(
                FunctionName=function_name,
                InvocationType="Event",
                Payload=json.dumps({"ticker": ticker}),
            )
            dispatched.append(ticker)
            logger.info(f"[SignalEngine] Dispatched async invocation for {ticker}")
        except Exception as e:
            logger.error(f"[SignalEngine] Failed to dispatch {ticker}: {e}")
            errors.append({"ticker": ticker, "error": str(e)})

    logger.info(
        f"[SignalEngine] Fan-out complete: {len(dispatched)} dispatched, {len(errors)} errors"
    )

    return {
        "statusCode": 200,
        "body": json.dumps({
            "mode": "fan-out",
            "dispatched": len(dispatched),
            "errors": len(errors),
            "tickers": dispatched,
            "error_details": errors,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }),
    }


def _extract_tickers(event: dict) -> list[str]:
    """Extract ticker list from event payload.

    For scheduled events, returns full universe.
    For on-demand, extracts from event body.
    """
    # On-demand: API Gateway or direct invocation
    body = {}
    if "body" in event:
        body = json.loads(event.get("body", "{}") or "{}")
    elif "ticker" in event:
        return [event["ticker"].upper()]
    elif "tickers" in event:
        return [t.upper() for t in event["tickers"]]

    if "ticker" in body:
        return [body["ticker"].upper()]
    if "tickers" in body:
        return [t.upper() for t in body["tickers"]]

    # Scheduled: analyze full universe (stocks + ETFs)
    return list(ALL_SECURITIES)


def analyze_ticker(ticker: str, tier: str = None) -> dict:
    """Run tiered analysis pipeline for a single ticker.

    Tier determines analysis depth:
    - TIER_1: Full Claude AI + all 6 factors + supply chain + reasoning
    - TIER_2: Technical + Fundamental only (no Claude, no supply chain)
    - TIER_3: Technical only
    - ETF: Technical only with isETF flag

    Args:
        ticker: Stock ticker symbol.
        tier: Analysis tier. Auto-detected if not provided.

    Returns:
        Complete signal result dict.
    """
    if tier is None:
        tier = get_tier(ticker)

    company_name = COMPANY_NAMES.get(ticker, ticker)
    peers = PEER_MAP.get(ticker, [])
    is_etf = ticker in ETF_SET

    # ── TIER_3 and ETF: Technical-only analysis (fast path) ──
    if tier in ("TIER_3", "ETF"):
        return _analyze_technical_only(ticker, company_name, is_etf)

    # ── TIER_2: Technical + Fundamental (no Claude AI) ──
    if tier == "TIER_2":
        return _analyze_tier2(ticker, company_name, peers)

    # ── Step 1: SEC Filing Extraction ──
    logger.info(f"[{ticker}] Step 1: SEC filing extraction")
    supply_chain = sec_edgar.extract_supply_chain(ticker)

    # ── Step 2: FRED Macro Data ──
    logger.info(f"[{ticker}] Step 2: FRED macro data")
    macro_data = market_data.get_fred_macro_data()

    # ── Step 3: Finnhub Market Data ──
    logger.info(f"[{ticker}] Step 3: Finnhub market data")
    yf_data = finnhub_client.get_market_data_for_signal(ticker)

    # ── Step 3b: Technical Indicators ──
    logger.info(f"[{ticker}] Step 3b: Technical indicators")
    candles = finnhub_client.get_candles(ticker, resolution="D")
    tech_data = technical_engine.compute_indicators(candles) if candles else {}
    technical_score = tech_data.get("technicalScore", 5.0)

    # ── Step 4: Correlation Matrix ──
    logger.info(f"[{ticker}] Step 4: Correlation matrix")
    correlations = market_data.get_correlation_matrix(ticker, peers)

    # ── Step 5: Claude Factor Scoring ──
    logger.info(f"[{ticker}] Step 5: Claude factor scoring")
    factor_details = claude_client.score_factors(
        ticker=ticker,
        supply_chain=supply_chain,
        macro_data=macro_data,
        market_data=yf_data,
        correlations=correlations,
    )

    # Merge pre-computed scores from data fetchers
    _merge_precomputed_scores(factor_details, macro_data, correlations, yf_data)

    # ── Step 5b: Compute Composite Score (blended with technical score) ──
    scores_only = {fid: d["score"] for fid, d in factor_details.items()}
    factor_composite = compute_composite_score(scores_only)
    # Blend: 60% factor analysis + 40% technical score (normalized to same 1-10 scale)
    composite_score = round(factor_composite * 0.6 + technical_score * 0.4, 1)
    composite_score = max(1.0, min(10.0, composite_score))
    label = score_to_label(round(composite_score))
    confidence = determine_confidence(scores_only)

    # Delay between Claude API calls to avoid 429 rate limiting
    time.sleep(2)

    # ── Step 6: Claude Reasoning ──
    logger.info(f"[{ticker}] Step 6: Generating reasoning")
    reasoning = claude_client.generate_reasoning(
        ticker=ticker,
        company_name=company_name,
        score=composite_score,
        signal=label,
        factor_details=factor_details,
    )

    # Create short insight (first sentence or first 200 chars)
    insight = reasoning.split(".")[0] + "." if "." in reasoning else reasoning[:200]

    # Delay between Claude API calls to avoid 429 rate limiting
    time.sleep(2)

    # ── Step 7: Alternatives ──
    logger.info(f"[{ticker}] Step 7: Generating alternatives")
    alternatives = claude_client.generate_alternatives(
        ticker=ticker,
        company_name=company_name,
        signal=label,
        score=composite_score,
        factor_details=factor_details,
    )

    # ── Build Result ──
    now = datetime.now(timezone.utc).isoformat()

    # Top factors (sorted by absolute impact)
    sorted_factors = sorted(
        factor_details.items(),
        key=lambda x: abs(x[1]["score"]),
        reverse=True,
    )
    top_factors = [
        {"name": FACTOR_NAMES.get(fid, fid), "score": d["score"]}
        for fid, d in sorted_factors[:6]
    ]

    result = {
        "ticker": ticker,
        "companyName": company_name,
        "compositeScore": composite_score,
        "signal": label,
        "score_label": label,
        "confidence": confidence.value,
        "insight": insight,
        "reasoning": reasoning,
        "topFactors": top_factors,
        "factorDetails": {
            fid: {"score": d["score"], "reason": d["reason"]}
            for fid, d in factor_details.items()
        },
        "alternatives": alternatives,
        "analyzedAt": now,
        "marketData": {
            "currentPrice": yf_data.get("current_price", 0),
            "marketCap": yf_data.get("market_cap", 0),
            "beta": yf_data.get("beta", 1.0),
            "forwardPE": yf_data.get("forward_pe", 0),
            "earningsSurprise": yf_data.get("earnings_surprise_pct", 0),
        },
        "technicalAnalysis": {
            "technicalScore": technical_score,
            "rsi": tech_data.get("rsi"),
            "macd": tech_data.get("macd", {}),
            "sma20": tech_data.get("sma20"),
            "sma50": tech_data.get("sma50"),
            "sma200": tech_data.get("sma200"),
            "bollingerBands": tech_data.get("bollingerBands", {}),
            "atr": tech_data.get("atr"),
            "signals": tech_data.get("signals", {}),
            "indicatorCount": tech_data.get("indicatorCount", 0),
        },
        "macroSnapshot": {
            k: v.get("current", 0)
            for k, v in macro_data.get("indicators", {}).items()
        },
        "correlations": correlations.get("correlations", {}),
    }

    # ── Step 8: Store Results ──
    logger.info(f"[{ticker}] Step 8: Storing results")
    _store_signal(ticker, result)

    return result


def _analyze_technical_only(ticker: str, company_name: str, is_etf: bool = False) -> dict:
    """TIER_3 / ETF analysis: technical score only."""
    logger.info(f"[{ticker}] Technical-only analysis (tier={'ETF' if is_etf else 'TIER_3'})")

    # Fetch market data
    yf_data = {}
    try:
        yf_data = finnhub_client.get_market_data_for_signal(ticker)
    except Exception as e:
        logger.warning(f"[{ticker}] Market data fetch failed: {e}")

    # Technical indicators
    tech_data = {}
    technical_score = 5.0
    try:
        candles = finnhub_client.get_candles(ticker, resolution="D")
        if candles:
            tech_data = technical_engine.compute_indicators(candles)
            technical_score = tech_data.get("technicalScore", 5.0)
    except Exception as e:
        logger.warning(f"[{ticker}] Technical analysis failed: {e}")

    # Composite = technical score mapped to 1-10
    composite_score = round(max(1.0, min(10.0, technical_score)), 1)
    label = score_to_label(round(composite_score))
    now = datetime.now(timezone.utc).isoformat()

    result = {
        "ticker": ticker,
        "companyName": company_name,
        "compositeScore": composite_score,
        "signal": label,
        "score_label": label,
        "confidence": "LOW",
        "insight": f"Technical analysis only. Score: {composite_score}/10.",
        "reasoning": "",
        "topFactors": [],
        "factorDetails": {},
        "alternatives": [],
        "analyzedAt": now,
        "tier": "ETF" if is_etf else "TIER_3",
        "isETF": is_etf,
        "marketData": {
            "currentPrice": yf_data.get("current_price", 0),
            "marketCap": yf_data.get("market_cap", 0),
            "beta": yf_data.get("beta", 1.0),
            "forwardPE": yf_data.get("forward_pe", 0),
            "earningsSurprise": yf_data.get("earnings_surprise_pct", 0),
        },
        "technicalAnalysis": {
            "technicalScore": technical_score,
            "rsi": tech_data.get("rsi"),
            "macd": tech_data.get("macd", {}),
            "sma20": tech_data.get("sma20"),
            "sma50": tech_data.get("sma50"),
            "sma200": tech_data.get("sma200"),
            "bollingerBands": tech_data.get("bollingerBands", {}),
            "atr": tech_data.get("atr"),
            "signals": tech_data.get("signals", {}),
            "indicatorCount": tech_data.get("indicatorCount", 0),
        },
    }

    _store_signal(ticker, result)
    return result


def _analyze_tier2(ticker: str, company_name: str, peers: list) -> dict:
    """TIER_2 analysis: technical + fundamental (no Claude AI)."""
    logger.info(f"[{ticker}] TIER_2 analysis (technical + fundamental)")

    # Market data
    yf_data = {}
    try:
        yf_data = finnhub_client.get_market_data_for_signal(ticker)
    except Exception as e:
        logger.warning(f"[{ticker}] Market data fetch failed: {e}")

    # Technical indicators
    tech_data = {}
    technical_score = 5.0
    try:
        candles = finnhub_client.get_candles(ticker, resolution="D")
        if candles:
            tech_data = technical_engine.compute_indicators(candles)
            technical_score = tech_data.get("technicalScore", 5.0)
    except Exception as e:
        logger.warning(f"[{ticker}] Technical analysis failed: {e}")

    # Fundamental score from market data
    fundamental_score = 5.0
    eps = yf_data.get("earnings_surprise_pct", 0)
    fpe = yf_data.get("forward_pe", 0)
    beta = yf_data.get("beta", 1.0)
    # Simple fundamental scoring
    f_score = 5.0
    if eps > 5:
        f_score += 1.5
    elif eps > 0:
        f_score += 0.5
    elif eps < -5:
        f_score -= 1.5
    if fpe and 5 < fpe < 25:
        f_score += 0.5
    elif fpe and fpe > 50:
        f_score -= 0.5
    if beta and beta > 1.5:
        f_score -= 0.5
    fundamental_score = max(1.0, min(10.0, f_score))

    # Composite: 50% technical + 50% fundamental
    composite_score = round((technical_score * 0.5 + fundamental_score * 0.5), 1)
    composite_score = max(1.0, min(10.0, composite_score))
    label = score_to_label(round(composite_score))
    now = datetime.now(timezone.utc).isoformat()

    result = {
        "ticker": ticker,
        "companyName": company_name,
        "compositeScore": composite_score,
        "signal": label,
        "score_label": label,
        "confidence": "LOW",
        "insight": f"Technical + fundamental analysis. Score: {composite_score}/10.",
        "reasoning": "",
        "topFactors": [],
        "factorDetails": {},
        "alternatives": [],
        "analyzedAt": now,
        "tier": "TIER_2",
        "isETF": False,
        "marketData": {
            "currentPrice": yf_data.get("current_price", 0),
            "marketCap": yf_data.get("market_cap", 0),
            "beta": beta,
            "forwardPE": fpe,
            "earningsSurprise": eps,
        },
        "technicalAnalysis": {
            "technicalScore": technical_score,
            "rsi": tech_data.get("rsi"),
            "macd": tech_data.get("macd", {}),
            "sma20": tech_data.get("sma20"),
            "sma50": tech_data.get("sma50"),
            "sma200": tech_data.get("sma200"),
            "bollingerBands": tech_data.get("bollingerBands", {}),
            "atr": tech_data.get("atr"),
            "signals": tech_data.get("signals", {}),
            "indicatorCount": tech_data.get("indicatorCount", 0),
        },
    }

    _store_signal(ticker, result)
    return result


def _merge_precomputed_scores(
    factor_details: dict,
    macro_data: dict,
    correlations: dict,
    yf_data: dict,
) -> None:
    """Merge pre-computed scores from data fetchers into factor details.

    Data fetchers compute quantitative scores for D1-D3 (macro),
    E1-E3 (correlations). These are blended with Claude's scores
    by averaging.
    """
    # Merge FRED macro scores (D1-D3)
    macro_scores = macro_data.get("scores", {})
    for fid in ["D1", "D2", "D3"]:
        if fid in macro_scores and fid in factor_details:
            quant_score = macro_scores[fid]
            claude_score = factor_details[fid]["score"]
            # Average quantitative and Claude scores
            blended = (quant_score + claude_score) / 2
            factor_details[fid]["score"] = round(max(-2.0, min(2.0, blended)), 1)

    # Merge correlation scores (E1-E3)
    corr_scores = correlations.get("scores", {})
    for fid in ["E1", "E2", "E3"]:
        if fid in corr_scores and fid in factor_details:
            quant_score = corr_scores[fid]
            claude_score = factor_details[fid]["score"]
            blended = (quant_score + claude_score) / 2
            factor_details[fid]["score"] = round(max(-2.0, min(2.0, blended)), 1)

    # F1 (EPS Surprise): use quantitative data
    eps_surprise = yf_data.get("earnings_surprise_pct", 0)
    if "F1" in factor_details and eps_surprise != 0:
        if eps_surprise > 10:
            quant_f1 = 2.0
        elif eps_surprise > 5:
            quant_f1 = 1.0
        elif eps_surprise > 0:
            quant_f1 = 0.5
        elif eps_surprise > -5:
            quant_f1 = -0.5
        elif eps_surprise > -10:
            quant_f1 = -1.0
        else:
            quant_f1 = -2.0
        claude_f1 = factor_details["F1"]["score"]
        factor_details["F1"]["score"] = round(
            max(-2.0, min(2.0, (quant_f1 + claude_f1) / 2)), 1
        )

    # F3 (Beta/Volatility): use quantitative data
    beta = yf_data.get("beta", 1.0)
    if "F3" in factor_details:
        if beta > 1.5:
            quant_f3 = -1.0  # High volatility risk
        elif beta > 1.2:
            quant_f3 = -0.5
        elif beta < 0.8:
            quant_f3 = 0.5   # Low volatility
        else:
            quant_f3 = 0.0
        claude_f3 = factor_details["F3"]["score"]
        factor_details["F3"]["score"] = round(
            max(-2.0, min(2.0, (quant_f3 + claude_f3) / 2)), 1
        )


def _normalize_signals() -> None:
    """Apply forced distribution across all stocks.

    Ranks all stocks by composite score, assigns FII Score 1-10
    using forced percentile buckets, and writes score_label,
    percentile_rank, score_drivers, and factor_percentiles
    to each SIGNAL#LATEST record.
    """
    signal_items = []
    for ticker in ALL_SECURITIES:
        try:
            item = db.get_item(f"SIGNAL#{ticker}", "LATEST")
            if item:
                score = float(item.get("compositeScore", 0))
                signal_items.append((ticker, item, score))
        except Exception:
            pass

    if len(signal_items) < 10:
        logger.info(f"[SignalEngine] Only {len(signal_items)} signals, skipping normalization")
        return

    # Sort by composite score descending (best first)
    signal_items.sort(key=lambda x: x[2], reverse=True)
    total = len(signal_items)

    # Forced distribution buckets (cumulative %)
    BUCKETS = [
        (10, 0.05),   # top 5%
        (9,  0.15),   # 5-15%
        (8,  0.30),   # 15-30%
        (7,  0.45),   # 30-45%
        (6,  0.55),   # 45-55%
        (5,  0.65),   # 55-65%
        (4,  0.80),   # 65-80%
        (3,  0.90),   # 80-90%
        (2,  0.95),   # 90-95%
        (1,  1.00),   # bottom 5%
    ]

    SCORE_LABELS = {
        10: "Strong", 9: "Strong",
        8: "Favorable", 7: "Favorable",
        6: "Neutral", 5: "Neutral",
        4: "Weak", 3: "Weak",
        2: "Caution", 1: "Caution",
    }

    # Group by sector for sector percentiles
    sector_groups = {}
    for i, (ticker, item, score) in enumerate(signal_items):
        sector = item.get("sector", "Unknown")
        if sector not in sector_groups:
            sector_groups[sector] = []
        sector_groups[sector].append((i, ticker, score))

    # Compute sector percentiles
    sector_percentiles = {}
    for sector, stocks in sector_groups.items():
        stocks.sort(key=lambda x: x[2], reverse=True)
        for rank, (orig_idx, ticker, score) in enumerate(stocks):
            pct = int(100 * (1 - rank / max(len(stocks), 1)))
            sector_percentiles[ticker] = pct

    # ── Compute per-dimension factor percentiles across all stocks ──
    dimension_keys = [
        "supply_chain_upstream", "supply_chain_downstream",
        "geopolitical", "monetary", "correlations", "risk_performance",
    ]

    # Parse dimensionScores for each stock (stored as JSON string)
    parsed_dim_scores = {}  # ticker -> {dim_key: float}
    for ticker, item, _score in signal_items:
        raw_dim = item.get("dimensionScores", {})
        if isinstance(raw_dim, str):
            try:
                raw_dim = json.loads(raw_dim)
            except (json.JSONDecodeError, TypeError):
                raw_dim = {}
        parsed_dim_scores[ticker] = raw_dim

    # For each dimension, rank all stocks that have a score for it
    factor_percentiles_map = {}  # ticker -> {dim_key: percentile}
    for dim_key in dimension_keys:
        dim_entries = []
        for ticker, item, _score in signal_items:
            dim_val = parsed_dim_scores.get(ticker, {}).get(dim_key)
            if dim_val is not None:
                try:
                    dim_entries.append((ticker, float(dim_val)))
                except (ValueError, TypeError):
                    pass

        if not dim_entries:
            continue

        # Sort by score descending (higher = better percentile)
        dim_entries.sort(key=lambda x: x[1], reverse=True)
        dim_total = len(dim_entries)
        for rank, (tk, _val) in enumerate(dim_entries):
            percentile = int(((dim_total - rank) / dim_total) * 100)
            factor_percentiles_map.setdefault(tk, {})[dim_key] = percentile

    # For stocks missing a dimension, default to 50
    for ticker, item, _score in signal_items:
        fp = factor_percentiles_map.get(ticker, {})
        for dk in dimension_keys:
            if dk not in fp:
                fp[dk] = 50
        factor_percentiles_map[ticker] = fp

    logger.info(f"[SignalEngine] Computed factor percentiles for {len(factor_percentiles_map)} stocks")

    # ── Score driver templates for normalization pass ──
    _NORM_TEMPLATES = {
        "supply_chain_upstream": {
            "pos": "Supplier health is strong — key suppliers reporting stable operations",
            "neg": "Supply chain risk detected — supplier disruptions or financial stress",
            "mid": "Supply chain conditions are mixed — monitoring supplier stability",
        },
        "supply_chain_downstream": {
            "pos": "Customer demand is healthy — major customers showing strength",
            "neg": "Customer risk elevated — key customers showing weakness",
            "mid": "Customer conditions are balanced — demand signals are mixed",
        },
        "geopolitical": {
            "pos": "Low geopolitical exposure — minimal trade barrier or conflict risk",
            "neg": "Elevated geopolitical risk — trade restrictions or regional instability",
            "mid": "Moderate geopolitical exposure — some trade or regulatory sensitivity",
        },
        "monetary": {
            "pos": "Favorable rate environment — monetary conditions support valuation",
            "neg": "Rate headwinds — tightening conditions pressuring valuation",
            "mid": "Neutral monetary impact — current rate environment is balanced",
        },
        "correlations": {
            "pos": "Strong sector positioning — outperforming correlated peers",
            "neg": "Weak relative performance — lagging sector and correlated assets",
            "mid": "In-line with sector — moving with broader market trends",
        },
        "risk_performance": {
            "pos": "Strong fundamentals — earnings beat and positive guidance",
            "neg": "Performance concerns — earnings miss or negative guidance",
            "mid": "Mixed performance signals — earnings and guidance are neutral",
        },
    }

    updated = 0
    distribution = {}

    for i, (ticker, item, score) in enumerate(signal_items):
        # Universe percentile (100 = best)
        percentile_rank = int(100 * (1 - i / total))

        # Forced distribution FII Score
        position = (i + 1) / total
        fii_score = 1
        for bucket_score, threshold in BUCKETS:
            if position <= threshold:
                fii_score = bucket_score
                break

        score_label = SCORE_LABELS[fii_score]
        sect_pct = sector_percentiles.get(ticker, 50)

        # Build score drivers from dimension scores with descriptions
        # First try existing score_drivers (written by _store_signal with rich descriptions)
        existing_drivers = item.get("score_drivers", "[]")
        if isinstance(existing_drivers, str):
            try:
                existing_drivers = json.loads(existing_drivers)
            except (json.JSONDecodeError, TypeError):
                existing_drivers = []

        # If existing drivers have descriptions, keep them
        if existing_drivers and isinstance(existing_drivers, list) and len(existing_drivers) > 0:
            has_desc = any(d.get("description") for d in existing_drivers if isinstance(d, dict))
            if has_desc:
                score_drivers = existing_drivers
            else:
                score_drivers = []
        else:
            score_drivers = []

        # If no rich drivers, compute from dimension scores
        if not score_drivers:
            dim_scores = parsed_dim_scores.get(ticker, {})
            if dim_scores:
                dims = []
                for dim_name, dim_val in dim_scores.items():
                    try:
                        val = float(dim_val)
                    except (ValueError, TypeError):
                        val = 0.0
                    dims.append((dim_name, val))
                # Sort by absolute deviation from neutral (0.0 on -2..+2 scale)
                dims.sort(key=lambda x: abs(x[1]), reverse=True)
                for dim_name, val in dims[:3]:
                    direction = "positive" if val >= 0 else "negative"
                    templates = _NORM_TEMPLATES.get(dim_name, {})
                    if val > 0.5:
                        desc = templates.get("pos", "Trending positively")
                    elif val < -0.5:
                        desc = templates.get("neg", "Showing headwinds")
                    else:
                        desc = templates.get("mid", "Mixed signals")
                    score_drivers.append({
                        "factor": dim_name,
                        "direction": direction,
                        "description": desc,
                        "score": round(val, 2),
                    })

        # Get factor percentiles for this stock
        fp = factor_percentiles_map.get(ticker, {})

        # Track distribution
        distribution[fii_score] = distribution.get(fii_score, 0) + 1

        # Update DynamoDB
        update_fields = {
            "signal": score_label,
            "score_label": score_label,
            "fii_score": str(fii_score),
            "percentile_rank": percentile_rank,
            "sector_percentile": sect_pct,
            "score_drivers": json.dumps(score_drivers),
            "factor_percentiles": json.dumps(fp),
        }

        db.update_item(f"SIGNAL#{ticker}", "LATEST", update_fields)
        updated += 1

        # Also update S3 detail file
        try:
            s3_data = s3.read_json(f"signals/{ticker}.json")
            if s3_data:
                s3_data["signal"] = score_label
                s3_data["score_label"] = score_label
                s3_data["fii_score"] = fii_score
                s3_data["percentile_rank"] = percentile_rank
                s3_data["sector_percentile"] = sect_pct
                s3_data["score_drivers"] = score_drivers
                s3_data["factor_percentiles"] = fp
                s3.write_json(f"signals/{ticker}.json", s3_data)
        except Exception:
            pass

    dist_str = " | ".join(f"Score {k}: {v}" for k, v in sorted(distribution.items(), reverse=True))
    logger.info(f"[SignalEngine] Forced distribution applied to {updated} stocks: {dist_str}")


def _score_drivers_from_top_factors(top_factors: list) -> list:
    """Build score_drivers from topFactors when dimension-based approach fails.

    Maps factor names (e.g. "Trade Barriers") to their parent dimension
    (e.g. "geopolitical"), deduplicates by dimension, and returns the
    top 3 by absolute score magnitude.
    """
    if not top_factors:
        return []

    # Build reverse map: factor display name → dimension name
    _name_to_dim = {}
    for dim_name, factor_ids in DIMENSION_FACTOR_MAP.items():
        for fid in factor_ids:
            fname = FACTOR_NAMES.get(fid)
            if fname:
                _name_to_dim[fname] = dim_name

    # Sort by absolute score descending
    sorted_factors = sorted(
        top_factors,
        key=lambda f: abs(f.get("score", 0)),
        reverse=True,
    )

    seen_dims = set()
    drivers = []
    for f in sorted_factors:
        name = f.get("name", "")
        score = f.get("score", 0)
        dim = _name_to_dim.get(name)
        if not dim or dim in seen_dims:
            continue
        seen_dims.add(dim)

        direction = "positive" if score >= 0 else "negative"
        sign = "+" if score > 0 else ""
        description = f"{name} impact: {sign}{score}"

        drivers.append({
            "factor": dim,
            "direction": direction,
            "description": description,
            "score": score,
        })

        if len(drivers) >= 3:
            break

    return drivers


def _compute_score_drivers(result: dict) -> list:
    """Compute top-3 score drivers from dimension scores and sub-factor data.

    Uses actual sub-factor names/values to build specific, data-driven
    descriptions. Falls back to topFactors data when dimension scores
    are unavailable (e.g. single-stock runs with missing dimensionScores).
    """
    factor_details = result.get("factorDetails", {})
    if not factor_details:
        # No factor details at all — fall back to topFactors
        return _score_drivers_from_top_factors(result.get("topFactors", []))

    factor_scores = {fid: d["score"] for fid, d in factor_details.items()}
    dim_scores = compute_dimension_scores(factor_scores)

    # Template descriptions keyed by dimension name
    _TEMPLATES = {
        "supply_chain_upstream": {
            "high": "Supplier health is strong — key suppliers reporting stable operations",
            "low": "Supply chain risk detected — supplier disruptions or financial stress",
            "mid": "Supply chain conditions are mixed — monitoring supplier stability",
        },
        "supply_chain_downstream": {
            "high": "Customer demand is healthy — major customers showing strength",
            "low": "Customer risk elevated — key customers showing weakness",
            "mid": "Customer conditions are balanced — demand signals are mixed",
        },
        "geopolitical": {
            "high": "Low geopolitical exposure — minimal trade barrier or conflict risk",
            "low": "Elevated geopolitical risk — trade restrictions or regional instability",
            "mid": "Moderate geopolitical exposure — some trade or regulatory sensitivity",
        },
        "monetary": {
            "high": "Favorable rate environment — monetary conditions support valuation",
            "low": "Rate headwinds — tightening conditions pressuring valuation",
            "mid": "Neutral monetary impact — current rate environment is balanced",
        },
        "correlations": {
            "high": "Strong sector positioning — outperforming correlated peers",
            "low": "Weak relative performance — lagging sector and correlated assets",
            "mid": "In-line with sector — moving with broader market trends",
        },
        "risk_performance": {
            "high": "Strong fundamentals — earnings beat and positive guidance",
            "low": "Performance concerns — earnings miss or negative guidance",
            "mid": "Mixed performance signals — earnings and guidance are neutral",
        },
    }

    # Map dimension names to their sub-factor IDs
    _DIM_SUBFACTORS = {
        "supply_chain_upstream": ["A1", "A2", "A3"],
        "supply_chain_downstream": ["B1", "B2", "B3"],
        "geopolitical": ["C1", "C2", "C3"],
        "monetary": ["D1", "D2", "D3"],
        "correlations": ["E1", "E2", "E3"],
        "risk_performance": ["F1", "F2", "F3"],
    }

    # Neutral point is 0.0 on the -2 to +2 scale
    sorted_dims = sorted(dim_scores.items(), key=lambda x: abs(x[1]), reverse=True)

    drivers = []
    for dim_name, dim_val in sorted_dims[:3]:
        direction = "positive" if dim_val >= 0 else "negative"

        # Try to build a specific description from sub-factor data
        sub_ids = _DIM_SUBFACTORS.get(dim_name, [])
        sub_parts = []
        for sid in sub_ids:
            if sid in factor_details:
                sf = factor_details[sid]
                sf_score = sf.get("score", 0)
                sf_name = FACTOR_NAMES.get(sid, sid)
                if abs(sf_score) >= 0.3:
                    sign = "+" if sf_score > 0 else ""
                    sub_parts.append(f"{sf_name} {sign}{sf_score:.1f}")

        if sub_parts:
            description = "; ".join(sub_parts[:2])
        else:
            # Fall back to template
            # Dimension score is -2 to +2; map to high/low/mid
            # Use 0.5 thresholds (on -2..+2 scale)
            templates = _TEMPLATES.get(dim_name, {})
            if dim_val > 0.5:
                description = templates.get("high", "Trending positively")
            elif dim_val < -0.5:
                description = templates.get("low", "Showing headwinds")
            else:
                description = templates.get("mid", "Mixed signals")

        drivers.append({
            "factor": dim_name,
            "direction": direction,
            "description": description,
            "score": round(dim_val, 2),
        })

    # If dimension-based approach yielded nothing, fall back to topFactors
    if not drivers:
        drivers = _score_drivers_from_top_factors(result.get("topFactors", []))

    return drivers


def _store_signal(ticker: str, result: dict) -> None:
    """Store signal results in DynamoDB (summary) + S3 (full detail).

    DynamoDB items:
    - SIGNAL#<ticker> | LATEST: Summary with composite score, signal, etc.
    - SIGNAL#<ticker> | FACTORS: All 18 factor scores with reasons.

    S3:
    - signals/<ticker>.json: Full signal with all data.
    """
    pk = f"SIGNAL#{ticker}"
    now = result["analyzedAt"]

    # Compute score_label from composite (pre-normalization, will be updated in _normalize_signals)
    raw_score = result["compositeScore"]
    label = score_to_label(round(raw_score))

    # Compute initial score_drivers from factor_details
    score_drivers = _compute_score_drivers(result)
    dim_scores = {}
    if result.get("factorDetails"):
        dim_scores = compute_dimension_scores(
            {fid: d["score"] for fid, d in result["factorDetails"].items()}
        )

    # Get previous score for stability buffer
    prev_item = db.get_item(pk, "LATEST")
    previous_score = prev_item.get("previous_score", "") if prev_item else ""

    # Default factor_percentiles (50th for all dimensions).
    # Real percentiles are computed in _normalize_signals during batch runs.
    default_fp = {dk: 50 for dk in [
        "supply_chain_upstream", "supply_chain_downstream",
        "geopolitical", "monetary", "correlations", "risk_performance",
    ]}

    # DynamoDB: LATEST summary
    db.put_item({
        "PK": pk,
        "SK": "LATEST",
        "GSI1PK": "SIGNALS",
        "GSI1SK": f"{result['compositeScore']}#{ticker}",
        "ticker": ticker,
        "companyName": result["companyName"],
        "compositeScore": str(result["compositeScore"]),
        "signal": label,  # backward compat: signal field = score_label
        "score_label": label,
        "confidence": result["confidence"],
        "insight": result["insight"],
        "reasoning": result.get("reasoning", ""),
        "topFactors": json.dumps(result.get("topFactors", [])),
        "score_drivers": json.dumps(score_drivers),
        "dimensionScores": json.dumps(dim_scores),
        "factor_percentiles": json.dumps(default_fp),
        "technicalScore": str(result.get("technicalAnalysis", {}).get("technicalScore", 0)),
        "tier": result.get("tier", "TIER_1"),
        "isETF": result.get("isETF", False),
        "previous_score": previous_score,
        "lastUpdated": now,
    })

    # DynamoDB: FACTORS detail
    db.put_item({
        "PK": pk,
        "SK": "FACTORS",
        "ticker": ticker,
        "factorDetails": json.dumps(result["factorDetails"]),
        "lastUpdated": now,
    })

    # Add new fields to S3 result
    result["signal"] = label
    result["score_label"] = label
    result["score_drivers"] = score_drivers
    result["dimensionScores"] = dim_scores
    result["factor_percentiles"] = default_fp

    # S3: Full signal JSON
    s3.write_json(f"signals/{ticker}.json", result)

    logger.info(f"[{ticker}] Stored signal in DynamoDB + S3")


def _safe_float(val, default=0.0):
    """Safely convert to float."""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _run_daily_light_refresh(event):
    """Daily light refresh — detect material changes, recompute scores, NO Claude.

    Runs at 6AM ET weekdays. Free (no Claude API calls).
    Steps:
      1. Detect material changes across all stocks
      2. Re-score changed stocks from cached data (no new API calls)
      3. Apply stability buffer (skip if delta < 0.5)
      4. Normalize signal distribution
    """
    import change_detector

    now = datetime.now(timezone.utc)
    all_tickers = list(ALL_SECURITIES)

    # 1. Detect material changes
    logger.info("[DailyLight] Scanning for material changes...")
    change_result = change_detector.detect_all_changes(db, all_tickers)
    flagged = change_result.get("flagged_tickers", [])
    logger.info(
        f"[DailyLight] {change_result['flagged_count']} stocks flagged "
        f"out of {change_result['scanned']}"
    )

    # 2. Light-refresh scores for flagged stocks
    updated = 0
    skipped = 0
    errors = 0
    for ticker in flagged:
        try:
            did_update = _light_refresh_signal(ticker)
            if did_update:
                updated += 1
            else:
                skipped += 1
        except Exception as e:
            errors += 1
            logger.warning(f"[DailyLight] Error refreshing {ticker}: {e}")

    # 3. Normalize if we updated anything
    if updated > 0:
        logger.info(f"[DailyLight] Normalizing signals after {updated} updates...")
        _normalize_signals()

    # 3b. Run data quality validation after scoring
    try:
        import data_quality
        data_quality.run_post_scoring_validation(db, run_type="post_daily")
        logger.info("[DailyLight] Data quality validation complete")
    except Exception as e:
        logger.warning(f"[DailyLight] Data quality validation failed: {e}")

    # 4. Record the run
    db.put_item({
        "PK": "AGENT_RUN#daily_light",
        "SK": now.isoformat(),
        "run_type": "daily_light",
        "scanned": len(all_tickers),
        "flagged": len(flagged),
        "updated": updated,
        "skipped_stable": skipped,
        "errors": errors,
        "flagged_tickers": flagged[:50],
        "change_summary": change_result.get("by_priority", {}),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(
        f"[DailyLight] Complete: {updated} updated, {skipped} stable (delta<0.5), "
        f"{errors} errors"
    )

    return {
        "statusCode": 200,
        "body": json.dumps({
            "run_type": "daily_light",
            "scanned": len(all_tickers),
            "flagged": len(flagged),
            "updated": updated,
            "skipped_stable": skipped,
            "errors": errors,
            "timestamp": now.isoformat(),
        }),
    }


def _light_refresh_signal(ticker):
    """Re-compute compositeScore from cached DynamoDB data (no API calls).

    Uses the 6-component formula:
      Momentum (25%) + Technical (20%) + Fundamental (20%) +
      Stability (10%) + Sector Momentum (15%) + Volatility (10%)

    Applies stability buffer: skip update if abs(new - old) < 0.5.

    Returns True if score was updated, False if skipped (stable).
    """
    STABILITY_BUFFER = 0.5

    # Fetch cached data
    price_data = db.get_item(f"PRICE#{ticker}", "LATEST") or {}
    tech_data = db.get_item(f"TECHNICALS#{ticker}", "LATEST") or {}
    health_data = db.get_item(f"HEALTH#{ticker}", "LATEST") or {}
    signal_data = db.get_item(f"SIGNAL#{ticker}", "LATEST") or {}

    old_score = _safe_float(signal_data.get("compositeScore"))

    # Parse indicators from tech_data
    indicators = tech_data.get("indicators") or {}
    if isinstance(indicators, str):
        try:
            indicators = json.loads(indicators)
        except Exception:
            indicators = {}

    signals = indicators.get("signals") or {}
    if isinstance(signals, str):
        try:
            signals = json.loads(signals)
        except Exception:
            signals = {}

    # ── Component 1: Momentum (25%) ──
    change_pct = _safe_float(price_data.get("changePercent"))
    momentum_score = 5.0 + (change_pct * 0.5)
    momentum_score = max(1.0, min(10.0, momentum_score))

    # ── Component 2: Technical (20%) ──
    rsi = _safe_float(indicators.get("rsi"), default=50.0)
    macd_data = indicators.get("macd") or {}
    if isinstance(macd_data, str):
        try:
            macd_data = json.loads(macd_data)
        except Exception:
            macd_data = {}

    # RSI component: 30-70 is neutral, extremes are signals
    if rsi >= 70:
        rsi_score = max(1.0, 10.0 - (rsi - 70) * 0.3)
    elif rsi <= 30:
        rsi_score = min(10.0, 1.0 + (30 - rsi) * 0.3)
    else:
        rsi_score = 5.0 + (50 - rsi) * 0.05

    macd_signal = signals.get("macd", "")
    macd_score = 5.0
    if macd_signal == "bullish_crossover":
        macd_score = 7.5
    elif macd_signal == "bearish_crossover":
        macd_score = 2.5

    tech_score = (rsi_score * 0.5 + macd_score * 0.5)

    # ── Component 3: Fundamental (20%) ──
    pe_ratio = _safe_float(health_data.get("peRatio"), default=20.0)
    if pe_ratio <= 0:
        fund_score = 5.0
    elif pe_ratio < 15:
        fund_score = 8.0
    elif pe_ratio < 25:
        fund_score = 6.0
    elif pe_ratio < 40:
        fund_score = 4.0
    else:
        fund_score = 2.0

    # ── Component 4: Stability (10%) ──
    beta = _safe_float(health_data.get("beta"), default=1.0)
    stability_score = max(1.0, min(10.0, 8.0 - abs(beta - 1.0) * 3.0))

    # ── Component 5: Sector Momentum (15%) ──
    sector = health_data.get("sector", "")
    sector_perf = _safe_float(price_data.get("sectorPerformance"))
    sector_score = 5.0 + (sector_perf * 0.5)
    sector_score = max(1.0, min(10.0, sector_score))

    # ── Component 6: Volatility (10%) ──
    atr_pct = _safe_float(indicators.get("atrPercent"), default=2.0)
    vol_score = max(1.0, min(10.0, 8.0 - atr_pct * 1.5))

    # ── Weighted composite ──
    new_score = (
        momentum_score * 0.25
        + tech_score * 0.20
        + fund_score * 0.20
        + stability_score * 0.10
        + sector_score * 0.15
        + vol_score * 0.10
    )
    new_score = round(max(1.0, min(10.0, new_score)), 2)

    # Stability buffer: skip if change is negligible
    if abs(new_score - old_score) < STABILITY_BUFFER:
        logger.debug(
            f"[DailyLight] {ticker}: delta={abs(new_score - old_score):.2f} "
            f"< {STABILITY_BUFFER}, skipping"
        )
        return False

    # Update the signal record
    now = datetime.now(timezone.utc).isoformat()
    label = score_to_label(new_score)

    db.update_item(
        f"SIGNAL#{ticker}", "LATEST",
        updates={
            "compositeScore": str(new_score),
            "score_label": label,
            "signal": label,
            "lastUpdated": now,
            "lastRefreshType": "daily_light",
        },
    )

    logger.info(
        f"[DailyLight] {ticker}: {old_score} -> {new_score} "
        f"(delta={abs(new_score - old_score):.2f}, label={label})"
    )
    return True


def _run_weekly_deep_analysis(event, context):
    """Weekly deep analysis — full Claude-powered scoring for all stocks.

    Runs Saturday 6AM ET. Budget ~$15-25.
    Steps:
      1. Process any urgent queue items with Sonnet first
      2. Score ALL stocks with Haiku via batch_scorer
      3. Normalize signal distribution
      4. Refresh stress tests for TIER_1 stocks
    """
    import change_detector

    now = datetime.now(timezone.utc)

    # 1. Process urgent queue first (Sonnet for urgent items)
    logger.info("[WeeklyDeep] Processing urgent queue...")
    queue_items = change_detector.get_scoring_queue(db, limit=50)
    urgent_items = [
        item for item in queue_items if item.get("priority") == "urgent"
    ]
    urgent_scored = 0
    for item in urgent_items:
        ticker = item.get("ticker")
        if ticker:
            try:
                batch_scorer.score_batch([ticker], run_type="urgent")
                change_detector.remove_from_queue(db, item.get("SK", ""))
                urgent_scored += 1
            except Exception as e:
                logger.warning(f"[WeeklyDeep] Urgent scoring failed for {ticker}: {e}")

    logger.info(f"[WeeklyDeep] Urgent queue: {urgent_scored} scored")

    # 2. Full batch scoring with Haiku for all stocks
    logger.info("[WeeklyDeep] Starting full batch scoring...")
    all_stock_tickers = [t for t in ALL_SECURITIES if t not in ETF_SET]
    batch_summary = batch_scorer.score_batch(all_stock_tickers, run_type="weekly")
    logger.info(
        f"[WeeklyDeep] Batch complete: {batch_summary.get('scored', 0)} scored, "
        f"~${batch_summary.get('cost_estimate', 0):.4f}"
    )

    # 3. Normalize signals
    logger.info("[WeeklyDeep] Normalizing signals...")
    _normalize_signals()

    # 4. Refresh stress tests for TIER_1
    stress_refreshed = 0
    try:
        import stress_engine

        for ticker in list(TIER_1_SET)[:50]:
            try:
                price_data = db.get_item(f"PRICE#{ticker}", "LATEST") or {}
                health_data = db.get_item(f"HEALTH#{ticker}", "LATEST") or {}
                tech_data = db.get_item(f"TECHNICALS#{ticker}", "LATEST") or {}
                report = stress_engine.build_full_stress_report(
                    ticker, price_data, health_data, tech_data
                )
                stress_engine.store_stress_report(db, ticker, report)
                stress_refreshed += 1
            except Exception as e:
                logger.debug(f"[WeeklyDeep] Stress refresh failed for {ticker}: {e}")
    except ImportError:
        logger.warning("[WeeklyDeep] stress_engine not available, skipping stress refresh")

    # 5. Run data quality validation
    quality_report = None
    try:
        import data_quality
        quality_report = data_quality.run_post_scoring_validation(db, run_type="post_weekly")
        logger.info(
            f"[WeeklyDeep] Quality: completeness={quality_report.get('completeness_pct', '?')}%, "
            f"quality={quality_report.get('quality_score', '?')}%, "
            f"alerts={len(quality_report.get('alerts', []))}"
        )
    except Exception as e:
        logger.warning(f"[WeeklyDeep] Data quality validation failed: {e}")

    # 6. Clear remaining queue
    for item in queue_items:
        try:
            change_detector.remove_from_queue(db, item.get("SK", ""))
        except Exception:
            pass

    # 7. Record the run
    completed_at = datetime.now(timezone.utc).isoformat()
    cost = batch_summary.get("cost_estimate", 0)
    db.put_item({
        "PK": "AGENT_RUN#weekly_deep",
        "SK": now.isoformat(),
        "run_type": "weekly_deep",
        "stocks_scored": batch_summary.get("scored", 0),
        "urgent_scored": urgent_scored,
        "stress_refreshed": stress_refreshed,
        "errors": batch_summary.get("errors", 0),
        "cost_estimate": str(round(cost, 4)),
        "started_at": now.isoformat(),
        "completed_at": completed_at,
    })

    logger.info(
        f"[WeeklyDeep] Complete: {batch_summary.get('scored', 0)} stocks, "
        f"{urgent_scored} urgent, {stress_refreshed} stress refreshed, "
        f"~${cost:.4f}"
    )

    return {
        "statusCode": 200,
        "body": json.dumps({
            "run_type": "weekly_deep",
            "stocks_scored": batch_summary.get("scored", 0),
            "urgent_scored": urgent_scored,
            "stress_refreshed": stress_refreshed,
            "cost_estimate": round(cost, 4),
            "quality_alerts": len(quality_report.get("alerts", [])) if quality_report else None,
            "timestamp": now.isoformat(),
        }),
    }


def _run_queue_processor(event):
    """Process the scoring queue — runs hourly during market hours.

    Scores urgent items with Sonnet, others with Haiku.
    Max 20 items per run to stay within Lambda timeout.
    """
    import change_detector

    now = datetime.now(timezone.utc)

    # Check market hours (9:30 AM - 4:00 PM ET, Mon-Fri)
    et_hour = (now.hour - 5) % 24  # rough UTC->ET
    is_weekday = now.weekday() < 5
    is_market_hours = is_weekday and 9 <= et_hour <= 16

    if not is_market_hours:
        logger.info("[QueueProcessor] Outside market hours, skipping")
        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Outside market hours", "processed": 0}),
        }

    # Read queue (max 20 per run)
    queue_items = change_detector.get_scoring_queue(db, limit=20)
    if not queue_items:
        logger.info("[QueueProcessor] Queue empty, nothing to process")
        return {
            "statusCode": 200,
            "body": json.dumps({"message": "Queue empty", "processed": 0}),
        }

    logger.info(f"[QueueProcessor] Processing {len(queue_items)} items...")

    processed = 0
    errors = 0
    for item in queue_items:
        ticker = item.get("ticker")
        priority = item.get("priority", "normal")
        if not ticker:
            continue

        try:
            run_type = "urgent" if priority == "urgent" else "daily"
            batch_scorer.score_batch([ticker], run_type=run_type)
            change_detector.remove_from_queue(db, item.get("SK", ""))
            processed += 1
            logger.info(f"[QueueProcessor] Scored {ticker} (priority={priority})")
        except Exception as e:
            errors += 1
            logger.warning(f"[QueueProcessor] Failed to score {ticker}: {e}")

    # Normalize if we processed anything
    if processed > 0:
        _normalize_signals()

    # Record the run
    db.put_item({
        "PK": "AGENT_RUN#queue_processor",
        "SK": now.isoformat(),
        "run_type": "queue_processor",
        "queue_depth": len(queue_items),
        "processed": processed,
        "errors": errors,
        "completed_at": datetime.now(timezone.utc).isoformat(),
    })

    logger.info(f"[QueueProcessor] Complete: {processed} processed, {errors} errors")

    return {
        "statusCode": 200,
        "body": json.dumps({
            "run_type": "process_queue",
            "processed": processed,
            "errors": errors,
            "queue_depth": len(queue_items),
            "timestamp": now.isoformat(),
        }),
    }


def _run_batch_slice(event: dict) -> dict:
    """Score a slice of the stock universe for parallel Lambda invocation.

    Designed for initial full scoring: invoke 6 parallel Lambdas each
    scoring ~90 stocks to complete all 547 in one 15-minute window.

    Event payload:
        batch_start: int — starting index in ALL_NON_ETF
        batch_size: int — number of tickers to process (default 100)

    Uses ThreadPoolExecutor for parallel Finnhub/EDGAR fetches.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    start = int(event["batch_start"])
    size = int(event.get("batch_size", 100))
    tickers = ALL_NON_ETF[start:start + size]

    if not tickers:
        return {
            "statusCode": 200,
            "body": json.dumps({
                "run_type": "batch_slice",
                "batch_start": start,
                "batch_size": size,
                "scored": 0,
                "message": "No tickers in range",
            }),
        }

    total = len(tickers)
    t0 = time.time()
    scored = 0
    errors = 0
    error_details = []

    logger.info(
        f"[BatchSlice] Starting batch: start={start}, size={size}, "
        f"tickers={total} ({tickers[0]}..{tickers[-1]})"
    )

    def _score_one(ticker):
        """Score a single ticker with error handling."""
        tier = get_tier(ticker)
        return analyze_ticker(ticker, tier=tier)

    # Process in sub-batches of 50 with ThreadPoolExecutor
    BATCH_SIZE = 50
    MAX_WORKERS = 10

    for batch_idx in range(0, total, BATCH_SIZE):
        batch = tickers[batch_idx:batch_idx + BATCH_SIZE]
        batch_start_time = time.time()

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {executor.submit(_score_one, t): t for t in batch}
            for future in as_completed(futures):
                ticker = futures[future]
                try:
                    result = future.result()
                    scored += 1
                except Exception as e:
                    errors += 1
                    error_details.append({"ticker": ticker, "error": str(e)})
                    logger.warning(f"[BatchSlice] Error scoring {ticker}: {e}")

        elapsed = time.time() - t0
        done = batch_idx + len(batch)
        pct = int(100 * done / total)
        logger.info(
            f"[BatchSlice] Scored {done}/{total} ({pct}%), "
            f"elapsed: {elapsed:.0f}s"
        )

    # Normalize after batch completes
    _normalize_signals()

    elapsed_total = time.time() - t0
    logger.info(
        f"[BatchSlice] Complete: {scored} scored, {errors} errors, "
        f"{elapsed_total:.0f}s elapsed"
    )

    return {
        "statusCode": 200,
        "body": json.dumps({
            "run_type": "batch_slice",
            "batch_start": start,
            "batch_size": size,
            "scored": scored,
            "errors": errors,
            "error_details": error_details[:20],
            "elapsed_seconds": round(elapsed_total, 1),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }),
    }


def _run_batch_scoring(event: dict, tickers: list) -> None:
    """Run enhanced Claude batch scoring with sourced rationales.

    For weekly runs (Saturday 6AM): scores ALL tickers with Haiku,
    re-scores flagged stocks (>2pt change) with Sonnet.

    For daily runs: only scores stocks with material changes.

    Args:
        event: Lambda event payload.
        tickers: List of tickers being processed.
    """
    try:
        if batch_scorer.is_weekly_run(event):
            logger.info("[SignalEngine] Saturday weekly run — full batch scoring")
            # Get all stock tickers (exclude ETFs for cost savings)
            all_tickers = [t for t in ALL_SECURITIES if t not in ETF_SET]
            summary = batch_scorer.score_batch(all_tickers, run_type="weekly")
            logger.info(
                f"[SignalEngine] Weekly batch complete: "
                f"{summary.get('scored', 0)} scored, "
                f"{summary.get('errors', 0)} errors, "
                f"~${summary.get('cost_estimate', 0):.4f}"
            )
        else:
            logger.info("[SignalEngine] Daily run — delta batch scoring")
            # Only score tickers that were just analyzed or have changes
            changed_tickers = [t for t in tickers if t in TIER_1_SET]
            if changed_tickers:
                summary = batch_scorer.score_batch(changed_tickers, run_type="daily")
                logger.info(
                    f"[SignalEngine] Daily batch complete: "
                    f"{summary.get('scored', 0)} scored, "
                    f"{summary.get('errors', 0)} errors"
                )
    except Exception as e:
        logger.error(f"[SignalEngine] Batch scoring failed: {e}", exc_info=True)

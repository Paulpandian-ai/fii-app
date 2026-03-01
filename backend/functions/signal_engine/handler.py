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
from models import (
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
    compute_z_scores,
    determine_confidence,
    determine_signal,
    get_tier,
    percentile_to_fii_score,
    score_to_label,
    should_update_score,
    z_to_percentile,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    """Run the 6-factor signal analysis.

    Handles three trigger modes:
    1. Scheduled (EventBridge cron): Fan out — invoke self async per stock
    2. Single ticker ({"ticker": "NVDA"}): Analyze one stock
    3. Multiple tickers ({"tickers": [...]}): Fan out — invoke self async per stock
    """
    try:
        logger.info(f"[SignalEngine] Starting at {datetime.now(timezone.utc).isoformat()}")

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
    """Normalize signals across all stocks using forced distribution.

    Reads all SIGNAL#LATEST records, computes z-scores and percentile
    ranks per dimension and composite, then assigns FII Scores 1-10
    using forced distribution and educational score labels.
    """
    import math

    all_items = []  # (ticker, item, raw_composite, dimension_raw_scores)

    for ticker in ALL_SECURITIES:
        try:
            item = db.get_item(f"SIGNAL#{ticker}", "LATEST")
            if item:
                raw_composite = float(item.get("compositeScore", 0))
                # Try to get per-factor scores from FACTORS record
                factors_item = db.get_item(f"SIGNAL#{ticker}", "FACTORS")
                factor_details = {}
                if factors_item:
                    fd_raw = factors_item.get("factorDetails", "{}")
                    factor_details = json.loads(fd_raw) if isinstance(fd_raw, str) else fd_raw

                # Compute per-dimension raw scores
                dim_scores = {}
                for dim_name, factor_ids in DIMENSION_FACTOR_MAP.items():
                    scores = [
                        float(factor_details.get(fid, {}).get("score", 0))
                        for fid in factor_ids
                    ]
                    dim_scores[dim_name] = sum(scores) / len(scores) if scores else 0.0

                all_items.append((ticker, item, raw_composite, dim_scores))
        except Exception:
            pass

    if len(all_items) < 3:
        logger.info("[SignalEngine] Not enough signals to normalize")
        return

    # ── Step 1: Compute z-scores per dimension across all stocks ──
    dim_names = list(DIMENSION_WEIGHTS.keys())
    dim_raw_values = {dim: [] for dim in dim_names}
    for _ticker, _item, _composite, dim_scores in all_items:
        for dim in dim_names:
            dim_raw_values[dim].append(dim_scores.get(dim, 0.0))

    # z-scores per dimension
    dim_z_scores = {}
    for dim in dim_names:
        dim_z_scores[dim] = compute_z_scores(dim_raw_values[dim])

    # ── Step 2: Convert to percentile ranks per dimension ──
    dim_percentiles = {dim: [] for dim in dim_names}
    for dim in dim_names:
        dim_percentiles[dim] = [z_to_percentile(z) for z in dim_z_scores[dim]]

    # ── Step 3: Compute weighted composite percentile ──
    composite_percentiles = []
    for i in range(len(all_items)):
        weighted = 0.0
        for dim in dim_names:
            weighted += dim_percentiles[dim][i] * DIMENSION_WEIGHTS[dim]
        composite_percentiles.append(weighted)

    # ── Step 4: Compute sector-level percentile ranks ──
    # Group by sector
    sector_groups = {}  # sector -> list of (index, composite_percentile)
    for i, (ticker, _item, _comp, _dims) in enumerate(all_items):
        sector = STOCK_SECTORS.get(ticker, "Unknown")
        if sector not in sector_groups:
            sector_groups[sector] = []
        sector_groups[sector].append((i, composite_percentiles[i]))

    sector_percentiles = [0.0] * len(all_items)
    for sector, entries in sector_groups.items():
        if len(entries) < 2:
            for idx, _ in entries:
                sector_percentiles[idx] = 50.0
            continue
        # Rank within sector
        sorted_entries = sorted(entries, key=lambda x: x[1])
        for rank, (idx, _) in enumerate(sorted_entries):
            sector_percentiles[idx] = (rank / (len(sorted_entries) - 1)) * 100.0

    # ── Step 5: Apply forced distribution to assign FII Scores ──
    updated = 0
    score_distribution = {}

    for i, (ticker, item, raw_composite, dim_scores) in enumerate(all_items):
        pct = composite_percentiles[i]
        fii_score = percentile_to_fii_score(pct)
        score_label = score_to_label(fii_score)

        # Stability buffer — check previous score
        old_score = item.get("previous_score")
        old_pct = item.get("percentile_rank")
        if old_score is not None:
            try:
                old_score = int(old_score)
                old_pct = float(old_pct) if old_pct is not None else None
                if not should_update_score(pct, old_score, old_pct):
                    fii_score = old_score
                    score_label = score_to_label(fii_score)
            except (ValueError, TypeError):
                pass

        # Build factor_percentiles
        factor_pcts = {}
        for dim in dim_names:
            factor_pcts[dim] = round(dim_percentiles[dim][i], 1)

        # Identify top 3 score drivers
        score_drivers = _compute_score_drivers(dim_scores, dim_percentiles, dim_names, i)

        # Determine confidence
        confidence_val = item.get("confidence", "MEDIUM")

        # Update DynamoDB with all new fields
        update_fields = {
            "compositeScore": str(fii_score),
            "signal": score_label,  # backward compat: "signal" field = score_label
            "score_label": score_label,
            "percentile_rank": int(round(pct)),
            "sector_percentile": int(round(sector_percentiles[i])),
            "factor_percentiles": json.dumps(factor_pcts),
            "score_drivers": json.dumps(score_drivers),
            "confidence": confidence_val,
            "previous_score": str(fii_score),
        }

        try:
            db.update_item(f"SIGNAL#{ticker}", "LATEST", update_fields)
        except Exception as e:
            logger.warning(f"[SignalEngine] Failed to update {ticker}: {e}")
            continue

        # Also update the S3 detail file
        try:
            s3_data = s3.read_json(f"signals/{ticker}.json")
            if s3_data:
                s3_data["compositeScore"] = fii_score
                s3_data["signal"] = score_label
                s3_data["score_label"] = score_label
                s3_data["percentile_rank"] = int(round(pct))
                s3_data["sector_percentile"] = int(round(sector_percentiles[i]))
                s3_data["factor_percentiles"] = factor_pcts
                s3_data["score_drivers"] = score_drivers
                s3.write_json(f"signals/{ticker}.json", s3_data)
        except Exception as e:
            logger.warning(f"[SignalEngine] Failed to update S3 for {ticker}: {e}")

        updated += 1
        score_distribution[fii_score] = score_distribution.get(fii_score, 0) + 1

    # Log distribution
    dist_str = ", ".join(f"Score {s}: {c}" for s, c in sorted(score_distribution.items(), reverse=True))
    logger.info(f"[SignalEngine] Forced distribution complete: {updated} stocks updated. {dist_str}")


def _compute_score_drivers(
    dim_scores: dict,
    dim_percentiles: dict,
    dim_names: list,
    stock_index: int,
) -> list[dict]:
    """Identify top 3 factors with highest absolute impact on composite score."""
    impacts = []
    for dim in dim_names:
        raw = dim_scores.get(dim, 0.0)
        pct = dim_percentiles[dim][stock_index]
        deviation = abs(pct - 50.0)  # deviation from median
        direction = "positive" if pct >= 50 else "negative"

        # Generate description from dimension name + direction
        dim_labels = {
            "supply_chain_upstream": "Upstream supply chain factors",
            "supply_chain_downstream": "Downstream customer demand factors",
            "geopolitical": "Geopolitical risk exposure",
            "monetary": "Monetary policy and interest rate sensitivity",
            "correlations": "Market correlation and sector dynamics",
            "risk_performance": "Risk-adjusted performance metrics",
        }
        label = dim_labels.get(dim, dim)
        if direction == "positive":
            desc = f"{label} trending favorably"
        else:
            desc = f"{label} showing headwinds"

        impacts.append({
            "factor": dim,
            "direction": direction,
            "description": desc,
            "deviation": deviation,
        })

    # Sort by absolute deviation, take top 3
    impacts.sort(key=lambda x: x["deviation"], reverse=True)
    return [
        {"factor": d["factor"], "direction": d["direction"], "description": d["description"]}
        for d in impacts[:3]
    ]


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
    score_drivers = []
    if result.get("factorDetails"):
        dim_scores = compute_dimension_scores(
            {fid: d["score"] for fid, d in result["factorDetails"].items()}
        )
        # Sort dimensions by absolute value
        sorted_dims = sorted(dim_scores.items(), key=lambda x: abs(x[1]), reverse=True)
        dim_labels = {
            "supply_chain_upstream": "Upstream supply chain factors",
            "supply_chain_downstream": "Downstream customer demand factors",
            "geopolitical": "Geopolitical risk exposure",
            "monetary": "Monetary policy and interest rate sensitivity",
            "correlations": "Market correlation and sector dynamics",
            "risk_performance": "Risk-adjusted performance metrics",
        }
        for dim_name, dim_val in sorted_dims[:3]:
            direction = "positive" if dim_val >= 0 else "negative"
            label_text = dim_labels.get(dim_name, dim_name)
            desc = f"{label_text} trending favorably" if direction == "positive" else f"{label_text} showing headwinds"
            score_drivers.append({
                "factor": dim_name,
                "direction": direction,
                "description": desc,
            })

    # Get previous score for stability buffer
    prev_item = db.get_item(pk, "LATEST")
    previous_score = prev_item.get("previous_score", "") if prev_item else ""

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

    # S3: Full signal JSON
    s3.write_json(f"signals/{ticker}.json", result)

    logger.info(f"[{ticker}] Stored signal in DynamoDB + S3")

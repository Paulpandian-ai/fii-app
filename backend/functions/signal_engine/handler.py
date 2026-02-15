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
import sec_edgar
from models import (
    COMPANY_NAMES,
    FACTOR_IDS,
    FACTOR_NAMES,
    PEER_MAP,
    STOCK_UNIVERSE,
    compute_composite_score,
    determine_confidence,
    determine_signal,
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

        # Single ticker — process it directly
        if len(tickers) == 1:
            ticker = tickers[0]
            logger.info(f"[SignalEngine] Analyzing {ticker}...")
            result = analyze_ticker(ticker)
            logger.info(
                f"[SignalEngine] {ticker}: score={result['compositeScore']}, "
                f"signal={result['signal']}"
            )
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "analyzed": 1,
                    "errors": 0,
                    "results": [
                        {"ticker": result["ticker"], "score": result["compositeScore"], "signal": result["signal"]}
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

    # Scheduled: analyze full universe
    return STOCK_UNIVERSE


def analyze_ticker(ticker: str) -> dict:
    """Run full 6-factor analysis pipeline for a single ticker.

    Steps:
    1. Fetch SEC filing data and extract supply chain entities
    2. Fetch FRED macro indicators
    3. Fetch Yahoo Finance market data
    4. Compute correlation matrix
    5. Send all data to Claude for 18-factor scoring
    6. Compute composite score
    7. Generate Claude reasoning (80-120 words)
    8. Generate alternatives (for SELL/weak HOLD)
    9. Store results in DynamoDB + S3

    Args:
        ticker: Stock ticker symbol.

    Returns:
        Complete signal result dict.
    """
    company_name = COMPANY_NAMES.get(ticker, ticker)
    peers = PEER_MAP.get(ticker, [])

    # ── Step 1: SEC Filing Extraction ──
    logger.info(f"[{ticker}] Step 1: SEC filing extraction")
    supply_chain = sec_edgar.extract_supply_chain(ticker)

    # ── Step 2: FRED Macro Data ──
    logger.info(f"[{ticker}] Step 2: FRED macro data")
    macro_data = market_data.get_fred_macro_data()

    # ── Step 3: Yahoo Finance Market Data ──
    logger.info(f"[{ticker}] Step 3: Yahoo Finance data")
    yf_data = market_data.get_yahoo_finance_data(ticker)

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

    # ── Step 5b: Compute Composite Score ──
    scores_only = {fid: d["score"] for fid, d in factor_details.items()}
    composite_score = compute_composite_score(scores_only)
    signal = determine_signal(composite_score)
    confidence = determine_confidence(scores_only)

    # Delay between Claude API calls to avoid 429 rate limiting
    time.sleep(2)

    # ── Step 6: Claude Reasoning ──
    logger.info(f"[{ticker}] Step 6: Generating reasoning")
    reasoning = claude_client.generate_reasoning(
        ticker=ticker,
        company_name=company_name,
        score=composite_score,
        signal=signal.value,
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
        signal=signal.value,
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
        "signal": signal.value,
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

    # DynamoDB: LATEST summary
    db.put_item({
        "PK": pk,
        "SK": "LATEST",
        "GSI1PK": "SIGNALS",
        "GSI1SK": f"{result['compositeScore']}#{ticker}",
        "ticker": ticker,
        "companyName": result["companyName"],
        "compositeScore": str(result["compositeScore"]),
        "signal": result["signal"],
        "confidence": result["confidence"],
        "insight": result["insight"],
        "reasoning": result["reasoning"],
        "topFactors": json.dumps(result["topFactors"]),
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

    # S3: Full signal JSON
    s3.write_json(f"signals/{ticker}.json", result)

    logger.info(f"[{ticker}] Stored signal in DynamoDB + S3")

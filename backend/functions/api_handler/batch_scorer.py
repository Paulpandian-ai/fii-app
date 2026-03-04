"""Claude Batch Scoring Pipeline for FII.

Orchestrates institutional-quality factor scoring using Claude API.
Uses Haiku for routine scoring (~$0.012/stock) and Sonnet for flagged
stocks needing deeper analysis (~$0.045/stock).

Functions:
  - score_single_stock(ticker, model="haiku") — Score one stock, write DynamoDB
  - score_batch(tickers, run_type="weekly")   — Batch score with concurrency
"""

import asyncio
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Model Configuration ───

MODELS = {
    "haiku": "claude-haiku-4-5-20251001",
    "sonnet": "claude-sonnet-4-5-20250929",
}

# Approximate costs per 1K tokens (input/output)
MODEL_COSTS = {
    "haiku": {"input_per_1k": 0.001, "output_per_1k": 0.005},
    "sonnet": {"input_per_1k": 0.003, "output_per_1k": 0.015},
}

# Concurrency limits
MAX_CONCURRENT_CALLS = 10
MAX_RETRIES = 3
RETRY_BASE_DELAY = 2  # seconds


# ═══════════════════════════════════════════════════════════════════════
# SCORE SINGLE STOCK
# ═══════════════════════════════════════════════════════════════════════

def score_single_stock(ticker: str, model: str = "haiku") -> dict:
    """Score a single stock using Claude API and write results to DynamoDB.

    Assembles all available data via format_stock_context(), calls Claude
    with the cached SYSTEM_PROMPT, parses JSON response, validates fields,
    and writes 6 FACTOR_DETAIL records + FACTOR_SUMMARY + SIGNAL update.

    Args:
        ticker: Stock ticker symbol (e.g., "NVDA").
        model: "haiku" for routine scoring, "sonnet" for flagged stocks.

    Returns:
        Dict with parsed scoring results, or error dict on failure.
    """
    ticker = ticker.upper()
    model_id = MODELS.get(model, MODELS["haiku"])
    start_time = time.time()

    logger.info(f"[BatchScorer] Scoring {ticker} with {model} ({model_id})")

    try:
        # ── Step 1: Gather all data for context ──
        context_data = _gather_stock_data(ticker)
        if context_data.get("error"):
            logger.warning(f"[BatchScorer] Data gathering incomplete for {ticker}: {context_data['error']}")

        # ── Step 2: Format context message ──
        from scoring_prompts import format_stock_context, SYSTEM_PROMPT
        user_message = format_stock_context(
            ticker=ticker,
            fundamentals=context_data.get("fundamentals", {}),
            supply_chain=context_data.get("supply_chain", []),
            macro_snapshot=context_data.get("macro_snapshot", {}),
            geopolitical_data=context_data.get("geopolitical_data", {}),
            technical_data=context_data.get("technical_data", {}),
            market_data=context_data.get("market_data", {}),
            prior_signal=context_data.get("prior_signal", {}),
            recent_news=context_data.get("recent_news", []),
        )

        # ── Step 3: Call Claude API with retry ──
        response = _call_claude_with_retry(
            system_prompt=SYSTEM_PROMPT,
            user_message=user_message,
            model_id=model_id,
            max_tokens=4096,
        )

        if response.get("error"):
            return {"ticker": ticker, "error": response["error"], "model": model}

        # ── Step 4: Parse and validate response ──
        parsed = _parse_scoring_response(response["text"])
        if parsed.get("error"):
            logger.error(f"[BatchScorer] Parse error for {ticker}: {parsed['error']}")
            return {"ticker": ticker, "error": parsed["error"], "model": model}

        # ── Step 5: Write to DynamoDB ──
        _write_factor_details(ticker, parsed)
        _write_factor_summary(ticker, parsed)
        _update_signal_record(ticker, parsed)

        # ── Step 6: Track cost ──
        elapsed = time.time() - start_time
        _track_cost(
            model=model,
            ticker=ticker,
            input_tokens=response.get("input_tokens", 0),
            output_tokens=response.get("output_tokens", 0),
        )

        logger.info(
            f"[BatchScorer] {ticker} scored: composite={parsed.get('composite_score', 'N/A')}, "
            f"model={model}, elapsed={elapsed:.1f}s"
        )

        return {
            "ticker": ticker,
            "composite_score": parsed.get("composite_score"),
            "dimensions": {
                d["dimension"]: d["score"]
                for d in parsed.get("dimensions", [])
            },
            "top_drivers": parsed.get("top_drivers", []),
            "risk_flags": parsed.get("risk_flags", []),
            "model": model,
            "input_tokens": response.get("input_tokens", 0),
            "output_tokens": response.get("output_tokens", 0),
            "elapsed_seconds": round(elapsed, 1),
        }

    except Exception as e:
        logger.error(f"[BatchScorer] Failed to score {ticker}: {e}", exc_info=True)
        return {"ticker": ticker, "error": str(e), "model": model}


# ═══════════════════════════════════════════════════════════════════════
# BATCH SCORING ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════

def score_batch(tickers: list, run_type: str = "weekly") -> dict:
    """Score a batch of stocks with concurrency control.

    Args:
        tickers: List of ticker symbols to score.
        run_type: "weekly" for full deep analysis, "daily" for delta-only.

    Returns:
        Summary dict: { scored, errors, cost_estimate, results, error_details }.
    """
    if not tickers:
        return {"scored": 0, "errors": 0, "cost_estimate": 0.0}

    start_time = time.time()
    logger.info(
        f"[BatchScorer] Starting {run_type} batch: {len(tickers)} tickers"
    )

    if run_type == "daily":
        # Daily: filter to stocks with material changes
        tickers = _filter_changed_tickers(tickers)
        if not tickers:
            logger.info("[BatchScorer] No material changes detected, skipping daily run")
            return {"scored": 0, "errors": 0, "cost_estimate": 0.0, "skipped": "no_changes"}

    # ── Phase 1: Score all tickers with Haiku ──
    results = []
    errors = []

    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_CALLS) as executor:
        future_to_ticker = {
            executor.submit(score_single_stock, ticker, "haiku"): ticker
            for ticker in tickers
        }

        for future in as_completed(future_to_ticker):
            ticker = future_to_ticker[future]
            try:
                result = future.result()
                if result.get("error"):
                    errors.append({"ticker": ticker, "error": result["error"]})
                else:
                    results.append(result)
            except Exception as e:
                logger.error(f"[BatchScorer] Exception scoring {ticker}: {e}")
                errors.append({"ticker": ticker, "error": str(e)})

    # ── Phase 2: Re-score flagged stocks with Sonnet (weekly only) ──
    sonnet_rescored = []
    if run_type == "weekly":
        flagged = _identify_flagged_stocks(results)
        if flagged:
            logger.info(
                f"[BatchScorer] Re-scoring {len(flagged)} flagged stocks with Sonnet"
            )
            with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_CALLS) as executor:
                future_to_ticker = {
                    executor.submit(score_single_stock, ticker, "sonnet"): ticker
                    for ticker in flagged
                }

                for future in as_completed(future_to_ticker):
                    ticker = future_to_ticker[future]
                    try:
                        result = future.result()
                        if result.get("error"):
                            errors.append({"ticker": ticker, "error": result["error"], "phase": "sonnet"})
                        else:
                            sonnet_rescored.append(result)
                            # Replace Haiku result with Sonnet result
                            results = [r for r in results if r["ticker"] != ticker]
                            results.append(result)
                    except Exception as e:
                        logger.error(f"[BatchScorer] Sonnet rescore failed for {ticker}: {e}")
                        errors.append({"ticker": ticker, "error": str(e), "phase": "sonnet"})

    # ── Compute cost estimate ──
    total_input = sum(r.get("input_tokens", 0) for r in results)
    total_output = sum(r.get("output_tokens", 0) for r in results)
    haiku_cost = MODEL_COSTS["haiku"]
    sonnet_cost = MODEL_COSTS["sonnet"]

    haiku_results = [r for r in results if r.get("model") == "haiku"]
    sonnet_results = [r for r in results if r.get("model") == "sonnet"]

    haiku_input = sum(r.get("input_tokens", 0) for r in haiku_results)
    haiku_output = sum(r.get("output_tokens", 0) for r in haiku_results)
    sonnet_input = sum(r.get("input_tokens", 0) for r in sonnet_results)
    sonnet_output = sum(r.get("output_tokens", 0) for r in sonnet_results)

    estimated_cost = (
        (haiku_input / 1000 * haiku_cost["input_per_1k"])
        + (haiku_output / 1000 * haiku_cost["output_per_1k"])
        + (sonnet_input / 1000 * sonnet_cost["input_per_1k"])
        + (sonnet_output / 1000 * sonnet_cost["output_per_1k"])
    )

    elapsed = time.time() - start_time

    summary = {
        "scored": len(results),
        "errors": len(errors),
        "cost_estimate": round(estimated_cost, 4),
        "run_type": run_type,
        "elapsed_seconds": round(elapsed, 1),
        "sonnet_rescored": len(sonnet_rescored),
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "error_details": errors[:20],  # Cap error details
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    logger.info(
        f"[BatchScorer] Batch complete: {summary['scored']} scored, "
        f"{summary['errors']} errors, ~${summary['cost_estimate']:.4f} cost, "
        f"{summary['elapsed_seconds']}s elapsed"
    )

    return summary


# ═══════════════════════════════════════════════════════════════════════
# DATA GATHERING
# ═══════════════════════════════════════════════════════════════════════

def _gather_stock_data(ticker: str) -> dict:
    """Gather all available data for a stock from pre-computed sources.

    Uses existing data modules (edgar_data, fred_data, geopolitical_data,
    finnhub_client, technical_engine) with graceful degradation.
    """
    data = {}

    # Fundamentals (EDGAR + yfinance)
    try:
        import edgar_data
        data["fundamentals"] = edgar_data.get_financial_ratios(ticker)
    except Exception as e:
        logger.warning(f"[BatchScorer] Fundamentals fetch failed for {ticker}: {e}")
        data["fundamentals"] = {}

    # Supply chain (EDGAR 10-K)
    try:
        import edgar_data
        data["supply_chain"] = edgar_data.extract_supply_chain_from_filing(ticker)
    except Exception as e:
        logger.warning(f"[BatchScorer] Supply chain fetch failed for {ticker}: {e}")
        data["supply_chain"] = []

    # Macro snapshot (FRED) — cached, shared across all stocks
    try:
        import fred_data
        data["macro_snapshot"] = fred_data.get_macro_snapshot()
    except Exception as e:
        logger.warning(f"[BatchScorer] Macro snapshot failed: {e}")
        data["macro_snapshot"] = {}

    # Geopolitical (GPR index + per-stock scoring)
    try:
        import geopolitical_data
        gpr = geopolitical_data.get_geopolitical_risk_index()
        geo_score = geopolitical_data.compute_geopolitical_score(ticker, gpr)
        data["geopolitical_data"] = {
            **gpr,
            "stock_score": geo_score,
        }
    except Exception as e:
        logger.warning(f"[BatchScorer] Geopolitical data failed for {ticker}: {e}")
        data["geopolitical_data"] = {}

    # Market data (Finnhub / yfinance)
    try:
        import finnhub_client
        data["market_data"] = finnhub_client.get_market_data_for_signal(ticker)
    except Exception as e:
        logger.warning(f"[BatchScorer] Market data failed for {ticker}: {e}")
        data["market_data"] = {}

    # Technical indicators
    try:
        import finnhub_client
        import technical_engine
        candles = finnhub_client.get_candles(ticker, resolution="D")
        if candles:
            data["technical_data"] = technical_engine.compute_indicators(candles)
        else:
            data["technical_data"] = {}
    except Exception as e:
        logger.warning(f"[BatchScorer] Technical analysis failed for {ticker}: {e}")
        data["technical_data"] = {}

    # Prior signal (for change detection)
    try:
        import db
        data["prior_signal"] = db.get_item(f"SIGNAL#{ticker}", "LATEST") or {}
    except Exception as e:
        logger.warning(f"[BatchScorer] Prior signal fetch failed for {ticker}: {e}")
        data["prior_signal"] = {}

    # Recent news
    try:
        import db
        events = db.query(
            pk=f"EVENT#{ticker}",
            limit=5,
            scan_forward=False,
        )
        data["recent_news"] = events
    except Exception as e:
        logger.warning(f"[BatchScorer] News fetch failed for {ticker}: {e}")
        data["recent_news"] = []

    return data


# ═══════════════════════════════════════════════════════════════════════
# CLAUDE API CALL
# ═══════════════════════════════════════════════════════════════════════

def _call_claude_with_retry(
    system_prompt: str,
    user_message: str,
    model_id: str,
    max_tokens: int = 4096,
) -> dict:
    """Call Claude API with retry logic and exponential backoff.

    Args:
        system_prompt: Cached system prompt.
        user_message: Per-stock context message.
        model_id: Claude model identifier.
        max_tokens: Max tokens for response.

    Returns:
        Dict with text, input_tokens, output_tokens, or error.
    """
    from claude_client import _get_client

    for attempt in range(MAX_RETRIES):
        try:
            client = _get_client()
            message = client.messages.create(
                model=model_id,
                max_tokens=max_tokens,
                system=[{
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{"role": "user", "content": user_message}],
            )

            return {
                "text": message.content[0].text,
                "input_tokens": message.usage.input_tokens,
                "output_tokens": message.usage.output_tokens,
            }

        except Exception as e:
            error_str = str(e)
            is_retryable = any(
                k in error_str.lower()
                for k in ["rate_limit", "overloaded", "529", "429", "timeout", "503"]
            )

            if is_retryable and attempt < MAX_RETRIES - 1:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning(
                    f"[BatchScorer] Claude API attempt {attempt + 1} failed "
                    f"(retrying in {delay}s): {error_str[:100]}"
                )
                time.sleep(delay)
            else:
                logger.error(f"[BatchScorer] Claude API call failed after {attempt + 1} attempts: {e}")
                return {"error": str(e)}

    return {"error": "Max retries exceeded"}


# ═══════════════════════════════════════════════════════════════════════
# RESPONSE PARSING & VALIDATION
# ═══════════════════════════════════════════════════════════════════════

def _parse_scoring_response(text: str) -> dict:
    """Parse and validate the JSON scoring response from Claude.

    Returns:
        Parsed dict with validated dimensions, or error dict.
    """
    from claude_client import _parse_json_response
    from scoring_prompts import REQUIRED_DIMENSIONS

    try:
        parsed = _parse_json_response(text)
    except (json.JSONDecodeError, Exception) as e:
        return {"error": f"JSON parse failed: {e}"}

    # Validate required top-level fields
    if "dimensions" not in parsed:
        return {"error": "Missing 'dimensions' field in response"}

    dimensions = parsed["dimensions"]
    if not isinstance(dimensions, list) or len(dimensions) == 0:
        return {"error": "Empty or invalid 'dimensions' array"}

    # Validate each dimension
    found_dimensions = set()
    for dim in dimensions:
        dim_name = dim.get("dimension")
        if dim_name not in REQUIRED_DIMENSIONS:
            continue
        found_dimensions.add(dim_name)

        # Validate score range
        score = dim.get("score")
        if score is not None:
            try:
                score = float(score)
                dim["score"] = max(1, min(10, score))
            except (ValueError, TypeError):
                dim["score"] = 5  # Default to neutral

        # Validate confidence
        if dim.get("confidence") not in ("High", "Medium", "Low"):
            dim["confidence"] = "Medium"

        # Validate findings
        findings = dim.get("findings", [])
        if not isinstance(findings, list):
            dim["findings"] = []
        else:
            for f in findings:
                if f.get("impact") not in ("positive", "negative", "neutral"):
                    f["impact"] = "neutral"
                if not f.get("source_type"):
                    f["source_type"] = "unknown"

    # Check for missing dimensions
    missing = set(REQUIRED_DIMENSIONS) - found_dimensions
    if missing:
        logger.warning(f"[BatchScorer] Missing dimensions: {missing}")
        # Add default entries for missing dimensions
        for dim_name in missing:
            dimensions.append({
                "dimension": dim_name,
                "score": 5,
                "confidence": "Low",
                "findings": [],
                "summary": "Analysis not available for this dimension.",
                "beginner_summary": "Not enough data to analyze this factor.",
            })

    # Validate composite score
    composite = parsed.get("composite_score")
    if composite is not None:
        try:
            parsed["composite_score"] = max(1.0, min(10.0, float(composite)))
        except (ValueError, TypeError):
            parsed["composite_score"] = _compute_composite_from_dimensions(dimensions)
    else:
        parsed["composite_score"] = _compute_composite_from_dimensions(dimensions)

    # Validate top_drivers
    if not isinstance(parsed.get("top_drivers"), list):
        parsed["top_drivers"] = []

    # Validate risk_flags
    if not isinstance(parsed.get("risk_flags"), list):
        parsed["risk_flags"] = []

    return parsed


def _compute_composite_from_dimensions(dimensions: list) -> float:
    """Compute composite score as weighted average of dimension scores."""
    from models import DIMENSION_WEIGHTS

    total_weight = 0.0
    weighted_sum = 0.0

    for dim in dimensions:
        dim_name = dim.get("dimension", "")
        weight = DIMENSION_WEIGHTS.get(dim_name, 0)
        score = dim.get("score", 5)

        if weight > 0:
            weighted_sum += score * weight
            total_weight += weight

    if total_weight > 0:
        return round(weighted_sum / total_weight, 1)
    return 5.0


# ═══════════════════════════════════════════════════════════════════════
# DYNAMODB WRITES
# ═══════════════════════════════════════════════════════════════════════

def _write_factor_details(ticker: str, parsed: dict) -> None:
    """Write 6 FACTOR_DETAIL records to DynamoDB."""
    import factor_details

    for dim in parsed.get("dimensions", []):
        dim_name = dim.get("dimension")
        if not dim_name:
            continue

        try:
            # Determine data sources used from findings
            source_types = list(set(
                f.get("source_type", "unknown")
                for f in dim.get("findings", [])
                if f.get("source_type")
            ))

            factor_details.write_factor_detail(
                ticker=ticker,
                dimension=dim_name,
                score=dim.get("score", 5),
                percentile=50,  # Updated by _normalize_signals later
                findings=dim.get("findings", []),
                summary=dim.get("summary", ""),
                beginner_summary=dim.get("beginner_summary", ""),
                confidence=dim.get("confidence", "Medium"),
                data_sources_used=source_types,
            )
        except Exception as e:
            logger.error(f"[BatchScorer] Failed to write factor detail {ticker}/{dim_name}: {e}")


def _write_factor_summary(ticker: str, parsed: dict) -> None:
    """Write FACTOR_SUMMARY record to DynamoDB."""
    import factor_details

    dimensions = {}
    for dim in parsed.get("dimensions", []):
        dim_name = dim.get("dimension")
        if dim_name:
            dimensions[dim_name] = {
                "score": dim.get("score", 5.0),
                "percentile": 50,
                "score_label": _dim_score_to_label(dim.get("score", 5.0)),
                "summary": dim.get("summary", ""),
                "confidence": dim.get("confidence", "Medium"),
            }

    try:
        factor_details.write_factor_summary(ticker, dimensions)
    except Exception as e:
        logger.error(f"[BatchScorer] Failed to write factor summary for {ticker}: {e}")


def _update_signal_record(ticker: str, parsed: dict) -> None:
    """Update the SIGNAL#LATEST record with score_drivers from top_drivers."""
    import db

    top_drivers = parsed.get("top_drivers", [])
    risk_flags = parsed.get("risk_flags", [])

    # Convert top_drivers to score_drivers format
    score_drivers = []
    for driver in top_drivers[:3]:
        score_drivers.append({
            "factor": driver.get("factor", ""),
            "direction": driver.get("direction", "neutral"),
            "description": driver.get("description", ""),
            "magnitude": driver.get("magnitude", 0),
        })

    updates = {
        "score_drivers": json.dumps(score_drivers),
        "risk_flags": json.dumps(risk_flags),
        "batch_scored_at": datetime.now(timezone.utc).isoformat(),
        "batch_composite": str(parsed.get("composite_score", 5.0)),
    }

    try:
        db.update_item(f"SIGNAL#{ticker}", "LATEST", updates)
    except Exception as e:
        logger.error(f"[BatchScorer] Failed to update signal record for {ticker}: {e}")


def _dim_score_to_label(score: float) -> str:
    """Map 1-10 dimension score to label."""
    if score >= 8.0:
        return "Strong"
    elif score >= 6.5:
        return "Favorable"
    elif score >= 4.5:
        return "Neutral"
    elif score >= 3.0:
        return "Weak"
    return "Caution"


# ═══════════════════════════════════════════════════════════════════════
# BATCH HELPERS
# ═══════════════════════════════════════════════════════════════════════

def _filter_changed_tickers(tickers: list) -> list:
    """Filter to stocks with material changes for daily delta run.

    Material changes: earnings in last 24h, major news, technical signal change.
    """
    import db

    changed = []
    now = datetime.now(timezone.utc)

    for ticker in tickers:
        try:
            # Check for recent events (last 24h)
            events = db.query(
                pk=f"EVENT#{ticker}",
                limit=1,
                scan_forward=False,
            )
            if events:
                event_date = events[0].get("SK", "")
                # Event SortKeys are timestamps — check if within 24h
                try:
                    event_dt = datetime.fromisoformat(
                        event_date.replace("Z", "+00:00").split("#")[0]
                    )
                    if (now - event_dt).total_seconds() < 86400:
                        changed.append(ticker)
                        continue
                except (ValueError, IndexError):
                    pass

            # Check for technical signal change
            signal_item = db.get_item(f"SIGNAL#{ticker}", "LATEST")
            if signal_item:
                last_updated = signal_item.get("lastUpdated", "")
                try:
                    last_dt = datetime.fromisoformat(last_updated.replace("Z", "+00:00"))
                    age_hours = (now - last_dt).total_seconds() / 3600
                    if age_hours > 48:  # Stale signal
                        changed.append(ticker)
                        continue
                except (ValueError, AttributeError):
                    pass

        except Exception as e:
            logger.debug(f"[BatchScorer] Change check failed for {ticker}: {e}")

    logger.info(f"[BatchScorer] Daily filter: {len(changed)}/{len(tickers)} tickers have changes")
    return changed


def _identify_flagged_stocks(results: list) -> list:
    """Identify stocks that need re-scoring with Sonnet.

    Criteria: score changed >2 points from prior signal.
    """
    import db

    flagged = []
    for result in results:
        ticker = result.get("ticker")
        new_score = result.get("composite_score")
        if not ticker or not new_score:
            continue

        try:
            prior = db.get_item(f"SIGNAL#{ticker}", "LATEST")
            if prior:
                prior_score = float(prior.get("compositeScore", 5))
                if abs(new_score - prior_score) > 2.0:
                    flagged.append(ticker)
                    logger.info(
                        f"[BatchScorer] {ticker} flagged for Sonnet: "
                        f"score change {prior_score} → {new_score} "
                        f"(delta={abs(new_score - prior_score):.1f})"
                    )
        except Exception as e:
            logger.debug(f"[BatchScorer] Flag check failed for {ticker}: {e}")

    return flagged


# ═══════════════════════════════════════════════════════════════════════
# COST TRACKING
# ═══════════════════════════════════════════════════════════════════════

def _track_cost(model: str, ticker: str, input_tokens: int, output_tokens: int) -> None:
    """Track Claude API call cost in DynamoDB.

    Logs per-call detail and accumulates monthly totals.
    """
    import db

    costs = MODEL_COSTS.get(model, MODEL_COSTS["haiku"])
    estimated_cost = (
        (input_tokens / 1000 * costs["input_per_1k"])
        + (output_tokens / 1000 * costs["output_per_1k"])
    )

    now = datetime.now(timezone.utc)
    month_key = now.strftime("%Y-%m")

    # Accumulate monthly totals
    try:
        from boto3.dynamodb.conditions import Key

        db.table().update_item(
            Key={"PK": "COST#MONTHLY", "SK": month_key},
            UpdateExpression=(
                "SET #model_default = if_not_exists(#model_default, :zero), "
                "    #last_updated = :now "
                "ADD input_tokens :input_tokens, "
                "    output_tokens :output_tokens, "
                "    estimated_cost :cost, "
                "    calls_made :one"
            ),
            ExpressionAttributeNames={
                "#model_default": "model_breakdown_initialized",
                "#last_updated": "last_updated",
            },
            ExpressionAttributeValues={
                ":input_tokens": input_tokens,
                ":output_tokens": output_tokens,
                ":cost": Decimal(str(round(estimated_cost, 6))),
                ":one": 1,
                ":zero": True,
                ":now": now.isoformat(),
            },
        )
    except Exception as e:
        logger.warning(f"[BatchScorer] Failed to update monthly cost: {e}")

    # Log individual call (best-effort, don't fail scoring)
    try:
        db.put_item({
            "PK": "COST#CALL_LOG",
            "SK": f"{now.isoformat()}#{ticker}",
            "ticker": ticker,
            "model": model,
            "model_id": MODELS.get(model, model),
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost": Decimal(str(round(estimated_cost, 6))),
            "timestamp": now.isoformat(),
            "TTL": int(time.time()) + (90 * 24 * 60 * 60),  # 90-day TTL
        })
    except Exception as e:
        logger.debug(f"[BatchScorer] Failed to log call detail: {e}")


def get_cost_summary(month: str = None) -> dict:
    """Get cost summary for a given month.

    Args:
        month: Month in YYYY-MM format. Defaults to current month.

    Returns:
        Dict with total_cost, calls_made, avg_per_stock, model_breakdown.
    """
    import db

    if not month:
        month = datetime.now(timezone.utc).strftime("%Y-%m")

    try:
        item = db.get_item("COST#MONTHLY", month)
        if not item:
            return {
                "month": month,
                "total_cost": 0,
                "calls_made": 0,
                "avg_per_stock": 0,
                "input_tokens": 0,
                "output_tokens": 0,
            }

        calls_made = int(item.get("calls_made", 0))
        total_cost = float(item.get("estimated_cost", 0))

        return {
            "month": month,
            "total_cost": round(total_cost, 4),
            "calls_made": calls_made,
            "avg_per_stock": round(total_cost / max(calls_made, 1), 4),
            "input_tokens": int(item.get("input_tokens", 0)),
            "output_tokens": int(item.get("output_tokens", 0)),
            "last_updated": item.get("last_updated", ""),
        }

    except Exception as e:
        logger.error(f"[BatchScorer] Failed to get cost summary: {e}")
        return {"month": month, "error": str(e)}


# ═══════════════════════════════════════════════════════════════════════
# SCHEDULE HELPERS
# ═══════════════════════════════════════════════════════════════════════

def is_weekly_run(event: dict) -> bool:
    """Check if this is a Saturday 6AM weekly run.

    Returns True if the event is a scheduled (cron) event on Saturday.
    """
    now = datetime.now(timezone.utc)

    # Saturday = 5 in Python (Monday=0)
    if now.weekday() == 5:
        return True

    # Also check event for explicit weekly flag
    if event.get("run_type") == "weekly":
        return True

    return False

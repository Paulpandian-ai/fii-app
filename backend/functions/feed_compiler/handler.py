"""FII Feed Compiler — Assembles daily feed from signal results.

Triggered daily at 6:30AM ET (30 min after signal engine).
Reads the latest signal analysis results and compiles them
into an ordered feed for the mobile app.
"""

import json
import logging
import os
import sys
import traceback
from datetime import datetime, timezone

import boto3

sys.path.insert(0, "/opt/python")

import db
import s3

logger = logging.getLogger(__name__)

# DynamoDB resource for inline chunked batch_get (bypass shared layer)
_dynamodb = boto3.resource("dynamodb")
_table_name = os.environ.get("TABLE_NAME", "fii-table-dev")

EDUCATIONAL_CARDS = [
    {
        "title": "What is the Sharpe Ratio?",
        "body": "The Sharpe Ratio measures risk-adjusted returns. A ratio above 1.0 means you're being compensated well for the risk you're taking. FII uses it to compare how efficiently different portfolios generate returns.",
    },
    {
        "title": "How Supply Chains Affect Stock Prices",
        "body": "When a key supplier faces disruption \u2014 chip shortages, factory fires, shipping delays \u2014 it can ripple through to company earnings within weeks. FII tracks upstream and downstream signals to catch these early.",
    },
    {
        "title": "Why Diversification Works",
        "body": "Holding uncorrelated assets means when one drops, others may hold steady or rise. FII's correlation engine (Factor E) measures exactly how your holdings move together, helping you spot hidden concentration risk.",
    },
    {
        "title": "What the Fed Rate Means for You",
        "body": "When the Fed raises rates, borrowing costs rise, slowing growth and often pressuring stock valuations. FII's monetary factors (D1-D3) track Fed decisions, inflation, and Treasury yields to score this macro impact.",
    },
    {
        "title": "Reading Earnings Surprises",
        "body": "When a company beats EPS estimates, the stock often jumps \u2014 but not always. FII's Factor F1 scores the magnitude and market reaction of earnings surprises to gauge whether the move is priced in.",
    },
    {
        "title": "What Beta Tells You",
        "body": "Beta measures how much a stock moves relative to the market. A beta of 1.5 means 50% more volatile than the S&P 500. FII's Factor F3 flags high-beta names so you know what you're signing up for.",
    },
]


def lambda_handler(event, context):
    """Compile the daily feed from the latest signal results.

    Also runs financial metrics batch precompute (daily staleness check,
    full refresh weekly).
    """
    try:
        logger.info(f"[FeedCompiler] Starting at {datetime.now(timezone.utc).isoformat()}")

        feed_items = _compile_feed()

        # Write compiled feed to S3
        feed_data = {
            "items": feed_items,
            "compiledAt": datetime.now(timezone.utc).isoformat(),
            "count": len(feed_items),
        }
        s3.write_json("feed/default.json", feed_data)

        logger.info(f"[FeedCompiler] Compiled {len(feed_items)} items (wrote to S3)")

        # Precompute financial metrics (after feed compilation)
        metrics_result = _precompute_financial_metrics()

        return {
            "statusCode": 200,
            "body": json.dumps({
                "compiled": len(feed_items),
                "metrics_precompute": metrics_result,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }),
        }

    except Exception as e:
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }


_DEFAULT_FACTOR_DIMS = (
    "supply_chain_upstream",
    "supply_chain_downstream",
    "geopolitical",
    "monetary",
    "correlations",
    "risk_performance",
)


def _has_real_factor_data(factor_pcts: dict) -> bool:
    """Return True when factor_percentiles contain real (non-default) data.

    The signal engine writes a placeholder of 50 for every dimension before the
    normalization pass runs. If we still see that pattern here the bars would
    render as a flat 50p row for every factor, which looks broken, so we tell
    the client to surface a "data pending" state instead.
    """
    if not isinstance(factor_pcts, dict) or not factor_pcts:
        return False
    values = [factor_pcts.get(dim) for dim in _DEFAULT_FACTOR_DIMS]
    if any(v is None for v in values):
        return False
    try:
        nums = [float(v) for v in values]
    except (TypeError, ValueError):
        return False
    return not all(n == 50 for n in nums)


def _snapshot_value(cats: dict, category: str, key: str):
    """Pull ``categories[category][key].value`` safely from a metrics dict."""
    try:
        entry = cats.get(category, {}).get(key)
        if not isinstance(entry, dict):
            return None
        val = entry.get("value")
        if val is None:
            return None
        # Guard against stringified NaN / None that occasionally slip through
        if isinstance(val, (int, float)):
            return val
        try:
            return float(val)
        except (TypeError, ValueError):
            return None
    except Exception:
        return None


def _build_financial_snapshot(fin_item: dict | None) -> dict | None:
    """Build a compact financial_snapshot from a cached FINANCIALS record.

    Returns a dict with the 12 metrics the Feed card needs, or ``None`` if the
    ticker has no cached financials yet. Individual missing metrics are kept as
    ``None`` so the client can render "—" for them without inventing values.
    """
    if not fin_item:
        return None

    cats = fin_item.get("categories")
    if isinstance(cats, str):
        try:
            cats = json.loads(cats)
        except (json.JSONDecodeError, TypeError):
            cats = {}
    if not isinstance(cats, dict):
        return None

    snapshot = {
        "pe_ratio": _snapshot_value(cats, "valuation", "trailing_pe"),
        "forward_pe": _snapshot_value(cats, "valuation", "forward_pe"),
        "market_cap": _snapshot_value(cats, "valuation", "market_cap"),
        "fcf_yield": _snapshot_value(cats, "valuation", "fcf_yield"),
        "revenue_growth_yoy": _snapshot_value(cats, "growth", "revenue_growth_yoy"),
        "eps_growth_yoy": _snapshot_value(cats, "growth", "eps_growth_yoy"),
        "net_margin": _snapshot_value(cats, "profitability", "net_margin"),
        "operating_margin": _snapshot_value(cats, "profitability", "operating_margin"),
        "roe": _snapshot_value(cats, "profitability", "roe"),
        "beta": _snapshot_value(cats, "momentum_technicals", "beta"),
        "dividend_yield": _snapshot_value(cats, "dividends", "dividend_yield"),
        "target_price_mean": _snapshot_value(cats, "analyst_estimates", "target_price_mean"),
        "short_pct_float": _snapshot_value(cats, "ownership", "short_pct_float"),
        # earnings_date is supplied via a separate calendar feed today; leave a
        # slot so clients can read it when the pipeline starts to populate it.
        "earnings_date": fin_item.get("earnings_date") or None,
    }
    # If literally every field is None there's no point shipping the block
    if all(v is None for v in snapshot.values()):
        return None
    return snapshot


def _compile_feed() -> list[dict]:
    """Read all signals from DynamoDB and build ranked feed with educational cards.

    Prioritizes TIER_1 stocks (richest data), then TIER_2, then TIER_3/ETF.
    Each signal is enriched with a ``financial_snapshot`` block pulled from
    the cached FINANCIALS#{ticker} record so the feed cards can render the
    valuation/profitability/growth rows without a per-card round-trip.
    """
    from models import ALL_SECURITIES, TIER_1_SET, ETF_SET, get_tier

    # Batch-read all SIGNAL#* | LATEST items
    keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in ALL_SECURITIES]

    all_items = []
    for i in range(0, len(keys), 100):
        chunk = keys[i:i+100]
        resp = db.batch_get(chunk)
        all_items.extend(resp)
    items = all_items

    if not items:
        logger.warning("[FeedCompiler] No signal items found in DynamoDB")
        return []

    # Batch-read FINANCIALS#* | LATEST for every ticker in the universe so we
    # can build per-signal financial_snapshot blocks in a single pass.
    fin_keys = [{"PK": f"FINANCIALS#{t}", "SK": "LATEST"} for t in ALL_SECURITIES]
    fin_items = []
    for i in range(0, len(fin_keys), 100):
        chunk = fin_keys[i:i + 100]
        try:
            fin_items.extend(db.batch_get(chunk))
        except Exception as e:
            logger.warning(f"[FeedCompiler] FINANCIALS batch_get chunk failed: {e}")
    fin_by_ticker = {it.get("ticker"): it for it in fin_items if it.get("ticker")}
    logger.info(
        f"[FeedCompiler] Loaded {len(fin_by_ticker)} FINANCIALS records for snapshot enrichment"
    )

    # Parse each item into a feed-ready dict
    signals = []
    for item in items:
        ticker = item.get("ticker", "")
        if not ticker:
            continue
        top_factors = json.loads(item.get("topFactors", "[]"))
        tier = item.get("tier") or get_tier(ticker)
        is_etf = item.get("isETF", False) or ticker in ETF_SET

        # Parse new fields
        score_drivers = []
        try:
            sd_raw = item.get("score_drivers", "[]")
            score_drivers = json.loads(sd_raw) if isinstance(sd_raw, str) else (sd_raw if isinstance(sd_raw, list) else [])
        except Exception:
            pass

        factor_pcts = {}
        try:
            fp_raw = item.get("factor_percentiles", "{}")
            factor_pcts = json.loads(fp_raw) if isinstance(fp_raw, str) else (fp_raw if isinstance(fp_raw, dict) else {})
        except Exception:
            pass

        # Flag signals whose factor_percentiles are still the defaults (all 50),
        # so the client can render "Data pending" instead of a flat bar row.
        # Prefer the authoritative flag written by _normalize_signals; fall
        # back to value inspection for items that predate the flag.
        stored_flag = item.get("factor_data_available")
        if stored_flag is None:
            factor_data_available = _has_real_factor_data(factor_pcts)
        else:
            factor_data_available = bool(stored_flag)
        if not factor_data_available:
            factor_pcts = None

        signals.append({
            "id": f"signal-{ticker}",
            "type": "signal",
            "ticker": ticker,
            "companyName": item.get("companyName", ticker),
            "compositeScore": float(item.get("compositeScore", 5.0)),
            "signal": item.get("signal", "Neutral"),
            "score_label": item.get("score_label", item.get("signal", "Neutral")),
            "percentile_rank": int(item.get("percentile_rank", 50)),
            "sector_percentile": int(item.get("sector_percentile", 50)),
            "sector": item.get("sector") or "",
            "factor_percentiles": factor_pcts,
            "factor_data_available": factor_data_available,
            "score_drivers": score_drivers,
            "confidence": item.get("confidence", "MEDIUM"),
            "insight": item.get("insight", ""),
            "topFactors": top_factors,
            "financial_snapshot": _build_financial_snapshot(fin_by_ticker.get(ticker)),
            "updatedAt": item.get("lastUpdated", ""),
            "tier": tier,
            "isETF": is_etf,
            "tierLabel": "Full Analysis" if tier == "TIER_1" else "Technical + Fundamental" if tier == "TIER_2" else "ETF" if is_etf else "Technical Only",
        })

    # Sort: TIER_1 first, then by confidence, then by score extremity
    tier_order = {"TIER_1": 0, "TIER_2": 1, "TIER_3": 2, "ETF": 3}
    confidence_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    signals.sort(key=lambda x: (
        tier_order.get(x.get("tier", "TIER_3"), 3),
        confidence_order.get(x.get("confidence", "MEDIUM"), 1),
        -abs(x.get("compositeScore", 5.0) - 5.5),
    ))

    # Interleave educational cards every 5 signal cards
    feed = []
    edu_idx = 0
    for i, sig in enumerate(signals):
        feed.append(sig)
        if (i + 1) % 5 == 0 and edu_idx < len(EDUCATIONAL_CARDS):
            edu_card = EDUCATIONAL_CARDS[edu_idx]
            feed.append({
                "id": f"edu-{edu_idx}",
                "type": "educational",
                "title": edu_card["title"],
                "body": edu_card["body"],
            })
            edu_idx += 1

    return feed


def _precompute_financial_metrics() -> dict:
    """Batch precompute financial metrics for stocks missing or with stale data.

    Runs after feed compilation (daily at 6:30AM ET).
    Only processes stocks that don't have FINANCIALS# records or
    records older than 7 days. Processes in batches of 20 with
    2-second delays between batches (Finnhub rate limiting).

    Rate limiting: max 5 concurrent fetches, 2s delay per 20-stock batch.
    """
    try:
        from models import ALL_NON_ETF
        from financial_metrics import batch_compute_all

        # Find stocks needing financial metrics update
        stale_cutoff = datetime.now(timezone.utc).timestamp() - (7 * 24 * 3600)
        needs_update = []

        for ticker in ALL_NON_ETF:
            try:
                item = db.get_item(f"FINANCIALS#{ticker}", "LATEST")
                if not item:
                    needs_update.append(ticker)
                    continue
                # Check staleness
                updated_at = item.get("lastUpdated", "")
                if updated_at:
                    try:
                        ts = datetime.fromisoformat(updated_at.replace("Z", "+00:00")).timestamp()
                        if ts < stale_cutoff:
                            needs_update.append(ticker)
                    except (ValueError, TypeError):
                        needs_update.append(ticker)
                else:
                    needs_update.append(ticker)
            except Exception:
                needs_update.append(ticker)

        total_universe = len(ALL_NON_ETF)
        already_fresh = total_universe - len(needs_update)
        logger.info(
            f"[FeedCompiler] Financial metrics: {already_fresh}/{total_universe} fresh, "
            f"{len(needs_update)} need update"
        )

        if not needs_update:
            return {
                "computed": 0,
                "total": total_universe,
                "already_fresh": already_fresh,
                "message": "All stocks have fresh financial metrics",
            }

        # Process in batches of 20 with 2-second delays
        METRICS_BATCH_SIZE = 20
        computed = 0
        failed = 0

        for i in range(0, len(needs_update), METRICS_BATCH_SIZE):
            batch = needs_update[i:i + METRICS_BATCH_SIZE]
            result = batch_compute_all(tickers=batch)
            computed += result.get("computed", 0)
            failed += result.get("failed", 0)

            done = min(i + METRICS_BATCH_SIZE, len(needs_update))
            logger.info(
                f"[FeedCompiler] Financial metrics: {done}/{len(needs_update)} complete"
            )

            # Rate limiting between batches
            if i + METRICS_BATCH_SIZE < len(needs_update):
                import time as _time
                _time.sleep(2)

        logger.info(
            f"[FeedCompiler] Financial metrics precompute complete: "
            f"{computed}/{len(needs_update)} computed, {failed} failed"
        )
        return {
            "computed": computed,
            "failed": failed,
            "total": total_universe,
            "already_fresh": already_fresh,
            "needed_update": len(needs_update),
        }
    except Exception as e:
        logger.error(f"[FeedCompiler] Financial metrics precompute failed: {e}")
        traceback.print_exc()
        return {"error": str(e)}

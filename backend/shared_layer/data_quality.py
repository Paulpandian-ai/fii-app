"""Data quality validation suite for FII scoring pipeline.

Runs after each scoring cycle to validate data integrity across:
  1. Score distribution — forced distribution compliance
  2. Factor completeness — score_drivers, factor_percentiles, compositeScore
  3. Rationale quality — FACTOR_DETAIL findings, sources, summaries
  4. Stale data — flag records past freshness thresholds
  5. Financial metrics sanity — outlier detection on FINANCIALS# records

Results stored as: PK=QUALITY#{date}, SK={run_type}
"""

import json
import logging
import random
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── 6 dimensions matching models.py ──
DIMENSIONS = [
    "supply_chain_upstream",
    "supply_chain_downstream",
    "geopolitical",
    "monetary",
    "correlations",
    "risk_performance",
]

# Valid source_type enum values
VALID_SOURCE_TYPES = {
    "sec_filing", "earnings", "fred", "yfinance", "news",
    "regulatory", "unknown", "analyst", "company", "government",
    "edgar", "finnhub", "technical", "social",
}

# Score label mapping (fii_score -> expected label)
SCORE_LABEL_MAP = {
    10: "Strong", 9: "Strong",
    8: "Favorable", 7: "Favorable",
    6: "Neutral", 5: "Neutral",
    4: "Weak", 3: "Weak",
    2: "Caution", 1: "Caution",
}

# Default alert thresholds (configurable)
DEFAULT_THRESHOLDS = {
    "distribution_max_multiplier": 2.0,
    "same_score_max_pct": 0.10,
    "completeness_min_pct": 90,
    "quality_min_score": 80,
    "stale_signal_hours": 48,
    "stale_factor_days": 30,
    "stale_financials_days": 7,
    "stale_stress_days": 7,
    "pe_min": -1000,
    "pe_max": 1000,
    "margin_min": -100,
    "margin_max": 100,
    "beta_min": -5,
    "beta_max": 10,
    "revenue_growth_min": -100,
    "revenue_growth_max": 10000,
}

# Expected forced distribution (fii_score -> approximate % of stocks)
EXPECTED_DISTRIBUTION = {
    10: 0.05, 9: 0.10, 8: 0.15, 7: 0.15,
    6: 0.10, 5: 0.10, 4: 0.15, 3: 0.10,
    2: 0.05, 1: 0.05,
}


def _safe_float(val, default=None):
    """Safely convert a value to float."""
    if val is None:
        return default
    try:
        if isinstance(val, Decimal):
            return float(val)
        return float(val)
    except (ValueError, TypeError):
        return default


def _parse_json_field(val):
    """Parse a JSON string field, returning the parsed value or the original."""
    if isinstance(val, str):
        try:
            return json.loads(val)
        except (json.JSONDecodeError, TypeError):
            return val
    return val


# ═══════════════════════════════════════════════════════════════════════
# CHECK 1: Score Distribution
# ═══════════════════════════════════════════════════════════════════════

def check_score_distribution(signal_items: list[dict], thresholds: dict = None) -> dict:
    """Verify forced distribution is maintained across all scored stocks.

    Args:
        signal_items: List of SIGNAL#LATEST records.
        thresholds: Optional overrides for alert thresholds.

    Returns:
        Dict with distribution_ok, actual_distribution, alerts.
    """
    th = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    alerts = []

    if not signal_items:
        return {"distribution_ok": False, "actual_distribution": {}, "alerts": ["No signal items found"]}

    total = len(signal_items)
    score_counts: dict[int, int] = {}

    for item in signal_items:
        fii_score = item.get("fii_score")
        if fii_score is not None:
            try:
                score = int(fii_score)
                score_counts[score] = score_counts.get(score, 0) + 1
            except (ValueError, TypeError):
                pass

    actual_distribution = {
        score: count / total
        for score, count in score_counts.items()
    }

    distribution_ok = True

    # Check each bucket against expected
    for score, expected_pct in EXPECTED_DISTRIBUTION.items():
        actual_pct = actual_distribution.get(score, 0)
        actual_count = score_counts.get(score, 0)
        expected_count = expected_pct * total

        if actual_count > expected_count * th["distribution_max_multiplier"]:
            alerts.append(
                f"Score {score}: {actual_count} stocks ({actual_pct:.1%}) exceeds "
                f"2x expected ({expected_count:.0f})"
            )
            distribution_ok = False

    # Check if >10% have the same score
    for score, count in score_counts.items():
        if count / total > th["same_score_max_pct"] and score not in (7, 8):
            # Scores 7-8 are allowed a wider bucket in the forced distribution
            alerts.append(
                f"Score {score}: {count}/{total} stocks ({count/total:.1%}) — "
                f"more than {th['same_score_max_pct']:.0%} have the same score"
            )
            distribution_ok = False

    return {
        "distribution_ok": distribution_ok,
        "actual_distribution": {str(k): round(v, 4) for k, v in actual_distribution.items()},
        "score_counts": {str(k): v for k, v in score_counts.items()},
        "total_stocks": total,
        "alerts": alerts,
    }


# ═══════════════════════════════════════════════════════════════════════
# CHECK 2: Factor Completeness
# ═══════════════════════════════════════════════════════════════════════

def check_factor_completeness(signal_items: list[dict], thresholds: dict = None) -> dict:
    """Verify each stock has complete score_drivers, factor_percentiles, compositeScore.

    Returns:
        Dict with completeness_pct, incomplete_stocks, alerts.
    """
    th = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    alerts = []
    complete = 0
    incomplete_stocks = []

    for item in signal_items:
        ticker = item.get("ticker", "?")
        issues = []

        # score_drivers: non-empty array with >= 2 entries
        drivers = _parse_json_field(item.get("score_drivers", "[]"))
        if not isinstance(drivers, list) or len(drivers) < 2:
            issues.append(f"score_drivers has {len(drivers) if isinstance(drivers, list) else 0} entries (need >=2)")

        # factor_percentiles: all 6 dimensions
        fp = _parse_json_field(item.get("factor_percentiles", "{}"))
        if not isinstance(fp, dict):
            issues.append("factor_percentiles is not a dict")
        else:
            missing_dims = [d for d in DIMENSIONS if d not in fp]
            if missing_dims:
                issues.append(f"factor_percentiles missing: {', '.join(missing_dims)}")

            # Each percentile should be 0-100 and not all the same
            pct_values = []
            for dim in DIMENSIONS:
                val = _safe_float(fp.get(dim))
                if val is not None:
                    if not (0 <= val <= 100):
                        issues.append(f"factor_percentiles[{dim}]={val} out of 0-100")
                    pct_values.append(val)
            if pct_values and len(set(pct_values)) == 1 and len(pct_values) == 6:
                issues.append("All factor_percentiles are identical")

        # compositeScore: between 1.0 and 10.0
        cs = _safe_float(item.get("compositeScore"))
        if cs is None:
            issues.append("compositeScore is missing")
        elif not (1.0 <= cs <= 10.0):
            issues.append(f"compositeScore={cs} out of 1.0-10.0 range")

        # score_label matches fii_score
        fii_score = item.get("fii_score")
        score_label = item.get("score_label")
        if fii_score is not None and score_label:
            try:
                expected_label = SCORE_LABEL_MAP.get(int(fii_score))
                if expected_label and expected_label != score_label:
                    issues.append(f"score_label '{score_label}' doesn't match fii_score {fii_score} (expected '{expected_label}')")
            except (ValueError, TypeError):
                pass

        if issues:
            incomplete_stocks.append({"ticker": ticker, "issues": issues})
        else:
            complete += 1

    total = len(signal_items) or 1
    completeness_pct = round(100 * complete / total, 1)

    if completeness_pct < th["completeness_min_pct"]:
        alerts.append(
            f"Factor completeness {completeness_pct}% below {th['completeness_min_pct']}% threshold"
        )

    return {
        "completeness_pct": completeness_pct,
        "complete_count": complete,
        "total_count": len(signal_items),
        "incomplete_stocks": incomplete_stocks[:20],  # Cap to avoid huge payloads
        "alerts": alerts,
    }


# ═══════════════════════════════════════════════════════════════════════
# CHECK 3: Rationale Quality (sample-based)
# ═══════════════════════════════════════════════════════════════════════

def check_rationale_quality(
    db_module,
    tickers: list[str],
    sample_size: int = 20,
    thresholds: dict = None,
) -> dict:
    """Sample FACTOR_DETAIL records and check quality of findings/summaries.

    Args:
        db_module: The db module (with get_item, query functions).
        tickers: List of all stock tickers to sample from.
        sample_size: Number of stocks to sample.
        thresholds: Optional overrides.

    Returns:
        Dict with quality_score, sample_results, alerts.
    """
    th = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    alerts = []

    sampled = random.sample(tickers, min(sample_size, len(tickers)))
    checks_passed = 0
    checks_total = 0
    sample_results = []

    for ticker in sampled:
        ticker_issues = []
        ticker_passed = 0
        ticker_total = 0

        for dimension in DIMENSIONS:
            items = db_module.query(
                pk=f"FACTOR#{ticker.upper()}",
                sk_begins_with=f"{dimension}#",
                limit=1,
                scan_forward=False,
            )

            if not items:
                ticker_issues.append(f"{dimension}: no FACTOR_DETAIL record")
                ticker_total += 1
                continue

            detail = items[0]
            ticker_total += 1

            # findings array has >= 2 entries
            findings = detail.get("findings", [])
            if not isinstance(findings, list) or len(findings) < 2:
                ticker_issues.append(f"{dimension}: findings has {len(findings) if isinstance(findings, list) else 0} entries (need >=2)")
            else:
                # Each finding should have claim, source, impact
                for i, finding in enumerate(findings):
                    if not isinstance(finding, dict):
                        continue
                    if not finding.get("claim"):
                        ticker_issues.append(f"{dimension}: finding[{i}] missing claim")
                    if not finding.get("source"):
                        ticker_issues.append(f"{dimension}: finding[{i}] missing source")
                    if not finding.get("impact"):
                        ticker_issues.append(f"{dimension}: finding[{i}] missing impact")
                    st = finding.get("source_type", "")
                    if st and st not in VALID_SOURCE_TYPES:
                        ticker_issues.append(f"{dimension}: finding[{i}] invalid source_type '{st}'")

            # summary >= 20 chars
            summary = detail.get("summary", "")
            if len(summary) < 20:
                ticker_issues.append(f"{dimension}: summary too short ({len(summary)} chars)")

            # beginner_summary >= 20 chars
            beginner = detail.get("beginner_summary", "")
            if len(beginner) < 20:
                ticker_issues.append(f"{dimension}: beginner_summary too short ({len(beginner)} chars)")

            if not ticker_issues or all(dimension not in issue for issue in ticker_issues):
                ticker_passed += 1

        checks_total += ticker_total
        checks_passed += ticker_passed

        if ticker_issues:
            sample_results.append({"ticker": ticker, "issues": ticker_issues[:10]})

    quality_score = round(100 * checks_passed / max(checks_total, 1), 1)

    if quality_score < th["quality_min_score"]:
        alerts.append(
            f"Rationale quality score {quality_score}% below {th['quality_min_score']}% threshold"
        )

    return {
        "quality_score": quality_score,
        "checks_passed": checks_passed,
        "checks_total": checks_total,
        "sample_size": len(sampled),
        "sample_results": sample_results[:10],
        "alerts": alerts,
    }


# ═══════════════════════════════════════════════════════════════════════
# CHECK 4: Stale Data
# ═══════════════════════════════════════════════════════════════════════

def check_stale_data(
    db_module,
    signal_items: list[dict],
    tickers: list[str],
    thresholds: dict = None,
) -> dict:
    """Flag records past their freshness thresholds.

    Returns:
        Dict with stale_count, stale_records, alerts.
    """
    th = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    now = datetime.now(timezone.utc)
    alerts = []
    stale_records = []

    # SIGNAL#LATEST: flag if last_updated > 48 hours
    signal_threshold = now - timedelta(hours=th["stale_signal_hours"])
    for item in signal_items:
        ticker = item.get("ticker", "?")
        last_updated = item.get("lastUpdated") or item.get("last_updated")
        if last_updated:
            try:
                updated_dt = datetime.fromisoformat(str(last_updated).replace("Z", "+00:00"))
                if updated_dt.tzinfo is None:
                    updated_dt = updated_dt.replace(tzinfo=timezone.utc)
                if updated_dt < signal_threshold:
                    stale_records.append({
                        "type": "SIGNAL",
                        "ticker": ticker,
                        "last_updated": str(last_updated),
                        "age_hours": round((now - updated_dt).total_seconds() / 3600, 1),
                    })
            except (ValueError, TypeError):
                pass

    # Sample tickers for FACTOR_DETAIL and FINANCIALS# staleness
    sample_tickers = random.sample(tickers, min(30, len(tickers)))

    factor_threshold = now - timedelta(days=th["stale_factor_days"])
    financials_threshold = now - timedelta(days=th["stale_financials_days"])
    stress_threshold = now - timedelta(days=th["stale_stress_days"])

    for ticker in sample_tickers:
        # FACTOR_DETAIL: data_date > 30 days
        for dimension in DIMENSIONS:
            items = db_module.query(
                pk=f"FACTOR#{ticker.upper()}",
                sk_begins_with=f"{dimension}#",
                limit=1,
                scan_forward=False,
            )
            if items:
                data_date = items[0].get("data_date") or items[0].get("last_updated")
                if data_date:
                    try:
                        dd = datetime.fromisoformat(str(data_date).replace("Z", "+00:00"))
                        if dd.tzinfo is None:
                            dd = dd.replace(tzinfo=timezone.utc)
                        if dd < factor_threshold:
                            stale_records.append({
                                "type": "FACTOR_DETAIL",
                                "ticker": ticker,
                                "dimension": dimension,
                                "last_updated": str(data_date),
                                "age_days": round((now - dd).total_seconds() / 86400, 1),
                            })
                    except (ValueError, TypeError):
                        pass

        # FINANCIALS#: computed_at > 7 days
        fin_item = db_module.get_item(f"FINANCIALS#{ticker.upper()}", "LATEST")
        if fin_item:
            computed_at = fin_item.get("computed_at") or fin_item.get("last_updated")
            if computed_at:
                try:
                    ca = datetime.fromisoformat(str(computed_at).replace("Z", "+00:00"))
                    if ca.tzinfo is None:
                        ca = ca.replace(tzinfo=timezone.utc)
                    if ca < financials_threshold:
                        stale_records.append({
                            "type": "FINANCIALS",
                            "ticker": ticker,
                            "last_updated": str(computed_at),
                            "age_days": round((now - ca).total_seconds() / 86400, 1),
                        })
                except (ValueError, TypeError):
                    pass

        # STRESS#: last_updated > 7 days
        stress_item = db_module.get_item(f"STRESS#{ticker.upper()}", "LATEST")
        if stress_item:
            stress_updated = stress_item.get("last_updated") or stress_item.get("generatedAt")
            if stress_updated:
                try:
                    su = datetime.fromisoformat(str(stress_updated).replace("Z", "+00:00"))
                    if su.tzinfo is None:
                        su = su.replace(tzinfo=timezone.utc)
                    if su < stress_threshold:
                        stale_records.append({
                            "type": "STRESS",
                            "ticker": ticker,
                            "last_updated": str(stress_updated),
                            "age_days": round((now - su).total_seconds() / 86400, 1),
                        })
                except (ValueError, TypeError):
                    pass

    stale_count = len(stale_records)
    if stale_count > 0:
        alerts.append(f"{stale_count} stale records detected across sampled tickers")

    return {
        "stale_count": stale_count,
        "stale_signals": len([r for r in stale_records if r["type"] == "SIGNAL"]),
        "stale_factors": len([r for r in stale_records if r["type"] == "FACTOR_DETAIL"]),
        "stale_financials": len([r for r in stale_records if r["type"] == "FINANCIALS"]),
        "stale_stress": len([r for r in stale_records if r["type"] == "STRESS"]),
        "stale_records": stale_records[:50],  # Cap output
        "alerts": alerts,
    }


# ═══════════════════════════════════════════════════════════════════════
# CHECK 5: Financial Metrics Sanity
# ═══════════════════════════════════════════════════════════════════════

def check_financial_sanity(
    db_module,
    tickers: list[str],
    thresholds: dict = None,
) -> dict:
    """Validate financial metrics are within sane ranges.

    Returns:
        Dict with outlier_count, outliers, alerts.
    """
    th = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    alerts = []
    outliers = []

    for ticker in tickers:
        fin_item = db_module.get_item(f"FINANCIALS#{ticker.upper()}", "LATEST")
        if not fin_item:
            continue

        metrics = fin_item.get("metrics", fin_item)
        ticker_issues = []

        # P/E ratio
        pe = _safe_float(metrics.get("pe_ratio") or metrics.get("peRatio") or metrics.get("pe"))
        if pe is not None and not (th["pe_min"] <= pe <= th["pe_max"]):
            ticker_issues.append(f"P/E={pe} outside [{th['pe_min']}, {th['pe_max']}]")

        # Margins (gross, operating, net)
        for margin_key in ["gross_margin", "grossMargin", "operating_margin", "operatingMargin", "net_margin", "netMargin", "profit_margin", "profitMargin"]:
            margin = _safe_float(metrics.get(margin_key))
            if margin is not None:
                margin_pct = margin * 100 if abs(margin) <= 1 else margin
                if not (th["margin_min"] <= margin_pct <= th["margin_max"]):
                    ticker_issues.append(f"{margin_key}={margin_pct:.1f}% outside [{th['margin_min']}%, {th['margin_max']}%]")

        # Beta
        beta = _safe_float(metrics.get("beta"))
        if beta is not None and not (th["beta_min"] <= beta <= th["beta_max"]):
            ticker_issues.append(f"beta={beta} outside [{th['beta_min']}, {th['beta_max']}]")

        # Market cap > 0
        mcap = _safe_float(metrics.get("market_cap") or metrics.get("marketCap"))
        if mcap is not None and mcap <= 0:
            ticker_issues.append(f"market_cap={mcap} is not positive")

        # Revenue growth
        rev_growth = _safe_float(metrics.get("revenue_growth") or metrics.get("revenueGrowth"))
        if rev_growth is not None:
            growth_pct = rev_growth * 100 if abs(rev_growth) <= 10 else rev_growth
            if not (th["revenue_growth_min"] <= growth_pct <= th["revenue_growth_max"]):
                ticker_issues.append(f"revenue_growth={growth_pct:.1f}% outside [{th['revenue_growth_min']}%, {th['revenue_growth_max']}%]")

        if ticker_issues:
            outliers.append({"ticker": ticker, "issues": ticker_issues})

    outlier_count = len(outliers)
    if outlier_count > 10:
        alerts.append(f"{outlier_count} stocks have financial metric outliers — review recommended")

    return {
        "outlier_count": outlier_count,
        "outliers": outliers[:30],
        "total_checked": len(tickers),
        "alerts": alerts,
    }


# ═══════════════════════════════════════════════════════════════════════
# ORCHESTRATOR: Run all checks
# ═══════════════════════════════════════════════════════════════════════

def run_all_checks(
    db_module,
    thresholds: dict = None,
) -> dict:
    """Run all 5 data quality checks and return a consolidated report.

    Args:
        db_module: The db module with get_item, query, put_item.
        thresholds: Optional threshold overrides.

    Returns:
        Full quality report dict.
    """
    from models import ALL_SECURITIES, ETF_SET

    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")

    logger.info("[DataQuality] Starting quality validation run...")

    # Load all SIGNAL#LATEST records
    signal_items = []
    stock_tickers = [t for t in ALL_SECURITIES if t not in ETF_SET]
    for ticker in ALL_SECURITIES:
        try:
            item = db_module.get_item(f"SIGNAL#{ticker}", "LATEST")
            if item:
                signal_items.append(item)
        except Exception:
            pass

    logger.info(f"[DataQuality] Loaded {len(signal_items)} signal records")

    # Run all checks
    distribution = check_score_distribution(signal_items, thresholds)
    logger.info(f"[DataQuality] Distribution check: ok={distribution['distribution_ok']}")

    completeness = check_factor_completeness(signal_items, thresholds)
    logger.info(f"[DataQuality] Completeness: {completeness['completeness_pct']}%")

    rationale = check_rationale_quality(db_module, stock_tickers, thresholds=thresholds)
    logger.info(f"[DataQuality] Rationale quality: {rationale['quality_score']}%")

    staleness = check_stale_data(db_module, signal_items, stock_tickers, thresholds)
    logger.info(f"[DataQuality] Stale records: {staleness['stale_count']}")

    financials = check_financial_sanity(db_module, stock_tickers, thresholds)
    logger.info(f"[DataQuality] Financial outliers: {financials['outlier_count']}")

    # Collect all alerts
    all_alerts = (
        distribution.get("alerts", [])
        + completeness.get("alerts", [])
        + rationale.get("alerts", [])
        + staleness.get("alerts", [])
        + financials.get("alerts", [])
    )

    report = {
        "date": date_str,
        "run_at": now.isoformat(),
        "distribution_ok": distribution["distribution_ok"],
        "completeness_pct": completeness["completeness_pct"],
        "quality_score": rationale["quality_score"],
        "stale_count": staleness["stale_count"],
        "outlier_count": financials["outlier_count"],
        "alerts": all_alerts,
        "checks": {
            "distribution": distribution,
            "completeness": completeness,
            "rationale": rationale,
            "staleness": staleness,
            "financials": financials,
        },
    }

    logger.info(
        f"[DataQuality] Complete: distribution_ok={distribution['distribution_ok']}, "
        f"completeness={completeness['completeness_pct']}%, "
        f"quality={rationale['quality_score']}%, "
        f"stale={staleness['stale_count']}, outliers={financials['outlier_count']}, "
        f"alerts={len(all_alerts)}"
    )

    return report


def store_quality_report(db_module, report: dict, run_type: str = "scheduled") -> None:
    """Store a quality report in DynamoDB.

    PK: QUALITY#{date}, SK: {run_type}
    """
    from decimal import Decimal

    date_str = report.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))

    item = {
        "PK": f"QUALITY#{date_str}",
        "SK": run_type,
        "distribution_ok": report.get("distribution_ok", False),
        "completeness_pct": Decimal(str(report.get("completeness_pct", 0))),
        "quality_score": Decimal(str(report.get("quality_score", 0))),
        "stale_count": report.get("stale_count", 0),
        "outlier_count": report.get("outlier_count", 0),
        "alerts": report.get("alerts", []),
        "run_at": report.get("run_at", datetime.now(timezone.utc).isoformat()),
        "run_type": run_type,
        # Store full checks as JSON string to avoid DynamoDB nested object limits
        "checks_json": json.dumps(report.get("checks", {}), default=str),
    }

    db_module.put_item(item)
    logger.info(f"[DataQuality] Stored report: QUALITY#{date_str} / {run_type}")


def get_quality_report(db_module, date: str = None, run_type: str = None) -> Optional[dict]:
    """Retrieve a quality report from DynamoDB.

    Args:
        db_module: The db module.
        date: Date string (YYYY-MM-DD). Defaults to today.
        run_type: If specified, get a specific run_type. Otherwise get latest.

    Returns:
        The quality report item, or None.
    """
    if not date:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if run_type:
        return db_module.get_item(f"QUALITY#{date}", run_type)

    # Get latest for that date
    items = db_module.query(
        pk=f"QUALITY#{date}",
        limit=1,
        scan_forward=False,
    )
    if items:
        item = items[0]
        # Inflate checks_json if present
        checks_json = item.get("checks_json")
        if checks_json and isinstance(checks_json, str):
            try:
                item["checks"] = json.loads(checks_json)
            except (json.JSONDecodeError, TypeError):
                pass
        return item
    return None


def run_post_scoring_validation(db_module, run_type: str = "post_scoring") -> dict:
    """Convenience function to run after a scoring cycle and store results.

    Args:
        db_module: The db module.
        run_type: Label for this run (e.g., "post_weekly", "post_daily").

    Returns:
        The quality report.
    """
    report = run_all_checks(db_module)
    store_quality_report(db_module, report, run_type=run_type)
    return report

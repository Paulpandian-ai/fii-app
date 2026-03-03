"""Factor Detail records for DynamoDB — per-factor rationales with sourced evidence.

Record patterns:
  FACTOR#{ticker} / {dimension}#{YYYY-MM-DD}  — Full factor detail with findings
  FACTOR_SUMMARY#{ticker} / LATEST            — Compact summary across all 6 dimensions

TTL: 30 days for FACTOR# records.

Dimensions:
  supply_chain_upstream, supply_chain_downstream, geopolitical,
  monetary, correlations, risk_performance
"""

import logging
import time
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# 6 dimension identifiers matching models.py DIMENSION_FACTOR_MAP
DIMENSIONS = [
    "supply_chain_upstream",
    "supply_chain_downstream",
    "geopolitical",
    "monetary",
    "correlations",
    "risk_performance",
]

DIMENSION_LABELS = {
    "supply_chain_upstream": "Supply Chain (Upstream)",
    "supply_chain_downstream": "Supply Chain (Downstream)",
    "geopolitical": "Geopolitical",
    "monetary": "Monetary Policy",
    "correlations": "Correlations",
    "risk_performance": "Risk & Performance",
}

# Score label thresholds (0-10 scale)
SCORE_LABELS = [
    (8.0, "Strong"),
    (6.5, "Favorable"),
    (4.5, "Neutral"),
    (3.0, "Weak"),
    (0.0, "Caution"),
]

# TTL: 30 days in seconds
FACTOR_DETAIL_TTL_SECONDS = 30 * 24 * 60 * 60


def _score_to_label(score: float) -> str:
    """Map a 0-10 score to a human-readable label."""
    for threshold, label in SCORE_LABELS:
        if score >= threshold:
            return label
    return "Caution"


def write_factor_detail(
    ticker: str,
    dimension: str,
    score: float,
    percentile: int,
    findings: list[dict],
    summary: str,
    beginner_summary: str,
    confidence: str = "Medium",
    data_sources_used: list[str] = None,
) -> dict:
    """Write a FACTOR_DETAIL record to DynamoDB.

    Args:
        ticker: Stock ticker symbol.
        dimension: One of the 6 dimension identifiers.
        score: Dimension score (0-10).
        percentile: Percentile rank (0-100).
        findings: List of finding dicts with claim, source, source_type,
                  source_url, impact, data_date.
        summary: Full explanatory summary.
        beginner_summary: Simplified summary for beginners.
        confidence: "High", "Medium", or "Low".
        data_sources_used: List of data source names.

    Returns:
        The written DynamoDB item.
    """
    import db
    from decimal import Decimal

    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")

    item = {
        "PK": f"FACTOR#{ticker.upper()}",
        "SK": f"{dimension}#{date_str}",
        "ticker": ticker.upper(),
        "dimension": dimension,
        "dimension_label": DIMENSION_LABELS.get(dimension, dimension),
        "score": Decimal(str(round(score, 1))),
        "percentile": percentile,
        "score_label": _score_to_label(score),
        "findings": findings,
        "summary": summary,
        "beginner_summary": beginner_summary,
        "confidence": confidence,
        "data_sources_used": data_sources_used or [],
        "last_updated": now.isoformat(),
        "TTL": int(time.time()) + FACTOR_DETAIL_TTL_SECONDS,
    }

    db.put_item(item)
    logger.info(f"[FACTOR] Wrote detail for {ticker}/{dimension}")
    return item


def write_factor_summary(ticker: str, dimensions: dict[str, dict]) -> dict:
    """Write a compact FACTOR_SUMMARY record for quick API access.

    Args:
        ticker: Stock ticker symbol.
        dimensions: Dict of dimension → {score, percentile, score_label, summary, confidence}.

    Returns:
        The written DynamoDB item.
    """
    import db
    from decimal import Decimal

    now = datetime.now(timezone.utc)

    # Convert scores to Decimal for DynamoDB
    dims_clean = {}
    for dim_key, dim_data in dimensions.items():
        entry = {}
        for k, v in dim_data.items():
            if isinstance(v, float):
                entry[k] = Decimal(str(round(v, 2)))
            else:
                entry[k] = v
        dims_clean[dim_key] = entry

    item = {
        "PK": f"FACTOR_SUMMARY#{ticker.upper()}",
        "SK": "LATEST",
        "ticker": ticker.upper(),
        "dimensions": dims_clean,
        "last_updated": now.isoformat(),
        "data_freshness": now.isoformat(),
    }

    db.put_item(item)
    logger.info(f"[FACTOR] Wrote summary for {ticker}")
    return item


def get_factor_detail(ticker: str, dimension: str) -> Optional[dict]:
    """Get the most recent FACTOR_DETAIL record for a dimension.

    Args:
        ticker: Stock ticker symbol.
        dimension: Dimension identifier.

    Returns:
        The most recent factor detail record, or None.
    """
    import db

    items = db.query(
        pk=f"FACTOR#{ticker.upper()}",
        sk_begins_with=f"{dimension}#",
        limit=1,
        scan_forward=False,  # Most recent first
    )

    return items[0] if items else None


def get_factor_summary(ticker: str) -> Optional[dict]:
    """Get the FACTOR_SUMMARY record for a ticker.

    Args:
        ticker: Stock ticker symbol.

    Returns:
        The summary record, or None.
    """
    import db
    return db.get_item(f"FACTOR_SUMMARY#{ticker.upper()}", "LATEST")


def get_all_factor_details(ticker: str) -> dict[str, dict]:
    """Get the most recent FACTOR_DETAIL records for all 6 dimensions.

    Returns:
        Dict of dimension → factor detail record.
    """
    result = {}
    for dimension in DIMENSIONS:
        detail = get_factor_detail(ticker, dimension)
        if detail:
            result[dimension] = detail
    return result


def build_factor_summary_from_details(ticker: str) -> dict:
    """Build and write a FACTOR_SUMMARY from existing FACTOR_DETAIL records.

    Reads all 6 dimension details and creates a compact summary.
    """
    all_details = get_all_factor_details(ticker)

    dimensions = {}
    for dim_key in DIMENSIONS:
        detail = all_details.get(dim_key)
        if detail:
            dimensions[dim_key] = {
                "score": float(detail.get("score", 5.0)),
                "percentile": int(detail.get("percentile", 50)),
                "score_label": detail.get("score_label", "Neutral"),
                "summary": detail.get("summary", ""),
                "confidence": detail.get("confidence", "Medium"),
            }
        else:
            dimensions[dim_key] = {
                "score": 5.0,
                "percentile": 50,
                "score_label": "Neutral",
                "summary": "Analysis not yet available for this dimension.",
                "confidence": "Low",
            }

    return write_factor_summary(ticker, dimensions)

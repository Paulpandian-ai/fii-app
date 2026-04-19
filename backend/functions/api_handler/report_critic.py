"""Analyst Report Critique Engine.

Compares external analyst reports against FII's multi-factor data
to identify what analysts got right, what they missed, and where
FII data contradicts them.
"""

import hashlib
import json
import logging
import time
from decimal import Decimal
from typing import Optional

logger = logging.getLogger(__name__)

CRITIQUE_CACHE_TTL = 86400  # 24 hours

CRITIQUE_SYSTEM_PROMPT = """You compare analyst reports against FII's multi-factor analysis data. Respond in JSON.

Tasks:
1. Summarize the analyst's key claims
2. Validate claims FII data supports (cite specific numbers)
3. Challenge claims FII data contradicts (cite specific numbers)
4. Identify blind spots the analyst missed
5. Score agreement 0-100

Rules: Cite FII data points. Be balanced. Use "FII data indicates..." framing. Educational only.

JSON format:
{
  "analyst_summary": {"source":"str","rating":"str","price_target":"str|null","key_thesis":"str","key_claims":["str"]},
  "critique": {"agreement_score":72,"agreements":[{"analyst_claim":"str","fii_data":"str","verdict":"CONFIRMED","confidence":"High"}],"contradictions":[{"analyst_claim":"str","fii_data":"str","verdict":"CONTRADICTED","confidence":"High","risk_level":"Material"}],"blind_spots":[{"factor":"str","fii_finding":"str","risk_level":"str","why_it_matters":"str"}]},
  "fii_vs_analyst": {"fii_score":5.5,"fii_label":"str","analyst_rating":"str","alignment":"str","key_difference":"str"},
  "executive_summary": "2-3 paragraph synthesis",
  "disclaimer": "Educational comparison only. Not financial advice."
}"""


def _get_db():
    """Lazy import db module."""
    import db
    return db


def _get_claude_client():
    """Lazy import claude_client module."""
    import claude_client
    return claude_client


def _safe_float(val, default=0.0):
    """Convert Decimal or other numeric types to float safely."""
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _safe_str(val, default="N/A"):
    """Convert value to string safely."""
    if val is None:
        return default
    return str(val)


def _cache_key(ticker: str, report_text: str) -> str:
    """Generate a cache key from ticker and report text prefix."""
    text_hash = hashlib.md5(report_text[:100].encode()).hexdigest()[:12]
    return f"CRITIQUE#{ticker}#{text_hash}"


def _gather_fii_data(ticker: str) -> dict:
    """Gather all FII data for a stock from DynamoDB."""
    db = _get_db()

    logger.info(f"[ReportCritic] Fetching FII data for {ticker}")

    signal = db.get_item(f"SIGNAL#{ticker}", "LATEST") or {}
    logger.info(f"[ReportCritic] Signal: {'found' if signal else 'MISSING'}")

    factor_summary = db.get_item(f"FACTOR_SUMMARY#{ticker}", "LATEST") or {}
    logger.info(f"[ReportCritic] FactorSummary: {'found' if factor_summary else 'MISSING'}")

    financials = db.get_item(f"FINANCIALS#{ticker}", "LATEST") or {}
    logger.info(f"[ReportCritic] Financials: {'found' if financials else 'MISSING'}")

    stress = db.get_item(f"STRESS#{ticker}", "LATEST") or {}
    logger.info(f"[ReportCritic] Stress: {'found' if stress else 'MISSING'}")

    return {
        "signal": signal,
        "factor_summary": factor_summary,
        "financials": financials,
        "stress": stress,
    }


MAX_REPORT_CHARS = 3000


def _extract_fii_context(ticker: str, fii_data: dict) -> str:
    """Build a compact FII context string (~500 tokens)."""
    signal = fii_data.get("signal", {})
    factor_summary = fii_data.get("factor_summary", {})
    financials = fii_data.get("financials", {})
    stress = fii_data.get("stress", {})

    # Signal
    score = _safe_float(signal.get("score"), 0)
    label = _safe_str(signal.get("score_label", signal.get("scoreLabel")), "N/A")
    drivers_raw = signal.get("score_drivers", "[]")
    if isinstance(drivers_raw, str):
        try:
            drivers = json.loads(drivers_raw)
        except Exception:
            drivers = []
    elif isinstance(drivers_raw, list):
        drivers = drivers_raw
    else:
        drivers = []
    top_drivers = ", ".join(str(d) for d in drivers[:3]) if drivers else "None"

    # Factor scores (compact: just score per dimension)
    dims = factor_summary.get("dimensions", {}) or {}
    dim_scores = []
    for dim_key in ["upstream", "downstream", "geopolitical", "monetary", "correlations", "risk_performance"]:
        dim_data = dims.get(dim_key, {}) or {}
        if isinstance(dim_data, dict) and dim_data.get("score") is not None:
            dim_scores.append(f"{dim_key}: {_safe_float(dim_data['score'], 0)}/10")
    factors_line = ", ".join(dim_scores) if dim_scores else "N/A"

    # Financials (compact extraction from nested categories)
    categories = financials.get("categories")
    if isinstance(categories, str):
        try:
            categories = json.loads(categories)
        except Exception:
            categories = {}
    categories = categories or {}

    def _cv(cat: str, key: str):
        try:
            entry = (categories.get(cat) or {}).get(key, {})
            return entry.get("value") if isinstance(entry, dict) else entry
        except Exception:
            return None

    pe = _safe_str(_cv("valuation", "trailing_pe"), "N/A")
    rev_growth = _safe_str(_cv("growth", "revenue_growth_yoy"), "N/A")
    margin = _safe_str(_cv("profitability", "net_margin"), "N/A")
    roe = _safe_str(_cv("profitability", "roe"), "N/A")
    beta = _safe_str(_cv("momentum", "beta"), "N/A")
    de = _safe_str(_cv("health", "debt_to_equity"), "N/A")

    # Stress (compact: just pullback + recession from scenarios list)
    scenarios = stress.get("scenarios", []) or []
    stress_by_id = {}
    if isinstance(scenarios, list):
        for sc in scenarios:
            if isinstance(sc, dict):
                sid = sc.get("id") or sc.get("scenarioKey")
                if sid:
                    stress_by_id[sid] = sc
    pullback_sc = stress_by_id.get("moderate", {})
    recession_sc = stress_by_id.get("recession", {})
    pullback = _safe_str(pullback_sc.get("estimated_impact", pullback_sc.get("priceImpact")), "N/A")
    recession = _safe_str(recession_sc.get("estimated_impact", recession_sc.get("priceImpact")), "N/A")

    return f"""FII Analysis for {ticker}:
- Score: {score}/10 ({label})
- P/E: {pe}, Rev Growth: {rev_growth}%, Net Margin: {margin}%
- ROE: {roe}%, Debt/Equity: {de}, Beta: {beta}
- Factors: {factors_line}
- Stress: Pullback {pullback}%, Recession {recession}%
- Top drivers: {top_drivers}"""


def _build_user_message(report_text: str, ticker: str, fii_data: dict) -> str:
    """Assemble the user message with analyst report + compact FII data."""
    fii_context = _extract_fii_context(ticker, fii_data)
    cleaned_report = " ".join(report_text.split())[:MAX_REPORT_CHARS]
    return f"""[ANALYST REPORT]
{cleaned_report}

[FII DATA]
{fii_context}

Critique this analyst report against FII data above."""


def _parse_critique_response(text: str) -> dict:
    """Parse Claude's JSON response, handling markdown code blocks."""
    cleaned = text.strip()

    # Strip markdown code fences if present
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        # Remove first line (```json or ```)
        lines = lines[1:]
        # Remove last line (```)
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to find JSON object in the text
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                return json.loads(cleaned[start:end])
            except json.JSONDecodeError:
                pass

    logger.error("Failed to parse critique response as JSON")
    return {
        "error": "Failed to parse critique response",
        "raw_response": text[:500],
    }


def _validate_critique(result: dict) -> dict:
    """Validate and ensure the critique has the expected structure."""
    if "error" in result:
        return result

    # Ensure top-level keys exist
    defaults = {
        "analyst_summary": {
            "source": "Unknown",
            "rating": "Unknown",
            "price_target": None,
            "key_thesis": "",
            "key_claims": [],
        },
        "critique": {
            "agreement_score": 50,
            "agreements": [],
            "contradictions": [],
            "blind_spots": [],
        },
        "fii_vs_analyst": {
            "fii_score": 0,
            "fii_label": "N/A",
            "analyst_rating": "Unknown",
            "alignment": "",
            "key_difference": "",
        },
        "executive_summary": "",
        "disclaimer": "This critique compares third-party analysis against FII's factor data for educational purposes. It is not investment advice and should not be used as the sole basis for investment decisions.",
    }

    for key, default_val in defaults.items():
        if key not in result:
            result[key] = default_val
        elif isinstance(default_val, dict):
            for sub_key, sub_default in default_val.items():
                if sub_key not in result[key]:
                    result[key][sub_key] = sub_default

    # Clamp agreement score
    if "critique" in result and "agreement_score" in result["critique"]:
        score = result["critique"]["agreement_score"]
        result["critique"]["agreement_score"] = max(0, min(100, int(score)))

    return result


def critique_analyst_report(report_text: str, ticker: str, source: Optional[str] = None, report_pdf_base64: Optional[str] = None) -> dict:
    """Critique an analyst report against FII's multi-factor data.

    Args:
        report_text: Plain text of the analyst report (max 15,000 chars).
        ticker: Stock ticker symbol (e.g. "LLY").
        source: Optional source name (e.g. "Morgan Stanley").
        report_pdf_base64: Optional base64-encoded PDF of the analyst report.

    Returns:
        Dict with analyst_summary, critique, fii_vs_analyst, executive_summary, disclaimer.
    """
    db = _get_db()
    cc = _get_claude_client()
    ticker = ticker.upper().strip()

    # Check cache first
    cache_text = report_pdf_base64[:100] if report_pdf_base64 else report_text
    cache_sk = _cache_key(ticker, cache_text)
    try:
        cached = db.get_item("CRITIQUE_CACHE", cache_sk)
        if cached and cached.get("expires_at", 0) > int(time.time()):
            logger.info(f"[ReportCritic] Cache hit for {ticker}")
            result = json.loads(cached["result"]) if isinstance(cached["result"], str) else cached["result"]
            return result
    except Exception as e:
        logger.warning(f"[ReportCritic] Cache lookup failed: {e}")

    # Step 1: Gather FII data
    fii_data = _gather_fii_data(ticker)

    # Step 2: Build the user message with compact FII data context
    fii_context = _extract_fii_context(ticker, fii_data)
    source_hint = f"[Source: {source}] " if source else ""

    if report_pdf_base64:
        user_content = [
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": report_pdf_base64,
                },
            },
            {
                "type": "text",
                "text": f"{source_hint}[FII DATA]\n{fii_context}\n\nCritique this analyst report against FII data above.",
            },
        ]
    else:
        user_message = _build_user_message(report_text, ticker, fii_data)
        if source:
            user_message = f"{source_hint}\n{user_message}"
        user_content = user_message

    # Step 3: Call Claude Haiku for fast critique (under 30s API Gateway limit)
    client = cc._get_client()
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1500,
        system=CRITIQUE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    response_text = message.content[0].text

    # Step 4: Parse and validate
    result = _parse_critique_response(response_text)
    result = _validate_critique(result)

    # Ensure disclaimer is always present
    if "disclaimer" not in result or not result["disclaimer"]:
        result["disclaimer"] = (
            "This critique compares third-party analysis against FII's factor data "
            "for educational purposes. It is not investment advice and should not be "
            "used as the sole basis for investment decisions."
        )

    # Cache the result
    try:
        cache_item = {
            "PK": "CRITIQUE_CACHE",
            "SK": cache_sk,
            "result": json.dumps(result, default=str),
            "ticker": ticker,
            "expires_at": int(time.time()) + CRITIQUE_CACHE_TTL,
        }
        db.put_item(cache_item)
        logger.info(f"[ReportCritic] Cached critique for {ticker}")
    except Exception as e:
        logger.warning(f"[ReportCritic] Cache write failed: {e}")

    return result

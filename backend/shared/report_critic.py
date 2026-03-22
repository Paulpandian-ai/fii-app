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

CRITIQUE_SYSTEM_PROMPT = """You are an investment research analyst critique engine. You compare \
third-party analyst reports against FII's proprietary multi-factor \
analysis to provide an independent second opinion.

Your job is to:
1. SUMMARIZE the analyst's key claims and recommendations
2. VALIDATE claims that FII data supports (with specific data points)
3. CHALLENGE claims that FII data contradicts (with specific data points)
4. IDENTIFY BLIND SPOTS — important factors the analyst missed entirely
5. Provide an overall AGREEMENT SCORE (0-100) showing how much \
   FII data aligns with the analyst's thesis

RULES:
- Always cite specific FII data (scores, metrics, percentages)
- Be balanced — acknowledge what the analyst got right
- Focus on factual data points, not opinions
- Highlight supply chain, geopolitical, and macro risks that \
  traditional analysts often underweight
- Use educational framing: "FII data indicates..." not "you should..."
- End with educational disclaimer

OUTPUT FORMAT (respond in JSON):
{
  "analyst_summary": {
    "source": "detected source name or Unknown",
    "rating": "detected rating (Buy/Hold/Sell/Overweight/etc)",
    "price_target": "detected target or null",
    "key_thesis": "2-3 sentence summary of analyst's main argument",
    "key_claims": ["claim 1", "claim 2", "claim 3"]
  },
  "critique": {
    "agreement_score": 72,
    "agreements": [
      {
        "analyst_claim": "Strong revenue growth driven by AI demand",
        "fii_data": "Revenue growth 44.7% YoY confirmed by SEC EDGAR data",
        "verdict": "CONFIRMED",
        "confidence": "High"
      }
    ],
    "contradictions": [
      {
        "analyst_claim": "Limited geopolitical risk exposure",
        "fii_data": "FII Geopolitical score: 4/10. Trade Barriers impact -2.0, 25% China revenue exposure per 10-K",
        "verdict": "CONTRADICTED",
        "confidence": "High",
        "risk_level": "Material"
      }
    ],
    "blind_spots": [
      {
        "factor": "Supply Chain Concentration",
        "fii_finding": "Top 3 suppliers account for 65% of critical components (FII upstream score: 6/10)",
        "risk_level": "Moderate",
        "why_it_matters": "A single supplier disruption could impact 20%+ of production capacity"
      }
    ]
  },
  "fii_vs_analyst": {
    "fii_score": 5.5,
    "fii_label": "Neutral",
    "analyst_rating": "Buy",
    "alignment": "FII is more cautious than the analyst",
    "key_difference": "Analyst underweights geopolitical and supply chain risks that FII identifies as material"
  },
  "executive_summary": "2-3 paragraph synthesis of the critique",
  "disclaimer": "This critique compares third-party analysis against FII's factor data for educational purposes. It is not investment advice and should not be used as the sole basis for investment decisions."
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

    # Fetch signal data
    signal = db.get_item(f"SIGNAL#{ticker}", "LATEST") or {}

    # Fetch factor summary
    factor_summary = db.get_item(f"FACTOR_SUMMARY#{ticker}", "LATEST") or {}

    # Fetch financial metrics
    financials = db.get_item(f"FINANCIALS#{ticker}", "LATEST") or {}

    # Fetch stress test
    stress = db.get_item(f"STRESS#{ticker}", "LATEST") or {}

    return {
        "signal": signal,
        "factor_summary": factor_summary,
        "financials": financials,
        "stress": stress,
    }


def _build_user_message(report_text: str, ticker: str, fii_data: dict) -> str:
    """Assemble the user message with analyst report + FII data."""
    signal = fii_data.get("signal", {})
    factors = fii_data.get("factor_summary", {})
    financials = fii_data.get("financials", {})
    stress = fii_data.get("stress", {})

    score = _safe_float(signal.get("score"), 0)
    label = _safe_str(signal.get("score_label", signal.get("scoreLabel")), "N/A")

    # Factor dimension scores and summaries
    dimensions = [
        ("Supply Chain Upstream", "upstream_score", "upstream_summary"),
        ("Supply Chain Downstream", "downstream_score", "downstream_summary"),
        ("Geopolitical", "geopolitical_score", "geopolitical_summary"),
        ("Monetary", "monetary_score", "monetary_summary"),
        ("Correlations", "correlations_score", "correlations_summary"),
        ("Risk & Performance", "risk_performance_score", "risk_performance_summary"),
    ]

    factor_lines = []
    for dim_name, score_key, summary_key in dimensions:
        dim_score = _safe_float(factors.get(score_key), 0)
        dim_summary = _safe_str(factors.get(summary_key), "No data")
        factor_lines.append(f"  {dim_name}: {dim_score}/10 - {dim_summary}")

    factor_block = "\n".join(factor_lines)

    # Financial metrics
    pe = _safe_str(financials.get("pe_ratio", financials.get("peRatio")), "N/A")
    rev_growth = _safe_str(financials.get("revenue_growth", financials.get("revenueGrowth")), "N/A")
    margin = _safe_str(financials.get("net_margin", financials.get("netMargin")), "N/A")
    roe = _safe_str(financials.get("roe", financials.get("returnOnEquity")), "N/A")
    de = _safe_str(financials.get("debt_to_equity", financials.get("debtToEquity")), "N/A")
    beta = _safe_str(financials.get("beta"), "N/A")

    # Stress test scenarios
    moderate = _safe_str(stress.get("moderate", stress.get("market_pullback")), "N/A")
    recession = _safe_str(stress.get("recession"), "N/A")
    severe = _safe_str(stress.get("severe", stress.get("severe_crisis")), "N/A")
    sector = _safe_str(stress.get("sector", stress.get("sector_shock")), "N/A")

    # Clean up report text (strip excess whitespace)
    cleaned_report = " ".join(report_text.split())

    return f"""[ANALYST REPORT]
{cleaned_report}

[FII DATA FOR {ticker}]
FII Score: {score}/10 ({label})
Factor Scores:
{factor_block}

Key Financial Metrics:
  P/E: {pe}, Revenue Growth: {rev_growth}%, Net Margin: {margin}%
  ROE: {roe}%, Debt/Equity: {de}, Beta: {beta}

Stress Test:
  Market Pullback: {moderate}%
  Recession: {recession}%
  Severe Crisis: {severe}%
  Sector Shock: {sector}%

Please critique this analyst report against the FII data above."""


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


def critique_analyst_report(report_text: str, ticker: str, source: Optional[str] = None) -> dict:
    """Critique an analyst report against FII's multi-factor data.

    Args:
        report_text: Plain text of the analyst report (max 15,000 chars).
        ticker: Stock ticker symbol (e.g. "LLY").
        source: Optional source name (e.g. "Morgan Stanley").

    Returns:
        Dict with analyst_summary, critique, fii_vs_analyst, executive_summary, disclaimer.
    """
    db = _get_db()
    cc = _get_claude_client()
    ticker = ticker.upper().strip()

    # Check cache first
    cache_sk = _cache_key(ticker, report_text)
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

    # Step 2: Build the user message
    user_message = _build_user_message(report_text, ticker, fii_data)

    # If source is provided, prepend it to help Claude identify the source
    if source:
        user_message = f"[SOURCE HINT: This report is from {source}]\n\n{user_message}"

    # Step 3: Call Claude Sonnet for high-quality critique
    client = cc._get_client()
    message = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=4096,
        system=CRITIQUE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
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

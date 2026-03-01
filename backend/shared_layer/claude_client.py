"""Claude API wrapper for FII signal analysis.

Provides factor scoring (18 factors A1-F3), reasoning generation,
and alternative stock suggestions. Uses the Anthropic SDK with
API key from AWS Secrets Manager.
"""

import json
import logging
import os
from typing import Optional

import boto3

logger = logging.getLogger(__name__)

_secrets_client = boto3.client("secretsmanager")
_api_key: Optional[str] = None


def _get_api_key() -> str:
    """Retrieve Claude API key from Secrets Manager (cached)."""
    global _api_key
    if _api_key is None:
        arn = os.environ.get("CLAUDE_API_KEY_ARN", "")
        response = _secrets_client.get_secret_value(SecretId=arn)
        _api_key = response["SecretString"]
    return _api_key


def _get_client():
    """Create an Anthropic client with the cached API key."""
    import anthropic
    return anthropic.Anthropic(api_key=_get_api_key())


# ─── Factor Scoring ───

EDUCATIONAL_SYSTEM_PREAMBLE = """You are an educational financial analysis assistant for Factor Impact Intelligence (FII). You provide factual, data-driven analysis of publicly available market data. Important rules:
* NEVER say 'buy', 'sell', 'hold', or 'recommend'
* NEVER provide personalized investment advice
* Frame all analysis as: 'The data shows...', 'Factor analysis indicates...', 'Historically, stocks with these characteristics...'
* End every analysis with: 'For educational purposes only. Not investment advice.'
* Use score labels: Strong, Favorable, Neutral, Weak, Caution
* NEVER use: BUY, HOLD, SELL"""

FACTOR_SCORING_PROMPT = """You are an educational financial analysis assistant for Factor Impact Intelligence. Given the following data about {ticker}:

SUPPLY CHAIN DATA:
{supply_chain}

MACRO INDICATORS (FRED):
{macro_data}

MARKET DATA (Yahoo Finance):
{market_data}

CORRELATION MATRIX:
{correlations}

Score each of the 18 factors below from -2 to +2 (integers or half-steps like -1.5).
Provide a one-sentence reason for each score.

MICRO WEB — Upstream Suppliers:
  A1: Operational Disruption (supplier operational issues affecting the company)
  A2: Supplier Earnings Miss (key suppliers missing earnings or showing weakness)
  A3: Lead Time Extensions (supply chain delays or improvements)

MICRO WEB — Downstream Customers:
  B1: CapEx Guidance Changes (major customers changing capital spending plans)
  B2: Contract Updates (new wins, renewals, or contract losses)
  B3: Customer Revenue Growth (health of customer base)

MACRO CLIMATE — Geopolitics:
  C1: Physical Conflict (wars, tensions affecting operations/supply)
  C2: Trade Barriers (tariffs, sanctions, export controls)
  C3: Logistics Disruption (shipping, ports, global supply chains)

MACRO CLIMATE — Monetary:
  D1: Fed Decisions (interest rate impact on the company)
  D2: CPI/Inflation (inflation effects on costs and pricing power)
  D3: 10Y Treasury Yield (discount rate impact on valuation)

MARKET PHYSICS — Correlations:
  E1: Sector Peers (relative performance vs sector peers)
  E2: Commodity Link (exposure to commodity price movements)
  E3: Risk Sentiment (market risk appetite and correlation to broad market)

MARKET PHYSICS — Risk & Performance:
  F1: EPS Surprise (recent earnings surprise and trajectory)
  F2: Guidance Revision (forward guidance direction)
  F3: Beta/Volatility (risk-adjusted return profile)

Return JSON only in this exact format:
{{
  "A1": {{"score": 0, "reason": "..."}},
  "A2": {{"score": 0, "reason": "..."}},
  ...
  "F3": {{"score": 0, "reason": "..."}}
}}"""


def score_factors(
    ticker: str,
    supply_chain: dict,
    macro_data: dict,
    market_data: dict,
    correlations: dict,
) -> dict:
    """Send all data to Claude for 18-factor scoring.

    Args:
        ticker: Stock ticker symbol.
        supply_chain: SEC EDGAR extraction results.
        macro_data: FRED macro indicators.
        market_data: Yahoo Finance market data.
        correlations: Correlation matrix data.

    Returns:
        Dict mapping factor IDs (A1-F3) to {score, reason}.
    """
    try:
        client = _get_client()

        prompt = FACTOR_SCORING_PROMPT.format(
            ticker=ticker,
            supply_chain=json.dumps(supply_chain, indent=2, default=str),
            macro_data=json.dumps(macro_data, indent=2, default=str),
            market_data=json.dumps(market_data, indent=2, default=str),
            correlations=json.dumps(correlations, indent=2, default=str),
        )

        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=4096,
            system=EDUCATIONAL_SYSTEM_PREAMBLE,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text
        factor_scores = _parse_json_response(response_text)

        # Validate and clamp scores
        validated = {}
        from models import FACTOR_IDS
        for fid in FACTOR_IDS:
            entry = factor_scores.get(fid, {"score": 0, "reason": "No data available"})
            score = float(entry.get("score", 0))
            score = max(-2.0, min(2.0, score))
            validated[fid] = {
                "score": score,
                "reason": str(entry.get("reason", "No data available")),
            }

        return validated

    except Exception as e:
        logger.error(f"[Claude] Factor scoring failed for {ticker}: {e}")
        from models import FACTOR_IDS
        return {
            fid: {"score": 0, "reason": "Scoring unavailable"}
            for fid in FACTOR_IDS
        }


# ─── Reasoning Generation ───

REASONING_PROMPT = """Write an 80-120 word educational stock analysis for retail investors.

Ticker: {ticker}
Company: {company_name}
FII Score: {score}/10
Score Label: {signal}
Top positives: {positives}
Top negatives: {negatives}

Be punchy and specific. Mention specific companies, data points, and numbers.
Write in present tense. Explain what the data shows factually.
Do NOT provide personalized investment advice or recommendations to buy, sell, or hold.
Start with the most important insight. End with a forward-looking statement.
End with: 'For educational purposes only. Not investment advice.'"""


def generate_reasoning(
    ticker: str,
    company_name: str,
    score: float,
    signal: str,
    factor_details: dict,
) -> str:
    """Generate an 80-120 word punchy stock analysis.

    Args:
        ticker: Stock ticker symbol.
        company_name: Full company name.
        score: Composite score (1-10).
        signal: BUY/HOLD/SELL.
        factor_details: All 18 factor scores with reasons.

    Returns:
        Reasoning text (80-120 words).
    """
    try:
        client = _get_client()

        # Extract top positives and negatives
        sorted_factors = sorted(
            factor_details.items(),
            key=lambda x: x[1]["score"],
            reverse=True,
        )
        positives = [
            f"{fid}: {d['reason']} (score: {d['score']})"
            for fid, d in sorted_factors[:3]
            if d["score"] > 0
        ]
        negatives = [
            f"{fid}: {d['reason']} (score: {d['score']})"
            for fid, d in sorted_factors[-3:]
            if d["score"] < 0
        ]

        prompt = REASONING_PROMPT.format(
            ticker=ticker,
            company_name=company_name,
            score=score,
            signal=signal,
            positives="; ".join(positives) if positives else "None identified",
            negatives="; ".join(negatives) if negatives else "None identified",
        )

        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=300,
            system=EDUCATIONAL_SYSTEM_PREAMBLE,
            messages=[{"role": "user", "content": prompt}],
        )

        return message.content[0].text.strip()

    except Exception as e:
        logger.error(f"[Claude] Reasoning generation failed for {ticker}: {e}")
        return f"Analysis for {ticker} is currently being processed. For educational purposes only. Not investment advice."


# ─── News-Aware Reasoning Generation ───

REASONING_WITH_NEWS_PROMPT = """Write an 80-120 word educational stock analysis for retail investors.

Ticker: {ticker}
Company: {company_name}
FII Score: {score}/10
Score Label: {signal}
Top positives: {positives}
Top negatives: {negatives}
{news_context}
Be punchy and specific. Mention specific companies, data points, and numbers.
Write in present tense. Explain what the data shows factually.
Do NOT provide personalized investment advice or recommendations to buy, sell, or hold.
Incorporate the recent news into your analysis where relevant.
Start with the most important insight. End with a forward-looking statement.
End with: 'For educational purposes only. Not investment advice.'"""


def generate_reasoning_with_news(
    ticker: str,
    company_name: str,
    score: float,
    signal: str,
    factor_details: dict,
    recent_news: list[dict] | None = None,
) -> str:
    """Generate an 80-120 word analysis incorporating recent news.

    Falls back to the standard reasoning prompt when no news is available.

    Args:
        ticker: Stock ticker symbol.
        company_name: Full company name.
        score: Composite score (1-10).
        signal: BUY/HOLD/SELL.
        factor_details: All 18 factor scores with reasons.
        recent_news: List of dicts with headline, date, impact, direction, summary.

    Returns:
        Reasoning text (80-120 words).
    """
    if not recent_news:
        return generate_reasoning(
            ticker=ticker,
            company_name=company_name,
            score=score,
            signal=signal,
            factor_details=factor_details,
        )

    try:
        client = _get_client()

        # Extract top positives and negatives
        sorted_factors = sorted(
            factor_details.items(),
            key=lambda x: x[1]["score"],
            reverse=True,
        )
        positives = [
            f"{fid}: {d['reason']} (score: {d['score']})"
            for fid, d in sorted_factors[:3]
            if d["score"] > 0
        ]
        negatives = [
            f"{fid}: {d['reason']} (score: {d['score']})"
            for fid, d in sorted_factors[-3:]
            if d["score"] < 0
        ]

        # Build news context block
        news_lines = []
        for n in recent_news[:5]:
            line = f"- {n.get('date', 'recent')}: {n.get('headline', '')}"
            if n.get("summary"):
                line += f" — {n['summary']}"
            if n.get("impact"):
                line += f" [{n['impact']} impact, {n.get('direction', 'neutral')}]"
            news_lines.append(line)
        news_context = (
            "\nRecent news for " + ticker + ":\n" + "\n".join(news_lines) + "\n"
            if news_lines
            else ""
        )

        prompt = REASONING_WITH_NEWS_PROMPT.format(
            ticker=ticker,
            company_name=company_name,
            score=score,
            signal=signal,
            positives="; ".join(positives) if positives else "None identified",
            negatives="; ".join(negatives) if negatives else "None identified",
            news_context=news_context,
        )

        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=300,
            system=EDUCATIONAL_SYSTEM_PREAMBLE,
            messages=[{"role": "user", "content": prompt}],
        )

        return message.content[0].text.strip()

    except Exception as e:
        logger.error(f"[Claude] News-aware reasoning failed for {ticker}: {e}")
        # Fall back to standard reasoning
        return generate_reasoning(
            ticker=ticker,
            company_name=company_name,
            score=score,
            signal=signal,
            factor_details=factor_details,
        )


# ─── Alternatives Generation ───

ALTERNATIVES_PROMPT = """Given that {ticker} ({company_name}) has a score label of {signal} with a score of {score}/10,
suggest educational comparisons for analysis.

Type A: List 3 same-sector peers that may have stronger factor profiles. For each, explain in one sentence why the data may be more favorable.
Type B: List 2-3 ETFs or instruments that provide different risk exposure compared to {ticker}.

Key risk factors: {risks}

Return JSON only:
{{
  "peers": [
    {{"ticker": "...", "reason": "...", "estimated_score_range": "7-8"}}
  ],
  "hedges": [
    {{"ticker": "...", "type": "inverse_etf|diversifier|sector_etf", "reason": "..."}}
  ]
}}"""


def generate_alternatives(
    ticker: str,
    company_name: str,
    signal: str,
    score: float,
    factor_details: dict,
) -> list[dict]:
    """Generate alternative suggestions for SELL or weak HOLD signals.

    Only generates alternatives when signal is SELL or HOLD with score <= 4.

    Args:
        ticker: Stock ticker symbol.
        company_name: Full company name.
        signal: BUY/HOLD/SELL.
        score: Composite score (1-10).
        factor_details: All 18 factor scores with reasons.

    Returns:
        List of Alternative dicts.
    """
    # Only generate alternatives for weak/caution scores (4 or below)
    if score > 4:
        return []

    try:
        client = _get_client()

        # Identify key risks
        risks = [
            f"{fid}: {d['reason']}"
            for fid, d in factor_details.items()
            if d["score"] < 0
        ]

        prompt = ALTERNATIVES_PROMPT.format(
            ticker=ticker,
            company_name=company_name,
            signal=signal,
            score=score,
            risks="; ".join(risks[:5]) if risks else "General market risk",
        )

        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=1024,
            system=EDUCATIONAL_SYSTEM_PREAMBLE,
            messages=[{"role": "user", "content": prompt}],
        )

        result = _parse_json_response(message.content[0].text)

        alternatives = []
        for peer in result.get("peers", []):
            alternatives.append({
                "ticker": peer.get("ticker", ""),
                "company_name": "",
                "score": 0,
                "signal": "Favorable",
                "reason": peer.get("reason", ""),
                "alt_type": "same_sector_peer",
            })
        for hedge in result.get("hedges", []):
            alternatives.append({
                "ticker": hedge.get("ticker", ""),
                "company_name": "",
                "score": 0,
                "signal": "Neutral",
                "reason": hedge.get("reason", ""),
                "alt_type": "inverse_hedge",
            })

        return alternatives

    except Exception as e:
        logger.error(f"[Claude] Alternatives generation failed for {ticker}: {e}")
        return []


# ─── Legacy Interface ───

def analyze_stock(
    ticker: str,
    factor_data: dict,
    system_prompt: Optional[str] = None,
) -> dict:
    """Legacy interface — delegates to score_factors + generate_reasoning."""
    factor_scores = score_factors(
        ticker=ticker,
        supply_chain=factor_data.get("supply_chain", {}),
        macro_data=factor_data.get("macro_data", {}),
        market_data=factor_data.get("market_data", {}),
        correlations=factor_data.get("correlations", {}),
    )

    from models import compute_composite_score, determine_signal
    scores_only = {fid: d["score"] for fid, d in factor_scores.items()}
    composite = compute_composite_score(scores_only)
    signal = determine_signal(composite)

    reasoning = generate_reasoning(
        ticker=ticker,
        company_name=factor_data.get("company_name", ticker),
        score=composite,
        signal=signal.value,
        factor_details=factor_scores,
    )

    return {
        "composite_score": composite,
        "signal": signal.value,
        "insight": reasoning[:200] if len(reasoning) > 200 else reasoning,
        "reasoning": reasoning,
        "factor_scores": factor_scores,
    }


def generate_coaching_insight(
    portfolio_actions: list[dict],
    bias_context: str,
) -> dict:
    """Generate behavioral coaching insight from trading patterns."""
    # Placeholder — will be implemented in Prompt 6
    return {
        "insight": "Coaching insights coming soon.",
        "recommendations": [],
    }


# ─── Helpers ───

def _parse_json_response(text: str) -> dict:
    """Parse JSON from Claude response, handling markdown wrapping."""
    json_text = text
    if "```json" in json_text:
        json_text = json_text.split("```json")[1].split("```")[0]
    elif "```" in json_text:
        json_text = json_text.split("```")[1].split("```")[0]

    return json.loads(json_text.strip())

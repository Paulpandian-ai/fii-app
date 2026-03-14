"""AI Coach Module for FII.

Context-aware investment education coach powered by Claude that uses the
user's portfolio data, stock analysis, tax opportunities, and factor scores
to provide educational responses.

Functions:
  - generate_coach_response(user_message, context) — Main chat response
  - generate_proactive_insights(portfolio, analytics) — Unsolicited insights
  - generate_suggestion_chips(context) — Contextual suggestion chips
"""

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

import boto3

logger = logging.getLogger(__name__)

_secrets_client = boto3.client("secretsmanager")
_api_key: Optional[str] = None

COACH_DISCLAIMER = "AI-generated educational analysis. Not investment advice."

COACH_SYSTEM_PROMPT = """You are an AI investment education coach inside the Prismvest app.
You help users understand their portfolio and stocks using data from our multi-factor analysis engine.

RULES:
- Provide EDUCATIONAL analysis, never personalized advice
- Never say 'you should buy/sell' — say 'the data suggests' or 'factor analysis indicates'
- Always cite specific data: scores, metrics, percentiles
- Frame risk in dollar amounts ($10K investment → $X potential impact)
- Explain complex concepts with everyday analogies
- Reference FII factor scores when discussing stocks
- Reference Sharpe ratio, diversification score when discussing portfolio
- Keep responses to 2-3 paragraphs max
- End substantive responses with: 'For educational purposes only. Not investment advice.'
- Be conversational, warm, but data-driven
- If you don't have data for something, say so honestly"""


def _get_api_key() -> str:
    """Retrieve Claude API key from Secrets Manager (cached)."""
    global _api_key
    if _api_key is not None:
        return _api_key

    # Try env var first
    env_key = os.environ.get("CLAUDE_API_KEY", "")
    if env_key:
        _api_key = env_key
        return _api_key

    # Try Secrets Manager
    arn = os.environ.get("CLAUDE_API_KEY_ARN", "")
    if arn:
        response = _secrets_client.get_secret_value(SecretId=arn)
        _api_key = response["SecretString"]
        return _api_key

    raise RuntimeError("Claude API key not configured")


def _get_client():
    """Create an Anthropic client."""
    import anthropic
    return anthropic.Anthropic(api_key=_get_api_key())


def _format_portfolio_context(context: dict) -> str:
    """Format portfolio data into a concise context string for Claude."""
    parts = []

    # Portfolio holdings summary
    holdings = context.get("portfolio_holdings", [])
    if holdings:
        lines = []
        total_value = 0
        for h in holdings[:20]:  # Cap at 20 to stay within context
            ticker = h.get("ticker", "?")
            shares = h.get("shares", 0)
            gain_pct = h.get("gainLossPercent", h.get("gain_pct", 0))
            value = h.get("totalValue", h.get("value", 0))
            total_value += value
            sign = "+" if gain_pct >= 0 else ""
            lines.append(f"  {ticker}: {shares} shares, ${value:,.0f} ({sign}{gain_pct:.1f}%)")

        parts.append("[PORTFOLIO]\n" + "\n".join(lines))

        # Analytics summary
        analytics = context.get("portfolio_analytics", {})
        if analytics:
            risk = analytics.get("risk_metrics", {})
            div = analytics.get("diversification", {})
            sharpe = risk.get("sharpe_ratio", {})
            sortino = risk.get("sortino_ratio", {})
            beta = risk.get("portfolio_beta", "N/A")
            var_data = risk.get("var_95_monthly", {})

            analytics_line = f"Value: ${analytics.get('portfolio_value', total_value):,.0f}"
            if sharpe.get("value") is not None:
                analytics_line += f" | Sharpe: {sharpe['value']}"
                if sharpe.get("benchmark"):
                    analytics_line += f" (S&P: {sharpe['benchmark']})"
            if sortino.get("value") is not None:
                analytics_line += f" | Sortino: {sortino['value']}"
            if beta and beta != "N/A":
                analytics_line += f" | Beta: {beta}"
            if div.get("score") is not None:
                analytics_line += f" | Diversification: {div['score']}/100 ({div.get('rating', '')})"
            if var_data.get("dollars"):
                analytics_line += f" | Monthly VaR: ${abs(var_data['dollars']):,.0f}"

            parts.append(analytics_line)

            # Diversification recommendations
            recs = div.get("recommendations", [])
            if recs:
                parts.append("Diversification notes: " + "; ".join(recs[:3]))

    # Stock context if a specific ticker is being discussed
    signal = context.get("stock_signal", {})
    if signal:
        ticker = signal.get("ticker", "")
        score = signal.get("compositeScore", signal.get("composite_score", "N/A"))
        label = signal.get("score_label", signal.get("signal", "N/A"))
        insight = signal.get("insight", "")

        stock_line = f"\n[STOCK CONTEXT — {ticker}]\n"
        stock_line += f"FII Score: {score}/10 ({label})"

        # Factor summary
        factors = context.get("factor_summary", {})
        if factors:
            factor_parts = []
            for dim_name, dim_data in factors.items():
                if isinstance(dim_data, dict) and "score" in dim_data:
                    factor_parts.append(f"{dim_name}: {dim_data['score']}/10")
            if factor_parts:
                stock_line += f"\nFactors: {', '.join(factor_parts)}"

        if insight:
            stock_line += f"\nInsight: {insight[:200]}"

        # Stress test data
        stress = context.get("stress_test", {})
        if stress:
            scenarios = stress.get("scenarios", [])
            if scenarios:
                worst = min(scenarios, key=lambda s: s.get("impact_pct", 0))
                stock_line += (
                    f"\nStress test worst case: {worst.get('name', 'severe')}: "
                    f"{worst.get('impact_pct', 0):.1f}%"
                )

        parts.append(stock_line)

    # Tax context
    tax = context.get("tax_opportunities", {})
    if tax:
        total_losses = tax.get("total_unrealized_losses", 0)
        if total_losses < 0:
            benefit = tax.get("estimated_total_benefit", "$0")
            parts.append(
                f"\n[TAX] ${abs(total_losses):,.0f} unrealized losses available. "
                f"Estimated tax benefit: {benefit}"
            )

    return "\n".join(parts)


def _format_conversation_history(history: list[dict]) -> list[dict]:
    """Format conversation history for Claude messages API."""
    messages = []
    for msg in history[-10:]:  # Last 10 messages
        role = msg.get("role", "user")
        content = msg.get("content", msg.get("message", ""))
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    return messages


# ─── Part A: Context-Aware Coach Engine ───


def generate_coach_response(user_message: str, context: dict) -> dict:
    """Generate a context-aware coach response using Claude.

    Args:
        user_message: The user's question or message.
        context: Dict with keys:
            - portfolio_holdings: positions with P&L
            - portfolio_analytics: Sharpe, diversification (pre-computed)
            - tax_opportunities: current TLH opportunities
            - stock_signal: if asking about specific stock, its signal data
            - factor_summary: 6-dimension factors for the stock
            - stress_test: stress results for the stock
            - conversation_history: last 10 messages

    Returns:
        Dict with response, follow_up_suggestions, and disclaimer.
    """
    try:
        client = _get_client()

        # Build context-enriched prompt
        portfolio_context = _format_portfolio_context(context)

        enriched_message = ""
        if portfolio_context:
            enriched_message += portfolio_context + "\n\n"
        enriched_message += f"[QUESTION] {user_message}"

        # Build conversation messages
        messages = _format_conversation_history(
            context.get("conversation_history", [])
        )

        # Add the current user message with full context
        messages.append({"role": "user", "content": enriched_message})

        # Call Claude Haiku for fast, cheap responses
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=[
                {
                    "type": "text",
                    "text": COACH_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=messages,
        )

        response_text = message.content[0].text.strip()

        # Generate follow-up suggestions based on context
        suggestions = _generate_follow_ups(user_message, context)

        return {
            "response": response_text,
            "follow_up_suggestions": suggestions,
            "model": "claude-haiku-4-5-20251001",
            "disclaimer": COACH_DISCLAIMER,
        }

    except Exception as e:
        logger.error(f"[Coach] Response generation failed: {e}")
        return {
            "response": (
                "I'm having trouble analyzing your data right now. "
                "Try again in a moment, or ask a simpler question. "
                "For educational purposes only. Not investment advice."
            ),
            "follow_up_suggestions": [
                "How diversified am I?",
                "What are my tax opportunities?",
                "Explain my portfolio risk",
            ],
            "error": str(e),
            "disclaimer": COACH_DISCLAIMER,
        }


def _generate_follow_ups(user_message: str, context: dict) -> list[str]:
    """Generate contextual follow-up suggestion chips."""
    suggestions = []
    msg_lower = user_message.lower()

    # Stock-specific follow-ups
    signal = context.get("stock_signal", {})
    if signal:
        ticker = signal.get("ticker", "")
        if ticker:
            if "risk" not in msg_lower:
                suggestions.append(f"What are the risks for {ticker}?")
            if "factor" not in msg_lower and "score" not in msg_lower:
                suggestions.append(f"Explain {ticker}'s factor scores")
            if "stress" not in msg_lower:
                suggestions.append(f"How would {ticker} do in a recession?")

    # Portfolio follow-ups
    analytics = context.get("portfolio_analytics", {})
    if analytics:
        div = analytics.get("diversification", {})
        if div.get("score", 100) < 70 and "diversif" not in msg_lower:
            suggestions.append("How can I improve diversification?")
        if "sharpe" not in msg_lower and "risk" not in msg_lower:
            suggestions.append("How risky is my portfolio?")

    # Tax follow-ups
    tax = context.get("tax_opportunities", {})
    if tax and tax.get("total_unrealized_losses", 0) < -500:
        if "tax" not in msg_lower:
            suggestions.append("What are my tax opportunities?")

    # Generic if few suggestions
    if len(suggestions) < 2:
        if "diversif" not in msg_lower:
            suggestions.append("How diversified am I?")
        if "compare" not in msg_lower:
            suggestions.append("Compare my portfolio to the S&P 500")

    return suggestions[:4]


# ─── Part B: Proactive Insights Generator ───


def generate_proactive_insights(
    portfolio: list[dict],
    analytics: dict,
    tax_data: Optional[dict] = None,
    signals: Optional[dict] = None,
) -> list[dict]:
    """Generate 3-5 proactive insights without user asking.

    Insight types:
      1. DIVERSIFICATION — sector concentration warnings
      2. RISK — beta, volatility, VaR alerts
      3. TAX — tax-loss harvesting opportunities
      4. FACTOR_ALERT — declining factor scores
      5. REBALANCING — position drift from targets

    Args:
        portfolio: List of enriched holdings with prices.
        analytics: Pre-computed portfolio analytics dict.
        tax_data: Tax opportunity data (optional).
        signals: Dict of ticker -> signal data (optional).

    Returns:
        List of insight dicts with type, title, body, priority, action.
    """
    insights = []
    now = datetime.now(timezone.utc).isoformat()

    if not portfolio:
        return [{
            "type": "ONBOARDING",
            "priority": "high",
            "title": "Add your first holdings",
            "body": "Import your portfolio to get personalized insights about risk, diversification, and tax opportunities.",
            "action": "add_holdings",
            "generated_at": now,
        }]

    # 1. DIVERSIFICATION insights
    div = analytics.get("diversification", {})
    if div.get("score", 100) < 50:
        recs = div.get("recommendations", [])
        body = f"Your diversification score is {div.get('score')}/100 ({div.get('rating', 'Low')})."
        if recs:
            body += f" Key concern: {recs[0]}"
        insights.append({
            "type": "DIVERSIFICATION",
            "priority": "high",
            "title": "Portfolio concentration detected",
            "body": body,
            "action": "view_diversification",
            "generated_at": now,
        })
    elif div.get("score", 100) < 70:
        sector_data = analytics.get("sector_breakdown", [])
        top_sector = sector_data[0] if sector_data else {}
        if top_sector:
            insights.append({
                "type": "DIVERSIFICATION",
                "priority": "medium",
                "title": f"Heavy in {top_sector.get('sector', 'one sector')}",
                "body": (
                    f"Your portfolio is {top_sector.get('weight', 0):.0f}% "
                    f"{top_sector.get('sector', '')} vs S&P 500's "
                    f"{top_sector.get('sp500_weight', 0):.0f}%. "
                    f"Sector concentration increases vulnerability to industry-specific risks."
                ),
                "action": "view_sectors",
                "generated_at": now,
            })

    # 2. RISK insights
    risk = analytics.get("risk_metrics", {})
    beta = risk.get("portfolio_beta", 1.0)
    if isinstance(beta, (int, float)) and beta > 1.2:
        insights.append({
            "type": "RISK",
            "priority": "medium",
            "title": f"Portfolio beta is {beta:.2f}",
            "body": (
                f"A beta of {beta:.2f} means your portfolio is approximately "
                f"{(beta - 1) * 100:.0f}% more volatile than the market. "
                f"In a 10% market decline, the data suggests a potential "
                f"{beta * 10:.0f}% portfolio decline."
            ),
            "action": "view_risk",
            "generated_at": now,
        })

    var_data = risk.get("var_95_monthly", {})
    if var_data.get("dollars") and abs(var_data["dollars"]) > 1000:
        insights.append({
            "type": "RISK",
            "priority": "medium",
            "title": "Monthly risk estimate",
            "body": (
                f"Based on historical patterns, there's a 5% chance of losing "
                f"more than ${abs(var_data['dollars']):,.0f} "
                f"({abs(var_data.get('pct', 0)):.1f}%) in any given month."
            ),
            "action": "view_analytics",
            "generated_at": now,
        })

    sharpe = risk.get("sharpe_ratio", {})
    if sharpe.get("value") is not None and sharpe.get("benchmark") is not None:
        sv = sharpe["value"]
        bv = sharpe["benchmark"]
        if sv < bv:
            insights.append({
                "type": "RISK",
                "priority": "medium",
                "title": "Risk-adjusted returns lag benchmark",
                "body": (
                    f"Your Sharpe ratio ({sv}) is below the S&P 500's ({bv}). "
                    f"This means the portfolio isn't being fully compensated "
                    f"for the risk taken. Improving diversification or reducing "
                    f"high-volatility positions may help."
                ),
                "action": "view_analytics",
                "generated_at": now,
            })

    # 3. TAX insights
    if tax_data:
        total_losses = tax_data.get("total_unrealized_losses", 0)
        if total_losses < -500:
            benefit = tax_data.get("estimated_total_benefit", "$0")
            opps = tax_data.get("harvesting_opportunities", [])
            top_opp = opps[0] if opps else {}
            body = (
                f"${abs(total_losses):,.0f} in unrealized losses could save "
                f"{benefit} in taxes through tax-loss harvesting."
            )
            if top_opp:
                body += (
                    f" Largest opportunity: {top_opp.get('ticker', '')} "
                    f"(${abs(top_opp.get('unrealized_loss', 0)):,.0f} loss)."
                )
            insights.append({
                "type": "TAX",
                "priority": "high",
                "title": "Tax-loss harvesting opportunities",
                "body": body,
                "action": "view_tax",
                "generated_at": now,
            })

    # 4. FACTOR_ALERT insights
    if signals:
        declining = []
        for ticker, sig in signals.items():
            score = sig.get("compositeScore", sig.get("composite_score", 5))
            label = sig.get("score_label", sig.get("signal", ""))
            if isinstance(score, (int, float)) and score <= 4:
                declining.append(f"{ticker} ({score}/10 — {label})")

        if declining:
            insights.append({
                "type": "FACTOR_ALERT",
                "priority": "high" if len(declining) >= 3 else "medium",
                "title": f"{len(declining)} holding{'s' if len(declining) > 1 else ''} with weak scores",
                "body": (
                    f"Factor analysis flags: {', '.join(declining[:5])}. "
                    f"Consider reviewing these positions and their risk factors."
                ),
                "action": "view_signals",
                "generated_at": now,
            })

    # 5. REBALANCING insights
    for h in portfolio:
        weight = h.get("weight", 0)
        if isinstance(weight, (int, float)) and weight > 0.30:
            insights.append({
                "type": "REBALANCING",
                "priority": "medium",
                "title": f"{h.get('ticker', '')} is {weight * 100:.0f}% of portfolio",
                "body": (
                    f"A single position at {weight * 100:.0f}% creates concentration risk. "
                    f"If {h.get('ticker', '')} drops 20%, the portfolio would lose "
                    f"approximately {weight * 20:.0f}%."
                ),
                "action": "view_holdings",
                "generated_at": now,
            })
            break  # Only flag the largest

    # Sort by priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    insights.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 2))

    return insights[:5]


# ─── Part C: Suggestion Chips ───


def generate_suggestion_chips(context: dict) -> list[dict]:
    """Generate contextual suggestion chips based on portfolio state.

    Returns chips that are most relevant to the user's current situation.
    """
    chips = []

    holdings = context.get("portfolio_holdings", [])
    analytics = context.get("portfolio_analytics", {})
    tax = context.get("tax_opportunities", {})

    if not holdings:
        return [
            {"label": "How does Prismvest work?", "message": "How does Prismvest work?"},
            {"label": "What is factor analysis?", "message": "What is factor analysis?"},
            {"label": "Explain the FII score", "message": "What is the FII score and how is it calculated?"},
        ]

    # Portfolio-aware chips
    div = analytics.get("diversification", {})
    if div.get("score", 100) < 70:
        chips.append({
            "label": "Am I diversified enough?",
            "message": "How diversified is my portfolio?",
        })

    risk = analytics.get("risk_metrics", {})
    sharpe = risk.get("sharpe_ratio", {})
    if sharpe.get("value") is not None:
        chips.append({
            "label": "How risky is my portfolio?",
            "message": "Analyze my portfolio risk — Sharpe, beta, and drawdown",
        })

    if tax and tax.get("total_unrealized_losses", 0) < -500:
        chips.append({
            "label": "Tax saving opportunities",
            "message": "What are my tax-loss harvesting opportunities?",
        })

    # Top holding chip
    if holdings:
        top = holdings[0] if isinstance(holdings[0], dict) else {}
        ticker = top.get("ticker", "")
        if ticker:
            chips.append({
                "label": f"Tell me about {ticker}",
                "message": f"What does the factor analysis say about {ticker}?",
            })

    # Always include a general chip
    chips.append({
        "label": "Compare to S&P 500",
        "message": "How does my portfolio compare to the S&P 500?",
    })

    chips.append({
        "label": "What should I learn?",
        "message": "What investing concepts should I learn based on my portfolio?",
    })

    return chips[:6]

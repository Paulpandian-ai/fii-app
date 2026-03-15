"""AI Coach Module for FII.

Context-aware investment education coach powered by Claude that uses the
user's portfolio data, stock analysis, tax opportunities, and factor scores
to provide educational responses.

Supports 5 specialized conversation modes:
  - holdings: Portfolio analysis with risk/growth factors
  - invest: Investment suggestions based on portfolio gaps
  - research: Deep-dive research on a specific stock
  - tax: Tax optimization strategy and education
  - events: Upcoming events watchlist for portfolio

Functions:
  - generate_coach_response(user_message, context, mode, ...) — Main chat response
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

# ─── Mode-Specific System Prompt Additions ───

MODE_SYSTEM_PROMPTS = {
    "holdings": (
        "The user wants to understand their current portfolio. You have "
        "their complete holdings with FII scores, risk factors, and growth "
        "factors. Discuss each holding's strengths and risks. Identify "
        "the portfolio's biggest vulnerability and opportunity."
    ),
    "invest": (
        "The user is considering new investments. You have analysis of "
        "their portfolio gaps and stock suggestions. Explain WHY sector "
        "diversification matters using their specific numbers. Present "
        "alternatives as educational options, not recommendations."
    ),
    "research": (
        "The user wants to understand a specific stock deeply. You have "
        "its full factor analysis, financial metrics, stress tests, and "
        "peer comparison. Present the bull case and bear case. Compare "
        "to peers. Reference specific data points."
    ),
    "tax": (
        "The user wants to understand tax optimization. You have their "
        "unrealized gains/losses and potential harvesting opportunities. "
        "Explain concepts clearly with dollar examples. Always note this "
        "is tax education, not tax advice."
    ),
    "events": (
        "The user wants to know what events to watch. You have their "
        "upcoming earnings dates, Fed meetings, and score changes. "
        "Explain what each event could mean for their specific holdings."
    ),
}

VALID_MODES = {"holdings", "invest", "research", "tax", "events"}


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


# ─── Mode Context Formatters ───


def _format_holdings_context(data: dict) -> str:
    """Format holdings analysis data for Claude context."""
    parts = ["[HOLDINGS ANALYSIS]"]

    summary = data.get("portfolio_summary", {})
    if summary:
        parts.append(
            f"Total Value: ${summary.get('total_value', 0):,.0f} | "
            f"P&L: ${summary.get('total_pnl', 0):,.0f} ({summary.get('total_pnl_pct', 0):.1f}%)"
        )
        if summary.get("strongest_holding"):
            parts.append(f"Strongest: {summary['strongest_holding']}")
        if summary.get("weakest_holding"):
            parts.append(f"Weakest: {summary['weakest_holding']}")
        if summary.get("biggest_risk"):
            parts.append(f"Biggest Risk: {summary['biggest_risk']}")
        if summary.get("biggest_opportunity"):
            parts.append(f"Biggest Opportunity: {summary['biggest_opportunity']}")

    holdings_analysis = data.get("holdings_analysis", [])
    for h in holdings_analysis[:15]:
        ticker = h.get("ticker", "?")
        score = h.get("fii_score", "N/A")
        signal = h.get("signal", "")
        value = h.get("current_value", 0)
        pnl_pct = h.get("gain_loss_pct", 0)
        risk_factors = h.get("risk_factors", [])
        growth_factors = h.get("growth_factors", [])

        line = f"  {ticker}: FII {score}/10 ({signal}), ${value:,.0f} ({pnl_pct:+.1f}%)"
        if risk_factors:
            line += f" | Risks: {', '.join(rf[:50] for rf in risk_factors[:2])}"
        if growth_factors:
            line += f" | Growth: {', '.join(gf[:50] for gf in growth_factors[:2])}"
        parts.append(line)

    return "\n".join(parts)


def _format_invest_context(data: dict) -> str:
    """Format investment suggestion data for Claude context."""
    parts = [f"[INVESTMENT ANALYSIS — Budget: ${data.get('budget', 0):,.0f}]"]

    suggestions = data.get("suggestions", {})

    # Sector gaps
    fill_gaps = suggestions.get("fill_gaps", [])
    if fill_gaps:
        parts.append("\nSector Gaps to Fill:")
        for gap in fill_gaps[:5]:
            sector = gap.get("sector", "")
            current = gap.get("current_weight", 0)
            target = gap.get("sp500_weight", 0)
            ticker = gap.get("suggested_ticker", "")
            name = gap.get("suggested_name", "")
            score = gap.get("fii_score", "N/A")
            parts.append(
                f"  {sector}: You have {current:.1f}% vs S&P {target:.1f}% "
                f"→ Consider {ticker} ({name}, FII {score}/10)"
            )

    # Concentration reduction
    reduce_conc = suggestions.get("reduce_concentration", [])
    if reduce_conc:
        parts.append("\nConcentration Reduction:")
        for rc in reduce_conc[:3]:
            parts.append(f"  {rc.get('ticker', '')}: {rc.get('message', '')}")

    # Quality upgrades
    upgrades = suggestions.get("upgrade_quality", [])
    if upgrades:
        parts.append("\nQuality Upgrades:")
        for ug in upgrades[:3]:
            parts.append(
                f"  Replace {ug.get('current_ticker', '')} (FII {ug.get('current_score', 'N/A')}) "
                f"→ {ug.get('suggested_ticker', '')} (FII {ug.get('suggested_score', 'N/A')})"
            )

    impact = data.get("impact_if_followed", {})
    if impact:
        parts.append(f"\nProjected Impact: Diversification {impact.get('diversification_change', '')}, "
                      f"Avg FII Score {impact.get('avg_score_change', '')}")

    return "\n".join(parts)


def _format_research_context(data: dict) -> str:
    """Format stock research data for Claude context."""
    ticker = data.get("ticker", "?")
    parts = [f"[RESEARCH BRIEF — {ticker}]"]

    # Signal overview
    signal = data.get("signal", {})
    if signal:
        score = signal.get("compositeScore", signal.get("composite_score", "N/A"))
        label = signal.get("score_label", signal.get("signal", ""))
        parts.append(f"FII Score: {score}/10 ({label})")

    # Factor breakdown
    factors = data.get("factors", data.get("factor_details", {}))
    if factors:
        parts.append("\nFactor Analysis:")
        for dim_name, dim_data in factors.items():
            if isinstance(dim_data, dict):
                score = dim_data.get("score", "N/A")
                findings = dim_data.get("key_findings", dim_data.get("findings", []))
                line = f"  {dim_name}: {score}/10"
                if findings and isinstance(findings, list):
                    line += f" — {findings[0][:80]}" if findings else ""
                parts.append(line)

    # Financial metrics
    metrics = data.get("metrics", data.get("financial_metrics", {}))
    if metrics:
        parts.append("\nKey Metrics:")
        for key in ["pe_ratio", "revenue_growth", "profit_margin", "debt_to_equity",
                     "free_cash_flow", "roe", "market_cap"]:
            val = metrics.get(key)
            if val is not None:
                label = key.replace("_", " ").title()
                parts.append(f"  {label}: {val}")

    # Stress test
    stress = data.get("stress_test", data.get("stress_tests", {}))
    if stress:
        scenarios = stress.get("scenarios", [])
        if scenarios:
            parts.append("\nStress Scenarios:")
            for s in scenarios[:4]:
                parts.append(
                    f"  {s.get('name', '')}: {s.get('impact_pct', 0):+.1f}% "
                    f"(${s.get('impact_dollars', 0):+,.0f} on $10K)"
                )

    # Peer comparison
    peers = data.get("peers", data.get("peer_comparison", []))
    if peers:
        parts.append("\nPeer Comparison:")
        for p in peers[:5]:
            parts.append(
                f"  {p.get('ticker', '')}: FII {p.get('score', 'N/A')}/10 — {p.get('signal', '')}"
            )

    # Portfolio context (if user holds this stock)
    portfolio_ctx = data.get("portfolio_context", {})
    if portfolio_ctx.get("in_portfolio"):
        parts.append(
            f"\nIn Portfolio: {portfolio_ctx.get('shares', 0)} shares, "
            f"${portfolio_ctx.get('value', 0):,.0f}, "
            f"{portfolio_ctx.get('weight', 0):.1f}% of portfolio"
        )

    return "\n".join(parts)


def _format_tax_context(data: dict) -> str:
    """Format tax strategy data for Claude context."""
    parts = ["[TAX STRATEGY ANALYSIS]"]

    summary = data.get("tax_summary", {})
    if summary:
        parts.append(
            f"Unrealized Gains: ${summary.get('total_unrealized_gains', 0):,.0f} | "
            f"Unrealized Losses: ${abs(summary.get('total_unrealized_losses', 0)):,.0f} | "
            f"Net: ${summary.get('net_position', 0):,.0f}"
        )
        parts.append(
            f"Harvestable Losses: ${abs(summary.get('harvestable_losses', 0)):,.0f} | "
            f"Estimated Savings: {summary.get('estimated_tax_savings_range', '$0')}"
        )

    actionable = data.get("actionable_items", [])
    if actionable:
        parts.append("\nActionable Items:")
        for item in actionable[:8]:
            ticker = item.get("ticker", "")
            action = item.get("action", "")
            reason = item.get("reason", "")
            amount = item.get("amount", "")
            line = f"  {ticker}: {action}"
            if reason:
                line += f" — {reason}"
            if amount:
                line += f" (${abs(float(amount)) if isinstance(amount, (int, float)) else amount})"
            parts.append(line)

    year_end = data.get("year_end_planning", {})
    if year_end:
        parts.append("\nYear-End Planning:")
        for key, val in year_end.items():
            if val:
                parts.append(f"  {key.replace('_', ' ').title()}: {val}")

    parts.append("\n⚠️ TAX EDUCATION ONLY — Consult a tax professional for advice.")

    return "\n".join(parts)


def _format_events_context(data: dict) -> str:
    """Format events watchlist data for Claude context."""
    parts = ["[EVENTS WATCHLIST]"]

    events = data.get("upcoming_events", [])
    if events:
        for evt in events[:15]:
            date = evt.get("date", "")
            title = evt.get("title", "")
            evt_type = evt.get("type", "")
            ticker = evt.get("ticker", "")
            impact = evt.get("potential_impact", "")

            line = f"  {date} | {title}"
            if ticker:
                line += f" ({ticker})"
            if evt_type:
                line += f" [{evt_type}]"
            if impact:
                line += f" — Impact: {impact}"
            parts.append(line)
    else:
        parts.append("  No upcoming events in the next 30 days.")

    calendar = data.get("weekly_calendar", {})
    if calendar:
        parts.append("\nWeekly Calendar:")
        for week, week_events in calendar.items():
            if week_events:
                parts.append(f"  {week}: {len(week_events)} events")

    return "\n".join(parts)


# ─── Part A: Context-Aware Coach Engine ───


def generate_coach_response(
    user_message: str,
    context: dict,
    mode: Optional[str] = None,
    ticker: Optional[str] = None,
    budget: Optional[float] = None,
) -> dict:
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
            - mode_data: pre-computed data from wealth_advisor for the active mode
        mode: One of 'holdings', 'invest', 'research', 'tax', 'events', or None.
        ticker: Stock ticker for research mode.
        budget: Investment budget for invest mode.

    Returns:
        Dict with response, follow_up_suggestions, mode, and disclaimer.
    """
    try:
        client = _get_client()

        # Build system prompt with mode-specific addition
        system_prompt = COACH_SYSTEM_PROMPT
        if mode and mode in MODE_SYSTEM_PROMPTS:
            system_prompt += f"\n\n{MODE_SYSTEM_PROMPTS[mode]}"

        # Build context-enriched message
        enriched_parts = []

        # Always include basic portfolio context
        portfolio_context = _format_portfolio_context(context)
        if portfolio_context:
            enriched_parts.append(portfolio_context)

        # Add mode-specific data context
        mode_data = context.get("mode_data")
        if mode_data and mode:
            mode_context = _format_mode_context(mode, mode_data)
            if mode_context:
                enriched_parts.append(mode_context)

        enriched_parts.append(f"[QUESTION] {user_message}")
        enriched_message = "\n\n".join(enriched_parts)

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
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=messages,
        )

        response_text = message.content[0].text.strip()

        # Generate follow-up suggestions based on mode
        suggestions = _generate_follow_ups(user_message, context, mode=mode)

        return {
            "response": response_text,
            "follow_up_suggestions": suggestions,
            "mode": mode or "general",
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
            "mode": mode or "general",
            "error": str(e),
            "disclaimer": COACH_DISCLAIMER,
        }


def _format_mode_context(mode: str, data: dict) -> str:
    """Route mode data to the appropriate formatter."""
    formatters = {
        "holdings": _format_holdings_context,
        "invest": _format_invest_context,
        "research": _format_research_context,
        "tax": _format_tax_context,
        "events": _format_events_context,
    }
    formatter = formatters.get(mode)
    if formatter and data:
        try:
            return formatter(data)
        except Exception as e:
            logger.warning(f"[Coach] Failed to format {mode} context: {e}")
    return ""


def _generate_follow_ups(
    user_message: str,
    context: dict,
    mode: Optional[str] = None,
) -> list[str]:
    """Generate contextual follow-up suggestion chips based on mode."""
    suggestions = []
    msg_lower = user_message.lower()

    # Mode-specific follow-ups
    if mode == "holdings":
        if "risk" not in msg_lower:
            suggestions.append("Which of my holdings has the most risk?")
        if "growth" not in msg_lower:
            suggestions.append("Which holdings have the strongest growth factors?")
        if "weak" not in msg_lower and "worst" not in msg_lower:
            suggestions.append("What's my portfolio's biggest vulnerability?")
        if "rebalance" not in msg_lower:
            suggestions.append("Should I consider rebalancing?")

    elif mode == "invest":
        if "sector" not in msg_lower:
            suggestions.append("Which sectors am I missing?")
        if "why" not in msg_lower:
            suggestions.append("Why are these sectors important?")
        if "risk" not in msg_lower:
            suggestions.append("What's the risk of not diversifying?")
        if "alternative" not in msg_lower:
            suggestions.append("Are there alternative picks?")

    elif mode == "research":
        ticker = context.get("stock_signal", {}).get("ticker", "")
        if not ticker:
            # Try mode_data
            mode_data = context.get("mode_data", {})
            ticker = mode_data.get("ticker", "")
        if ticker:
            if "bull" not in msg_lower and "bear" not in msg_lower:
                suggestions.append(f"What's the bull and bear case for {ticker}?")
            if "peer" not in msg_lower and "compare" not in msg_lower:
                suggestions.append(f"How does {ticker} compare to peers?")
            if "stress" not in msg_lower and "recession" not in msg_lower:
                suggestions.append(f"How would {ticker} do in a recession?")
            if "factor" not in msg_lower:
                suggestions.append(f"Explain {ticker}'s factor scores")

    elif mode == "tax":
        if "harvest" not in msg_lower:
            suggestions.append("Walk me through tax-loss harvesting")
        if "wash" not in msg_lower:
            suggestions.append("What are wash sale rules?")
        if "lot" not in msg_lower:
            suggestions.append("How does tax lot selection work?")
        if "deadline" not in msg_lower:
            suggestions.append("What are important tax deadlines?")

    elif mode == "events":
        if "earnings" not in msg_lower:
            suggestions.append("Which earnings should I watch most closely?")
        if "fed" not in msg_lower:
            suggestions.append("How do Fed meetings affect my portfolio?")
        if "prepare" not in msg_lower:
            suggestions.append("How should I prepare for upcoming events?")
        if "impact" not in msg_lower:
            suggestions.append("Which event has the biggest potential impact?")

    else:
        # Default/general mode — original follow-up logic
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

        analytics = context.get("portfolio_analytics", {})
        if analytics:
            div = analytics.get("diversification", {})
            if div.get("score", 100) < 70 and "diversif" not in msg_lower:
                suggestions.append("How can I improve diversification?")
            if "sharpe" not in msg_lower and "risk" not in msg_lower:
                suggestions.append("How risky is my portfolio?")

        tax = context.get("tax_opportunities", {})
        if tax and tax.get("total_unrealized_losses", 0) < -500:
            if "tax" not in msg_lower:
                suggestions.append("What are my tax opportunities?")

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

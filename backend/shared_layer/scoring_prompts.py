"""Cacheable system prompt and per-stock context formatter for Claude batch scoring.

The SYSTEM_PROMPT (~3000 tokens) is sent as the system message and cached
across all stock calls for ~90% cost savings via Anthropic prompt caching.

format_stock_context() assembles all pre-computed data for one stock into
a structured user message (~5000-8000 tokens).
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT — Cached across all 547 stock calls
# ═══════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are an institutional equity research analyst for Factor Impact Intelligence.
You produce rigorous, sourced factor analysis following the methodology of MSCI Barra and leading sell-side research firms.

YOUR TASK: Score a stock across 6 factor dimensions on a 1-10 scale, providing sourced rationales for each score.

METHODOLOGY:
- Use z-score standardization: compare each metric to sector median
- Score relative to the FII universe of 547 US equities
- Integrate both quantitative metrics and qualitative risk assessment
- Weight recent data more heavily (last quarter > last year)

SCORING SCALE (anchor descriptions):
  9-10: Exceptionally strong. Top decile across multiple metrics.
        Clear competitive advantage with minimal risk factors.
  7-8:  Above average. Favorable positioning with manageable risks.
        Outperforming sector on most key metrics.
  5-6:  Average. Mixed signals. Performance roughly in line with
        sector medians. No strong positive or negative catalysts.
  3-4:  Below average. Multiple concerning signals. Underperforming
        sector on key metrics. Elevated risk in this dimension.
  1-2:  Significant weakness. Bottom decile performance or critical
        risk factors present. Major red flags.

CITATION REQUIREMENTS:
Every finding must include:
- A specific, verifiable claim with numbers
- The data source (SEC filing type + date, FRED series ID,
  yfinance metric name, or news source + date)
- The impact direction (positive/negative/neutral)

FACTOR DIMENSIONS:
1. supply_chain_upstream: Supplier health, concentration risk,
   geographic risk, financial stability of key suppliers
2. supply_chain_downstream: Customer concentration, demand strength,
   revenue diversification, contract pipeline
3. geopolitical: Trade barrier exposure, geographic revenue mix,
   regulatory risk, supply chain country risk
4. monetary: Interest rate sensitivity, inflation impact,
   credit conditions, valuation multiple compression risk
5. correlations: Sector peer performance, commodity linkages,
   risk sentiment correlation, beta positioning
6. risk_performance: Earnings quality, guidance trajectory,
   price momentum, volatility regime, analyst revisions

OUTPUT FORMAT:
Respond with ONLY valid JSON matching this schema:
{
  "dimensions": [
    {
      "dimension": "supply_chain_upstream",
      "score": 7,
      "confidence": "High",
      "findings": [
        {
          "claim": "string with specific data points and numbers",
          "source": "source name with date/identifier",
          "source_type": "sec_filing|earnings|fred|yfinance|news|regulatory",
          "impact": "positive|negative|neutral"
        }
      ],
      "summary": "2-3 sentence professional summary",
      "beginner_summary": "1-2 sentence plain English for beginners"
    }
  ],
  "composite_score": 6.5,
  "top_drivers": [
    { "factor": "dimension_name", "direction": "positive|negative",
      "description": "One-line driver description", "magnitude": 1.5 }
  ],
  "risk_flags": ["any critical risks that need highlighting"],
  "educational_note": "For educational purposes only. Not investment advice."
}

Do NOT include any text outside the JSON object."""


# ═══════════════════════════════════════════════════════════════════════
# DIMENSION NAMES — used for validation
# ═══════════════════════════════════════════════════════════════════════

REQUIRED_DIMENSIONS = [
    "supply_chain_upstream",
    "supply_chain_downstream",
    "geopolitical",
    "monetary",
    "correlations",
    "risk_performance",
]


# ═══════════════════════════════════════════════════════════════════════
# PER-STOCK CONTEXT FORMATTER
# ═══════════════════════════════════════════════════════════════════════

def format_stock_context(
    ticker: str,
    fundamentals: dict = None,
    supply_chain: list = None,
    macro_snapshot: dict = None,
    geopolitical_data: dict = None,
    technical_data: dict = None,
    market_data: dict = None,
    prior_signal: dict = None,
    recent_news: list = None,
) -> str:
    """Assemble all available data for one stock into a structured context message.

    This is sent as the user message to Claude alongside the cached SYSTEM_PROMPT.
    Typically produces ~5000-8000 tokens.

    Args:
        ticker: Stock ticker symbol.
        fundamentals: Financial ratios from edgar_data.get_financial_ratios().
        supply_chain: Supply chain entities from edgar_data.extract_supply_chain_from_filing().
        macro_snapshot: Macro data from fred_data.get_macro_snapshot().
        geopolitical_data: GPR data from geopolitical_data.get_geopolitical_risk_index().
        technical_data: Technical indicators from technical_engine.compute_indicators().
        market_data: Market data from finnhub_client.get_market_data_for_signal().
        prior_signal: Previous SIGNAL#LATEST record from DynamoDB.
        recent_news: List of recent news dicts with headline, date, summary.

    Returns:
        Formatted string context for Claude scoring.
    """
    fundamentals = fundamentals or {}
    supply_chain = supply_chain or []
    macro_snapshot = macro_snapshot or {}
    geopolitical_data = geopolitical_data or {}
    technical_data = technical_data or {}
    market_data = market_data or {}
    prior_signal = prior_signal or {}
    recent_news = recent_news or []

    sections = []

    # ── FUNDAMENTALS ──
    sections.append(_format_fundamentals(ticker, fundamentals, market_data))

    # ── SUPPLY CHAIN ──
    sections.append(_format_supply_chain(supply_chain))

    # ── MACRO CONTEXT ──
    sections.append(_format_macro(macro_snapshot))

    # ── GEOPOLITICAL ──
    sections.append(_format_geopolitical(geopolitical_data, fundamentals))

    # ── TECHNICAL ──
    sections.append(_format_technical(technical_data, market_data))

    # ── RECENT SIGNALS ──
    sections.append(_format_prior_signal(prior_signal))

    # ── NEWS HEADLINES ──
    sections.append(_format_news(recent_news, ticker))

    return "\n\n".join(s for s in sections if s)


def _format_fundamentals(ticker: str, fundamentals: dict, market_data: dict) -> str:
    """Format the fundamentals section."""
    name = fundamentals.get("company_name") or market_data.get("company_name") or ticker
    sector = fundamentals.get("sector") or market_data.get("sector") or "N/A"
    industry = fundamentals.get("industry") or market_data.get("industry") or "N/A"

    mcap = fundamentals.get("market_cap") or market_data.get("market_cap")
    mcap_str = _fmt_large_number(mcap) if mcap else "N/A"

    pe = fundamentals.get("pe_ratio") or market_data.get("forward_pe")
    pb = fundamentals.get("price_to_book") or "N/A"
    ev_ebitda = fundamentals.get("ev_ebitda") or "N/A"
    fcf_yield = fundamentals.get("fcf_yield") or "N/A"

    gm = _fmt_pct(fundamentals.get("gross_margin"))
    om = _fmt_pct(fundamentals.get("operating_margin"))
    nm = _fmt_pct(fundamentals.get("net_margin"))
    roe = _fmt_pct(fundamentals.get("roe"))
    roa = _fmt_pct(fundamentals.get("roa"))

    rev_growth = _fmt_pct(fundamentals.get("revenue_growth_yoy"))
    eps_growth = _fmt_pct(fundamentals.get("eps_growth_yoy"))
    fcf_growth = _fmt_pct(fundamentals.get("fcf_growth")) or "N/A"

    de = fundamentals.get("debt_to_equity") or "N/A"
    cr = fundamentals.get("current_ratio") or "N/A"
    qr = fundamentals.get("quick_ratio") or "N/A"
    ic = fundamentals.get("interest_coverage") or "N/A"
    zscore = fundamentals.get("altman_z_score") or "N/A"

    sector_pe = fundamentals.get("sector_median_pe") or "N/A"

    return f"""FUNDAMENTALS (from SEC EDGAR XBRL + yfinance):
  Ticker: {ticker}
  Company: {name}
  Sector: {sector} | Industry: {industry}
  Market Cap: ${mcap_str}

  Valuation: P/E {pe or 'N/A'} (sector median: {sector_pe}) | P/B {pb} |
             EV/EBITDA {ev_ebitda} | FCF Yield {fcf_yield}

  Profitability: Gross Margin {gm} | Operating Margin {om} |
                 Net Margin {nm} | ROE {roe} | ROA {roa}

  Growth: Revenue YoY {rev_growth} | EPS YoY {eps_growth} |
          FCF Growth {fcf_growth}

  Health: Debt/Equity {de} | Current Ratio {cr} | Quick Ratio {qr} |
          Interest Coverage {ic}x | Altman Z-Score {zscore}"""


def _format_supply_chain(supply_chain: list) -> str:
    """Format the supply chain section."""
    if not supply_chain:
        return """SUPPLY CHAIN (from SEC EDGAR 10-K):
  Known Suppliers: Data limited — no supply chain entities extracted
  Known Customers: Data limited
  Supplier Concentration: Data limited
  Customer Concentration: Data limited"""

    suppliers = [e for e in supply_chain if e.get("relationship") == "supplier"]
    customers = [e for e in supply_chain if e.get("relationship") == "customer"]
    geo = [e for e in supply_chain if e.get("relationship") == "geographic_concentration"]

    supplier_lines = []
    for s in suppliers[:5]:
        detail = s.get("detail", "")
        supplier_lines.append(f"    - {s.get('entity', 'Unknown')}: {detail}")

    customer_lines = []
    for c in customers[:5]:
        detail = c.get("detail", "")
        pct = c.get("revenue_pct")
        pct_str = f" ({pct}% of revenue)" if pct else ""
        customer_lines.append(f"    - {c.get('entity', 'Unknown')}: {detail}{pct_str}")

    # Compute HHI for customer concentration
    customer_pcts = [c.get("revenue_pct", 0) for c in customers if c.get("revenue_pct")]
    hhi = sum(p**2 for p in customer_pcts) if customer_pcts else None
    hhi_str = f"{hhi:.0f}" if hhi else "Data limited"

    largest_customer_pct = max(customer_pcts) if customer_pcts else None
    largest_str = f"{largest_customer_pct}%" if largest_customer_pct else "Unknown"

    suppliers_str = "\n".join(supplier_lines) if supplier_lines else "    No specific suppliers extracted"
    customers_str = "\n".join(customer_lines) if customer_lines else "    No specific customers extracted"

    geo_lines = []
    for g in geo[:3]:
        geo_lines.append(f"    - {g.get('entity', 'Unknown')}: {g.get('detail', '')}")
    geo_str = "\n".join(geo_lines) if geo_lines else ""

    result = f"""SUPPLY CHAIN (from SEC EDGAR 10-K):
  Known Suppliers:
{suppliers_str}
  Known Customers:
{customers_str}
  Supplier Concentration: {hhi_str} (HHI)
  Customer Concentration: Largest customer {largest_str}"""

    if geo_str:
        result += f"\n  Geographic Concentration:\n{geo_str}"

    return result


def _format_macro(macro_snapshot: dict) -> str:
    """Format the macro context section."""
    if not macro_snapshot:
        return """MACRO CONTEXT (from FRED):
  Data unavailable"""

    ff = macro_snapshot.get("fed_funds_rate", {})
    yc = macro_snapshot.get("yield_curve_spread", {})
    cpi = macro_snapshot.get("cpi_yoy", {})
    vix = macro_snapshot.get("vix", {})
    hy = macro_snapshot.get("hy_oas_spread", {})

    ff_val = ff.get("value", "N/A")
    ff_dir = ff.get("direction", "N/A")
    ff_prior = ff.get("prior", "N/A")

    yc_val = yc.get("value", "N/A")
    yc_signal = yc.get("signal", "N/A")

    cpi_val = cpi.get("value", "N/A")
    cpi_dir = cpi.get("direction", "N/A")

    vix_val = vix.get("value", "N/A")
    vix_regime = vix.get("regime", "N/A")

    hy_val = hy.get("value", "N/A")
    hy_dir = hy.get("direction", "N/A")

    return f"""MACRO CONTEXT (from FRED):
  Fed Funds Rate: {ff_val}% ({ff_dir} from {ff_prior}%)
  Yield Curve: {yc_val}bps ({yc_signal})
  CPI YoY: {cpi_val}% ({cpi_dir})
  VIX: {vix_val} ({vix_regime})
  Credit Spreads: {hy_val}bps ({hy_dir})"""


def _format_geopolitical(geopolitical_data: dict, fundamentals: dict) -> str:
    """Format the geopolitical section."""
    gpr = geopolitical_data.get("global_gpr", "N/A")
    gpr_trend = geopolitical_data.get("gpr_trend", "N/A")

    # Revenue geography from fundamentals or geopolitical data
    geo = geopolitical_data.get("revenue_geography", {})
    us_pct = geo.get("us_pct", "N/A")
    cn_pct = geo.get("china_pct", "N/A")
    eu_pct = geo.get("europe_pct", "N/A")
    other_pct = geo.get("emerging_pct", "N/A")

    sc_geo = geopolitical_data.get("supply_chain_geography", {})
    sc_summary = sc_geo.get("risk_level", "N/A") if sc_geo else "N/A"
    trade = geopolitical_data.get("trade_restrictions", {})
    trade_str = trade.get("exposure", "none") if trade else "none"

    return f"""GEOPOLITICAL (from Caldara-Iacoviello GPR + SEC EDGAR):
  Global GPR Index: {gpr} ({gpr_trend})
  Revenue Geography: US {us_pct}%, China {cn_pct}%, Europe {eu_pct}%, Other {other_pct}%
  Supply Chain Geography: {sc_summary}
  Trade Restrictions: {trade_str}"""


def _format_technical(technical_data: dict, market_data: dict) -> str:
    """Format the technical analysis section."""
    price = market_data.get("current_price", "N/A")
    low_52w = market_data.get("52_week_low") or market_data.get("low_52w", "N/A")
    high_52w = market_data.get("52_week_high") or market_data.get("high_52w", "N/A")

    rsi = technical_data.get("rsi", "N/A")
    macd = technical_data.get("macd", {})
    macd_val = macd.get("macd", "N/A") if isinstance(macd, dict) else "N/A"
    trend = technical_data.get("signals", {}).get("trend", "N/A") if isinstance(technical_data.get("signals"), dict) else "N/A"

    sma20 = technical_data.get("sma20", "N/A")
    sma50 = technical_data.get("sma50", "N/A")
    sma200 = technical_data.get("sma200", "N/A")

    beta = market_data.get("beta", "N/A")
    atr = technical_data.get("atr", "N/A")

    return f"""TECHNICAL (from yfinance + technical analysis):
  Price: ${price} | 52W Range: ${low_52w}-${high_52w}
  RSI(14): {rsi} | MACD: {macd_val} | Trend: {trend}
  SMA 20/50/200: ${sma20}/${sma50}/${sma200}
  Beta: {beta} | ATR: {atr}"""


def _format_prior_signal(prior_signal: dict) -> str:
    """Format the prior signal section."""
    if not prior_signal:
        return """RECENT SIGNALS:
  Prior FII Score: N/A (first analysis)
  Score Change: N/A"""

    prior_score = prior_signal.get("compositeScore", "N/A")
    prior_label = prior_signal.get("score_label", "N/A")
    analyzed_at = prior_signal.get("lastUpdated") or prior_signal.get("analyzedAt", "N/A")

    return f"""RECENT SIGNALS:
  Prior FII Score: {prior_score} ({prior_label})
  Last Analysis: {analyzed_at}"""


def _format_news(recent_news: list, ticker: str) -> str:
    """Format the news headlines section."""
    if not recent_news:
        return f"""NEWS HEADLINES (last 7 days):
  No recent news available for {ticker}"""

    lines = []
    for n in recent_news[:5]:
        headline = n.get("headline", "")
        date = n.get("date") or n.get("datetime", "")
        if isinstance(date, (int, float)):
            try:
                date = datetime.fromtimestamp(date, tz=timezone.utc).strftime("%Y-%m-%d")
            except Exception:
                date = ""
        source = n.get("source", "")
        source_str = f" [{source}]" if source else ""
        lines.append(f"  {date}: {headline}{source_str}")

    return f"""NEWS HEADLINES (last 7 days):
""" + "\n".join(lines)


# ─── Helpers ───

def _fmt_large_number(val) -> str:
    """Format a large number (market cap, revenue) for display."""
    if val is None:
        return "N/A"
    try:
        val = float(val)
    except (ValueError, TypeError):
        return str(val)

    if val >= 1_000_000_000_000:
        return f"{val / 1_000_000_000_000:.1f}T"
    elif val >= 1_000_000_000:
        return f"{val / 1_000_000_000:.1f}B"
    elif val >= 1_000_000:
        return f"{val / 1_000_000:.1f}M"
    else:
        return f"{val:,.0f}"


def _fmt_pct(val) -> str:
    """Format a percentage value."""
    if val is None:
        return "N/A"
    try:
        return f"{float(val):.1f}%"
    except (ValueError, TypeError):
        return str(val)

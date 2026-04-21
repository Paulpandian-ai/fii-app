"""FII Streamlit Web App — Factor Impact Intelligence

Run locally:
    cd streamlit
    pip install -r requirements.txt
    streamlit run app.py

Set API URL via env var (optional, defaults to production):
    export FII_API_URL=https://your-api-gateway-url
"""

import base64
import json
from datetime import datetime

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

import api_client as api


# ─── Page config ───
st.set_page_config(
    page_title="FII — Factor Impact Intelligence",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)


# ─── Helpers ───
def score_color(score):
    try:
        s = float(score)
    except (TypeError, ValueError):
        return "#8E8E93"
    if s >= 7:
        return "#14B8A6"
    if s >= 5:
        return "#60A5FA"
    if s >= 3:
        return "#FBBF24"
    return "#F59E0B"


def score_label(score):
    try:
        s = float(score)
    except (TypeError, ValueError):
        return "N/A"
    if s >= 8:
        return "Strong"
    if s >= 6:
        return "Favorable"
    if s >= 4:
        return "Neutral"
    if s >= 2:
        return "Weak"
    return "Caution"


def fmt(v, suffix="", default="N/A"):
    if v is None or v == "":
        return default
    if isinstance(v, (int, float)):
        return f"{v:,.2f}{suffix}"
    return f"{v}{suffix}"


def get_nested(d, *keys, default=None):
    cur = d
    for k in keys:
        if isinstance(cur, dict):
            cur = cur.get(k)
        else:
            return default
    return cur if cur is not None else default


def cat_value(financials, category, key):
    """Extract nested categories.{category}.{key}.value."""
    cats = financials.get("categories") if isinstance(financials, dict) else None
    if isinstance(cats, str):
        try:
            cats = json.loads(cats)
        except Exception:
            return None
    if not isinstance(cats, dict):
        return None
    entry = (cats.get(category) or {}).get(key, {})
    if isinstance(entry, dict):
        return entry.get("value")
    return entry


# ─── Sidebar Navigation ───
st.sidebar.title("📊 FII")
st.sidebar.caption("Factor Impact Intelligence")

PAGES = [
    "🏠 Dashboard",
    "🔍 Stock Detail",
    "📋 Screener",
    "📑 Report Critique",
    "💬 AI Coach",
    "💼 Portfolio",
    "📈 Strategy",
]
page = st.sidebar.radio("Navigate", PAGES, label_visibility="collapsed")

st.sidebar.divider()
st.sidebar.caption("Educational analysis of public market data. Not financial advice.")

api_url = api.API_BASE
st.sidebar.text(f"API: {api_url[:40]}...")


# ═══════════════════════════════════════════════════════════════
# DASHBOARD / FEED
# ═══════════════════════════════════════════════════════════════
if page == "🏠 Dashboard":
    st.title("Dashboard")
    st.caption("Daily signals across the FII universe")

    col1, col2, col3 = st.columns(3)
    with col1:
        if st.button("🔄 Refresh Feed", use_container_width=True):
            st.cache_data.clear()
            st.rerun()

    with st.spinner("Loading feed..."):
        feed = api.get_feed()

    items = feed.get("items", []) if isinstance(feed, dict) else []

    if not items:
        st.warning("No feed items available. Check API connection.")
    else:
        st.subheader(f"Top {len(items)} Signals")

        for item in items[:50]:
            if item.get("type") == "educational":
                with st.container(border=True):
                    st.markdown(f"**📚 {item.get('title', 'Educational')}**")
                    st.caption(item.get("body", ""))
                continue

            ticker = item.get("ticker", "")
            score = item.get("score", item.get("compositeScore", 0))
            label = item.get("score_label") or item.get("scoreLabel") or score_label(score)
            company = item.get("companyName", "")
            sector = item.get("sector", "")

            with st.container(border=True):
                c1, c2, c3, c4 = st.columns([1, 3, 2, 2])
                with c1:
                    st.markdown(f"### {ticker}")
                with c2:
                    st.markdown(f"**{company}**")
                    if sector:
                        st.caption(sector)
                with c3:
                    try:
                        s = float(score)
                        st.metric("FII Score", f"{s:.1f}/10")
                    except Exception:
                        st.metric("FII Score", "N/A")
                with c4:
                    st.markdown(
                        f"<div style='padding:8px;border-radius:8px;"
                        f"background-color:{score_color(score)};color:white;"
                        f"text-align:center;font-weight:600'>{label}</div>",
                        unsafe_allow_html=True,
                    )

                drivers = item.get("score_drivers") or item.get("topFactors") or []
                if isinstance(drivers, str):
                    try:
                        drivers = json.loads(drivers)
                    except Exception:
                        drivers = []
                if drivers:
                    with st.expander("Score drivers"):
                        for d in drivers[:5]:
                            if isinstance(d, dict):
                                factor = d.get("factor") or d.get("name", "Factor")
                                direction = d.get("direction", "")
                                desc = d.get("description", "")
                                st.markdown(f"- **{factor}** ({direction}): {desc}")
                            else:
                                st.markdown(f"- {d}")

    st.divider()
    st.subheader("📰 Market News")
    with st.spinner("Loading news..."):
        news = api.get_market_news(limit=10)
    news_items = news.get("articles", news.get("items", [])) if isinstance(news, dict) else []
    for n in news_items[:10]:
        title = n.get("title") or n.get("headline", "")
        summary = n.get("summary") or n.get("description", "")
        src = n.get("source", "")
        if title:
            with st.expander(title):
                st.caption(src)
                st.write(summary)


# ═══════════════════════════════════════════════════════════════
# STOCK DETAIL
# ═══════════════════════════════════════════════════════════════
elif page == "🔍 Stock Detail":
    st.title("Stock Detail")

    ticker_input = st.text_input("Enter ticker", value="AAPL", placeholder="e.g. AAPL, NVDA, XOM").upper().strip()

    if ticker_input:
        tabs = st.tabs(["Signal", "Factors", "Financials", "Stress Test", "Alt Data", "News"])

        # ── Signal Tab ──
        with tabs[0]:
            with st.spinner(f"Loading signal for {ticker_input}..."):
                signal = api.get_signal_detail(ticker_input)

            if not signal:
                st.warning(f"No signal data for {ticker_input}")
            else:
                score = signal.get("score", signal.get("aiScore", 0))
                label = signal.get("score_label") or signal.get("scoreLabel") or score_label(score)
                company = signal.get("companyName", "")

                st.subheader(f"{ticker_input} — {company}")

                c1, c2, c3, c4 = st.columns(4)
                with c1:
                    st.metric("FII Score", f"{float(score):.1f}/10" if score else "N/A")
                with c2:
                    st.metric("Signal", label)
                with c3:
                    st.metric("Confidence", signal.get("confidence", "N/A"))
                with c4:
                    sector = signal.get("sector", "N/A")
                    st.metric("Sector", sector)

                # Factor percentiles radar chart
                fp = signal.get("factor_percentiles") or {}
                if isinstance(fp, str):
                    try:
                        fp = json.loads(fp)
                    except Exception:
                        fp = {}
                if fp and isinstance(fp, dict):
                    st.subheader("Factor Percentiles")
                    dims = ["upstream", "downstream", "geopolitical", "monetary", "correlations", "risk_performance"]
                    labels = ["Upstream", "Downstream", "Geopolitical", "Monetary", "Correlations", "Risk/Perf"]
                    values = [float(fp.get(d, 0) or 0) for d in dims]

                    fig = go.Figure(data=go.Scatterpolar(
                        r=values + [values[0]],
                        theta=labels + [labels[0]],
                        fill='toself',
                        line_color="#4A90D9",
                    ))
                    fig.update_layout(
                        polar=dict(radialaxis=dict(visible=True, range=[0, 100])),
                        showlegend=False,
                        height=400,
                    )
                    st.plotly_chart(fig, use_container_width=True)

                # Score drivers
                drivers = signal.get("score_drivers") or []
                if isinstance(drivers, str):
                    try:
                        drivers = json.loads(drivers)
                    except Exception:
                        drivers = []
                if drivers:
                    st.subheader("Score Drivers")
                    for d in drivers[:8]:
                        if isinstance(d, dict):
                            factor = d.get("factor") or d.get("name", "")
                            direction = d.get("direction", "")
                            magnitude = d.get("magnitude", "")
                            desc = d.get("description", "")
                            color = "#14B8A6" if direction in ("positive", "bullish") else "#F59E0B"
                            st.markdown(
                                f"<div style='border-left:4px solid {color};padding:8px;margin:4px 0'>"
                                f"<b>{factor}</b> — {direction} (magnitude: {magnitude})<br>"
                                f"<span style='opacity:0.7'>{desc}</span></div>",
                                unsafe_allow_html=True,
                            )

        # ── Factors Tab ──
        with tabs[1]:
            with st.spinner("Loading factor summaries..."):
                factors = api.get_factor_summaries(ticker_input)

            dims = factors.get("dimensions", {}) if isinstance(factors, dict) else {}
            if not dims:
                st.warning("No factor data available")
            else:
                dim_labels = {
                    "upstream": "Supply Chain Upstream",
                    "downstream": "Supply Chain Downstream",
                    "geopolitical": "Geopolitical Risk",
                    "monetary": "Monetary Policy",
                    "correlations": "Correlations",
                    "risk_performance": "Risk & Performance",
                }
                for dim_key, dim_name in dim_labels.items():
                    dim = dims.get(dim_key, {})
                    if not dim:
                        continue
                    with st.expander(f"**{dim_name}** — Score: {dim.get('score', 'N/A')}/10"):
                        st.caption(f"Confidence: {dim.get('confidence', 'N/A')}")
                        summary = dim.get("summary", "")
                        if summary:
                            st.write(summary)
                        findings = dim.get("findings") or dim.get("key_findings", [])
                        if findings:
                            st.markdown("**Key findings:**")
                            for f in findings[:5]:
                                if isinstance(f, dict):
                                    st.markdown(f"- {f.get('text') or f.get('finding') or str(f)}")
                                else:
                                    st.markdown(f"- {f}")

        # ── Financials Tab ──
        with tabs[2]:
            with st.spinner("Loading financials..."):
                financials = api.get_stock_financials(ticker_input)

            if not financials:
                st.warning("No financial data")
            else:
                st.subheader("Valuation")
                c1, c2, c3, c4 = st.columns(4)
                c1.metric("P/E (TTM)", fmt(cat_value(financials, "valuation", "trailing_pe")))
                c2.metric("Forward P/E", fmt(cat_value(financials, "valuation", "forward_pe")))
                c3.metric("P/S", fmt(cat_value(financials, "valuation", "price_to_sales")))
                c4.metric("P/B", fmt(cat_value(financials, "valuation", "price_to_book")))

                c1, c2, c3, c4 = st.columns(4)
                c1.metric("PEG", fmt(cat_value(financials, "valuation", "peg_ratio")))
                c2.metric("EV/EBITDA", fmt(cat_value(financials, "valuation", "ev_to_ebitda")))
                c3.metric("Market Cap", fmt(cat_value(financials, "valuation", "market_cap")))
                c4.metric("FCF Yield", fmt(cat_value(financials, "valuation", "fcf_yield"), "%"))

                st.subheader("Profitability")
                c1, c2, c3, c4 = st.columns(4)
                c1.metric("Gross Margin", fmt(cat_value(financials, "profitability", "gross_margin"), "%"))
                c2.metric("Op Margin", fmt(cat_value(financials, "profitability", "operating_margin"), "%"))
                c3.metric("Net Margin", fmt(cat_value(financials, "profitability", "net_margin"), "%"))
                c4.metric("ROE", fmt(cat_value(financials, "profitability", "roe"), "%"))

                c1, c2, c3, c4 = st.columns(4)
                c1.metric("ROA", fmt(cat_value(financials, "profitability", "roa"), "%"))
                c2.metric("ROIC", fmt(cat_value(financials, "profitability", "roic"), "%"))
                c3.metric("EPS (TTM)", fmt(cat_value(financials, "profitability", "eps_ttm")))
                c4.metric("EBITDA", fmt(cat_value(financials, "profitability", "ebitda")))

                st.subheader("Growth")
                c1, c2, c3, c4 = st.columns(4)
                c1.metric("Rev YoY", fmt(cat_value(financials, "growth", "revenue_growth_yoy"), "%"))
                c2.metric("Rev 3Y CAGR", fmt(cat_value(financials, "growth", "revenue_growth_3y_cagr"), "%"))
                c3.metric("EPS YoY", fmt(cat_value(financials, "growth", "eps_growth_yoy"), "%"))
                c4.metric("EPS 3Y CAGR", fmt(cat_value(financials, "growth", "eps_growth_3y_cagr"), "%"))

                st.subheader("Financial Health")
                c1, c2, c3, c4 = st.columns(4)
                c1.metric("Debt/Equity", fmt(cat_value(financials, "financial_health", "debt_to_equity")))
                c2.metric("Current Ratio", fmt(cat_value(financials, "financial_health", "current_ratio")))
                c3.metric("Quick Ratio", fmt(cat_value(financials, "financial_health", "quick_ratio")))
                c4.metric("Interest Cov", fmt(cat_value(financials, "financial_health", "interest_coverage")))

                st.subheader("Dividends & Analyst")
                c1, c2, c3, c4 = st.columns(4)
                c1.metric("Div Yield", fmt(cat_value(financials, "dividends", "dividend_yield"), "%"))
                c2.metric("Payout", fmt(cat_value(financials, "dividends", "payout_ratio"), "%"))
                c3.metric("Target Price", fmt(cat_value(financials, "analyst_estimates", "target_price_mean")))
                c4.metric("# Analysts", fmt(cat_value(financials, "analyst_estimates", "num_analysts")))

                st.subheader("Technicals & Ownership")
                c1, c2, c3, c4 = st.columns(4)
                c1.metric("Beta", fmt(cat_value(financials, "momentum_technicals", "beta")))
                c2.metric("RSI (14)", fmt(cat_value(financials, "momentum_technicals", "rsi_14")))
                c3.metric("Institutional", fmt(cat_value(financials, "ownership", "institutional_pct"), "%"))
                c4.metric("Short %", fmt(cat_value(financials, "ownership", "short_pct_float"), "%"))

        # ── Stress Test Tab ──
        with tabs[3]:
            with st.spinner("Loading stress test..."):
                stress = api.get_stress_test_all(ticker_input)

            if not stress:
                st.warning("No stress test data")
            else:
                st.metric("Overall Risk Rating", stress.get("overall_risk_rating", "N/A"))
                scenarios = stress.get("scenarios", [])
                if scenarios:
                    st.subheader("Scenarios")
                    sdf = pd.DataFrame([
                        {
                            "Scenario": s.get("label") or s.get("name") or s.get("id", ""),
                            "Impact %": s.get("estimated_impact", s.get("priceImpact", 0)),
                            "Stressed Price": s.get("stressedPrice", "N/A"),
                            "Risk": s.get("risk_level", "N/A"),
                        }
                        for s in scenarios
                    ])
                    st.dataframe(sdf, use_container_width=True, hide_index=True)

                    # Bar chart
                    fig = px.bar(
                        sdf, x="Scenario", y="Impact %",
                        color="Impact %", color_continuous_scale=["#F59E0B", "#FBBF24", "#14B8A6"],
                    )
                    fig.update_layout(height=350)
                    st.plotly_chart(fig, use_container_width=True)

                hist = stress.get("historical_events", [])
                if hist:
                    st.subheader("Historical Analogs")
                    for ev in hist[:5]:
                        with st.container(border=True):
                            st.markdown(f"**{ev.get('name', 'Event')}**")
                            st.caption(f"Decline: {ev.get('decline_pct', 'N/A')}% | "
                                       f"Recovery: {ev.get('recovery_months', 'N/A')} months")

        # ── Alt Data Tab ──
        with tabs[4]:
            with st.spinner("Loading alternative data..."):
                alt = api.get_alt_data(ticker_input)

            if not alt:
                st.warning("No alt data available")
            else:
                if alt.get("insider"):
                    st.subheader("Insider Activity")
                    ins = alt["insider"]
                    c1, c2, c3 = st.columns(3)
                    c1.metric("Buys (90d)", ins.get("buys_90d", "N/A"))
                    c2.metric("Sells (90d)", ins.get("sells_90d", "N/A"))
                    c3.metric("Net Sentiment", ins.get("net_sentiment", "N/A"))

                if alt.get("institutional"):
                    st.subheader("Institutional Ownership")
                    inst = alt["institutional"]
                    holders = inst.get("top_holders", [])
                    if holders:
                        st.dataframe(pd.DataFrame(holders), use_container_width=True, hide_index=True)

                if alt.get("brand_signals"):
                    st.subheader("Brand / Social Signals")
                    st.json(alt["brand_signals"])

        # ── News Tab ──
        with tabs[5]:
            with st.spinner("Loading news..."):
                news = api.get_stock_news(ticker_input)
            articles = news.get("articles", news.get("items", [])) if isinstance(news, dict) else []
            for n in articles[:15]:
                title = n.get("title") or n.get("headline", "")
                if title:
                    with st.expander(title):
                        st.caption(n.get("source", ""))
                        st.write(n.get("summary") or n.get("description", ""))
                        url = n.get("url") or n.get("link", "")
                        if url:
                            st.markdown(f"[Read more]({url})")


# ═══════════════════════════════════════════════════════════════
# SCREENER
# ═══════════════════════════════════════════════════════════════
elif page == "📋 Screener":
    st.title("Stock Screener")

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        sort_by = st.selectbox("Sort by", ["score", "ticker", "marketCap", "peRatio"], index=0)
    with c2:
        sort_dir = st.selectbox("Order", ["desc", "asc"], index=0)
    with c3:
        limit = st.selectbox("Limit", [50, 100, 200, 500], index=1)
    with c4:
        min_score = st.slider("Min score", 0.0, 10.0, 0.0, step=0.5)

    if st.button("🔍 Run Screener", type="primary"):
        with st.spinner("Running screener..."):
            result = api.get_screener(
                sortBy=sort_by,
                sortDir=sort_dir,
                limit=limit,
                minScore=min_score if min_score > 0 else None,
            )

        rows = result.get("results", result.get("stocks", [])) if isinstance(result, dict) else []
        if not rows:
            st.warning("No results")
        else:
            st.success(f"Found {len(rows)} stocks")
            df = pd.DataFrame([
                {
                    "Ticker": r.get("ticker", ""),
                    "Company": r.get("companyName", r.get("company_name", "")),
                    "Sector": r.get("sector", ""),
                    "Score": r.get("aiScore", r.get("score", r.get("compositeScore", 0))),
                    "Signal": r.get("score_label", r.get("scoreLabel", "")),
                    "Market Cap": r.get("marketCap", ""),
                    "P/E": r.get("peRatio", ""),
                }
                for r in rows
            ])
            st.dataframe(df, use_container_width=True, hide_index=True)


# ═══════════════════════════════════════════════════════════════
# REPORT CRITIQUE
# ═══════════════════════════════════════════════════════════════
elif page == "📑 Report Critique":
    st.title("Analyst Report Critique")
    st.caption("Compare third-party analyst reports against FII's multi-factor analysis")

    ticker_in = st.text_input("Stock Ticker", value="", placeholder="e.g. NVDA").upper().strip()
    source_in = st.text_input("Source (optional)", placeholder="e.g. Morgan Stanley, Goldman Sachs")

    mode = st.radio("Input method", ["📄 Paste Text", "📎 Upload PDF"], horizontal=True)

    report_text = ""
    pdf_base64 = ""

    if mode == "📄 Paste Text":
        report_text = st.text_area("Paste analyst report text", height=250,
                                    max_chars=15000,
                                    placeholder="Paste the analyst report content here...")
    else:
        pdf_file = st.file_uploader("Upload PDF (max 10MB)", type=["pdf"])
        if pdf_file:
            pdf_bytes = pdf_file.read()
            if len(pdf_bytes) > 10 * 1024 * 1024:
                st.error("File too large. Max 10MB.")
            else:
                pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
                st.success(f"PDF loaded: {pdf_file.name} ({len(pdf_bytes)/1024:.1f} KB)")

    can_run = ticker_in and (report_text.strip() or pdf_base64)

    if st.button("🔬 Analyze Report", type="primary", disabled=not can_run):
        # First fetch FII data inline (same pattern as mobile app)
        with st.spinner(f"Fetching FII data for {ticker_in}..."):
            signal = api.get_signal_detail(ticker_in)
            financials = api.get_stock_financials(ticker_in)
            factors = api.get_factors(ticker_in)
            stress = api.get_stress_test_all(ticker_in)

        # Build FII context string
        fii_context_parts = [f"FII Analysis for {ticker_in}"]
        if signal:
            score = signal.get("score", signal.get("aiScore", "N/A"))
            label = signal.get("score_label", signal.get("scoreLabel", "N/A"))
            fii_context_parts.append(f"Composite Score: {score}/10 ({label})")
            fii_context_parts.append(f"Confidence: {signal.get('confidence', 'N/A')}")

        dims = factors.get("dimensions", {}) if isinstance(factors, dict) else {}
        if dims:
            fii_context_parts.append("\nFactor Scores:")
            for dk in ["upstream", "downstream", "geopolitical", "monetary", "correlations", "risk_performance"]:
                d = dims.get(dk, {})
                if d:
                    fii_context_parts.append(
                        f"  {dk}: {d.get('score', 'N/A')}/10 — {d.get('summary', '')[:150]}"
                    )

        if financials:
            fii_context_parts.append("\nFinancial Metrics:")
            fii_context_parts.append(
                f"  P/E: {cat_value(financials, 'valuation', 'trailing_pe')}, "
                f"Forward P/E: {cat_value(financials, 'valuation', 'forward_pe')}, "
                f"Mkt Cap: {cat_value(financials, 'valuation', 'market_cap')}"
            )
            fii_context_parts.append(
                f"  Rev Growth: {cat_value(financials, 'growth', 'revenue_growth_yoy')}%, "
                f"Net Margin: {cat_value(financials, 'profitability', 'net_margin')}%, "
                f"ROE: {cat_value(financials, 'profitability', 'roe')}%"
            )
            fii_context_parts.append(
                f"  D/E: {cat_value(financials, 'financial_health', 'debt_to_equity')}, "
                f"Beta: {cat_value(financials, 'momentum_technicals', 'beta')}"
            )

        if stress:
            fii_context_parts.append("\nStress Test:")
            for s in (stress.get("scenarios", []) or [])[:4]:
                fii_context_parts.append(
                    f"  {s.get('label', s.get('id', ''))}: {s.get('estimated_impact', 'N/A')}% impact"
                )

        fii_context = "\n".join(fii_context_parts)

        with st.spinner("Critiquing report with AI (~30s)..."):
            result = api.post_critique_report(
                ticker=ticker_in,
                report_text=report_text,
                source=source_in,
                fii_context=fii_context,
                report_pdf_base64=pdf_base64,
            )

        if not result or result.get("error"):
            st.error(f"Analysis failed: {result.get('error', 'Unknown error') if result else 'No response'}")
        else:
            st.success("✅ Analysis complete")

            critique = result.get("critique", {})
            fii_vs = result.get("fii_vs_analyst", {})
            summary = result.get("analyst_summary", {})

            agreement = critique.get("agreement_score", 50)

            col1, col2, col3 = st.columns(3)
            col1.metric("Agreement Score", f"{agreement}/100")
            col2.metric("FII Score", f"{fii_vs.get('fii_score', 'N/A')}/10")
            col3.metric("Analyst Rating", fii_vs.get("analyst_rating", "N/A"))

            st.progress(agreement / 100)

            if result.get("executive_summary"):
                st.subheader("Executive Summary")
                st.info(result["executive_summary"])

            if summary.get("key_thesis"):
                st.subheader("Analyst's Key Thesis")
                st.write(summary["key_thesis"])
                if summary.get("key_claims"):
                    st.markdown("**Key claims:**")
                    for c in summary["key_claims"]:
                        st.markdown(f"- {c}")

            agreements = critique.get("agreements", [])
            if agreements:
                with st.expander(f"✅ Agreements ({len(agreements)})", expanded=True):
                    for a in agreements:
                        st.markdown(f"**Claim:** {a.get('analyst_claim', '')}")
                        st.markdown(f"**FII Data:** {a.get('fii_data', '')}")
                        st.caption(f"Confidence: {a.get('confidence', 'N/A')}")
                        st.divider()

            contradictions = critique.get("contradictions", [])
            if contradictions:
                with st.expander(f"⚠️ Contradictions ({len(contradictions)})", expanded=True):
                    for c in contradictions:
                        st.markdown(f"**Claim:** {c.get('analyst_claim', '')}")
                        st.markdown(f"**FII Data:** {c.get('fii_data', '')}")
                        st.caption(f"Risk: {c.get('risk_level', 'N/A')} | Confidence: {c.get('confidence', 'N/A')}")
                        st.divider()

            blind_spots = critique.get("blind_spots", [])
            if blind_spots:
                with st.expander(f"🔍 Blind Spots ({len(blind_spots)})", expanded=True):
                    for b in blind_spots:
                        st.markdown(f"**Factor:** {b.get('factor', '')}")
                        st.markdown(f"**Finding:** {b.get('fii_finding', '')}")
                        st.caption(f"Why it matters: {b.get('why_it_matters', '')} — Risk: {b.get('risk_level', 'N/A')}")
                        st.divider()

            if result.get("disclaimer"):
                st.caption(result["disclaimer"])


# ═══════════════════════════════════════════════════════════════
# AI COACH
# ═══════════════════════════════════════════════════════════════
elif page == "💬 AI Coach":
    st.title("AI Coach")
    st.caption("Ask questions about stocks, investing concepts, or your portfolio")

    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []
    if "conv_id" not in st.session_state:
        st.session_state.conv_id = None

    mode = st.selectbox("Mode", ["general", "research", "portfolio", "learn"], index=0)
    ticker_ctx = st.text_input("Ticker context (optional)", placeholder="e.g. AAPL").upper().strip()

    # Display chat history
    for msg in st.session_state.chat_history:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])

    if prompt := st.chat_input("Ask anything about investing..."):
        st.session_state.chat_history.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)

        with st.chat_message("assistant"):
            with st.spinner("Thinking..."):
                resp = api.post_coach_message(
                    message=prompt,
                    mode=mode,
                    ticker=ticker_ctx if ticker_ctx else None,
                    conversation_id=st.session_state.conv_id,
                )
            reply = resp.get("reply") or resp.get("message") or resp.get("response", "No response")
            st.markdown(reply)
            st.session_state.chat_history.append({"role": "assistant", "content": reply})
            if resp.get("conversation_id"):
                st.session_state.conv_id = resp["conversation_id"]

    if st.button("Clear chat"):
        st.session_state.chat_history = []
        st.session_state.conv_id = None
        st.rerun()


# ═══════════════════════════════════════════════════════════════
# PORTFOLIO
# ═══════════════════════════════════════════════════════════════
elif page == "💼 Portfolio":
    st.title("Portfolio")
    st.caption("Enter holdings manually for session-based analysis")

    if "holdings" not in st.session_state:
        st.session_state.holdings = []

    with st.form("add_holding"):
        c1, c2, c3, c4 = st.columns([2, 2, 2, 1])
        with c1:
            new_ticker = st.text_input("Ticker").upper().strip()
        with c2:
            new_shares = st.number_input("Shares", min_value=0.0, step=1.0)
        with c3:
            new_cost = st.number_input("Avg Cost", min_value=0.0, step=1.0)
        with c4:
            submit = st.form_submit_button("Add")
        if submit and new_ticker and new_shares > 0:
            st.session_state.holdings.append({
                "ticker": new_ticker,
                "shares": new_shares,
                "avgCost": new_cost,
            })
            st.rerun()

    if not st.session_state.holdings:
        st.info("Add holdings above to see your portfolio analysis")
    else:
        df = pd.DataFrame(st.session_state.holdings)
        df["costBasis"] = df["shares"] * df["avgCost"]

        # Fetch current prices and signals
        tickers = df["ticker"].tolist()
        with st.spinner("Fetching prices & signals..."):
            prices_resp = api.get_batch_prices(tickers)
            signals_resp = api.batch_signals(tickers)

        prices_map = prices_resp.get("prices", {}) if isinstance(prices_resp, dict) else {}
        signals_list = signals_resp.get("signals", []) if isinstance(signals_resp, dict) else []
        signals_map = {s.get("ticker"): s for s in signals_list if s.get("ticker")}

        df["currentPrice"] = df["ticker"].map(lambda t: prices_map.get(t, {}).get("price", 0) if isinstance(prices_map.get(t), dict) else prices_map.get(t, 0))
        df["marketValue"] = df["shares"] * df["currentPrice"]
        df["unrealizedPnL"] = df["marketValue"] - df["costBasis"]
        df["pnlPct"] = ((df["marketValue"] / df["costBasis"] - 1) * 100).fillna(0)
        df["fiiScore"] = df["ticker"].map(lambda t: signals_map.get(t, {}).get("score", "N/A"))

        total_cost = df["costBasis"].sum()
        total_val = df["marketValue"].sum()
        total_pnl = total_val - total_cost

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Total Value", f"${total_val:,.0f}")
        c2.metric("Cost Basis", f"${total_cost:,.0f}")
        c3.metric("P&L", f"${total_pnl:,.0f}",
                  delta=f"{(total_val/total_cost - 1)*100:.1f}%" if total_cost > 0 else None)
        c4.metric("# Positions", len(df))

        st.subheader("Holdings")
        st.dataframe(
            df[["ticker", "shares", "avgCost", "currentPrice", "marketValue", "unrealizedPnL", "pnlPct", "fiiScore"]],
            use_container_width=True,
            hide_index=True,
        )

        # Pie chart of allocation
        if total_val > 0:
            fig = px.pie(df, values="marketValue", names="ticker", title="Allocation by Market Value")
            fig.update_layout(height=400)
            st.plotly_chart(fig, use_container_width=True)

        if st.button("🗑️ Clear portfolio"):
            st.session_state.holdings = []
            st.rerun()


# ═══════════════════════════════════════════════════════════════
# STRATEGY
# ═══════════════════════════════════════════════════════════════
elif page == "📈 Strategy":
    st.title("Strategy")
    st.caption("Portfolio optimization, projections, and correlation analysis")

    tab1, tab2, tab3 = st.tabs(["Market Movers", "Earnings Calendar", "Trending"])

    with tab1:
        st.subheader("Market Movers")
        with st.spinner("Loading movers..."):
            movers = api.get_market_movers()

        if movers:
            cols = st.columns(3)
            with cols[0]:
                st.markdown("**🚀 Top Gainers**")
                for g in (movers.get("gainers", []) or [])[:10]:
                    st.markdown(f"- **{g.get('ticker')}**: +{g.get('changePercent', 0):.2f}%")
            with cols[1]:
                st.markdown("**📉 Top Losers**")
                for l in (movers.get("losers", []) or [])[:10]:
                    st.markdown(f"- **{l.get('ticker')}**: {l.get('changePercent', 0):.2f}%")
            with cols[2]:
                st.markdown("**🔥 Most Active**")
                for m in (movers.get("mostActive", []) or [])[:10]:
                    st.markdown(f"- **{m.get('ticker')}**: vol {m.get('volume', 0):,}")

    with tab2:
        st.subheader("Upcoming Earnings")
        with st.spinner("Loading calendar..."):
            cal = api.get_earnings_calendar()
        events = cal.get("events", cal.get("earnings", [])) if isinstance(cal, dict) else []
        if events:
            edf = pd.DataFrame(events[:50])
            st.dataframe(edf, use_container_width=True, hide_index=True)
        else:
            st.info("No upcoming earnings")

    with tab3:
        st.subheader("Trending Stocks")
        with st.spinner("Loading trending..."):
            tr = api.get_trending()
        items = tr.get("items", []) if isinstance(tr, dict) else []
        for item in items[:15]:
            with st.container(border=True):
                c1, c2, c3 = st.columns([1, 3, 2])
                c1.markdown(f"### {item.get('ticker', '')}")
                c2.markdown(f"**{item.get('companyName', '')}**")
                try:
                    c3.metric("Score", f"{float(item.get('score', 0)):.1f}/10")
                except Exception:
                    c3.metric("Score", "N/A")


# ─── Footer ───
st.divider()
st.caption("📊 FII — Factor Impact Intelligence | Educational analysis of public market data. Not financial advice.")

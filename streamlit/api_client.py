"""FII API Client — wraps all backend endpoints for Streamlit."""

import os
import requests
import streamlit as st

API_BASE = os.environ.get("FII_API_URL", "https://ix1rrsln51.execute-api.us-east-1.amazonaws.com/dev")


def _get(path: str, params: dict | None = None, timeout: int = 30) -> dict:
    try:
        r = requests.get(f"{API_BASE}{path}", params=params, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.RequestException as e:
        st.error(f"API error: {e}")
        return {}


def _post(path: str, body: dict | None = None, timeout: int = 30) -> dict:
    try:
        r = requests.post(f"{API_BASE}{path}", json=body or {}, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except requests.exceptions.RequestException as e:
        st.error(f"API error: {e}")
        return {}


# ── Feed ──
def get_feed(cursor: str | None = None):
    params = {"cursor": cursor} if cursor else None
    return _get("/feed", params)


# ── Screener ──
def get_screener(**kwargs):
    return _get("/screener", {k: str(v) for k, v in kwargs.items() if v is not None})


# ── Signals ──
def get_signal_detail(ticker: str):
    return _get(f"/signals/{ticker}")


def batch_signals(tickers: list[str]):
    return _get("/signals/batch", {"tickers": ",".join(tickers)})


# ── Financials ──
def get_stock_financials(ticker: str):
    return _get(f"/stocks/{ticker}/financials")


def get_fundamentals(ticker: str):
    return _get(f"/fundamentals/{ticker}")


# ── Factors ──
def get_factors(ticker: str):
    return _get(f"/factors/{ticker}")


def get_factor_summaries(ticker: str):
    return _get(f"/stocks/{ticker}/factors")


def get_factor_detail(ticker: str, dimension: str):
    return _get(f"/stocks/{ticker}/factors/{dimension}")


# ── Price ──
def get_price(ticker: str):
    return _get(f"/price/{ticker}")


def get_batch_prices(tickers: list[str]):
    if not tickers:
        return {"prices": {}}
    return _get("/prices/batch", {"tickers": ",".join(tickers)})


# ── Charts ──
def get_chart_data(ticker: str, resolution: str = "D", range_: str = "6M"):
    return _get(f"/charts/{ticker}", {"resolution": resolution, "range": range_})


# ── Stress Test ──
def get_stress_test(ticker: str, scenario: str = "severely_adverse"):
    return _get(f"/stock/{ticker}/stress-test", {"scenario": scenario})


def get_stress_test_all(ticker: str):
    return _get(f"/stock/{ticker}/stress-test/all")


# ── Alt Data ──
def get_alt_data(ticker: str):
    return _get(f"/stocks/{ticker}/alt-data")


# ── News ──
def get_market_news(limit: int = 10):
    return _get("/news/market", {"limit": str(limit)})


def get_stock_news(ticker: str):
    return _get(f"/news/stock/{ticker}")


# ── Coach / Chat ──
def post_coach_message(message: str, mode: str = "general", ticker: str | None = None,
                       conversation_id: str | None = None):
    body = {"message": message, "mode": mode}
    if ticker:
        body["ticker"] = ticker
    if conversation_id:
        body["conversation_id"] = conversation_id
    return _post("/coach/message", body, timeout=60)


def send_chat_message(message: str, context: dict | None = None):
    body: dict = {"message": message}
    if context:
        body["context"] = context
    return _post("/chat", body, timeout=60)


# ── Report Critique ──
def post_critique_report(ticker: str, report_text: str = "", source: str = "",
                         fii_context: str = "", report_pdf_base64: str = ""):
    body: dict = {"ticker": ticker}
    if report_text:
        body["report_text"] = report_text
    if source:
        body["source"] = source
    if fii_context:
        body["fii_context"] = fii_context
    if report_pdf_base64:
        body["report_pdf_base64"] = report_pdf_base64
    return _post("/advisor/critique-report", body, timeout=120)


# ── Portfolio ──
def get_portfolio():
    return _get("/portfolio")


def save_portfolio(holdings: list):
    return _post("/portfolio", {"holdings": holdings})


def get_portfolio_health():
    return _get("/portfolio/health")


def get_portfolio_analytics():
    return _get("/portfolio/analytics")


# ── Strategy ──
def run_optimization(portfolio_value: int = 50000):
    return _post("/strategy/optimize", {"portfolioValue": portfolio_value})


def run_projection(years: int, portfolio_value: int = 50000):
    return _post("/strategy/project", {"years": years, "portfolioValue": portfolio_value})


def get_correlation():
    return _get("/strategy/correlation")


def get_report_card():
    return _get("/strategy/report-card")


# ── Market ──
def get_market_movers():
    return _get("/market/movers")


def get_trending():
    return _get("/trending")


# ── Earnings Calendar ──
def get_earnings_calendar():
    return _get("/earnings/calendar")


# ── Search ──
def search_tickers(query: str):
    return _get("/search", {"q": query})

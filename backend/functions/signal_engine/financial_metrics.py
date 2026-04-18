"""Comprehensive Financial Statistics Module — 69 metrics across 8 categories.

Computes valuation, profitability, growth, financial health, dividends,
analyst estimates, momentum/technicals, and ownership metrics with
sector benchmarks (median + percentile rank).

Data source priority:
  1. PRIMARY: Finnhub (/stock/metric, /stock/profile2, /stock/recommendation,
     /stock/price-target) — works reliably in Lambda.
  2. FALLBACK: EDGAR DynamoDB cache (FINANCIALS#{ticker} | RATIOS).

NO yfinance dependency — it does not work in Lambda (missing curl_cffi).

Results are cached in DynamoDB (PK: FINANCIALS#{ticker}, SK: LATEST, 7-day TTL).
"""

import logging
import math
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Rate-limit constants for batch operations
MAX_CONCURRENT_FETCHES = 5
BATCH_DELAY_SECONDS = 1.0
BATCH_SIZE = 50

# TTL: 7 days in seconds
METRICS_TTL_SECONDS = 7 * 24 * 3600

# All 8 categories and their metric keys (69 total)
METRIC_CATEGORIES = {
    "valuation": [
        "trailing_pe", "forward_pe", "peg_ratio", "price_to_sales",
        "price_to_book", "ev_to_ebitda", "ev_to_revenue", "enterprise_value",
        "fcf_yield", "earnings_yield", "market_cap",
    ],
    "profitability": [
        "gross_margin", "operating_margin", "net_margin", "roe", "roa",
        "roic", "ebitda", "eps_ttm", "revenue_per_share",
    ],
    "growth": [
        "revenue_growth_yoy", "revenue_growth_3y_cagr", "eps_growth_yoy",
        "eps_growth_3y_cagr", "fcf_growth_yoy", "book_value_growth_yoy",
        "revenue_growth_qoq", "earnings_growth_qoq",
    ],
    "financial_health": [
        "debt_to_equity", "current_ratio", "quick_ratio", "interest_coverage",
        "total_cash", "total_debt", "book_value_per_share", "cash_per_share",
        "altman_z_score",
    ],
    "dividends": [
        "dividend_yield", "payout_ratio", "dividend_growth_5y",
        "ex_dividend_date", "dividend_per_share",
        "years_of_consecutive_dividends",
    ],
    "analyst_estimates": [
        "target_price_low", "target_price_mean", "target_price_high",
        "recommendation_score", "num_analysts", "current_q_eps_estimate",
        "current_y_eps_estimate", "eps_revision_trend",
    ],
    "momentum_technicals": [
        "price_change_1m", "price_change_3m", "price_change_6m",
        "price_change_1y", "rsi_14", "macd_signal", "sma_20_distance",
        "sma_200_distance", "beta", "atr_14",
    ],
    "ownership": [
        "institutional_pct", "insider_pct", "short_pct_float",
        "short_ratio", "shares_outstanding", "float_shares",
        "insider_buys_6m", "insider_sells_6m",
    ],
}

# Flat list of all 69 metric keys
ALL_METRIC_KEYS = []
for _cat_metrics in METRIC_CATEGORIES.values():
    ALL_METRIC_KEYS.extend(_cat_metrics)


# ─── Utility helpers ───


def _safe_get(d: dict, key: str) -> Optional[float]:
    """Safely extract a numeric value from a dict."""
    val = d.get(key)
    if val is None:
        return None
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def _pct(val: Optional[float]) -> Optional[float]:
    """Convert fraction (0.xx) to percentage."""
    if val is None:
        return None
    return round(val * 100, 2)


def _safe_divide(a: Optional[float], b: Optional[float]) -> Optional[float]:
    """Safe division returning None on failure."""
    if a is None or b is None or b == 0:
        return None
    return a / b


def _cagr(start: Optional[float], end: Optional[float], years: int) -> Optional[float]:
    """Compute compound annual growth rate."""
    if start is None or end is None or start <= 0 or years <= 0:
        return None
    try:
        return round(((end / start) ** (1 / years) - 1) * 100, 2)
    except (ZeroDivisionError, ValueError):
        return None


# ─── Source 1: Finnhub (PRIMARY) ───


def _fetch_finnhub_metrics(ticker: str) -> dict:
    """Fetch comprehensive metrics from Finnhub API.

    Calls:
      - /stock/metric?metric=all  (100+ financial metrics)
      - /stock/profile2           (market cap, shares, industry)
      - /stock/recommendation     (analyst recommendations)
      - /stock/price-target       (analyst price targets)

    Returns dict with raw Finnhub data keyed by endpoint.
    """
    try:
        import finnhub_client
    except ImportError as e:
        logger.error(f"[FinancialMetrics] FAILED to import finnhub_client: {e}")
        raise

    result = {"metrics": {}, "profile": {}, "recommendations": [], "price_target": {}}

    # 1) Basic financials — the main payload
    logger.info(f"[FinancialMetrics] Calling Finnhub /stock/metric for {ticker}")
    data = finnhub_client._request("stock/metric", {"symbol": ticker, "metric": "all"})
    if data and data.get("metric"):
        result["metrics"] = data["metric"]
        logger.info(f"[FinancialMetrics] Finnhub /stock/metric returned {len(data['metric'])} keys for {ticker}")
        # Log ALL available keys so we can see what Finnhub actually returns
        logger.info(f"[FinancialMetrics] Finnhub keys for {ticker}: {sorted(data['metric'].keys())}")
    else:
        logger.warning(f"[FinancialMetrics] Finnhub /stock/metric returned empty for {ticker}")

    # 2) Company profile
    logger.info(f"[FinancialMetrics] Calling Finnhub get_company_profile for {ticker}")
    profile = finnhub_client.get_company_profile(ticker)
    if profile:
        result["profile"] = profile
        logger.info(f"[FinancialMetrics] Finnhub get_company_profile returned data for {ticker}")
    else:
        logger.warning(f"[FinancialMetrics] Finnhub get_company_profile returned empty for {ticker}")

    # 3) Analyst recommendations
    logger.info(f"[FinancialMetrics] Calling Finnhub /stock/recommendation for {ticker}")
    recs = finnhub_client._request("stock/recommendation", {"symbol": ticker})
    if recs and isinstance(recs, list) and len(recs) > 0:
        result["recommendations"] = recs
        logger.info(f"[FinancialMetrics] Finnhub /stock/recommendation returned {len(recs)} periods for {ticker}")
    else:
        logger.warning(f"[FinancialMetrics] Finnhub /stock/recommendation returned empty for {ticker}")

    # 4) Price targets
    logger.info(f"[FinancialMetrics] Calling Finnhub /stock/price-target for {ticker}")
    pt = finnhub_client._request("stock/price-target", {"symbol": ticker})
    if pt and pt.get("targetMean"):
        result["price_target"] = pt
        logger.info(f"[FinancialMetrics] Finnhub /stock/price-target returned data for {ticker}")
    else:
        logger.warning(f"[FinancialMetrics] Finnhub /stock/price-target returned empty for {ticker}")

    return result


def _map_finnhub_to_metrics(fh: dict) -> dict:
    """Map Finnhub API data to our 69 metric keys.

    Args:
        fh: dict with keys 'metrics', 'profile', 'recommendations', 'price_target'
            as returned by _fetch_finnhub_metrics().

    Returns:
        Flat dict: metric_key -> value (numeric or None).
    """
    m = fh.get("metrics", {})
    profile = fh.get("profile", {})
    recs = fh.get("recommendations", [])
    pt = fh.get("price_target", {})

    metrics = {}

    # ─── VALUATION (11) ───
    metrics["trailing_pe"] = _safe_get(m, "peBasicExclExtraTTM") or _safe_get(m, "peTTM")
    metrics["forward_pe"] = _safe_get(m, "peNTM")
    metrics["peg_ratio"] = _safe_get(m, "pegRatio")
    metrics["price_to_sales"] = _safe_get(m, "psTTM") or _safe_get(m, "psAnnual")
    metrics["price_to_book"] = _safe_get(m, "pbQuarterly") or _safe_get(m, "pbAnnual")
    metrics["ev_to_ebitda"] = _safe_get(m, "currentEv/ebitdaTTM")
    metrics["ev_to_revenue"] = _safe_get(m, "enterpriseValue/revenueTTM")
    ev = _safe_get(m, "enterpriseValueTTM") or _safe_get(m, "enterpriseValue")
    metrics["enterprise_value"] = ev

    # FCF yield = FCF / market cap
    fcf_ttm = _safe_get(m, "freeCashFlowTTM")
    fcf_per_share = _safe_get(m, "fcfPerShareTTM") or _safe_get(m, "freeCashFlowPerShareTTM")
    mcap_for_fcf = metrics.get("market_cap")
    if fcf_ttm is not None and mcap_for_fcf and mcap_for_fcf > 0:
        metrics["fcf_yield"] = round((fcf_ttm / mcap_for_fcf) * 100, 2)
    elif fcf_per_share is not None and metrics.get("trailing_pe") is not None:
        eps = _safe_get(m, "epsBasicExclExtraItemsTTM")
        if eps and metrics["trailing_pe"]:
            price_est = eps * metrics["trailing_pe"]
            if price_est > 0:
                metrics["fcf_yield"] = round((fcf_per_share / price_est) * 100, 2)
            else:
                metrics["fcf_yield"] = None
        else:
            metrics["fcf_yield"] = None
    else:
        metrics["fcf_yield"] = None

    # Earnings yield = 1 / PE * 100
    if metrics.get("trailing_pe") and metrics["trailing_pe"] > 0:
        metrics["earnings_yield"] = round((1 / metrics["trailing_pe"]) * 100, 2)
    else:
        metrics["earnings_yield"] = None

    # Market cap: Finnhub returns in millions, profile already converts
    mcap = profile.get("marketCap")
    if mcap is None:
        mcap_m = _safe_get(m, "marketCapitalization")
        if mcap_m is not None:
            mcap = mcap_m * 1_000_000  # Finnhub metric is in millions
    metrics["market_cap"] = mcap

    # ─── PROFITABILITY (9) ───
    # Finnhub returns margins/ratios already as percentages (e.g. 83.04 = 83.04%)
    # Do NOT apply _pct() which would multiply by 100 again.
    metrics["gross_margin"] = _safe_get(m, "grossMarginTTM") or _safe_get(m, "grossMarginAnnual")
    metrics["operating_margin"] = _safe_get(m, "operatingMarginTTM") or _safe_get(m, "operatingMarginAnnual")
    metrics["net_margin"] = _safe_get(m, "netProfitMarginTTM") or _safe_get(m, "netProfitMarginAnnual")
    metrics["roe"] = _safe_get(m, "roeTTM") or _safe_get(m, "roeRfy")
    metrics["roa"] = _safe_get(m, "roaTTM") or _safe_get(m, "roaRfy")
    metrics["roic"] = _safe_get(m, "roicTTM") or _safe_get(m, "roicExclGoodwillTTM") or _safe_get(m, "roicAnnual")
    metrics["ebitda"] = _safe_get(m, "ebitdTTM") or _safe_get(m, "ebitdaCagr5Y")  # Finnhub uses "ebitdTTM" (not ebitda)
    if metrics["ebitda"] is None:
        metrics["ebitda"] = _safe_get(m, "ebitdaPerShareTTM")  # Fallback to per-share * shares
        shares_out = _safe_get(m, "sharesOutstanding")
        if metrics["ebitda"] is not None and shares_out:
            metrics["ebitda"] = round(metrics["ebitda"] * shares_out, 2)
    metrics["eps_ttm"] = _safe_get(m, "epsBasicExclExtraItemsTTM") or _safe_get(m, "epsInclExtraItemsTTM")
    metrics["revenue_per_share"] = _safe_get(m, "revenuePerShareTTM") or _safe_get(m, "revenuePerShareAnnual")

    # ─── GROWTH (8) ───
    metrics["revenue_growth_yoy"] = _safe_get(m, "revenueGrowthTTMYoy") or _safe_get(m, "revenueGrowth3Y")
    metrics["revenue_growth_3y_cagr"] = _safe_get(m, "revenueGrowth3Y")
    metrics["eps_growth_yoy"] = _safe_get(m, "epsGrowthTTMYoy")
    metrics["eps_growth_3y_cagr"] = _safe_get(m, "epsGrowth3Y")
    # FCF growth
    fcf_growth_5y = _safe_get(m, "freeCashFlowGrowth5Y")
    metrics["fcf_growth_yoy"] = _safe_get(m, "fcfGrowthTTMYoy") or fcf_growth_5y
    metrics["book_value_growth_yoy"] = _safe_get(m, "bookValueGrowthTTMYoy") or _safe_get(m, "bookValuePerShareGrowth5Y")
    metrics["revenue_growth_qoq"] = _safe_get(m, "revenueGrowthQuarterlyYoy")
    metrics["earnings_growth_qoq"] = _safe_get(m, "epsGrowthQuarterlyYoy")

    # ─── FINANCIAL HEALTH (9) ───
    metrics["debt_to_equity"] = _safe_get(m, "totalDebt/totalEquityQuarterly") or _safe_get(m, "totalDebt/totalEquityAnnual")
    metrics["current_ratio"] = _safe_get(m, "currentRatioQuarterly") or _safe_get(m, "currentRatioAnnual")
    metrics["quick_ratio"] = _safe_get(m, "quickRatioQuarterly") or _safe_get(m, "quickRatioAnnual")
    metrics["interest_coverage"] = _safe_get(m, "interestCoverageTTM") or _safe_get(m, "interestCoverageAnnual")
    metrics["total_cash"] = _safe_get(m, "cashAndShortTermInvestmentsQuarterly")
    metrics["total_debt"] = _safe_get(m, "totalDebtQuarterly") or _safe_get(m, "totalDebtAnnual")
    metrics["book_value_per_share"] = _safe_get(m, "bookValuePerShareQuarterly") or _safe_get(m, "bookValuePerShareAnnual")
    shares_out_val = _safe_get(m, "sharesOutstanding")
    cash_val = metrics.get("total_cash")
    if cash_val is not None and shares_out_val and shares_out_val > 0:
        metrics["cash_per_share"] = round(cash_val / shares_out_val, 2)
    else:
        metrics["cash_per_share"] = _safe_get(m, "cashPerSharePerShareQuarterly")

    # Altman Z-Score — compute from Finnhub components
    metrics["altman_z_score"] = _compute_altman_z_from_finnhub(m, metrics)

    # ─── DIVIDENDS (6) ───
    metrics["dividend_yield"] = _safe_get(m, "dividendYieldIndicatedAnnual")
    if metrics["dividend_yield"] is not None:
        metrics["dividend_yield"] = round(metrics["dividend_yield"] * 100, 2) if metrics["dividend_yield"] < 1 else round(metrics["dividend_yield"], 2)
    metrics["payout_ratio"] = _safe_get(m, "payoutRatioTTM") or _safe_get(m, "payoutRatioAnnual")
    metrics["dividend_growth_5y"] = _safe_get(m, "dividendGrowthRate5Y")
    metrics["ex_dividend_date"] = None  # Not in /stock/metric
    metrics["dividend_per_share"] = _safe_get(m, "dividendPerShareAnnual") or _safe_get(m, "dividendPerShareTTM")
    metrics["years_of_consecutive_dividends"] = None  # Not in Finnhub

    # ─── ANALYST ESTIMATES (8) ───
    if pt:
        metrics["target_price_low"] = _safe_get(pt, "targetLow")
        metrics["target_price_mean"] = _safe_get(pt, "targetMean")
        metrics["target_price_high"] = _safe_get(pt, "targetHigh")
        metrics["num_analysts"] = _safe_get(pt, "lastUpdated") and int(pt.get("numberOfAnalysts", 0)) or None
        if pt.get("numberOfAnalysts"):
            metrics["num_analysts"] = int(pt["numberOfAnalysts"])
    else:
        metrics["target_price_low"] = None
        metrics["target_price_mean"] = None
        metrics["target_price_high"] = None
        metrics["num_analysts"] = None

    # Recommendation score (1=strong buy, 5=strong sell)
    if recs:
        latest = recs[0]  # Most recent period
        buy = latest.get("buy", 0) + latest.get("strongBuy", 0)
        hold = latest.get("hold", 0)
        sell = latest.get("sell", 0) + latest.get("strongSell", 0)
        total = buy + hold + sell
        if total > 0:
            # Convert to 1-5 scale: 1=all buy, 3=all hold, 5=all sell
            score = (latest.get("strongBuy", 0) * 1 +
                     latest.get("buy", 0) * 2 +
                     latest.get("hold", 0) * 3 +
                     latest.get("sell", 0) * 4 +
                     latest.get("strongSell", 0) * 5) / total
            metrics["recommendation_score"] = round(score, 2)
            if metrics["num_analysts"] is None:
                metrics["num_analysts"] = total
        else:
            metrics["recommendation_score"] = None
    else:
        metrics["recommendation_score"] = None

    metrics["current_q_eps_estimate"] = _safe_get(m, "epsEstimateNextQuarter")
    metrics["current_y_eps_estimate"] = _safe_get(m, "epsEstimateCurrentYear")
    metrics["eps_revision_trend"] = None  # Not directly available

    # ─── MOMENTUM & TECHNICALS (10) ───
    metrics["price_change_1m"] = _safe_get(m, "monthToDatePriceReturnDaily") or _safe_get(m, "1MonthPriceReturnDaily")
    metrics["price_change_3m"] = _safe_get(m, "3MonthPriceReturnDaily")
    metrics["price_change_6m"] = _safe_get(m, "6MonthPriceReturnDaily")
    metrics["price_change_1y"] = _safe_get(m, "yearToDatePriceReturnDaily")
    metrics["rsi_14"] = None  # Computed from candles below
    metrics["macd_signal"] = None  # Computed from candles below
    metrics["sma_20_distance"] = None  # Computed from candles below
    metrics["sma_200_distance"] = None  # Computed from candles below
    metrics["beta"] = _safe_get(m, "beta")
    metrics["atr_14"] = None  # Computed from candles below

    # ─── OWNERSHIP (8) ───
    metrics["institutional_pct"] = None  # Not in free-tier /stock/metric
    metrics["insider_pct"] = None
    metrics["short_pct_float"] = None
    metrics["short_ratio"] = None
    metrics["shares_outstanding"] = _safe_get(m, "sharesOutstanding")
    metrics["float_shares"] = None  # Not in Finnhub free tier
    metrics["insider_buys_6m"] = None  # Would need /stock/insider-transactions
    metrics["insider_sells_6m"] = None

    return metrics


def _compute_altman_z_from_finnhub(m: dict, metrics: dict) -> Optional[float]:
    """Compute Altman Z-Score from Finnhub metric data.

    Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
    """
    total_assets = _safe_get(m, "totalAssetsQuarterly") or _safe_get(m, "totalAssetsAnnual")
    if not total_assets or total_assets == 0:
        return None

    try:
        # A = Working Capital / Total Assets
        cr = _safe_get(m, "currentRatioQuarterly") or _safe_get(m, "currentRatioAnnual")
        a_ratio = 0
        if cr and cr > 0:
            a_ratio = (cr - 1) / (cr * 5)  # Approximate

        # B = Retained Earnings / Total Assets (approx from book value)
        bvps = _safe_get(m, "bookValuePerShareQuarterly")
        shares = _safe_get(m, "sharesOutstanding")
        b_ratio = 0
        if bvps and shares:
            b_ratio = (bvps * shares) / total_assets

        # C = EBIT / Total Assets
        ebitda = _safe_get(m, "ebitdTTM") or _safe_get(m, "ebitdaPerShareTTM")
        c_ratio = ebitda / total_assets if ebitda else 0

        # D = Market Cap / Total Liabilities
        mcap = metrics.get("market_cap") or 0
        total_debt = _safe_get(m, "totalDebtQuarterly") or _safe_get(m, "totalDebtAnnual") or 0
        d_ratio = mcap / total_debt if total_debt > 0 else 0

        # E = Revenue / Total Assets
        rev_ps = _safe_get(m, "revenuePerShareTTM")
        e_ratio = 0
        if rev_ps and shares:
            e_ratio = (rev_ps * shares) / total_assets

        z = 1.2 * a_ratio + 1.4 * b_ratio + 3.3 * c_ratio + 0.6 * d_ratio + 1.0 * e_ratio
        return round(z, 2)
    except Exception:
        return None


def _compute_derived_metrics(metrics: dict, fh_metrics: dict, edgar: dict) -> None:
    """Compute derived metrics from available Finnhub and EDGAR data.

    Fills in metrics that Finnhub free tier doesn't provide directly
    but CAN be computed from data we already have. Modifies metrics in place.
    """
    m = fh_metrics  # Finnhub raw metrics dict

    # --- forward_pe: price / forward_eps ---
    if metrics.get("forward_pe") is None:
        # Try from EPS estimates
        fwd_eps = _safe_get(m, "epsEstimateCurrentYear") or _safe_get(m, "epsEstimateNextQuarter")
        eps_ttm = metrics.get("eps_ttm")
        trailing_pe = metrics.get("trailing_pe")
        if fwd_eps and fwd_eps > 0 and trailing_pe and eps_ttm and eps_ttm > 0:
            price_est = eps_ttm * trailing_pe
            metrics["forward_pe"] = round(price_est / fwd_eps, 2)
        elif trailing_pe and metrics.get("eps_growth_yoy") is not None:
            # Rough estimate: trailing_pe / (1 + growth_rate)
            growth = metrics["eps_growth_yoy"] / 100.0
            if 1 + growth > 0:
                metrics["forward_pe"] = round(trailing_pe / (1 + growth), 2)

    # --- peg_ratio: trailing_pe / eps_growth_yoy ---
    if metrics.get("peg_ratio") is None:
        trailing_pe = metrics.get("trailing_pe")
        eps_growth = metrics.get("eps_growth_yoy")
        if trailing_pe and eps_growth and eps_growth > 0:
            metrics["peg_ratio"] = round(trailing_pe / eps_growth, 2)

    # --- ev_to_ebitda: enterprise_value / ebitda ---
    if metrics.get("ev_to_ebitda") is None:
        ev_val = metrics.get("enterprise_value")
        ebitda_val = metrics.get("ebitda")
        if ev_val and ebitda_val and ebitda_val > 0:
            metrics["ev_to_ebitda"] = round(ev_val / ebitda_val, 2)

    # --- ev_to_revenue: enterprise_value / revenue ---
    if metrics.get("ev_to_revenue") is None:
        ev_val = metrics.get("enterprise_value")
        rev_ps = _safe_get(m, "revenuePerShareTTM")
        shares = _safe_get(m, "sharesOutstanding")
        edgar_revenue = _safe_float(edgar.get("revenue"))
        revenue = (rev_ps * shares) if (rev_ps and shares) else edgar_revenue
        if ev_val and revenue and revenue > 0:
            metrics["ev_to_revenue"] = round(ev_val / revenue, 2)

    # --- fcf_yield: fallback using EDGAR (net_income + depreciation - capex) / market_cap ---
    if metrics.get("fcf_yield") is None:
        net_inc = _safe_float(edgar.get("net_income"))
        capex = _safe_float(edgar.get("capital_expenditure")) or _safe_get(m, "capitalExpenditureTTM")
        mcap = metrics.get("market_cap")
        if net_inc is not None and mcap and mcap > 0:
            # Approximate FCF as net_income - capex (depreciation already in net income)
            capex_val = abs(capex) if capex else 0
            fcf_approx = net_inc - capex_val
            metrics["fcf_yield"] = round((fcf_approx / mcap) * 100, 2)

    # --- roic: net_income / (total_assets - current_liabilities) from EDGAR ---
    if metrics.get("roic") is None:
        net_inc = _safe_float(edgar.get("net_income"))
        total_assets = _safe_float(edgar.get("total_assets"))
        current_liab = _safe_float(edgar.get("current_liabilities"))
        if net_inc is not None and total_assets and current_liab is not None:
            invested_capital = total_assets - current_liab
            if invested_capital > 0:
                metrics["roic"] = round((net_inc / invested_capital) * 100, 2)

    # --- interest_coverage: operating_income / interest_expense from EDGAR ---
    if metrics.get("interest_coverage") is None:
        op_inc = _safe_float(edgar.get("operating_income"))
        interest_exp = _safe_float(edgar.get("interest_expense"))
        if op_inc is not None and interest_exp and interest_exp > 0:
            metrics["interest_coverage"] = round(op_inc / interest_exp, 2)

    # --- altman_z_score: compute from EDGAR balance sheet if still null ---
    if metrics.get("altman_z_score") is None:
        metrics["altman_z_score"] = _compute_altman_z_from_edgar(edgar, metrics)

    # --- total_debt: total_liabilities - current_liabilities from EDGAR ---
    if metrics.get("total_debt") is None:
        total_liab = _safe_float(edgar.get("total_liabilities"))
        current_liab = _safe_float(edgar.get("current_liabilities"))
        if total_liab is not None and current_liab is not None:
            metrics["total_debt"] = round(total_liab - current_liab, 2)

    # --- shares_outstanding: market_cap / price ---
    if metrics.get("shares_outstanding") is None:
        mcap = metrics.get("market_cap")
        # Try to get current price from candle-based price or PE * EPS
        eps_ttm = metrics.get("eps_ttm")
        trailing_pe = metrics.get("trailing_pe")
        if mcap and eps_ttm and trailing_pe and eps_ttm > 0:
            price_est = eps_ttm * trailing_pe
            if price_est > 0:
                metrics["shares_outstanding"] = round(mcap / price_est, 0)

    # --- float_shares: shares_outstanding * (1 - insider_pct) ---
    if metrics.get("float_shares") is None:
        shares = metrics.get("shares_outstanding")
        insider_pct = metrics.get("insider_pct")
        if shares and insider_pct is not None:
            metrics["float_shares"] = round(shares * (1 - insider_pct / 100), 0)

    # --- gross_margin from EDGAR ---
    if metrics.get("gross_margin") is None:
        gross_profit = _safe_float(edgar.get("gross_profit"))
        revenue = _safe_float(edgar.get("revenue"))
        if gross_profit is not None and revenue and revenue > 0:
            metrics["gross_margin"] = round((gross_profit / revenue) * 100, 2)

    # --- operating_margin from EDGAR ---
    if metrics.get("operating_margin") is None:
        op_inc = _safe_float(edgar.get("operating_income"))
        revenue = _safe_float(edgar.get("revenue"))
        if op_inc is not None and revenue and revenue > 0:
            metrics["operating_margin"] = round((op_inc / revenue) * 100, 2)

    # --- net_margin from EDGAR ---
    if metrics.get("net_margin") is None:
        net_inc = _safe_float(edgar.get("net_income"))
        revenue = _safe_float(edgar.get("revenue"))
        if net_inc is not None and revenue and revenue > 0:
            metrics["net_margin"] = round((net_inc / revenue) * 100, 2)

    # --- debt_to_equity from EDGAR ---
    if metrics.get("debt_to_equity") is None:
        total_liab = _safe_float(edgar.get("total_liabilities"))
        equity = _safe_float(edgar.get("stockholders_equity"))
        if total_liab is not None and equity and equity > 0:
            metrics["debt_to_equity"] = round(total_liab / equity, 2)

    # --- current_ratio from EDGAR ---
    if metrics.get("current_ratio") is None:
        current_assets = _safe_float(edgar.get("current_assets"))
        current_liab = _safe_float(edgar.get("current_liabilities"))
        if current_assets is not None and current_liab and current_liab > 0:
            metrics["current_ratio"] = round(current_assets / current_liab, 2)

    # --- roe from EDGAR: net_income / stockholders_equity ---
    if metrics.get("roe") is None:
        net_inc = _safe_float(edgar.get("net_income"))
        equity = _safe_float(edgar.get("stockholders_equity"))
        if net_inc is not None and equity and equity > 0:
            metrics["roe"] = round((net_inc / equity) * 100, 2)

    # --- roa from EDGAR: net_income / total_assets ---
    if metrics.get("roa") is None:
        net_inc = _safe_float(edgar.get("net_income"))
        total_assets = _safe_float(edgar.get("total_assets"))
        if net_inc is not None and total_assets and total_assets > 0:
            metrics["roa"] = round((net_inc / total_assets) * 100, 2)

    # --- earnings_yield from trailing_pe ---
    if metrics.get("earnings_yield") is None and metrics.get("trailing_pe"):
        pe = metrics["trailing_pe"]
        if pe > 0:
            metrics["earnings_yield"] = round((1 / pe) * 100, 2)

    # --- book_value_per_share from EDGAR ---
    if metrics.get("book_value_per_share") is None:
        equity = _safe_float(edgar.get("stockholders_equity"))
        shares = metrics.get("shares_outstanding") or _safe_float(edgar.get("shares_outstanding"))
        if equity is not None and shares and shares > 0:
            metrics["book_value_per_share"] = round(equity / shares, 2)

    # --- cash_per_share from EDGAR ---
    if metrics.get("cash_per_share") is None:
        cash = _safe_float(edgar.get("cash"))
        shares = metrics.get("shares_outstanding") or _safe_float(edgar.get("shares_outstanding"))
        if cash is not None and shares and shares > 0:
            metrics["cash_per_share"] = round(cash / shares, 2)

    # --- total_cash from EDGAR ---
    if metrics.get("total_cash") is None:
        cash = _safe_float(edgar.get("cash"))
        if cash is not None:
            metrics["total_cash"] = cash

    # --- quick_ratio: (current_assets - inventory) / current_liabilities ---
    if metrics.get("quick_ratio") is None:
        current_assets = _safe_float(edgar.get("current_assets"))
        current_liab = _safe_float(edgar.get("current_liabilities"))
        inventory = _safe_float(edgar.get("inventory")) or 0
        if current_assets is not None and current_liab and current_liab > 0:
            metrics["quick_ratio"] = round((current_assets - inventory) / current_liab, 2)


def _safe_float(val) -> Optional[float]:
    """Convert a value to float safely, returning None on failure."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def _compute_altman_z_from_edgar(edgar: dict, metrics: dict) -> Optional[float]:
    """Compute Altman Z-Score from EDGAR balance sheet data.

    Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
    where A = working_capital/total_assets, B = retained_earnings/total_assets,
    C = EBIT/total_assets, D = market_cap/total_liabilities, E = revenue/total_assets
    """
    total_assets = _safe_float(edgar.get("total_assets"))
    if not total_assets or total_assets == 0:
        return None

    try:
        current_assets = _safe_float(edgar.get("current_assets")) or 0
        current_liab = _safe_float(edgar.get("current_liabilities")) or 0
        working_capital = current_assets - current_liab
        a_ratio = working_capital / total_assets

        # B = retained_earnings / total_assets (approximate with stockholders_equity)
        equity = _safe_float(edgar.get("stockholders_equity")) or 0
        b_ratio = equity / total_assets

        # C = EBIT / total_assets (use operating_income as EBIT proxy)
        ebit = _safe_float(edgar.get("operating_income")) or 0
        c_ratio = ebit / total_assets

        # D = market_cap / total_liabilities
        mcap = metrics.get("market_cap") or 0
        total_liab = _safe_float(edgar.get("total_liabilities")) or 0
        d_ratio = mcap / total_liab if total_liab > 0 else 0

        # E = revenue / total_assets
        revenue = _safe_float(edgar.get("revenue")) or 0
        e_ratio = revenue / total_assets

        z = 1.2 * a_ratio + 1.4 * b_ratio + 3.3 * c_ratio + 0.6 * d_ratio + 1.0 * e_ratio
        return round(z, 2)
    except Exception:
        return None


def _fill_technicals_from_candles(metrics: dict, ticker: str) -> None:
    """Compute RSI, MACD, SMA distance, ATR from Finnhub candle data.

    Modifies metrics dict in place.
    """
    try:
        import finnhub_client
        logger.info(f"[FinancialMetrics] Calling Finnhub get_candles for {ticker} (technicals)")
        candles = finnhub_client.get_candles(ticker, resolution="D")
        logger.info(f"[FinancialMetrics] Finnhub get_candles returned {len(candles) if candles else 0} candles for {ticker}")
        if not candles or len(candles) < 20:
            logger.info(f"[FinancialMetrics] Not enough candle data for technicals ({len(candles) if candles else 0} candles)")
            return

        closes = [c["close"] for c in candles]
        highs = [c["high"] for c in candles]
        lows = [c["low"] for c in candles]

        # RSI-14
        if len(closes) >= 15:
            metrics["rsi_14"] = _compute_rsi_from_list(closes, 14)

        # MACD signal
        if len(closes) >= 35:
            metrics["macd_signal"] = _compute_macd_signal_from_list(closes)

        # SMA distances
        if len(closes) >= 20:
            sma20 = sum(closes[-20:]) / 20
            current = closes[-1]
            if sma20 > 0:
                metrics["sma_20_distance"] = round(((current - sma20) / sma20) * 100, 2)

        if len(closes) >= 200:
            sma200 = sum(closes[-200:]) / 200
            current = closes[-1]
            if sma200 > 0:
                metrics["sma_200_distance"] = round(((current - sma200) / sma200) * 100, 2)

        # ATR-14
        if len(closes) >= 15:
            metrics["atr_14"] = _compute_atr_from_lists(highs, lows, closes, 14)

        # Fill price changes from candles if Finnhub metrics didn't provide them
        if metrics.get("price_change_1m") is None and len(closes) >= 21:
            past = closes[-21]
            if past > 0:
                metrics["price_change_1m"] = round(((closes[-1] - past) / past) * 100, 2)
        if metrics.get("price_change_3m") is None and len(closes) >= 63:
            past = closes[-63]
            if past > 0:
                metrics["price_change_3m"] = round(((closes[-1] - past) / past) * 100, 2)
        if metrics.get("price_change_6m") is None and len(closes) >= 126:
            past = closes[-126]
            if past > 0:
                metrics["price_change_6m"] = round(((closes[-1] - past) / past) * 100, 2)
        if metrics.get("price_change_1y") is None and len(closes) >= 252:
            past = closes[-min(252, len(closes))]
            if past > 0:
                metrics["price_change_1y"] = round(((closes[-1] - past) / past) * 100, 2)

    except Exception as e:
        logger.warning(f"[FinancialMetrics] Failed to compute technicals from candles for {ticker}: {e}")


def _compute_rsi_from_list(closes: list, period: int = 14) -> Optional[float]:
    """Compute RSI from a list of close prices."""
    if len(closes) < period + 1:
        return None
    try:
        deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
        recent = deltas[-period:]
        gains = [d for d in recent if d > 0]
        losses = [-d for d in recent if d < 0]
        avg_gain = sum(gains) / period if gains else 0
        avg_loss = sum(losses) / period if losses else 0
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return round(100 - (100 / (1 + rs)), 2)
    except Exception:
        return None


def _compute_macd_signal_from_list(closes: list) -> Optional[str]:
    """Compute MACD signal (bullish/bearish/neutral) from close prices."""
    if len(closes) < 35:
        return None
    try:
        ema12 = _ema(closes, 12)
        ema26 = _ema(closes, 26)
        if ema12 is None or ema26 is None:
            return None
        macd_line = ema12 - ema26
        if macd_line > 0:
            return "bullish"
        elif macd_line < 0:
            return "bearish"
        return "neutral"
    except Exception:
        return None


def _ema(data, period: int) -> Optional[float]:
    """Compute exponential moving average."""
    if data is None or len(data) < period:
        return None
    try:
        multiplier = 2 / (period + 1)
        ema = float(data[0])
        for val in data[1:]:
            ema = (float(val) - ema) * multiplier + ema
        return ema
    except Exception:
        return None


def _compute_atr_from_lists(highs: list, lows: list, closes: list, period: int = 14) -> Optional[float]:
    """Compute Average True Range from lists."""
    if len(closes) < period + 1:
        return None
    try:
        trs = []
        for i in range(1, len(highs)):
            tr = max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i - 1]),
                abs(lows[i] - closes[i - 1]),
            )
            trs.append(tr)
        if len(trs) < period:
            return None
        return round(sum(trs[-period:]) / period, 2)
    except Exception:
        return None


# ─── Source 2: EDGAR DynamoDB cache (FALLBACK) ───


def _fetch_edgar_ratios_from_dynamo(ticker: str) -> dict:
    """Read cached EDGAR ratios from DynamoDB (FINANCIALS#{ticker} | RATIOS).

    These are computed by edgar_data.get_financial_ratios() and contain
    real fundamental data (ROE, net_margin, current_ratio, etc.).

    Returns a flat dict of ratio values, or empty dict on failure.
    """
    try:
        import db
        logger.info(f"[FinancialMetrics] Reading EDGAR ratios from DynamoDB for {ticker}")
        item = db.get_item(f"FINANCIALS#{ticker.upper()}", "RATIOS")
        if item:
            logger.info(f"[FinancialMetrics] EDGAR ratios found in DynamoDB for {ticker} ({len(item)} keys)")
            return item
        else:
            logger.info(f"[FinancialMetrics] No EDGAR ratios in DynamoDB for {ticker}")
    except Exception as e:
        logger.warning(f"[FinancialMetrics] Failed to read EDGAR ratios from DynamoDB for {ticker}: {e}")
    return {}


def _map_edgar_ratios_to_metrics(edgar: dict) -> dict:
    """Map EDGAR ratio field names to the 69-metric keys."""
    if not edgar:
        return {}

    metrics = {}

    direct = {
        "pe_ratio": "trailing_pe",
        "debt_to_equity": "debt_to_equity",
        "current_ratio": "current_ratio",
        "gross_margin": "gross_margin",
        "operating_margin": "operating_margin",
        "net_margin": "net_margin",
        "roe": "roe",
        "roa": "roa",
        "revenue_growth_yoy": "revenue_growth_yoy",
        "eps_growth_yoy": "eps_growth_yoy",
        "eps": "eps_ttm",
        "market_cap": "market_cap",
        "book_value_per_share": "book_value_per_share",
        "dividend_yield": "dividend_yield",
        "payout_ratio": "payout_ratio",
        "quick_ratio": "quick_ratio",
        "interest_coverage": "interest_coverage",
        "price_to_book": "price_to_book",
        "price_to_sales": "price_to_sales",
        "roic": "roic",
        "ebitda": "ebitda",
    }

    for edgar_key, metric_key in direct.items():
        val = edgar.get(edgar_key)
        if val is not None:
            try:
                metrics[metric_key] = float(val)
            except (TypeError, ValueError):
                pass

    revenue = edgar.get("revenue")
    if revenue is not None:
        try:
            shares = edgar.get("shares_outstanding")
            if shares and float(shares) > 0:
                metrics["revenue_per_share"] = round(float(revenue) / float(shares), 2)
        except (TypeError, ValueError, ZeroDivisionError):
            pass

    cash = edgar.get("cash")
    if cash is not None:
        try:
            metrics["total_cash"] = float(cash)
        except (TypeError, ValueError):
            pass

    total_debt = edgar.get("total_debt") or edgar.get("total_liabilities")
    if total_debt is not None:
        try:
            metrics["total_debt"] = float(total_debt)
        except (TypeError, ValueError):
            pass

    net_income = edgar.get("net_income")
    if net_income is not None:
        try:
            metrics["ebitda"] = float(edgar.get("operating_income") or net_income)
        except (TypeError, ValueError):
            pass

    # --- Compute additional metrics from EDGAR raw fields ---
    # gross_margin = gross_profit / revenue
    gross_profit = edgar.get("gross_profit")
    revenue_val = edgar.get("revenue")
    if gross_profit is not None and revenue_val:
        try:
            gp, rv = float(gross_profit), float(revenue_val)
            if rv > 0 and "gross_margin" not in metrics:
                metrics["gross_margin"] = round((gp / rv) * 100, 2)
        except (TypeError, ValueError):
            pass

    # operating_margin = operating_income / revenue
    op_income = edgar.get("operating_income")
    if op_income is not None and revenue_val:
        try:
            oi, rv = float(op_income), float(revenue_val)
            if rv > 0 and "operating_margin" not in metrics:
                metrics["operating_margin"] = round((oi / rv) * 100, 2)
        except (TypeError, ValueError):
            pass

    # debt_to_equity = total_liabilities / stockholders_equity
    total_liab = edgar.get("total_liabilities")
    equity = edgar.get("stockholders_equity")
    if total_liab is not None and equity:
        try:
            tl, eq = float(total_liab), float(equity)
            if eq > 0 and "debt_to_equity" not in metrics:
                metrics["debt_to_equity"] = round(tl / eq, 2)
        except (TypeError, ValueError):
            pass

    # current_ratio = current_assets / current_liabilities
    curr_assets = edgar.get("current_assets")
    curr_liab = edgar.get("current_liabilities")
    if curr_assets is not None and curr_liab:
        try:
            ca, cl = float(curr_assets), float(curr_liab)
            if cl > 0 and "current_ratio" not in metrics:
                metrics["current_ratio"] = round(ca / cl, 2)
        except (TypeError, ValueError):
            pass

    # net_margin = net_income / revenue
    if net_income is not None and revenue_val:
        try:
            ni, rv = float(net_income), float(revenue_val)
            if rv > 0 and "net_margin" not in metrics:
                metrics["net_margin"] = round((ni / rv) * 100, 2)
        except (TypeError, ValueError):
            pass

    # roe = net_income / stockholders_equity
    if net_income is not None and equity:
        try:
            ni, eq = float(net_income), float(equity)
            if eq > 0 and "roe" not in metrics:
                metrics["roe"] = round((ni / eq) * 100, 2)
        except (TypeError, ValueError):
            pass

    # roa = net_income / total_assets
    total_assets = edgar.get("total_assets")
    if net_income is not None and total_assets:
        try:
            ni, ta = float(net_income), float(total_assets)
            if ta > 0 and "roa" not in metrics:
                metrics["roa"] = round((ni / ta) * 100, 2)
        except (TypeError, ValueError):
            pass

    # shares_outstanding from EDGAR
    shares = edgar.get("shares_outstanding")
    if shares is not None:
        try:
            metrics.setdefault("shares_outstanding", float(shares))
        except (TypeError, ValueError):
            pass

    return metrics


# ─── Sector benchmarks ───


def _get_sector_for_ticker(ticker: str) -> str:
    """Get GICS sector for a ticker."""
    try:
        from models import STOCK_SECTORS
        return STOCK_SECTORS.get(ticker, "Unknown")
    except ImportError:
        return "Unknown"


def _get_stocks_in_sector(sector: str) -> list[str]:
    """Get all stock tickers in a given GICS sector."""
    try:
        from models import STOCK_SECTORS, STOCK_UNIVERSE
        return [t for t in STOCK_UNIVERSE if STOCK_SECTORS.get(t) == sector]
    except ImportError:
        return []


def compute_sector_stats(sector: str) -> dict:
    """Compute median, p25, p75 for all numeric metrics across a sector.

    Fetches from DynamoDB cache (SECTOR_STATS#{sector} | LATEST).
    If stale (>7 days), recomputes from individual stock FINANCIALS# records.

    Returns: {metric_key: {"median": x, "p25": y, "p75": z, "count": n}, ...}
    """
    import db

    # Check cache
    cache_pk = f"SECTOR_STATS#{sector}"
    cache_sk = "LATEST"
    try:
        cached = db.get_item(cache_pk, cache_sk)
        if cached:
            cached_at = cached.get("computed_at", "")
            if cached_at:
                cached_dt = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                age_hours = (datetime.now(timezone.utc) - cached_dt).total_seconds() / 3600
                if age_hours < 168:  # 7 days
                    logger.info(f"[FinancialMetrics] Sector stats cache hit: {sector}")
                    stats = cached.get("stats")
                    if stats:
                        import json
                        return json.loads(stats) if isinstance(stats, str) else stats
    except Exception:
        pass

    # Recompute from stored FINANCIALS# records
    tickers = _get_stocks_in_sector(sector)
    if not tickers:
        return {}

    metric_values = defaultdict(list)
    keys = [{"PK": f"FINANCIALS#{t}", "SK": "LATEST"} for t in tickers]

    try:
        items = db.batch_get(keys)
    except Exception:
        items = []

    for item in items:
        categories = item.get("categories")
        if not categories:
            continue
        import json
        if isinstance(categories, str):
            categories = json.loads(categories)

        for cat_name, cat_data in categories.items():
            if not isinstance(cat_data, dict):
                continue
            for metric_key, metric_info in cat_data.items():
                if not isinstance(metric_info, dict):
                    continue
                val = metric_info.get("value")
                if val is not None and isinstance(val, (int, float)):
                    metric_values[metric_key].append(float(val))

    # Compute stats
    stats = {}
    for metric_key, values in metric_values.items():
        if not values:
            continue
        values.sort()
        n = len(values)
        stats[metric_key] = {
            "median": round(_percentile_val(values, 50), 4),
            "p25": round(_percentile_val(values, 25), 4),
            "p75": round(_percentile_val(values, 75), 4),
            "count": n,
        }

    # Cache
    try:
        import json
        db.put_item({
            "PK": cache_pk,
            "SK": cache_sk,
            "stats": json.dumps(stats, default=str),
            "computed_at": datetime.now(timezone.utc).isoformat(),
            "sector": sector,
            "TTL": int(time.time()) + METRICS_TTL_SECONDS,
        })
    except Exception as e:
        logger.warning(f"[FinancialMetrics] Failed to cache sector stats: {e}")

    return stats


def _percentile_val(sorted_vals: list, p: float) -> float:
    """Compute percentile from sorted values."""
    if not sorted_vals:
        return 0
    n = len(sorted_vals)
    idx = (p / 100) * (n - 1)
    lo = int(idx)
    hi = min(lo + 1, n - 1)
    frac = idx - lo
    return sorted_vals[lo] + frac * (sorted_vals[hi] - sorted_vals[lo])


def _compute_percentile_rank(value: float, sorted_sector_values: list) -> int:
    """Compute the percentile rank of a value within sorted sector values."""
    if not sorted_sector_values:
        return 50
    n = len(sorted_sector_values)
    count_below = sum(1 for v in sorted_sector_values if v < value)
    return min(int((count_below / n) * 100), 100)


# ─── Main entry point ───


def compute_all_metrics(ticker: str, sector_stats: Optional[dict] = None) -> dict:
    """Compute all 69 financial metrics for a ticker with sector benchmarks.

    Uses a 2-source strategy:
    1. PRIMARY: Finnhub (/stock/metric, /stock/profile2, /stock/recommendation,
       /stock/price-target) — works reliably in Lambda.
    2. FALLBACK: EDGAR DynamoDB cache (FINANCIALS#{ticker} | RATIOS).
    3. DERIVED: Compute metrics from available data when direct values are null.

    Args:
        ticker: Stock ticker symbol.
        sector_stats: Pre-computed sector stats dict. If None, will be fetched.

    Returns:
        {
            "ticker": "NVDA",
            "computed_at": "2026-03-04T06:00:00Z",
            "categories": {
                "valuation": {
                    "trailing_pe": {"value": 45.2, "sector_median": 28.1,
                                    "percentile": 82, "source": "finnhub"},
                    ...
                },
                ...
            }
        }
    """
    # Track which source provided each metric
    source_map = {}  # metric_key -> "finnhub" | "edgar" | "derived"

    # ─── Source 1: Finnhub (PRIMARY) ───
    finnhub_raw = {}
    finnhub_metrics = {}
    try:
        logger.info(f"[FinancialMetrics] Starting Finnhub data fetch for {ticker}")
        finnhub_raw = _fetch_finnhub_metrics(ticker)
        finnhub_metrics = _map_finnhub_to_metrics(finnhub_raw)
        # Fill technicals from candle data
        _fill_technicals_from_candles(finnhub_metrics, ticker)
        fh_non_null = sum(1 for v in finnhub_metrics.values() if v is not None)
        logger.info(f"[FinancialMetrics] Finnhub provided {fh_non_null}/69 non-null metrics for {ticker}")
        for key, val in finnhub_metrics.items():
            if val is not None:
                source_map[key] = "finnhub"
    except Exception as e:
        logger.error(f"[FinancialMetrics] Finnhub fetch failed for {ticker}: {e}")

    # ─── Source 2: EDGAR fallback ───
    edgar_ratios = _fetch_edgar_ratios_from_dynamo(ticker)
    edgar_metrics = _map_edgar_ratios_to_metrics(edgar_ratios)
    if edgar_metrics:
        edgar_filled = 0
        for key, val in edgar_metrics.items():
            if finnhub_metrics.get(key) is None and val is not None:
                finnhub_metrics[key] = val
                source_map[key] = "edgar"
                edgar_filled += 1
        logger.info(f"[FinancialMetrics] EDGAR filled {edgar_filled} additional metrics for {ticker}")

    # ─── Source 3: Derived metrics (compute from available data) ───
    pre_derived_count = sum(1 for v in finnhub_metrics.values() if v is not None)
    fh_raw_metrics = finnhub_raw.get("metrics", {})
    _compute_derived_metrics(finnhub_metrics, fh_raw_metrics, edgar_ratios)
    post_derived_count = sum(1 for v in finnhub_metrics.values() if v is not None)
    derived_filled = post_derived_count - pre_derived_count
    if derived_filled > 0:
        logger.info(f"[FinancialMetrics] Derived metrics filled {derived_filled} additional metrics for {ticker}")
        # Mark newly filled metrics as "derived"
        for key, val in finnhub_metrics.items():
            if val is not None and key not in source_map:
                source_map[key] = "derived"

    raw_metrics = finnhub_metrics
    total_non_null = sum(1 for v in raw_metrics.values() if v is not None)
    finnhub_count = sum(1 for s in source_map.values() if s == "finnhub")
    edgar_count = sum(1 for s in source_map.values() if s == "edgar")
    derived_count = sum(1 for s in source_map.values() if s == "derived")
    logger.info(f"[FinancialMetrics] {ticker}: {total_non_null}/69 metrics populated "
                f"(sources: finnhub={finnhub_count}, edgar={edgar_count}, derived={derived_count})")

    # Get sector
    sector = _get_sector_for_ticker(ticker)

    # Get sector stats if not provided
    if sector_stats is None and sector != "Unknown":
        try:
            sector_stats = compute_sector_stats(sector)
        except Exception:
            sector_stats = {}

    if sector_stats is None:
        sector_stats = {}

    # Build structured output
    categories = {}
    for cat_name, metric_keys in METRIC_CATEGORIES.items():
        cat_data = {}
        for key in metric_keys:
            value = raw_metrics.get(key)
            source = source_map.get(key, "none")
            metric_entry = {
                "value": value,
                "source": source,
            }

            # Add sector benchmark data
            ss = sector_stats.get(key)
            if ss and value is not None and isinstance(value, (int, float)):
                metric_entry["sector_median"] = ss.get("median")
                # Percentile estimate using p25/p75
                p25 = ss.get("p25", 0)
                p75 = ss.get("p75", 0)
                median = ss.get("median", 0)
                if p75 != p25:
                    if value <= p25:
                        metric_entry["percentile"] = max(0, int(25 * value / p25)) if p25 != 0 else 10
                    elif value <= median:
                        metric_entry["percentile"] = 25 + int(25 * (value - p25) / (median - p25))
                    elif value <= p75:
                        metric_entry["percentile"] = 50 + int(25 * (value - median) / (p75 - median))
                    else:
                        metric_entry["percentile"] = min(99, 75 + int(25 * min((value - p75) / max(p75, 1), 1)))
                else:
                    metric_entry["percentile"] = 50
            else:
                metric_entry["sector_median"] = None
                metric_entry["percentile"] = None

            cat_data[key] = metric_entry
        categories[cat_name] = cat_data

    return {
        "ticker": ticker,
        "sector": sector,
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "categories": categories,
    }


# ─── DynamoDB storage ───


def store_metrics(ticker: str, metrics_data: dict) -> None:
    """Store computed metrics in DynamoDB."""
    import json
    import db

    db.put_item({
        "PK": f"FINANCIALS#{ticker}",
        "SK": "LATEST",
        "ticker": ticker,
        "sector": metrics_data.get("sector", ""),
        "computed_at": metrics_data.get("computed_at", ""),
        "categories": json.dumps(metrics_data.get("categories", {}), default=str),
        "TTL": int(time.time()) + METRICS_TTL_SECONDS,
    })


def get_cached_metrics(ticker: str) -> Optional[dict]:
    """Get cached metrics from DynamoDB. Returns None if stale or missing."""
    import json
    import db

    item = db.get_item(f"FINANCIALS#{ticker}", "LATEST")
    if not item:
        return None

    computed_at = item.get("computed_at", "")
    if computed_at:
        try:
            cached_dt = datetime.fromisoformat(computed_at.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - cached_dt).total_seconds() / 3600
            if age_hours > 168:  # Stale after 7 days
                return None
        except Exception:
            pass

    categories = item.get("categories")
    if isinstance(categories, str):
        categories = json.loads(categories)

    return {
        "ticker": item.get("ticker", ticker),
        "sector": item.get("sector", ""),
        "computed_at": computed_at,
        "categories": categories or {},
    }


def get_metrics(ticker: str, category: Optional[str] = None,
                include_sparklines: bool = False,
                force_refresh: bool = False) -> dict:
    """Get financial metrics for a ticker, using cache or computing fresh.

    Args:
        ticker: Stock ticker symbol.
        category: If provided, return only this category.
        include_sparklines: If False, strip sparkline data for smaller response.
        force_refresh: If True, skip cache and recompute fresh metrics.

    Returns:
        Full or filtered metrics dict.
    """
    # Try cache first (unless force_refresh)
    result = None
    if not force_refresh:
        result = get_cached_metrics(ticker)
    else:
        logger.info(f"[FinancialMetrics] force_refresh=True, skipping cache for {ticker}")

    if not result:
        # Compute fresh
        result = compute_all_metrics(ticker)
        # Store in DynamoDB
        try:
            store_metrics(ticker, result)
        except Exception as e:
            logger.warning(f"[FinancialMetrics] Failed to store metrics for {ticker}: {e}")

    # Filter by category if requested
    if category and result.get("categories"):
        cat_data = result["categories"].get(category)
        if cat_data is None:
            return {"error": f"Unknown category: {category}",
                    "valid_categories": list(METRIC_CATEGORIES.keys())}
        result = {
            "ticker": result["ticker"],
            "sector": result.get("sector", ""),
            "computed_at": result["computed_at"],
            "category": category,
            "metrics": cat_data,
        }
    else:
        # Default: don't include sparklines unless requested
        if not include_sparklines and result.get("categories"):
            for cat_data in result["categories"].values():
                if isinstance(cat_data, dict):
                    for metric_info in cat_data.values():
                        if isinstance(metric_info, dict):
                            metric_info.pop("sparkline", None)

    return result


# ─── Batch operations ───


def precompute_sector_medians() -> dict:
    """Precompute sector median stats for all GICS sectors.

    Requires FINANCIALS#{ticker} | LATEST records to already exist in DynamoDB.
    Called by bootstrap_sector_stats() after batch per-stock computation.

    Returns: {sector: stats_dict, ...}
    """
    try:
        from models import GICS_SECTORS
    except ImportError:
        GICS_SECTORS = []

    all_sector_stats = {}
    for sector in GICS_SECTORS:
        try:
            stats = compute_sector_stats(sector)
            all_sector_stats[sector] = stats
            logger.info(f"[FinancialMetrics] Sector stats computed: {sector} ({len(stats)} metrics)")
        except Exception as e:
            logger.warning(f"[FinancialMetrics] Failed to compute sector stats for {sector}: {e}")
            all_sector_stats[sector] = {}

    return all_sector_stats


def bootstrap_sector_stats() -> dict:
    """Precompute and cache sector stats from existing FINANCIALS# records.

    Must be called AFTER per-stock metrics have been computed and stored,
    so that FINANCIALS#{ticker} | LATEST records exist in DynamoDB.

    Returns: {sector: stats_dict, ...}
    """
    logger.info("[FinancialMetrics] Bootstrapping sector stats from stored metrics...")
    all_sector_stats = precompute_sector_medians()
    total_metrics = sum(len(s) for s in all_sector_stats.values())
    logger.info(f"[FinancialMetrics] Sector stats bootstrapped: "
                f"{len(all_sector_stats)} sectors, {total_metrics} metric stats")
    return all_sector_stats


def _update_stored_metrics_with_sector_stats(tickers: list[str],
                                              all_sector_stats: dict) -> int:
    """Update already-stored FINANCIALS# records with sector benchmarks.

    Reads each stored record, fills in sector_median and percentile,
    then writes it back. Returns count of updated records.
    """
    import json
    import db

    updated = 0
    for ticker in tickers:
        try:
            item = db.get_item(f"FINANCIALS#{ticker}", "LATEST")
            if not item:
                continue

            sector = item.get("sector", "")
            sector_stats = all_sector_stats.get(sector, {})
            if not sector_stats:
                continue

            categories = item.get("categories")
            if not categories:
                continue
            if isinstance(categories, str):
                categories = json.loads(categories)

            changed = False
            for cat_name, cat_data in categories.items():
                if not isinstance(cat_data, dict):
                    continue
                for metric_key, metric_info in cat_data.items():
                    if not isinstance(metric_info, dict):
                        continue
                    value = metric_info.get("value")
                    ss = sector_stats.get(metric_key)
                    if ss and value is not None and isinstance(value, (int, float)):
                        metric_info["sector_median"] = ss.get("median")
                        p25 = ss.get("p25", 0)
                        p75 = ss.get("p75", 0)
                        median = ss.get("median", 0)
                        if p75 != p25:
                            if value <= p25:
                                metric_info["percentile"] = max(0, int(25 * value / p25)) if p25 != 0 else 10
                            elif value <= median:
                                metric_info["percentile"] = 25 + int(25 * (value - p25) / (median - p25))
                            elif value <= p75:
                                metric_info["percentile"] = 50 + int(25 * (value - median) / (p75 - median))
                            else:
                                metric_info["percentile"] = min(99, 75 + int(25 * min((value - p75) / max(p75, 1), 1)))
                        else:
                            metric_info["percentile"] = 50
                        changed = True
                    elif metric_info.get("sector_median") is None:
                        metric_info["sector_median"] = None
                        metric_info["percentile"] = None

            if changed:
                item["categories"] = json.dumps(categories, default=str)
                db.put_item(item)
                updated += 1

        except Exception as e:
            logger.warning(f"[FinancialMetrics] Failed to update sector stats for {ticker}: {e}")

    return updated


def batch_compute_all(tickers: Optional[list[str]] = None) -> dict:
    """Batch compute financial metrics for all stocks in the universe.

    Uses a 2-pass approach:
      Pass 1: Compute and store per-stock metrics (sector_median=null).
      Pass 2: Compute sector stats from stored data, then update records.

    Rate-limited: max 5 concurrent fetches, 1s delay between batches of 50.

    Args:
        tickers: Optional list. If None, uses full STOCK_UNIVERSE.

    Returns:
        {"computed": N, "failed": N, "duration_seconds": X}
    """
    if tickers is None:
        try:
            from models import STOCK_UNIVERSE
            tickers = STOCK_UNIVERSE
        except ImportError:
            return {"error": "Cannot import STOCK_UNIVERSE"}

    logger.info(f"[FinancialMetrics] Starting batch compute for {len(tickers)} stocks")
    start_time = time.time()

    # Pass 1: Compute per-stock metrics WITHOUT sector benchmarks
    logger.info("[FinancialMetrics] Pass 1: Computing per-stock metrics...")
    computed = 0
    failed = 0
    errors = []

    for batch_start in range(0, len(tickers), BATCH_SIZE):
        batch = tickers[batch_start:batch_start + BATCH_SIZE]
        logger.info(f"[FinancialMetrics] Processing batch {batch_start // BATCH_SIZE + 1} "
                     f"({batch_start + 1}-{min(batch_start + len(batch), len(tickers))} of {len(tickers)})")

        with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_FETCHES) as executor:
            futures = {}
            for t in batch:
                # Pass empty sector_stats so metrics are stored with null benchmarks
                futures[executor.submit(_compute_and_store_single, t, {})] = t

            for future in as_completed(futures):
                t = futures[future]
                try:
                    success = future.result()
                    if success:
                        computed += 1
                    else:
                        failed += 1
                except Exception as e:
                    failed += 1
                    errors.append(f"{t}: {e}")

        # Rate limiting delay between batches
        if batch_start + BATCH_SIZE < len(tickers):
            time.sleep(BATCH_DELAY_SECONDS)

    # Pass 2: Compute sector stats from stored data, then backfill
    logger.info("[FinancialMetrics] Pass 2: Computing sector stats from stored metrics...")
    all_sector_stats = bootstrap_sector_stats()

    logger.info("[FinancialMetrics] Pass 2b: Updating stored metrics with sector benchmarks...")
    updated = _update_stored_metrics_with_sector_stats(tickers, all_sector_stats)
    logger.info(f"[FinancialMetrics] Updated {updated}/{computed} records with sector benchmarks")

    duration = round(time.time() - start_time, 1)
    logger.info(f"[FinancialMetrics] Batch complete: {computed} computed, {failed} failed, "
                f"{duration}s elapsed")

    return {
        "computed": computed,
        "failed": failed,
        "total": len(tickers),
        "sector_updated": updated,
        "duration_seconds": duration,
        "errors": errors[:10],  # First 10 errors only
    }


def _count_finnhub_sources(categories: dict) -> int:
    """Count metrics with source='finnhub' in a categories dict."""
    count = 0
    for cat_data in categories.values():
        if not isinstance(cat_data, dict):
            continue
        for metric_info in cat_data.values():
            if isinstance(metric_info, dict) and metric_info.get("source") == "finnhub":
                count += 1
    return count


def _compute_and_store_single(ticker: str, sector_stats: dict) -> bool:
    """Compute and store metrics for a single ticker. Returns True on success.

    Guard: if an existing FINANCIALS# record has Finnhub-sourced metrics and
    the new computation has fewer Finnhub metrics (e.g. due to rate limiting
    during batch runs), the write is skipped to avoid clobbering rich data.
    """
    import json as _json
    import db as _db

    try:
        metrics = compute_all_metrics(ticker, sector_stats=sector_stats)
        new_finnhub = _count_finnhub_sources(metrics.get("categories", {}))

        existing = _db.get_item(f"FINANCIALS#{ticker}", "LATEST")
        if existing:
            existing_cats = existing.get("categories")
            if isinstance(existing_cats, str):
                existing_cats = _json.loads(existing_cats)
            existing_finnhub = _count_finnhub_sources(existing_cats or {})
            if existing_finnhub > 0 and new_finnhub < existing_finnhub:
                logger.info(
                    f"[FinancialMetrics] Skipping FINANCIALS write for {ticker} — "
                    f"existing has {existing_finnhub} Finnhub metrics vs {new_finnhub} new"
                )
                return True

        store_metrics(ticker, metrics)
        return True
    except Exception as e:
        logger.warning(f"[FinancialMetrics] Failed for {ticker}: {e}")
        return False

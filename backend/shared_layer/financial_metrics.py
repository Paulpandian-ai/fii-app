"""Comprehensive Financial Statistics Module — 69 metrics across 8 categories.

Computes valuation, profitability, growth, financial health, dividends,
analyst estimates, momentum/technicals, and ownership metrics with
sector benchmarks (median + percentile rank).

Primary source: yfinance.  Fallback: EDGAR XBRL (via edgar_data.py).
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

# Rate-limit constants for yfinance batch operations
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


# ─── yfinance data extraction ───


def _safe_get(info: dict, key: str) -> Optional[float]:
    """Safely extract a numeric value from yfinance info dict."""
    val = info.get(key)
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


def _fetch_edgar_ratios_from_dynamo(ticker: str) -> dict:
    """Read cached EDGAR ratios from DynamoDB (FINANCIALS#{ticker} | RATIOS).

    These are computed by edgar_data.get_financial_ratios() and contain
    real fundamental data (ROE, net_margin, current_ratio, etc.).

    Returns a flat dict of ratio values, or empty dict on failure.
    """
    try:
        import db
        item = db.get_item(f"FINANCIALS#{ticker.upper()}", "RATIOS")
        if item:
            logger.info(f"[FinancialMetrics] EDGAR ratios found in DynamoDB for {ticker}")
            return item
        else:
            logger.info(f"[FinancialMetrics] No EDGAR ratios in DynamoDB for {ticker}")
    except Exception as e:
        logger.warning(f"[FinancialMetrics] Failed to read EDGAR ratios from DynamoDB for {ticker}: {e}")
    return {}


def _map_edgar_ratios_to_metrics(edgar: dict) -> dict:
    """Map EDGAR ratio field names to the 69-metric keys.

    edgar_data.get_financial_ratios() stores keys like 'roe', 'net_margin',
    'current_ratio', etc. Map them into the metric keys used by this module.
    """
    if not edgar:
        return {}

    metrics = {}

    # Direct mappings (EDGAR key -> metric key)
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
    }

    for edgar_key, metric_key in direct.items():
        val = edgar.get(edgar_key)
        if val is not None:
            try:
                metrics[metric_key] = float(val)
            except (TypeError, ValueError):
                pass

    # Map raw financials to additional metrics where possible
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

    total_liabilities = edgar.get("total_liabilities")
    total_debt = edgar.get("total_debt") or total_liabilities
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

    return metrics


def _fetch_yfinance_data(ticker: str) -> dict:
    """Fetch comprehensive data from yfinance for a single ticker.

    Returns a dict with all raw data needed to compute 69 metrics.
    """
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        info = stock.info or {}
        logger.info(f"[FinancialMetrics] yfinance info fetched for {ticker}: {len(info)} keys")

        if not info or len(info) <= 1:
            logger.warning(f"[FinancialMetrics] yfinance returned empty/minimal info for {ticker}")

        # Historical prices for momentum calculations
        hist_1y = None
        try:
            hist_1y = stock.history(period="1y")
            logger.info(f"[FinancialMetrics] yfinance history for {ticker}: {len(hist_1y) if hist_1y is not None else 0} rows")
        except Exception as e:
            logger.warning(f"[FinancialMetrics] yfinance history failed for {ticker}: {e}")

        # Quarterly financials for sparklines
        quarterly_financials = None
        try:
            quarterly_financials = stock.quarterly_financials
        except Exception as e:
            logger.warning(f"[FinancialMetrics] yfinance quarterly_financials failed for {ticker}: {e}")

        # Income statement for growth calcs
        annual_financials = None
        try:
            annual_financials = stock.financials
        except Exception as e:
            logger.warning(f"[FinancialMetrics] yfinance annual financials failed for {ticker}: {e}")

        # Balance sheet
        balance_sheet = None
        try:
            balance_sheet = stock.balance_sheet
        except Exception as e:
            logger.warning(f"[FinancialMetrics] yfinance balance_sheet failed for {ticker}: {e}")

        # Cashflow
        cashflow = None
        try:
            cashflow = stock.cashflow
        except Exception as e:
            logger.warning(f"[FinancialMetrics] yfinance cashflow failed for {ticker}: {e}")

        # Insider transactions
        insider_transactions = None
        try:
            insider_transactions = stock.insider_transactions
        except Exception as e:
            logger.warning(f"[FinancialMetrics] yfinance insider_transactions failed for {ticker}: {e}")

        return {
            "info": info,
            "hist_1y": hist_1y,
            "quarterly_financials": quarterly_financials,
            "annual_financials": annual_financials,
            "balance_sheet": balance_sheet,
            "cashflow": cashflow,
            "insider_transactions": insider_transactions,
            "source": "yfinance",
        }
    except Exception as e:
        logger.warning(f"[FinancialMetrics] yfinance fetch failed for {ticker}: {e}")
        return {"info": {}, "source": "yfinance", "error": str(e)}


def _compute_momentum(hist, days: int) -> Optional[float]:
    """Compute price change percentage over N trading days."""
    if hist is None or len(hist) < days:
        return None
    try:
        current = float(hist["Close"].iloc[-1])
        past = float(hist["Close"].iloc[-min(days, len(hist))])
        if past == 0:
            return None
        return round(((current - past) / past) * 100, 2)
    except Exception:
        return None


def _compute_rsi(hist, period: int = 14) -> Optional[float]:
    """Compute RSI from historical price data."""
    if hist is None or len(hist) < period + 1:
        return None
    try:
        closes = hist["Close"].values
        deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
        recent = deltas[-(period):]
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


def _compute_macd_signal(hist) -> Optional[str]:
    """Compute MACD signal (bullish/bearish/neutral)."""
    if hist is None or len(hist) < 35:
        return None
    try:
        closes = hist["Close"].values
        # EMA 12
        ema12 = _ema(closes, 12)
        # EMA 26
        ema26 = _ema(closes, 26)
        if ema12 is None or ema26 is None:
            return None
        macd_line = ema12 - ema26
        # Simple approximation: signal line is 9-period EMA of MACD
        # Just use the sign for bullish/bearish
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


def _sma_distance(hist, period: int) -> Optional[float]:
    """Compute current price distance from SMA as percentage."""
    if hist is None or len(hist) < period:
        return None
    try:
        closes = hist["Close"].values
        sma = sum(float(c) for c in closes[-period:]) / period
        current = float(closes[-1])
        if sma == 0:
            return None
        return round(((current - sma) / sma) * 100, 2)
    except Exception:
        return None


def _compute_atr(hist, period: int = 14) -> Optional[float]:
    """Compute Average True Range."""
    if hist is None or len(hist) < period + 1:
        return None
    try:
        highs = hist["High"].values
        lows = hist["Low"].values
        closes = hist["Close"].values
        trs = []
        for i in range(1, len(highs)):
            tr = max(
                float(highs[i]) - float(lows[i]),
                abs(float(highs[i]) - float(closes[i - 1])),
                abs(float(lows[i]) - float(closes[i - 1])),
            )
            trs.append(tr)
        if len(trs) < period:
            return None
        return round(sum(trs[-period:]) / period, 2)
    except Exception:
        return None


def _compute_altman_z(info: dict) -> Optional[float]:
    """Compute Altman Z-Score from yfinance info data.

    Z = 1.2*A + 1.4*B + 3.3*C + 0.6*D + 1.0*E
    A = Working Capital / Total Assets
    B = Retained Earnings / Total Assets
    C = EBIT / Total Assets
    D = Market Cap / Total Liabilities
    E = Revenue / Total Assets
    """
    total_assets = _safe_get(info, "totalAssets")
    if not total_assets or total_assets == 0:
        return None

    market_cap = _safe_get(info, "marketCap")
    total_debt = _safe_get(info, "totalDebt") or 0
    total_revenue = _safe_get(info, "totalRevenue") or 0
    ebitda = _safe_get(info, "ebitda") or 0
    current_assets = None  # yfinance doesn't always provide this
    current_liabilities = None

    # Simplified calculation with available data
    try:
        # A: approximate working capital / total assets
        current_ratio = _safe_get(info, "currentRatio")
        a_ratio = 0
        if current_ratio is not None and current_ratio > 0:
            # Working capital is positive if current_ratio > 1
            a_ratio = (current_ratio - 1) / (current_ratio * 5)  # rough estimate

        # B: retained earnings / total assets (approximate from book value)
        book_value = _safe_get(info, "bookValue")
        shares = _safe_get(info, "sharesOutstanding")
        b_ratio = 0
        if book_value and shares:
            b_ratio = (book_value * shares) / total_assets

        # C: EBIT / total assets
        c_ratio = ebitda / total_assets if ebitda else 0

        # D: market cap / total liabilities
        d_ratio = 0
        if market_cap and total_debt > 0:
            d_ratio = market_cap / total_debt

        # E: revenue / total assets
        e_ratio = total_revenue / total_assets if total_revenue else 0

        z = 1.2 * a_ratio + 1.4 * b_ratio + 3.3 * c_ratio + 0.6 * d_ratio + 1.0 * e_ratio
        return round(z, 2)
    except Exception:
        return None


def _count_insider_transactions(insider_df, tx_type: str) -> Optional[int]:
    """Count insider buy/sell transactions in last 6 months."""
    if insider_df is None:
        return None
    try:
        if hasattr(insider_df, "empty") and insider_df.empty:
            return 0
        # Filter by transaction type
        count = 0
        for _, row in insider_df.iterrows():
            text = str(row.get("Text", "") or row.get("Transaction", "")).lower()
            if tx_type == "buy" and ("purchase" in text or "buy" in text):
                count += 1
            elif tx_type == "sell" and ("sale" in text or "sell" in text):
                count += 1
        return count
    except Exception:
        return None


def _extract_quarterly_values(quarterly_df, row_name: str, n: int = 4) -> list:
    """Extract last N quarterly values for sparkline."""
    if quarterly_df is None:
        return []
    try:
        if hasattr(quarterly_df, "empty") and quarterly_df.empty:
            return []
        if row_name in quarterly_df.index:
            vals = quarterly_df.loc[row_name].values[:n]
            return [round(float(v), 2) if v is not None and not math.isnan(float(v)) else None for v in vals]
    except Exception:
        pass
    return []


# ─── Core metric computation ───


def _compute_raw_metrics(ticker: str, data: dict) -> dict:
    """Compute all 69 metrics from raw yfinance data.

    Returns a flat dict: metric_key -> value (numeric or None).
    """
    info = data.get("info", {})
    hist = data.get("hist_1y")
    quarterly = data.get("quarterly_financials")
    annual = data.get("annual_financials")
    balance = data.get("balance_sheet")
    cashflow = data.get("cashflow")
    insider_tx = data.get("insider_transactions")

    metrics = {}

    # ─── VALUATION (11) ───
    metrics["trailing_pe"] = _safe_get(info, "trailingPE")
    metrics["forward_pe"] = _safe_get(info, "forwardPE")
    metrics["peg_ratio"] = _safe_get(info, "pegRatio")
    metrics["price_to_sales"] = _safe_get(info, "priceToSalesTrailing12Months")
    metrics["price_to_book"] = _safe_get(info, "priceToBook")
    metrics["ev_to_ebitda"] = _safe_get(info, "enterpriseToEbitda")
    metrics["ev_to_revenue"] = _safe_get(info, "enterpriseToRevenue")
    metrics["enterprise_value"] = _safe_get(info, "enterpriseValue")
    # FCF yield = FCF / Market Cap
    fcf = _safe_get(info, "freeCashflow")
    mcap = _safe_get(info, "marketCap")
    metrics["fcf_yield"] = round(_safe_divide(fcf, mcap) * 100, 2) if _safe_divide(fcf, mcap) is not None else None
    # Earnings yield = EPS / Price
    eps = _safe_get(info, "trailingEps")
    price = _safe_get(info, "currentPrice") or _safe_get(info, "regularMarketPrice")
    metrics["earnings_yield"] = round(_safe_divide(eps, price) * 100, 2) if _safe_divide(eps, price) is not None else None
    metrics["market_cap"] = mcap

    # ─── PROFITABILITY (9) ───
    metrics["gross_margin"] = _pct(_safe_get(info, "grossMargins"))
    metrics["operating_margin"] = _pct(_safe_get(info, "operatingMargins"))
    metrics["net_margin"] = _pct(_safe_get(info, "profitMargins"))
    metrics["roe"] = _pct(_safe_get(info, "returnOnEquity"))
    metrics["roa"] = _pct(_safe_get(info, "returnOnAssets"))
    # ROIC approximation: operating income / (total assets - current liabilities)
    # Use EBIT / invested capital if available
    ebitda_val = _safe_get(info, "ebitda")
    total_assets = _safe_get(info, "totalAssets")
    total_debt_val = _safe_get(info, "totalDebt")
    total_cash_val = _safe_get(info, "totalCash")
    if ebitda_val and total_debt_val is not None and total_cash_val is not None:
        invested = total_debt_val + (mcap or 0) - total_cash_val
        metrics["roic"] = round(_safe_divide(ebitda_val, invested) * 100, 2) if _safe_divide(ebitda_val, invested) is not None else None
    else:
        metrics["roic"] = None
    metrics["ebitda"] = ebitda_val
    metrics["eps_ttm"] = eps
    metrics["revenue_per_share"] = _safe_get(info, "revenuePerShare")

    # ─── GROWTH (8) ───
    metrics["revenue_growth_yoy"] = _pct(_safe_get(info, "revenueGrowth"))
    metrics["eps_growth_yoy"] = _pct(_safe_get(info, "earningsGrowth"))

    # 3-year CAGR from annual financials
    rev_3y_cagr = None
    eps_3y_cagr = None
    if annual is not None and not (hasattr(annual, "empty") and annual.empty):
        try:
            if "Total Revenue" in annual.index and len(annual.columns) >= 4:
                rev_vals = annual.loc["Total Revenue"].values
                rev_3y_cagr = _cagr(float(rev_vals[-1]), float(rev_vals[0]), 3)
        except Exception:
            pass
        try:
            if "Basic EPS" in annual.index and len(annual.columns) >= 4:
                eps_vals = annual.loc["Basic EPS"].values
                eps_3y_cagr = _cagr(float(eps_vals[-1]), float(eps_vals[0]), 3)
        except Exception:
            pass
    metrics["revenue_growth_3y_cagr"] = rev_3y_cagr
    metrics["eps_growth_3y_cagr"] = eps_3y_cagr

    # FCF growth YoY
    fcf_growth = None
    if cashflow is not None and not (hasattr(cashflow, "empty") and cashflow.empty):
        try:
            if "Free Cash Flow" in cashflow.index and len(cashflow.columns) >= 2:
                fcf_vals = cashflow.loc["Free Cash Flow"].values
                current_fcf = float(fcf_vals[0])
                prior_fcf = float(fcf_vals[1])
                if prior_fcf != 0:
                    fcf_growth = round(((current_fcf - prior_fcf) / abs(prior_fcf)) * 100, 2)
        except Exception:
            pass
    metrics["fcf_growth_yoy"] = fcf_growth

    # Book value growth YoY
    bv_growth = None
    if balance is not None and not (hasattr(balance, "empty") and balance.empty):
        try:
            for row_name in ["Stockholders Equity", "Total Stockholders Equity", "Common Stock Equity"]:
                if row_name in balance.index and len(balance.columns) >= 2:
                    bv_vals = balance.loc[row_name].values
                    current_bv = float(bv_vals[0])
                    prior_bv = float(bv_vals[1])
                    if prior_bv != 0:
                        bv_growth = round(((current_bv - prior_bv) / abs(prior_bv)) * 100, 2)
                    break
        except Exception:
            pass
    metrics["book_value_growth_yoy"] = bv_growth

    # QoQ growth
    metrics["revenue_growth_qoq"] = _pct(_safe_get(info, "revenueGrowth"))  # yfinance QoQ approx
    metrics["earnings_growth_qoq"] = _pct(_safe_get(info, "earningsQuarterlyGrowth"))

    # ─── FINANCIAL HEALTH (9) ───
    metrics["debt_to_equity"] = _safe_get(info, "debtToEquity")
    metrics["current_ratio"] = _safe_get(info, "currentRatio")
    metrics["quick_ratio"] = _safe_get(info, "quickRatio")
    # Interest coverage = EBIT / interest expense
    interest_expense = None
    if annual is not None and not (hasattr(annual, "empty") and annual.empty):
        try:
            for row_name in ["Interest Expense", "Interest Expense Non Operating"]:
                if row_name in annual.index:
                    ie_val = float(annual.loc[row_name].values[0])
                    if ie_val != 0:
                        interest_expense = abs(ie_val)
                    break
        except Exception:
            pass
    if ebitda_val and interest_expense:
        metrics["interest_coverage"] = round(ebitda_val / interest_expense, 2)
    else:
        metrics["interest_coverage"] = None

    metrics["total_cash"] = total_cash_val
    metrics["total_debt"] = total_debt_val
    metrics["book_value_per_share"] = _safe_get(info, "bookValue")
    shares_out = _safe_get(info, "sharesOutstanding")
    metrics["cash_per_share"] = round(_safe_divide(total_cash_val, shares_out), 2) if _safe_divide(total_cash_val, shares_out) is not None else None
    metrics["altman_z_score"] = _compute_altman_z(info)

    # ─── DIVIDENDS (6) ───
    metrics["dividend_yield"] = _pct(_safe_get(info, "dividendYield"))
    metrics["payout_ratio"] = _pct(_safe_get(info, "payoutRatio"))
    # 5-year dividend growth rate
    metrics["dividend_growth_5y"] = _pct(_safe_get(info, "fiveYearAvgDividendYield"))
    ex_div = info.get("exDividendDate")
    if ex_div:
        try:
            if isinstance(ex_div, (int, float)):
                metrics["ex_dividend_date"] = datetime.fromtimestamp(ex_div, tz=timezone.utc).strftime("%Y-%m-%d")
            else:
                metrics["ex_dividend_date"] = str(ex_div)
        except Exception:
            metrics["ex_dividend_date"] = None
    else:
        metrics["ex_dividend_date"] = None
    metrics["dividend_per_share"] = _safe_get(info, "dividendRate")
    # Years of consecutive dividends — not directly in yfinance, estimate from available data
    metrics["years_of_consecutive_dividends"] = None  # Would need historical dividend data

    # ─── ANALYST ESTIMATES (8) ───
    metrics["target_price_low"] = _safe_get(info, "targetLowPrice")
    metrics["target_price_mean"] = _safe_get(info, "targetMeanPrice")
    metrics["target_price_high"] = _safe_get(info, "targetHighPrice")
    metrics["recommendation_score"] = _safe_get(info, "recommendationMean")
    metrics["num_analysts"] = _safe_get(info, "numberOfAnalystOpinions")
    # EPS estimates
    metrics["current_q_eps_estimate"] = None  # Would require earnings calendar
    metrics["current_y_eps_estimate"] = None
    # EPS revision trend: compare current vs 30-day ago estimates
    metrics["eps_revision_trend"] = None

    # ─── MOMENTUM & TECHNICALS (10) ───
    metrics["price_change_1m"] = _compute_momentum(hist, 21)
    metrics["price_change_3m"] = _compute_momentum(hist, 63)
    metrics["price_change_6m"] = _compute_momentum(hist, 126)
    metrics["price_change_1y"] = _compute_momentum(hist, 252)
    metrics["rsi_14"] = _compute_rsi(hist, 14)
    metrics["macd_signal"] = _compute_macd_signal(hist)
    metrics["sma_20_distance"] = _sma_distance(hist, 20)
    metrics["sma_200_distance"] = _sma_distance(hist, 200)
    metrics["beta"] = _safe_get(info, "beta")
    metrics["atr_14"] = _compute_atr(hist, 14)

    # ─── OWNERSHIP (8) ───
    metrics["institutional_pct"] = _pct(_safe_get(info, "heldPercentInstitutions"))
    metrics["insider_pct"] = _pct(_safe_get(info, "heldPercentInsiders"))
    metrics["short_pct_float"] = _pct(_safe_get(info, "shortPercentOfFloat"))
    metrics["short_ratio"] = _safe_get(info, "shortRatio")
    metrics["shares_outstanding"] = shares_out
    metrics["float_shares"] = _safe_get(info, "floatShares")
    metrics["insider_buys_6m"] = _count_insider_transactions(insider_tx, "buy")
    metrics["insider_sells_6m"] = _count_insider_transactions(insider_tx, "sell")

    return metrics


def _get_sparklines(data: dict) -> dict:
    """Extract sparkline data (last 4 quarters) for select metrics."""
    quarterly = data.get("quarterly_financials")
    sparklines = {}

    sparklines["gross_margin"] = _extract_quarterly_values(quarterly, "Gross Profit", 4)
    sparklines["net_margin"] = _extract_quarterly_values(quarterly, "Net Income", 4)
    sparklines["revenue"] = _extract_quarterly_values(quarterly, "Total Revenue", 4)
    sparklines["ebitda"] = _extract_quarterly_values(quarterly, "EBITDA", 4)

    # Momentum sparkline from price history
    hist = data.get("hist_1y")
    if hist is not None and len(hist) >= 4:
        try:
            closes = hist["Close"].values
            quarter_len = len(closes) // 4
            sparklines["price"] = [
                round(float(closes[i * quarter_len]), 2)
                for i in range(4)
                if i * quarter_len < len(closes)
            ]
        except Exception:
            pass

    return sparklines


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

    # Collect all metric values per metric key
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
    1. FIRST read EDGAR ratios from DynamoDB (FINANCIALS#{ticker} | RATIOS)
       — these contain real fundamental data from edgar_data.py
    2. THEN fetch yfinance data for additional metrics (valuation, analyst,
       ownership, momentum/technicals)
    3. Merge both — EDGAR fills fundamentals, yfinance fills the rest
    4. If yfinance fails entirely, still return EDGAR data

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
                                    "percentile": 82, "source": "yfinance"},
                    ...
                },
                ...
            }
        }
    """
    # Source 1: Read EDGAR ratios from DynamoDB (reliable fundamental data)
    edgar_ratios = _fetch_edgar_ratios_from_dynamo(ticker)
    edgar_metrics = _map_edgar_ratios_to_metrics(edgar_ratios)
    edgar_source = edgar_ratios.get("source", "edgar") if edgar_ratios else None

    if edgar_metrics:
        logger.info(f"[FinancialMetrics] EDGAR provided {len(edgar_metrics)} metrics for {ticker}: "
                     f"{list(edgar_metrics.keys())[:10]}...")

    # Source 2: Fetch yfinance data
    data = _fetch_yfinance_data(ticker)

    # Compute raw metrics from yfinance
    raw_metrics = _compute_raw_metrics(ticker, data)

    # Merge: EDGAR values fill in where yfinance returned None
    yf_non_null = sum(1 for v in raw_metrics.values() if v is not None)
    logger.info(f"[FinancialMetrics] yfinance provided {yf_non_null}/69 non-null metrics for {ticker}")

    for key, edgar_val in edgar_metrics.items():
        if raw_metrics.get(key) is None and edgar_val is not None:
            raw_metrics[key] = edgar_val
            logger.debug(f"[FinancialMetrics] Filled {key}={edgar_val} from EDGAR for {ticker}")

    merged_non_null = sum(1 for v in raw_metrics.values() if v is not None)
    logger.info(f"[FinancialMetrics] After merge: {merged_non_null}/69 non-null metrics for {ticker}")

    # Get sparklines
    sparklines = _get_sparklines(data)

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
            # Determine source: if value came from EDGAR fill-in, mark it
            source = data.get("source", "yfinance")
            if key in edgar_metrics and edgar_metrics[key] is not None and value == edgar_metrics[key]:
                source = edgar_source or "edgar"
            metric_entry = {
                "value": value,
                "source": source,
            }

            # Add sector benchmark data
            ss = sector_stats.get(key)
            if ss and value is not None and isinstance(value, (int, float)):
                metric_entry["sector_median"] = ss.get("median")
                # Compute percentile rank
                metric_entry["percentile"] = _compute_percentile_rank(
                    value,
                    []  # We don't have the raw values, estimate from stats
                )
                # Better percentile estimate using p25/p75
                p25 = ss.get("p25", 0)
                p75 = ss.get("p75", 0)
                median = ss.get("median", 0)
                if p75 != p25:
                    # Linear interpolation estimate
                    if value <= p25:
                        metric_entry["percentile"] = max(0, int(25 * value / p25)) if p25 != 0 else 10
                    elif value <= median:
                        metric_entry["percentile"] = 25 + int(25 * (value - p25) / (median - p25))
                    elif value <= p75:
                        metric_entry["percentile"] = 50 + int(25 * (value - median) / (p75 - median))
                    else:
                        # Above p75, estimate 75-100 range
                        metric_entry["percentile"] = min(99, 75 + int(25 * min((value - p75) / max(p75, 1), 1)))
                else:
                    metric_entry["percentile"] = 50
            elif value is not None and isinstance(value, (int, float)):
                metric_entry["sector_median"] = None
                metric_entry["percentile"] = None
            else:
                metric_entry["sector_median"] = None
                metric_entry["percentile"] = None

            # Add sparkline if available
            if key in sparklines and sparklines[key]:
                metric_entry["sparkline"] = sparklines[key]

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
                include_sparklines: bool = False) -> dict:
    """Get financial metrics for a ticker, using cache or computing fresh.

    Args:
        ticker: Stock ticker symbol.
        category: If provided, return only this category.
        include_sparklines: If False, strip sparkline data for smaller response.

    Returns:
        Full or filtered metrics dict.
    """
    # Try cache first
    result = get_cached_metrics(ticker)

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

    Should run before per-stock computation so sector benchmarks are available.
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


def batch_compute_all(tickers: Optional[list[str]] = None) -> dict:
    """Batch compute financial metrics for all stocks in the universe.

    Rate-limited: max 5 concurrent yfinance fetches, 1s delay between batches of 50.

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

    # Step 1: Precompute sector medians
    logger.info("[FinancialMetrics] Step 1: Computing sector medians...")
    all_sector_stats = precompute_sector_medians()

    # Step 2: Compute per-stock metrics in rate-limited batches
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
                sector = _get_sector_for_ticker(t)
                sector_stats = all_sector_stats.get(sector, {})
                futures[executor.submit(_compute_and_store_single, t, sector_stats)] = t

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

    duration = round(time.time() - start_time, 1)
    logger.info(f"[FinancialMetrics] Batch complete: {computed} computed, {failed} failed, "
                f"{duration}s elapsed")

    return {
        "computed": computed,
        "failed": failed,
        "total": len(tickers),
        "duration_seconds": duration,
        "errors": errors[:10],  # First 10 errors only
    }


def _compute_and_store_single(ticker: str, sector_stats: dict) -> bool:
    """Compute and store metrics for a single ticker. Returns True on success."""
    try:
        metrics = compute_all_metrics(ticker, sector_stats=sector_stats)
        store_metrics(ticker, metrics)
        return True
    except Exception as e:
        logger.warning(f"[FinancialMetrics] Failed for {ticker}: {e}")
        return False

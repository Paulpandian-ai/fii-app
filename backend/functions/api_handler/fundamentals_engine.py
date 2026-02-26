"""Fundamentals Engine — Altman Z-Score, Piotroski F-Score, Beneish M-Score, DCF.

Pure Python. No numpy/pandas. Uses SEC EDGAR XBRL API for financial statements.

Scores:
  - Altman Z-Score: bankruptcy prediction (30% of grade)
  - Piotroski F-Score: value quality 0-9 (30% of grade)
  - Beneish M-Score: earnings manipulation detection (20% of grade)
  - Liquidity Ratios: current ratio, debt/equity, etc. (20% of grade)
  - DCF Fair Value: two-stage discounted cash flow model

Data Sources:
  - SEC EDGAR companyfacts XBRL API (primary — free, no key needed)
  - Finnhub for market cap / beta (already available)
"""

import json
import logging
import math
import urllib.request
import urllib.error
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_SEC_BASE = "https://data.sec.gov/api/xbrl/companyfacts"
_SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
_USER_AGENT = "FII App support@fii.app"

# Cache CIK lookups in memory (Lambda warm start)
_cik_cache = {}


# ─── SEC EDGAR Data Fetching ───


def _sec_request(url):
    """Make request to SEC EDGAR with required User-Agent header."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": _USER_AGENT,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        logger.error(f"[SEC] Request failed for {url}: {e}")
        return None


def _get_cik(ticker):
    """Look up SEC CIK number for a ticker symbol."""
    if ticker in _cik_cache:
        return _cik_cache[ticker]

    data = _sec_request(_SEC_TICKERS_URL)
    if not data:
        return None

    for entry in data.values():
        t = entry.get("ticker", "").upper()
        cik = entry.get("cik_str")
        if cik:
            _cik_cache[t] = str(cik).zfill(10)

    return _cik_cache.get(ticker)


def _get_company_facts(ticker):
    """Fetch all XBRL facts for a company from SEC EDGAR."""
    cik = _get_cik(ticker)
    if not cik:
        logger.warning(f"[SEC] CIK not found for {ticker}")
        return None

    url = f"{_SEC_BASE}/CIK{cik}.json"
    return _sec_request(url)


def _extract_annual_values(facts, concept, taxonomy="us-gaap", years=3):
    """Extract annual (10-K) values for a concept, most recent N years.

    Returns list of {year, value} sorted by year descending.
    """
    try:
        concept_data = facts.get("facts", {}).get(taxonomy, {}).get(concept, {})
        units = concept_data.get("units", {})
        # Try USD first, then pure (for ratios)
        entries = units.get("USD", units.get("USD/shares", units.get("pure", [])))
        if not entries:
            return []

        # Filter to annual filings (10-K)
        annual = [
            e for e in entries
            if e.get("form") == "10-K" and e.get("end")
        ]

        # Deduplicate by fiscal year end, keep latest filed
        by_year = {}
        for e in annual:
            end_date = e["end"]
            year = int(end_date[:4])
            filed = e.get("filed", "")
            if year not in by_year or filed > by_year[year]["filed"]:
                by_year[year] = {"year": year, "value": e["val"], "filed": filed, "end": end_date}

        result = sorted(by_year.values(), key=lambda x: x["year"], reverse=True)
        return result[:years]
    except Exception as e:
        logger.debug(f"[SEC] Failed to extract {concept}: {e}")
        return []


def _val(entries, index=0):
    """Get value from extracted entries at index, or None."""
    if entries and len(entries) > index:
        return entries[index].get("value")
    return None


def _safe_div(a, b):
    """Safe division returning None if b is 0 or either is None."""
    if a is None or b is None or b == 0:
        return None
    return a / b


def extract_financials(ticker, facts=None):
    """Extract 3 years of financial data from SEC EDGAR.

    Returns dict with balance sheet, income statement, and cash flow items.
    """
    if facts is None:
        facts = _get_company_facts(ticker)
    if not facts:
        return None

    # Map concept names to our standard keys
    # SEC XBRL concept names — try multiple variants for each item
    concepts = {
        # Balance Sheet
        "totalAssets": ["Assets"],
        "totalLiabilities": ["Liabilities", "LiabilitiesAndStockholdersEquity"],
        "currentAssets": ["AssetsCurrent"],
        "currentLiabilities": ["LiabilitiesCurrent"],
        "retainedEarnings": ["RetainedEarningsAccumulatedDeficit"],
        "totalEquity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
        "totalDebt": ["LongTermDebt", "LongTermDebtNoncurrent"],
        "cash": ["CashAndCashEquivalentsAtCarryingValue", "Cash"],
        "receivables": ["AccountsReceivableNetCurrent", "AccountsReceivableNet"],
        "inventory": ["InventoryNet"],
        "ppe": ["PropertyPlantAndEquipmentNet"],
        "longTermDebt": ["LongTermDebtNoncurrent", "LongTermDebt"],
        "shortTermDebt": ["ShortTermBorrowings", "DebtCurrent"],
        "sharesOutstanding": ["CommonStockSharesOutstanding", "EntityCommonStockSharesOutstanding"],
        # Income Statement
        "revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
        "netIncome": ["NetIncomeLoss"],
        "ebit": ["OperatingIncomeLoss"],
        "grossProfit": ["GrossProfit"],
        "sgaExpense": ["SellingGeneralAndAdministrativeExpense"],
        "depreciation": ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization"],
        "interestExpense": ["InterestExpense"],
        "costOfRevenue": ["CostOfGoodsAndServicesSold", "CostOfRevenue"],
        # Cash Flow
        "operatingCashFlow": ["NetCashProvidedByOperatingActivities"],
        "capex": ["PaymentsToAcquirePropertyPlantAndEquipment"],
    }

    result = {"years": []}
    data_by_key = {}

    for key, concept_names in concepts.items():
        for concept_name in concept_names:
            entries = _extract_annual_values(facts, concept_name, years=3)
            if entries:
                data_by_key[key] = entries
                break
        if key not in data_by_key:
            data_by_key[key] = []

    # Determine years from totalAssets (most reliable)
    year_entries = data_by_key.get("totalAssets", [])
    if not year_entries:
        # Try revenue as fallback
        year_entries = data_by_key.get("revenue", [])
    if not year_entries:
        return None

    years = [e["year"] for e in year_entries]
    result["years"] = years

    # Build year-indexed data
    for key, entries in data_by_key.items():
        year_map = {e["year"]: e["value"] for e in entries}
        result[key] = [year_map.get(y) for y in years]

    # Compute derived values
    for i in range(len(years)):
        ta = (result.get("totalAssets") or [None])[i] if i < len(result.get("totalAssets", [])) else None
        tl = (result.get("totalLiabilities") or [None])[i] if i < len(result.get("totalLiabilities", [])) else None
        # If totalLiabilities not directly available, derive from Assets - Equity
        if tl is None and ta is not None:
            te = (result.get("totalEquity") or [None])[i] if i < len(result.get("totalEquity", [])) else None
            if te is not None:
                if "totalLiabilities" not in result:
                    result["totalLiabilities"] = [None] * len(years)
                result["totalLiabilities"][i] = ta - te

    # Working capital
    result["workingCapital"] = []
    for i in range(len(years)):
        ca = (result.get("currentAssets") or [None])[i] if i < len(result.get("currentAssets", [])) else None
        cl = (result.get("currentLiabilities") or [None])[i] if i < len(result.get("currentLiabilities", [])) else None
        wc = (ca - cl) if ca is not None and cl is not None else None
        result["workingCapital"].append(wc)

    # Free cash flow
    result["freeCashFlow"] = []
    for i in range(len(years)):
        ocf = (result.get("operatingCashFlow") or [None])[i] if i < len(result.get("operatingCashFlow", [])) else None
        cx = (result.get("capex") or [None])[i] if i < len(result.get("capex", [])) else None
        if ocf is not None and cx is not None:
            result["freeCashFlow"].append(ocf - abs(cx))
        elif ocf is not None:
            result["freeCashFlow"].append(ocf)
        else:
            result["freeCashFlow"].append(None)

    return result


# ─── Altman Z-Score ───


def compute_z_score(financials, market_cap=None):
    """Compute Altman Z-Score for bankruptcy prediction.

    Z = 1.2*X1 + 1.4*X2 + 3.3*X3 + 0.6*X4 + 1.0*X5
    where:
      X1 = Working Capital / Total Assets
      X2 = Retained Earnings / Total Assets
      X3 = EBIT / Total Assets
      X4 = Market Cap / Total Liabilities
      X5 = Revenue / Total Assets
    """
    if not financials:
        return None

    def _get(key, idx=0):
        vals = financials.get(key, [])
        return vals[idx] if idx < len(vals) and vals[idx] is not None else None

    ta = _get("totalAssets")
    tl = _get("totalLiabilities")
    wc = _get("workingCapital")
    re = _get("retainedEarnings")
    ebit = _get("ebit")
    rev = _get("revenue")

    if ta is None or ta == 0:
        return None

    x1 = _safe_div(wc, ta)
    x2 = _safe_div(re, ta)
    x3 = _safe_div(ebit, ta)
    x4 = _safe_div(market_cap, tl) if market_cap and tl else None
    x5 = _safe_div(rev, ta)

    # Need at least X1, X3, X5 for a meaningful score
    if x1 is None and x3 is None:
        return None

    components = {
        "workingCapitalToAssets": round(x1 or 0, 4),
        "retainedEarningsToAssets": round(x2 or 0, 4),
        "ebitToAssets": round(x3 or 0, 4),
        "marketCapToLiabilities": round(x4 or 0, 4),
        "revenueToAssets": round(x5 or 0, 4),
    }

    z = (1.2 * (x1 or 0) +
         1.4 * (x2 or 0) +
         3.3 * (x3 or 0) +
         0.6 * (x4 or 0) +
         1.0 * (x5 or 0))

    if z > 2.99:
        zone = "safe"
    elif z >= 1.81:
        zone = "gray"
    else:
        zone = "distress"

    return {
        "value": round(z, 2),
        "zone": zone,
        "components": components,
    }


# ─── Piotroski F-Score ───


def compute_f_score(financials):
    """Compute Piotroski F-Score (0-9) for value quality assessment.

    Profitability (4): ROA > 0, OCF > 0, ROA improving, OCF > NI
    Leverage (3): Debt/Assets decreasing, Current Ratio increasing, No dilution
    Efficiency (2): Gross Margin improving, Asset Turnover improving
    """
    if not financials:
        return None

    def _get(key, idx=0):
        vals = financials.get(key, [])
        return vals[idx] if idx < len(vals) and vals[idx] is not None else None

    criteria = []
    score = 0

    # Current year
    ta0 = _get("totalAssets", 0)
    ni0 = _get("netIncome", 0)
    ocf0 = _get("operatingCashFlow", 0)
    rev0 = _get("revenue", 0)
    gp0 = _get("grossProfit", 0)
    ca0 = _get("currentAssets", 0)
    cl0 = _get("currentLiabilities", 0)
    ltd0 = _get("longTermDebt", 0) or _get("totalDebt", 0)
    shares0 = _get("sharesOutstanding", 0)

    # Prior year
    ta1 = _get("totalAssets", 1)
    ni1 = _get("netIncome", 1)
    ocf1 = _get("operatingCashFlow", 1)
    rev1 = _get("revenue", 1)
    gp1 = _get("grossProfit", 1)
    ca1 = _get("currentAssets", 1)
    cl1 = _get("currentLiabilities", 1)
    ltd1 = _get("longTermDebt", 1) or _get("totalDebt", 1)
    shares1 = _get("sharesOutstanding", 1)

    # Profitability
    roa0 = _safe_div(ni0, ta0)
    roa1 = _safe_div(ni1, ta1)

    # 1. ROA > 0
    p1 = 1 if roa0 is not None and roa0 > 0 else 0
    criteria.append({"name": "Positive ROA", "earned": bool(p1), "detail": f"ROA = {round(roa0 * 100, 1)}%" if roa0 is not None else "N/A"})
    score += p1

    # 2. Operating Cash Flow > 0
    p2 = 1 if ocf0 is not None and ocf0 > 0 else 0
    criteria.append({"name": "Positive Operating Cash Flow", "earned": bool(p2), "detail": f"OCF = ${_fmt_millions(ocf0)}" if ocf0 is not None else "N/A"})
    score += p2

    # 3. ROA Improving
    p3 = 1 if roa0 is not None and roa1 is not None and roa0 > roa1 else 0
    criteria.append({"name": "ROA Improving", "earned": bool(p3), "detail": f"{round((roa0 or 0) * 100, 1)}% vs {round((roa1 or 0) * 100, 1)}%"})
    score += p3

    # 4. Cash Flow > Net Income (quality of earnings)
    p4 = 1 if ocf0 is not None and ni0 is not None and ocf0 > ni0 else 0
    criteria.append({"name": "Cash Flow > Net Income", "earned": bool(p4), "detail": "Accrual quality check"})
    score += p4

    # Leverage
    # 5. Long-term Debt/Assets decreasing
    da0 = _safe_div(ltd0, ta0)
    da1 = _safe_div(ltd1, ta1)
    p5 = 1 if da0 is not None and da1 is not None and da0 <= da1 else (1 if da0 is not None and da0 == 0 else 0)
    criteria.append({"name": "Debt/Assets Decreasing", "earned": bool(p5), "detail": f"{round((da0 or 0) * 100, 1)}% vs {round((da1 or 0) * 100, 1)}%"})
    score += p5

    # 6. Current Ratio improving
    cr0 = _safe_div(ca0, cl0)
    cr1 = _safe_div(ca1, cl1)
    p6 = 1 if cr0 is not None and cr1 is not None and cr0 > cr1 else 0
    criteria.append({"name": "Current Ratio Increasing", "earned": bool(p6), "detail": f"{round(cr0 or 0, 2)} vs {round(cr1 or 0, 2)}"})
    score += p6

    # 7. No share dilution
    p7 = 1 if shares0 is not None and shares1 is not None and shares0 <= shares1 else (1 if shares0 is None else 0)
    criteria.append({"name": "No Dilution", "earned": bool(p7), "detail": "Shares outstanding stable or decreasing"})
    score += p7

    # Efficiency
    # 8. Gross margin improving
    gm0 = _safe_div(gp0, rev0)
    gm1 = _safe_div(gp1, rev1)
    p8 = 1 if gm0 is not None and gm1 is not None and gm0 > gm1 else 0
    criteria.append({"name": "Gross Margin Improving", "earned": bool(p8), "detail": f"{round((gm0 or 0) * 100, 1)}% vs {round((gm1 or 0) * 100, 1)}%"})
    score += p8

    # 9. Asset turnover improving
    at0 = _safe_div(rev0, ta0)
    at1 = _safe_div(rev1, ta1)
    p9 = 1 if at0 is not None and at1 is not None and at0 > at1 else 0
    criteria.append({"name": "Asset Turnover Improving", "earned": bool(p9), "detail": f"{round(at0 or 0, 3)} vs {round(at1 or 0, 3)}"})
    score += p9

    if score >= 8:
        interpretation = "strong"
    elif score >= 5:
        interpretation = "moderate"
    else:
        interpretation = "weak"

    return {
        "value": score,
        "maxScore": 9,
        "interpretation": interpretation,
        "criteria": criteria,
    }


# ─── Beneish M-Score ───


def compute_m_score(financials):
    """Compute Beneish M-Score for earnings manipulation detection.

    M = -4.84 + 0.92*DSRI + 0.528*GMI + 0.404*AQI + 0.892*SGI
        + 0.115*DEPI - 0.172*SGAI + 4.679*TATA - 0.327*LVGI

    M > -2.22 = Likely Manipulator (red flag)
    M < -2.22 = Unlikely Manipulator (green)
    """
    if not financials:
        return None

    def _get(key, idx=0):
        vals = financials.get(key, [])
        return vals[idx] if idx < len(vals) and vals[idx] is not None else None

    # Current year (index 0) and prior year (index 1)
    rev0, rev1 = _get("revenue", 0), _get("revenue", 1)
    gp0, gp1 = _get("grossProfit", 0), _get("grossProfit", 1)
    rec0, rec1 = _get("receivables", 0), _get("receivables", 1)
    ta0, ta1 = _get("totalAssets", 0), _get("totalAssets", 1)
    ca0, ca1 = _get("currentAssets", 0), _get("currentAssets", 1)
    ppe0, ppe1 = _get("ppe", 0), _get("ppe", 1)
    dep0, dep1 = _get("depreciation", 0), _get("depreciation", 1)
    sga0, sga1 = _get("sgaExpense", 0), _get("sgaExpense", 1)
    tl0, tl1 = _get("totalLiabilities", 0), _get("totalLiabilities", 1)
    ni0 = _get("netIncome", 0)
    ocf0 = _get("operatingCashFlow", 0)

    if rev0 is None or rev1 is None or rev1 == 0:
        return None
    if ta0 is None or ta1 is None or ta1 == 0:
        return None

    components = {}

    # DSRI - Days Sales in Receivables Index
    dsri_num = _safe_div(rec0, rev0)
    dsri_den = _safe_div(rec1, rev1)
    dsri = _safe_div(dsri_num, dsri_den) if dsri_num is not None and dsri_den is not None and dsri_den != 0 else 1.0
    components["DSRI"] = round(dsri, 4)

    # GMI - Gross Margin Index
    gm0_val = _safe_div(gp0, rev0) if gp0 is not None else None
    gm1_val = _safe_div(gp1, rev1) if gp1 is not None else None
    gmi = _safe_div(gm1_val, gm0_val) if gm1_val is not None and gm0_val is not None and gm0_val != 0 else 1.0
    components["GMI"] = round(gmi, 4)

    # AQI - Asset Quality Index
    aq0 = 1 - _safe_div((ca0 or 0) + (ppe0 or 0), ta0) if ta0 else 0
    aq1 = 1 - _safe_div((ca1 or 0) + (ppe1 or 0), ta1) if ta1 else 0
    aqi = _safe_div(aq0, aq1) if aq1 and aq1 != 0 else 1.0
    components["AQI"] = round(aqi or 1.0, 4)

    # SGI - Sales Growth Index
    sgi = _safe_div(rev0, rev1) if rev1 != 0 else 1.0
    components["SGI"] = round(sgi, 4)

    # DEPI - Depreciation Index
    dep_rate0 = _safe_div(dep0, (dep0 or 0) + (ppe0 or 0)) if dep0 and ppe0 else None
    dep_rate1 = _safe_div(dep1, (dep1 or 0) + (ppe1 or 0)) if dep1 and ppe1 else None
    depi = _safe_div(dep_rate1, dep_rate0) if dep_rate0 and dep_rate0 != 0 and dep_rate1 is not None else 1.0
    components["DEPI"] = round(depi, 4)

    # SGAI - SG&A Index
    sga_rate0 = _safe_div(sga0, rev0) if sga0 is not None else None
    sga_rate1 = _safe_div(sga1, rev1) if sga1 is not None else None
    sgai = _safe_div(sga_rate0, sga_rate1) if sga_rate1 and sga_rate1 != 0 and sga_rate0 is not None else 1.0
    components["SGAI"] = round(sgai, 4)

    # LVGI - Leverage Index
    lev0 = _safe_div(tl0, ta0) if tl0 is not None else None
    lev1 = _safe_div(tl1, ta1) if tl1 is not None else None
    lvgi = _safe_div(lev0, lev1) if lev1 and lev1 != 0 and lev0 is not None else 1.0
    components["LVGI"] = round(lvgi, 4)

    # TATA - Total Accruals to Total Assets
    tata = _safe_div((ni0 or 0) - (ocf0 or 0), ta0) if ta0 and ta0 != 0 else 0
    components["TATA"] = round(tata, 4)

    m = (-4.84
         + 0.92 * dsri
         + 0.528 * gmi
         + 0.404 * (aqi or 1.0)
         + 0.892 * sgi
         + 0.115 * depi
         - 0.172 * sgai
         + 4.679 * tata
         - 0.327 * lvgi)

    interpretation = "likely_manipulator" if m > -2.22 else "unlikely_manipulator"

    return {
        "value": round(m, 2),
        "threshold": -2.22,
        "interpretation": interpretation,
        "components": components,
    }


# ─── DCF Fair Value ───


def compute_dcf(financials, market_cap=None, beta=1.0, current_price=None, shares_outstanding=None):
    """Two-stage DCF fair value estimation.

    Stage 1 (Years 1-10): Project FCF at estimated growth rate
    Stage 2 (Terminal Value): Gordon Growth Model

    Discount rate via CAPM = Risk-Free + Beta * ERP
    """
    if not financials:
        return None

    def _get(key, idx=0):
        vals = financials.get(key, [])
        return vals[idx] if idx < len(vals) and vals[idx] is not None else None

    fcf0 = _get("freeCashFlow", 0)
    if fcf0 is None or fcf0 <= 0:
        # Try operating cash flow as fallback
        fcf0 = _get("operatingCashFlow", 0)
        if fcf0 is None or fcf0 <= 0:
            return None

    # Estimate shares outstanding
    if shares_outstanding is None or shares_outstanding == 0:
        shares_outstanding = _get("sharesOutstanding", 0)
    if shares_outstanding is None or shares_outstanding == 0:
        if market_cap and current_price and current_price > 0:
            shares_outstanding = market_cap / current_price
        else:
            return None

    # Estimate growth rate from historical FCF/revenue CAGR
    fcf1 = _get("freeCashFlow", 1)
    fcf2 = _get("freeCashFlow", 2)
    rev0_val = _get("revenue", 0)
    rev2_val = _get("revenue", 2)

    growth_rate = 0.08  # default 8%
    if fcf0 and fcf2 and fcf2 > 0 and fcf0 > 0:
        try:
            growth_rate = (fcf0 / fcf2) ** (1 / 2) - 1
        except Exception:
            pass
    elif rev0_val and rev2_val and rev2_val > 0:
        try:
            growth_rate = (rev0_val / rev2_val) ** (1 / 2) - 1
        except Exception:
            pass

    # Cap growth rate to reasonable bounds
    growth_rate = max(-0.05, min(growth_rate, 0.25))

    # CAPM discount rate
    risk_free_rate = 0.043  # ~4.3% (approximate 10Y Treasury)
    equity_risk_premium = 0.055  # 5.5% (Damodaran US ERP)
    beta = max(0.5, min(float(beta or 1.0), 3.0))
    discount_rate = risk_free_rate + beta * equity_risk_premium

    # Terminal growth rate
    terminal_growth = min(0.03, growth_rate * 0.3)  # GDP growth cap

    # Stage 1: Project FCF for years 1-10
    projected_fcf = []
    pv_fcf_total = 0
    for year in range(1, 11):
        # Fade growth rate toward terminal rate over 10 years
        fade_factor = (10 - year) / 10
        year_growth = terminal_growth + (growth_rate - terminal_growth) * fade_factor
        fcf_year = fcf0 * ((1 + year_growth) ** year)
        pv = fcf_year / ((1 + discount_rate) ** year)
        pv_fcf_total += pv
        projected_fcf.append(round(fcf_year))

    # Stage 2: Terminal value (Gordon Growth Model)
    terminal_fcf = projected_fcf[-1] * (1 + terminal_growth)
    terminal_value = terminal_fcf / (discount_rate - terminal_growth)
    pv_terminal = terminal_value / ((1 + discount_rate) ** 10)

    # Enterprise value
    enterprise_value = pv_fcf_total + pv_terminal

    # Fair value per share
    fair_value = enterprise_value / shares_outstanding

    # Upside/downside
    upside = None
    if current_price and current_price > 0:
        upside = round(((fair_value / current_price) - 1) * 100, 1)

    # Sensitivity table (3x3: WACC vs terminal growth)
    wacc_scenarios = [discount_rate - 0.01, discount_rate, discount_rate + 0.01]
    tg_scenarios = [terminal_growth - 0.005, terminal_growth, terminal_growth + 0.005]
    sensitivity = []
    for wacc in wacc_scenarios:
        row = []
        for tg in tg_scenarios:
            if wacc <= tg:
                row.append(None)
                continue
            pv_sum = 0
            for year in range(1, 11):
                fade = (10 - year) / 10
                yg = tg + (growth_rate - tg) * fade
                fy = fcf0 * ((1 + yg) ** year)
                pv_sum += fy / ((1 + wacc) ** year)
            tfcf = fcf0 * ((1 + growth_rate * 0.5) ** 10) * (1 + tg)
            tv = tfcf / (wacc - tg)
            pvtv = tv / ((1 + wacc) ** 10)
            fv = (pv_sum + pvtv) / shares_outstanding
            row.append(round(fv, 2))
        sensitivity.append({
            "wacc": round(wacc * 100, 1),
            "values": row,
        })

    return {
        "fairValue": round(fair_value, 2),
        "currentPrice": round(current_price, 2) if current_price else None,
        "upside": upside,
        "growthRate": round(growth_rate * 100, 1),
        "discountRate": round(discount_rate * 100, 1),
        "terminalGrowth": round(terminal_growth * 100, 1),
        "sensitivity": sensitivity,
        "terminalGrowthScenarios": [round(tg * 100, 1) for tg in tg_scenarios],
    }


# ─── Liquidity Ratios ───


def compute_ratios(financials, market_cap=None, current_price=None):
    """Compute key financial ratios."""
    if not financials:
        return {}

    def _get(key, idx=0):
        vals = financials.get(key, [])
        return vals[idx] if idx < len(vals) and vals[idx] is not None else None

    ta = _get("totalAssets")
    tl = _get("totalLiabilities")
    te = _get("totalEquity")
    ca = _get("currentAssets")
    cl = _get("currentLiabilities")
    ni = _get("netIncome")
    rev = _get("revenue")
    ebit = _get("ebit")
    td = _get("totalDebt") or _get("longTermDebt")

    ratios = {}
    cr = _safe_div(ca, cl)
    if cr is not None:
        ratios["currentRatio"] = round(cr, 2)
    de = _safe_div(td or (tl or 0), te) if te and te != 0 else None
    if de is not None:
        ratios["debtToEquity"] = round(de, 2)
    roe = _safe_div(ni, te)
    if roe is not None:
        ratios["roe"] = round(roe * 100, 1)
    roa = _safe_div(ni, ta)
    if roa is not None:
        ratios["roa"] = round(roa * 100, 1)
    npm = _safe_div(ni, rev)
    if npm is not None:
        ratios["netProfitMargin"] = round(npm * 100, 1)
    opm = _safe_div(ebit, rev)
    if opm is not None:
        ratios["operatingMargin"] = round(opm * 100, 1)
    at = _safe_div(rev, ta)
    if at is not None:
        ratios["assetTurnover"] = round(at, 3)

    # Valuation ratios (need market cap)
    if market_cap:
        pe = _safe_div(market_cap, ni)
        if pe is not None:
            # Store P/E even for negative earnings (frontend handles display)
            ratios["peRatio"] = round(pe, 1)
            if ni is not None and ni < 0:
                ratios["negativeEarnings"] = True
        pb = _safe_div(market_cap, te)
        if pb is not None:
            ratios["priceToBook"] = round(pb, 2)
        if ebit and ebit > 0:
            ev = market_cap + (td or 0) - (_get("cash") or 0)
            ev_ebitda = _safe_div(ev, ebit + (_get("depreciation") or 0))
            if ev_ebitda is not None:
                ratios["evToEbitda"] = round(ev_ebitda, 1)

    return ratios


# ─── Composite Health Grade ───


def compute_health_grade(z_score, f_score, m_score, ratios):
    """Compute composite financial health grade (A-F).

    Weights: Z-Score 30%, F-Score 30%, M-Score 20%, Liquidity 20%
    """
    total = 0
    weight_sum = 0

    # Z-Score contribution (30%) — map to 0-100
    if z_score:
        z = z_score["value"]
        if z >= 3.5:
            z_pct = 100
        elif z >= 2.99:
            z_pct = 85
        elif z >= 1.81:
            z_pct = 60
        elif z >= 1.0:
            z_pct = 35
        else:
            z_pct = 15
        total += z_pct * 30
        weight_sum += 30

    # F-Score contribution (30%) — map to 0-100
    if f_score:
        f_pct = (f_score["value"] / 9) * 100
        total += f_pct * 30
        weight_sum += 30

    # M-Score contribution (20%) — map to 0-100
    if m_score:
        m = m_score["value"]
        if m < -3.0:
            m_pct = 95
        elif m < -2.22:
            m_pct = 75
        elif m < -1.78:
            m_pct = 40
        else:
            m_pct = 15
        total += m_pct * 20
        weight_sum += 20

    # Liquidity contribution (20%)
    if ratios:
        liq_score = 50  # default
        cr = ratios.get("currentRatio")
        de = ratios.get("debtToEquity")
        roe = ratios.get("roe")

        if cr is not None:
            if cr >= 2.0:
                liq_score += 15
            elif cr >= 1.5:
                liq_score += 10
            elif cr >= 1.0:
                liq_score += 0
            else:
                liq_score -= 15

        if de is not None:
            if de < 0.5:
                liq_score += 15
            elif de < 1.0:
                liq_score += 5
            elif de < 2.0:
                liq_score -= 5
            else:
                liq_score -= 15

        if roe is not None:
            if roe > 20:
                liq_score += 15
            elif roe > 10:
                liq_score += 5
            elif roe > 0:
                liq_score += 0
            else:
                liq_score -= 10

        liq_score = max(0, min(100, liq_score))
        total += liq_score * 20
        weight_sum += 20

    if weight_sum == 0:
        return None

    grade_score = total / weight_sum

    if grade_score >= 90:
        grade = "A"
    elif grade_score >= 80:
        grade = "A-"
    elif grade_score >= 75:
        grade = "B+"
    elif grade_score >= 67:
        grade = "B"
    elif grade_score >= 60:
        grade = "C+"
    elif grade_score >= 52:
        grade = "C"
    elif grade_score >= 45:
        grade = "D"
    else:
        grade = "F"

    return {
        "grade": grade,
        "gradeScore": round(grade_score, 1),
    }


# ─── Main Entry Point ───


def _build_fallback_from_finnhub(ticker, market_cap=None, beta=1.0, current_price=None):
    """Build a partial fundamental analysis from Finnhub metrics when SEC EDGAR fails.

    This ensures every ticker gets *some* fundamental data (P/E, margins, etc.)
    even if SEC filings are unavailable or use non-standard XBRL concepts.
    """
    try:
        import finnhub_client
        financials = finnhub_client.get_basic_financials(ticker)
        if not financials:
            return None

        ratios = {}
        pe = financials.get("peRatio")
        if pe is not None:
            pe_val = round(float(pe), 2)
            ratios["peRatio"] = pe_val
            if pe_val < 0:
                ratios["negativeEarnings"] = True
        fwd_pe = financials.get("forwardPE")
        if fwd_pe is not None:
            ratios["forwardPE"] = round(float(fwd_pe), 2)
        roe = financials.get("roeTTM")
        if roe is not None:
            ratios["roe"] = round(float(roe), 4)
        de = financials.get("debtEquity")
        if de is not None:
            ratios["debtToEquity"] = round(float(de), 2)
        margin = financials.get("profitMargin")
        if margin is not None:
            ratios["netProfitMargin"] = round(float(margin), 4)

        if not ratios:
            return None

        # Derive a simple grade from available ratios
        grade_score = 5  # Start neutral
        if ratios.get("roe") is not None:
            if ratios["roe"] > 0.15:
                grade_score += 2
            elif ratios["roe"] > 0.08:
                grade_score += 1
            elif ratios["roe"] < 0:
                grade_score -= 2
        if ratios.get("debtToEquity") is not None:
            if ratios["debtToEquity"] < 0.5:
                grade_score += 1
            elif ratios["debtToEquity"] > 2.0:
                grade_score -= 1
        if ratios.get("netProfitMargin") is not None:
            if ratios["netProfitMargin"] > 0.15:
                grade_score += 1
            elif ratios["netProfitMargin"] < 0:
                grade_score -= 2
        grade_score = max(0, min(10, grade_score))

        grade_map = {10: "A", 9: "A", 8: "A", 7: "B", 6: "B", 5: "C", 4: "C", 3: "D", 2: "D", 1: "F", 0: "F"}
        grade = grade_map.get(grade_score, "C")

        return {
            "ticker": ticker,
            "grade": grade,
            "gradeScore": grade_score,
            "ratios": ratios,
            "zScore": None,
            "fScore": None,
            "mScore": None,
            "dcf": None,
            "years": [],
            "source": "finnhub_fallback",
            "analyzedAt": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.warning(f"[Fundamentals] Finnhub fallback failed for {ticker}: {e}")
        return None


def analyze(ticker, market_cap=None, beta=1.0, current_price=None, shares_outstanding=None):
    """Run full fundamental analysis for a ticker.

    Returns complete analysis package: grade, zScore, fScore, mScore, dcf, ratios.
    Falls back to Finnhub basic financials when SEC EDGAR data is unavailable.
    """
    logger.info(f"[Fundamentals] Analyzing {ticker}")

    facts = _get_company_facts(ticker)
    financials = None
    if facts:
        financials = extract_financials(ticker, facts)

    # If SEC EDGAR data is missing, fall back to Finnhub-derived metrics
    if not financials:
        logger.info(f"[Fundamentals] SEC EDGAR unavailable for {ticker}, trying Finnhub fallback")
        fallback = _build_fallback_from_finnhub(ticker, market_cap, beta, current_price)
        if fallback:
            return fallback
        return {"ticker": ticker, "error": "Insufficient financial data"}

    z_score = compute_z_score(financials, market_cap)
    f_score = compute_f_score(financials)
    m_score = compute_m_score(financials)
    ratios = compute_ratios(financials, market_cap, current_price)
    dcf = compute_dcf(financials, market_cap, beta, current_price, shares_outstanding)
    health = compute_health_grade(z_score, f_score, m_score, ratios)

    result = {
        "ticker": ticker,
        "zScore": z_score,
        "fScore": f_score,
        "mScore": m_score,
        "dcf": dcf,
        "ratios": ratios,
        "years": financials.get("years", []),
        "analyzedAt": datetime.now(timezone.utc).isoformat(),
    }

    if health:
        result["grade"] = health["grade"]
        result["gradeScore"] = health["gradeScore"]
    else:
        result["grade"] = "N/A"
        result["gradeScore"] = 0

    return result


def _fmt_millions(val):
    """Format a value in millions for display."""
    if val is None:
        return "N/A"
    if abs(val) >= 1e9:
        return f"{val / 1e9:.1f}B"
    if abs(val) >= 1e6:
        return f"{val / 1e6:.0f}M"
    return f"{val:,.0f}"

"""Fair Price Engine — Blended DCF + Relative Valuation.

Produces a single fair-value dollar estimate for any stock by blending:
  1. DCF-Lite (60%): Discounted Cash Flow from fundamentals_engine
  2. Relative Valuation (40%): EPS × Sector Median P/E

Falls back to whichever model has data when only one is available.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# ─── Sector Median P/E Ratios (S&P 500, approximate as of 2025) ───
# Source: FactSet / Yardeni Research sector medians
SECTOR_PE = {
    "Technology": 28.0,
    "Information Technology": 28.0,
    "Communication Services": 22.0,
    "Consumer Discretionary": 24.0,
    "Consumer Cyclical": 24.0,
    "Consumer Staples": 22.0,
    "Consumer Defensive": 22.0,
    "Health Care": 20.0,
    "Healthcare": 20.0,
    "Financials": 15.0,
    "Financial Services": 15.0,
    "Industrials": 21.0,
    "Energy": 12.0,
    "Materials": 18.0,
    "Basic Materials": 18.0,
    "Real Estate": 35.0,
    "Utilities": 18.0,
}

# Market-wide fallback P/E (S&P 500 long-term average)
DEFAULT_PE = 20.0


def _get_sector_pe(sector: str) -> float:
    """Look up sector median P/E, falling back to market average."""
    if not sector:
        return DEFAULT_PE
    # Try exact match first, then partial match
    for key, pe in SECTOR_PE.items():
        if key.lower() == sector.lower():
            return pe
    for key, pe in SECTOR_PE.items():
        if key.lower() in sector.lower() or sector.lower() in key.lower():
            return pe
    return DEFAULT_PE


def _to_float(v):
    """Safely convert any numeric type (including Decimal) to float."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def compute_fair_price(
    ticker: str,
    current_price: float | None = None,
    sector: str | None = None,
    eps_ttm: float | None = None,
    dcf_fair_value: float | None = None,
    dcf_growth_rate: float | None = None,
    dcf_discount_rate: float | None = None,
    dcf_terminal_growth: float | None = None,
) -> dict | None:
    """Compute blended fair price from DCF + Relative Valuation.

    Args:
        ticker: Stock symbol.
        current_price: Current market price.
        sector: Company sector for P/E lookup.
        eps_ttm: Trailing 12-month EPS.
        dcf_fair_value: Pre-computed DCF fair value from fundamentals_engine.
        dcf_growth_rate: Growth rate used in DCF (for display).
        dcf_discount_rate: Discount rate used in DCF (for display).
        dcf_terminal_growth: Terminal growth rate used in DCF (for display).

    Returns:
        Dict with fairPrice, valuation label, components, or None if no data.
    """
    # Convert all numeric inputs to float to avoid Decimal arithmetic errors
    current_price = _to_float(current_price)
    eps_ttm = _to_float(eps_ttm)
    dcf_fair_value = _to_float(dcf_fair_value)
    dcf_growth_rate = _to_float(dcf_growth_rate)
    dcf_discount_rate = _to_float(dcf_discount_rate)
    dcf_terminal_growth = _to_float(dcf_terminal_growth)

    dcf_value = None
    relative_value = None
    methods_used = []

    # ── 1. DCF Component ──
    if dcf_fair_value is not None and dcf_fair_value > 0:
        dcf_value = dcf_fair_value
        methods_used.append("DCF")

    # ── 2. Relative Valuation (EPS × Sector Median P/E) ──
    sector_pe = _get_sector_pe(sector)
    if eps_ttm is not None and eps_ttm > 0:
        relative_value = eps_ttm * sector_pe
        methods_used.append("Relative")

    # Need at least one model
    if dcf_value is None and relative_value is None:
        return None

    # ── 3. Blend ──
    if dcf_value is not None and relative_value is not None:
        # 60% DCF + 40% Relative
        fair_price = dcf_value * 0.6 + relative_value * 0.4
        blend_method = "blended"
    elif dcf_value is not None:
        fair_price = dcf_value
        blend_method = "dcf_only"
    else:
        fair_price = relative_value
        blend_method = "relative_only"

    fair_price = round(fair_price, 2)

    # ── 4. Valuation Label ──
    label = "fair"
    if current_price and current_price > 0 and fair_price > 0:
        ratio = current_price / fair_price
        if ratio < 0.85:
            label = "undervalued"
        elif ratio > 1.15:
            label = "overvalued"

        upside_pct = round(((fair_price / current_price) - 1) * 100, 1)
    else:
        upside_pct = None

    return {
        "ticker": ticker,
        "fairPrice": fair_price,
        "currentPrice": round(current_price, 2) if current_price else None,
        "upside": upside_pct,
        "label": label,
        "method": blend_method,
        "methodsUsed": methods_used,
        "components": {
            "dcf": {
                "value": round(dcf_value, 2) if dcf_value else None,
                "weight": 0.6 if dcf_value and relative_value else (1.0 if dcf_value else 0),
                "growthRate": dcf_growth_rate,
                "discountRate": dcf_discount_rate,
                "terminalGrowth": dcf_terminal_growth,
            },
            "relative": {
                "value": round(relative_value, 2) if relative_value else None,
                "weight": 0.4 if dcf_value and relative_value else (1.0 if relative_value else 0),
                "epsTTM": round(eps_ttm, 2) if eps_ttm else None,
                "sectorPE": sector_pe,
                "sector": sector,
            },
        },
        "disclaimer": "Fair value is a model estimate. Not investment advice.",
        "computedAt": datetime.now(timezone.utc).isoformat(),
    }

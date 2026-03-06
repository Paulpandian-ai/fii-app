"""Enhanced Stress Test Engine — 4 DFAST-calibrated scenarios with historical overlays.

Calibrated to the Federal Reserve's Dodd-Frank Act Stress Test (DFAST) methodology.
Provides 3 market-wide scenarios + 1 sector-specific shock, dollar-amount framing,
recovery estimates, and historical event overlays for retail investor comprehension.
"""

import datetime
import logging
from decimal import Decimal

logger = logging.getLogger(__name__)

# ── 4 Standardized Scenarios (DFAST-calibrated) ─────────────────────────────

SCENARIOS = {
    "moderate": {
        "id": "moderate",
        "label": "Market Pullback",
        "description": "A typical correction — happens roughly every 2 years",
        "historical_analog": "2018 Q4 selloff, 2015-2016 correction",
        "market_decline": -0.15,
        "rate_change": 0.01,        # +100bps
        "unemployment_change": 0.01,  # +1pp
        "gdp_change": -0.01,
        "vix_peak": 35,
        "spread_widening": 0.005,
        "risk_level": "MODERATE",
        "recovery_estimate": "6-12 months based on historical analogs",
    },
    "recession": {
        "id": "recession",
        "label": "Recession",
        "description": "Similar to the 2001 downturn or 2022 bear market",
        "historical_analog": "2001 dot-com recession, 2022 rate cycle",
        "market_decline": -0.30,
        "rate_change": -0.015,       # -150bps (Fed cuts)
        "unemployment_change": 0.04,  # +4pp
        "gdp_change": -0.03,
        "vix_peak": 45,
        "spread_widening": 0.015,
        "risk_level": "ELEVATED",
        "recovery_estimate": "1-2 years based on historical analogs",
    },
    "severe": {
        "id": "severe",
        "label": "Severe Crisis",
        "description": "A 2008-style financial crisis",
        "historical_analog": "2008 GFC, 2020 COVID crash",
        "market_decline": -0.50,
        "rate_change": -0.03,         # -300bps
        "unemployment_change": 0.06,  # +6pp to ~10%
        "gdp_change": -0.078,
        "vix_peak": 65,
        "spread_widening": 0.035,     # +350bps credit spread
        "risk_level": "HIGH",
        "recovery_estimate": "2-4 years based on historical analogs",
    },
    "sector_shock": {
        "id": "sector_shock",
        "label": "Sector Shock",
        "description": "Sector-specific adverse event",
        "historical_analog": "Varies by sector",
        "market_decline": -0.15,  # default fallback = moderate
        "rate_change": 0.01,
        "unemployment_change": 0.01,
        "gdp_change": -0.01,
        "vix_peak": 35,
        "spread_widening": 0.005,
        "risk_level": "ELEVATED",
        "recovery_estimate": "1-2 years based on historical analogs",
    },
}

# ── Sector-Specific Shock Parameters ────────────────────────────────────────

SECTOR_SHOCKS = {
    "technology": {
        "label": "Tech Regulation",
        "description": "Major tech regulation — PE compression 30%, revenue -10%",
        "pe_compression": 0.30,
        "revenue_impact": -0.10,
        "extra_decline": -0.25,
    },
    "financial services": {
        "label": "Credit Crisis",
        "description": "Credit crisis — loan losses +5%, NIM compression",
        "pe_compression": 0.15,
        "revenue_impact": -0.15,
        "extra_decline": -0.30,
    },
    "energy": {
        "label": "Oil Price Collapse",
        "description": "Oil price collapse to $30 — revenue -40%",
        "pe_compression": 0.10,
        "revenue_impact": -0.40,
        "extra_decline": -0.35,
    },
    "healthcare": {
        "label": "Drug Pricing Reform",
        "description": "Drug pricing reform — margin compression 15%",
        "pe_compression": 0.15,
        "revenue_impact": -0.08,
        "extra_decline": -0.15,
    },
    "consumer discretionary": {
        "label": "Consumer Recession",
        "description": "Consumer recession — same-store sales -15%",
        "pe_compression": 0.20,
        "revenue_impact": -0.15,
        "extra_decline": -0.25,
    },
    "consumer cyclical": {
        "label": "Consumer Recession",
        "description": "Consumer recession — same-store sales -15%",
        "pe_compression": 0.20,
        "revenue_impact": -0.15,
        "extra_decline": -0.25,
    },
    "industrials": {
        "label": "Trade War Escalation",
        "description": "Trade war escalation — tariff impact -20% on exports",
        "pe_compression": 0.15,
        "revenue_impact": -0.20,
        "extra_decline": -0.20,
    },
}

# ── Historical Event Date Ranges ────────────────────────────────────────────

HISTORICAL_EVENTS = [
    {
        "id": "covid_2020",
        "name": "COVID Crash 2020",
        "peak_date": "2020-02-19",
        "trough_date": "2020-03-23",
        "sp500_decline": -33.9,
    },
    {
        "id": "rate_cycle_2022",
        "name": "2022 Rate Cycle",
        "peak_date": "2022-01-03",
        "trough_date": "2022-10-12",
        "sp500_decline": -25.4,
    },
    {
        "id": "q4_2018",
        "name": "2018 Q4 Selloff",
        "peak_date": "2018-09-20",
        "trough_date": "2018-12-24",
        "sp500_decline": -19.8,
    },
    {
        "id": "gfc_2008",
        "name": "2008 Financial Crisis",
        "peak_date": "2007-10-09",
        "trough_date": "2009-03-09",
        "sp500_decline": -56.8,
    },
]


# ── Public API ───────────────────────────────────────────────────────────────


def run_stress_test(ticker, scenario_key, price_data, tech_data, health_data,
                    signal_data):
    """Run a single stress-test scenario against *ticker*.

    Returns a scenario result dict with dollar-amount framing and risk levels.
    """
    scenario = SCENARIOS.get(scenario_key)
    if scenario is None:
        return {"error": f"Unknown scenario: {scenario_key}",
                "validScenarios": list(SCENARIOS.keys())}

    current_price = float(price_data.get("price", 0))
    sector = (price_data.get("sector") or "").lower()

    # Compute per-stock stress return
    beta = _estimate_beta(tech_data)
    sector_adj = _sector_adjustment(sector, scenario_key)
    idiosyncratic = _idiosyncratic_factor(health_data)

    market_decline = scenario["market_decline"]

    if scenario_key == "sector_shock":
        shock = _get_sector_shock(sector)
        market_decline = shock.get("extra_decline", market_decline)
        label = f"Sector: {shock['label']}"
        description = shock["description"]
    else:
        label = scenario["label"]
        description = scenario["description"]

    stress_return = (beta * market_decline) + sector_adj + idiosyncratic
    # Apply floor/ceiling
    stress_return = max(-0.95, min(0.10, stress_return))

    estimated_impact_pct = round(stress_return * 100, 1)
    invested = 10000
    result_amount = round(invested * (1 + stress_return))
    loss_amount = invested - result_amount

    return {
        "id": scenario.get("id", scenario_key),
        "label": label,
        "description": description,
        "historical_analog": scenario.get("historical_analog", ""),
        "scenarioKey": scenario_key,
        "estimated_impact": estimated_impact_pct,
        "dollar_impact": {
            "invested": invested,
            "result": max(result_amount, 0),
            "loss": max(loss_amount, 0),
        },
        "recovery_estimate": scenario.get("recovery_estimate", "Unknown"),
        "risk_level": scenario.get("risk_level", "MODERATE"),
        "ticker": ticker,
        "currentPrice": round(current_price, 2),
        "stressedPrice": round(max(current_price * (1 + stress_return), 0), 2),
        "priceImpact": estimated_impact_pct,
        "factors": {
            "beta": round(beta, 2),
            "market_decline": round(market_decline * 100, 1),
            "sector_adjustment": round(sector_adj * 100, 1),
            "idiosyncratic": round(idiosyncratic * 100, 1),
        },
    }


def run_all_scenarios(ticker, price_data, tech_data, health_data, signal_data):
    """Run all 4 scenarios and return enriched results with overall risk rating."""
    results = []
    for key in ["moderate", "recession", "severe", "sector_shock"]:
        results.append(
            run_stress_test(ticker, key, price_data, tech_data,
                            health_data, signal_data)
        )

    # Compute overall risk rating from severe scenario impact
    severe = next((r for r in results if r.get("scenarioKey") == "severe"), None)
    severe_impact = abs(severe["estimated_impact"]) if severe else 30

    if severe_impact >= 60:
        overall_risk = "HIGH"
    elif severe_impact >= 35:
        overall_risk = "ELEVATED"
    else:
        overall_risk = "MODERATE"

    # VaR estimate (95% monthly) from moderate scenario
    moderate = next((r for r in results if r.get("scenarioKey") == "moderate"), None)
    var_95 = round(abs(moderate["estimated_impact"]) * 0.7, 1) if moderate else 8.0

    return {
        "scenarios": results,
        "overall_risk_rating": overall_risk,
        "var_95_monthly": var_95,
    }


def compute_historical_overlays(ticker, price_data):
    """Compute how the stock actually performed during historical crises.

    Uses yfinance to fetch historical prices for known crisis date ranges.
    Returns a list of historical event performance records.
    """
    events = []
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)

        for event in HISTORICAL_EVENTS:
            try:
                peak_date = event["peak_date"]
                trough_date = event["trough_date"]

                # Fetch data with buffer for recovery calculation
                # Start from peak, extend 2 years past trough for recovery
                trough_dt = datetime.datetime.strptime(trough_date, "%Y-%m-%d")
                recovery_end = (trough_dt + datetime.timedelta(days=730)).strftime("%Y-%m-%d")

                hist = stock.history(start=peak_date, end=recovery_end)
                if hist.empty or len(hist) < 2:
                    continue

                # Find actual peak and trough in the crisis window
                crisis_data = hist.loc[peak_date:trough_date]
                if crisis_data.empty or len(crisis_data) < 2:
                    continue

                peak_price = float(crisis_data["Close"].max())
                trough_price = float(crisis_data["Close"].min())
                peak_idx = crisis_data["Close"].idxmax()
                trough_idx = crisis_data["Close"].idxmin()

                if peak_price <= 0:
                    continue

                decline_pct = round(((trough_price - peak_price) / peak_price) * 100, 1)
                days_to_trough = (trough_idx - peak_idx).days if trough_idx > peak_idx else 0

                # Calculate recovery time (days to get back to peak price)
                recovery_days = None
                post_trough = hist.loc[trough_idx:]
                recovered = post_trough[post_trough["Close"] >= peak_price]
                if not recovered.empty:
                    recovery_date = recovered.index[0]
                    recovery_days = (recovery_date - trough_idx).days

                events.append({
                    "id": event["id"],
                    "name": event["name"],
                    "decline_pct": decline_pct,
                    "days_to_trough": max(days_to_trough, 0),
                    "recovery_days": recovery_days,
                    "recovery_months": round(recovery_days / 30) if recovery_days else None,
                    "sp500_decline": event["sp500_decline"],
                    "peak_date": peak_date,
                    "trough_date": trough_date,
                })
            except Exception as e:
                logger.warning("Failed to compute overlay for %s/%s: %s",
                               ticker, event["id"], e)
                continue

    except ImportError:
        logger.warning("yfinance not available for historical overlays")
    except Exception as e:
        logger.warning("Failed to compute historical overlays for %s: %s", ticker, e)

    return events


def build_full_stress_report(ticker, price_data, tech_data, health_data,
                             signal_data, include_historical=True):
    """Build the complete stress report with scenarios + historical overlays.

    This is the main entry point for the enhanced stress test system.
    Returns the full payload to be stored in DynamoDB STRESS#{ticker}.
    """
    # Run all 4 scenarios
    scenario_results = run_all_scenarios(
        ticker, price_data, tech_data, health_data, signal_data
    )

    # Historical overlays
    historical_events = []
    if include_historical:
        historical_events = compute_historical_overlays(ticker, price_data)

    # Compute max historical drawdown
    max_drawdown = 0.0
    max_recovery_months = 0
    for ev in historical_events:
        if ev["decline_pct"] < max_drawdown:
            max_drawdown = ev["decline_pct"]
        if ev.get("recovery_months") and ev["recovery_months"] > max_recovery_months:
            max_recovery_months = ev["recovery_months"]

    report = {
        "ticker": ticker,
        "scenarios": scenario_results["scenarios"],
        "overall_risk_rating": scenario_results["overall_risk_rating"],
        "var_95_monthly": scenario_results["var_95_monthly"],
        "max_drawdown_historical": max_drawdown if historical_events else None,
        "recovery_time_months": max_recovery_months if historical_events else None,
        "historical_events": historical_events,
        "generatedAt": datetime.datetime.utcnow().isoformat() + "Z",
        "disclaimer": "Estimates based on historical patterns and factor analysis. Not predictions.",
    }

    return report


def store_stress_report(db_module, ticker, report):
    """Store stress report in DynamoDB under STRESS#{ticker} / LATEST."""
    item = {
        "PK": f"STRESS#{ticker}",
        "SK": "LATEST",
        **_convert_floats(report),
    }
    db_module.put_item(item)


# ── Internal helpers ─────────────────────────────────────────────────────────


def _estimate_beta(tech_data):
    """Estimate beta from ATR. Higher ATR/price ratio -> higher beta."""
    if not tech_data:
        return 1.0
    indicators = tech_data.get("indicators") or {}
    atr = float(indicators.get("atr") or 0)
    if atr > 0:
        return max(0.5, min(2.5, atr / 1.5))
    return 1.0


def _sector_adjustment(sector, scenario_key):
    """Sector-based adjustment to stress return.

    Cyclical sectors get additional downside; defensive sectors get cushion.
    """
    sector = (sector or "").lower()

    # Sensitivity map: how much extra impact each sector gets
    cyclical_sectors = {
        "technology": -0.05,
        "semiconductors": -0.07,
        "consumer discretionary": -0.04,
        "consumer cyclical": -0.04,
        "financial services": -0.05,
        "real estate": -0.06,
    }
    defensive_sectors = {
        "utilities": 0.03,
        "health care": 0.02,
        "healthcare": 0.02,
        "consumer staples": 0.03,
        "consumer defensive": 0.03,
    }

    for name, adj in cyclical_sectors.items():
        if name in sector:
            # Scale adjustment by scenario severity
            severity = {"moderate": 0.5, "recession": 1.0, "severe": 1.5,
                        "sector_shock": 1.2}.get(scenario_key, 1.0)
            return adj * severity

    for name, adj in defensive_sectors.items():
        if name in sector:
            severity = {"moderate": 0.5, "recession": 1.0, "severe": 1.5,
                        "sector_shock": 0.3}.get(scenario_key, 1.0)
            return adj * severity

    return 0.0


def _idiosyncratic_factor(health_data):
    """Company-specific factor based on financial health.

    - debt_to_equity > 2x amplifies downside by 1.2x (returns -0.05 extra)
    - Strong cash position provides cushion (returns +0.03)
    """
    if not health_data:
        return 0.0

    analysis = health_data.get("analysis") or {}
    adjustment = 0.0

    # Leverage amplifier
    debt_to_equity = float(analysis.get("debtToEquity") or 0)
    if debt_to_equity > 2.0:
        adjustment -= 0.05 * min(debt_to_equity / 2.0, 2.0)  # up to -10%

    # Cash cushion
    # If company has strong cash, it provides a buffer
    grade = analysis.get("grade", "C")
    if grade in ("A+", "A", "A-"):
        adjustment += 0.03
    elif grade in ("B+", "B"):
        adjustment += 0.01
    elif grade in ("D", "D-", "F"):
        adjustment -= 0.03

    return adjustment


def _get_sector_shock(sector):
    """Get sector-specific shock parameters, or default to moderate."""
    sector = (sector or "").lower()
    for key, shock in SECTOR_SHOCKS.items():
        if key in sector:
            return shock
    # Default: use moderate correction-like parameters
    return {
        "label": "Market Pullback",
        "description": "Broad market correction affecting this sector",
        "extra_decline": -0.15,
    }


def _convert_floats(obj):
    """Recursively convert float to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(round(obj, 6)))
    elif isinstance(obj, dict):
        return {k: _convert_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_floats(i) for i in obj]
    return obj

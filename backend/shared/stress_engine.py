"""Macro Stress Test Engine — Fed-inspired scenario analysis for individual stocks.

Inspired by the Federal Reserve's annual Dodd-Frank Act Stress Test (DFAST),
this engine tests how individual stocks would perform under hypothetical
macroeconomic stress scenarios ranging from baseline to severely adverse.
"""

# ── Scenario Templates ──────────────────────────────────────────────────────

SCENARIOS = {
    "baseline": {
        "name": "Baseline",
        "description": (
            "Moderate growth continues. Economy grows at 2%, "
            "unemployment stable at 4.5%."
        ),
        "equity_shock": -0.05,
        "rate_change": -0.005,
        "spread_widening": 0.005,
        "gdp_growth": 0.02,
        "unemployment_delta": 0.002,
        "inflation": 0.022,
        "vix_level": 25,
    },
    "adverse": {
        "name": "Adverse",
        "description": (
            "Moderate recession. Unemployment rises to 7%, equities fall 25%."
        ),
        "equity_shock": -0.25,
        "rate_change": -0.02,
        "spread_widening": 0.025,
        "gdp_growth": -0.02,
        "unemployment_delta": 0.025,
        "inflation": 0.015,
        "vix_level": 45,
    },
    "severely_adverse": {
        "name": "Severely Adverse (Fed 2026)",
        "description": (
            "Severe global recession per Fed 2026 stress test. "
            "Unemployment hits 10%, equities fall 54%, real estate collapses."
        ),
        "equity_shock": -0.54,
        "rate_change": -0.039,
        "spread_widening": 0.044,
        "gdp_growth": -0.048,
        "unemployment_delta": 0.055,
        "inflation": 0.011,
        "vix_level": 72,
        "house_price_decline": -0.29,
        "cre_decline": -0.40,
    },
}


# ── Public API ───────────────────────────────────────────────────────────────


def run_stress_test(ticker, scenario_key, price_data, tech_data, health_data,
                    signal_data):
    """Run a single macro stress-test scenario against *ticker*.

    Parameters
    ----------
    ticker : str
    scenario_key : str  – one of ``SCENARIOS`` keys
    price_data : dict   – from ``PRICE#{ticker} / LATEST``
    tech_data : dict    – from ``TECHNICALS#{ticker} / LATEST``  (may be None)
    health_data : dict  – from ``HEALTH#{ticker} / LATEST``      (may be None)
    signal_data : dict  – from ``SIGNAL#{ticker} / LATEST``      (may be None)

    Returns
    -------
    dict  – stress-test result payload
    """
    scenario = SCENARIOS.get(scenario_key)
    if scenario is None:
        return {"error": f"Unknown scenario: {scenario_key}",
                "validScenarios": list(SCENARIOS.keys())}

    current_price = float(price_data.get("price", 0))
    sector = price_data.get("sector", "")

    # 1. Direct equity impact (beta-adjusted)
    beta = _estimate_beta(tech_data)
    equity_impact = scenario["equity_shock"] * beta

    # 2. Sector sensitivity multiplier
    sector_mult = _sector_sensitivity(sector)

    # 3. Financial-health resilience
    health_mult = _health_resilience(health_data)

    # 4. Interest-rate sensitivity
    rate_impact = _rate_sensitivity(health_data, scenario["rate_change"])

    # 5. Credit-spread sensitivity
    spread_impact = _spread_sensitivity(health_data, scenario["spread_widening"])

    # Combined impact
    total_impact = (equity_impact * sector_mult * health_mult
                    + rate_impact + spread_impact)
    stressed_price = current_price * (1 + total_impact)

    # Resilience score (1-10)
    resilience = _compute_resilience(total_impact, health_data)

    return {
        "ticker": ticker,
        "scenario": scenario["name"],
        "scenarioKey": scenario_key,
        "scenarioDescription": scenario["description"],
        "currentPrice": round(current_price, 2),
        "stressedPrice": round(max(stressed_price, 0), 2),
        "priceImpact": round(total_impact * 100, 1),
        "resilienceScore": round(resilience, 1),
        "breakdown": {
            "equityImpact": round(equity_impact * 100, 1),
            "sectorMultiplier": round(sector_mult, 2),
            "healthMultiplier": round(health_mult, 2),
            "rateImpact": round(rate_impact * 100, 1),
            "spreadImpact": round(spread_impact * 100, 1),
        },
        "recommendation": _stress_recommendation(resilience, scenario_key),
    }


def run_all_scenarios(ticker, price_data, tech_data, health_data, signal_data):
    """Run every scenario and return a list of results."""
    results = []
    for key in SCENARIOS:
        results.append(
            run_stress_test(ticker, key, price_data, tech_data,
                            health_data, signal_data)
        )
    return results


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


def _sector_sensitivity(sector):
    """Cyclical sectors amplify downside; defensive sectors dampen it."""
    cyclical = {
        "technology", "semiconductors", "consumer discretionary",
        "financial services", "real estate", "construction", "automotive",
    }
    defensive = {
        "utilities", "health care", "healthcare", "consumer staples",
        "beverages", "pharmaceuticals", "food products",
    }
    sector_lower = (sector or "").lower()
    for c in cyclical:
        if c in sector_lower:
            return 1.3
    for d in defensive:
        if d in sector_lower:
            return 0.7
    return 1.0


def _health_resilience(health_data):
    """Map financial-health grade to a multiplier (0.7 = strong, 1.3 = weak)."""
    if not health_data:
        return 1.0
    analysis = health_data.get("analysis") or {}
    grade = analysis.get("grade", "C")
    grade_map = {
        "A+": 0.70, "A": 0.75, "A-": 0.80,
        "B+": 0.85, "B": 0.90, "B-": 0.95,
        "C+": 1.00, "C": 1.05, "C-": 1.10,
        "D+": 1.15, "D": 1.20, "D-": 1.25,
        "F": 1.30,
    }
    return grade_map.get(grade, 1.0)


def _rate_sensitivity(health_data, rate_change):
    """Growth stocks (high P/E) are more rate-sensitive."""
    if not health_data:
        return 0.0
    analysis = health_data.get("analysis") or {}
    pe = float(analysis.get("peRatio") or analysis.get("pe") or 0)
    if pe <= 0:
        return 0.0
    # Higher P/E -> more duration-like sensitivity
    # Rough model: a 100bp rate cut benefits a 30 P/E stock ~3%
    sensitivity = min(pe / 30.0, 2.0)
    return rate_change * sensitivity * -1  # rate cut is positive for growth


def _spread_sensitivity(health_data, spread_widening):
    """Highly leveraged companies are punished more by spread widening."""
    if not health_data:
        return 0.0
    analysis = health_data.get("analysis") or {}
    debt_to_equity = float(analysis.get("debtToEquity") or 0)
    if debt_to_equity <= 0:
        return 0.0
    # High leverage -> spread widening hurts more
    leverage_factor = min(debt_to_equity / 1.5, 2.0)
    return -spread_widening * leverage_factor


def _compute_resilience(total_impact, health_data):
    """Compute a 1-10 resilience score. Higher = more resilient."""
    # Start from the impact magnitude — less impact is better
    # total_impact is negative (e.g. -0.30 = -30%)
    # Map range: 0% impact -> 10, -80% impact -> 1
    impact_score = max(1.0, min(10.0, 10.0 + total_impact * 12.5))

    # Boost from financial health
    health_bonus = 0.0
    if health_data:
        analysis = health_data.get("analysis") or {}
        grade = analysis.get("grade", "C")
        grade_bonus = {
            "A+": 1.0, "A": 0.8, "A-": 0.6,
            "B+": 0.4, "B": 0.2, "B-": 0.1,
            "C+": 0.0, "C": -0.1, "C-": -0.2,
            "D+": -0.4, "D": -0.6, "D-": -0.8,
            "F": -1.0,
        }
        health_bonus = grade_bonus.get(grade, 0.0)

    return max(1.0, min(10.0, impact_score + health_bonus))


def _stress_recommendation(resilience, scenario_key):
    """Generate a plain-English recommendation."""
    if scenario_key == "baseline":
        if resilience >= 7:
            return "STRONG BUY - Well positioned for continued growth"
        if resilience >= 5:
            return "HOLD - Adequate for baseline conditions"
        return "CAUTION - Vulnerable even in mild conditions"
    elif scenario_key == "adverse":
        if resilience >= 7:
            return "RESILIENT - Can weather moderate recession"
        if resilience >= 5:
            return "MONITOR - Some vulnerability in downturn"
        return "REDUCE - Significant downside risk in recession"
    else:  # severely_adverse
        if resilience >= 7:
            return "FORTRESS - Exceptional crisis resilience"
        if resilience >= 5:
            return "SURVIVOR - Can endure severe stress with losses"
        return "AT RISK - Critical vulnerability in severe recession"

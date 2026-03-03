"""Enhanced Factor Engine — 25 sub-factors across 5 dimensions.

Dimensions (weights):
  SUPPLY CHAIN (20%) - 6 sub-factors
  MACRO & GEOPOLITICAL (15%) - 5 sub-factors
  TECHNICAL (25%) - 5 sub-factors
  FUNDAMENTAL (25%) - 5 sub-factors
  SENTIMENT & MOMENTUM (15%) - 4 sub-factors

Each sub-factor produces a normalized score from -2.0 to +2.0.
Dimension scores are mapped to 0-10 scale for radar chart display.

Pure Python — no numpy/pandas.
"""

import json
import logging
import math
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


# ─── Dimension Definitions ───

DIMENSIONS = {
    "supplyChain": {
        "name": "Supply Chain",
        "weight": 0.20,
        "factors": [
            {"id": "SC1", "name": "Supplier Concentration Risk", "weight": 0.18},
            {"id": "SC2", "name": "Customer Concentration Risk", "weight": 0.18},
            {"id": "SC3", "name": "Supplier Financial Health", "weight": 0.16},
            {"id": "SC4", "name": "Customer Spending Trends", "weight": 0.16},
            {"id": "SC5", "name": "Geographic Supply Risk", "weight": 0.16},
            {"id": "SC6", "name": "Lead Time / Disruption", "weight": 0.16},
        ],
    },
    "macroGeo": {
        "name": "Macro & Geopolitical",
        "weight": 0.15,
        "factors": [
            {"id": "MG1", "name": "Fed Rate Sensitivity", "weight": 0.22},
            {"id": "MG2", "name": "CPI Impact Direction", "weight": 0.20},
            {"id": "MG3", "name": "Trade Barrier Exposure", "weight": 0.20},
            {"id": "MG4", "name": "Geographic Conflict Risk", "weight": 0.20},
            {"id": "MG5", "name": "Regulatory Risk", "weight": 0.18},
        ],
    },
    "technical": {
        "name": "Technical",
        "weight": 0.25,
        "factors": [
            {"id": "TE1", "name": "Trend Score", "weight": 0.25},
            {"id": "TE2", "name": "Momentum Score", "weight": 0.25},
            {"id": "TE3", "name": "Volume Confirmation", "weight": 0.15},
            {"id": "TE4", "name": "Volatility Regime", "weight": 0.15},
            {"id": "TE5", "name": "MACD / Pattern Signals", "weight": 0.20},
        ],
    },
    "fundamental": {
        "name": "Fundamental",
        "weight": 0.25,
        "factors": [
            {"id": "FD1", "name": "Valuation (DCF + P/E)", "weight": 0.25},
            {"id": "FD2", "name": "Profitability (ROE + Margins)", "weight": 0.20},
            {"id": "FD3", "name": "Financial Health (Z + F Score)", "weight": 0.20},
            {"id": "FD4", "name": "Earnings Quality (M-Score)", "weight": 0.15},
            {"id": "FD5", "name": "Growth (Revenue + EPS)", "weight": 0.20},
        ],
    },
    "sentiment": {
        "name": "Sentiment & Momentum",
        "weight": 0.15,
        "factors": [
            {"id": "SE1", "name": "Earnings Surprise", "weight": 0.30},
            {"id": "SE2", "name": "Guidance Revision", "weight": 0.25},
            {"id": "SE3", "name": "Analyst Consensus Change", "weight": 0.25},
            {"id": "SE4", "name": "Sector Sympathy", "weight": 0.20},
        ],
    },
    "altData": {
        "name": "Alternative Data",
        "weight": 0.10,
        "factors": [
            {"id": "AD1", "name": "Patent Innovation", "weight": 0.34},
            {"id": "AD2", "name": "Gov Contract Pipeline", "weight": 0.33},
            {"id": "AD3", "name": "FDA Catalyst Strength", "weight": 0.33},
        ],
    },
}

# Weights when alt data IS available (6 dimensions)
WEIGHTS_WITH_ALT = {
    "supplyChain": 0.18,
    "macroGeo": 0.13,
    "technical": 0.23,
    "fundamental": 0.23,
    "sentiment": 0.13,
    "altData": 0.10,
}

# Weights when alt data is NOT available (5 dimensions, original)
WEIGHTS_WITHOUT_ALT = {
    "supplyChain": 0.20,
    "macroGeo": 0.15,
    "technical": 0.25,
    "fundamental": 0.25,
    "sentiment": 0.15,
}


def _clamp(val, lo=-2.0, hi=2.0):
    """Clamp value to range."""
    if val is None:
        return 0.0
    return max(lo, min(hi, float(val)))


def _safe_div(a, b):
    if a is None or b is None or b == 0:
        return None
    return a / b


# ─── Technical Factor Scoring ───


def _score_technical_factors(technicals):
    """Score 5 technical sub-factors from technical_engine output.

    Input: technicals dict with rsi, macd, sma20/50/200, adx, atr, obv,
           bollingerBands, stochastic, williamsR, technicalScore, signals.
    """
    results = []

    if not technicals or technicals.get("error") or technicals.get("indicatorCount", 0) == 0:
        return _default_scores("technical")

    # TE1: Trend Score — SMA alignment + ADX
    sma20 = technicals.get("sma20")
    sma50 = technicals.get("sma50")
    sma200 = technicals.get("sma200")
    adx = technicals.get("adx")
    trend_signal = (technicals.get("signals") or {}).get("trend", "")

    trend_score = 0.0
    if sma20 and sma50 and sma200:
        # Perfect bull alignment: price > SMA20 > SMA50 > SMA200
        if sma20 > sma50 > sma200:
            trend_score = 1.5
        elif sma20 > sma50:
            trend_score = 0.7
        elif sma20 < sma50 < sma200:
            trend_score = -1.5
        elif sma20 < sma50:
            trend_score = -0.7
    if adx and adx > 25:
        trend_score *= 1.2  # strong trend amplifies
    trend_score = _clamp(trend_score)

    explanation = "bullish" if trend_score > 0.5 else "bearish" if trend_score < -0.5 else "neutral"
    results.append({
        "factorId": "TE1", "rawValue": trend_score,
        "normalizedScore": round(trend_score, 2),
        "direction": "positive" if trend_score > 0.3 else "negative" if trend_score < -0.3 else "neutral",
        "dataSource": "Technical Indicators",
        "explanation": f"SMA alignment is {explanation}" + (f", ADX={round(adx, 1)} confirms trend" if adx else ""),
    })

    # TE2: Momentum — RSI + Stochastic (continuous linear scale)
    rsi = technicals.get("rsi")
    stochK = (technicals.get("stochastic") or {}).get("k")
    mom_score = 0.0
    if rsi is not None:
        # Continuous scale: RSI 30→+1.5, RSI 50→0, RSI 70→-1.5
        # Oversold = bullish opportunity, overbought = caution
        clamped_rsi = max(30, min(70, rsi))
        mom_score = 1.5 - ((clamped_rsi - 30) / 40) * 3.0
        # Extremes beyond 30/70 cap at ±1.5
        if rsi < 30:
            mom_score = 1.5
        elif rsi > 70:
            mom_score = -1.5
    if stochK is not None:
        if stochK < 20:
            mom_score += 0.3
        elif stochK > 80:
            mom_score -= 0.3
    mom_score = _clamp(mom_score)
    results.append({
        "factorId": "TE2", "rawValue": mom_score,
        "normalizedScore": round(mom_score, 2),
        "direction": "positive" if mom_score > 0.3 else "negative" if mom_score < -0.3 else "neutral",
        "dataSource": "RSI + Stochastic",
        "explanation": f"RSI={round(rsi, 1) if rsi else 'N/A'}" + (f", Stoch K={round(stochK, 1)}" if stochK else ""),
    })

    # TE3: Volume Confirmation — OBV direction vs price trend
    obv = technicals.get("obv")
    vol_score = 0.0
    if obv is not None and obv != 0:
        is_bullish = "bullish" in trend_signal.lower() if trend_signal else False
        is_bearish = "bearish" in trend_signal.lower() if trend_signal else False
        if obv > 0 and is_bullish:
            vol_score = 1.2   # volume confirms bullish trend
        elif obv < 0 and is_bearish:
            vol_score = -1.2  # volume confirms bearish trend
        elif obv > 0 and is_bearish:
            vol_score = 0.5   # divergence: accumulation despite bearish price
        elif obv < 0 and is_bullish:
            vol_score = -0.5  # divergence: distribution despite bullish price
        elif obv > 0:
            vol_score = 0.4   # net accumulation, no clear trend
        else:
            vol_score = -0.4  # net distribution, no clear trend
    vol_score = _clamp(vol_score)
    vol_label = "confirms" if (vol_score > 0 and "bullish" in (trend_signal or "")) or (vol_score < 0 and "bearish" in (trend_signal or "")) else "diverges from" if vol_score != 0 else "neutral to"
    results.append({
        "factorId": "TE3", "rawValue": vol_score,
        "normalizedScore": round(vol_score, 2),
        "direction": "positive" if vol_score > 0.3 else "negative" if vol_score < -0.3 else "neutral",
        "dataSource": "OBV",
        "explanation": f"OBV {'positive' if (obv or 0) > 0 else 'negative'}, volume {vol_label} price trend",
    })

    # TE4: Volatility Regime — Bollinger + ATR
    bb = technicals.get("bollingerBands") or {}
    atr = technicals.get("atr")
    vol_regime_score = 0.0
    bb_upper = bb.get("upper")
    bb_lower = bb.get("lower")
    bb_middle = bb.get("middle")
    vol_text = (technicals.get("signals") or {}).get("volatility", "")
    if bb_upper and bb_lower and bb_middle and bb_middle > 0:
        bb_width = (bb_upper - bb_lower) / bb_middle
        if bb_width < 0.04:
            vol_regime_score = 0.8   # tight squeeze = potential breakout
        elif bb_width < 0.08:
            vol_regime_score = 0.4   # low vol = favorable
        elif bb_width < 0.15:
            vol_regime_score = 0.0   # moderate vol = neutral
        elif bb_width < 0.25:
            vol_regime_score = -0.5  # elevated vol = caution
        else:
            vol_regime_score = -1.0  # extreme vol = risk
    # ATR as percentage of price adds confirmation
    if atr is not None and bb_middle and bb_middle > 0:
        atr_pct = atr / bb_middle
        if atr_pct < 0.01:
            vol_regime_score += 0.3   # very low daily range
        elif atr_pct > 0.04:
            vol_regime_score -= 0.3   # high daily range
    vol_regime_score = _clamp(vol_regime_score)
    results.append({
        "factorId": "TE4", "rawValue": vol_regime_score,
        "normalizedScore": round(vol_regime_score, 2),
        "direction": "positive" if vol_regime_score > 0.3 else "negative" if vol_regime_score < -0.3 else "neutral",
        "dataSource": "Bollinger Bands + ATR",
        "explanation": f"Volatility is {vol_text or 'moderate'}" + (f", ATR={round(atr, 2)}" if atr else ""),
    })

    # TE5: MACD / Pattern Signals
    macd = technicals.get("macd") or {}
    macd_val = macd.get("value")
    macd_sig = macd.get("signal")
    macd_hist = macd.get("histogram")
    pattern_score = 0.0
    if macd_val is not None and macd_sig is not None:
        if macd_val > macd_sig:
            pattern_score = 1.0
        else:
            pattern_score = -1.0
        if macd_hist is not None:
            if macd_hist > 0 and pattern_score > 0:
                pattern_score = min(2.0, pattern_score + 0.5)
            elif macd_hist < 0 and pattern_score < 0:
                pattern_score = max(-2.0, pattern_score - 0.5)
    pattern_score = _clamp(pattern_score)
    results.append({
        "factorId": "TE5", "rawValue": pattern_score,
        "normalizedScore": round(pattern_score, 2),
        "direction": "positive" if pattern_score > 0.3 else "negative" if pattern_score < -0.3 else "neutral",
        "dataSource": "MACD",
        "explanation": f"MACD {'bullish crossover' if pattern_score > 0 else 'bearish crossover' if pattern_score < 0 else 'neutral'}",
    })

    return results


# ─── Fundamental Factor Scoring ───


def _score_fundamental_factors(fundamentals):
    """Score 5 fundamental sub-factors from fundamentals_engine output.

    Handles both full SEC EDGAR data and partial Finnhub fallback data
    (where zScore/fScore/mScore may be None but ratios and grade exist).
    """
    results = []

    if not fundamentals or fundamentals.get("error"):
        return _default_scores("fundamental")

    z_score = fundamentals.get("zScore") or {}
    f_score = fundamentals.get("fScore") or {}
    m_score = fundamentals.get("mScore") or {}
    dcf = fundamentals.get("dcf") or {}
    ratios = fundamentals.get("ratios") or {}

    # If we have no ratios AND no z_score, there's truly nothing to score
    if not ratios and not z_score:
        return _default_scores("fundamental")

    # FD1: Valuation — DCF upside + P/E relative
    val_score = 0.0
    upside = dcf.get("upside") if dcf else None
    pe = ratios.get("peRatio") or ratios.get("forwardPE")
    val_explanation = "Valuation data unavailable"
    if upside is not None:
        if upside > 30:
            val_score = 2.0
        elif upside > 15:
            val_score = 1.2
        elif upside > 0:
            val_score = 0.5
        elif upside > -15:
            val_score = -0.5
        elif upside > -30:
            val_score = -1.2
        else:
            val_score = -2.0
        val_explanation = f"DCF upside {round(upside, 1)}%"
    elif pe is not None:
        # Fallback: score based on P/E ratio when DCF is unavailable
        if pe < 0:
            val_score = -1.5  # negative earnings
        elif pe < 12:
            val_score = 1.5   # deeply undervalued
        elif pe < 18:
            val_score = 0.8   # reasonably valued
        elif pe < 25:
            val_score = 0.0   # fair value
        elif pe < 40:
            val_score = -0.7  # richly valued
        else:
            val_score = -1.5  # very expensive
        val_explanation = f"P/E={round(pe, 1)} ({'cheap' if val_score > 0 else 'expensive' if val_score < 0 else 'fair'})"
    val_score = _clamp(val_score)
    results.append({
        "factorId": "FD1", "rawValue": val_score,
        "normalizedScore": round(val_score, 2),
        "direction": "positive" if val_score > 0.3 else "negative" if val_score < -0.3 else "neutral",
        "dataSource": "DCF Model + P/E" if upside is not None else "Finnhub P/E",
        "explanation": val_explanation,
    })

    # FD2: Profitability — ROE + Margins
    roe = ratios.get("roe")
    npm = ratios.get("netProfitMargin")
    prof_score = 0.0
    if roe is not None:
        if roe > 25:
            prof_score += 1.0
        elif roe > 15:
            prof_score += 0.5
        elif roe > 0:
            prof_score += 0.0
        else:
            prof_score -= 1.0
    if npm is not None:
        if npm > 20:
            prof_score += 0.5
        elif npm > 10:
            prof_score += 0.2
        elif npm < 0:
            prof_score -= 0.5
    prof_score = _clamp(prof_score)
    results.append({
        "factorId": "FD2", "rawValue": prof_score,
        "normalizedScore": round(prof_score, 2),
        "direction": "positive" if prof_score > 0.3 else "negative" if prof_score < -0.3 else "neutral",
        "dataSource": "SEC EDGAR",
        "explanation": f"ROE={round(roe, 1)}%" if roe is not None else "Profitability data unavailable",
    })

    # FD3: Financial Health — Z-Score + F-Score
    z_val = z_score.get("value")
    f_val = f_score.get("value")
    health_score = 0.0
    if z_val is not None:
        if z_val > 2.99:
            health_score += 1.0
        elif z_val > 1.81:
            health_score += 0.0
        else:
            health_score -= 1.5
    if f_val is not None:
        if f_val >= 8:
            health_score += 1.0
        elif f_val >= 5:
            health_score += 0.3
        else:
            health_score -= 0.5
    health_score = _clamp(health_score)
    results.append({
        "factorId": "FD3", "rawValue": health_score,
        "normalizedScore": round(health_score, 2),
        "direction": "positive" if health_score > 0.3 else "negative" if health_score < -0.3 else "neutral",
        "dataSource": "Altman Z + Piotroski F",
        "explanation": f"Z-Score={round(z_val, 2) if z_val else 'N/A'}, F-Score={f_val}/9" if f_val else "Health data unavailable",
    })

    # FD4: Earnings Quality — M-Score (neutral when unavailable)
    m_val = m_score.get("value") if m_score else None
    m_interp = m_score.get("interpretation", "") if m_score else ""
    eq_score = 0.0
    if m_val is not None:
        if m_val < -3.0:
            eq_score = 1.5
        elif m_val < -2.22:
            eq_score = 0.5
        else:
            eq_score = -1.5  # manipulation flag
    eq_score = _clamp(eq_score)
    eq_explanation = "M-Score data not available (Finnhub fallback)" if m_val is None else f"M-Score={round(m_val, 2)}, {'clean' if 'unlikely' in m_interp else 'red flag'}"
    results.append({
        "factorId": "FD4", "rawValue": eq_score,
        "normalizedScore": round(eq_score, 2),
        "direction": "positive" if eq_score > 0.3 else "negative" if eq_score < -0.3 else "neutral",
        "dataSource": "Beneish M-Score" if m_val is not None else "N/A",
        "explanation": eq_explanation,
    })

    # FD5: Growth — Revenue trend
    growth_score = 0.0
    grade = fundamentals.get("grade", "")
    grade_num = fundamentals.get("gradeScore", 50)
    if grade_num > 75:
        growth_score = 1.0
    elif grade_num > 60:
        growth_score = 0.3
    elif grade_num > 45:
        growth_score = -0.3
    else:
        growth_score = -1.0
    growth_score = _clamp(growth_score)
    results.append({
        "factorId": "FD5", "rawValue": growth_score,
        "normalizedScore": round(growth_score, 2),
        "direction": "positive" if growth_score > 0.3 else "negative" if growth_score < -0.3 else "neutral",
        "dataSource": "SEC EDGAR",
        "explanation": f"Overall fundamental grade: {grade} ({round(grade_num)}/100)",
    })

    return results


# ─── Supply Chain Factor Scoring (from existing signal data) ───


def _score_supply_chain_factors(signal_data):
    """Score 6 supply chain sub-factors from existing signal factor details."""
    factor_details = signal_data.get("factorDetails", {}) if signal_data else {}

    # Map old factor IDs to new sub-factors
    mappings = [
        ("SC1", "A1", "Supplier Concentration Risk"),
        ("SC2", "B1", "Customer Concentration Risk"),
        ("SC3", "A2", "Supplier Financial Health"),
        ("SC4", "B2", "Customer Spending Trends"),
        ("SC5", "C3", "Geographic Supply Risk"),
        ("SC6", "A3", "Lead Time / Disruption"),
    ]

    results = []
    for new_id, old_id, name in mappings:
        old_factor = factor_details.get(old_id, {})
        score = _clamp(old_factor.get("score", 0))
        reason = old_factor.get("reason", "No data available")
        results.append({
            "factorId": new_id, "rawValue": score,
            "normalizedScore": round(score, 2),
            "direction": "positive" if score > 0.3 else "negative" if score < -0.3 else "neutral",
            "dataSource": "Claude AI Analysis",
            "explanation": reason[:120] if reason else "No data available",
        })
    return results


# ─── Macro & Geopolitical Factor Scoring ───


def _score_macro_factors(signal_data, ticker=None, macro_snapshot=None, monetary_score=None,
                         rate_sensitivity=None, geo_score=None):
    """Score 5 macro/geopolitical sub-factors.

    Uses real FRED data and GPR index when available, falls back to
    existing signal factor details when macro data modules are unavailable.

    Args:
        signal_data: Full signal from S3/DynamoDB (with factorDetails).
        ticker: Stock ticker symbol (for rate sensitivity).
        macro_snapshot: Output from fred_data.get_macro_snapshot().
        monetary_score: Output from fred_data.compute_monetary_score().
        rate_sensitivity: Output from fred_data.compute_stock_rate_sensitivity().
        geo_score: Output from geopolitical_data.compute_geopolitical_score().
    """
    results = []

    # MG1: Fed Rate Sensitivity
    mg1_score = 0.0
    mg1_explanation = "No data available"
    mg1_source = "N/A"

    if monetary_score and monetary_score.get("components"):
        # Use the fed_policy component from monetary score
        fed_comp = next((c for c in monetary_score["components"] if c["factor"] == "fed_policy"), None)
        if fed_comp:
            mg1_score = _clamp(fed_comp["score"])
            mg1_explanation = fed_comp["rationale"][:120]
            mg1_source = fed_comp.get("source", "FRED DFF series")

        # Adjust for stock-specific rate sensitivity
        if rate_sensitivity:
            sens = rate_sensitivity.get("sensitivity", "MODERATE")
            direction = rate_sensitivity.get("direction", "neutral")
            if sens == "HIGH" and direction == "negative":
                # High-growth stocks are more impacted by rate changes
                mg1_score *= 1.3
                mg1_explanation += f" ({ticker}: HIGH negative rate sensitivity)"
            elif sens == "HIGH" and direction == "positive":
                # Financials benefit from higher rates
                mg1_score *= -0.8  # Reverse the sign partially
                mg1_explanation += f" ({ticker}: financials benefit from higher rates)"
            mg1_score = _clamp(mg1_score)
    else:
        # Fallback to signal_data
        factor_details = signal_data.get("factorDetails", {}) if signal_data else {}
        old = factor_details.get("D1", {})
        mg1_score = _clamp(old.get("score", 0))
        mg1_explanation = old.get("reason", "No data available")[:120]
        mg1_source = "Claude AI + FRED"

    results.append({
        "factorId": "MG1", "rawValue": mg1_score,
        "normalizedScore": round(mg1_score, 2),
        "direction": "positive" if mg1_score > 0.3 else "negative" if mg1_score < -0.3 else "neutral",
        "dataSource": mg1_source,
        "explanation": mg1_explanation,
    })

    # MG2: CPI Impact Direction
    mg2_score = 0.0
    mg2_explanation = "No data available"
    mg2_source = "N/A"

    if monetary_score and monetary_score.get("components"):
        cpi_comp = next((c for c in monetary_score["components"] if c["factor"] == "inflation"), None)
        if cpi_comp:
            mg2_score = _clamp(cpi_comp["score"])
            mg2_explanation = cpi_comp["rationale"][:120]
            mg2_source = cpi_comp.get("source", "FRED CPIAUCSL series")
    else:
        factor_details = signal_data.get("factorDetails", {}) if signal_data else {}
        old = factor_details.get("D2", {})
        mg2_score = _clamp(old.get("score", 0))
        mg2_explanation = old.get("reason", "No data available")[:120]
        mg2_source = "Claude AI + FRED"

    results.append({
        "factorId": "MG2", "rawValue": mg2_score,
        "normalizedScore": round(mg2_score, 2),
        "direction": "positive" if mg2_score > 0.3 else "negative" if mg2_score < -0.3 else "neutral",
        "dataSource": mg2_source,
        "explanation": mg2_explanation,
    })

    # MG3: Trade Barrier Exposure (from geopolitical score)
    mg3_score = 0.0
    mg3_explanation = "No data available"
    mg3_source = "N/A"

    if geo_score and geo_score.get("components"):
        trade_comp = next((c for c in geo_score["components"] if c["factor"] == "trade_restrictions"), None)
        if trade_comp:
            mg3_score = _clamp(trade_comp["score"])
            mg3_explanation = trade_comp["rationale"][:120]
            mg3_source = trade_comp.get("source", "Trade restriction analysis")
    else:
        factor_details = signal_data.get("factorDetails", {}) if signal_data else {}
        old = factor_details.get("C2", {})
        mg3_score = _clamp(old.get("score", 0))
        mg3_explanation = old.get("reason", "No data available")[:120]
        mg3_source = "Claude AI"

    results.append({
        "factorId": "MG3", "rawValue": mg3_score,
        "normalizedScore": round(mg3_score, 2),
        "direction": "positive" if mg3_score > 0.3 else "negative" if mg3_score < -0.3 else "neutral",
        "dataSource": mg3_source,
        "explanation": mg3_explanation,
    })

    # MG4: Geographic Conflict Risk (from geopolitical score)
    mg4_score = 0.0
    mg4_explanation = "No data available"
    mg4_source = "N/A"

    if geo_score and geo_score.get("components"):
        # Combine revenue_geography + supply_chain_geography + global_gpr
        rev_comp = next((c for c in geo_score["components"] if c["factor"] == "revenue_geography"), None)
        sc_comp = next((c for c in geo_score["components"] if c["factor"] == "supply_chain_geography"), None)
        gpr_comp = next((c for c in geo_score["components"] if c["factor"] == "global_gpr"), None)

        # Weighted combination for geographic conflict risk
        if rev_comp:
            mg4_score += rev_comp["score"] * 0.4
        if sc_comp:
            mg4_score += sc_comp["score"] * 0.3
        if gpr_comp:
            mg4_score += gpr_comp["score"] * 0.3

        mg4_score = _clamp(mg4_score)
        parts = []
        if rev_comp:
            parts.append(rev_comp["rationale"][:60])
        if gpr_comp:
            parts.append(gpr_comp["rationale"][:60])
        mg4_explanation = "; ".join(parts)[:120] if parts else "Geopolitical risk assessed"
        mg4_source = "GPR Index + SEC EDGAR"
    else:
        factor_details = signal_data.get("factorDetails", {}) if signal_data else {}
        old = factor_details.get("C1", {})
        mg4_score = _clamp(old.get("score", 0))
        mg4_explanation = old.get("reason", "No data available")[:120]
        mg4_source = "Claude AI"

    results.append({
        "factorId": "MG4", "rawValue": mg4_score,
        "normalizedScore": round(mg4_score, 2),
        "direction": "positive" if mg4_score > 0.3 else "negative" if mg4_score < -0.3 else "neutral",
        "dataSource": mg4_source,
        "explanation": mg4_explanation,
    })

    # MG5: Regulatory Risk (from monetary yield curve + credit spreads)
    mg5_score = 0.0
    mg5_explanation = "No data available"
    mg5_source = "N/A"

    if monetary_score and monetary_score.get("components"):
        # Use yield curve and credit spread components as proxy for regulatory/macro environment
        yc_comp = next((c for c in monetary_score["components"] if c["factor"] == "yield_curve"), None)
        cs_comp = next((c for c in monetary_score["components"] if c["factor"] == "credit_spreads"), None)
        if yc_comp and cs_comp:
            mg5_score = _clamp((yc_comp["score"] + cs_comp["score"]) / 2)
            mg5_explanation = f"Yield curve: {yc_comp['rationale'][:50]}; Credit: {cs_comp['rationale'][:50]}"[:120]
            mg5_source = "FRED T10Y2Y + BAMLH0A0HYM2"
        elif yc_comp:
            mg5_score = _clamp(yc_comp["score"])
            mg5_explanation = yc_comp["rationale"][:120]
            mg5_source = "FRED T10Y2Y"
    else:
        factor_details = signal_data.get("factorDetails", {}) if signal_data else {}
        old = factor_details.get("D3", {})
        mg5_score = _clamp(old.get("score", 0))
        mg5_explanation = old.get("reason", "No data available")[:120]
        mg5_source = "Claude AI + FRED"

    results.append({
        "factorId": "MG5", "rawValue": mg5_score,
        "normalizedScore": round(mg5_score, 2),
        "direction": "positive" if mg5_score > 0.3 else "negative" if mg5_score < -0.3 else "neutral",
        "dataSource": mg5_source,
        "explanation": mg5_explanation,
    })

    return results


# ─── Sentiment Factor Scoring ───


def _score_sentiment_factors(signal_data):
    """Score 4 sentiment sub-factors from existing signal data."""
    factor_details = signal_data.get("factorDetails", {}) if signal_data else {}

    mappings = [
        ("SE1", "F1", "Earnings Surprise"),
        ("SE2", "F2", "Guidance Revision"),
        ("SE3", "E1", "Analyst Consensus Change"),
        ("SE4", "E2", "Sector Sympathy"),
    ]

    results = []
    for new_id, old_id, name in mappings:
        old_factor = factor_details.get(old_id, {})
        score = _clamp(old_factor.get("score", 0))
        reason = old_factor.get("reason", "No data available")
        results.append({
            "factorId": new_id, "rawValue": score,
            "normalizedScore": round(score, 2),
            "direction": "positive" if score > 0.3 else "negative" if score < -0.3 else "neutral",
            "dataSource": "Claude AI + Finnhub",
            "explanation": reason[:120] if reason else "No data available",
        })
    return results


# ─── Alternative Data Factor Scoring ───


def _score_alt_data_factors(alt_data):
    """Score 3 alternative data sub-factors from patent/contract/FDA engines.

    Args:
        alt_data: Dict with optional keys: patents, contracts, fda
                  Each is the output from the respective engine's analyze().
    """
    results = []

    if not alt_data:
        return _default_scores("altData")

    patents = alt_data.get("patents")
    contracts = alt_data.get("contracts")
    fda = alt_data.get("fda")

    # AD1: Patent Innovation
    pat_score = 0.0
    if patents and patents.get("score"):
        # Map 1-10 score to -2..+2
        raw = patents["score"]
        pat_score = _clamp((raw - 5) * 0.5)  # 5→0, 10→+2.5→+2, 1→-2
        velocity = patents.get("velocity", 0)
        explanation = f"Patent velocity {'+' if velocity >= 0 else ''}{velocity}% YoY, {patents.get('totalLast12Mo', 0)} grants last 12mo"
    else:
        explanation = "No patent data available for this company"
    results.append({
        "factorId": "AD1", "rawValue": pat_score,
        "normalizedScore": round(pat_score, 2),
        "direction": "positive" if pat_score > 0.3 else "negative" if pat_score < -0.3 else "neutral",
        "dataSource": "USPTO PatentsView",
        "explanation": explanation,
    })

    # AD2: Government Contract Pipeline
    con_score = 0.0
    if contracts and contracts.get("score"):
        raw = contracts["score"]
        con_score = _clamp((raw - 5) * 0.5)
        growth = contracts.get("awardGrowth", 0)
        explanation = f"Contract awards {'+' if growth >= 0 else ''}{growth}% YoY, {contracts.get('activeContracts', 0)} active"
    else:
        explanation = "No government contract data for this company"
    results.append({
        "factorId": "AD2", "rawValue": con_score,
        "normalizedScore": round(con_score, 2),
        "direction": "positive" if con_score > 0.3 else "negative" if con_score < -0.3 else "neutral",
        "dataSource": "USASpending.gov",
        "explanation": explanation,
    })

    # AD3: FDA Catalyst Strength
    fda_score = 0.0
    if fda and fda.get("score"):
        raw = fda["score"]
        fda_score = _clamp((raw - 5) * 0.5)
        trials = fda.get("totalActiveTrials", 0)
        pdufa_90d = fda.get("pdufaWithin90Days", 0)
        explanation = f"{trials} active trials, {pdufa_90d} PDUFA dates within 90 days"
    else:
        explanation = "No FDA pipeline data for this company"
    results.append({
        "factorId": "AD3", "rawValue": fda_score,
        "normalizedScore": round(fda_score, 2),
        "direction": "positive" if fda_score > 0.3 else "negative" if fda_score < -0.3 else "neutral",
        "dataSource": "ClinicalTrials.gov + OpenFDA",
        "explanation": explanation,
    })

    return results


# ─── Helper ───


def _default_scores(dimension):
    """Return neutral scores for a dimension when data is unavailable."""
    factors = DIMENSIONS[dimension]["factors"]
    return [{
        "factorId": f["id"], "rawValue": 0.0,
        "normalizedScore": 0.0, "direction": "neutral",
        "dataSource": "N/A", "explanation": "Data not yet available",
    } for f in factors]


def _dim_score_to_10(contributions, dimension_key):
    """Convert factor contributions (-2 to +2) to 0-10 dimension score."""
    dim = DIMENSIONS[dimension_key]
    factors = dim["factors"]
    factor_map = {c["factorId"]: c for c in contributions}

    weighted_sum = 0.0
    weight_total = 0.0
    for f in factors:
        c = factor_map.get(f["id"])
        if c:
            weighted_sum += c["normalizedScore"] * f["weight"]
            weight_total += f["weight"]

    if weight_total == 0:
        return 5.0

    # Map -2..+2 weighted average to 0..10
    avg = weighted_sum / weight_total
    score_10 = ((avg + 2) / 4) * 10
    return round(max(0, min(10, score_10)), 1)


# ─── FACTOR_DETAIL Writers ───


def _write_macro_geo_factor_details(ticker, dimension_scores, mg_factors,
                                     monetary_score=None, geo_score=None,
                                     rate_sensitivity=None):
    """Write FACTOR_DETAIL records to DynamoDB for monetary and geopolitical dimensions.

    Maps factor_engine dimension scores to the 6-dimension factor_details schema:
      - macroGeo → monetary + geopolitical dimensions
    """
    try:
        import factor_details
    except Exception as e:
        logger.warning(f"[FACTORS] Cannot import factor_details module: {e}")
        return

    mg_dim_score = dimension_scores.get("macroGeo", 5.0)

    # Build monetary findings from fred_data components
    monetary_findings = []
    monetary_sources = ["FRED"]
    monetary_summary = "Monetary policy analysis based on FRED macro data."
    monetary_beginner = "We look at interest rates, inflation, and market conditions to understand the economic environment."

    if monetary_score and monetary_score.get("components"):
        for comp in monetary_score["components"]:
            monetary_findings.append({
                "claim": comp.get("rationale", ""),
                "source": comp.get("source", "FRED"),
                "source_type": "FRED",
                "source_url": "",
                "impact": "positive" if comp.get("score", 0) > 0 else "negative" if comp.get("score", 0) < 0 else "neutral",
                "data_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            })
        monetary_summary = f"Monetary environment score: {monetary_score.get('score', 5.0)}/10. "
        monetary_summary += "; ".join(c["rationale"][:80] for c in monetary_score["components"][:3])

    if rate_sensitivity:
        monetary_findings.append({
            "claim": rate_sensitivity.get("rationale", ""),
            "source": "yfinance + FRED",
            "source_type": "computed",
            "source_url": "",
            "impact": "negative" if rate_sensitivity.get("direction") == "negative" else "positive" if rate_sensitivity.get("direction") == "positive" else "neutral",
            "data_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        })
        monetary_sources.append("yfinance")
        monetary_beginner += f" {ticker} has {rate_sensitivity.get('sensitivity', 'moderate')} sensitivity to interest rate changes."

    # Write monetary dimension FACTOR_DETAIL
    try:
        factor_details.write_factor_detail(
            ticker=ticker,
            dimension="monetary",
            score=monetary_score.get("score", mg_dim_score) if monetary_score else mg_dim_score,
            percentile=50,  # TODO: compute real percentile across universe
            findings=monetary_findings,
            summary=monetary_summary[:500],
            beginner_summary=monetary_beginner[:300],
            confidence="High" if monetary_score else "Low",
            data_sources_used=monetary_sources,
        )
    except Exception as e:
        logger.warning(f"[FACTORS] Failed to write monetary FACTOR_DETAIL for {ticker}: {e}")

    # Build geopolitical findings from geo_score components
    geo_findings = []
    geo_sources = []
    geo_summary = "Geopolitical risk analysis for stock."
    geo_beginner = "We check how world events, trade policies, and geographic risks affect this stock."
    geo_confidence = "Low"

    if geo_score and geo_score.get("components"):
        geo_confidence = "High"
        for comp in geo_score["components"]:
            geo_findings.append({
                "claim": comp.get("rationale", ""),
                "source": comp.get("source", "GPR Index"),
                "source_type": "GPR" if "GPR" in comp.get("source", "") else "SEC",
                "source_url": "",
                "impact": "positive" if comp.get("score", 0) > 0 else "negative" if comp.get("score", 0) < 0 else "neutral",
                "data_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            })
        geo_sources = list(set(c.get("source", "")[:30] for c in geo_score["components"]))
        geo_summary = f"Geopolitical risk score: {geo_score.get('score', 5.0)}/10 (GPR={geo_score.get('gpr_value', 'N/A')}, trend={geo_score.get('gpr_trend', 'N/A')}). "
        geo_summary += "; ".join(c["rationale"][:80] for c in geo_score["components"][:3])

    # Write geopolitical dimension FACTOR_DETAIL
    try:
        factor_details.write_factor_detail(
            ticker=ticker,
            dimension="geopolitical",
            score=geo_score.get("score", mg_dim_score) if geo_score else mg_dim_score,
            percentile=50,  # TODO: compute real percentile across universe
            findings=geo_findings,
            summary=geo_summary[:500],
            beginner_summary=geo_beginner[:300],
            confidence=geo_confidence,
            data_sources_used=geo_sources,
        )
    except Exception as e:
        logger.warning(f"[FACTORS] Failed to write geopolitical FACTOR_DETAIL for {ticker}: {e}")


# ─── Main Entry Point ───


def compute_factors(ticker, signal_data=None, technicals=None, fundamentals=None, alt_data=None):
    """Compute all sub-factors and dimension scores for a ticker.

    Args:
        ticker: Stock symbol
        signal_data: Full signal from S3/DynamoDB (with factorDetails)
        technicals: Output from technical_engine.compute_indicators()
        fundamentals: Output from fundamentals_engine.analyze()
        alt_data: Dict with optional keys: patents, contracts, fda

    Returns:
        Dict with factorContributions, dimensionScores, topPositive, topNegative,
        compositeScore (1-10), and metadata.
    """
    all_contributions = []

    # Fetch macro and geopolitical data for enhanced scoring
    macro_snapshot = None
    monetary_score = None
    rate_sensitivity = None
    geo_score = None

    try:
        import fred_data
        macro_snapshot = fred_data.get_macro_snapshot()
        if macro_snapshot:
            monetary_score = fred_data.compute_monetary_score(macro_snapshot)
            rate_sensitivity = fred_data.compute_stock_rate_sensitivity(ticker, macro_snapshot)
    except Exception as e:
        logger.warning(f"[FACTORS] FRED data unavailable for {ticker}: {e}")

    try:
        import geopolitical_data
        gpr_data = geopolitical_data.get_geopolitical_risk_index()
        if gpr_data:
            geo_score = geopolitical_data.compute_geopolitical_score(ticker, gpr_data)
    except Exception as e:
        logger.warning(f"[FACTORS] Geopolitical data unavailable for {ticker}: {e}")

    # Score each dimension
    sc_factors = _score_supply_chain_factors(signal_data)
    mg_factors = _score_macro_factors(
        signal_data, ticker=ticker, macro_snapshot=macro_snapshot,
        monetary_score=monetary_score, rate_sensitivity=rate_sensitivity,
        geo_score=geo_score,
    )
    te_factors = _score_technical_factors(technicals)
    fd_factors = _score_fundamental_factors(fundamentals)
    se_factors = _score_sentiment_factors(signal_data)

    all_contributions.extend(sc_factors)
    all_contributions.extend(mg_factors)
    all_contributions.extend(te_factors)
    all_contributions.extend(fd_factors)
    all_contributions.extend(se_factors)

    # Alt data dimension (6th, optional)
    has_alt_data = False
    ad_factors = []
    if alt_data:
        patents = alt_data.get("patents")
        contracts = alt_data.get("contracts")
        fda = alt_data.get("fda")
        if any(d and d.get("score") for d in [patents, contracts, fda]):
            has_alt_data = True
            ad_factors = _score_alt_data_factors(alt_data)
            all_contributions.extend(ad_factors)

    # Determine active weights based on alt data availability
    active_weights = WEIGHTS_WITH_ALT if has_alt_data else WEIGHTS_WITHOUT_ALT

    # Attach dimension and factor names
    factor_name_map = {}
    factor_dim_map = {}
    for dim_key, dim in DIMENSIONS.items():
        for f in dim["factors"]:
            factor_name_map[f["id"]] = f["name"]
            factor_dim_map[f["id"]] = dim_key

    for c in all_contributions:
        c["factorName"] = factor_name_map.get(c["factorId"], c["factorId"])
        c["dimension"] = factor_dim_map.get(c["factorId"], "unknown")
        # Compute weighted contribution using active weights
        dim_key = c["dimension"]
        dim = DIMENSIONS.get(dim_key, {})
        dim_weight = active_weights.get(dim_key, dim.get("weight", 0.2))
        factor_def = next((f for f in dim.get("factors", []) if f["id"] == c["factorId"]), None)
        factor_weight = factor_def["weight"] if factor_def else 0.2
        c["weight"] = round(dim_weight * factor_weight, 4)
        c["contribution"] = round(c["normalizedScore"] * c["weight"], 4)

    # Dimension scores (0-10)
    dimension_scores = {
        "supplyChain": _dim_score_to_10(sc_factors, "supplyChain"),
        "macroGeo": _dim_score_to_10(mg_factors, "macroGeo"),
        "technical": _dim_score_to_10(te_factors, "technical"),
        "fundamental": _dim_score_to_10(fd_factors, "fundamental"),
        "sentiment": _dim_score_to_10(se_factors, "sentiment"),
    }
    if has_alt_data:
        dimension_scores["altData"] = _dim_score_to_10(ad_factors, "altData")

    # Composite score (1-10): weighted average using active weights
    composite = 0.0
    for dim_key, weight in active_weights.items():
        if dim_key in dimension_scores:
            composite += dimension_scores[dim_key] * weight
    composite = round(max(1, min(10, composite)), 1)

    # Top positive/negative
    sorted_positive = sorted(
        [c for c in all_contributions if c["normalizedScore"] > 0],
        key=lambda x: x["contribution"], reverse=True,
    )
    sorted_negative = sorted(
        [c for c in all_contributions if c["normalizedScore"] < 0],
        key=lambda x: x["contribution"],
    )

    factor_count = len(all_contributions)
    dim_count = 6 if has_alt_data else 5

    # Write FACTOR_DETAIL records for monetary and geopolitical dimensions
    _write_macro_geo_factor_details(
        ticker, dimension_scores, mg_factors,
        monetary_score=monetary_score, geo_score=geo_score,
        rate_sensitivity=rate_sensitivity,
    )

    return {
        "ticker": ticker,
        "dimensionScores": dimension_scores,
        "compositeScore": composite,
        "factorContributions": all_contributions,
        "topPositive": sorted_positive[:3],
        "topNegative": sorted_negative[:3],
        "factorCount": factor_count,
        "hasAltData": has_alt_data,
        "altDataTypes": [
            k for k in ["patents", "contracts", "fda"]
            if alt_data and alt_data.get(k) and alt_data[k].get("score")
        ] if alt_data else [],
        "scoringMethodology": {
            "version": "3.1",
            "factorCount": factor_count,
            "dimensions": dim_count,
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
        },
        "analyzedAt": datetime.now(timezone.utc).isoformat(),
    }

"""FRED Macro Data Pipeline for FII.

Fetches key macro-economic indicators from the FRED API and computes
monetary environment scores and stock-level rate sensitivity.

Functions:
  - get_macro_snapshot()              — All FRED series with direction + trend
  - compute_monetary_score(snapshot)  — 1-10 monetary environment score
  - compute_stock_rate_sensitivity()  — Per-stock interest rate sensitivity
"""

import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ─── FRED Series Definitions ───

FRED_SERIES = {
    # MONETARY POLICY
    "DFF": {"name": "Federal Funds Rate", "frequency": "daily", "category": "monetary"},
    "T10Y2Y": {"name": "10Y-2Y Treasury Spread", "frequency": "daily", "category": "monetary"},
    "T10YIE": {"name": "10Y Breakeven Inflation", "frequency": "daily", "category": "monetary"},
    "MORTGAGE30US": {"name": "30-Year Mortgage Rate", "frequency": "weekly", "category": "monetary"},
    # INFLATION
    "CPIAUCSL": {"name": "CPI All Urban Consumers", "frequency": "monthly", "category": "inflation"},
    "CPILFESL": {"name": "Core CPI ex Food/Energy", "frequency": "monthly", "category": "inflation"},
    "PCEPI": {"name": "PCE Price Index", "frequency": "monthly", "category": "inflation"},
    # ECONOMY
    "UNRATE": {"name": "Unemployment Rate", "frequency": "monthly", "category": "economy"},
    "GDP": {"name": "Real GDP", "frequency": "quarterly", "category": "economy"},
    "INDPRO": {"name": "Industrial Production", "frequency": "monthly", "category": "economy"},
    "RSAFS": {"name": "Retail Sales", "frequency": "monthly", "category": "economy"},
    # MARKET CONDITIONS
    "VIXCLS": {"name": "VIX", "frequency": "daily", "category": "market"},
    "BAMLH0A0HYM2": {"name": "High Yield OAS Spread", "frequency": "daily", "category": "market"},
    "SP500": {"name": "S&P 500 Index", "frequency": "daily", "category": "market"},
}

# Cache for macro snapshot (24-hour TTL)
_macro_cache: dict = {}
_macro_cache_ts: float = 0.0
_CACHE_TTL = 24 * 60 * 60  # 24 hours


def _get_fred_api_key() -> str:
    """Retrieve FRED API key from Secrets Manager or environment variable."""
    # First check env var (Lambda config)
    env_key = os.environ.get("FRED_API_KEY", "")
    if env_key:
        return env_key

    # Fall back to Secrets Manager
    try:
        import boto3
        arn = os.environ.get("FRED_API_KEY_ARN", "")
        if not arn:
            raise ValueError("No FRED_API_KEY or FRED_API_KEY_ARN configured")
        client = boto3.client("secretsmanager")
        response = client.get_secret_value(SecretId=arn)
        return response["SecretString"]
    except Exception as e:
        logger.error(f"[FRED] Failed to get API key: {e}")
        raise


def _compute_direction(current: float, prior: float) -> str:
    """Compute direction from two data points."""
    if prior == 0:
        return "stable"
    pct_change = ((current - prior) / abs(prior)) * 100
    if abs(pct_change) < 1.0:
        return "stable"
    return "rising" if pct_change > 0 else "falling"


def _compute_yoy_change(series_data) -> Optional[float]:
    """Compute year-over-year percentage change from a pandas Series.

    For index series like CPI, this gives the inflation rate.
    """
    if series_data is None or len(series_data) < 12:
        return None
    try:
        current = float(series_data.iloc[-1])
        year_ago = float(series_data.iloc[-12]) if len(series_data) >= 12 else float(series_data.iloc[0])
        if year_ago == 0:
            return None
        return round(((current - year_ago) / year_ago) * 100, 2)
    except Exception:
        return None


def _fetch_series(fred, series_id: str, num_points: int = 12) -> Optional[dict]:
    """Fetch a single FRED series and compute direction.

    Args:
        fred: fredapi.Fred instance.
        series_id: FRED series identifier.
        num_points: Number of recent observations to fetch for trend analysis.

    Returns:
        Dict with value, prior, direction, date, and trend data, or None.
    """
    try:
        data = fred.get_series(series_id, observation_start="2024-01-01")
        if data is None or len(data) == 0:
            return None

        data = data.dropna()
        if len(data) == 0:
            return None

        current = float(data.iloc[-1])
        prior = float(data.iloc[-2]) if len(data) >= 2 else current
        direction = _compute_direction(current, prior)
        date_str = str(data.index[-1].date()) if hasattr(data.index[-1], 'date') else str(data.index[-1])

        result = {
            "value": round(current, 4),
            "prior": round(prior, 4),
            "direction": direction,
            "series_id": series_id,
            "date": date_str,
        }

        # Compute YoY change for index series (CPI, PCE)
        if series_id in ("CPIAUCSL", "CPILFESL", "PCEPI"):
            yoy = _compute_yoy_change(data)
            if yoy is not None:
                result["yoy_change"] = yoy

        # Yield curve signal
        if series_id == "T10Y2Y":
            result["signal"] = "inverted" if current < 0 else "normal"

        # VIX regime
        if series_id == "VIXCLS":
            if current < 20:
                result["regime"] = "low_vol"
            elif current <= 30:
                result["regime"] = "elevated"
            else:
                result["regime"] = "high_vol"

        # Trend: last N points for sparkline / trend analysis
        trend_points = data.iloc[-min(num_points, len(data)):].tolist()
        result["trend"] = [round(float(v), 4) for v in trend_points]

        return result

    except Exception as e:
        logger.warning(f"[FRED] Failed to fetch {series_id}: {e}")
        return None


def get_macro_snapshot() -> dict:
    """Fetch all FRED series and return a comprehensive macro snapshot.

    Caches results for 24 hours to avoid hitting FRED rate limits.
    Falls back to cached values if FRED is unavailable.

    Returns:
        Dict keyed by human-readable names with value, prior, direction,
        series_id, date, and optional signal/regime fields.
    """
    global _macro_cache, _macro_cache_ts

    # Check in-memory cache
    now = time.time()
    if _macro_cache and (now - _macro_cache_ts) < _CACHE_TTL:
        logger.info("[FRED] Returning cached macro snapshot")
        return _macro_cache

    # Check DynamoDB cache
    try:
        import db
        cached = db.get_item("MACRO#FRED", "SNAPSHOT")
        if cached:
            cached_at = cached.get("cachedAt", "")
            if cached_at:
                from datetime import datetime as dt
                cache_time = dt.fromisoformat(cached_at.replace("Z", "+00:00"))
                age_seconds = (datetime.now(timezone.utc) - cache_time).total_seconds()
                if age_seconds < _CACHE_TTL:
                    snapshot = cached.get("snapshot", {})
                    # Convert Decimal to float
                    snapshot = _convert_decimals(snapshot)
                    _macro_cache = snapshot
                    _macro_cache_ts = now
                    logger.info("[FRED] Returning DynamoDB-cached macro snapshot")
                    return snapshot
    except Exception as e:
        logger.warning(f"[FRED] DynamoDB cache read failed: {e}")

    # Fetch fresh data from FRED
    try:
        from fredapi import Fred
        fred_key = _get_fred_api_key()
        fred = Fred(api_key=fred_key)
    except Exception as e:
        logger.error(f"[FRED] Cannot initialize FRED client: {e}")
        if _macro_cache:
            logger.warning("[FRED] Returning stale in-memory cache")
            return _macro_cache
        return {}

    snapshot = {}
    key_mapping = {
        "DFF": "fed_funds_rate",
        "T10Y2Y": "yield_curve_spread",
        "T10YIE": "breakeven_inflation_10y",
        "MORTGAGE30US": "mortgage_rate_30y",
        "CPIAUCSL": "cpi_yoy",
        "CPILFESL": "core_cpi_yoy",
        "PCEPI": "pce_yoy",
        "UNRATE": "unemployment_rate",
        "GDP": "real_gdp",
        "INDPRO": "industrial_production",
        "RSAFS": "retail_sales",
        "VIXCLS": "vix",
        "BAMLH0A0HYM2": "hy_oas_spread",
        "SP500": "sp500",
    }

    for series_id, meta in FRED_SERIES.items():
        result = _fetch_series(fred, series_id)
        if result:
            key = key_mapping.get(series_id, series_id.lower())
            # For CPI/PCE series, use YoY change as the primary value
            if series_id in ("CPIAUCSL", "CPILFESL", "PCEPI") and "yoy_change" in result:
                yoy = result.pop("yoy_change")
                result["value"] = yoy
                # Recompute direction based on YoY values
                result["direction"] = _compute_direction(yoy, result.get("prior", yoy))
            snapshot[key] = result

    if snapshot:
        _macro_cache = snapshot
        _macro_cache_ts = now

        # Persist to DynamoDB
        try:
            import db
            from decimal import Decimal

            def _to_decimal(obj):
                if isinstance(obj, float):
                    return Decimal(str(round(obj, 6)))
                if isinstance(obj, dict):
                    return {k: _to_decimal(v) for k, v in obj.items()}
                if isinstance(obj, list):
                    return [_to_decimal(i) for i in obj]
                return obj

            db.put_item({
                "PK": "MACRO#FRED",
                "SK": "SNAPSHOT",
                "snapshot": _to_decimal(snapshot),
                "cachedAt": datetime.now(timezone.utc).isoformat(),
                "source": "fred_api",
            })
            logger.info("[FRED] Cached macro snapshot to DynamoDB")
        except Exception as e:
            logger.warning(f"[FRED] DynamoDB cache write failed: {e}")
    else:
        # All fetches failed — try returning stale cache
        if _macro_cache:
            logger.warning("[FRED] All fetches failed, returning stale cache")
            return _macro_cache

    return snapshot


def _convert_decimals(obj):
    """Recursively convert Decimal values to float."""
    from decimal import Decimal
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: _convert_decimals(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert_decimals(i) for i in obj]
    return obj


# ─── Monetary Score Computation ───


def compute_monetary_score(macro_snapshot: dict) -> dict:
    """Score the monetary environment for stocks on a 1-10 scale.

    Scoring components:
      - Fed policy (rate direction): cutting +2, holding 0, hiking -2
      - Yield curve: normal +1, flat 0, inverted -2
      - CPI trend: falling toward 2% +1, stable 0, rising above 3% -1
      - VIX regime: <15 +1, 15-20 0, 20-30 -1, >30 -2
      - Credit spreads: tight +1, normal 0, widening -1, blowing out -2

    Args:
        macro_snapshot: Output from get_macro_snapshot().

    Returns:
        Dict with score (1-10) and scored components with rationales.
    """
    if not macro_snapshot:
        return {"score": 5.0, "components": [], "rationale": "No macro data available"}

    components = []
    raw_sum = 0.0

    # 1. Fed Policy (rate direction)
    ff = macro_snapshot.get("fed_funds_rate", {})
    fed_score = 0.0
    fed_rationale = "Fed Funds data unavailable"
    if ff:
        direction = ff.get("direction", "stable")
        value = ff.get("value", 0)
        prior = ff.get("prior", value)
        if direction == "falling":
            fed_score = 2.0
            cut_bps = round((prior - value) * 100)
            fed_rationale = f"Fed has cut rates (FFR {prior}% → {value}%), easing financial conditions"
        elif direction == "rising":
            fed_score = -2.0
            hike_bps = round((value - prior) * 100)
            fed_rationale = f"Fed hiking rates (FFR {prior}% → {value}%), tightening conditions"
        else:
            fed_score = 0.0
            fed_rationale = f"Fed holding rates steady at {value}%"
    raw_sum += fed_score
    components.append({
        "factor": "fed_policy",
        "score": fed_score,
        "rationale": fed_rationale,
        "source": "FRED DFF series",
    })

    # 2. Yield Curve
    yc = macro_snapshot.get("yield_curve_spread", {})
    yc_score = 0.0
    yc_rationale = "Yield curve data unavailable"
    if yc:
        spread = yc.get("value", 0)
        signal = yc.get("signal", "normal")
        direction = yc.get("direction", "stable")
        if spread < -0.5:
            yc_score = -2.0
            yc_rationale = f"Yield curve deeply inverted ({spread}%), recession warning"
        elif spread < 0:
            yc_score = -1.0
            yc_rationale = f"Yield curve inverted ({spread}%), economic uncertainty"
        elif spread < 0.2:
            yc_score = 0.0
            yc_rationale = f"Yield curve flat ({spread}%), cautious outlook"
        elif direction == "rising" and spread > 0:
            yc_score = 1.0
            yc_rationale = f"Yield curve normalizing ({spread}%), positive growth signal"
        else:
            yc_score = 0.5
            yc_rationale = f"Yield curve normal ({spread}%)"
    raw_sum += yc_score
    components.append({
        "factor": "yield_curve",
        "score": yc_score,
        "rationale": yc_rationale,
        "source": "FRED T10Y2Y series",
    })

    # 3. CPI / Inflation
    cpi = macro_snapshot.get("cpi_yoy", {})
    cpi_score = 0.0
    cpi_rationale = "CPI data unavailable"
    if cpi:
        cpi_val = cpi.get("value", 0)
        direction = cpi.get("direction", "stable")
        if direction == "falling" and cpi_val < 3.0:
            cpi_score = 1.0
            cpi_rationale = f"CPI falling toward target ({cpi_val}% YoY), supportive for equities"
        elif cpi_val <= 2.5:
            cpi_score = 1.0
            cpi_rationale = f"CPI near Fed target ({cpi_val}% YoY), ideal monetary conditions"
        elif cpi_val <= 3.0:
            cpi_score = 0.0
            cpi_rationale = f"CPI moderately above target ({cpi_val}% YoY), manageable"
        elif cpi_val <= 4.0:
            cpi_score = -0.5
            cpi_rationale = f"CPI elevated ({cpi_val}% YoY), constraining monetary policy"
        else:
            cpi_score = -1.0
            cpi_rationale = f"CPI significantly elevated ({cpi_val}% YoY), tightening pressure"
    raw_sum += cpi_score
    components.append({
        "factor": "inflation",
        "score": cpi_score,
        "rationale": cpi_rationale,
        "source": "FRED CPIAUCSL series",
    })

    # 4. VIX Regime
    vix = macro_snapshot.get("vix", {})
    vix_score = 0.0
    vix_rationale = "VIX data unavailable"
    if vix:
        vix_val = vix.get("value", 20)
        regime = vix.get("regime", "elevated")
        if vix_val < 15:
            vix_score = 1.0
            vix_rationale = f"VIX at {vix_val} (complacency zone), very low volatility"
        elif vix_val < 20:
            vix_score = 0.0
            vix_rationale = f"VIX at {vix_val} (low vol), normal market conditions"
        elif vix_val < 30:
            vix_score = -1.0
            vix_rationale = f"VIX at {vix_val} (elevated), increased uncertainty"
        else:
            vix_score = -2.0
            vix_rationale = f"VIX at {vix_val} (high vol/crisis), extreme market stress"
    raw_sum += vix_score
    components.append({
        "factor": "vix_regime",
        "score": vix_score,
        "rationale": vix_rationale,
        "source": "FRED VIXCLS series",
    })

    # 5. Credit Spreads (High Yield OAS)
    hy = macro_snapshot.get("hy_oas_spread", {})
    credit_score = 0.0
    credit_rationale = "Credit spread data unavailable"
    if hy:
        spread = hy.get("value", 4)
        direction = hy.get("direction", "stable")
        if spread < 3.0:
            credit_score = 1.0
            credit_rationale = f"HY OAS spread tight ({spread}%), risk-on environment"
        elif spread < 4.5:
            credit_score = 0.0
            credit_rationale = f"HY OAS spread normal ({spread}%), stable credit conditions"
        elif spread < 6.0:
            credit_score = -1.0
            credit_rationale = f"HY OAS spread widening ({spread}%), credit stress emerging"
        else:
            credit_score = -2.0
            credit_rationale = f"HY OAS spread blown out ({spread}%), severe credit stress"
        # Direction amplifier
        if direction == "rising" and credit_score <= 0:
            credit_score -= 0.5
            credit_rationale += "; spreads actively widening"
        elif direction == "falling" and credit_score >= 0:
            credit_score += 0.5
            credit_rationale += "; spreads compressing"
    raw_sum += credit_score
    components.append({
        "factor": "credit_spreads",
        "score": credit_score,
        "rationale": credit_rationale,
        "source": "FRED BAMLH0A0HYM2 series",
    })

    # Normalize raw_sum (-8.5 to +6.5 range) to 1-10 scale
    # raw_sum range: min ~ -9, max ~ +6.5
    # Map: -9 → 1, 0 → 5.5, +6.5 → 10
    score_10 = ((raw_sum + 9) / 15.5) * 9 + 1
    score_10 = round(max(1.0, min(10.0, score_10)), 1)

    return {
        "score": score_10,
        "raw_sum": round(raw_sum, 2),
        "components": components,
    }


# ─── Stock Rate Sensitivity ───

# Sector classifications for rate sensitivity
RATE_SENSITIVE_POSITIVE = {"Financial Services", "Banks", "Insurance", "Diversified Financials"}
RATE_SENSITIVE_NEGATIVE = {"Technology", "Real Estate", "Utilities"}
RATE_DEFENSIVE = {"Consumer Defensive", "Healthcare", "Utilities"}


def compute_stock_rate_sensitivity(ticker: str, macro_snapshot: dict) -> dict:
    """Estimate how sensitive a specific stock is to interest rate changes.

    Uses yfinance data (sector, P/E, dividend yield) to classify:
      - High-growth tech (P/E > 30, low dividends): HIGH negative sensitivity
      - Dividend stocks (yield > 3%): HIGH inverse sensitivity
      - Financials: HIGH positive sensitivity (benefit from rising rates)
      - Defensive (utilities, staples): LOW sensitivity

    Args:
        ticker: Stock ticker symbol.
        macro_snapshot: Output from get_macro_snapshot() for context.

    Returns:
        Dict with sensitivity level, direction, and rationale.
    """
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        info = stock.info or {}
    except Exception as e:
        logger.warning(f"[FRED] yfinance lookup failed for {ticker}: {e}")
        info = {}

    # Also try Finnhub as fallback for basic data
    if not info.get("sector"):
        try:
            import finnhub_client
            profile = finnhub_client.get_company_profile(ticker)
            if profile:
                info.setdefault("sector", profile.get("finnhubIndustry", ""))
        except Exception:
            pass

    sector = info.get("sector", "")
    forward_pe = info.get("forwardPE") or info.get("forwardEps", None)
    trailing_pe = info.get("trailingPE", None)
    pe = forward_pe or trailing_pe
    dividend_yield = info.get("dividendYield", 0) or 0
    dividend_yield_pct = dividend_yield * 100 if dividend_yield < 1 else dividend_yield

    # Get current rate direction from macro snapshot
    ff = macro_snapshot.get("fed_funds_rate", {})
    rate_direction = ff.get("direction", "stable") if ff else "stable"

    # Classify sensitivity
    sensitivity = "MODERATE"
    direction = "neutral"
    rationale = f"{ticker} has moderate interest rate sensitivity"

    if sector in RATE_SENSITIVE_POSITIVE:
        sensitivity = "HIGH"
        direction = "positive"
        rationale = (
            f"{sector} sector stocks benefit from higher rates through improved "
            f"net interest margins. {ticker} has high positive rate sensitivity."
        )
    elif pe is not None and pe > 30 and dividend_yield_pct < 1.0:
        sensitivity = "HIGH"
        direction = "negative"
        rationale = (
            f"High-growth stock (P/E={round(pe, 1)}, div yield={round(dividend_yield_pct, 2)}%) "
            f"is negatively impacted by rising rates due to DCF discount rate compression."
        )
    elif dividend_yield_pct > 3.0:
        sensitivity = "HIGH"
        direction = "negative"
        rationale = (
            f"High-dividend stock (yield={round(dividend_yield_pct, 2)}%) faces competition "
            f"from rising risk-free rates, reducing relative attractiveness."
        )
    elif sector in RATE_DEFENSIVE:
        sensitivity = "LOW"
        direction = "neutral"
        rationale = (
            f"Defensive sector ({sector}) has relatively low rate sensitivity "
            f"due to stable demand and pricing power."
        )
    elif sector in RATE_SENSITIVE_NEGATIVE:
        sensitivity = "MODERATE"
        direction = "negative"
        rationale = (
            f"{sector} sector is moderately sensitive to rates; "
            f"higher rates increase borrowing costs and compress valuations."
        )

    return {
        "ticker": ticker,
        "sensitivity": sensitivity,
        "direction": direction,
        "rationale": rationale,
        "sector": sector,
        "forward_pe": round(pe, 1) if pe else None,
        "dividend_yield_pct": round(dividend_yield_pct, 2),
        "current_rate_direction": rate_direction,
    }

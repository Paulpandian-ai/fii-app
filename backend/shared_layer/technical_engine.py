"""Technical Indicator Engine for FII.

Computes 15 technical indicators from daily OHLCV data using pandas
and numpy (no pandas-ta dependency to keep Lambda layer small).

Indicators computed:
  Trend:     SMA(20), SMA(50), SMA(200), EMA(12), EMA(26), MACD(12,26,9), ADX(14)
  Momentum:  RSI(14), Stochastic(14,3,3), Williams %R(14)
  Volatility: Bollinger Bands(20,2), ATR(14)
  Volume:    OBV, VWAP (daily approximation)
  Pattern:   Fibonacci Retracement levels (60-day swing high/low)
"""

import logging
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def compute_indicators(candles: list[dict]) -> dict:
    """Compute all 15 technical indicators from OHLCV candle data.

    Args:
        candles: List of {date, open, high, low, close, volume} dicts.

    Returns:
        Dict with all indicator values and signal summaries.
        Gracefully degrades when fewer candles are available — computes
        whichever indicators the data supports instead of returning an error.
    """
    if not candles or len(candles) < 5:
        return {"error": "Insufficient data", "indicatorCount": 0}

    df = pd.DataFrame(candles)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)

    close = df["close"].astype(float)
    high = df["high"].astype(float)
    low = df["low"].astype(float)
    volume = df["volume"].astype(float)
    open_price = df["open"].astype(float)
    n = len(close)

    result = {}
    indicator_count = 0

    # ─── Trend Indicators ───

    if n >= 20:
        result["sma20"] = _safe_last(_sma(close, 20))
        indicator_count += 1
    else:
        result["sma20"] = None

    if n >= 50:
        result["sma50"] = _safe_last(_sma(close, 50))
        indicator_count += 1
    else:
        result["sma50"] = None

    if n >= 200:
        result["sma200"] = _safe_last(_sma(close, 200))
        indicator_count += 1
    else:
        result["sma200"] = None

    if n >= 26:
        result["ema12"] = _safe_last(_ema(close, 12))
        result["ema26"] = _safe_last(_ema(close, 26))
        macd_line, signal_line, histogram = _macd(close, 12, 26, 9)
        result["macd"] = {
            "value": _safe_last(macd_line),
            "signal": _safe_last(signal_line),
            "histogram": _safe_last(histogram),
        }
        indicator_count += 3
    else:
        result["ema12"] = None
        result["ema26"] = None
        result["macd"] = {"value": None, "signal": None, "histogram": None}

    if n >= 14:
        result["adx"] = _safe_last(_adx(high, low, close, 14))
        indicator_count += 1
    else:
        result["adx"] = None

    # ─── Momentum Indicators ───

    if n >= 14:
        result["rsi"] = _safe_last(_rsi(close, 14))
        stoch_k, stoch_d = _stochastic(high, low, close, 14, 3, 3)
        result["stochastic"] = {
            "k": _safe_last(stoch_k),
            "d": _safe_last(stoch_d),
        }
        result["williamsR"] = _safe_last(_williams_r(high, low, close, 14))
        indicator_count += 3
    else:
        result["rsi"] = None
        result["stochastic"] = {"k": None, "d": None}
        result["williamsR"] = None

    # ─── Volatility Indicators ───

    if n >= 20:
        bb_upper, bb_middle, bb_lower = _bollinger_bands(close, 20, 2)
        result["bollingerBands"] = {
            "upper": _safe_last(bb_upper),
            "middle": _safe_last(bb_middle),
            "lower": _safe_last(bb_lower),
        }
        indicator_count += 1
    else:
        result["bollingerBands"] = {"upper": None, "middle": None, "lower": None}

    if n >= 14:
        result["atr"] = _safe_last(_atr(high, low, close, 14))
        indicator_count += 1
    else:
        result["atr"] = None

    # ─── Volume Indicators ───

    result["obv"] = _safe_last(_obv(close, volume))
    result["vwap"] = _safe_last(_vwap(high, low, close, volume))
    indicator_count += 2

    # ─── Pattern: Fibonacci Retracement ───

    window = min(60, n)
    result["fibonacci"] = _fibonacci_levels(high, low, window=window)
    indicator_count += 1

    # ─── Current price for context ───
    current_price = float(close.iloc[-1])
    result["currentPrice"] = round(current_price, 2)

    # ─── Signal Summaries ───
    result["signals"] = _generate_signal_summaries(result, current_price)

    # ─── Technical Score (1-10) ───
    result["technicalScore"] = _compute_technical_score(result, current_price)

    result["indicatorCount"] = indicator_count

    return result


def _compute_technical_score(indicators: dict, price: float) -> float:
    """Compute a 1-10 technical score from indicator values.

    Score components:
      Trend alignment (30%):  Price vs SMAs, MACD direction, ADX strength
      Momentum (25%):         RSI zone, Stochastic crossovers
      Volume confirmation (20%): OBV trend
      Volatility context (15%): Bollinger Band position, ATR context
      Pattern signals (10%):  Fibonacci support/resistance proximity
    """
    scores = {}

    # 1) Trend alignment (30%)
    trend_score = 0
    sma20 = indicators.get("sma20", 0) or 0
    sma50 = indicators.get("sma50", 0) or 0
    sma200 = indicators.get("sma200", 0) or 0

    if sma20 and price > sma20:
        trend_score += 2
    elif sma20 and price < sma20:
        trend_score -= 1

    if sma50 and price > sma50:
        trend_score += 2
    elif sma50 and price < sma50:
        trend_score -= 1

    if sma200 and price > sma200:
        trend_score += 2
    elif sma200 and price < sma200:
        trend_score -= 2

    macd = indicators.get("macd", {})
    hist = macd.get("histogram", 0) or 0
    if hist > 0:
        trend_score += 2
    elif hist < 0:
        trend_score -= 1

    adx = indicators.get("adx", 0) or 0
    if adx > 25:
        trend_score += 1  # Strong trend
    elif adx < 15:
        trend_score -= 1  # Weak/no trend

    # Normalize to 0-10
    scores["trend"] = max(0, min(10, (trend_score + 5) * 10 / 14))

    # 2) Momentum (25%)
    momentum_score = 0
    rsi = indicators.get("rsi", 50) or 50

    if 40 <= rsi <= 60:
        momentum_score += 2  # Neutral
    elif 30 <= rsi < 40:
        momentum_score += 3  # Near oversold — opportunity
    elif rsi < 30:
        momentum_score += 4  # Oversold — strong buy signal
    elif 60 < rsi <= 70:
        momentum_score += 1  # Slightly overbought
    else:
        momentum_score -= 1  # Overbought

    stoch = indicators.get("stochastic", {})
    stoch_k = stoch.get("k", 50) or 50
    stoch_d = stoch.get("d", 50) or 50
    if stoch_k > stoch_d and stoch_k < 80:
        momentum_score += 2  # Bullish crossover
    elif stoch_k < stoch_d and stoch_k > 20:
        momentum_score -= 1

    scores["momentum"] = max(0, min(10, (momentum_score + 2) * 10 / 8))

    # 3) Volume confirmation (20%)
    volume_score = 5  # Neutral by default
    scores["volume"] = volume_score

    # 4) Volatility context (15%)
    vol_score = 5
    bb = indicators.get("bollingerBands", {})
    bb_upper = bb.get("upper", 0) or 0
    bb_lower = bb.get("lower", 0) or 0
    bb_middle = bb.get("middle", 0) or 0

    if bb_upper and bb_lower and price > 0:
        bb_range = bb_upper - bb_lower
        if bb_range > 0:
            bb_position = (price - bb_lower) / bb_range
            if 0.3 <= bb_position <= 0.7:
                vol_score = 6  # In middle — low risk
            elif bb_position < 0.2:
                vol_score = 7  # Near lower band — potential bounce
            elif bb_position > 0.8:
                vol_score = 3  # Near upper band — stretched

    scores["volatility"] = max(0, min(10, vol_score))

    # 5) Pattern signals (10%)
    fib = indicators.get("fibonacci", {})
    pattern_score = 5  # Neutral
    fib_levels = [fib.get("level_38_2", 0), fib.get("level_50", 0), fib.get("level_61_8", 0)]
    for level in fib_levels:
        if level and price > 0:
            proximity = abs(price - level) / price
            if proximity < 0.02:  # Within 2% of a Fib level
                pattern_score = 7  # Near support/resistance
                break

    scores["pattern"] = max(0, min(10, pattern_score))

    # Weighted composite
    composite = (
        scores["trend"] * 0.30 +
        scores["momentum"] * 0.25 +
        scores["volume"] * 0.20 +
        scores["volatility"] * 0.15 +
        scores["pattern"] * 0.10
    )

    return round(max(1.0, min(10.0, composite)), 1)


def _generate_signal_summaries(indicators: dict, price: float) -> dict:
    """Generate human-readable signal summaries."""
    summaries = {}

    # Trend
    sma50 = indicators.get("sma50", 0) or 0
    sma200 = indicators.get("sma200", 0) or 0
    macd_hist = (indicators.get("macd", {}) or {}).get("histogram", 0) or 0

    if price > sma50 > sma200 and macd_hist > 0:
        summaries["trend"] = "bullish"
    elif price < sma50 < sma200 and macd_hist < 0:
        summaries["trend"] = "bearish"
    elif price > sma200:
        summaries["trend"] = "neutral-bullish"
    else:
        summaries["trend"] = "neutral-bearish"

    # Momentum
    rsi = indicators.get("rsi", 50) or 50
    if rsi > 70:
        summaries["momentum"] = "overbought"
    elif rsi < 30:
        summaries["momentum"] = "oversold"
    elif rsi > 55:
        summaries["momentum"] = "bullish"
    elif rsi < 45:
        summaries["momentum"] = "bearish"
    else:
        summaries["momentum"] = "neutral"

    # Volatility
    atr = indicators.get("atr", 0) or 0
    if price > 0 and atr > 0:
        atr_pct = atr / price * 100
        if atr_pct > 3:
            summaries["volatility"] = "high"
        elif atr_pct > 1.5:
            summaries["volatility"] = "normal"
        else:
            summaries["volatility"] = "low"
    else:
        summaries["volatility"] = "normal"

    return summaries


# ─── Indicator Computation Functions ───


def _sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period).mean()


def _ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def _macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = _ema(series, fast)
    ema_slow = _ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def _rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _stochastic(high: pd.Series, low: pd.Series, close: pd.Series,
                k_period: int = 14, k_smooth: int = 3, d_smooth: int = 3):
    lowest_low = low.rolling(window=k_period).min()
    highest_high = high.rolling(window=k_period).max()
    denom = highest_high - lowest_low
    raw_k = 100 * (close - lowest_low) / denom.replace(0, np.nan)
    k = raw_k.rolling(window=k_smooth).mean()
    d = k.rolling(window=d_smooth).mean()
    return k, d


def _williams_r(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    highest_high = high.rolling(window=period).max()
    lowest_low = low.rolling(window=period).min()
    denom = highest_high - lowest_low
    return -100 * (highest_high - close) / denom.replace(0, np.nan)


def _bollinger_bands(series: pd.Series, period: int = 20, std_dev: float = 2.0):
    middle = _sma(series, period)
    rolling_std = series.rolling(window=period).std()
    upper = middle + (rolling_std * std_dev)
    lower = middle - (rolling_std * std_dev)
    return upper, middle, lower


def _atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()


def _adx(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    plus_dm = high.diff()
    minus_dm = -low.diff()
    plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0.0)
    minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0.0)

    atr_vals = _atr(high, low, close, period)
    atr_safe = atr_vals.replace(0, np.nan)

    plus_di = 100 * _ema(plus_dm, period) / atr_safe
    minus_di = 100 * _ema(minus_dm, period) / atr_safe

    dx_denom = (plus_di + minus_di).replace(0, np.nan)
    dx = 100 * (plus_di - minus_di).abs() / dx_denom
    return _ema(dx, period)


def _obv(close: pd.Series, volume: pd.Series) -> pd.Series:
    direction = np.sign(close.diff())
    direction.iloc[0] = 0
    return (volume * direction).cumsum()


def _vwap(high: pd.Series, low: pd.Series, close: pd.Series, volume: pd.Series) -> pd.Series:
    typical_price = (high + low + close) / 3
    cumulative_tpv = (typical_price * volume).cumsum()
    cumulative_vol = volume.cumsum()
    return cumulative_tpv / cumulative_vol.replace(0, np.nan)


def _fibonacci_levels(high: pd.Series, low: pd.Series, window: int = 60) -> dict:
    """Compute Fibonacci retracement levels from swing high/low in the last N candles."""
    if len(high) < window:
        return {}

    recent_high = high.tail(window)
    recent_low = low.tail(window)

    swing_high = float(recent_high.max())
    swing_low = float(recent_low.min())
    diff = swing_high - swing_low

    if diff <= 0:
        return {}

    return {
        "swingHigh": round(swing_high, 2),
        "swingLow": round(swing_low, 2),
        "level_23_6": round(swing_high - diff * 0.236, 2),
        "level_38_2": round(swing_high - diff * 0.382, 2),
        "level_50": round(swing_high - diff * 0.5, 2),
        "level_61_8": round(swing_high - diff * 0.618, 2),
        "level_78_6": round(swing_high - diff * 0.786, 2),
    }


def _safe_last(series) -> Optional[float]:
    """Get the last non-NaN value from a pandas Series, or None."""
    if series is None:
        return None
    if isinstance(series, (int, float)):
        return round(float(series), 4) if not np.isnan(series) else None
    try:
        val = series.dropna().iloc[-1]
        return round(float(val), 4) if not np.isnan(val) else None
    except (IndexError, TypeError):
        return None

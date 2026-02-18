"""Technical Indicator Engine — pure Python, no numpy/pandas.

Computes technical indicators from OHLCV candle data:
  Trend:      SMA(20), SMA(50), SMA(200), EMA(12), EMA(26), MACD(12,26,9), ADX(14)
  Momentum:   RSI(14), Stochastic(14,3,3), Williams %R(14)
  Volatility: Bollinger Bands(20,2), ATR(14)
  Volume:     OBV

Returns all indicator values plus a composite technical score (1-10).
"""

import math
import logging

logger = logging.getLogger(__name__)


def compute_indicators(candles):
    """Compute all technical indicators from OHLCV candle list.

    Args:
        candles: List of {date, open, high, low, close, volume} dicts,
                 sorted oldest-first.

    Returns:
        Dict with indicator values, signal summaries, and technicalScore.
    """
    if not candles or len(candles) < 50:
        return {"error": "Insufficient data (need >= 50 candles)", "indicatorCount": 0}

    closes = [float(c["close"]) for c in candles]
    highs = [float(c["high"]) for c in candles]
    lows = [float(c["low"]) for c in candles]
    volumes = [int(c.get("volume", 0)) for c in candles]

    latest = closes[-1]
    result = {}

    # ─── Trend ───

    sma20 = _sma(closes, 20)
    sma50 = _sma(closes, 50)
    sma200 = _sma(closes, 200)
    ema12 = _ema(closes, 12)
    ema26 = _ema(closes, 26)

    result["sma20"] = _r(sma20)
    result["sma50"] = _r(sma50)
    result["sma200"] = _r(sma200)
    result["ema12"] = _r(ema12)
    result["ema26"] = _r(ema26)

    # MACD
    macd_val, macd_signal, macd_hist = _macd(closes, 12, 26, 9)
    result["macd"] = {
        "value": _r(macd_val),
        "signal": _r(macd_signal),
        "histogram": _r(macd_hist),
    }

    # ADX
    adx = _adx(highs, lows, closes, 14)
    result["adx"] = _r(adx)

    # ─── Momentum ───

    rsi = _rsi(closes, 14)
    result["rsi"] = _r(rsi)

    stoch_k, stoch_d = _stochastic(highs, lows, closes, 14, 3)
    result["stochastic"] = {"k": _r(stoch_k), "d": _r(stoch_d)}

    williams = _williams_r(highs, lows, closes, 14)
    result["williamsR"] = _r(williams)

    # ─── Volatility ───

    bb_upper, bb_middle, bb_lower = _bollinger_bands(closes, 20, 2)
    result["bollingerBands"] = {
        "upper": _r(bb_upper),
        "middle": _r(bb_middle),
        "lower": _r(bb_lower),
    }

    atr = _atr(highs, lows, closes, 14)
    result["atr"] = _r(atr)

    # ─── Volume ───

    obv = _obv(closes, volumes)
    result["obv"] = obv

    # ─── Signals & Score ───

    signals = _generate_signals(latest, sma20, sma50, sma200, rsi, macd_hist)
    result["signals"] = signals

    score = _compute_score(
        latest, sma20, sma50, sma200, rsi, macd_hist,
        stoch_k, williams, adx, atr, bb_upper, bb_lower,
    )
    result["technicalScore"] = score
    result["indicatorCount"] = 13

    return result


# ─── Helpers ───

def _r(v):
    """Round to 2 decimals, return None if None."""
    if v is None:
        return None
    return round(v, 2)


def _sma(data, period):
    """Simple Moving Average of the last `period` values."""
    if len(data) < period:
        return None
    return sum(data[-period:]) / period


def _ema(data, period):
    """Exponential Moving Average."""
    if len(data) < period:
        return None
    multiplier = 2.0 / (period + 1)
    ema = sum(data[:period]) / period  # SMA seed
    for val in data[period:]:
        ema = (val - ema) * multiplier + ema
    return ema


def _ema_series(data, period):
    """Return full EMA series (list) for every point after initial SMA seed."""
    if len(data) < period:
        return []
    multiplier = 2.0 / (period + 1)
    ema = sum(data[:period]) / period
    series = [ema]
    for val in data[period:]:
        ema = (val - ema) * multiplier + ema
        series.append(ema)
    return series


def _macd(closes, fast=12, slow=26, signal_period=9):
    """MACD line, signal line, histogram."""
    if len(closes) < slow + signal_period:
        return None, None, None

    ema_fast = _ema_series(closes, fast)
    ema_slow = _ema_series(closes, slow)

    # Align: ema_fast starts at index `fast`, ema_slow at index `slow`
    # We need to align them to the same time range
    offset = slow - fast
    if offset > len(ema_fast):
        return None, None, None

    macd_line = []
    for i in range(len(ema_slow)):
        f_idx = i + offset
        if f_idx < len(ema_fast):
            macd_line.append(ema_fast[f_idx] - ema_slow[i])

    if len(macd_line) < signal_period:
        return None, None, None

    signal_line = _ema_series(macd_line, signal_period)
    if not signal_line:
        return macd_line[-1] if macd_line else None, None, None

    macd_val = macd_line[-1]
    sig_val = signal_line[-1]
    hist_val = macd_val - sig_val

    return macd_val, sig_val, hist_val


def _rsi(closes, period=14):
    """Relative Strength Index."""
    if len(closes) < period + 1:
        return None

    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]

    gains = [d if d > 0 else 0 for d in deltas[:period]]
    losses = [-d if d < 0 else 0 for d in deltas[:period]]

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    for d in deltas[period:]:
        gain = d if d > 0 else 0
        loss = -d if d < 0 else 0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def _stochastic(highs, lows, closes, k_period=14, d_period=3):
    """%K and %D of Stochastic Oscillator."""
    if len(closes) < k_period + d_period:
        return None, None

    k_values = []
    for i in range(k_period - 1, len(closes)):
        window_highs = highs[i - k_period + 1: i + 1]
        window_lows = lows[i - k_period + 1: i + 1]
        highest = max(window_highs)
        lowest = min(window_lows)
        if highest == lowest:
            k_values.append(50.0)
        else:
            k_values.append(((closes[i] - lowest) / (highest - lowest)) * 100)

    if len(k_values) < d_period:
        return k_values[-1] if k_values else None, None

    # %D is SMA of %K
    d_val = sum(k_values[-d_period:]) / d_period
    return k_values[-1], d_val


def _williams_r(highs, lows, closes, period=14):
    """Williams %R."""
    if len(closes) < period:
        return None
    highest = max(highs[-period:])
    lowest = min(lows[-period:])
    if highest == lowest:
        return -50.0
    return ((highest - closes[-1]) / (highest - lowest)) * -100


def _bollinger_bands(closes, period=20, num_std=2):
    """Bollinger Bands (upper, middle, lower)."""
    if len(closes) < period:
        return None, None, None
    window = closes[-period:]
    middle = sum(window) / period
    variance = sum((x - middle) ** 2 for x in window) / period
    std = math.sqrt(variance)
    return middle + num_std * std, middle, middle - num_std * std


def _atr(highs, lows, closes, period=14):
    """Average True Range."""
    if len(closes) < period + 1:
        return None

    true_ranges = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        true_ranges.append(tr)

    if len(true_ranges) < period:
        return None

    # Wilder's smoothing
    atr = sum(true_ranges[:period]) / period
    for tr in true_ranges[period:]:
        atr = (atr * (period - 1) + tr) / period
    return atr


def _adx(highs, lows, closes, period=14):
    """Average Directional Index."""
    if len(closes) < period * 2 + 1:
        return None

    plus_dm = []
    minus_dm = []
    tr_list = []

    for i in range(1, len(closes)):
        up_move = highs[i] - highs[i - 1]
        down_move = lows[i - 1] - lows[i]

        plus_dm.append(up_move if (up_move > down_move and up_move > 0) else 0)
        minus_dm.append(down_move if (down_move > up_move and down_move > 0) else 0)

        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        tr_list.append(tr)

    if len(tr_list) < period:
        return None

    # Wilder's smoothing for +DM, -DM, TR
    smoothed_plus = sum(plus_dm[:period])
    smoothed_minus = sum(minus_dm[:period])
    smoothed_tr = sum(tr_list[:period])

    dx_values = []
    for i in range(period, len(tr_list)):
        smoothed_plus = smoothed_plus - (smoothed_plus / period) + plus_dm[i]
        smoothed_minus = smoothed_minus - (smoothed_minus / period) + minus_dm[i]
        smoothed_tr = smoothed_tr - (smoothed_tr / period) + tr_list[i]

        if smoothed_tr == 0:
            dx_values.append(0)
            continue

        plus_di = (smoothed_plus / smoothed_tr) * 100
        minus_di = (smoothed_minus / smoothed_tr) * 100

        di_sum = plus_di + minus_di
        if di_sum == 0:
            dx_values.append(0)
        else:
            dx_values.append(abs(plus_di - minus_di) / di_sum * 100)

    if len(dx_values) < period:
        return sum(dx_values) / len(dx_values) if dx_values else None

    # ADX = smoothed average of DX
    adx = sum(dx_values[:period]) / period
    for dx in dx_values[period:]:
        adx = (adx * (period - 1) + dx) / period
    return adx


def _obv(closes, volumes):
    """On-Balance Volume (latest value)."""
    if len(closes) < 2:
        return 0
    obv = 0
    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            obv += volumes[i]
        elif closes[i] < closes[i - 1]:
            obv -= volumes[i]
    return obv


# ─── Signal Generation & Scoring ───

def _generate_signals(price, sma20, sma50, sma200, rsi, macd_hist):
    """Generate human-readable signal labels."""
    signals = {}

    # Trend signal
    if sma20 and sma50 and sma200:
        if price > sma20 > sma50 > sma200:
            signals["trend"] = "strong bullish"
        elif price > sma50 > sma200:
            signals["trend"] = "bullish"
        elif price < sma20 < sma50 < sma200:
            signals["trend"] = "strong bearish"
        elif price < sma50 < sma200:
            signals["trend"] = "bearish"
        elif price > sma200:
            signals["trend"] = "neutral-bullish"
        else:
            signals["trend"] = "neutral-bearish"
    elif sma50:
        signals["trend"] = "bullish" if price > sma50 else "bearish"

    # Momentum signal
    if rsi is not None:
        if rsi >= 70:
            signals["momentum"] = "overbought"
        elif rsi <= 30:
            signals["momentum"] = "oversold"
        elif rsi >= 60:
            signals["momentum"] = "strong"
        elif rsi <= 40:
            signals["momentum"] = "weak"
        else:
            signals["momentum"] = "neutral"

    # Volatility / MACD signal
    if macd_hist is not None:
        if macd_hist > 0:
            signals["volatility"] = "expanding"
        else:
            signals["volatility"] = "contracting"

    return signals


def _compute_score(price, sma20, sma50, sma200, rsi, macd_hist,
                   stoch_k, williams, adx, atr, bb_upper, bb_lower):
    """Composite technical score (1-10).

    Weighted: Trend 30%, Momentum 25%, Volume/Strength 20%, Volatility 15%, Pattern 10%.
    """
    points = []
    weights = []

    # Trend component (30%)
    trend_score = 5.0
    if sma20 and sma50 and sma200 and price:
        above_count = sum([
            1 if price > sma20 else -1,
            1 if price > sma50 else -1,
            1 if price > sma200 else -1,
            1 if sma20 > sma50 else -1,
            1 if sma50 > sma200 else -1,
        ])
        trend_score = 5.0 + above_count  # range 0-10
        trend_score = max(1.0, min(10.0, trend_score))
    points.append(trend_score)
    weights.append(0.30)

    # Momentum component (25%) — based on RSI
    momentum_score = 5.0
    if rsi is not None:
        if rsi >= 70:
            momentum_score = 3.0  # overbought = caution
        elif rsi <= 30:
            momentum_score = 7.0  # oversold = opportunity
        else:
            # Linear scale: RSI 30->7, RSI 50->5, RSI 70->3
            momentum_score = 7.0 - ((rsi - 30) / 40) * 4.0
        momentum_score = max(1.0, min(10.0, momentum_score))
    points.append(momentum_score)
    weights.append(0.25)

    # MACD strength (20%)
    macd_score = 5.0
    if macd_hist is not None:
        if macd_hist > 0:
            macd_score = min(8.0, 5.0 + macd_hist * 10)
        else:
            macd_score = max(2.0, 5.0 + macd_hist * 10)
    points.append(macd_score)
    weights.append(0.20)

    # Volatility / ADX (15%)
    vol_score = 5.0
    if adx is not None:
        if adx > 40:
            vol_score = 8.0  # Strong trend
        elif adx > 25:
            vol_score = 6.0  # Moderate trend
        elif adx > 15:
            vol_score = 4.0  # Weak trend
        else:
            vol_score = 3.0  # No trend
    points.append(vol_score)
    weights.append(0.15)

    # Bollinger position (10%)
    bb_score = 5.0
    if bb_upper and bb_lower and price:
        bb_range = bb_upper - bb_lower
        if bb_range > 0:
            position = (price - bb_lower) / bb_range
            if position > 0.9:
                bb_score = 3.0  # Near upper band, overbought
            elif position < 0.1:
                bb_score = 7.0  # Near lower band, opportunity
            else:
                bb_score = 5.0 + (0.5 - position) * 4  # Center = 5
    points.append(bb_score)
    weights.append(0.10)

    # Weighted average
    total = sum(p * w for p, w in zip(points, weights))
    total_weight = sum(weights)
    score = total / total_weight if total_weight > 0 else 5.0

    return round(max(1.0, min(10.0, score)), 1)

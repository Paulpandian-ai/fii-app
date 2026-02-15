"""Market data fetcher using yfinance and FRED.

Provides Yahoo Finance stock data, FRED macro indicators,
correlation matrices, and relative performance metrics.
"""

import logging
import os
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


# ─── FRED Macro Data ───

FRED_SERIES = {
    "FEDFUNDS": "Fed Funds Rate",
    "CPIAUCSL": "CPI (All Urban)",
    "GS10": "10-Year Treasury",
    "UNRATE": "Unemployment Rate",
    "GDP": "GDP",
    "T10Y2Y": "10Y-2Y Spread (Yield Curve)",
}


def get_fred_macro_data() -> dict:
    """Fetch key macro indicators from FRED and compute scores.

    Pulls: FEDFUNDS, CPIAUCSL, GS10, UNRATE, GDP, T10Y2Y.
    Calculates 3-month trend and scores each indicator.

    Returns:
        Dict with indicators, trends, and macro scores for D1-D3.
    """
    try:
        from fredapi import Fred
        import boto3

        # Get FRED API key from Secrets Manager
        fred_key = _get_fred_api_key()
        fred = Fred(api_key=fred_key)

        indicators = {}
        for series_id, name in FRED_SERIES.items():
            try:
                data = fred.get_series(series_id, observation_start="2024-01-01")
                if data is not None and len(data) > 0:
                    current = float(data.iloc[-1])
                    # 3-month trend: compare latest to ~3 months ago
                    lookback = min(len(data), 3 if series_id == "GDP" else 90)
                    past = float(data.iloc[-lookback]) if len(data) >= lookback else current
                    change = current - past
                    pct_change = (change / abs(past) * 100) if past != 0 else 0

                    if abs(pct_change) < 2:
                        trend = "stable"
                    elif pct_change > 0:
                        trend = "rising"
                    else:
                        trend = "falling"

                    indicators[series_id] = {
                        "name": name,
                        "current": round(current, 4),
                        "past": round(past, 4),
                        "change": round(change, 4),
                        "pct_change": round(pct_change, 2),
                        "trend": trend,
                    }
            except Exception as e:
                logger.warning(f"[FRED] Failed to fetch {series_id}: {e}")

        # Score monetary factors D1-D3
        macro_scores = _score_macro_factors(indicators)

        return {
            "indicators": indicators,
            "scores": macro_scores,
        }

    except Exception as e:
        logger.error(f"[FRED] Failed to fetch macro data: {e}")
        return {"indicators": {}, "scores": {}}


def _score_macro_factors(indicators: dict) -> dict:
    """Score monetary factors D1-D3 from FRED data.

    D1 (Fed Decisions): Rising rate = -1 (hurts growth), falling = +1
    D2 (CPI/Inflation): CPI > 3% = -1, < 2.5% = +1
    D3 (10Y Treasury): Rising = -1 (tightening), falling = +1
    """
    scores = {}

    # D1: Fed Funds Rate
    ff = indicators.get("FEDFUNDS", {})
    if ff:
        if ff["trend"] == "rising":
            scores["D1"] = -1.0
        elif ff["trend"] == "falling":
            scores["D1"] = 1.0
        else:
            scores["D1"] = 0.0
    else:
        scores["D1"] = 0.0

    # D2: CPI/Inflation
    cpi = indicators.get("CPIAUCSL", {})
    if cpi:
        # CPIAUCSL is an index, compute YoY change
        yoy_pct = cpi.get("pct_change", 0)
        if yoy_pct > 3:
            scores["D2"] = -1.0
        elif yoy_pct < 2.5:
            scores["D2"] = 1.0
        else:
            scores["D2"] = 0.0
    else:
        scores["D2"] = 0.0

    # D3: 10Y Treasury Yield
    gs10 = indicators.get("GS10", {})
    if gs10:
        if gs10["trend"] == "rising":
            scores["D3"] = -1.0
        elif gs10["trend"] == "falling":
            scores["D3"] = 1.0
        else:
            scores["D3"] = 0.0
    else:
        scores["D3"] = 0.0

    return scores


def _get_fred_api_key() -> str:
    """Retrieve FRED API key from Secrets Manager."""
    import boto3

    arn = os.environ.get("FRED_API_KEY_ARN", "")
    client = boto3.client("secretsmanager")
    response = client.get_secret_value(SecretId=arn)
    return response["SecretString"]


# ─── Yahoo Finance Data ───

def get_yahoo_finance_data(ticker: str) -> dict:
    """Fetch market data from Yahoo Finance.

    Pulls: current price, 52-week range, market cap, last earnings
    surprise %, beta, forward PE.

    Args:
        ticker: Stock ticker symbol.

    Returns:
        Dict with market data metrics.
    """
    try:
        import yfinance as yf

        stock = yf.Ticker(ticker)
        info = stock.info or {}

        # Current price
        current_price = info.get("currentPrice") or info.get("regularMarketPrice", 0)

        # 52-week range
        fifty_two_week_low = info.get("fiftyTwoWeekLow", 0)
        fifty_two_week_high = info.get("fiftyTwoWeekHigh", 0)

        # Position in 52-week range (0 = at low, 1 = at high)
        if fifty_two_week_high > fifty_two_week_low:
            range_position = (current_price - fifty_two_week_low) / (
                fifty_two_week_high - fifty_two_week_low
            )
        else:
            range_position = 0.5

        # Market cap
        market_cap = info.get("marketCap", 0)

        # Earnings surprise
        try:
            earnings = stock.earnings_history
            if earnings is not None and len(earnings) > 0:
                last_row = earnings.iloc[-1]
                eps_actual = last_row.get("epsActual", 0)
                eps_estimate = last_row.get("epsEstimate", 0)
                if eps_estimate != 0:
                    earnings_surprise_pct = ((eps_actual - eps_estimate) / abs(eps_estimate)) * 100
                else:
                    earnings_surprise_pct = 0
            else:
                earnings_surprise_pct = 0
        except Exception:
            earnings_surprise_pct = 0

        # Beta
        beta = info.get("beta", 1.0)

        # Forward PE
        forward_pe = info.get("forwardPE", 0)

        # 30-day return vs SPY
        relative_return = get_30d_relative_return(ticker)

        return {
            "ticker": ticker,
            "current_price": round(current_price, 2),
            "fifty_two_week_low": round(fifty_two_week_low, 2),
            "fifty_two_week_high": round(fifty_two_week_high, 2),
            "range_position": round(range_position, 4),
            "market_cap": market_cap,
            "earnings_surprise_pct": round(earnings_surprise_pct, 2),
            "beta": round(beta or 1.0, 4),
            "forward_pe": round(forward_pe or 0, 2),
            "relative_return_30d": round(relative_return, 4),
        }

    except Exception as e:
        logger.error(f"[YF] Failed to fetch data for {ticker}: {e}")
        return {
            "ticker": ticker,
            "current_price": 0,
            "fifty_two_week_low": 0,
            "fifty_two_week_high": 0,
            "range_position": 0.5,
            "market_cap": 0,
            "earnings_surprise_pct": 0,
            "beta": 1.0,
            "forward_pe": 0,
            "relative_return_30d": 0,
        }


def get_correlation_matrix(ticker: str, peers: list[str]) -> dict:
    """Compute 90-day correlation matrix for ticker vs benchmarks and peers.

    Calculates correlations against: SPY, sector ETF, top 3 peers,
    GLD, USO, BTC-USD.

    Args:
        ticker: Target stock ticker.
        peers: List of peer ticker symbols.

    Returns:
        Dict with correlation values and derived scores.
    """
    try:
        import yfinance as yf
        from models import SECTOR_ETF_MAP

        sector_etf = SECTOR_ETF_MAP.get(ticker, "XLK")
        comparison_tickers = [ticker, "SPY", sector_etf] + peers[:3] + ["GLD", "USO", "BTC-USD"]

        # Remove duplicates while preserving order
        seen = set()
        unique_tickers = []
        for t in comparison_tickers:
            if t not in seen:
                seen.add(t)
                unique_tickers.append(t)

        # Download 90 days of closing prices
        data = yf.download(unique_tickers, period="3mo", progress=False)

        if data.empty:
            return {"correlations": {}, "scores": {}}

        # Get closing prices
        close = data["Close"] if "Close" in data.columns else data
        if isinstance(close, np.ndarray):
            return {"correlations": {}, "scores": {}}

        # Calculate daily returns
        returns = close.pct_change().dropna()

        if ticker not in returns.columns:
            return {"correlations": {}, "scores": {}}

        # Compute correlations with target ticker
        correlations = {}
        for col in returns.columns:
            if col != ticker:
                corr = returns[ticker].corr(returns[col])
                correlations[col] = round(float(corr), 4) if not np.isnan(corr) else 0.0

        # Score correlation factors E1-E3
        scores = _score_correlation_factors(correlations, sector_etf, peers)

        return {
            "correlations": correlations,
            "sector_etf": sector_etf,
            "scores": scores,
        }

    except Exception as e:
        logger.error(f"[YF] Failed to compute correlations for {ticker}: {e}")
        return {"correlations": {}, "scores": {}}


def _score_correlation_factors(
    correlations: dict, sector_etf: str, peers: list[str]
) -> dict:
    """Score correlation factors E1-E3.

    E1 (Sector Peers): High peer correlation with weak peers = negative
    E2 (Commodity Link): High commodity correlation = risk exposure
    E3 (Risk Sentiment): Low SPY correlation = potential diversifier (+), very high = beta risk (-)
    """
    scores = {}

    # E1: Sector peer correlation (high correlation = move together)
    peer_corrs = [correlations.get(p, 0) for p in peers[:3] if p in correlations]
    avg_peer_corr = sum(peer_corrs) / len(peer_corrs) if peer_corrs else 0
    # Neutral — Claude will contextualize with peer performance
    scores["E1"] = 0.0

    # E2: Commodity correlation
    commodity_corrs = [abs(correlations.get(c, 0)) for c in ["GLD", "USO", "BTC-USD"] if c in correlations]
    avg_commodity = sum(commodity_corrs) / len(commodity_corrs) if commodity_corrs else 0
    if avg_commodity > 0.5:
        scores["E2"] = -1.0  # High commodity exposure
    elif avg_commodity < 0.2:
        scores["E2"] = 1.0   # Low commodity risk
    else:
        scores["E2"] = 0.0

    # E3: Risk sentiment (SPY correlation)
    spy_corr = correlations.get("SPY", 0.5)
    if spy_corr > 0.85:
        scores["E3"] = -0.5  # Very high beta risk
    elif spy_corr < 0.3:
        scores["E3"] = 0.5   # Diversifier
    else:
        scores["E3"] = 0.0

    return scores


def get_30d_relative_return(ticker: str) -> float:
    """Calculate 30-day return of ticker relative to SPY.

    Returns:
        Relative return as a decimal (e.g., 0.05 = 5% outperformance).
    """
    try:
        import yfinance as yf

        data = yf.download([ticker, "SPY"], period="1mo", progress=False)

        if data.empty:
            return 0.0

        close = data["Close"]
        if ticker not in close.columns or "SPY" not in close.columns:
            return 0.0

        ticker_return = (close[ticker].iloc[-1] / close[ticker].iloc[0]) - 1
        spy_return = (close["SPY"].iloc[-1] / close["SPY"].iloc[0]) - 1

        return float(ticker_return - spy_return)

    except Exception as e:
        logger.debug(f"[YF] Failed to compute relative return for {ticker}: {e}")
        return 0.0


def get_price_history(ticker: str, period: str = "1y") -> dict:
    """Fetch historical price data for a ticker.

    Args:
        ticker: Stock ticker symbol.
        period: Time period (e.g., "1y", "6mo", "3mo").

    Returns:
        Dict with dates, prices, volumes.
    """
    try:
        import yfinance as yf

        stock = yf.Ticker(ticker)
        hist = stock.history(period=period)

        return {
            "ticker": ticker,
            "period": period,
            "prices": [
                {
                    "date": str(date.date()),
                    "open": round(row["Open"], 2),
                    "high": round(row["High"], 2),
                    "low": round(row["Low"], 2),
                    "close": round(row["Close"], 2),
                    "volume": int(row["Volume"]),
                }
                for date, row in hist.iterrows()
            ],
        }

    except Exception as e:
        logger.error(f"[YF] Failed to fetch price history for {ticker}: {e}")
        return {"ticker": ticker, "period": period, "prices": []}


def get_fundamentals(ticker: str) -> dict:
    """Fetch fundamental data (PE, revenue, margins, etc.)."""
    try:
        import yfinance as yf

        stock = yf.Ticker(ticker)
        info = stock.info or {}

        return {
            "ticker": ticker,
            "fundamentals": {
                "market_cap": info.get("marketCap", 0),
                "pe_ratio": info.get("trailingPE", 0),
                "forward_pe": info.get("forwardPE", 0),
                "peg_ratio": info.get("pegRatio", 0),
                "profit_margin": info.get("profitMargins", 0),
                "revenue_growth": info.get("revenueGrowth", 0),
                "debt_to_equity": info.get("debtToEquity", 0),
                "return_on_equity": info.get("returnOnEquity", 0),
            },
        }

    except Exception as e:
        logger.error(f"[YF] Failed to fetch fundamentals for {ticker}: {e}")
        return {"ticker": ticker, "fundamentals": {}}


def get_macro_indicators() -> dict:
    """Fetch key macro indicators from FRED (convenience wrapper)."""
    return get_fred_macro_data()

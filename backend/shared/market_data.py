"""Market data fetcher using Finnhub and FRED.

Provides Finnhub stock data, FRED macro indicators,
correlation matrices, and relative performance metrics.
yfinance has been replaced with Finnhub free-tier API.
"""

import logging
import os
from typing import Optional

import numpy as np
import pandas as pd

import finnhub_client

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


# ─── Finnhub Market Data ───

def get_yahoo_finance_data(ticker: str) -> dict:
    """Fetch market data from Finnhub (replaces yfinance).

    Kept as get_yahoo_finance_data() for backward compatibility with
    the signal engine which calls this function by name.

    Returns:
        Dict with market data metrics.
    """
    return finnhub_client.get_market_data_for_signal(ticker)


def get_correlation_matrix(ticker: str, peers: list[str]) -> dict:
    """Compute 90-day correlation matrix for ticker vs benchmarks and peers.

    Uses Finnhub candles to compute daily return correlations against:
    SPY, sector ETF, top 3 peers, GLD, USO.

    Note: BTC-USD is not available on Finnhub free tier, omitted.
    """
    try:
        from datetime import datetime, timezone
        from models import SECTOR_ETF_MAP

        sector_etf = SECTOR_ETF_MAP.get(ticker, "XLK")
        comparison_tickers = [ticker, "SPY", sector_etf] + peers[:3] + ["GLD", "USO"]

        # Remove duplicates while preserving order
        seen = set()
        unique_tickers = []
        for t in comparison_tickers:
            if t not in seen:
                seen.add(t)
                unique_tickers.append(t)

        # Fetch 90 days of candles from Finnhub
        now = int(datetime.now(timezone.utc).timestamp())
        from_ts = now - (90 * 24 * 3600)

        close_data = {}
        for t in unique_tickers:
            candles = finnhub_client.get_candles(t, resolution="D", from_ts=from_ts, to_ts=now)
            if candles:
                series = {c["date"]: c["close"] for c in candles}
                close_data[t] = series

        if ticker not in close_data or len(close_data) < 2:
            return {"correlations": {}, "scores": {}}

        # Build DataFrame from close prices
        df = pd.DataFrame(close_data).sort_index()
        df = df.dropna(how="all")

        # Calculate daily returns
        returns = df.pct_change().dropna()

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
        logger.error(f"[Finnhub] Failed to compute correlations for {ticker}: {e}")
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
    """Calculate 30-day return of ticker relative to SPY using Finnhub."""
    try:
        from datetime import datetime, timezone

        now = int(datetime.now(timezone.utc).timestamp())
        from_ts = now - (30 * 24 * 3600)

        ticker_candles = finnhub_client.get_candles(ticker, resolution="D", from_ts=from_ts, to_ts=now)
        spy_candles = finnhub_client.get_candles("SPY", resolution="D", from_ts=from_ts, to_ts=now)

        if not ticker_candles or not spy_candles:
            return 0.0

        ticker_return = (ticker_candles[-1]["close"] / ticker_candles[0]["close"]) - 1
        spy_return = (spy_candles[-1]["close"] / spy_candles[0]["close"]) - 1

        return round(float(ticker_return - spy_return), 4)

    except Exception as e:
        logger.debug(f"[Finnhub] Failed to compute relative return for {ticker}: {e}")
        return 0.0


def get_price_history(ticker: str, period: str = "1y") -> dict:
    """Fetch historical price data from Finnhub candles.

    Args:
        ticker: Stock ticker symbol.
        period: Time period (e.g., "1y", "6mo", "3mo").
    """
    try:
        from datetime import datetime, timezone

        period_map = {"1y": 365, "6mo": 180, "3mo": 90, "1mo": 30}
        days = period_map.get(period, 365)

        now = int(datetime.now(timezone.utc).timestamp())
        from_ts = now - (days * 24 * 3600)

        candles = finnhub_client.get_candles(ticker, resolution="D", from_ts=from_ts, to_ts=now)

        return {
            "ticker": ticker,
            "period": period,
            "prices": candles or [],
        }

    except Exception as e:
        logger.error(f"[Finnhub] Failed to fetch price history for {ticker}: {e}")
        return {"ticker": ticker, "period": period, "prices": []}


def get_fundamentals(ticker: str) -> dict:
    """Fetch fundamental data from Finnhub."""
    try:
        financials = finnhub_client.get_basic_financials(ticker)

        return {
            "ticker": ticker,
            "fundamentals": {
                "market_cap": 0,  # Not in basic financials; use profile if needed
                "pe_ratio": financials.get("peRatio", 0),
                "forward_pe": financials.get("forwardPE", 0),
                "profit_margin": financials.get("profitMargin", 0),
                "revenue_growth": financials.get("revenueGrowthTTM", 0),
                "debt_to_equity": financials.get("debtEquity", 0),
                "return_on_equity": financials.get("roeTTM", 0),
            },
        }

    except Exception as e:
        logger.error(f"[Finnhub] Failed to fetch fundamentals for {ticker}: {e}")
        return {"ticker": ticker, "fundamentals": {}}


def get_macro_indicators() -> dict:
    """Fetch key macro indicators from FRED (convenience wrapper)."""
    return get_fred_macro_data()

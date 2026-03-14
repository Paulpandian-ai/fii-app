"""Portfolio Analytics Engine for FII.

Institutional-grade portfolio analytics including Sharpe ratio, Sortino ratio,
max drawdown, diversification scoring, Value at Risk, Monte Carlo simulation,
portfolio beta, and sector breakdown.

Functions:
  - compute_portfolio_analytics(holdings) — All core metrics
  - run_monte_carlo(holdings, num_simulations, months) — Monte Carlo projection
"""

import logging
import math
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# S&P 500 approximate sector weights (as of 2025)
SP500_SECTOR_WEIGHTS = {
    "Information Technology": 32.0,
    "Health Care": 12.0,
    "Financials": 13.0,
    "Consumer Discretionary": 10.0,
    "Communication Services": 9.0,
    "Industrials": 9.0,
    "Consumer Staples": 6.0,
    "Energy": 4.0,
    "Utilities": 2.5,
    "Real Estate": 2.0,
    "Materials": 2.5,
}

DISCLAIMER = "For educational purposes only. Not investment advice."


def _get_sector(ticker: str) -> str:
    """Get GICS sector for a ticker from models.py."""
    try:
        from models import STOCK_SECTORS
        return STOCK_SECTORS.get(ticker, "Unknown")
    except ImportError:
        return "Unknown"


def _get_risk_free_rate() -> float:
    """Fetch 3-month Treasury rate from FRED as annualized decimal.

    Falls back to 5.0% if FRED is unavailable.
    """
    try:
        from fredapi import Fred
        import os
        fred_key = os.environ.get("FRED_API_KEY", "")
        if not fred_key:
            arn = os.environ.get("FRED_API_KEY_ARN", "")
            if arn:
                import boto3
                client = boto3.client("secretsmanager")
                resp = client.get_secret_value(SecretId=arn)
                fred_key = resp["SecretString"]
        if fred_key:
            fred = Fred(api_key=fred_key)
            data = fred.get_series("DGS3MO", observation_start="2024-01-01")
            data = data.dropna()
            if len(data) > 0:
                return float(data.iloc[-1]) / 100.0  # Convert % to decimal
    except Exception as e:
        logger.warning(f"[Analytics] Failed to get risk-free rate from FRED: {e}")
    return 0.05  # Default 5%


def _fetch_candles(ticker: str, days: int = 365) -> list[dict]:
    """Fetch daily candles from Finnhub."""
    try:
        import finnhub_client
        now = int(datetime.now(timezone.utc).timestamp())
        from_ts = now - (days * 24 * 3600)
        return finnhub_client.get_candles(ticker, resolution="D", from_ts=from_ts, to_ts=now)
    except Exception as e:
        logger.warning(f"[Analytics] Failed to fetch candles for {ticker}: {e}")
        return []


def _fetch_beta(ticker: str) -> float:
    """Get beta from Finnhub basic financials."""
    try:
        import finnhub_client
        metrics = finnhub_client.get_basic_financials(ticker)
        beta = metrics.get("beta")
        if beta is not None:
            return float(beta)
    except Exception as e:
        logger.warning(f"[Analytics] Failed to fetch beta for {ticker}: {e}")
    return 1.0


def _daily_returns_from_candles(candles: list[dict]) -> list[float]:
    """Compute daily returns from candle close prices."""
    if len(candles) < 2:
        return []
    closes = [c["close"] for c in candles]
    returns = []
    for i in range(1, len(closes)):
        if closes[i - 1] > 0:
            returns.append((closes[i] - closes[i - 1]) / closes[i - 1])
    return returns


def _rate_sharpe(value: float) -> str:
    """Rate a Sharpe ratio value."""
    if value >= 1.5:
        return "Excellent"
    elif value >= 1.0:
        return "Strong"
    elif value >= 0.5:
        return "Good"
    elif value >= 0.0:
        return "Below Average"
    else:
        return "Poor"


def _rate_sortino(value: float) -> str:
    """Rate a Sortino ratio value."""
    if value >= 2.0:
        return "Excellent"
    elif value >= 1.5:
        return "Strong"
    elif value >= 1.0:
        return "Good"
    elif value >= 0.5:
        return "Below Average"
    else:
        return "Poor"


def _rate_diversification(score: float) -> str:
    """Rate diversification score."""
    if score >= 80:
        return "Well Diversified"
    elif score >= 60:
        return "Moderate"
    elif score >= 40:
        return "Concentrated"
    else:
        return "Highly Concentrated"


# ─── Core Metrics ───


def _compute_sharpe_ratio(
    portfolio_daily_returns: list[float],
    risk_free_rate: float,
) -> dict:
    """Compute annualized Sharpe ratio.

    Sharpe = (annualized_return - risk_free_rate) / annualized_volatility
    """
    if len(portfolio_daily_returns) < 30:
        return {"value": None, "error": "Insufficient return data (need 30+ days)"}

    n = len(portfolio_daily_returns)
    mean_daily = sum(portfolio_daily_returns) / n
    annualized_return = mean_daily * 252

    variance = sum((r - mean_daily) ** 2 for r in portfolio_daily_returns) / (n - 1)
    daily_vol = math.sqrt(variance)
    annualized_vol = daily_vol * math.sqrt(252)

    if annualized_vol == 0:
        return {"value": 0.0, "rating": "N/A", "benchmark": None}

    sharpe = (annualized_return - risk_free_rate) / annualized_vol

    return {
        "value": round(sharpe, 2),
        "rating": _rate_sharpe(sharpe),
        "annualized_return": round(annualized_return * 100, 2),
        "annualized_volatility": round(annualized_vol * 100, 2),
        "risk_free_rate": round(risk_free_rate * 100, 2),
    }


def _compute_sortino_ratio(
    portfolio_daily_returns: list[float],
    risk_free_rate: float,
    target: float = 0.0,
) -> dict:
    """Compute Sortino ratio using downside deviation."""
    if len(portfolio_daily_returns) < 30:
        return {"value": None, "error": "Insufficient return data"}

    n = len(portfolio_daily_returns)
    mean_daily = sum(portfolio_daily_returns) / n
    annualized_return = mean_daily * 252

    # Downside deviation: sqrt(sum(min(Ri - target, 0)^2) / n)
    downside_sq = [min(r - target, 0) ** 2 for r in portfolio_daily_returns]
    downside_dev_daily = math.sqrt(sum(downside_sq) / n)
    downside_dev_annual = downside_dev_daily * math.sqrt(252)

    if downside_dev_annual == 0:
        return {"value": 0.0, "rating": "N/A"}

    sortino = (annualized_return - risk_free_rate) / downside_dev_annual

    return {
        "value": round(sortino, 2),
        "rating": _rate_sortino(sortino),
    }


def _compute_max_drawdown(portfolio_daily_returns: list[float]) -> dict:
    """Compute maximum drawdown from daily returns."""
    if len(portfolio_daily_returns) < 2:
        return {"pct": 0, "start": None, "end": None}

    # Build cumulative wealth index
    cumulative = [1.0]
    for r in portfolio_daily_returns:
        cumulative.append(cumulative[-1] * (1 + r))

    peak = cumulative[0]
    max_dd = 0.0
    peak_idx = 0
    dd_start_idx = 0
    dd_end_idx = 0

    for i in range(1, len(cumulative)):
        if cumulative[i] > peak:
            peak = cumulative[i]
            peak_idx = i
        dd = (cumulative[i] - peak) / peak
        if dd < max_dd:
            max_dd = dd
            dd_start_idx = peak_idx
            dd_end_idx = i

    # Recovery: find when cumulative returns recovered to the peak after drawdown
    recovery_days = None
    if dd_end_idx < len(cumulative) - 1:
        for i in range(dd_end_idx, len(cumulative)):
            if cumulative[i] >= cumulative[dd_start_idx]:
                recovery_days = i - dd_end_idx
                break

    return {
        "pct": round(max_dd * 100, 2),
        "start_idx": dd_start_idx,
        "end_idx": dd_end_idx,
        "days_to_recover": recovery_days,
    }


def _compute_diversification_score(
    holdings: list[dict],
    weights: list[float],
    daily_returns_per_ticker: dict[str, list[float]],
) -> dict:
    """Compute composite diversification score (0-100).

    Components:
      a) Position HHI (30%)
      b) Sector HHI (30%)
      c) Avg pairwise correlation (20%)
      d) Holdings count bonus (20%)
    """
    n = len(holdings)
    if n == 0:
        return {"score": 0, "rating": "No Holdings", "recommendations": []}

    recommendations = []

    # a) Position HHI
    position_hhi = sum(w ** 2 for w in weights)
    position_score = max(0, 100 - position_hhi * 100)

    # b) Sector HHI
    sector_weights = defaultdict(float)
    for h, w in zip(holdings, weights):
        sector = _get_sector(h["ticker"])
        sector_weights[sector] += w

    sector_hhi = sum(sw ** 2 for sw in sector_weights.values())
    sector_score = max(0, 100 - sector_hhi * 100)

    # Generate sector recommendations
    for sector, sw in sorted(sector_weights.items(), key=lambda x: -x[1]):
        sp500_w = SP500_SECTOR_WEIGHTS.get(sector, 0)
        if sw * 100 > sp500_w * 1.5 and sp500_w > 0:
            recommendations.append(
                f"Portfolio is {sw * 100:.0f}% {sector} (S&P 500: {sp500_w:.0f}%)"
            )

    # Check for missing sectors
    covered_sectors = set(sector_weights.keys()) - {"Unknown", "ETF"}
    all_sectors = set(SP500_SECTOR_WEIGHTS.keys())
    missing = all_sectors - covered_sectors
    for m in sorted(missing):
        if SP500_SECTOR_WEIGHTS.get(m, 0) >= 4.0:  # Only flag major sectors
            recommendations.append(f"No {m} exposure")

    # c) Avg pairwise correlation from 90-day daily returns
    correlation_score = 50.0  # Default if can't compute
    tickers_with_returns = [
        t for t in daily_returns_per_ticker
        if len(daily_returns_per_ticker[t]) >= 60
    ]
    if len(tickers_with_returns) >= 2:
        # Use last 90 days (or as many as available)
        min_len = min(len(daily_returns_per_ticker[t]) for t in tickers_with_returns)
        use_len = min(90, min_len)

        trimmed = {
            t: daily_returns_per_ticker[t][-use_len:]
            for t in tickers_with_returns
        }

        pair_corrs = []
        tlist = list(trimmed.keys())
        for i in range(len(tlist)):
            for j in range(i + 1, len(tlist)):
                corr = _pearson_correlation(trimmed[tlist[i]], trimmed[tlist[j]])
                if corr is not None:
                    pair_corrs.append(corr)

        if pair_corrs:
            avg_corr = sum(pair_corrs) / len(pair_corrs)
            # Low correlation = high score, high correlation = low score
            correlation_score = max(0, min(100, (1 - avg_corr) * 100))

    # d) Holdings count bonus
    if n >= 16:
        count_score = 75.0
    elif n >= 8:
        count_score = 50.0
    elif n >= 4:
        count_score = 25.0
    else:
        count_score = 0.0

    final = 0.3 * position_score + 0.3 * sector_score + 0.2 * correlation_score + 0.2 * count_score
    final = round(max(0, min(100, final)))

    return {
        "score": final,
        "rating": _rate_diversification(final),
        "components": {
            "position_hhi": round(position_score, 1),
            "sector_hhi": round(sector_score, 1),
            "correlation": round(correlation_score, 1),
            "count_bonus": round(count_score, 1),
        },
        "recommendations": recommendations[:5],
    }


def _pearson_correlation(x: list[float], y: list[float]) -> Optional[float]:
    """Compute Pearson correlation between two equal-length lists."""
    n = min(len(x), len(y))
    if n < 10:
        return None
    x = x[:n]
    y = y[:n]
    mx = sum(x) / n
    my = sum(y) / n
    cov = sum((x[i] - mx) * (y[i] - my) for i in range(n)) / (n - 1)
    sx = math.sqrt(sum((xi - mx) ** 2 for xi in x) / (n - 1))
    sy = math.sqrt(sum((yi - my) ** 2 for yi in y) / (n - 1))
    if sx == 0 or sy == 0:
        return None
    return cov / (sx * sy)


def _compute_var(
    portfolio_daily_returns: list[float],
    portfolio_value: float,
) -> dict:
    """Compute Value at Risk (historical simulation).

    VaR_95 = 5th percentile of daily returns * portfolio_value * sqrt(21)
    CVaR = mean of returns below VaR threshold
    """
    if len(portfolio_daily_returns) < 30:
        return {"var_95_daily": None, "error": "Insufficient data"}

    sorted_returns = sorted(portfolio_daily_returns)
    n = len(sorted_returns)

    # 5th percentile
    idx_5 = max(0, int(n * 0.05) - 1)
    var_95_daily = sorted_returns[idx_5]

    # Scale to monthly (21 trading days)
    var_95_monthly = var_95_daily * math.sqrt(21)

    # CVaR: mean of returns at or below VaR
    tail_returns = sorted_returns[:idx_5 + 1]
    cvar_daily = sum(tail_returns) / len(tail_returns) if tail_returns else var_95_daily
    cvar_monthly = cvar_daily * math.sqrt(21)

    return {
        "var_95_daily": {
            "dollars": round(var_95_daily * portfolio_value, 2),
            "pct": round(var_95_daily * 100, 2),
        },
        "var_95_monthly": {
            "dollars": round(var_95_monthly * portfolio_value, 2),
            "pct": round(var_95_monthly * 100, 2),
        },
        "cvar_95_monthly": {
            "dollars": round(cvar_monthly * portfolio_value, 2),
            "pct": round(cvar_monthly * 100, 2),
        },
    }


def _compute_sector_breakdown(
    holdings: list[dict],
    weights: list[float],
) -> list[dict]:
    """Group holdings by GICS sector and compare to S&P 500 weights."""
    sector_weights = defaultdict(float)
    for h, w in zip(holdings, weights):
        sector = _get_sector(h["ticker"])
        sector_weights[sector] += w

    breakdown = []
    for sector, weight in sorted(sector_weights.items(), key=lambda x: -x[1]):
        sp500_w = SP500_SECTOR_WEIGHTS.get(sector, 0)
        pct_weight = round(weight * 100, 1)

        if sp500_w > 0 and pct_weight > sp500_w * 1.5:
            status = "overweight"
        elif sp500_w > 0 and pct_weight < sp500_w * 0.5:
            status = "underweight"
        else:
            status = "neutral"

        breakdown.append({
            "sector": sector,
            "weight": pct_weight,
            "sp500_weight": sp500_w,
            "status": status,
        })

    return breakdown


# ─── Monte Carlo Simulation ───


def run_monte_carlo(
    holdings: list[dict],
    num_simulations: int = 1000,
    months: int = 12,
) -> dict:
    """Run Monte Carlo simulation with correlated random draws.

    Uses Cholesky decomposition of the covariance matrix to generate
    correlated random returns across holdings.

    Must complete in < 10 seconds in Lambda.

    Args:
        holdings: List of {"ticker", "shares", "cost_basis"} dicts.
        num_simulations: Number of simulation paths (default 1000).
        months: Time horizon in months (default 12).

    Returns:
        Dict with percentile outcomes, probability of loss, expected value.
    """
    start_time = time.time()

    if not holdings:
        return {"error": "No holdings provided"}

    # Cap simulations to keep within Lambda time limits
    num_simulations = min(num_simulations, 5000)
    trading_days = months * 21  # ~21 trading days per month

    # Fetch candles in parallel
    tickers = [h["ticker"] for h in holdings]
    candle_map = {}
    with ThreadPoolExecutor(max_workers=min(10, len(tickers))) as executor:
        futures = {executor.submit(_fetch_candles, t, 365): t for t in tickers}
        for future in as_completed(futures):
            t = futures[future]
            try:
                candle_map[t] = future.result()
            except Exception:
                candle_map[t] = []

    # Compute daily returns per ticker
    returns_map = {}
    for t in tickers:
        candles = candle_map.get(t, [])
        rets = _daily_returns_from_candles(candles)
        if len(rets) >= 30:
            returns_map[t] = rets

    valid_tickers = [t for t in tickers if t in returns_map]
    if not valid_tickers:
        return {"error": "Insufficient price history for simulation"}

    # Compute current portfolio value
    prices = {}
    for t in tickers:
        candles = candle_map.get(t, [])
        if candles:
            prices[t] = candles[-1]["close"]
        else:
            # Fallback to cost basis
            for h in holdings:
                if h["ticker"] == t:
                    prices[t] = float(h.get("cost_basis", 0))
                    break

    portfolio_value = sum(
        float(h.get("shares", 0)) * prices.get(h["ticker"], 0)
        for h in holdings
    )

    if portfolio_value <= 0:
        return {"error": "Portfolio value is zero"}

    # Weights for valid tickers
    holding_values = {}
    for h in holdings:
        t = h["ticker"]
        if t in valid_tickers:
            holding_values[t] = float(h.get("shares", 0)) * prices.get(t, 0)

    total_valid = sum(holding_values.values()) or 1
    weights = [holding_values.get(t, 0) / total_valid for t in valid_tickers]

    # Align returns to same length
    min_len = min(len(returns_map[t]) for t in valid_tickers)
    use_len = min(252, min_len)

    aligned = {t: returns_map[t][-use_len:] for t in valid_tickers}

    # Mean daily returns
    means = [sum(aligned[t]) / len(aligned[t]) for t in valid_tickers]

    # Covariance matrix
    n_assets = len(valid_tickers)
    n_obs = use_len
    cov_matrix = [[0.0] * n_assets for _ in range(n_assets)]

    for i in range(n_assets):
        ti = valid_tickers[i]
        for j in range(i, n_assets):
            tj = valid_tickers[j]
            cov = sum(
                (aligned[ti][k] - means[i]) * (aligned[tj][k] - means[j])
                for k in range(n_obs)
            ) / (n_obs - 1)
            cov_matrix[i][j] = cov
            cov_matrix[j][i] = cov

    # Cholesky decomposition
    chol = _cholesky(cov_matrix)
    if chol is None:
        # Fallback: use diagonal (uncorrelated)
        chol = [[0.0] * n_assets for _ in range(n_assets)]
        for i in range(n_assets):
            chol[i][i] = math.sqrt(max(cov_matrix[i][i], 1e-10))

    # Run simulations
    import random
    random.seed(42)  # Reproducible for caching

    final_values = []
    for _ in range(num_simulations):
        # Check time budget
        if time.time() - start_time > 8.0:
            break

        port_value = portfolio_value
        for _day in range(trading_days):
            # Generate correlated random returns
            z = [random.gauss(0, 1) for _ in range(n_assets)]
            corr_returns = [0.0] * n_assets
            for i in range(n_assets):
                for j in range(i + 1):
                    corr_returns[i] += chol[i][j] * z[j]
                corr_returns[i] += means[i]

            # Portfolio daily return (weighted sum)
            port_return = sum(w * r for w, r in zip(weights, corr_returns))
            port_value *= (1 + port_return)

        final_values.append(port_value)

    if not final_values:
        return {"error": "Simulation timed out"}

    final_values.sort()
    n_sims = len(final_values)

    def percentile(pct):
        idx = max(0, min(n_sims - 1, int(n_sims * pct / 100)))
        return round(final_values[idx], 2)

    prob_loss = sum(1 for v in final_values if v < portfolio_value) / n_sims
    expected = sum(final_values) / n_sims

    return {
        "current_value": round(portfolio_value, 2),
        "months": months,
        "simulations_run": n_sims,
        "p10": percentile(10),
        "p25": percentile(25),
        "p50": percentile(50),
        "p75": percentile(75),
        "p90": percentile(90),
        "probability_of_loss": round(prob_loss * 100, 2),
        "expected_value": round(expected, 2),
        "expected_return_pct": round((expected / portfolio_value - 1) * 100, 2),
        "elapsed_seconds": round(time.time() - start_time, 2),
        "disclaimer": DISCLAIMER,
    }


def _cholesky(matrix: list[list[float]]) -> Optional[list[list[float]]]:
    """Cholesky decomposition of a positive-definite matrix.

    Returns lower triangular matrix L such that A = L @ L^T.
    Returns None if matrix is not positive-definite.
    """
    n = len(matrix)
    L = [[0.0] * n for _ in range(n)]

    for i in range(n):
        for j in range(i + 1):
            s = sum(L[i][k] * L[j][k] for k in range(j))
            if i == j:
                val = matrix[i][i] - s
                if val <= 0:
                    # Add small regularization
                    val = max(val + 1e-8, 1e-10)
                L[i][j] = math.sqrt(val)
            else:
                if L[j][j] == 0:
                    L[i][j] = 0
                else:
                    L[i][j] = (matrix[i][j] - s) / L[j][j]

    return L


# ─── Main Entry Point ───


def compute_portfolio_analytics(holdings: list[dict]) -> dict:
    """Compute comprehensive portfolio analytics.

    Args:
        holdings: List of holding dicts with keys:
            - ticker (str): Stock symbol
            - shares (float): Number of shares
            - cost_basis (float): Average cost per share (avgCost)

    Returns:
        Complete analytics dict with risk_metrics, diversification,
        sector_breakdown, and disclaimer.
    """
    if not holdings:
        return {
            "portfolio_value": 0,
            "risk_metrics": {},
            "diversification": {"score": 0, "rating": "No Holdings", "recommendations": []},
            "sector_breakdown": [],
            "disclaimer": DISCLAIMER,
        }

    # Normalize holdings: accept both cost_basis and avgCost
    normalized = []
    for h in holdings:
        normalized.append({
            "ticker": h["ticker"],
            "shares": float(h.get("shares", 0)),
            "cost_basis": float(h.get("cost_basis", h.get("avgCost", 0))),
        })
    holdings = normalized

    tickers = [h["ticker"] for h in holdings]

    # Fetch all candles + betas in parallel
    candle_map = {}
    beta_map = {}

    with ThreadPoolExecutor(max_workers=min(15, len(tickers) + 1)) as executor:
        candle_futures = {
            executor.submit(_fetch_candles, t, 365): ("candle", t)
            for t in tickers
        }
        beta_futures = {
            executor.submit(_fetch_beta, t): ("beta", t)
            for t in tickers
        }
        # Also fetch S&P 500 for benchmark Sharpe
        sp500_future = executor.submit(_fetch_candles, "SPY", 365)

        all_futures = {**candle_futures, **beta_futures}
        for future in as_completed(all_futures):
            kind, t = all_futures[future]
            try:
                result = future.result()
                if kind == "candle":
                    candle_map[t] = result
                else:
                    beta_map[t] = result
            except Exception:
                pass

        try:
            sp500_candles = sp500_future.result()
        except Exception:
            sp500_candles = []

    # Compute daily returns per ticker
    returns_per_ticker = {}
    for t in tickers:
        rets = _daily_returns_from_candles(candle_map.get(t, []))
        if rets:
            returns_per_ticker[t] = rets

    # Current prices (last candle close)
    prices = {}
    for t in tickers:
        candles = candle_map.get(t, [])
        if candles:
            prices[t] = candles[-1]["close"]
        else:
            for h in holdings:
                if h["ticker"] == t:
                    prices[t] = h["cost_basis"]
                    break

    # Compute portfolio value and weights
    holding_values = []
    for h in holdings:
        val = h["shares"] * prices.get(h["ticker"], h["cost_basis"])
        holding_values.append(val)

    portfolio_value = sum(holding_values)
    if portfolio_value <= 0:
        return {
            "portfolio_value": 0,
            "risk_metrics": {},
            "diversification": {"score": 0, "rating": "No Holdings", "recommendations": []},
            "sector_breakdown": [],
            "disclaimer": DISCLAIMER,
        }

    weights = [v / portfolio_value for v in holding_values]

    # Compute weighted portfolio daily returns
    # Align all returns to the shortest common length
    valid_tickers = [t for t in tickers if t in returns_per_ticker and len(returns_per_ticker[t]) >= 30]
    if valid_tickers:
        min_len = min(len(returns_per_ticker[t]) for t in valid_tickers)
        use_len = min(252, min_len)

        # Compute ticker-to-weight mapping for valid tickers
        ticker_weight = {}
        for h, w in zip(holdings, weights):
            if h["ticker"] in valid_tickers:
                ticker_weight[h["ticker"]] = w

        # Renormalize weights for valid tickers
        total_valid_weight = sum(ticker_weight.values()) or 1
        norm_weights = {t: ticker_weight[t] / total_valid_weight for t in valid_tickers}

        portfolio_returns = []
        for day_idx in range(use_len):
            day_return = 0.0
            for t in valid_tickers:
                offset = len(returns_per_ticker[t]) - use_len
                day_return += norm_weights[t] * returns_per_ticker[t][offset + day_idx]
            portfolio_returns.append(day_return)
    else:
        portfolio_returns = []

    # Get risk-free rate
    risk_free_rate = _get_risk_free_rate()

    # Compute all metrics
    sharpe = _compute_sharpe_ratio(portfolio_returns, risk_free_rate)

    # Benchmark Sharpe (S&P 500)
    sp500_returns = _daily_returns_from_candles(sp500_candles)
    if len(sp500_returns) >= 30:
        benchmark_sharpe = _compute_sharpe_ratio(sp500_returns, risk_free_rate)
        sharpe["benchmark"] = benchmark_sharpe.get("value")
    else:
        sharpe["benchmark"] = None

    sortino = _compute_sortino_ratio(portfolio_returns, risk_free_rate)

    max_drawdown_data = _compute_max_drawdown(portfolio_returns)
    # Convert indices to approximate dates if we have candle data
    max_drawdown = {
        "pct": max_drawdown_data["pct"],
        "days_to_recover": max_drawdown_data.get("days_to_recover"),
    }
    # Try to add dates from candle data
    if valid_tickers and candle_map.get(valid_tickers[0]):
        ref_candles = candle_map[valid_tickers[0]]
        ref_len = len(ref_candles)
        use_len_local = min(252, min(len(returns_per_ticker[t]) for t in valid_tickers))
        start_candle_idx = ref_len - use_len_local
        s_idx = max_drawdown_data.get("start_idx", 0)
        e_idx = max_drawdown_data.get("end_idx", 0)
        if start_candle_idx + s_idx < ref_len:
            max_drawdown["start"] = ref_candles[start_candle_idx + s_idx]["date"]
        if start_candle_idx + e_idx < ref_len:
            max_drawdown["end"] = ref_candles[start_candle_idx + e_idx]["date"]

    var_data = _compute_var(portfolio_returns, portfolio_value)

    # Portfolio beta
    portfolio_beta = sum(
        w * beta_map.get(h["ticker"], 1.0)
        for h, w in zip(holdings, weights)
    )

    # Diversification
    diversification = _compute_diversification_score(
        holdings, weights, returns_per_ticker,
    )

    # Sector breakdown
    sector_breakdown = _compute_sector_breakdown(holdings, weights)

    return {
        "portfolio_value": round(portfolio_value, 2),
        "risk_metrics": {
            "sharpe_ratio": sharpe,
            "sortino_ratio": sortino,
            "max_drawdown": max_drawdown,
            "var_95_monthly": var_data.get("var_95_monthly", {}),
            "cvar_95_monthly": var_data.get("cvar_95_monthly", {}),
            "portfolio_beta": round(portfolio_beta, 2),
        },
        "diversification": diversification,
        "sector_breakdown": sector_breakdown,
        "disclaimer": DISCLAIMER,
    }

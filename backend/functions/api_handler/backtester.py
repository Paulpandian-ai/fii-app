"""Portfolio Backtesting Engine for FII.

Simulates strategies based on FII scores applied to historical price data.
Supports multiple strategies: score_threshold, top_n, sector_balanced, user_portfolio.

IMPORTANT DISCLAIMER: Backtesting uses current FII scores applied retrospectively.
Past performance does not predict future results. For educational purposes only.
"""

import logging
import math
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

logger = logging.getLogger(__name__)

DISCLAIMER = (
    "Backtesting uses current FII scores applied retrospectively. "
    "Past performance does not predict future results. Actual trading "
    "involves costs, slippage, and taxes not reflected here. "
    "For educational purposes only."
)

BENCHMARK_TICKER = "SPY"


def _get_db():
    """Lazy import db module."""
    import db
    return db


def _get_finnhub():
    """Lazy import finnhub client."""
    import finnhub_client
    return finnhub_client


def _get_all_scored_stocks() -> list[dict]:
    """Fetch all stocks with FII scores from DynamoDB."""
    db = _get_db()
    items = db.query("SIGNAL", sk_begins_with="TICKER#")
    stocks = []
    for item in items:
        ticker = item.get("SK", "").replace("TICKER#", "")
        score = item.get("compositeScore") or item.get("score")
        if ticker and score is not None:
            score_val = float(score) if isinstance(score, Decimal) else score
            stocks.append({
                "ticker": ticker,
                "score": score_val,
                "signal": item.get("signal", ""),
                "sector": item.get("sector", ""),
                "score_label": item.get("scoreLabel", ""),
            })
    return stocks


def _fetch_historical_prices(ticker: str, start_date: str, end_date: str) -> list[dict]:
    """Fetch daily candles for a ticker between dates."""
    finnhub = _get_finnhub()
    from_ts = int(datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
    to_ts = int(datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
    return finnhub.get_candles(ticker, resolution="D", from_ts=from_ts, to_ts=to_ts)


def _compute_monthly_returns(candles: list[dict]) -> list[dict]:
    """Convert daily candles into monthly returns."""
    if not candles:
        return []

    monthly = {}
    for c in candles:
        month_key = c["date"][:7]  # "YYYY-MM"
        if month_key not in monthly:
            monthly[month_key] = {"first_close": c["close"], "last_close": c["close"]}
        monthly[month_key]["last_close"] = c["close"]

    result = []
    months_sorted = sorted(monthly.keys())
    for i, month in enumerate(months_sorted):
        if i == 0:
            # First month: return from first to last close
            first = monthly[month]["first_close"]
            last = monthly[month]["last_close"]
            ret = ((last - first) / first * 100) if first > 0 else 0
        else:
            prev_month = months_sorted[i - 1]
            prev_close = monthly[prev_month]["last_close"]
            curr_close = monthly[month]["last_close"]
            ret = ((curr_close - prev_close) / prev_close * 100) if prev_close > 0 else 0
        result.append({"month": month, "return_pct": round(ret, 2)})

    return result


def _compute_portfolio_value_series(
    tickers: list[str],
    start_date: str,
    end_date: str,
    initial_capital: float,
) -> dict:
    """Simulate equal-weight portfolio and return value series + metrics."""
    if not tickers:
        return {
            "final_value": initial_capital,
            "total_return_pct": 0,
            "monthly_returns": [],
            "value_series": [],
            "max_drawdown": 0,
        }

    finnhub = _get_finnhub()

    # Fetch candles for all tickers
    all_candles = {}
    for ticker in tickers[:30]:  # Cap at 30 to avoid rate limits
        try:
            candles = _fetch_historical_prices(ticker, start_date, end_date)
            if candles and len(candles) >= 5:
                all_candles[ticker] = candles
        except Exception as e:
            logger.warning(f"[Backtest] Failed to fetch {ticker}: {e}")

    if not all_candles:
        return {
            "final_value": initial_capital,
            "total_return_pct": 0,
            "monthly_returns": [],
            "value_series": [],
            "max_drawdown": 0,
        }

    # Build daily date-indexed close prices
    valid_tickers = list(all_candles.keys())
    date_prices = {}  # date -> {ticker: close}
    all_dates = set()
    for ticker, candles in all_candles.items():
        for c in candles:
            all_dates.add(c["date"])
            if c["date"] not in date_prices:
                date_prices[c["date"]] = {}
            date_prices[c["date"]][ticker] = c["close"]

    sorted_dates = sorted(all_dates)
    if not sorted_dates:
        return {
            "final_value": initial_capital,
            "total_return_pct": 0,
            "monthly_returns": [],
            "value_series": [],
            "max_drawdown": 0,
        }

    # Simulate equal-weight portfolio
    per_stock = initial_capital / len(valid_tickers)
    shares = {}
    for ticker in valid_tickers:
        first_price = None
        for d in sorted_dates:
            if ticker in date_prices.get(d, {}):
                first_price = date_prices[d][ticker]
                break
        if first_price and first_price > 0:
            shares[ticker] = per_stock / first_price
        else:
            shares[ticker] = 0

    # Calculate daily portfolio values
    value_series = []
    peak = initial_capital
    max_drawdown = 0

    for date in sorted_dates:
        day_prices = date_prices.get(date, {})
        portfolio_val = 0
        for ticker in valid_tickers:
            price = day_prices.get(ticker)
            if price is None:
                # Use last known price
                for prev_date in reversed(sorted_dates[:sorted_dates.index(date)]):
                    if ticker in date_prices.get(prev_date, {}):
                        price = date_prices[prev_date][ticker]
                        break
            if price:
                portfolio_val += shares[ticker] * price

        if portfolio_val > 0:
            value_series.append({"date": date, "value": round(portfolio_val, 2)})
            if portfolio_val > peak:
                peak = portfolio_val
            dd = ((portfolio_val - peak) / peak * 100) if peak > 0 else 0
            if dd < max_drawdown:
                max_drawdown = dd

    final_value = value_series[-1]["value"] if value_series else initial_capital
    total_return_pct = ((final_value - initial_capital) / initial_capital * 100) if initial_capital > 0 else 0

    # Monthly returns from value series
    monthly_vals = {}
    for vs in value_series:
        mk = vs["date"][:7]
        monthly_vals[mk] = vs["value"]

    monthly_returns = []
    months = sorted(monthly_vals.keys())
    for i, m in enumerate(months):
        if i == 0:
            prev_val = initial_capital
        else:
            prev_val = monthly_vals[months[i - 1]]
        curr_val = monthly_vals[m]
        ret = ((curr_val - prev_val) / prev_val * 100) if prev_val > 0 else 0
        monthly_returns.append({"month": m, "return_pct": round(ret, 2)})

    return {
        "final_value": round(final_value, 2),
        "total_return_pct": round(total_return_pct, 1),
        "monthly_returns": monthly_returns,
        "value_series": value_series,
        "max_drawdown": round(max_drawdown, 1),
    }


def _compute_sharpe(monthly_returns: list[dict], risk_free_annual: float = 0.05) -> float:
    """Compute annualized Sharpe ratio from monthly returns."""
    if len(monthly_returns) < 3:
        return 0.0
    returns = [m["return_pct"] / 100 for m in monthly_returns]
    monthly_rf = risk_free_annual / 12
    excess = [r - monthly_rf for r in returns]
    mean_excess = sum(excess) / len(excess)
    if len(excess) < 2:
        return 0.0
    variance = sum((x - mean_excess) ** 2 for x in excess) / (len(excess) - 1)
    std = math.sqrt(variance) if variance > 0 else 0.001
    return round((mean_excess / std) * math.sqrt(12), 2)


def _format_period(start_date: str, end_date: str) -> str:
    """Format period string like 'Mar 2025 - Mar 2026'."""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    return f"{start.strftime('%b %Y')} — {end.strftime('%b %Y')}"


def run_backtest(params: dict) -> dict:
    """Run a portfolio backtest based on the given strategy.

    params: {
        "strategy": "score_threshold" | "top_n" | "sector_balanced" | "user_portfolio",
        "min_score": 7.0,            # for score_threshold
        "top_n": 20,                 # for top_n
        "start_date": "2025-03-01",
        "end_date": "2026-03-01",
        "initial_capital": 10000,
        "rebalance_frequency": "monthly",
        "benchmark": "SPY",
        "user_id": "...",            # for user_portfolio
    }
    """
    strategy = params.get("strategy", "score_threshold")
    start_date = params.get("start_date", "2025-03-15")
    end_date = params.get("end_date", "2026-03-15")
    initial_capital = float(params.get("initial_capital", 10000))
    benchmark_ticker = params.get("benchmark", BENCHMARK_TICKER)

    # Get all scored stocks
    all_stocks = _get_all_scored_stocks()

    # Select stocks based on strategy
    if strategy == "score_threshold":
        min_score = float(params.get("min_score", 7.0))
        selected = [s for s in all_stocks if s["score"] >= min_score]
        strategy_label = f"Hold stocks scoring {min_score}+ ({'Strong/Favorable' if min_score >= 7 else 'Neutral and above'})"

    elif strategy == "top_n":
        top_n = int(params.get("top_n", 20))
        sorted_stocks = sorted(all_stocks, key=lambda x: x["score"], reverse=True)
        selected = sorted_stocks[:top_n]
        strategy_label = f"Top {top_n} by FII Score"

    elif strategy == "sector_balanced":
        sectors_param = params.get("sectors", "all")
        sector_stocks = {}
        for s in all_stocks:
            sector = s.get("sector", "Other") or "Other"
            if sectors_param != "all" and isinstance(sectors_param, list) and sector not in sectors_param:
                continue
            if sector not in sector_stocks or s["score"] > sector_stocks[sector]["score"]:
                sector_stocks[sector] = s
        selected = list(sector_stocks.values())
        strategy_label = "Top stock per sector by FII Score"

    elif strategy == "user_portfolio":
        user_id = params.get("user_id")
        if not user_id:
            return {"error": "user_id required for user_portfolio strategy"}
        db = _get_db()
        record = db.get_item(f"USER#{user_id}", "PORTFOLIO")
        holdings = []
        if record and record.get("holdings"):
            raw = record["holdings"]
            if isinstance(raw, str):
                import json
                raw = json.loads(raw)
            holdings = raw
        tickers = [h.get("ticker", "").upper() for h in holdings if h.get("ticker")]
        selected = [{"ticker": t, "score": 0, "sector": ""} for t in tickers]
        strategy_label = "Your Portfolio"

    else:
        return {"error": f"Unknown strategy: {strategy}"}

    if not selected:
        return {
            "strategy": strategy_label,
            "period": _format_period(start_date, end_date),
            "initial_capital": initial_capital,
            "final_value": initial_capital,
            "total_return_pct": 0,
            "stocks_held": [],
            "error": "No stocks matched the strategy criteria",
            "disclaimer": DISCLAIMER,
        }

    selected_tickers = [s["ticker"] for s in selected]

    # Run portfolio simulation
    portfolio = _compute_portfolio_value_series(
        selected_tickers, start_date, end_date, initial_capital
    )

    # Run benchmark simulation
    benchmark = _compute_portfolio_value_series(
        [benchmark_ticker], start_date, end_date, initial_capital
    )

    # Compute metrics
    portfolio_sharpe = _compute_sharpe(portfolio["monthly_returns"])
    alpha = round(portfolio["total_return_pct"] - benchmark["total_return_pct"], 1)

    win_months = sum(1 for m in portfolio["monthly_returns"] if m["return_pct"] > 0)
    lose_months = sum(1 for m in portfolio["monthly_returns"] if m["return_pct"] <= 0)

    # Merge monthly returns for comparison
    benchmark_monthly = {m["month"]: m["return_pct"] for m in benchmark["monthly_returns"]}
    monthly_comparison = []
    for m in portfolio["monthly_returns"]:
        monthly_comparison.append({
            "month": m["month"],
            "portfolio": m["return_pct"],
            "benchmark": benchmark_monthly.get(m["month"], 0),
        })

    # Build value comparison series (for chart)
    benchmark_value_map = {v["date"]: v["value"] for v in benchmark.get("value_series", [])}

    # Annualized return (simple approximation)
    days = max((datetime.strptime(end_date, "%Y-%m-%d") - datetime.strptime(start_date, "%Y-%m-%d")).days, 1)
    years = days / 365.25
    annualized = round(portfolio["total_return_pct"] / years, 1) if years > 0 else portfolio["total_return_pct"]

    return {
        "strategy": strategy_label,
        "strategy_id": strategy,
        "period": _format_period(start_date, end_date),
        "initial_capital": initial_capital,
        "final_value": portfolio["final_value"],
        "total_return_pct": portfolio["total_return_pct"],
        "annualized_return": annualized,
        "benchmark_return": benchmark["total_return_pct"],
        "alpha": alpha,
        "sharpe_ratio": portfolio_sharpe,
        "max_drawdown": portfolio["max_drawdown"],
        "win_months": win_months,
        "lose_months": lose_months,
        "stocks_held": selected_tickers[:30],
        "stocks_count": len(selected_tickers),
        "monthly_returns": monthly_comparison,
        "portfolio_series": portfolio.get("value_series", []),
        "benchmark_series": benchmark.get("value_series", []),
        "disclaimer": DISCLAIMER,
    }


def get_precomputed_backtests() -> list[dict]:
    """Return pre-computed backtest results from DynamoDB cache."""
    db = _get_db()
    items = db.query("BACKTEST#precomputed")
    results = []
    for item in items:
        # Strip DynamoDB keys
        result = {k: v for k, v in item.items() if k not in ("PK", "SK", "TTL")}
        # Convert Decimals
        result = _convert_decimals(result)
        results.append(result)
    return results


def compute_and_cache_precomputed():
    """Compute standard backtest strategies and cache in DynamoDB.

    Intended to be called by the scheduler (weekly refresh).
    """
    db = _get_db()
    import time

    strategies = [
        {
            "id": "top_20",
            "label": "Top 20 by FII Score",
            "params": {"strategy": "top_n", "top_n": 20, "initial_capital": 10000},
        },
        {
            "id": "score_7_plus",
            "label": "Score >= 7 (Strong/Favorable)",
            "params": {"strategy": "score_threshold", "min_score": 7.0, "initial_capital": 10000},
        },
        {
            "id": "score_5_plus",
            "label": "Score >= 5 (Neutral and above)",
            "params": {"strategy": "score_threshold", "min_score": 5.0, "initial_capital": 10000},
        },
    ]

    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=365)).strftime("%Y-%m-%d")
    end_date = now.strftime("%Y-%m-%d")
    ttl = int(time.time()) + (7 * 86400)  # 7 days

    results = []
    for strat in strategies:
        try:
            p = strat["params"].copy()
            p["start_date"] = start_date
            p["end_date"] = end_date
            result = run_backtest(p)
            result["strategy_id"] = strat["id"]
            result["strategy"] = strat["label"]
            result["computed_at"] = now.isoformat()

            # Store in DynamoDB
            db_item = {"PK": "BACKTEST#precomputed", "SK": strat["id"], "TTL": ttl}
            db_item.update(_to_decimals(result))
            db.put_item(db_item)

            results.append(result)
            logger.info(f"[Backtest] Cached {strat['id']}: {result.get('total_return_pct')}%")
        except Exception as e:
            logger.error(f"[Backtest] Failed to compute {strat['id']}: {e}", exc_info=True)

    return results


def _convert_decimals(obj):
    """Recursively convert Decimal values to float/int."""
    if isinstance(obj, Decimal):
        return float(obj) if obj % 1 else int(obj)
    elif isinstance(obj, dict):
        return {k: _convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_decimals(i) for i in obj]
    return obj


def _to_decimals(obj):
    """Recursively convert float values to Decimal for DynamoDB."""
    if isinstance(obj, float):
        return Decimal(str(round(obj, 6)))
    elif isinstance(obj, dict):
        return {k: _to_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_to_decimals(i) for i in obj]
    return obj

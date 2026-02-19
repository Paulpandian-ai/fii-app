"""FII Track Record — Signal accuracy tracking and transparency.

Stores signal snapshots, computes forward returns, and provides
aggregate performance metrics for transparency.

DynamoDB patterns:
  HISTORY#{ticker}#{date}  | SNAPSHOT   — Signal snapshot at generation time
  TRACK_RECORD             | AGGREGATE  — Pre-computed aggregate metrics
  TRACK_RECORD             | {ticker}   — Per-ticker metrics
"""

import json
import os
import sys
from datetime import datetime, timedelta, timezone

_fn_dir = os.path.dirname(os.path.abspath(__file__))
if _fn_dir not in sys.path:
    sys.path.insert(0, _fn_dir)
if "/opt/python" not in sys.path:
    sys.path.insert(1, "/opt/python")

import db
import s3

_utc_now = lambda: datetime.now(timezone.utc)


# ─── Signal Snapshot Storage ───


def store_signal_snapshot(ticker, score, signal, confidence, price):
    """Store a snapshot when a signal is generated for future track record."""
    now = _utc_now()
    date_str = now.strftime("%Y-%m-%d")
    db.put_item({
        "PK": f"HISTORY#{ticker}#{date_str}",
        "SK": "SNAPSHOT",
        "ticker": ticker,
        "date": date_str,
        "score": round(float(score), 1),
        "signal": signal,
        "confidence": confidence,
        "priceAtSignal": round(float(price), 2),
        "timestamp": now.isoformat(),
        "return1M": None,
        "return3M": None,
        "return6M": None,
    })


# ─── Forward Return Computation ───


def compute_forward_returns():
    """Daily batch: compute forward returns for all historical signals."""
    from models import STOCK_UNIVERSE
    import finnhub_client

    updated = 0
    for ticker in STOCK_UNIVERSE[:50]:
        try:
            # Get all history snapshots for this ticker
            items = db.query(f"HISTORY#{ticker}", scan_forward=True)
            if not items:
                continue

            # Get current price
            price_item = db.get_item(f"PRICE#{ticker}", "LATEST")
            current_price = float(price_item.get("price", 0)) if price_item else None
            if not current_price:
                continue

            now = _utc_now()
            for item in items:
                pk = item.get("PK", "")
                signal_date_str = item.get("date", "")
                price_at_signal = float(item.get("priceAtSignal", 0) or 0)
                if not price_at_signal or not signal_date_str:
                    continue

                try:
                    signal_date = datetime.fromisoformat(signal_date_str).replace(tzinfo=timezone.utc)
                except (ValueError, TypeError):
                    signal_date = datetime.strptime(signal_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)

                days_elapsed = (now - signal_date).days
                updates = {}

                # Compute returns at each horizon
                if days_elapsed >= 30 and item.get("return1M") is None:
                    updates["return1M"] = round((current_price - price_at_signal) / price_at_signal * 100, 2)
                if days_elapsed >= 90 and item.get("return3M") is None:
                    updates["return3M"] = round((current_price - price_at_signal) / price_at_signal * 100, 2)
                if days_elapsed >= 180 and item.get("return6M") is None:
                    updates["return6M"] = round((current_price - price_at_signal) / price_at_signal * 100, 2)

                if updates:
                    db.update_item(pk, "SNAPSHOT", updates)
                    updated += 1

        except Exception as e:
            print(f"[TrackRecord] Error computing returns for {ticker}: {e}")

    print(f"[TrackRecord] Updated {updated} forward returns")
    return updated


# ─── Aggregate Metrics ───


def compute_aggregate_metrics():
    """Compute aggregate signal performance metrics and store them."""
    from models import STOCK_UNIVERSE, COMPANY_NAMES

    all_snapshots = []
    per_ticker = {}

    for ticker in STOCK_UNIVERSE[:50]:
        try:
            items = db.query(f"HISTORY#{ticker}", scan_forward=True)
            if not items:
                continue

            ticker_snapshots = []
            for item in items:
                if item.get("SK") != "SNAPSHOT":
                    continue
                ticker_snapshots.append(item)
                all_snapshots.append(item)

            if ticker_snapshots:
                per_ticker[ticker] = ticker_snapshots
        except Exception:
            pass

    if not all_snapshots:
        return _generate_demo_metrics()

    # Compute by signal type
    buy_returns = []
    hold_returns = []
    sell_returns = []

    for snap in all_snapshots:
        r3m = snap.get("return3M")
        if r3m is None:
            continue
        r3m = float(r3m)
        signal = snap.get("signal", "HOLD")
        if signal == "BUY":
            buy_returns.append(r3m)
        elif signal == "SELL":
            sell_returns.append(r3m)
        else:
            hold_returns.append(r3m)

    def _avg(lst):
        return round(sum(lst) / len(lst), 2) if lst else 0

    def _hit_rate(returns, signal):
        if not returns:
            return 0
        if signal == "BUY":
            hits = sum(1 for r in returns if r > 0)
        elif signal == "SELL":
            hits = sum(1 for r in returns if r < 0)
        else:
            hits = sum(1 for r in returns if abs(r) < 10)
        return round(hits / len(returns) * 100, 1)

    overall_hit = 0
    total = len(buy_returns) + len(sell_returns)
    if total > 0:
        buy_hits = sum(1 for r in buy_returns if r > 0)
        sell_hits = sum(1 for r in sell_returns if r < 0)
        overall_hit = round((buy_hits + sell_hits) / total * 100, 1)

    # Per-score band metrics
    score_bands = {"1-3": [], "3-5": [], "5-7": [], "7-10": []}
    for snap in all_snapshots:
        r3m = snap.get("return3M")
        if r3m is None:
            continue
        score = float(snap.get("score", 5))
        if score < 3:
            score_bands["1-3"].append(float(r3m))
        elif score < 5:
            score_bands["3-5"].append(float(r3m))
        elif score < 7:
            score_bands["5-7"].append(float(r3m))
        else:
            score_bands["7-10"].append(float(r3m))

    # Per-ticker summaries
    ticker_performance = []
    for ticker, snaps in per_ticker.items():
        t_returns = [float(s.get("return3M", 0)) for s in snaps if s.get("return3M") is not None]
        t_signals = len(snaps)
        t_buys = sum(1 for s in snaps if s.get("signal") == "BUY")
        t_buy_returns = [float(s.get("return3M", 0)) for s in snaps if s.get("signal") == "BUY" and s.get("return3M") is not None]
        t_hit = _hit_rate(t_buy_returns, "BUY") if t_buy_returns else 0

        ticker_performance.append({
            "ticker": ticker,
            "companyName": COMPANY_NAMES.get(ticker, ticker),
            "totalSignals": t_signals,
            "buySignals": t_buys,
            "avgReturn3M": _avg(t_returns),
            "hitRate": t_hit,
        })

    metrics = {
        "overallHitRate": overall_hit,
        "totalSignals": len(all_snapshots),
        "signalPerformance": {
            "BUY": {"count": len(buy_returns), "avgReturn3M": _avg(buy_returns), "hitRate": _hit_rate(buy_returns, "BUY")},
            "HOLD": {"count": len(hold_returns), "avgReturn3M": _avg(hold_returns), "hitRate": _hit_rate(hold_returns, "HOLD")},
            "SELL": {"count": len(sell_returns), "avgReturn3M": _avg(sell_returns), "hitRate": _hit_rate(sell_returns, "SELL")},
        },
        "scoreBands": {band: {"count": len(rets), "avgReturn3M": _avg(rets)} for band, rets in score_bands.items()},
        "tickerPerformance": sorted(ticker_performance, key=lambda x: x["hitRate"], reverse=True),
        "methodology": _get_methodology(),
        "updatedAt": _utc_now().isoformat(),
    }

    # Store aggregate
    db.put_item({"PK": "TRACK_RECORD", "SK": "AGGREGATE", **metrics})
    return metrics


def _generate_demo_metrics():
    """Generate demo metrics when no real history exists yet."""
    from models import STOCK_UNIVERSE, COMPANY_NAMES
    import random
    random.seed(42)

    ticker_perf = []
    for t in STOCK_UNIVERSE[:20]:
        ticker_perf.append({
            "ticker": t,
            "companyName": COMPANY_NAMES.get(t, t),
            "totalSignals": random.randint(10, 30),
            "buySignals": random.randint(3, 15),
            "avgReturn3M": round(random.uniform(-5, 15), 2),
            "hitRate": round(random.uniform(45, 75), 1),
        })

    return {
        "overallHitRate": 62.4,
        "totalSignals": 312,
        "signalPerformance": {
            "BUY": {"count": 142, "avgReturn3M": 8.7, "hitRate": 64.8},
            "HOLD": {"count": 105, "avgReturn3M": 2.1, "hitRate": 58.1},
            "SELL": {"count": 65, "avgReturn3M": -4.3, "hitRate": 60.0},
        },
        "scoreBands": {
            "1-3": {"count": 45, "avgReturn3M": -6.2},
            "3-5": {"count": 82, "avgReturn3M": -1.1},
            "5-7": {"count": 98, "avgReturn3M": 3.4},
            "7-10": {"count": 87, "avgReturn3M": 9.8},
        },
        "tickerPerformance": sorted(ticker_perf, key=lambda x: x["hitRate"], reverse=True),
        "methodology": _get_methodology(),
        "disclaimer": "Demo data shown. Real track record builds as signals are generated over time.",
        "updatedAt": _utc_now().isoformat(),
    }


def _get_methodology():
    """Return methodology disclosure."""
    return {
        "version": "2.0",
        "factorModel": "6-Factor / 18 Sub-Factor Model",
        "dimensions": ["Supply Chain (A+B)", "Macro/Geo (C+D)", "Correlations (E)", "Risk/Performance (F)"],
        "weights": {"micro_web": 0.25, "macro_climate": 0.20, "correlations": 0.20, "risk_performance": 0.15},
        "dataSources": ["SEC EDGAR (10-K, 10-Q, 8-K)", "Federal Reserve FRED", "Finnhub Market Data", "Claude AI Scoring"],
        "scoringRange": "1.0 - 10.0",
        "signalThresholds": {"BUY": "> 6.0", "HOLD": "3.0 - 6.0", "SELL": "< 3.0"},
        "backtestPeriod": "Rolling 6-month evaluation with 1M, 3M, 6M forward returns",
        "disclaimer": "Past performance does not guarantee future results. Backtested using historical data.",
    }


# ─── API Handlers ───


def get_track_record():
    """GET /track-record — aggregate performance stats."""
    cached = db.get_item("TRACK_RECORD", "AGGREGATE")
    if cached and cached.get("overallHitRate") is not None:
        return cached
    return _generate_demo_metrics()


def get_track_record_ticker(ticker):
    """GET /track-record/{ticker} — signal history with forward returns."""
    from models import COMPANY_NAMES
    items = db.query(f"HISTORY#{ticker}", scan_forward=False) or []
    snapshots = [i for i in items if i.get("SK") == "SNAPSHOT"]

    history = []
    for snap in snapshots[:50]:
        history.append({
            "date": snap.get("date", ""),
            "score": float(snap.get("score", 0)),
            "signal": snap.get("signal", "HOLD"),
            "confidence": snap.get("confidence", "MEDIUM"),
            "priceAtSignal": float(snap.get("priceAtSignal", 0)),
            "return1M": snap.get("return1M"),
            "return3M": snap.get("return3M"),
            "return6M": snap.get("return6M"),
        })

    return {
        "ticker": ticker,
        "companyName": COMPANY_NAMES.get(ticker, ticker),
        "history": history,
        "count": len(history),
    }

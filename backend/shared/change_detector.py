"""Material Change Detection — flags stocks with significant changes for re-scoring.

Detects 5 types of material changes:
  1. Price moved > 5% in 24 hours
  2. Earnings released in last 24 hours
  3. RSI crossed 70 (overbought) or 30 (oversold)
  4. MACD crossover signal
  5. Volume > 2x 20-day average

Stores change flags in DynamoDB:
  PK: CHANGES#{date}, SK: {ticker}
  PK: SCORING_QUEUE, SK: {ticker}#{timestamp}
"""

import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


# ── Material Change Thresholds ──────────────────────────────────────────────

PRICE_CHANGE_THRESHOLD = 5.0    # % change in 24h
RSI_OVERBOUGHT = 70
RSI_OVERSOLD = 30
VOLUME_SPIKE_MULTIPLIER = 2.0   # vs 20-day average


# ── Priority Levels ─────────────────────────────────────────────────────────

PRIORITY_URGENT = "urgent"    # Earnings, major events
PRIORITY_HIGH = "high"        # Price spike, volume spike
PRIORITY_NORMAL = "normal"    # Technical crossovers


# ── Public API ──────────────────────────────────────────────────────────────


def detect_changes_for_ticker(ticker, price_data, tech_data, signal_data):
    """Detect material changes for a single stock.

    Args:
        ticker: Stock ticker symbol.
        price_data: From PRICE#{ticker}/LATEST.
        tech_data: From TECHNICALS#{ticker}/LATEST.
        signal_data: From SIGNAL#{ticker}/LATEST.

    Returns:
        Dict with { flagged: bool, reasons: [...], magnitude: float, priority: str }
        or None if no material changes.
    """
    reasons = []
    magnitude = 0.0
    priority = PRIORITY_NORMAL

    # ── 1. Price change > 5% ──
    if price_data:
        change_pct = _safe_float(price_data.get("changePercent"))
        if abs(change_pct) >= PRICE_CHANGE_THRESHOLD:
            reasons.append("price_spike")
            magnitude = max(magnitude, abs(change_pct))
            priority = PRIORITY_HIGH

    # ── 2. Recent earnings (check EVENT# records) ──
    # This is checked separately via check_recent_earnings()

    # ── 3. RSI crossover ──
    if tech_data:
        indicators = tech_data.get("indicators") or {}
        if isinstance(indicators, str):
            try:
                indicators = json.loads(indicators)
            except Exception:
                indicators = {}

        rsi = _safe_float(indicators.get("rsi"), default=None)
        if rsi is not None:
            if rsi >= RSI_OVERBOUGHT:
                reasons.append("rsi_overbought")
                magnitude = max(magnitude, rsi - 50)
            elif rsi <= RSI_OVERSOLD:
                reasons.append("rsi_oversold")
                magnitude = max(magnitude, 50 - rsi)

        # ── 4. MACD crossover ──
        macd_data = indicators.get("macd") or {}
        if isinstance(macd_data, str):
            try:
                macd_data = json.loads(macd_data)
            except Exception:
                macd_data = {}

        signals = indicators.get("signals") or {}
        if isinstance(signals, str):
            try:
                signals = json.loads(signals)
            except Exception:
                signals = {}

        macd_signal = signals.get("macd", "")
        if macd_signal in ("bullish_crossover", "bearish_crossover"):
            reasons.append("macd_crossover")
            magnitude = max(magnitude, 3.0)

        # ── 5. Volume spike ──
        # Check if current volume is > 2x average
        volume_data = indicators.get("volume") or {}
        if isinstance(volume_data, str):
            try:
                volume_data = json.loads(volume_data)
            except Exception:
                volume_data = {}

        # Also check from signals
        if signals.get("volume_breakout"):
            reasons.append("volume_spike")
            magnitude = max(magnitude, 4.0)
            if priority != PRIORITY_URGENT:
                priority = PRIORITY_HIGH

    if not reasons:
        return None

    return {
        "flagged": True,
        "reasons": reasons,
        "magnitude": round(magnitude, 2),
        "priority": priority,
    }


def check_recent_earnings(db_module, ticker):
    """Check if earnings were released for this ticker in the last 24 hours.

    Queries EVENT#{ticker} records for earnings-related events.

    Returns:
        True if earnings event found in last 24h, False otherwise.
    """
    now = datetime.now(timezone.utc)
    try:
        events = db_module.query(
            pk=f"EVENT#{ticker}",
            limit=5,
            scan_forward=False,
        )
        for event in events:
            event_type = (event.get("type") or event.get("eventType") or "").lower()
            headline = (event.get("headline") or event.get("title") or "").lower()

            is_earnings = (
                "earnings" in event_type
                or "earnings" in headline
                or "quarterly results" in headline
                or "eps" in headline
            )

            if is_earnings:
                event_ts = event.get("SK", "")
                try:
                    event_dt = datetime.fromisoformat(
                        event_ts.replace("Z", "+00:00").split("#")[0]
                    )
                    if (now - event_dt).total_seconds() < 86400:
                        return True
                except (ValueError, IndexError):
                    pass
    except Exception as e:
        logger.debug(f"[ChangeDetector] Earnings check failed for {ticker}: {e}")

    return False


def detect_all_changes(db_module, tickers):
    """Scan all tickers for material changes and store results.

    Args:
        db_module: DynamoDB helper module.
        tickers: List of ticker symbols.

    Returns:
        Dict with { flagged_count, flagged_tickers, by_priority, date }.
    """
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y-%m-%d")
    flagged = []
    by_priority = {PRIORITY_URGENT: 0, PRIORITY_HIGH: 0, PRIORITY_NORMAL: 0}

    for ticker in tickers:
        try:
            price_data = db_module.get_item(f"PRICE#{ticker}", "LATEST")
            tech_data = db_module.get_item(f"TECHNICALS#{ticker}", "LATEST")
            signal_data = db_module.get_item(f"SIGNAL#{ticker}", "LATEST")

            result = detect_changes_for_ticker(
                ticker, price_data, tech_data, signal_data
            )

            # Check earnings separately
            has_earnings = check_recent_earnings(db_module, ticker)
            if has_earnings:
                if result is None:
                    result = {
                        "flagged": True,
                        "reasons": ["earnings"],
                        "magnitude": 10.0,
                        "priority": PRIORITY_URGENT,
                    }
                else:
                    result["reasons"].append("earnings")
                    result["magnitude"] = max(result["magnitude"], 10.0)
                    result["priority"] = PRIORITY_URGENT

            if result and result["flagged"]:
                flagged.append(ticker)
                by_priority[result["priority"]] = (
                    by_priority.get(result["priority"], 0) + 1
                )

                # Store change flag
                _store_change_flag(db_module, ticker, date_str, result, now)

                # Add to scoring queue
                _add_to_scoring_queue(db_module, ticker, result, now)

        except Exception as e:
            logger.warning(f"[ChangeDetector] Error checking {ticker}: {e}")

    logger.info(
        f"[ChangeDetector] Scanned {len(tickers)} stocks, "
        f"{len(flagged)} flagged: "
        f"urgent={by_priority.get(PRIORITY_URGENT, 0)}, "
        f"high={by_priority.get(PRIORITY_HIGH, 0)}, "
        f"normal={by_priority.get(PRIORITY_NORMAL, 0)}"
    )

    return {
        "flagged_count": len(flagged),
        "flagged_tickers": flagged,
        "by_priority": by_priority,
        "date": date_str,
        "scanned": len(tickers),
    }


def get_scoring_queue(db_module, limit=50):
    """Read pending items from the scoring queue.

    Returns items sorted by priority (urgent first) then timestamp.
    """
    try:
        items = db_module.query(
            pk="SCORING_QUEUE",
            limit=limit,
            scan_forward=True,
        )

        # Sort by priority then timestamp
        priority_order = {PRIORITY_URGENT: 0, PRIORITY_HIGH: 1, PRIORITY_NORMAL: 2}
        items.sort(key=lambda x: (
            priority_order.get(x.get("priority", PRIORITY_NORMAL), 3),
            x.get("created_at", ""),
        ))

        return items
    except Exception as e:
        logger.warning(f"[ChangeDetector] Failed to read scoring queue: {e}")
        return []


def remove_from_queue(db_module, sk):
    """Remove a processed item from the scoring queue."""
    try:
        db_module.delete_item("SCORING_QUEUE", sk)
    except Exception as e:
        logger.warning(f"[ChangeDetector] Failed to remove queue item {sk}: {e}")


def get_queue_depth(db_module):
    """Get the current scoring queue depth."""
    try:
        items = db_module.query(pk="SCORING_QUEUE")
        return len(items)
    except Exception:
        return 0


# ── Internal helpers ─────────────────────────────────────────────────────────


def _store_change_flag(db_module, ticker, date_str, result, now):
    """Store change detection result in DynamoDB."""
    try:
        db_module.put_item({
            "PK": f"CHANGES#{date_str}",
            "SK": ticker,
            "ticker": ticker,
            "reasons": result["reasons"],
            "magnitude": str(result["magnitude"]),
            "priority": result["priority"],
            "detected_at": now.isoformat(),
        })
    except Exception as e:
        logger.warning(f"[ChangeDetector] Failed to store change flag for {ticker}: {e}")


def _add_to_scoring_queue(db_module, ticker, result, now):
    """Add a flagged stock to the scoring queue."""
    sk = f"{ticker}#{now.isoformat()}"
    try:
        db_module.put_item({
            "PK": "SCORING_QUEUE",
            "SK": sk,
            "ticker": ticker,
            "reason": ", ".join(result["reasons"]),
            "reasons": result["reasons"],
            "priority": result["priority"],
            "magnitude": str(result["magnitude"]),
            "created_at": now.isoformat(),
        })
    except Exception as e:
        logger.warning(f"[ChangeDetector] Failed to add {ticker} to queue: {e}")


def _safe_float(val, default=0.0):
    """Safely convert to float."""
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

"""Agentic AI Monitor — observe, reason, act.

Runs on a schedule (hourly) to detect significant changes in the stock
universe, use Claude to analyze them, and store actionable insights +
alerts in DynamoDB.

Cost controls
-------------
* Only calls Claude for changes with significance >= SIGNIFICANCE_THRESHOLD (7).
* Skips tickers that already have a recent insight (< INSIGHT_TTL_HOURS old).
* Caps Claude calls per invocation at MAX_CLAUDE_CALLS (20).
* Uses claude-haiku for lower-urgency (significance < 9) analysis.
"""

import json
import logging
import os
import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import db
from models import STOCK_UNIVERSE, ALL_SECURITIES, get_tier
from claude_client import _get_client, _parse_json_response

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ── Configuration ────────────────────────────────────────────────────────────

SIGNIFICANCE_THRESHOLD = 7
ALERT_THRESHOLD = 8
MAX_CLAUDE_CALLS = 20
INSIGHT_TTL_HOURS = 1  # Don't re-analyze same ticker within this window
LARGE_MOVE_PCT = 3.0

# Tier-1 tickers for deeper monitoring
TIER_1 = [t for t in STOCK_UNIVERSE if get_tier(t) == "TIER_1"]


# ── Entry Point ──────────────────────────────────────────────────────────────


def lambda_handler(event, context):
    """AI Agent loop: observe → reason → act."""
    trigger = event.get("trigger", "manual")
    start = time.time()
    logger.info(f"[AIAgent] Starting run trigger={trigger}")

    # 1. OBSERVE
    changes = _detect_changes()
    logger.info(f"[AIAgent] Detected {len(changes)} changes")

    # 2. Filter to significant only
    significant = [c for c in changes if c["significance"] >= SIGNIFICANCE_THRESHOLD]
    significant.sort(key=lambda c: c["significance"], reverse=True)
    logger.info(f"[AIAgent] {len(significant)} significant changes (>= {SIGNIFICANCE_THRESHOLD})")

    # 3. REASON + ACT
    insights_created = 0
    alerts_created = 0
    claude_calls = 0

    for change in significant:
        if claude_calls >= MAX_CLAUDE_CALLS:
            logger.info(f"[AIAgent] Hit max Claude calls ({MAX_CLAUDE_CALLS}), stopping")
            break

        ticker = change["ticker"]

        # Skip if recent insight exists for this ticker
        if _has_recent_insight(ticker):
            continue

        try:
            insight = _analyze_with_claude(change)
            claude_calls += 1

            _store_insight(insight)
            insights_created += 1

            urgency = insight.get("urgency", 0)
            if isinstance(urgency, str):
                urgency = int(urgency) if urgency.isdigit() else 5
            if urgency >= ALERT_THRESHOLD:
                _create_alert(insight)
                alerts_created += 1

        except Exception as e:
            logger.error(f"[AIAgent] Error processing {ticker}: {e}")

    elapsed = time.time() - start

    # Write agent run record
    try:
        db.put_item({
            "PK": "AGENT_RUN#ai_agent",
            "SK": datetime.now(timezone.utc).isoformat(),
            "status": "completed",
            "duration": round(elapsed, 1),
            "processed": len(changes),
            "errors": 0,
            "trigger": trigger,
            "detail": (
                f"changes={len(changes)} significant={len(significant)} "
                f"insights={insights_created} alerts={alerts_created} "
                f"claude_calls={claude_calls}"
            ),
        })
    except Exception:
        pass

    summary = {
        "changesDetected": len(changes),
        "significantChanges": len(significant),
        "insightsCreated": insights_created,
        "alertsCreated": alerts_created,
        "claudeCalls": claude_calls,
        "durationSeconds": round(elapsed, 1),
    }
    logger.info(f"[AIAgent] Complete: {json.dumps(summary)}")
    return {"statusCode": 200, "body": json.dumps(summary)}


# ── OBSERVE: Detect Changes ──────────────────────────────────────────────────


def _detect_changes() -> list[dict]:
    """Scan the data universe for noteworthy changes."""
    changes: list[dict] = []

    # a) Signal changes (TIER_1 only — most impactful)
    for ticker in TIER_1:
        try:
            current = db.get_item(f"SIGNAL#{ticker}", "LATEST")
            previous = db.get_item(f"SIGNAL#{ticker}", "PREVIOUS")
            if (current and previous
                    and current.get("signal") != previous.get("signal")):
                changes.append({
                    "type": "signal_change",
                    "ticker": ticker,
                    "from": previous["signal"],
                    "to": current["signal"],
                    "score": float(current.get("compositeScore", 5)),
                    "significance": 8,
                })
        except Exception:
            pass

    # b) Large price moves (all securities, >3% day change)
    for ticker in ALL_SECURITIES:
        try:
            price = db.get_item(f"PRICE#{ticker}", "LATEST")
            if not price:
                continue
            cp = float(price.get("changePercent", 0))
            if abs(cp) >= LARGE_MOVE_PCT:
                changes.append({
                    "type": "large_move",
                    "ticker": ticker,
                    "changePercent": cp,
                    "price": float(price.get("price", 0)),
                    "significance": min(10, int(abs(cp) * 2)),
                })
        except Exception:
            pass

    # c) Technical breakouts (TIER_1)
    for ticker in TIER_1:
        try:
            tech = db.get_item(f"TECHNICALS#{ticker}", "LATEST")
            if not tech:
                continue
            indicators = tech.get("indicators") or {}
            signals = indicators.get("signals") or {}
            signals_str = json.dumps(signals).lower()
            if "golden_cross" in signals_str or "death_cross" in signals_str:
                cross_type = "golden_cross" if "golden_cross" in signals_str else "death_cross"
                changes.append({
                    "type": "technical_breakout",
                    "ticker": ticker,
                    "breakout": cross_type,
                    "significance": 7,
                })
            # RSI extremes
            rsi = float(indicators.get("rsi") or 50)
            if rsi > 80 or rsi < 20:
                changes.append({
                    "type": "rsi_extreme",
                    "ticker": ticker,
                    "rsi": rsi,
                    "condition": "overbought" if rsi > 80 else "oversold",
                    "significance": 7,
                })
        except Exception:
            pass

    # d) Fundamental alerts (TIER_1 — Z-score distress)
    for ticker in TIER_1:
        try:
            health = db.get_item(f"HEALTH#{ticker}", "LATEST")
            if not health:
                continue
            analysis = health.get("analysis") or {}
            z = analysis.get("zScore")
            if z is not None and float(z) < 1.8:
                changes.append({
                    "type": "fundamental_alert",
                    "ticker": ticker,
                    "alert": f"Z-Score {float(z):.2f} — distress zone",
                    "zScore": float(z),
                    "significance": 9,
                })
        except Exception:
            pass

    return changes


# ── REASON: Claude Analysis ──────────────────────────────────────────────────

INSIGHT_PROMPT = """You are an educational financial analysis assistant for Factor Impact Intelligence. Analyze this event and provide a brief, factual insight.

Event: {change_json}
Current Price: ${price} ({change_pct}%)
FII Score Label: {signal} (Score: {score})
Technical Score: {tech_score}

Provide:
1. A one-sentence headline (max 15 words)
2. A 2-3 sentence explanation of why this matters for educational understanding
3. A score label assessment (Strong/Favorable/Neutral/Weak/Caution/Watch)
4. Urgency level (1-10, integer)
5. Confidence level (LOW/MEDIUM/HIGH)

NEVER use the words BUY, SELL, or HOLD. Use educational score labels instead.
End the explanation with: 'For educational purposes only. Not investment advice.'

Respond in JSON format only:
{{"headline": "...", "explanation": "...", "action": "...", "urgency": 5, "confidence": "MEDIUM"}}"""


def _analyze_with_claude(change: dict) -> dict:
    """Use Claude to reason about a detected change."""
    ticker = change["ticker"]

    # Gather context
    price_data = db.get_item(f"PRICE#{ticker}", "LATEST") or {}
    signal_data = db.get_item(f"SIGNAL#{ticker}", "LATEST") or {}
    tech_data = db.get_item(f"TECHNICALS#{ticker}", "LATEST") or {}

    prompt = INSIGHT_PROMPT.format(
        change_json=json.dumps(change, default=str),
        price=price_data.get("price", "N/A"),
        change_pct=price_data.get("changePercent", "N/A"),
        signal=signal_data.get("signal", "N/A"),
        score=signal_data.get("compositeScore", "N/A"),
        tech_score=tech_data.get("technicalScore", "N/A"),
    )

    # Cost control: use haiku for lower-significance events
    model = ("claude-haiku-4-5-20251001"
             if change["significance"] < 9
             else "claude-sonnet-4-5-20250929")

    EDUCATIONAL_PREAMBLE = (
        "You are an educational financial analysis assistant for Factor Impact Intelligence (FII). "
        "You provide factual, data-driven analysis of publicly available market data. "
        "NEVER say 'buy', 'sell', 'hold', or 'recommend'. "
        "Use score labels: Strong, Favorable, Neutral, Weak, Caution. "
        "End every analysis with: 'For educational purposes only. Not investment advice.'"
    )

    client = _get_client()
    response = client.messages.create(
        model=model,
        max_tokens=300,
        system=EDUCATIONAL_PREAMBLE,
        messages=[{"role": "user", "content": prompt}],
    )

    insight = _parse_json_response(response.content[0].text)

    # Augment with metadata
    insight["ticker"] = ticker
    insight["changeType"] = change["type"]
    insight["generatedAt"] = datetime.now(timezone.utc).isoformat()
    insight["model"] = model

    return insight


# ── ACT: Store & Alert ───────────────────────────────────────────────────────


def _store_insight(insight: dict):
    """Store insight to DynamoDB — per-ticker and global feed."""
    ts = insight["generatedAt"]
    ticker = insight["ticker"]

    # Per-ticker insight
    db.put_item({
        "PK": f"INSIGHT#{ticker}",
        "SK": ts,
        "headline": insight.get("headline", ""),
        "explanation": insight.get("explanation", ""),
        "action": insight.get("action", "WATCH"),
        "urgency": int(insight.get("urgency", 5)),
        "confidence": insight.get("confidence", "MEDIUM"),
        "changeType": insight.get("changeType", ""),
        "model": insight.get("model", ""),
    })

    # Global insight feed
    db.put_item({
        "PK": "INSIGHT_FEED",
        "SK": f"{ts}#{ticker}",
        "ticker": ticker,
        "headline": insight.get("headline", ""),
        "action": insight.get("action", "WATCH"),
        "urgency": int(insight.get("urgency", 5)),
        "confidence": insight.get("confidence", "MEDIUM"),
        "changeType": insight.get("changeType", ""),
    })


def _create_alert(insight: dict):
    """Store a high-urgency alert."""
    db.put_item({
        "PK": "ALERTS",
        "SK": f"{insight['generatedAt']}#{insight['ticker']}",
        "ticker": insight["ticker"],
        "headline": insight.get("headline", ""),
        "explanation": insight.get("explanation", ""),
        "action": insight.get("action", "WATCH"),
        "urgency": int(insight.get("urgency", 8)),
        "changeType": insight.get("changeType", ""),
    })


def _has_recent_insight(ticker: str) -> bool:
    """Return True if an insight for *ticker* was created within INSIGHT_TTL_HOURS."""
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=INSIGHT_TTL_HOURS)).isoformat()
        recent = db.query(
            f"INSIGHT#{ticker}",
            sk_begins_with=None,
            limit=1,
            scan_forward=False,
        )
        if recent and recent[0].get("SK", "") > cutoff:
            return True
    except Exception:
        pass
    return False

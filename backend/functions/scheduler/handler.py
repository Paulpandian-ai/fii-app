"""Agent Scheduler & Orchestrator.

Triggered by EventBridge (CloudWatch Events) rules.  Each invocation
receives an ``{"agent": "<agent_id>", "trigger": "<schedule_key>"}``
payload and dispatches work to the appropriate target Lambda.
"""

import json
import logging
import os
import time
from datetime import datetime, timezone

import boto3

import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

STAGE = os.environ.get("STAGE", "dev")
REGION = os.environ.get("AWS_REGION", "us-east-1")

lambda_client = boto3.client("lambda", region_name=REGION)

# ── Agent definitions ────────────────────────────────────────────────────────

AGENTS = {
    "price_refresh": {
        "name": "Price Refresh",
        "description": "Refresh stock prices from Finnhub",
        "target_lambda": f"fii-data-refresh-{STAGE}",
        "payload": {"mode": "prices"},
        "schedules": {
            "market_open": "cron(45 14 ? * MON-FRI *)",
            "intraday": "rate(30 minutes)",
            "market_close": "cron(30 20 ? * MON-FRI *)",
        },
        "market_hours_only": True,
    },
    "technicals_refresh": {
        "name": "Technicals Refresh",
        "description": "Compute technical indicators from candle data",
        "target_lambda": f"fii-data-refresh-{STAGE}",
        "payload": {"mode": "full"},
        "schedules": {
            "daily": "cron(30 21 ? * MON-FRI *)",
        },
    },
    "signal_generation": {
        "name": "Signal Generation",
        "description": "Generate AI BUY/HOLD/SELL signals from all data",
        "target_lambda": f"fii-data-refresh-{STAGE}",
        "payload": {"mode": "signals"},
        "schedules": {
            "daily": "cron(0 22 ? * MON-FRI *)",
            "weekly_full": "cron(0 8 ? * SAT *)",
        },
    },
    "fundamentals_refresh": {
        "name": "Fundamentals Refresh",
        "description": "Refresh fundamental data from SEC EDGAR",
        "target_lambda": f"fii-data-refresh-{STAGE}",
        "payload": {"mode": "fundamentals"},
        "schedules": {
            "weekly": "cron(0 10 ? * SUN *)",
        },
    },
    "feed_compile": {
        "name": "Feed Compile",
        "description": "Compile the daily signal feed from latest data",
        "target_lambda": f"fii-feed-compiler-{STAGE}",
        "payload": {},
        "schedules": {
            "daily": "cron(30 10 ? * MON-FRI *)",
        },
    },
}

# ── Helpers ───────────────────────────────────────────────────────────────────


def _is_market_hours() -> bool:
    """Return True if current UTC time maps to US market hours (9:30-16:00 ET).

    Uses a rough UTC offset of -4 (EDT) / -5 (EST).
    """
    now = datetime.now(timezone.utc)
    # Approximate: market open ~13:30 UTC, close ~20:00 UTC
    if now.weekday() >= 5:  # Saturday/Sunday
        return False
    hour = now.hour
    return 13 <= hour <= 20


def _write_run_record(agent_id: str, trigger: str, status: str,
                      duration: float = 0, processed: int = 0,
                      errors: int = 0, detail: str = ""):
    """Write an AGENT_RUN# record to DynamoDB."""
    try:
        db.put_item({
            "PK": f"AGENT_RUN#{agent_id}",
            "SK": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "duration": round(duration, 1),
            "processed": processed,
            "errors": errors,
            "trigger": trigger,
            "detail": detail[:500] if detail else "",
        })
    except Exception as e:
        logger.error(f"[Scheduler] Failed to write run record: {e}")


# ── Entry Point ──────────────────────────────────────────────────────────────


def lambda_handler(event, context):
    """Dispatch an agent run.

    Expected event shape::

        {"agent": "signal_generation", "trigger": "daily"}
    """
    agent_id = event.get("agent", "")
    trigger = event.get("trigger", "manual")

    logger.info(f"[Scheduler] Triggered agent={agent_id} trigger={trigger}")

    if agent_id not in AGENTS:
        msg = f"Unknown agent: {agent_id}"
        logger.error(f"[Scheduler] {msg}")
        return {"statusCode": 400, "body": json.dumps({"error": msg})}

    agent = AGENTS[agent_id]

    # Check market hours gate
    if agent.get("market_hours_only") and not _is_market_hours():
        msg = f"Skipped {agent_id}: outside market hours"
        logger.info(f"[Scheduler] {msg}")
        _write_run_record(agent_id, trigger, "skipped", detail=msg)
        return {"statusCode": 200, "body": json.dumps({"skipped": msg})}

    # Invoke the target Lambda asynchronously
    target = agent["target_lambda"]
    payload = {**agent["payload"], "trigger": trigger}

    start = time.time()
    try:
        resp = lambda_client.invoke(
            FunctionName=target,
            InvocationType="Event",  # async — don't wait for completion
            Payload=json.dumps(payload),
        )
        status_code = resp.get("StatusCode", 0)
        elapsed = time.time() - start

        if 200 <= status_code < 300:
            _write_run_record(agent_id, trigger, "invoked", duration=elapsed)
            logger.info(
                f"[Scheduler] Invoked {target} for {agent_id} "
                f"(status={status_code}, {elapsed:.1f}s)"
            )
            return {
                "statusCode": 200,
                "body": json.dumps({
                    "agent": agent_id,
                    "target": target,
                    "status": "invoked",
                    "trigger": trigger,
                }),
            }
        else:
            _write_run_record(agent_id, trigger, "error",
                              duration=elapsed, detail=f"StatusCode={status_code}")
            return {
                "statusCode": 502,
                "body": json.dumps({"error": f"Invoke returned {status_code}"}),
            }

    except Exception as e:
        elapsed = time.time() - start
        logger.error(f"[Scheduler] Failed to invoke {target}: {e}")
        _write_run_record(agent_id, trigger, "error",
                          duration=elapsed, detail=str(e))
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }

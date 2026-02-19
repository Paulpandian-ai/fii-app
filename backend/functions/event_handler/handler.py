"""FII Event Handler — Routes for events, alerts, and notification preferences.

Routes:
  GET  /events/<ticker>                — Event timeline for a stock (30 days)
  GET  /events/feed                    — All recent events across tracked stocks
  GET  /events/signal-history/<ticker> — Signal score history (30 days)
  GET  /alerts                         — Recent push notification alerts
  GET  /notifications/preferences      — User notification preferences
  POST /notifications/preferences      — Save notification preferences
  POST /notifications/register         — Register push notification device token
"""

import json
import os
import sys
import traceback

_fn_dir = os.path.dirname(os.path.abspath(__file__))
if _fn_dir not in sys.path:
    sys.path.insert(0, _fn_dir)

if "/opt/python" not in sys.path:
    sys.path.insert(1, "/opt/python")

import event_engine


def lambda_handler(event, context):
    """Main event/notification API router."""
    try:
        http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
        path = event.get("rawPath") or event.get("path") or event.get("resource") or "/"

        stage = event.get("requestContext", {}).get("stage", "")
        if stage and stage != "$default" and path.startswith(f"/{stage}"):
            path = path[len(f"/{stage}"):]
        if not path.startswith("/"):
            path = "/" + path

        print(f"[EventRouter] method={http_method} path={path}")

        body = json.loads(event.get("body", "{}") or "{}")
        query_params = event.get("queryStringParameters") or {}
        user_id = (
            event.get("requestContext", {})
            .get("authorizer", {})
            .get("jwt", {})
            .get("claims", {})
            .get("sub", "anonymous")
        )

        # ─── Route Dispatch ───

        if path.startswith("/events/signal-history/"):
            ticker = path.split("/events/signal-history/")[-1].strip("/").upper()
            return _handle_signal_history(http_method, ticker, query_params)
        elif path == "/events/feed":
            return _handle_events_feed(http_method, query_params)
        elif path.startswith("/events/"):
            ticker = path.split("/events/")[-1].strip("/").upper()
            return _handle_events_ticker(http_method, ticker, query_params)
        elif path == "/alerts":
            return _handle_alerts(http_method, query_params)
        elif path.startswith("/notifications"):
            return _handle_notifications(http_method, path, body, user_id)
        else:
            return _response(404, {"error": "Not found", "path": path})

    except Exception as e:
        traceback.print_exc()
        return _response(500, {"error": str(e)})


# ─── Handlers ───


def _handle_events_ticker(method, ticker, query_params):
    """GET /events/<ticker> — Event timeline for a stock (last 30 days)."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    event_type = query_params.get("type")
    impact = query_params.get("impact")
    limit = min(int(query_params.get("limit", "50")), 100)

    events = event_engine.get_events_for_ticker(
        ticker, event_type=event_type, impact=impact, limit=limit
    )

    cleaned = []
    for e in events:
        cleaned.append({
            "ticker": e.get("ticker", ticker),
            "type": e.get("type", ""),
            "headline": e.get("headline", ""),
            "summary": e.get("summary", ""),
            "impact": e.get("impact", "low"),
            "direction": e.get("direction", "neutral"),
            "category": e.get("category", ""),
            "sourceUrl": e.get("sourceUrl", ""),
            "formType": e.get("formType", ""),
            "indicator": e.get("indicator", ""),
            "surpriseScore": e.get("surpriseScore"),
            "sectorImpacts": e.get("sectorImpacts", {}),
            "factorsAffected": e.get("factorsAffected", []),
            "timestamp": e.get("timestamp", ""),
        })

    return _response(200, {"ticker": ticker, "events": cleaned, "count": len(cleaned)})


def _handle_events_feed(method, query_params):
    """GET /events/feed — All recent events across all tracked stocks."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    limit = min(int(query_params.get("limit", "50")), 100)
    events = event_engine.get_events_feed(limit=limit)

    cleaned = []
    for e in events:
        cleaned.append({
            "ticker": e.get("ticker", ""),
            "type": e.get("type", ""),
            "headline": e.get("headline", ""),
            "summary": e.get("summary", ""),
            "impact": e.get("impact", "low"),
            "direction": e.get("direction", "neutral"),
            "category": e.get("category", ""),
            "sourceUrl": e.get("sourceUrl", ""),
            "formType": e.get("formType", ""),
            "indicator": e.get("indicator", ""),
            "timestamp": e.get("timestamp", ""),
        })

    return _response(200, {"events": cleaned, "count": len(cleaned)})


def _handle_alerts(method, query_params):
    """GET /alerts — Recent push notification alerts."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    limit = min(int(query_params.get("limit", "20")), 50)
    alerts = event_engine.get_alerts(limit=limit)

    cleaned = []
    for a in alerts:
        cleaned.append({
            "ticker": a.get("ticker", ""),
            "priority": a.get("priority", ""),
            "title": a.get("title", ""),
            "body": a.get("body", ""),
            "eventType": a.get("eventType", ""),
            "impact": a.get("impact", ""),
            "direction": a.get("direction", ""),
            "timestamp": a.get("timestamp", ""),
            "read": a.get("read", False),
        })

    return _response(200, {"alerts": cleaned, "count": len(cleaned)})


def _handle_signal_history(method, ticker, query_params):
    """GET /events/signal-history/<ticker> — Signal score history."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    days = min(int(query_params.get("days", "30")), 90)
    history = event_engine.get_signal_history(ticker, days=days)

    return _response(200, {"ticker": ticker, "history": history, "days": days})


def _handle_notifications(method, path, body, user_id):
    """Route /notifications/* requests."""
    if path == "/notifications/preferences":
        if method == "GET":
            prefs = event_engine.get_user_prefs(user_id)
            return _response(200, prefs)
        elif method == "POST":
            prefs = event_engine.save_user_prefs(user_id, body)
            return _response(200, prefs)
    elif path == "/notifications/register":
        if method == "POST":
            token = body.get("token", "")
            platform = body.get("platform", "expo")
            if not token:
                return _response(400, {"error": "token required"})
            event_engine.register_device_token(user_id, token, platform)
            return _response(200, {"registered": True})
    return _response(404, {"error": "Not found"})


# ─── Response Helper ───


def _response(status_code, body):
    """Build an API Gateway-compatible response."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body, default=str),
    }

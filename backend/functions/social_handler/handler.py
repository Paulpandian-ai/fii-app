"""FII Social Handler — Routes for social/community features, subscriptions, and affiliates.

Routes:
  GET  /track-record              — Aggregate signal performance stats
  GET  /track-record/{ticker}     — Signal history with forward returns
  GET  /discuss/{ticker}          — Discussion threads for a ticker
  POST /discuss/{ticker}          — Create a discussion post
  GET  /profile/me                — Authenticated user's profile
  PUT  /profile/me                — Update authenticated user's profile
  GET  /profile/{userId}          — Public profile
  GET  /leaderboard               — Top users by discipline score
  POST /chat                      — AI-powered stock Q&A
  GET  /subscription/status       — Current tier and limits
  GET  /subscription/usage        — Current period usage counts
  POST /webhooks/revenuecat       — RevenueCat subscription lifecycle webhook
  GET  /affiliate/link            — Generate broker deep link
  GET  /affiliate/brokers         — List available brokers
"""

import json
import os
import re
import html
import sys
import traceback

_fn_dir = os.path.dirname(os.path.abspath(__file__))
if _fn_dir not in sys.path:
    sys.path.insert(0, _fn_dir)

if "/opt/python" not in sys.path:
    sys.path.insert(1, "/opt/python")

import track_record
import social
import subscription
import affiliates


def sanitize_input(text: str, max_length: int = 500) -> str:
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', '', str(text))
    text = html.escape(text)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    return text[:max_length].strip()


def lambda_handler(event, context):
    """Social/community API router."""
    try:
        http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
        path = event.get("rawPath") or event.get("path") or event.get("resource") or "/"

        stage = event.get("requestContext", {}).get("stage", "")
        if stage and stage != "$default" and path.startswith(f"/{stage}"):
            path = path[len(f"/{stage}"):]
        if not path.startswith("/"):
            path = "/" + path

        print(f"[SocialRouter] method={http_method} path={path}")

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

        # Subscription routes
        if path == "/subscription/status":
            return _handle_subscription_status(http_method, user_id)
        elif path == "/subscription/usage":
            return _handle_subscription_usage(http_method, user_id)
        elif path == "/webhooks/revenuecat":
            return _handle_revenuecat_webhook(http_method, body)
        # Affiliate routes
        elif path == "/affiliate/link":
            return _handle_affiliate_link(http_method, query_params, user_id)
        elif path == "/affiliate/brokers":
            return _handle_affiliate_brokers(http_method, query_params)
        # Social routes
        elif path.startswith("/track-record/"):
            ticker = path.split("/track-record/")[-1].strip("/").upper()
            return _handle_track_record_ticker(http_method, ticker)
        elif path == "/track-record":
            return _handle_track_record(http_method)
        elif path.startswith("/discuss/") and "/react" in path:
            parts = path.strip("/").split("/")
            ticker = parts[1].upper() if len(parts) > 1 else ""
            post_id = parts[2] if len(parts) > 2 else ""
            return _handle_discuss_react(http_method, ticker, post_id, body, user_id)
        elif path.startswith("/discuss/"):
            ticker = path.split("/discuss/")[-1].strip("/").upper()
            return _handle_discuss(http_method, ticker, body, query_params, user_id)
        elif path == "/profile/me":
            return _handle_profile_me(http_method, body, user_id)
        elif path.startswith("/profile/"):
            target_id = path.split("/profile/")[-1].strip("/")
            return _handle_profile(http_method, target_id)
        elif path == "/leaderboard":
            return _handle_leaderboard(http_method)
        elif path == "/chat":
            return _handle_chat(http_method, body, user_id)
        else:
            print(f"[SocialRouter] No route matched for path={path} method={http_method}")
            return _response(404, {"error": "Not found", "path": path, "method": http_method})

    except Exception as e:
        traceback.print_exc()
        return _response(500, {"error": str(e)})


# ─── Subscription Endpoints ───


def _handle_subscription_status(method, user_id):
    """GET /subscription/status — Current tier and limits."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})
    result = subscription.get_subscription(user_id)
    return _response(200, result)


def _handle_subscription_usage(method, user_id):
    """GET /subscription/usage — Current period usage counts."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})
    result = subscription.get_usage(user_id)
    return _response(200, result)


def _handle_revenuecat_webhook(method, body):
    """POST /webhooks/revenuecat — RevenueCat subscription lifecycle events."""
    if method != "POST":
        return _response(405, {"error": "Method not allowed"})
    result = subscription.handle_webhook(body)
    if isinstance(result, tuple):
        return _response(result[1], result[0])
    return _response(200, result)


# ─── Affiliate Endpoints ───


def _handle_affiliate_link(method, query_params, user_id):
    """GET /affiliate/link — Generate broker deep link."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})
    broker = query_params.get("broker", "")
    ticker = query_params.get("ticker", "")
    if not broker or not ticker:
        return _response(400, {"error": "broker and ticker query params required"})
    result = affiliates.get_affiliate_link(broker, ticker, user_id)
    if isinstance(result, tuple):
        return _response(result[1], result[0])
    return _response(200, result)


def _handle_affiliate_brokers(method, query_params):
    """GET /affiliate/brokers — List available brokers."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})
    ticker = query_params.get("ticker")
    result = affiliates.get_brokers(ticker)
    return _response(200, result)


# ─── Track Record Endpoints ───


def _handle_track_record(method):
    """GET /track-record — Aggregate signal performance stats."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})
    result = track_record.get_track_record()
    return _response(200, result)


def _handle_track_record_ticker(method, ticker):
    """GET /track-record/{ticker} — Signal history with forward returns."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})
    result = track_record.get_track_record_ticker(ticker)
    return _response(200, result)


# ─── Discussion Endpoints ───


def _handle_discuss(method, ticker, body, query_params, user_id):
    """GET/POST /discuss/{ticker} — Discussion threads."""
    if method == "GET":
        limit = min(int(query_params.get("limit", "20")), 50)
        result = social.get_posts(ticker, limit=limit)
        return _response(200, result)
    elif method == "POST":
        content = sanitize_input(body.get("content", ""))
        sentiment = body.get("sentiment", "neutral")
        display_name = body.get("displayName", "")
        result, status = social.create_post(ticker, user_id, display_name, content, sentiment)
        return _response(status, result)
    return _response(405, {"error": "Method not allowed"})


def _handle_discuss_react(method, ticker, post_id, body, user_id):
    """POST /discuss/{ticker}/{postId}/react — React to a post."""
    if method != "POST":
        return _response(405, {"error": "Method not allowed"})
    reaction = body.get("reaction", "")
    result = social.react_to_post(ticker, post_id, reaction, user_id)
    if isinstance(result, tuple):
        return _response(result[1], result[0])
    return _response(200, result)


# ─── Profile Endpoints ───


def _handle_profile_me(method, body, user_id):
    """GET/PUT /profile/me — Authenticated user's profile."""
    if method == "GET":
        result = social.get_public_profile(user_id)
        return _response(200, result)
    elif method == "PUT":
        if "displayName" in body:
            body["displayName"] = sanitize_input(body["displayName"], max_length=30)
        result = social.update_profile(user_id, body)
        if isinstance(result, tuple):
            return _response(result[1], result[0])
        return _response(200, result)
    return _response(405, {"error": "Method not allowed"})


def _handle_profile(method, target_id):
    """GET /profile/{userId} — Public profile."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})
    result = social.get_public_profile(target_id)
    return _response(200, result)


# ─── Leaderboard Endpoint ───


def _handle_leaderboard(method):
    """GET /leaderboard — Top users by discipline score."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})
    result = social.get_leaderboard()
    return _response(200, result)


# ─── AI Chat Endpoint ───


def _handle_chat(method, body, user_id):
    """POST /chat — AI-powered stock Q&A."""
    if method != "POST":
        return _response(405, {"error": "Method not allowed"})
    message = sanitize_input(body.get("message", ""), max_length=1000)
    context = body.get("context", {})
    result = social.handle_chat(user_id, message, context)
    if isinstance(result, tuple):
        return _response(result[1], result[0])
    return _response(200, result)


# ─── Helpers ───


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

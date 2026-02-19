"""FII Social Handler — Routes for social/community features.

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

import track_record
import social


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

        if path.startswith("/track-record/"):
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
        content = body.get("content", "")
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
    message = body.get("message", "")
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

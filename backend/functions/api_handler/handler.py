"""FII API Handler — Main router for all API requests."""

import json
import os
import traceback

# Shared layer imports will be available at runtime via Lambda Layer
# from shared.db import get_item, put_item, query
# from shared.s3 import read_json, write_json


def lambda_handler(event, context):
    """Main API Gateway event router."""
    try:
        http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
        path = event.get("rawPath", "/")
        body = json.loads(event.get("body", "{}") or "{}")
        user_id = (
            event.get("requestContext", {})
            .get("authorizer", {})
            .get("jwt", {})
            .get("claims", {})
            .get("sub", "anonymous")
        )

        # ─── Route Dispatch ───

        if path.startswith("/feed"):
            return _handle_feed(http_method, body, user_id)
        elif path.startswith("/signals/"):
            ticker = path.split("/signals/")[-1].strip("/")
            return _handle_signal(http_method, ticker, user_id)
        elif path.startswith("/portfolio"):
            return _handle_portfolio(http_method, path, body, user_id)
        elif path.startswith("/coach"):
            return _handle_coach(http_method, user_id)
        else:
            return _response(404, {"error": "Not found"})

    except Exception as e:
        traceback.print_exc()
        return _response(500, {"error": str(e)})


def _handle_feed(method, body, user_id):
    """GET /feed — Return the latest compiled feed."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    # Placeholder: return empty feed until feed_compiler is running
    return _response(200, {"items": [], "cursor": None})


def _handle_signal(method, ticker, user_id):
    """GET /signals/:ticker — Return full 6-factor analysis."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    return _response(200, {
        "ticker": ticker.upper(),
        "status": "pending",
        "message": "Signal analysis not yet available",
    })


def _handle_portfolio(method, path, body, user_id):
    """CRUD for portfolio holdings."""
    if method == "GET":
        return _response(200, {"holdings": [], "totalValue": 0})
    elif method == "PUT":
        holdings = body.get("holdings", [])
        return _response(200, {"holdings": holdings, "updated": True})
    elif method == "POST" and "/csv" in path:
        csv_content = body.get("csv", "")
        return _response(200, {"parsed": 0, "message": "CSV parsing not yet implemented"})
    else:
        return _response(405, {"error": "Method not allowed"})


def _handle_coach(method, user_id):
    """GET /coach/insights — Return behavioral coaching insights."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    return _response(200, {"insights": [], "message": "Coach not yet available"})


def _response(status_code, body):
    """Build an API Gateway-compatible response."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }

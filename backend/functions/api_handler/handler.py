"""FII API Handler — Main router for all API requests.

Routes:
  GET  /feed                         — Latest compiled feed
  GET  /signals/<ticker>             — Full signal for a ticker
  GET  /signals/batch?tickers=A,B,C  — Batch fetch signals
  POST /signals/generate/<ticker>    — On-demand signal generation
  POST /signals/refresh-all          — Refresh all tracked stocks
  GET  /portfolio                    — User portfolio
  PUT  /portfolio                    — Update portfolio
  POST /portfolio/csv                — Import CSV
  GET  /coach/insights               — Coaching insights
"""

import json
import sys
import traceback

# Add Lambda layer to Python path
sys.path.insert(0, "/opt")

import db
import s3


def lambda_handler(event, context):
    """Main API Gateway event router."""
    try:
        http_method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
        path = event.get("rawPath", "/")
        # Strip stage prefix if present (e.g., /dev/signals/NVDA -> /signals/NVDA)
        stage = event.get("requestContext", {}).get("stage", "")
        if stage and path.startswith(f"/{stage}"):
            path = path[len(f"/{stage}"):]
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

        if path.startswith("/feed"):
            return _handle_feed(http_method, body, user_id)
        elif path.startswith("/signals/refresh-all"):
            return _handle_refresh_all(http_method, user_id)
        elif path.startswith("/signals/generate/"):
            ticker = path.split("/signals/generate/")[-1].strip("/").upper()
            return _handle_generate_signal(http_method, ticker, user_id)
        elif path.startswith("/signals/batch"):
            return _handle_batch_signals(http_method, query_params, user_id)
        elif path.startswith("/signals/"):
            ticker = path.split("/signals/")[-1].strip("/").upper()
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


# ─── Signal Endpoints ───

def _handle_signal(method, ticker, user_id):
    """GET /signals/<ticker> — Return full signal from DynamoDB + S3."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    # Try DynamoDB first for summary
    summary = db.get_item(f"SIGNAL#{ticker}", "LATEST")

    if not summary:
        return _response(404, {
            "ticker": ticker,
            "status": "not_found",
            "message": f"No signal data available for {ticker}",
        })

    # Fetch full detail from S3
    full_signal = s3.read_json(f"signals/{ticker}.json")

    if full_signal:
        return _response(200, full_signal)

    # Fallback: return DynamoDB summary
    top_factors = json.loads(summary.get("topFactors", "[]"))
    return _response(200, {
        "ticker": summary["ticker"],
        "companyName": summary.get("companyName", ticker),
        "compositeScore": float(summary.get("compositeScore", 5.0)),
        "signal": summary.get("signal", "HOLD"),
        "confidence": summary.get("confidence", "MEDIUM"),
        "insight": summary.get("insight", ""),
        "reasoning": summary.get("reasoning", ""),
        "topFactors": top_factors,
        "lastUpdated": summary.get("lastUpdated", ""),
    })


def _handle_batch_signals(method, query_params, user_id):
    """GET /signals/batch?tickers=NVDA,AAPL — Batch fetch from DynamoDB."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    tickers_str = query_params.get("tickers", "")
    if not tickers_str:
        return _response(400, {"error": "Missing 'tickers' query parameter"})

    tickers = [t.strip().upper() for t in tickers_str.split(",") if t.strip()]

    if len(tickers) > 50:
        return _response(400, {"error": "Maximum 50 tickers per batch request"})

    # Batch get from DynamoDB
    keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in tickers]
    items = db.batch_get(keys)

    signals = {}
    for item in items:
        ticker = item.get("ticker", "")
        top_factors = json.loads(item.get("topFactors", "[]"))
        signals[ticker] = {
            "ticker": ticker,
            "companyName": item.get("companyName", ticker),
            "compositeScore": float(item.get("compositeScore", 5.0)),
            "signal": item.get("signal", "HOLD"),
            "confidence": item.get("confidence", "MEDIUM"),
            "insight": item.get("insight", ""),
            "topFactors": top_factors,
            "lastUpdated": item.get("lastUpdated", ""),
        }

    return _response(200, {
        "signals": signals,
        "requested": len(tickers),
        "found": len(signals),
    })


def _handle_generate_signal(method, ticker, user_id):
    """POST /signals/generate/<ticker> — On-demand signal generation."""
    if method != "POST":
        return _response(405, {"error": "Method not allowed"})

    if not ticker or len(ticker) > 10:
        return _response(400, {"error": "Invalid ticker"})

    # Invoke the SignalEngine Lambda for on-demand analysis
    import boto3
    import os

    stage = os.environ.get("STAGE", "dev")
    lambda_client = boto3.client("lambda")

    response = lambda_client.invoke(
        FunctionName=f"fii-signal-engine-{stage}",
        InvocationType="RequestResponse",
        Payload=json.dumps({"ticker": ticker}),
    )

    payload = json.loads(response["Payload"].read())
    result = json.loads(payload.get("body", "{}")) if "body" in payload else payload

    return _response(200, {
        "ticker": ticker,
        "status": "completed",
        "message": f"Signal generated for {ticker}",
        "result": result,
    })


def _handle_refresh_all(method, user_id):
    """POST /signals/refresh-all — Trigger refresh for all tracked stocks."""
    if method != "POST":
        return _response(405, {"error": "Method not allowed"})

    import boto3
    import os
    from models import STOCK_UNIVERSE

    stage = os.environ.get("STAGE", "dev")
    lambda_client = boto3.client("lambda")

    # Invoke signal engine asynchronously
    lambda_client.invoke(
        FunctionName=f"fii-signal-engine-{stage}",
        InvocationType="Event",  # Async
        Payload=json.dumps({"tickers": STOCK_UNIVERSE}),
    )

    return _response(200, {
        "status": "initiated",
        "message": f"Refresh initiated for {len(STOCK_UNIVERSE)} stocks",
        "tickers": STOCK_UNIVERSE,
    })


# ─── Feed Endpoint ───

def _handle_feed(method, body, user_id):
    """GET /feed — Return the latest compiled feed."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    # Query all signals from DynamoDB, sorted by score
    items = db.query(
        pk="SIGNALS",
        index_name="GSI1",
        scan_forward=False,
    )

    feed_items = []
    for item in items:
        top_factors = json.loads(item.get("topFactors", "[]"))
        feed_items.append({
            "id": f"signal-{item.get('ticker', '')}",
            "ticker": item.get("ticker", ""),
            "companyName": item.get("companyName", ""),
            "compositeScore": float(item.get("compositeScore", 5.0)),
            "signal": item.get("signal", "HOLD"),
            "insight": item.get("insight", ""),
            "topFactors": top_factors,
            "updatedAt": item.get("lastUpdated", ""),
        })

    return _response(200, {"items": feed_items, "cursor": None})


# ─── Portfolio Endpoints ───

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


# ─── Coach Endpoint ───

def _handle_coach(method, user_id):
    """GET /coach/insights — Return behavioral coaching insights."""
    if method != "GET":
        return _response(405, {"error": "Method not allowed"})

    return _response(200, {"insights": [], "message": "Coach not yet available"})


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

"""FII Strategy Engine — Portfolio optimization and Monte Carlo simulation.

Triggered on-demand via API Gateway.
Runs Sharpe ratio optimization and Monte Carlo simulation
on a user's portfolio holdings.
"""

import json
import os
import traceback
from datetime import datetime


def lambda_handler(event, context):
    """Handle strategy computation requests."""
    try:
        http_method = event.get("requestContext", {}).get("http", {}).get("method", "POST")
        path = event.get("rawPath", "/")
        body = json.loads(event.get("body", "{}") or "{}")
        user_id = (
            event.get("requestContext", {})
            .get("authorizer", {})
            .get("jwt", {})
            .get("claims", {})
            .get("sub", "anonymous")
        )

        if "/optimize" in path:
            return _handle_optimize(body, user_id)
        elif "/montecarlo" in path:
            return _handle_montecarlo(body, user_id)
        else:
            return _response(404, {"error": "Unknown strategy endpoint"})

    except Exception as e:
        traceback.print_exc()
        return _response(500, {"error": str(e)})


def _handle_optimize(body, user_id):
    """POST /strategy/optimize — Run Sharpe ratio optimization."""
    portfolio_id = body.get("portfolioId")
    if not portfolio_id:
        return _response(400, {"error": "portfolioId is required"})

    # Placeholder — will use portfolio_optimizer.py in Prompt 5
    return _response(200, {
        "status": "pending",
        "message": "Optimization not yet implemented",
        "portfolioId": portfolio_id,
    })


def _handle_montecarlo(body, user_id):
    """POST /strategy/montecarlo — Run Monte Carlo simulation."""
    portfolio_id = body.get("portfolioId")
    simulations = body.get("simulations", 10000)

    if not portfolio_id:
        return _response(400, {"error": "portfolioId is required"})

    # Placeholder — will use portfolio_optimizer.py in Prompt 5
    return _response(200, {
        "status": "pending",
        "message": "Monte Carlo simulation not yet implemented",
        "portfolioId": portfolio_id,
        "simulations": simulations,
    })


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

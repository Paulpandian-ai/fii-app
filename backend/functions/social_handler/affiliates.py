"""FII Affiliate Links — Brokerage deep links with click tracking.

DynamoDB patterns:
  AFFILIATE#{userId}#{timestamp} | CLICK — Affiliate click event
"""

import os
import sys
from datetime import datetime, timezone
from urllib.parse import quote

_fn_dir = os.path.dirname(os.path.abspath(__file__))
if _fn_dir not in sys.path:
    sys.path.insert(0, _fn_dir)
if "/opt/python" not in sys.path:
    sys.path.insert(1, "/opt/python")

import db

_utc_now = lambda: datetime.now(timezone.utc)

# ─── Broker Configurations ───

BROKERS = {
    "robinhood": {
        "name": "Robinhood",
        "icon": "logo-usd",
        "color": "#00C805",
        "deepLinkTemplate": "robinhood://stocks/{ticker}",
        "webTemplate": "https://robinhood.com/stocks/{ticker}?ref=fii",
        "description": "Commission-free trading",
    },
    "webull": {
        "name": "Webull",
        "icon": "trending-up",
        "color": "#F5A623",
        "deepLinkTemplate": "webull://quote/{ticker}",
        "webTemplate": "https://www.webull.com/quote/{ticker}?source=fii",
        "description": "Advanced charting & analysis",
    },
    "schwab": {
        "name": "Schwab",
        "icon": "business",
        "color": "#00A0DF",
        "deepLinkTemplate": "schwab://trade?symbol={ticker}",
        "webTemplate": "https://www.schwab.com/research/stocks/quotes/{ticker}?ref=fii",
        "description": "Full-service brokerage",
    },
    "fidelity": {
        "name": "Fidelity",
        "icon": "shield-checkmark",
        "color": "#4B8B3B",
        "deepLinkTemplate": "fidelity://trade?symbol={ticker}",
        "webTemplate": "https://www.fidelity.com/quote/{ticker}?ref=fii",
        "description": "Retirement & long-term investing",
    },
    "interactive_brokers": {
        "name": "Interactive Brokers",
        "icon": "globe",
        "color": "#D32F2F",
        "deepLinkTemplate": "ibkr://trade?symbol={ticker}",
        "webTemplate": "https://www.interactivebrokers.com/en/index.php?f=46510&ticker={ticker}&ref=fii",
        "description": "Professional-grade trading",
    },
}


def get_affiliate_link(broker_name, ticker, user_id):
    """GET /affiliate/link — Generate broker deep link and track click."""
    broker_key = broker_name.lower().replace(" ", "_").replace("-", "_")
    broker = BROKERS.get(broker_key)

    if not broker:
        return {"error": f"Unknown broker: {broker_name}", "availableBrokers": list(BROKERS.keys())}, 400

    ticker = ticker.upper()
    deep_link = broker["deepLinkTemplate"].format(ticker=quote(ticker))
    web_link = broker["webTemplate"].format(ticker=quote(ticker))

    # Track click
    now = _utc_now()
    db.put_item({
        "PK": f"AFFILIATE#{user_id}#{now.strftime('%Y-%m-%dT%H:%M:%S')}",
        "SK": "CLICK",
        "broker": broker_key,
        "ticker": ticker,
        "userId": user_id,
        "timestamp": now.isoformat(),
        "ttl": int(now.timestamp()) + 86400 * 90,  # 90 day retention
    })

    return {
        "broker": broker["name"],
        "ticker": ticker,
        "deepLink": deep_link,
        "webLink": web_link,
        "disclaimer": "FII does not execute trades. You will be redirected to a brokerage app.",
    }


def get_brokers(ticker=None):
    """GET /affiliate/brokers — List available brokers with links."""
    result = []
    for key, broker in BROKERS.items():
        entry = {
            "id": key,
            "name": broker["name"],
            "icon": broker["icon"],
            "color": broker["color"],
            "description": broker["description"],
        }
        if ticker:
            entry["deepLink"] = broker["deepLinkTemplate"].format(ticker=quote(ticker.upper()))
            entry["webLink"] = broker["webTemplate"].format(ticker=quote(ticker.upper()))
        result.append(entry)
    return {"brokers": result, "disclaimer": "FII does not execute trades. You will be redirected to a brokerage app."}

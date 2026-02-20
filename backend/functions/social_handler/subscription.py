"""FII Subscription Management — Tiers, usage tracking, RevenueCat webhooks.

DynamoDB patterns:
  USER#{userId}       | SUBSCRIPTION  — Subscription state
  USAGE#{userId}#{date} | {type}      — Usage counters (signal_views, chat, analyses)
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta

_fn_dir = os.path.dirname(os.path.abspath(__file__))
if _fn_dir not in sys.path:
    sys.path.insert(0, _fn_dir)
if "/opt/python" not in sys.path:
    sys.path.insert(1, "/opt/python")

import db

_utc_now = lambda: datetime.now(timezone.utc)

# ─── Tier Definitions ───

TIERS = {
    "free": {
        "label": "Free",
        "stockLimit": 15,
        "signalViewsPerDay": 3,
        "portfolioStocks": 5,
        "screenerFilters": 3,
        "chatPerDay": 3,
        "onDemandPerMonth": 0,
        "charts": False,
        "alerts": False,
        "communityPosting": False,
        "wealthSimulator": False,
        "taxHarvesting": False,
        "xray": False,
        "apiAccess": False,
    },
    "pro": {
        "label": "Pro",
        "stockLimit": 100,
        "signalViewsPerDay": 999,
        "portfolioStocks": 30,
        "screenerFilters": 999,
        "chatPerDay": 10,
        "onDemandPerMonth": 5,
        "charts": True,
        "alerts": True,
        "communityPosting": True,
        "wealthSimulator": False,
        "taxHarvesting": False,
        "xray": False,
        "apiAccess": False,
    },
    "premium": {
        "label": "Premium",
        "stockLimit": 999,
        "signalViewsPerDay": 999,
        "portfolioStocks": 999,
        "screenerFilters": 999,
        "chatPerDay": 999,
        "onDemandPerMonth": 999,
        "charts": True,
        "alerts": True,
        "communityPosting": True,
        "wealthSimulator": True,
        "taxHarvesting": True,
        "xray": True,
        "apiAccess": True,
    },
}

PRODUCTS = {
    "fii_pro_monthly": {"tier": "pro", "price": 14.99, "period": "monthly"},
    "fii_pro_annual": {"tier": "pro", "price": 119.99, "period": "annual"},
    "fii_premium_monthly": {"tier": "premium", "price": 29.99, "period": "monthly"},
    "fii_premium_annual": {"tier": "premium", "price": 249.99, "period": "annual"},
}


# ─── Subscription Status ───

def get_subscription(user_id):
    """GET /subscription/status — Current tier and limits."""
    item = db.get_item(f"USER#{user_id}", "SUBSCRIPTION")

    if not item:
        return _build_status("free", user_id)

    tier = item.get("tier", "free")
    expires_at = item.get("expiresAt", "")

    # Check expiration
    if expires_at:
        try:
            exp = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            if exp < _utc_now():
                tier = "free"
        except (ValueError, TypeError):
            pass

    return _build_status(tier, user_id, item)


def _build_status(tier, user_id, item=None):
    """Build subscription status response."""
    limits = TIERS.get(tier, TIERS["free"])
    return {
        "userId": user_id,
        "tier": tier,
        "label": limits["label"],
        "expiresAt": (item or {}).get("expiresAt", ""),
        "source": (item or {}).get("source", ""),
        "trialUsed": (item or {}).get("trialUsed", False),
        "limits": limits,
        "products": [
            {
                "id": pid,
                "tier": p["tier"],
                "price": p["price"],
                "period": p["period"],
                "label": f"{TIERS[p['tier']]['label']} ({p['period'].title()})",
            }
            for pid, p in PRODUCTS.items()
        ],
    }


# ─── Usage Tracking ───

def get_usage(user_id):
    """GET /subscription/usage — Current period usage counts."""
    now = _utc_now()
    day_key = now.strftime("%Y-%m-%d")
    month_key = now.strftime("%Y-%m")

    daily = db.get_item(f"USAGE#{user_id}#{day_key}", "DAILY") or {}
    monthly = db.get_item(f"USAGE#{user_id}#{month_key}", "MONTHLY") or {}

    sub = get_subscription(user_id)
    tier = sub["tier"]
    limits = TIERS.get(tier, TIERS["free"])

    signal_views = int(daily.get("signalViews", 0))
    chat_count = int(daily.get("chatCount", 0))
    on_demand = int(monthly.get("onDemandAnalyses", 0))

    return {
        "signalViews": {"used": signal_views, "limit": limits["signalViewsPerDay"]},
        "chat": {"used": chat_count, "limit": limits["chatPerDay"]},
        "onDemandAnalyses": {"used": on_demand, "limit": limits["onDemandPerMonth"]},
        "tier": tier,
        "date": day_key,
        "month": month_key,
    }


def check_and_increment(user_id, usage_type):
    """Check usage limit and increment counter. Returns (allowed, remaining, limit)."""
    now = _utc_now()
    sub = get_subscription(user_id)
    tier = sub["tier"]
    limits = TIERS.get(tier, TIERS["free"])

    if usage_type == "signalViews":
        max_count = limits["signalViewsPerDay"]
        day_key = now.strftime("%Y-%m-%d")
        pk = f"USAGE#{user_id}#{day_key}"
        sk = "DAILY"
        field = "signalViews"
        ttl_seconds = 86400 * 2
    elif usage_type == "chat":
        max_count = limits["chatPerDay"]
        day_key = now.strftime("%Y-%m-%d")
        pk = f"USAGE#{user_id}#{day_key}"
        sk = "DAILY"
        field = "chatCount"
        ttl_seconds = 86400 * 2
    elif usage_type == "onDemandAnalyses":
        max_count = limits["onDemandPerMonth"]
        month_key = now.strftime("%Y-%m")
        pk = f"USAGE#{user_id}#{month_key}"
        sk = "MONTHLY"
        field = "onDemandAnalyses"
        ttl_seconds = 86400 * 35
    else:
        return True, 999, 999

    item = db.get_item(pk, sk) or {}
    current = int(item.get(field, 0))

    if current >= max_count:
        return False, 0, max_count

    update_data = {
        "PK": pk,
        "SK": sk,
        field: current + 1,
        "ttl": int(now.timestamp()) + ttl_seconds,
    }
    db.put_item(update_data)
    return True, max_count - current - 1, max_count


def check_feature(user_id, feature):
    """Check if user's tier allows a feature. Returns (allowed, required_tier)."""
    sub = get_subscription(user_id)
    tier = sub["tier"]
    limits = TIERS.get(tier, TIERS["free"])

    if feature in limits and limits[feature]:
        return True, tier

    # Find the minimum tier that has this feature
    for t in ["pro", "premium"]:
        if TIERS[t].get(feature):
            return False, t

    return False, "premium"


# ─── RevenueCat Webhook ───

def handle_webhook(payload):
    """POST /webhooks/revenuecat — Process subscription lifecycle events."""
    event = payload.get("event", {})
    event_type = event.get("type", "")
    app_user_id = event.get("app_user_id", "")

    if not app_user_id:
        return {"error": "Missing app_user_id"}, 400

    product_id = event.get("product_id", "")
    product_info = PRODUCTS.get(product_id, {})
    now = _utc_now()

    if event_type in ("INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE"):
        tier = product_info.get("tier", "pro")
        period = product_info.get("period", "monthly")

        if period == "annual":
            expires = now + timedelta(days=365)
        else:
            expires = now + timedelta(days=30)

        db.put_item({
            "PK": f"USER#{app_user_id}",
            "SK": "SUBSCRIPTION",
            "tier": tier,
            "productId": product_id,
            "expiresAt": expires.isoformat(),
            "source": event.get("store", "unknown"),
            "trialUsed": True,
            "lastEvent": event_type,
            "updatedAt": now.isoformat(),
        })
        return {"status": "ok", "tier": tier}

    elif event_type in ("CANCELLATION", "EXPIRATION"):
        db.put_item({
            "PK": f"USER#{app_user_id}",
            "SK": "SUBSCRIPTION",
            "tier": "free",
            "productId": "",
            "expiresAt": "",
            "source": "",
            "trialUsed": True,
            "lastEvent": event_type,
            "updatedAt": now.isoformat(),
        })
        return {"status": "ok", "tier": "free"}

    return {"status": "ignored", "eventType": event_type}

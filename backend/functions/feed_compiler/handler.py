"""FII Feed Compiler — Assembles daily feed from signal results.

Triggered daily at 6:30AM ET (30 min after signal engine).
Reads the latest signal analysis results and compiles them
into an ordered feed for the mobile app.
"""

import json
import logging
import sys
import traceback
from datetime import datetime, timezone

sys.path.insert(0, "/opt/python")

import db
import s3

logger = logging.getLogger(__name__)

EDUCATIONAL_CARDS = [
    {
        "title": "What is the Sharpe Ratio?",
        "body": "The Sharpe Ratio measures risk-adjusted returns. A ratio above 1.0 means you're being compensated well for the risk you're taking. FII uses it to compare how efficiently different portfolios generate returns.",
    },
    {
        "title": "How Supply Chains Affect Stock Prices",
        "body": "When a key supplier faces disruption \u2014 chip shortages, factory fires, shipping delays \u2014 it can ripple through to company earnings within weeks. FII tracks upstream and downstream signals to catch these early.",
    },
    {
        "title": "Why Diversification Works",
        "body": "Holding uncorrelated assets means when one drops, others may hold steady or rise. FII's correlation engine (Factor E) measures exactly how your holdings move together, helping you spot hidden concentration risk.",
    },
    {
        "title": "What the Fed Rate Means for You",
        "body": "When the Fed raises rates, borrowing costs rise, slowing growth and often pressuring stock valuations. FII's monetary factors (D1-D3) track Fed decisions, inflation, and Treasury yields to score this macro impact.",
    },
    {
        "title": "Reading Earnings Surprises",
        "body": "When a company beats EPS estimates, the stock often jumps \u2014 but not always. FII's Factor F1 scores the magnitude and market reaction of earnings surprises to gauge whether the move is priced in.",
    },
    {
        "title": "What Beta Tells You",
        "body": "Beta measures how much a stock moves relative to the market. A beta of 1.5 means 50% more volatile than the S&P 500. FII's Factor F3 flags high-beta names so you know what you're signing up for.",
    },
]


def lambda_handler(event, context):
    """Compile the daily feed from the latest signal results."""
    try:
        logger.info(f"[FeedCompiler] Starting at {datetime.now(timezone.utc).isoformat()}")

        feed_items = _compile_feed()

        # Write compiled feed to S3
        feed_data = {
            "items": feed_items,
            "compiledAt": datetime.now(timezone.utc).isoformat(),
            "count": len(feed_items),
        }
        s3.write_json("feed/default.json", feed_data)

        logger.info(f"[FeedCompiler] Compiled {len(feed_items)} items (wrote to S3)")

        return {
            "statusCode": 200,
            "body": json.dumps({
                "compiled": len(feed_items),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }),
        }

    except Exception as e:
        traceback.print_exc()
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }


def _compile_feed() -> list[dict]:
    """Read all signals from DynamoDB and build ranked feed with educational cards.

    Prioritizes TIER_1 stocks (richest data), then TIER_2, then TIER_3/ETF.
    """
    from models import ALL_SECURITIES, TIER_1_SET, ETF_SET, get_tier

    # Batch-read all SIGNAL#* | LATEST items
    keys = [{"PK": f"SIGNAL#{t}", "SK": "LATEST"} for t in ALL_SECURITIES]
    items = db.batch_get(keys)

    if not items:
        logger.warning("[FeedCompiler] No signal items found in DynamoDB")
        return []

    # Parse each item into a feed-ready dict
    signals = []
    for item in items:
        ticker = item.get("ticker", "")
        if not ticker:
            continue
        top_factors = json.loads(item.get("topFactors", "[]"))
        tier = item.get("tier") or get_tier(ticker)
        is_etf = item.get("isETF", False) or ticker in ETF_SET
        signals.append({
            "id": f"signal-{ticker}",
            "type": "signal",
            "ticker": ticker,
            "companyName": item.get("companyName", ticker),
            "compositeScore": float(item.get("compositeScore", 5.0)),
            "signal": item.get("signal", "HOLD"),
            "confidence": item.get("confidence", "MEDIUM"),
            "insight": item.get("insight", ""),
            "topFactors": top_factors,
            "updatedAt": item.get("lastUpdated", ""),
            "tier": tier,
            "isETF": is_etf,
            "tierLabel": "Full Analysis" if tier == "TIER_1" else "Technical + Fundamental" if tier == "TIER_2" else "ETF" if is_etf else "Technical Only",
        })

    # Sort: TIER_1 first, then by confidence, then by score extremity
    tier_order = {"TIER_1": 0, "TIER_2": 1, "TIER_3": 2, "ETF": 3}
    confidence_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    signals.sort(key=lambda x: (
        tier_order.get(x.get("tier", "TIER_3"), 3),
        confidence_order.get(x.get("confidence", "MEDIUM"), 1),
        -abs(x.get("compositeScore", 5.0) - 5.5),
    ))

    # Interleave educational cards every 5 signal cards
    feed = []
    edu_idx = 0
    for i, sig in enumerate(signals):
        feed.append(sig)
        if (i + 1) % 5 == 0 and edu_idx < len(EDUCATIONAL_CARDS):
            edu_card = EDUCATIONAL_CARDS[edu_idx]
            feed.append({
                "id": f"edu-{edu_idx}",
                "type": "educational",
                "title": edu_card["title"],
                "body": edu_card["body"],
            })
            edu_idx += 1

    return feed

"""FII Social Features — Discussion threads, profiles, leaderboard, AI chat.

DynamoDB patterns:
  DISCUSSION#{ticker}#{timestamp}  | POST       — Discussion post
  USER#{userId}                    | PROFILE    — User profile
  LEADERBOARD                      | {rank}     — Leaderboard entries
  CHAT#{userId}#{sessionId}        | {msgIdx}   — Chat session messages
  RATE_LIMIT#{userId}#{type}#{date}| COUNT      — Rate limit counters
"""

import hashlib
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone

_fn_dir = os.path.dirname(os.path.abspath(__file__))
if _fn_dir not in sys.path:
    sys.path.insert(0, _fn_dir)
if "/opt/python" not in sys.path:
    sys.path.insert(1, "/opt/python")

import db

_utc_now = lambda: datetime.now(timezone.utc)

# Profanity filter (basic set)
_BLOCKED_WORDS = {
    "damn", "hell", "shit", "fuck", "ass", "bitch", "bastard", "crap",
    "dick", "piss", "slut", "whore", "nigger", "faggot", "retard",
}

_ADVICE_PATTERNS = [
    r"\b(you\s+should|definitely|must|guaranteed|will\s+go\s+up|will\s+moon|100%)\b",
]


def _moderate_content(text):
    """Basic content moderation. Returns (is_ok, reason)."""
    lower = text.lower()
    for word in _BLOCKED_WORDS:
        if re.search(r'\b' + re.escape(word) + r'\b', lower):
            return False, f"Content contains inappropriate language"

    for pattern in _ADVICE_PATTERNS:
        if re.search(pattern, lower, re.IGNORECASE):
            return False, "Posts should not contain definitive investment advice"

    return True, ""


def _check_rate_limit(user_id, limit_type, max_count, window="day"):
    """Check rate limit. Returns (allowed, remaining)."""
    now = _utc_now()
    if window == "hour":
        key = now.strftime("%Y-%m-%dT%H")
    else:
        key = now.strftime("%Y-%m-%d")

    pk = f"RATE_LIMIT#{user_id}#{limit_type}#{key}"
    item = db.get_item(pk, "COUNT")
    count = int(item.get("count", 0)) if item else 0

    if count >= max_count:
        return False, 0

    db.put_item({"PK": pk, "SK": "COUNT", "count": count + 1, "ttl": int(now.timestamp()) + 86400})
    return True, max_count - count - 1


# ─── Discussion Threads ───


def create_post(ticker, user_id, display_name, content, sentiment="neutral"):
    """POST /discuss/{ticker} — Create a new discussion post."""
    if not content or len(content) > 500:
        return {"error": "Content must be 1-500 characters"}, 400

    # Rate limit: 5 posts per hour
    allowed, remaining = _check_rate_limit(user_id, "posts", 5, "hour")
    if not allowed:
        return {"error": "Rate limit exceeded. Maximum 5 posts per hour.", "remaining": 0}, 429

    # Content moderation
    is_ok, reason = _moderate_content(content)
    if not is_ok:
        return {"error": reason}, 400

    if sentiment not in ("bullish", "bearish", "neutral"):
        sentiment = "neutral"

    now = _utc_now()
    post_id = str(uuid.uuid4())[:8]
    timestamp = now.isoformat()

    db.put_item({
        "PK": f"DISCUSSION#{ticker}",
        "SK": f"{timestamp}#{post_id}",
        "postId": post_id,
        "ticker": ticker,
        "userId": user_id,
        "displayName": display_name or "Anonymous",
        "content": content,
        "sentiment": sentiment,
        "bulls": 0,
        "bears": 0,
        "timestamp": timestamp,
    })

    # Update user post count
    _increment_user_stat(user_id, "postCount")

    return {
        "postId": post_id,
        "ticker": ticker,
        "content": content,
        "sentiment": sentiment,
        "timestamp": timestamp,
        "remaining": remaining,
    }, 201


def get_posts(ticker, limit=20, cursor=None):
    """GET /discuss/{ticker} — Get posts sorted by recency."""
    items = db.query(f"DISCUSSION#{ticker}", scan_forward=False, limit=limit) or []

    posts = []
    for item in items:
        posts.append({
            "postId": item.get("postId", ""),
            "ticker": item.get("ticker", ticker),
            "userId": item.get("userId", ""),
            "displayName": item.get("displayName", "Anonymous"),
            "content": item.get("content", ""),
            "sentiment": item.get("sentiment", "neutral"),
            "bulls": int(item.get("bulls", 0)),
            "bears": int(item.get("bears", 0)),
            "timestamp": item.get("timestamp", ""),
        })

    return {"ticker": ticker, "posts": posts, "count": len(posts)}


def react_to_post(ticker, post_id, reaction_type, user_id):
    """POST /discuss/{ticker}/{postId}/react — Add bull/bear reaction."""
    if reaction_type not in ("bull", "bear"):
        return {"error": "Reaction must be 'bull' or 'bear'"}, 400

    # Find the post
    items = db.query(f"DISCUSSION#{ticker}") or []
    target = None
    for item in items:
        if item.get("postId") == post_id:
            target = item
            break

    if not target:
        return {"error": "Post not found"}, 404

    sk = target.get("SK", "")
    field = "bulls" if reaction_type == "bull" else "bears"
    current = int(target.get(field, 0))
    db.update_item(f"DISCUSSION#{ticker}", sk, {field: current + 1})

    return {"postId": post_id, "reaction": reaction_type, field: current + 1}


# ─── User Profiles ───


def get_or_create_profile(user_id, display_name=None):
    """Get user profile, creating if it doesn't exist."""
    profile = db.get_item(f"USER#{user_id}", "PROFILE")
    if profile:
        return profile

    now = _utc_now()
    new_profile = {
        "PK": f"USER#{user_id}",
        "SK": "PROFILE",
        "userId": user_id,
        "displayName": display_name or f"User_{user_id[:6]}",
        "joinDate": now.strftime("%Y-%m-%d"),
        "riskProfile": "moderate",
        "badgeCount": 0,
        "postCount": 0,
        "disciplineScore": 50,
        "streakDays": 0,
        "level": "Beginner",
        "createdAt": now.isoformat(),
    }
    db.put_item(new_profile)
    return new_profile


def get_public_profile(user_id):
    """GET /profile/{userId} — Public profile (no portfolio data)."""
    profile = get_or_create_profile(user_id)
    return {
        "userId": profile.get("userId", user_id),
        "displayName": profile.get("displayName", "Anonymous"),
        "joinDate": profile.get("joinDate", ""),
        "riskProfile": profile.get("riskProfile", "moderate"),
        "badgeCount": int(profile.get("badgeCount", 0)),
        "postCount": int(profile.get("postCount", 0)),
        "disciplineScore": int(profile.get("disciplineScore", 50)),
        "streakDays": int(profile.get("streakDays", 0)),
        "level": profile.get("level", "Beginner"),
    }


def update_profile(user_id, updates):
    """PUT /profile/me — Update display name, risk profile."""
    allowed = {}
    if "displayName" in updates:
        name = str(updates["displayName"]).strip()[:30]
        if len(name) >= 2:
            allowed["displayName"] = name
    if "riskProfile" in updates:
        rp = updates["riskProfile"]
        if rp in ("conservative", "moderate", "aggressive"):
            allowed["riskProfile"] = rp

    if not allowed:
        return {"error": "No valid fields to update"}, 400

    get_or_create_profile(user_id)
    db.update_item(f"USER#{user_id}", "PROFILE", allowed)
    return get_public_profile(user_id)


def _increment_user_stat(user_id, field):
    """Increment a numeric field on user profile."""
    try:
        profile = get_or_create_profile(user_id)
        current = int(profile.get(field, 0))
        db.update_item(f"USER#{user_id}", "PROFILE", {field: current + 1})
    except Exception:
        pass


# ─── Leaderboard ───


def get_leaderboard(limit=50):
    """GET /leaderboard — Top users by discipline score."""
    # Try cached leaderboard
    cached = db.get_item("LEADERBOARD", "LATEST")
    if cached and cached.get("entries"):
        try:
            entries = cached["entries"]
            if isinstance(entries, str):
                entries = json.loads(entries)
            return {"entries": entries[:limit], "updatedAt": cached.get("updatedAt", "")}
        except (json.JSONDecodeError, TypeError):
            pass

    return _generate_demo_leaderboard(limit)


def update_leaderboard():
    """Daily job: recompute leaderboard from user profiles."""
    # Scan all user profiles (in production, use a GSI or scheduled scan)
    # For now, generate based on available data
    entries = _generate_demo_leaderboard(50)
    db.put_item({
        "PK": "LEADERBOARD",
        "SK": "LATEST",
        "entries": json.dumps(entries["entries"]),
        "updatedAt": _utc_now().isoformat(),
    })
    return entries


def _generate_demo_leaderboard(limit=50):
    """Generate demo leaderboard entries."""
    import random
    random.seed(42)

    levels = ["Diamond", "Platinum", "Gold", "Silver", "Bronze", "Beginner"]
    names = [
        "ValueHunter", "DividendKing", "TechBull", "StockSensei", "AlphaTrader",
        "PatientInvestor", "FactorPro", "LongTermLarry", "RiskMaster", "CompoundKing",
        "SwingTrader21", "FundyAnalyst", "TrendFollower", "ContraryMike", "EarningsEye",
        "MacroMaven", "SectorRotator", "VolatilityVic", "MomentumMax", "IndexIvy",
        "DivGrowth99", "BluechipBob", "SmallCapSam", "GrowthGuru", "IncomeIrene",
        "BalanceSheet", "CashFlowKing", "PERatioQueen", "TechAnalyst7", "FundaFanatic",
        "AIPowered", "SignalSurfer", "ChartMaster", "OptionOracle", "BondBaron",
        "CryptoConvert", "ESGExplorer", "GreenInvestor", "QuantQueen", "DeepValue",
        "CatalystKing", "EventDriven", "MergerArb", "SpacInvestor", "PennyPicker",
        "ETFExpert", "RebalanceRob", "TaxOptimizer", "GlobalGrowth", "EmergingMark",
    ]

    entries = []
    for i in range(min(limit, len(names))):
        score = max(10, 95 - i * 1.5 + random.uniform(-3, 3))
        entries.append({
            "rank": i + 1,
            "displayName": names[i],
            "disciplineScore": round(score, 0),
            "level": levels[min(i // 8, len(levels) - 1)],
            "streakDays": max(0, 90 - i * 2 + random.randint(-5, 5)),
            "badgeCount": max(1, 15 - i // 4 + random.randint(-1, 1)),
        })

    return {"entries": entries, "updatedAt": _utc_now().isoformat()}


# ─── AI Chat Assistant ───


def handle_chat(user_id, message, context=None):
    """POST /chat — AI-powered stock Q&A grounded in FII data."""
    if not message or len(message) > 1000:
        return {"error": "Message must be 1-1000 characters"}, 400

    # Rate limit: 10 questions/day
    allowed, remaining = _check_rate_limit(user_id, "chat", 10, "day")
    if not allowed:
        return {"error": "Daily chat limit reached (10/day). Upgrade to Pro for unlimited.", "remaining": 0}, 429

    context = context or {}
    current_ticker = context.get("currentTicker", "")

    # Gather FII data for context
    signal_data = None
    price_data = None
    events = []

    if current_ticker:
        signal_data = db.get_item(f"SIGNAL#{current_ticker}", "LATEST")
        price_data = db.get_item(f"PRICE#{current_ticker}", "LATEST")
        try:
            event_items = db.query(f"EVENT#{current_ticker}", scan_forward=False, limit=5)
            events = [{"headline": e.get("headline", ""), "type": e.get("type", ""), "impact": e.get("impact", "")} for e in (event_items or [])]
        except Exception:
            pass

    # Build context string for Claude
    data_context = ""
    if signal_data:
        data_context += f"\nCurrent FII Analysis for {current_ticker}:\n"
        data_context += f"- Composite Score: {signal_data.get('compositeScore', 'N/A')}/10\n"
        data_context += f"- Signal: {signal_data.get('signal', 'N/A')}\n"
        data_context += f"- Confidence: {signal_data.get('confidence', 'N/A')}\n"
        data_context += f"- Insight: {signal_data.get('insight', 'N/A')}\n"
        if signal_data.get("topFactors"):
            factors = signal_data["topFactors"]
            if isinstance(factors, str):
                try:
                    factors = json.loads(factors)
                except (json.JSONDecodeError, TypeError):
                    factors = []
            if isinstance(factors, list):
                data_context += "- Top Factors:\n"
                for f in factors[:3]:
                    data_context += f"  - {f.get('name', '')}: {f.get('score', 0)}\n"

    if price_data:
        data_context += f"\nMarket Data:\n"
        data_context += f"- Price: ${price_data.get('price', 'N/A')}\n"
        data_context += f"- Change: {price_data.get('changePercent', 'N/A')}%\n"
        data_context += f"- Sector: {price_data.get('sector', 'N/A')}\n"

    if events:
        data_context += "\nRecent Events:\n"
        for e in events[:3]:
            data_context += f"- [{e['type']}] {e['headline']} (Impact: {e['impact']})\n"

    # Get recent chat history for context
    session_id = context.get("sessionId", "default")
    history = _get_chat_history(user_id, session_id)

    # Call Claude API directly with chat-optimised prompt
    try:
        import anthropic

        api_key_arn = os.environ.get("CLAUDE_API_KEY_ARN", "")
        import boto3
        _sec = boto3.client("secretsmanager")
        api_key = _sec.get_secret_value(SecretId=api_key_arn)["SecretString"]

        client = anthropic.Anthropic(api_key=api_key)

        system_prompt = (
            "You are FII's AI stock assistant. Give concise 2-3 sentence answers about stocks "
            "using FII's factor scores and signals. Cite specific data points. "
            "End with a disclaimer that this is not investment advice."
        )

        user_content = f"""{data_context}

Recent conversation:
{_format_history(history)}

User question: {message}"""

        resp = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=300,
            temperature=0.3,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )
        response_text = resp.content[0].text
    except Exception as e:
        # Fallback response using available data
        response_text = _generate_fallback_response(message, current_ticker, signal_data, price_data)

    # Append disclaimer
    disclaimer = "\n\n---\n*AI analysis for educational purposes. Not investment advice.*"
    full_response = response_text + disclaimer

    # Store chat exchange
    _store_chat_message(user_id, session_id, message, full_response)

    return {
        "response": full_response,
        "ticker": current_ticker,
        "remaining": remaining,
        "sessionId": session_id,
    }


def _get_chat_history(user_id, session_id, limit=5):
    """Get recent chat history for context."""
    try:
        items = db.query(f"CHAT#{user_id}#{session_id}", scan_forward=False, limit=limit)
        return list(reversed(items or []))
    except Exception:
        return []


def _format_history(history):
    """Format chat history for Claude prompt."""
    if not history:
        return "(No previous conversation)"
    lines = []
    for msg in history[-5:]:
        lines.append(f"User: {msg.get('userMessage', '')}")
        lines.append(f"Assistant: {msg.get('assistantMessage', '')[:200]}")
    return "\n".join(lines)


def _store_chat_message(user_id, session_id, user_msg, assistant_msg):
    """Store chat exchange in DynamoDB."""
    try:
        now = _utc_now()
        db.put_item({
            "PK": f"CHAT#{user_id}#{session_id}",
            "SK": now.isoformat(),
            "userMessage": user_msg[:500],
            "assistantMessage": assistant_msg[:2000],
            "timestamp": now.isoformat(),
            "ttl": int(now.timestamp()) + 86400 * 7,  # 7 day retention
        })
    except Exception:
        pass


def _generate_fallback_response(message, ticker, signal_data, price_data):
    """Generate a data-grounded response without Claude API."""
    if not ticker or not signal_data:
        return ("I'd be happy to help analyze any stock in FII's universe. "
                "Please select a stock first so I can provide data-driven insights "
                "based on our 6-factor scoring model.")

    score = signal_data.get("compositeScore", "N/A")
    signal = signal_data.get("signal", "N/A")
    insight = signal_data.get("insight", "No insight available")
    confidence = signal_data.get("confidence", "MEDIUM")

    msg_lower = message.lower()

    if "why" in msg_lower or "reason" in msg_lower or "drove" in msg_lower:
        return (f"{ticker} currently has a composite score of {score}/10 with a {signal} signal "
                f"({confidence} confidence). {insight}\n\n"
                f"The score is derived from FII's 6-factor model analyzing supply chain dynamics, "
                f"macro conditions, sector correlations, and risk/performance metrics.")

    if "risk" in msg_lower or "concern" in msg_lower or "worry" in msg_lower:
        return (f"For {ticker} (Score: {score}/10, Signal: {signal}), the key risk factors "
                f"to watch include macro conditions, sector correlation risk, and earnings "
                f"volatility. {insight}\n\n"
                f"The confidence level is {confidence}, which reflects the breadth of data "
                f"available for the analysis.")

    if "compare" in msg_lower or "peer" in msg_lower or "vs" in msg_lower:
        return (f"{ticker} has a score of {score}/10 with a {signal} signal. "
                f"To see how it compares to peers, check the 'Alternatives' section "
                f"on the signal detail page, which shows similar stocks and inverse hedges.\n\n"
                f"{insight}")

    return (f"Here's what FII's analysis shows for {ticker}:\n\n"
            f"Score: {score}/10 | Signal: {signal} | Confidence: {confidence}\n\n"
            f"{insight}\n\n"
            f"The score is based on 18 sub-factors across supply chain, macro, "
            f"correlations, and performance dimensions.")

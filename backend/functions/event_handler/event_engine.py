"""FII Event Engine — Real-time event processing for news, SEC filings, and macro data.

Monitors:
  1. Company news via Finnhub API (every 15 min during market hours)
  2. SEC filings via EDGAR Submissions API (every 5 min during market hours)
  3. Macro economic releases via Finnhub calendar + FRED (on release days)

Events are classified by impact, stored in DynamoDB, and trigger signal re-scoring
for high-impact events. Push notifications sent via SNS for P0/P1 events.
"""

import hashlib
import json
import os
import sys
import traceback
import urllib.request
import urllib.parse
from datetime import datetime, timedelta, timezone

_fn_dir = os.path.dirname(os.path.abspath(__file__))
if _fn_dir not in sys.path:
    sys.path.insert(0, _fn_dir)
if "/opt/python" not in sys.path:
    sys.path.insert(1, "/opt/python")

import db

TABLE_NAME = os.environ.get("TABLE_NAME", "fii-table")
FINNHUB_API_KEY_ARN = os.environ.get("FINNHUB_API_KEY_ARN", "")
CLAUDE_API_KEY_ARN = os.environ.get("CLAUDE_API_KEY_ARN", "")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")

# ─── Secrets Cache ───

_secrets_cache = {}


def _get_secret(arn):
    """Retrieve secret from AWS Secrets Manager with caching."""
    if not arn:
        return ""
    if arn in _secrets_cache:
        return _secrets_cache[arn]
    try:
        import boto3
        sm = boto3.client("secretsmanager")
        resp = sm.get_secret_value(SecretId=arn)
        val = resp.get("SecretString", "")
        _secrets_cache[arn] = val
        return val
    except Exception as e:
        print(f"[EventEngine] Failed to get secret {arn}: {e}")
        return ""


def _get_finnhub_key():
    return _get_secret(FINNHUB_API_KEY_ARN)


def _get_claude_key():
    return _get_secret(CLAUDE_API_KEY_ARN)


# ─── Utility ───

def _headline_hash(headline):
    """Generate a short hash from a headline for deduplication."""
    return hashlib.md5(headline.strip().lower().encode()).hexdigest()[:16]


def _utc_now():
    return datetime.now(timezone.utc)


def _is_market_hours():
    """Check if current UTC time is within US market hours (9 AM - 6 PM ET)."""
    now = _utc_now()
    # ET = UTC-5 (EST) or UTC-4 (EDT); approximate with UTC-5
    et_hour = (now.hour - 5) % 24
    return 9 <= et_hour < 18 and now.weekday() < 5


def _finnhub_get(endpoint, params=None):
    """Make a GET request to Finnhub API."""
    key = _get_finnhub_key()
    if not key:
        return None
    base = "https://finnhub.io/api/v1"
    params = params or {}
    params["token"] = key
    qs = urllib.parse.urlencode(params)
    url = f"{base}/{endpoint}?{qs}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "FII/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"[EventEngine] Finnhub request failed: {endpoint} — {e}")
        return None


def _classify_with_claude(ticker, headline):
    """Use Claude API to classify a news headline's impact on a stock."""
    key = _get_claude_key()
    if not key:
        return {
            "impact": "low",
            "direction": "neutral",
            "category": "macro",
            "factorsAffected": [],
            "summary": headline[:120],
        }

    prompt = (
        f'Classify this news headline for {ticker}:\n'
        f'"{headline}"\n\n'
        f'Respond with JSON only: {{"impact": "high"/"medium"/"low"/"none", '
        f'"direction": "positive"/"negative"/"neutral", '
        f'"category": "earnings"/"partnership"/"regulatory"/"product"/"legal"/"management"/"macro", '
        f'"factorsAffected": ["supplierRisk", "revenueGrowth", ...], '
        f'"summary": "One-sentence impact summary"}}'
    )

    try:
        body = json.dumps({
            "model": "claude-sonnet-4-5-20250929",
            "max_tokens": 256,
            "messages": [{"role": "user", "content": prompt}],
        }).encode()

        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "Content-Type": "application/json",
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            text = result.get("content", [{}])[0].get("text", "{}")
            # Strip markdown fences if present
            text = text.strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            return json.loads(text)
    except Exception as e:
        print(f"[EventEngine] Claude classification failed: {e}")
        return {
            "impact": "medium",
            "direction": "neutral",
            "category": "macro",
            "factorsAffected": [],
            "summary": headline[:120],
        }


# ─── 1. News Event Monitor ───

def monitor_news(tickers):
    """Fetch and classify news for tracked tickers. Returns list of new events."""
    today = _utc_now().strftime("%Y-%m-%d")
    new_events = []

    for ticker in tickers:
        try:
            from_date = (_utc_now() - timedelta(hours=1)).strftime("%Y-%m-%d")
            to_date = today
            articles = _finnhub_get("company-news", {
                "symbol": ticker,
                "from": from_date,
                "to": to_date,
            })
            if not articles:
                continue

            for article in articles[:10]:  # Limit to 10 per ticker per run
                headline = article.get("headline", "")
                if not headline:
                    continue

                h_hash = _headline_hash(headline)

                # Check if already seen
                seen_key = f"NEWS_SEEN#{today}"
                existing = db.get_item(seen_key, h_hash)
                if existing:
                    continue

                # Mark as seen
                db.put_item({
                    "PK": seen_key,
                    "SK": h_hash,
                    "headline": headline[:200],
                    "ticker": ticker,
                    "seenAt": _utc_now().isoformat(),
                    "ttl": int((_utc_now() + timedelta(days=7)).timestamp()),
                })

                # Classify with Claude
                classification = _classify_with_claude(ticker, headline)
                if classification.get("impact") == "none":
                    continue

                timestamp = _utc_now().isoformat()
                event = {
                    "PK": f"EVENT#{ticker}",
                    "SK": f"{timestamp}#NEWS",
                    "GSI1PK": "EVENTS#ALL",
                    "GSI1SK": timestamp,
                    "ticker": ticker,
                    "type": "news",
                    "headline": headline[:300],
                    "source": article.get("source", ""),
                    "sourceUrl": article.get("url", ""),
                    "impact": classification.get("impact", "low"),
                    "direction": classification.get("direction", "neutral"),
                    "category": classification.get("category", "macro"),
                    "factorsAffected": classification.get("factorsAffected", []),
                    "summary": classification.get("summary", headline[:120]),
                    "timestamp": timestamp,
                    "ttl": int((_utc_now() + timedelta(days=30)).timestamp()),
                }
                db.put_item(event)
                new_events.append(event)

        except Exception as e:
            print(f"[EventEngine] News monitor error for {ticker}: {e}")
            traceback.print_exc()

    return new_events


# ─── 2. SEC Filing Monitor ───

# 8-K item types and their impact classification
ITEM_8K_IMPACT = {
    "1.01": ("high", "Material Agreement"),
    "1.02": ("high", "Termination of Material Agreement"),
    "1.03": ("medium", "Bankruptcy"),
    "2.01": ("high", "Acquisition/Disposal of Assets"),
    "2.02": ("high", "Financial Results"),
    "2.03": ("medium", "Creation of Obligation"),
    "2.04": ("high", "Triggering Events"),
    "2.05": ("medium", "Costs for Exit"),
    "2.06": ("medium", "Material Impairments"),
    "3.01": ("medium", "Delisting Notice"),
    "3.02": ("medium", "Unregistered Sales"),
    "3.03": ("medium", "Charter Amendment"),
    "4.01": ("medium", "Auditor Changes"),
    "4.02": ("high", "Non-Reliance on Financials"),
    "5.01": ("medium", "Corp Governance Change"),
    "5.02": ("medium", "Executive Changes"),
    "5.03": ("low", "Bylaw Amendment"),
    "5.07": ("low", "Shareholder Vote Results"),
    "7.01": ("low", "Regulation FD Disclosure"),
    "8.01": ("medium", "Other Events"),
    "9.01": ("low", "Financial Exhibits"),
}


def _fetch_sec_filings(ticker):
    """Fetch recent SEC filings for a ticker via EDGAR full-text search."""
    try:
        url = f"https://efts.sec.gov/LATEST/search-index?q=%22{ticker}%22&dateRange=custom&startdt={(_utc_now() - timedelta(hours=1)).strftime('%Y-%m-%d')}&enddt={_utc_now().strftime('%Y-%m-%d')}&forms=8-K,4,SC%2013D,SC%2013G"
        req = urllib.request.Request(url, headers={
            "User-Agent": "FII Research contact@factorimpact.app",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return None


def _parse_form4(filing_data):
    """Parse Form 4 insider trading data."""
    return {
        "insiderName": filing_data.get("reportingOwner", "Unknown"),
        "title": filing_data.get("issuerRelationship", ""),
        "transactionType": filing_data.get("transactionCode", ""),
        "shares": filing_data.get("transactionShares", 0),
        "pricePerShare": filing_data.get("transactionPricePerShare", 0),
        "totalValue": filing_data.get("transactionShares", 0) * filing_data.get("transactionPricePerShare", 0),
    }


def monitor_sec_filings(tickers):
    """Monitor SEC filings for tracked tickers. Returns list of new events."""
    new_events = []

    for ticker in tickers:
        try:
            # Use EDGAR EFTS full-text search API
            from_date = (_utc_now() - timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%S")
            url = (
                f"https://efts.sec.gov/LATEST/search-index?"
                f"q=%22{ticker}%22&forms=8-K,4,SC+13D,SC+13G&dateRange=custom"
                f"&startdt={(_utc_now() - timedelta(days=1)).strftime('%Y-%m-%d')}"
                f"&enddt={_utc_now().strftime('%Y-%m-%d')}"
            )

            req = urllib.request.Request(url, headers={
                "User-Agent": "FII Research contact@factorimpact.app",
                "Accept": "application/json",
            })

            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode())
            except Exception:
                # Fallback: use Finnhub SEC filings endpoint
                data = _finnhub_get("stock/filings", {"symbol": ticker, "from": (_utc_now() - timedelta(days=1)).strftime("%Y-%m-%d")})
                if not data:
                    continue
                # Normalize Finnhub response format
                filings = data if isinstance(data, list) else data.get("filings", [])
                for filing in filings[:5]:
                    form_type = filing.get("form", filing.get("formType", ""))
                    filed_date = filing.get("filedDate", filing.get("acceptedDate", ""))
                    filing_url = filing.get("reportUrl", filing.get("url", ""))

                    # Skip filings with empty/null formType
                    if not form_type or not form_type.strip():
                        continue

                    # Dedup check
                    filing_hash = _headline_hash(f"{ticker}{form_type}{filed_date}")
                    seen_key = f"FILING_SEEN#{_utc_now().strftime('%Y-%m-%d')}"
                    if db.get_item(seen_key, filing_hash):
                        continue
                    db.put_item({
                        "PK": seen_key, "SK": filing_hash,
                        "ticker": ticker, "seenAt": _utc_now().isoformat(),
                        "ttl": int((_utc_now() + timedelta(days=7)).timestamp()),
                    })

                    # Determine impact
                    if form_type in ("8-K", "8-K/A"):
                        items = filing.get("items", "")
                        impact = "medium"
                        description = "8-K Filing"
                        for item_code, (item_impact, item_desc) in ITEM_8K_IMPACT.items():
                            if item_code in str(items):
                                if item_impact == "high":
                                    impact = "high"
                                    description = f"8-K: {item_desc}"
                                    break
                                elif impact != "high":
                                    impact = item_impact
                                    description = f"8-K: {item_desc}"
                    elif form_type in ("4", "4/A"):
                        impact = "medium"
                        description = "Insider Transaction (Form 4)"
                    elif form_type in ("SC 13D", "SC 13D/A", "SC 13G", "SC 13G/A"):
                        impact = "high"
                        description = f"5%+ Ownership Change ({form_type})"
                    else:
                        impact = "low"
                        description = f"SEC Filing: {form_type}"

                    # Populate headline from description if empty
                    headline = filing.get("headline", "") or filing.get("description", "") or description
                    if not headline or not headline.strip():
                        headline = description

                    # Only store filings with meaningful data
                    if not form_type.strip() or not headline.strip():
                        continue

                    timestamp = _utc_now().isoformat()
                    event = {
                        "PK": f"EVENT#{ticker}",
                        "SK": f"{timestamp}#FILING",
                        "GSI1PK": "EVENTS#ALL",
                        "GSI1SK": timestamp,
                        "ticker": ticker,
                        "type": "filing",
                        "formType": form_type,
                        "headline": headline,
                        "impact": impact,
                        "direction": "neutral",
                        "category": "regulatory",
                        "summary": description,
                        "sourceUrl": filing_url,
                        "filedDate": filed_date,
                        "timestamp": timestamp,
                        "ttl": int((_utc_now() + timedelta(days=30)).timestamp()),
                    }
                    db.put_item(event)
                    new_events.append(event)
                continue

            # Process EDGAR search results
            hits = data.get("hits", {}).get("hits", [])
            for hit in hits[:5]:
                source = hit.get("_source", {})
                form_type = source.get("form_type", "")
                filed_date = source.get("file_date", "")
                filing_url = f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={ticker}&type={form_type}"

                # Skip filings with empty/null formType
                if not form_type or not form_type.strip():
                    continue

                filing_hash = _headline_hash(f"{ticker}{form_type}{filed_date}")
                seen_key = f"FILING_SEEN#{_utc_now().strftime('%Y-%m-%d')}"
                if db.get_item(seen_key, filing_hash):
                    continue
                db.put_item({
                    "PK": seen_key, "SK": filing_hash,
                    "ticker": ticker, "seenAt": _utc_now().isoformat(),
                    "ttl": int((_utc_now() + timedelta(days=7)).timestamp()),
                })

                if "8-K" in form_type:
                    impact = "medium"
                    description = "8-K Material Event Filing"
                elif form_type == "4":
                    impact = "medium"
                    description = "Insider Transaction (Form 4)"
                elif "13D" in form_type or "13G" in form_type:
                    impact = "high"
                    description = f"5%+ Ownership Change ({form_type})"
                else:
                    impact = "low"
                    description = f"SEC Filing: {form_type}"

                # Populate headline from description if empty
                headline = source.get("headline", "") or source.get("description", "") or description
                if not headline or not headline.strip():
                    headline = description

                # Only store filings with meaningful data
                if not form_type.strip() or not headline.strip():
                    continue

                timestamp = _utc_now().isoformat()
                event = {
                    "PK": f"EVENT#{ticker}",
                    "SK": f"{timestamp}#FILING",
                    "GSI1PK": "EVENTS#ALL",
                    "GSI1SK": timestamp,
                    "ticker": ticker,
                    "type": "filing",
                    "formType": form_type,
                    "headline": headline,
                    "impact": impact,
                    "direction": "neutral",
                    "category": "regulatory",
                    "summary": description,
                    "sourceUrl": filing_url,
                    "filedDate": filed_date,
                    "timestamp": timestamp,
                    "ttl": int((_utc_now() + timedelta(days=30)).timestamp()),
                }
                db.put_item(event)
                new_events.append(event)

        except Exception as e:
            print(f"[EventEngine] SEC monitor error for {ticker}: {e}")
            traceback.print_exc()

    # Check for insider cluster buying (3+ insiders within 30 days)
    _check_insider_clusters(tickers, new_events)

    return new_events


def _check_insider_clusters(tickers, events):
    """Detect cluster insider buying: 3+ insiders buying within 30 days."""
    for ticker in tickers:
        try:
            thirty_days_ago = (_utc_now() - timedelta(days=30)).isoformat()
            result = db.query_between(
                f"EVENT#{ticker}",
                f"{thirty_days_ago}#FILING",
                f"{_utc_now().isoformat()}#FILING~",
            )
            insider_buys = [
                r for r in (result or [])
                if r.get("formType") in ("4", "4/A") and "buy" in r.get("summary", "").lower()
            ]
            if len(insider_buys) >= 3:
                timestamp = _utc_now().isoformat()
                cluster_event = {
                    "PK": f"EVENT#{ticker}",
                    "SK": f"{timestamp}#INSIDER_CLUSTER",
                    "GSI1PK": "EVENTS#ALL",
                    "GSI1SK": timestamp,
                    "ticker": ticker,
                    "type": "filing",
                    "impact": "high",
                    "direction": "positive",
                    "category": "management",
                    "summary": f"Insider cluster buying: {len(insider_buys)} insiders purchased shares in 30 days — bullish signal",
                    "insiderCount": len(insider_buys),
                    "timestamp": timestamp,
                    "ttl": int((_utc_now() + timedelta(days=30)).timestamp()),
                }
                db.put_item(cluster_event)
                events.append(cluster_event)
        except Exception as e:
            print(f"[EventEngine] Cluster check error for {ticker}: {e}")


# ─── 3. Macro Event Monitor ───

# Sector sensitivity matrix: indicator -> direction -> sector impacts
MACRO_SENSITIVITY = {
    "CPI": {
        "above": {"Technology": -0.5, "Consumer Discretionary": -0.3, "Financials": 0.3, "Utilities": -0.2},
        "below": {"Technology": 0.3, "Consumer Discretionary": 0.2, "Financials": -0.2, "Real Estate": 0.3},
    },
    "Federal Funds Rate": {
        "above": {"Real Estate": -0.5, "Utilities": -0.4, "Financials": 0.3, "Technology": -0.3},
        "below": {"Real Estate": 0.4, "Utilities": 0.3, "Financials": -0.2, "Technology": 0.3},
    },
    "Non-Farm Payrolls": {
        "above": {"Consumer Discretionary": 0.3, "Financials": 0.2, "Real Estate": -0.2, "Technology": -0.1},
        "below": {"Consumer Discretionary": -0.3, "Financials": -0.2, "Real Estate": 0.1, "Utilities": 0.2},
    },
    "GDP": {
        "above": {"Consumer Discretionary": 0.3, "Industrials": 0.3, "Financials": 0.2, "Technology": 0.2},
        "below": {"Consumer Discretionary": -0.3, "Industrials": -0.3, "Utilities": 0.2, "Healthcare": 0.1},
    },
    "ISM Manufacturing PMI": {
        "above": {"Industrials": 0.4, "Materials": 0.3, "Energy": 0.2},
        "below": {"Industrials": -0.3, "Materials": -0.3, "Utilities": 0.2},
    },
    "Retail Sales": {
        "above": {"Consumer Discretionary": 0.4, "Consumer Staples": 0.2},
        "below": {"Consumer Discretionary": -0.4, "Consumer Staples": -0.1},
    },
}

# Map of indicators to their historical standard deviations for surprise scoring
MACRO_HISTORICAL_STDDEV = {
    "CPI": 0.3,
    "Federal Funds Rate": 0.25,
    "Non-Farm Payrolls": 80.0,
    "GDP": 0.5,
    "ISM Manufacturing PMI": 2.0,
    "Retail Sales": 0.5,
}


def monitor_macro_events():
    """Monitor macro economic releases and compute surprise scores. Returns list of new events."""
    new_events = []
    today = _utc_now().strftime("%Y-%m-%d")

    try:
        # Fetch economic calendar from Finnhub
        cal = _finnhub_get("calendar/economic", {
            "from": today,
            "to": today,
        })
        if not cal:
            return new_events

        events_list = cal.get("economicCalendar", cal.get("result", []))
        if not events_list:
            return new_events

        for release in events_list:
            indicator = release.get("event", "")
            actual = release.get("actual")
            estimate = release.get("estimate")
            country = release.get("country", "")

            # Only track US indicators
            if country and country.upper() != "US":
                continue

            # Must have actual value (released) and estimate
            if actual is None or estimate is None:
                continue

            # Match to known indicators
            matched_indicator = None
            for known in MACRO_SENSITIVITY:
                if known.lower() in indicator.lower():
                    matched_indicator = known
                    break
            if not matched_indicator:
                continue

            # Dedup
            event_hash = _headline_hash(f"MACRO#{matched_indicator}#{today}")
            seen_key = f"MACRO_SEEN#{today}"
            if db.get_item(seen_key, event_hash):
                continue
            db.put_item({
                "PK": seen_key, "SK": event_hash,
                "indicator": matched_indicator, "seenAt": _utc_now().isoformat(),
                "ttl": int((_utc_now() + timedelta(days=7)).timestamp()),
            })

            # Compute surprise score
            try:
                actual_val = float(actual)
                estimate_val = float(estimate)
            except (ValueError, TypeError):
                continue

            stddev = MACRO_HISTORICAL_STDDEV.get(matched_indicator, 1.0)
            surprise_score = (actual_val - estimate_val) / stddev if stddev else 0
            direction_key = "above" if actual_val > estimate_val else "below"

            # Determine impact
            abs_surprise = abs(surprise_score)
            if abs_surprise > 2.0:
                impact = "high"
            elif abs_surprise > 1.0:
                impact = "medium"
            else:
                impact = "low"

            direction = "positive" if surprise_score > 0.5 else ("negative" if surprise_score < -0.5 else "neutral")
            sector_impacts = MACRO_SENSITIVITY.get(matched_indicator, {}).get(direction_key, {})

            summary = (
                f"{matched_indicator}: Actual {actual_val} vs Est {estimate_val} "
                f"(surprise: {surprise_score:+.1f}σ). "
                f"{'Bullish' if direction == 'positive' else 'Bearish' if direction == 'negative' else 'Neutral'} "
                f"for markets."
            )

            timestamp = _utc_now().isoformat()
            event = {
                "PK": f"EVENT#MACRO#{today}",
                "SK": matched_indicator,
                "GSI1PK": "EVENTS#ALL",
                "GSI1SK": timestamp,
                "ticker": "MACRO",
                "type": "macro",
                "indicator": matched_indicator,
                "actual": actual_val,
                "estimate": estimate_val,
                "surpriseScore": round(surprise_score, 2),
                "impact": impact,
                "direction": direction,
                "category": "macro",
                "sectorImpacts": sector_impacts,
                "summary": summary,
                "timestamp": timestamp,
                "ttl": int((_utc_now() + timedelta(days=90)).timestamp()),
            }
            db.put_item(event)
            new_events.append(event)

    except Exception as e:
        print(f"[EventEngine] Macro monitor error: {e}")
        traceback.print_exc()

    return new_events


# ─── 4. Signal Re-scoring ───

def rescore_signal_on_event(ticker, event):
    """Re-score a stock's signal when a high-impact event is detected.

    Rate limit: max 1 re-score per stock per hour.
    """
    if event.get("impact") != "high":
        return None

    try:
        # Rate limit check: max 1 rescore/hour
        rescore_key = f"RESCORE#{ticker}"
        last_rescore = db.get_item(rescore_key, "LATEST")
        if last_rescore:
            last_time = last_rescore.get("timestamp", "")
            if last_time:
                try:
                    last_dt = datetime.fromisoformat(last_time.replace("Z", "+00:00"))
                    if (_utc_now() - last_dt).total_seconds() < 3600:
                        print(f"[EventEngine] Rescore rate limited for {ticker}")
                        return None
                except (ValueError, TypeError):
                    pass

        # Fetch current signal
        current = db.get_item(f"SIGNAL#{ticker}", "LATEST")
        if not current:
            print(f"[EventEngine] No existing signal for {ticker}")
            return None

        old_score = current.get("compositeScore", 5)
        old_signal = current.get("signal", "Neutral")

        # Apply event-based adjustment
        direction = event.get("direction", "neutral")
        category = event.get("category", "")

        adjustment = 0
        if direction == "positive":
            adjustment = 0.8
        elif direction == "negative":
            adjustment = -0.8

        # Category-specific boosts
        if category == "earnings":
            adjustment *= 1.5
        elif category in ("legal", "regulatory"):
            adjustment *= 1.2

        new_score = max(1, min(10, round(old_score + adjustment, 1)))

        # Determine new score label
        if new_score >= 9:
            new_signal = "Strong"
        elif new_score >= 7:
            new_signal = "Favorable"
        elif new_score >= 5:
            new_signal = "Neutral"
        elif new_score >= 3:
            new_signal = "Weak"
        else:
            new_signal = "Caution"

        signal_changed = new_signal != old_signal

        # Archive previous signal
        archive_sk = current.get("analyzedAt", _utc_now().isoformat())
        current["SK"] = archive_sk
        current["PK"] = f"SIGNAL#{ticker}"
        db.put_item(current)

        # Store updated signal
        timestamp = _utc_now().isoformat()
        updated = {**current}
        updated["PK"] = f"SIGNAL#{ticker}"
        updated["SK"] = "LATEST"
        updated["compositeScore"] = new_score
        updated["signal"] = new_signal
        updated["previousScore"] = old_score
        updated["previousSignal"] = old_signal
        updated["rescoreReason"] = event.get("summary", "High impact event"),
        updated["rescoreEvent"] = event.get("type", ""),
        updated["analyzedAt"] = timestamp
        updated["updatedAt"] = timestamp
        db.put_item(updated)

        # Record rescore timestamp for rate limiting
        db.put_item({
            "PK": rescore_key,
            "SK": "LATEST",
            "ticker": ticker,
            "timestamp": timestamp,
            "ttl": int((_utc_now() + timedelta(hours=2)).timestamp()),
        })

        return {
            "ticker": ticker,
            "signalChanged": signal_changed,
            "oldSignal": old_signal,
            "newSignal": new_signal,
            "oldScore": old_score,
            "newScore": new_score,
            "reason": event.get("summary", ""),
        }

    except Exception as e:
        print(f"[EventEngine] Rescore error for {ticker}: {e}")
        traceback.print_exc()
        return None


# ─── 5. Push Notification System ───

# Alert priority levels
PRIORITY_P0 = "P0_CRITICAL"    # Signal change, earnings surprise > 3σ
PRIORITY_P1 = "P1_HIGH"        # 8-K, insider cluster, major contract, FDA
PRIORITY_P2 = "P2_MEDIUM"      # Earnings reminder, macro impact, analyst change
PRIORITY_P3 = "P3_LOW"         # Medium news, RSI trigger, weekly summary


def _determine_alert_priority(event, rescore_result=None):
    """Determine push notification priority for an event."""
    if rescore_result and rescore_result.get("signalChanged"):
        return PRIORITY_P0

    impact = event.get("impact", "low")
    event_type = event.get("type", "")
    category = event.get("category", "")

    # P0: Earnings surprise > 3σ
    if event_type == "macro" and abs(event.get("surpriseScore", 0)) > 3:
        return PRIORITY_P0

    # P1: High-impact filings, insider clusters
    if impact == "high" and event_type == "filing":
        return PRIORITY_P1
    if "cluster" in event.get("summary", "").lower():
        return PRIORITY_P1
    if category in ("earnings", "product") and impact == "high":
        return PRIORITY_P1

    # P2: Medium impact events
    if impact == "medium":
        return PRIORITY_P2

    # P3: Everything else
    return PRIORITY_P3


def send_alert(event, rescore_result=None):
    """Send push notification alert for an event."""
    priority = _determine_alert_priority(event, rescore_result)
    ticker = event.get("ticker", "UNKNOWN")
    summary = event.get("summary", "New event detected")

    # Build notification payload
    title = f"FII Alert: {ticker}"
    if rescore_result and rescore_result.get("signalChanged"):
        old = rescore_result["oldSignal"]
        new = rescore_result["newSignal"]
        title = f"Signal Change: {ticker} {old} → {new}"
        body = f"Score changed from {rescore_result['oldScore']} to {rescore_result['newScore']}. {summary}"
    elif event.get("type") == "macro":
        title = f"Macro Alert: {event.get('indicator', 'Economic Release')}"
        body = summary
    else:
        body = summary

    notification = {
        "PK": f"ALERT#{_utc_now().strftime('%Y-%m-%d')}",
        "SK": f"{_utc_now().isoformat()}#{ticker}",
        "GSI1PK": f"ALERTS#{ticker}",
        "GSI1SK": _utc_now().isoformat(),
        "ticker": ticker,
        "priority": priority,
        "title": title,
        "body": body,
        "eventType": event.get("type", ""),
        "impact": event.get("impact", "low"),
        "direction": event.get("direction", "neutral"),
        "timestamp": _utc_now().isoformat(),
        "read": False,
        "ttl": int((_utc_now() + timedelta(days=30)).timestamp()),
    }
    db.put_item(notification)

    # Send via SNS if configured and priority is P0 or P1
    if SNS_TOPIC_ARN and priority in (PRIORITY_P0, PRIORITY_P1):
        try:
            import boto3
            sns = boto3.client("sns")
            sns.publish(
                TopicArn=SNS_TOPIC_ARN,
                Subject=title[:100],
                Message=json.dumps({
                    "default": body,
                    "GCM": json.dumps({
                        "notification": {
                            "title": title,
                            "body": body,
                            "sound": "default",
                        },
                        "data": {
                            "ticker": ticker,
                            "priority": priority,
                            "type": event.get("type", ""),
                        },
                    }),
                }),
                MessageStructure="json",
            )
        except Exception as e:
            print(f"[EventEngine] SNS publish failed: {e}")

    return notification


# ─── 6. Event Queries ───

def get_events_for_ticker(ticker, event_type=None, impact=None, limit=50):
    """Get events for a specific ticker (last 30 days)."""
    thirty_days_ago = (_utc_now() - timedelta(days=30)).isoformat()
    now = _utc_now().isoformat()

    result = db.query_between(
        f"EVENT#{ticker}",
        thirty_days_ago,
        f"{now}~",
    )
    events = result or []

    # Apply filters
    if event_type:
        events = [e for e in events if e.get("type") == event_type]
    if impact:
        events = [e for e in events if e.get("impact") == impact]

    # Sort by timestamp descending
    events.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return events[:limit]


def get_events_feed(limit=50):
    """Get all recent events across all stocks (for main feed).

    Queries each tracked ticker's events and merges results, sorted by
    timestamp descending.  This avoids requiring a GSI on the table.
    """
    now = _utc_now().isoformat()
    thirty_days_ago = (_utc_now() - timedelta(days=30)).isoformat()

    tickers = _get_tracked_tickers()
    all_events = []
    for ticker in tickers:
        try:
            items = db.query_between(
                f"EVENT#{ticker}",
                thirty_days_ago,
                f"{now}~",
            )
            if items:
                all_events.extend(items)
        except Exception:
            pass

    # Also include macro events
    try:
        for day_offset in range(7):
            day = (_utc_now() - timedelta(days=day_offset)).strftime("%Y-%m-%d")
            macro = db.query(f"EVENT#MACRO#{day}")
            if macro:
                all_events.extend(macro)
    except Exception:
        pass

    all_events.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return all_events[:limit]


def get_alerts(limit=20):
    """Get recent alerts."""
    today = _utc_now().strftime("%Y-%m-%d")
    result = db.query(f"ALERT#{today}")
    alerts = result or []
    alerts.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    return alerts[:limit]


def get_signal_history(ticker, days=30):
    """Get signal score history for a ticker over N days."""
    cutoff = (_utc_now() - timedelta(days=days)).isoformat()
    now = _utc_now().isoformat()

    result = db.query_between(
        f"SIGNAL#{ticker}",
        cutoff,
        f"{now}~",
    )
    history = result or []

    # Also include current LATEST
    latest = db.get_item(f"SIGNAL#{ticker}", "LATEST")
    if latest:
        history.append(latest)

    points = []
    for item in history:
        score = item.get("compositeScore")
        ts = item.get("analyzedAt") or item.get("updatedAt")
        signal = item.get("signal", "Neutral")
        if score is not None and ts:
            points.append({
                "date": ts[:10],
                "score": score,
                "signal": signal,
            })

    # Dedupe by date, keep latest
    seen = {}
    for p in sorted(points, key=lambda x: x["date"]):
        seen[p["date"]] = p
    return sorted(seen.values(), key=lambda x: x["date"])


# ─── 7. User Notification Preferences ───

def get_user_prefs(user_id):
    """Get notification preferences for a user."""
    item = db.get_item(f"PREFS#{user_id}", "NOTIFICATIONS")
    if item:
        return item
    # Default preferences
    return {
        "p0Critical": True,
        "p1High": True,
        "p2Medium": True,
        "p3Low": False,
        "quietHoursStart": 22,
        "quietHoursEnd": 7,
        "watchedTickers": [],
        "mutedTickers": [],
    }


def save_user_prefs(user_id, prefs):
    """Save notification preferences for a user."""
    item = {
        "PK": f"PREFS#{user_id}",
        "SK": "NOTIFICATIONS",
        **prefs,
        "updatedAt": _utc_now().isoformat(),
    }
    db.put_item(item)
    return item


def register_device_token(user_id, token, platform="expo"):
    """Register a push notification device token."""
    item = {
        "PK": f"DEVICE#{user_id}",
        "SK": f"{platform}#{token[:32]}",
        "userId": user_id,
        "token": token,
        "platform": platform,
        "registeredAt": _utc_now().isoformat(),
    }
    db.put_item(item)
    return item


# ─── 8. Lambda Handlers ───

def _get_tracked_tickers():
    """Get all tickers to monitor (from portfolio + watchlist + default set)."""
    tickers = set()

    # Default high-interest tickers
    defaults = [
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "JPM",
        "V", "UNH", "JNJ", "WMT", "PG", "MA", "HD", "BAC", "XOM", "PFE",
        "COST", "ABBV", "CRM", "MRK", "AVGO", "CVX", "TMO", "LLY", "NFLX",
        "AMD", "ORCL", "ADBE",
    ]
    tickers.update(defaults)

    # Try to get portfolio tickers from DynamoDB (query by PK directly)
    try:
        result = db.query("PORTFOLIO#DEFAULT")
        if result:
            for item in result:
                holdings = item.get("holdings", [])
                for h in holdings:
                    t = h.get("ticker", "")
                    if t:
                        tickers.add(t.upper())
    except Exception:
        pass

    return list(tickers)[:100]  # Cap at 100 tickers


def news_monitor_handler(event, context):
    """Lambda handler for news monitoring (every 15 min during market hours)."""
    print("[EventEngine] News monitor starting...")
    tickers = _get_tracked_tickers()
    print(f"[EventEngine] Monitoring {len(tickers)} tickers for news")

    new_events = monitor_news(tickers)
    print(f"[EventEngine] Found {len(new_events)} new news events")

    # Re-score and alert for high-impact events
    for evt in new_events:
        if evt.get("impact") == "high":
            rescore = rescore_signal_on_event(evt["ticker"], evt)
            send_alert(evt, rescore)
        elif evt.get("impact") == "medium":
            send_alert(evt)

    return {"statusCode": 200, "body": json.dumps({"eventsProcessed": len(new_events)})}


def sec_monitor_handler(event, context):
    """Lambda handler for SEC filing monitoring (every 5 min during market hours)."""
    print("[EventEngine] SEC filing monitor starting...")
    tickers = _get_tracked_tickers()
    print(f"[EventEngine] Monitoring {len(tickers)} tickers for SEC filings")

    new_events = monitor_sec_filings(tickers)
    print(f"[EventEngine] Found {len(new_events)} new SEC filing events")

    for evt in new_events:
        if evt.get("impact") == "high":
            rescore = rescore_signal_on_event(evt["ticker"], evt)
            send_alert(evt, rescore)
        elif evt.get("impact") == "medium":
            send_alert(evt)

    return {"statusCode": 200, "body": json.dumps({"eventsProcessed": len(new_events)})}


def macro_monitor_handler(event, context):
    """Lambda handler for macro event monitoring (every 15 min on release days)."""
    print("[EventEngine] Macro event monitor starting...")

    new_events = monitor_macro_events()
    print(f"[EventEngine] Found {len(new_events)} new macro events")

    for evt in new_events:
        send_alert(evt)

    return {"statusCode": 200, "body": json.dumps({"eventsProcessed": len(new_events)})}

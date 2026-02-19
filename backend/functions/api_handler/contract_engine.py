"""Government Contract Intelligence Engine — USASpending.gov API.

Queries USASpending.gov for federal contract awards by company.
Computes Government Revenue Score (1-10):
  Award Growth (40%): YoY contract value change
  Pipeline Strength (30%): Active contracts in execution
  Diversification (20%): Distinct awarding agencies
  Deal Size (10%): Recent major awards (> $50M)

API: https://api.usaspending.gov/ (free, no key required)
Pure Python — no numpy/pandas.
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)

# Tickers relevant for government contracts
# Defense, Aerospace, Cloud/IT, Pharma
RELEVANT_TICKERS = {
    # Defense / Aerospace
    "LMT", "RTX", "GD", "NOC", "BA", "HII", "LHX", "TDG", "HEI",
    "TXT", "LDOS", "SAIC", "BAH", "CACI", "KTOS",
    # Cloud / IT / Tech
    "MSFT", "AMZN", "GOOG", "GOOGL", "ORCL", "IBM", "PLTR", "SNOW",
    "PANW", "CRWD", "NET", "CSCO", "HPE", "DELL", "ACN",
    # Pharma / Biotech (vaccine / gov contracts)
    "PFE", "MRNA", "JNJ", "MRK", "GILD", "REGN", "EBS",
    # Misc
    "GE", "HON", "CAT", "DE", "UNH", "CVS",
}

# Ticker → recipient name for USASpending search
TICKER_TO_RECIPIENT = {
    "LMT": "LOCKHEED MARTIN",
    "RTX": "RAYTHEON",
    "GD": "GENERAL DYNAMICS",
    "NOC": "NORTHROP GRUMMAN",
    "BA": "BOEING",
    "MSFT": "MICROSOFT",
    "AMZN": "AMAZON",
    "GOOG": "GOOGLE",
    "GOOGL": "GOOGLE",
    "ORCL": "ORACLE",
    "IBM": "IBM",
    "PLTR": "PALANTIR",
    "PANW": "PALO ALTO NETWORKS",
    "CRWD": "CROWDSTRIKE",
    "CSCO": "CISCO",
    "HPE": "HEWLETT PACKARD",
    "DELL": "DELL",
    "ACN": "ACCENTURE",
    "PFE": "PFIZER",
    "MRNA": "MODERNA",
    "JNJ": "JOHNSON & JOHNSON",
    "MRK": "MERCK",
    "GILD": "GILEAD",
    "GE": "GENERAL ELECTRIC",
    "HON": "HONEYWELL",
    "CAT": "CATERPILLAR",
    "UNH": "UNITEDHEALTH",
    "HII": "HUNTINGTON INGALLS",
    "LHX": "L3HARRIS",
    "LDOS": "LEIDOS",
    "SAIC": "SAIC",
    "BAH": "BOOZ ALLEN",
    "CACI": "CACI",
    "SNOW": "SNOWFLAKE",
    "NET": "CLOUDFLARE",
    "REGN": "REGENERON",
    "EBS": "EMERGENT BIOSOLUTIONS",
    "DE": "DEERE",
    "CVS": "CVS HEALTH",
}


def _api_post(url, payload, timeout=20):
    """Make a POST request to USASpending API."""
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "FII-App/1.0",
    }
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (URLError, HTTPError) as e:
        logger.warning(f"USASpending API error: {e}")
        return None
    except Exception as e:
        logger.warning(f"USASpending request failed: {e}")
        return None


def _api_get(url, timeout=15):
    """Make a GET request to USASpending API."""
    headers = {"User-Agent": "FII-App/1.0", "Accept": "application/json"}
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (URLError, HTTPError) as e:
        logger.warning(f"USASpending API error: {e}")
        return None
    except Exception as e:
        logger.warning(f"USASpending request failed: {e}")
        return None


def _search_awards(recipient_name, start_date, end_date, limit=100):
    """Search for contract awards by recipient name and date range."""
    url = "https://api.usaspending.gov/api/v2/search/spending_by_award/"
    payload = {
        "filters": {
            "time_period": [{"start_date": start_date, "end_date": end_date}],
            "recipient_search_text": [recipient_name],
            "award_type_codes": ["A", "B", "C", "D"],  # Contracts only
        },
        "fields": [
            "Award ID", "Recipient Name", "Award Amount",
            "Awarding Agency", "Start Date", "End Date",
            "Description", "Award Type",
        ],
        "page": 1,
        "limit": limit,
        "sort": "Award Amount",
        "order": "desc",
    }
    return _api_post(url, payload)


def _get_spending_by_agency(recipient_name, start_date, end_date):
    """Get spending aggregated by awarding agency."""
    url = "https://api.usaspending.gov/api/v2/search/spending_by_category/awarding_agency/"
    payload = {
        "filters": {
            "time_period": [{"start_date": start_date, "end_date": end_date}],
            "recipient_search_text": [recipient_name],
            "award_type_codes": ["A", "B", "C", "D"],
        },
        "limit": 10,
        "page": 1,
    }
    return _api_post(url, payload)


def _get_total_spending(recipient_name, start_date, end_date):
    """Get total contract spending for a recipient in date range."""
    url = "https://api.usaspending.gov/api/v2/search/spending_by_category/recipient/"
    payload = {
        "filters": {
            "time_period": [{"start_date": start_date, "end_date": end_date}],
            "recipient_search_text": [recipient_name],
            "award_type_codes": ["A", "B", "C", "D"],
        },
        "limit": 5,
        "page": 1,
    }
    result = _api_post(url, payload)
    if result and "results" in result:
        total = sum(r.get("amount", 0) or 0 for r in result["results"])
        return total
    return 0


def analyze(ticker):
    """Analyze government contract activity for a ticker.

    Returns:
        Dict with contract score, award data, agency breakdown,
        recent major awards. None if ticker not relevant.
    """
    ticker = ticker.upper()
    if ticker not in RELEVANT_TICKERS:
        return None

    recipient = TICKER_TO_RECIPIENT.get(ticker)
    if not recipient:
        return None

    now = datetime.now(timezone.utc)
    one_year_ago = now - timedelta(days=365)
    two_years_ago = now - timedelta(days=730)
    ninety_days_ago = now - timedelta(days=90)

    now_str = now.strftime("%Y-%m-%d")
    one_yr_str = one_year_ago.strftime("%Y-%m-%d")
    two_yr_str = two_years_ago.strftime("%Y-%m-%d")
    ninety_d_str = ninety_days_ago.strftime("%Y-%m-%d")

    # 1) Total contract value: last 12 months
    total_current = _get_total_spending(recipient, one_yr_str, now_str)

    # 2) Total contract value: prior 12 months
    total_prior = _get_total_spending(recipient, two_yr_str, one_yr_str)

    # 3) Recent awards (last 12 months, top by amount)
    awards_result = _search_awards(recipient, one_yr_str, now_str, limit=50)
    all_awards = []
    if awards_result and "results" in awards_result:
        all_awards = awards_result["results"]

    # 4) Agency breakdown
    agency_result = _get_spending_by_agency(recipient, one_yr_str, now_str)
    agencies = []
    distinct_agencies = 0
    if agency_result and "results" in agency_result:
        agencies = agency_result["results"]
        distinct_agencies = len([a for a in agencies if (a.get("amount") or 0) > 0])

    # Extract metrics
    active_contracts = len(all_awards)
    major_awards_recent = []
    major_awards_count = 0

    for award in all_awards:
        amount = award.get("Award Amount") or award.get("generated_internal_id") or 0
        if isinstance(amount, str):
            try:
                amount = float(amount.replace(",", "").replace("$", ""))
            except (ValueError, TypeError):
                amount = 0

        desc = award.get("Description") or award.get("description") or ""
        agency = award.get("Awarding Agency") or award.get("awarding_agency") or ""
        award_id = award.get("Award ID") or award.get("generated_internal_id") or ""

        if amount > 50_000_000:
            major_awards_count += 1

        if amount > 10_000_000 and len(major_awards_recent) < 5:
            major_awards_recent.append({
                "awardId": str(award_id)[:30],
                "agency": str(agency)[:60],
                "value": round(amount),
                "description": str(desc)[:120],
            })

    # Compute component scores
    # Award Growth (40%): YoY change
    growth_score = 5.0
    growth_pct = 0
    if total_prior > 0:
        growth_pct = ((total_current - total_prior) / total_prior) * 100
        if growth_pct > 50:
            growth_score = 10.0
        elif growth_pct > 25:
            growth_score = 8.0
        elif growth_pct > 10:
            growth_score = 7.0
        elif growth_pct > 0:
            growth_score = 6.0
        elif growth_pct > -10:
            growth_score = 5.0
        elif growth_pct > -25:
            growth_score = 3.0
        else:
            growth_score = 1.0
    elif total_current > 0:
        growth_score = 7.0

    # Pipeline Strength (30%): Active contracts
    pipeline_score = 5.0
    if active_contracts >= 40:
        pipeline_score = 10.0
    elif active_contracts >= 25:
        pipeline_score = 8.0
    elif active_contracts >= 15:
        pipeline_score = 7.0
    elif active_contracts >= 8:
        pipeline_score = 6.0
    elif active_contracts >= 3:
        pipeline_score = 5.0
    elif active_contracts >= 1:
        pipeline_score = 4.0
    else:
        pipeline_score = 2.0

    # Diversification (20%): Distinct agencies
    diversification_score = 5.0
    if distinct_agencies >= 6:
        diversification_score = 10.0
    elif distinct_agencies >= 4:
        diversification_score = 8.0
    elif distinct_agencies >= 3:
        diversification_score = 7.0
    elif distinct_agencies >= 2:
        diversification_score = 6.0
    elif distinct_agencies >= 1:
        diversification_score = 5.0
    else:
        diversification_score = 2.0

    # Deal Size (10%): Major awards (> $50M)
    deal_score = 5.0
    if major_awards_count >= 5:
        deal_score = 10.0
    elif major_awards_count >= 3:
        deal_score = 8.0
    elif major_awards_count >= 2:
        deal_score = 7.0
    elif major_awards_count >= 1:
        deal_score = 6.0
    else:
        deal_score = 4.0

    # Composite score
    composite = (
        growth_score * 0.40
        + pipeline_score * 0.30
        + diversification_score * 0.20
        + deal_score * 0.10
    )
    composite = round(max(1.0, min(10.0, composite)), 1)

    # Build agency distribution
    agency_breakdown = []
    for a in agencies[:8]:
        name = a.get("name") or a.get("agency_name") or "Unknown"
        amount = a.get("amount") or 0
        if amount > 0:
            agency_breakdown.append({
                "agency": str(name)[:50],
                "amount": round(amount),
            })

    # Build quarterly awards (estimated from available data)
    quarterly = []
    for q_offset in range(7, -1, -1):
        q_start = now - timedelta(days=q_offset * 91 + 91)
        q_end = now - timedelta(days=q_offset * 91)
        quarter_label = f"Q{((q_end.month - 1) // 3) + 1} {q_end.year}"
        # Estimate proportional quarterly value
        if q_offset < 4 and total_current > 0:
            q_value = round(total_current / 4)
        elif q_offset >= 4 and total_prior > 0:
            q_value = round(total_prior / 4)
        else:
            q_value = 0
        quarterly.append({"quarter": quarter_label, "value": q_value})

    return {
        "ticker": ticker,
        "score": composite,
        "totalValueCurrent": round(total_current),
        "totalValuePrior": round(total_prior),
        "awardGrowth": round(growth_pct, 1),
        "growthScore": round(growth_score, 1),
        "activeContracts": active_contracts,
        "pipelineScore": round(pipeline_score, 1),
        "distinctAgencies": distinct_agencies,
        "diversificationScore": round(diversification_score, 1),
        "majorAwardsCount": major_awards_count,
        "dealScore": round(deal_score, 1),
        "recentAwards": major_awards_recent,
        "agencyBreakdown": agency_breakdown,
        "quarterly": quarterly,
        "recipientName": recipient,
        "dataSource": "USASpending.gov",
        "analyzedAt": now.isoformat(),
    }

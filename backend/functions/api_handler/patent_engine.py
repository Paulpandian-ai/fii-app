"""Patent Intelligence Engine — PatentsView API integration.

Queries USPTO PatentsView API for patent filing data by company.
Computes Patent Innovation Score (1-10):
  Velocity (40%): YoY growth in patent grants
  Quality (30%): Average forward citations per patent
  Breadth (20%): Distinct CPC technology classes
  Recency (10%): Patents filed in last 6 months / total

API: https://search.patentsview.org/api/v1/patent/ (free, no key)
Pure Python — no numpy/pandas.
"""

import json
import logging
import math
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.parse import quote, urlencode
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)

# Ticker → PatentsView assignee_organization name mapping
TICKER_TO_ASSIGNEE = {
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft Corporation",
    "GOOG": "Alphabet Inc.",
    "GOOGL": "Alphabet Inc.",
    "AMZN": "Amazon Technologies, Inc.",
    "META": "Meta Platforms, Inc.",
    "NVDA": "NVIDIA Corporation",
    "TSM": "Taiwan Semiconductor Manufacturing",
    "AVGO": "Broadcom Inc.",
    "ORCL": "Oracle International Corporation",
    "CRM": "Salesforce, Inc.",
    "ADBE": "Adobe Inc.",
    "AMD": "Advanced Micro Devices, Inc.",
    "INTC": "Intel Corporation",
    "IBM": "International Business Machines Corporation",
    "QCOM": "Qualcomm Incorporated",
    "TXN": "Texas Instruments Incorporated",
    "NOW": "ServiceNow, Inc.",
    "INTU": "Intuit Inc.",
    "AMAT": "Applied Materials, Inc.",
    "MU": "Micron Technology, Inc.",
    "LRCX": "Lam Research Corporation",
    "KLAC": "KLA Corporation",
    "SNPS": "Synopsys, Inc.",
    "CDNS": "Cadence Design Systems, Inc.",
    "PANW": "Palo Alto Networks, Inc.",
    "CRWD": "CrowdStrike, Inc.",
    "PLTR": "Palantir Technologies Inc.",
    "SNOW": "Snowflake Inc.",
    "NET": "Cloudflare, Inc.",
    "TSLA": "Tesla, Inc.",
    "BA": "The Boeing Company",
    "LMT": "Lockheed Martin Corporation",
    "RTX": "Raytheon Technologies Corporation",
    "GD": "General Dynamics Corporation",
    "NOC": "Northrop Grumman Corporation",
    "GE": "General Electric Company",
    "HON": "Honeywell International Inc.",
    "MMM": "3M Company",
    "CAT": "Caterpillar Inc.",
    "DE": "Deere & Company",
    "JNJ": "Johnson & Johnson",
    "PFE": "Pfizer Inc.",
    "MRK": "Merck & Co., Inc.",
    "ABBV": "AbbVie Inc.",
    "LLY": "Eli Lilly and Company",
    "BMY": "Bristol-Myers Squibb Company",
    "AMGN": "Amgen Inc.",
    "GILD": "Gilead Sciences, Inc.",
    "REGN": "Regeneron Pharmaceuticals, Inc.",
    "VRTX": "Vertex Pharmaceuticals Incorporated",
    "MRNA": "ModernaTX, Inc.",
    "BIIB": "Biogen Inc.",
    "F": "Ford Motor Company",
    "GM": "General Motors LLC",
    "DIS": "The Walt Disney Company",
    "NFLX": "Netflix, Inc.",
    "UBER": "Uber Technologies, Inc.",
    "ABNB": "Airbnb, Inc.",
    "SQ": "Block, Inc.",
    "PYPL": "PayPal, Inc.",
    "V": "Visa International Service Association",
    "MA": "Mastercard International Incorporated",
    "JPM": "JPMorgan Chase Bank",
    "GS": "The Goldman Sachs Group, Inc.",
    "MS": "Morgan Stanley",
    "WMT": "Walmart Inc.",
    "COST": "Costco Wholesale Corporation",
    "HD": "The Home Depot, Inc.",
    "PG": "The Procter & Gamble Company",
    "KO": "The Coca-Cola Company",
    "PEP": "PepsiCo, Inc.",
    "NKE": "Nike, Inc.",
    "UNH": "UnitedHealth Group Incorporated",
    "CVS": "CVS Pharmacy, Inc.",
    "CI": "Cigna Corporation",
    "T": "AT&T Inc.",
    "VZ": "Verizon Communications Inc.",
    "TMUS": "T-Mobile USA, Inc.",
    "CSCO": "Cisco Technology, Inc.",
    "HPE": "Hewlett Packard Enterprise Development LP",
    "DELL": "Dell Technologies Inc.",
}

# CPC section descriptions
CPC_SECTIONS = {
    "A": "Human Necessities",
    "B": "Operations & Transport",
    "C": "Chemistry & Metallurgy",
    "D": "Textiles & Paper",
    "E": "Construction",
    "F": "Mechanical Engineering",
    "G": "Physics & Computing",
    "H": "Electricity & Electronics",
    "Y": "New Technology Tags",
}


def _api_request(url, timeout=15):
    """Make a GET request to PatentsView API."""
    headers = {
        "User-Agent": "FII-App/1.0 (Financial Intelligence Platform)",
        "Accept": "application/json",
    }
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (URLError, HTTPError) as e:
        logger.warning(f"PatentsView API error: {e}")
        return None
    except Exception as e:
        logger.warning(f"PatentsView request failed: {e}")
        return None


def _query_patents(assignee_name, date_from, date_to, size=100):
    """Query PatentsView API for patents by assignee in date range.

    Uses the v1 search API with query parameters.
    """
    base_url = "https://search.patentsview.org/api/v1/patent/"

    # Build query filter
    q = json.dumps({
        "_and": [
            {"assignees.assignee_organization": assignee_name},
            {"_gte": {"patent_date": date_from}},
            {"_lte": {"patent_date": date_to}},
        ]
    })

    fields = "patent_id,patent_date,patent_title,patent_abstract,patent_num_combined_citations,assignees.assignee_organization,cpcs.cpc_section_id,cpcs.cpc_group_id"

    params = urlencode({
        "q": q,
        "f": fields,
        "s": json.dumps([{"patent_date": "desc"}]),
        "o": json.dumps({"size": size}),
    })

    url = f"{base_url}?{params}"
    return _api_request(url, timeout=20)


def _count_patents(assignee_name, date_from, date_to):
    """Get patent count for an assignee in date range."""
    result = _query_patents(assignee_name, date_from, date_to, size=1)
    if result and "total_patent_count" in result:
        return result["total_patent_count"]
    if result and "patents" in result:
        return result.get("count", len(result["patents"]))
    return 0


def analyze(ticker):
    """Analyze patent activity for a ticker.

    Returns:
        Dict with patent innovation score, velocity, quality metrics,
        recent patents, and technology distribution. None if ticker
        not in patent mapping.
    """
    assignee = TICKER_TO_ASSIGNEE.get(ticker.upper())
    if not assignee:
        return None

    now = datetime.now(timezone.utc)
    one_year_ago = now - timedelta(days=365)
    two_years_ago = now - timedelta(days=730)
    five_years_ago = now - timedelta(days=1825)
    six_months_ago = now - timedelta(days=180)
    ninety_days_ago = now - timedelta(days=90)

    date_format = "%Y-%m-%d"
    now_str = now.strftime(date_format)
    one_yr_str = one_year_ago.strftime(date_format)
    two_yr_str = two_years_ago.strftime(date_format)
    five_yr_str = five_years_ago.strftime(date_format)

    # Query recent patents (last 12 months, full details)
    recent_result = _query_patents(assignee, one_yr_str, now_str, size=100)
    patents_last_12mo = []
    total_last_12mo = 0
    if recent_result:
        total_last_12mo = recent_result.get("total_patent_count", 0)
        patents_last_12mo = recent_result.get("patents", [])

    # Count prior 12 months for velocity comparison
    total_prior_12mo = _count_patents(assignee, two_yr_str, one_yr_str)

    # Count 5-year total
    total_5yr = _count_patents(assignee, five_yr_str, now_str)

    # Extract metrics from recent patents
    citation_counts = []
    cpc_sections = set()
    cpc_groups = set()
    recent_90d = []
    recent_6mo_count = 0

    for p in patents_last_12mo:
        # Citations
        citations = p.get("patent_num_combined_citations")
        if citations is not None:
            citation_counts.append(int(citations))

        # CPC categories
        cpcs = p.get("cpcs", [])
        if isinstance(cpcs, list):
            for cpc in cpcs:
                section = cpc.get("cpc_section_id", "")
                group = cpc.get("cpc_group_id", "")
                if section:
                    cpc_sections.add(section)
                if group:
                    cpc_groups.add(group[:4])  # Top-level group

        # Check recency
        patent_date = p.get("patent_date", "")
        if patent_date:
            try:
                pd = datetime.strptime(patent_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                if pd >= six_months_ago:
                    recent_6mo_count += 1
                if pd >= ninety_days_ago:
                    recent_90d.append(p)
            except ValueError:
                pass

    # Compute component scores
    # Velocity (40%): YoY growth
    velocity_score = 5.0
    velocity_pct = 0
    if total_prior_12mo > 0:
        velocity_pct = ((total_last_12mo - total_prior_12mo) / total_prior_12mo) * 100
        if velocity_pct > 50:
            velocity_score = 10.0
        elif velocity_pct > 25:
            velocity_score = 8.0
        elif velocity_pct > 10:
            velocity_score = 7.0
        elif velocity_pct > 0:
            velocity_score = 6.0
        elif velocity_pct > -10:
            velocity_score = 5.0
        elif velocity_pct > -25:
            velocity_score = 3.0
        else:
            velocity_score = 1.0
    elif total_last_12mo > 0:
        velocity_score = 7.0  # New filer

    # Quality (30%): Average citations
    avg_citations = 0
    quality_score = 5.0
    if citation_counts:
        avg_citations = sum(citation_counts) / len(citation_counts)
        if avg_citations > 20:
            quality_score = 10.0
        elif avg_citations > 10:
            quality_score = 8.0
        elif avg_citations > 5:
            quality_score = 7.0
        elif avg_citations > 2:
            quality_score = 6.0
        elif avg_citations > 0:
            quality_score = 5.0
        else:
            quality_score = 3.0

    # Breadth (20%): Distinct CPC sections
    breadth_count = len(cpc_sections)
    breadth_score = 5.0
    if breadth_count >= 6:
        breadth_score = 10.0
    elif breadth_count >= 4:
        breadth_score = 8.0
    elif breadth_count >= 3:
        breadth_score = 7.0
    elif breadth_count >= 2:
        breadth_score = 6.0
    elif breadth_count >= 1:
        breadth_score = 5.0
    else:
        breadth_score = 2.0

    # Recency (10%): Recent 6mo / total
    recency_ratio = 0
    recency_score = 5.0
    if total_last_12mo > 0:
        recency_ratio = recent_6mo_count / total_last_12mo
        if recency_ratio > 0.7:
            recency_score = 10.0
        elif recency_ratio > 0.5:
            recency_score = 8.0
        elif recency_ratio > 0.3:
            recency_score = 6.0
        else:
            recency_score = 4.0

    # Composite Patent Innovation Score
    composite = (
        velocity_score * 0.40
        + quality_score * 0.30
        + breadth_score * 0.20
        + recency_score * 0.10
    )
    composite = round(max(1.0, min(10.0, composite)), 1)

    # Build technology distribution
    tech_distribution = {}
    for section in cpc_sections:
        label = CPC_SECTIONS.get(section, section)
        # Count patents in this section
        count = 0
        for p in patents_last_12mo:
            cpcs = p.get("cpcs", [])
            if isinstance(cpcs, list):
                for cpc in cpcs:
                    if cpc.get("cpc_section_id") == section:
                        count += 1
                        break
        tech_distribution[label] = count

    # Build recent notable patents (last 90 days, max 5)
    recent_patents = []
    for p in recent_90d[:5]:
        cpcs = p.get("cpcs", [])
        cpc_label = ""
        if isinstance(cpcs, list) and cpcs:
            sec = cpcs[0].get("cpc_section_id", "")
            cpc_label = CPC_SECTIONS.get(sec, sec)
        recent_patents.append({
            "patentId": p.get("patent_id", ""),
            "title": (p.get("patent_title") or "Untitled")[:120],
            "date": p.get("patent_date", ""),
            "category": cpc_label,
            "citations": p.get("patent_num_combined_citations", 0),
        })

    # Build quarterly patent counts (last 8 quarters)
    quarterly = []
    for q_offset in range(7, -1, -1):
        q_start = now - timedelta(days=q_offset * 91 + 91)
        q_end = now - timedelta(days=q_offset * 91)
        q_count = 0
        for p in patents_last_12mo:
            pd_str = p.get("patent_date", "")
            if pd_str:
                try:
                    pd = datetime.strptime(pd_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                    if q_start <= pd <= q_end:
                        q_count += 1
                except ValueError:
                    pass
        quarter_label = f"Q{((q_end.month - 1) // 3) + 1} {q_end.year}"
        quarterly.append({"quarter": quarter_label, "count": q_count})

    return {
        "ticker": ticker.upper(),
        "score": composite,
        "totalLast12Mo": total_last_12mo,
        "totalPrior12Mo": total_prior_12mo,
        "total5Yr": total_5yr,
        "velocity": round(velocity_pct, 1),
        "velocityScore": round(velocity_score, 1),
        "avgCitations": round(avg_citations, 1),
        "qualityScore": round(quality_score, 1),
        "distinctCpcSections": breadth_count,
        "breadthScore": round(breadth_score, 1),
        "recencyRatio": round(recency_ratio, 2),
        "recencyScore": round(recency_score, 1),
        "recentPatents": recent_patents,
        "techDistribution": tech_distribution,
        "quarterly": quarterly,
        "assigneeName": assignee,
        "dataSource": "USPTO PatentsView",
        "analyzedAt": now.isoformat(),
    }

"""FDA Catalyst Intelligence Engine — ClinicalTrials.gov + OpenFDA.

Queries ClinicalTrials.gov API v2 and OpenFDA for pharma/biotech catalysts.
Computes FDA Catalyst Score (1-10):
  Pipeline Richness (30%): Number of Phase II and III trials
  Approval Probability (30%): Historical phase-transition success rate
  Catalyst Proximity (25%): PDUFA dates within 90 days
  Recent Wins (15%): Approvals in last 12 months

APIs: ClinicalTrials.gov (free), OpenFDA (free, no key required)
Pure Python — no numpy/pandas.
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.parse import urlencode, quote
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)

# Tickers relevant for FDA data (Pharma / Biotech)
RELEVANT_TICKERS = {
    "JNJ", "PFE", "MRK", "ABBV", "LLY", "BMY", "AMGN", "GILD",
    "REGN", "VRTX", "MRNA", "BIIB", "AZN", "NVO", "SNY", "GSK",
    "NVS", "RHHBY", "TAK", "ALNY", "BMRN", "SGEN", "NBIX", "INCY",
    "EXEL", "HZNP", "RARE", "IONS", "SRPT", "UTHR",
    "BNTX", "CTLT", "ZTS", "IDXX", "DXCM", "ISRG", "EW", "SYK",
    "ABT", "TMO", "DHR", "MDT", "BSX", "BAX", "BDX",
}

# Ticker → sponsor/company name for ClinicalTrials.gov
TICKER_TO_SPONSOR = {
    "JNJ": "Johnson & Johnson",
    "PFE": "Pfizer",
    "MRK": "Merck Sharp & Dohme",
    "ABBV": "AbbVie",
    "LLY": "Eli Lilly",
    "BMY": "Bristol-Myers Squibb",
    "AMGN": "Amgen",
    "GILD": "Gilead Sciences",
    "REGN": "Regeneron Pharmaceuticals",
    "VRTX": "Vertex Pharmaceuticals",
    "MRNA": "ModernaTX",
    "BIIB": "Biogen",
    "AZN": "AstraZeneca",
    "NVO": "Novo Nordisk",
    "SNY": "Sanofi",
    "GSK": "GlaxoSmithKline",
    "NVS": "Novartis",
    "ALNY": "Alnylam Pharmaceuticals",
    "BMRN": "BioMarin Pharmaceutical",
    "NBIX": "Neurocrine Biosciences",
    "INCY": "Incyte Corporation",
    "EXEL": "Exelixis",
    "IONS": "Ionis Pharmaceuticals",
    "SRPT": "Sarepta Therapeutics",
    "BNTX": "BioNTech",
    "ZTS": "Zoetis",
    "ABT": "Abbott Laboratories",
    "TMO": "Thermo Fisher Scientific",
    "DHR": "Danaher",
    "MDT": "Medtronic",
    "BSX": "Boston Scientific",
    "BAX": "Baxter International",
    "BDX": "Becton Dickinson",
    "ISRG": "Intuitive Surgical",
    "EW": "Edwards Lifesciences",
    "SYK": "Stryker",
    "DXCM": "DexCom",
    "IDXX": "IDEXX Laboratories",
}

# Ticker → company name for OpenFDA search
TICKER_TO_FDA_NAME = {
    "JNJ": "Johnson and Johnson",
    "PFE": "Pfizer",
    "MRK": "Merck",
    "ABBV": "AbbVie",
    "LLY": "Eli Lilly",
    "BMY": "Bristol-Myers Squibb",
    "AMGN": "Amgen",
    "GILD": "Gilead",
    "REGN": "Regeneron",
    "VRTX": "Vertex",
    "MRNA": "Moderna",
    "BIIB": "Biogen",
    "AZN": "AstraZeneca",
    "NVO": "Novo Nordisk",
    "SNY": "Sanofi",
    "GSK": "GlaxoSmithKline",
    "NVS": "Novartis",
    "ALNY": "Alnylam",
    "BMRN": "BioMarin",
    "BNTX": "BioNTech",
    "ZTS": "Zoetis",
    "ABT": "Abbott",
    "TMO": "Thermo Fisher",
    "MDT": "Medtronic",
}


def _api_get(url, timeout=15):
    """Make a GET request."""
    headers = {
        "User-Agent": "FII-App/1.0 (Financial Intelligence Platform)",
        "Accept": "application/json",
    }
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (URLError, HTTPError) as e:
        logger.warning(f"API error for {url[:80]}: {e}")
        return None
    except Exception as e:
        logger.warning(f"Request failed for {url[:80]}: {e}")
        return None


def _query_clinical_trials(sponsor_name, phases=None, status=None):
    """Query ClinicalTrials.gov API v2 for trials by sponsor.

    API docs: https://clinicaltrials.gov/api/v2/studies
    """
    base_url = "https://clinicaltrials.gov/api/v2/studies"
    params = {
        "query.spons": sponsor_name,
        "countTotal": "true",
        "pageSize": 50,
        "fields": "NCTId,BriefTitle,Phase,OverallStatus,StartDate,CompletionDate,Condition,InterventionName",
        "format": "json",
    }

    if phases:
        # ClinicalTrials.gov v2 uses filter.advanced for phase filtering
        phase_filter = " OR ".join([f"AREA[Phase]{p}" for p in phases])
        params["filter.advanced"] = phase_filter

    if status:
        status_str = ",".join(status)
        params["filter.overallStatus"] = status_str

    url = f"{base_url}?{urlencode(params)}"
    return _api_get(url, timeout=20)


def _count_trials_by_phase(sponsor_name):
    """Count active trials by phase for a sponsor."""
    counts = {"PHASE1": 0, "PHASE2": 0, "PHASE3": 0, "PHASE4": 0, "OTHER": 0}

    result = _query_clinical_trials(
        sponsor_name,
        status=["RECRUITING", "ACTIVE_NOT_RECRUITING", "ENROLLING_BY_INVITATION", "NOT_YET_RECRUITING"],
    )

    if not result:
        return counts, []

    studies = result.get("studies", [])
    trials = []

    for study in studies:
        proto = study.get("protocolSection", {})
        id_mod = proto.get("identificationModule", {})
        status_mod = proto.get("statusModule", {})
        design_mod = proto.get("designModule", {})
        conditions_mod = proto.get("conditionsModule", {})
        interventions_mod = proto.get("armsInterventionsModule", {})

        nct_id = id_mod.get("nctId", "")
        title = id_mod.get("briefTitle", "")
        status = status_mod.get("overallStatus", "")
        phases_list = design_mod.get("phases", [])
        phase_str = phases_list[0] if phases_list else "N/A"
        completion = status_mod.get("completionDateStruct", {})
        completion_date = completion.get("date", "")

        conditions = conditions_mod.get("conditions", [])
        condition_str = ", ".join(conditions[:2]) if conditions else "N/A"

        interventions = interventions_mod.get("interventions", [])
        intervention_names = [iv.get("name", "") for iv in interventions[:2]] if interventions else []
        intervention_str = ", ".join(intervention_names) or "N/A"

        # Categorize by phase
        if "PHASE1" in phase_str.upper() or "PHASE 1" in phase_str.upper() or "Phase 1" in phase_str:
            counts["PHASE1"] += 1
        elif "PHASE2" in phase_str.upper() or "PHASE 2" in phase_str.upper() or "Phase 2" in phase_str:
            counts["PHASE2"] += 1
        elif "PHASE3" in phase_str.upper() or "PHASE 3" in phase_str.upper() or "Phase 3" in phase_str:
            counts["PHASE3"] += 1
        elif "PHASE4" in phase_str.upper() or "PHASE 4" in phase_str.upper() or "Phase 4" in phase_str:
            counts["PHASE4"] += 1
        else:
            counts["OTHER"] += 1

        trials.append({
            "nctId": nct_id,
            "title": title[:120],
            "phase": phase_str,
            "status": status,
            "condition": condition_str[:80],
            "intervention": intervention_str[:80],
            "completionDate": completion_date,
        })

    return counts, trials


def _get_fda_approvals(company_name, months_back=12):
    """Query OpenFDA for recent drug approvals by company.

    Uses drug/drugsfda endpoint.
    """
    base_url = "https://api.fda.gov/drug/drugsfda.json"
    cutoff = datetime.now(timezone.utc) - timedelta(days=months_back * 30)
    cutoff_str = cutoff.strftime("%Y%m%d")

    # Search by sponsor name and approval date
    search = f'sponsor_name:"{company_name}"+AND+submissions.submission_status_date:[{cutoff_str}+TO+99991231]'
    params = urlencode({
        "search": search,
        "limit": 20,
    })

    url = f"{base_url}?{params}"
    result = _api_get(url, timeout=15)

    approvals = []
    if result and "results" in result:
        for drug in result["results"]:
            brand = drug.get("openfda", {}).get("brand_name", [""])[0]
            generic = drug.get("openfda", {}).get("generic_name", [""])[0]
            sponsor = drug.get("sponsor_name", "")
            app_no = drug.get("application_number", "")

            # Get most recent approval submission
            submissions = drug.get("submissions", [])
            for sub in submissions:
                sub_type = sub.get("submission_type", "")
                sub_status = sub.get("submission_status", "")
                sub_date = sub.get("submission_status_date", "")

                if "APPROV" in (sub_status or "").upper() or sub_type in ("ORIG", "SUPPL"):
                    approvals.append({
                        "brandName": brand or generic or app_no,
                        "genericName": generic[:60],
                        "applicationNumber": app_no,
                        "approvalDate": sub_date[:10] if sub_date else "",
                        "submissionType": sub_type,
                    })

    return approvals


def _estimate_pdufa_dates(trials):
    """Estimate upcoming PDUFA-like dates from Phase 3 trial completion dates.

    Real PDUFA dates require FDA calendar data; we estimate from
    Phase 3 completion dates + 10 months (typical review period).
    """
    now = datetime.now(timezone.utc)
    ninety_days = now + timedelta(days=90)
    upcoming = []

    for trial in trials:
        if "PHASE3" in trial.get("phase", "").upper().replace(" ", "") or \
           "Phase 3" in trial.get("phase", ""):
            comp_date = trial.get("completionDate", "")
            if comp_date:
                try:
                    # Parse various date formats
                    for fmt in ["%Y-%m-%d", "%B %Y", "%Y-%m", "%B %d, %Y"]:
                        try:
                            cd = datetime.strptime(comp_date, fmt).replace(tzinfo=timezone.utc)
                            break
                        except ValueError:
                            continue
                    else:
                        continue

                    # Estimate PDUFA = completion + 10 months
                    estimated_pdufa = cd + timedelta(days=300)

                    if now <= estimated_pdufa <= now + timedelta(days=365):
                        days_away = (estimated_pdufa - now).days
                        upcoming.append({
                            "trialId": trial["nctId"],
                            "drugName": trial.get("intervention", "Unknown"),
                            "indication": trial.get("condition", "Unknown"),
                            "estimatedDate": estimated_pdufa.strftime("%Y-%m-%d"),
                            "daysAway": days_away,
                            "isWithin90Days": days_away <= 90,
                        })
                except (ValueError, TypeError):
                    pass

    upcoming.sort(key=lambda x: x["daysAway"])
    return upcoming


def analyze(ticker):
    """Analyze FDA pipeline and catalysts for a ticker.

    Returns:
        Dict with FDA catalyst score, pipeline breakdown, upcoming dates,
        recent approvals. None if ticker not relevant.
    """
    ticker = ticker.upper()
    if ticker not in RELEVANT_TICKERS:
        return None

    sponsor = TICKER_TO_SPONSOR.get(ticker)
    fda_name = TICKER_TO_FDA_NAME.get(ticker)
    if not sponsor:
        return None

    now = datetime.now(timezone.utc)

    # 1) Count active trials by phase
    phase_counts, all_trials = _count_trials_by_phase(sponsor)
    total_active = sum(phase_counts.values())

    # 2) Get recent FDA approvals
    recent_approvals = []
    if fda_name:
        recent_approvals = _get_fda_approvals(fda_name, months_back=12)

    # 3) Estimate upcoming PDUFA dates
    upcoming_pdufa = _estimate_pdufa_dates(all_trials)
    pdufa_within_90d = [p for p in upcoming_pdufa if p.get("isWithin90Days")]

    # Compute component scores
    # Pipeline Richness (30%): Phase II + III trials
    p2_p3_count = phase_counts["PHASE2"] + phase_counts["PHASE3"]
    pipeline_score = 5.0
    if p2_p3_count >= 20:
        pipeline_score = 10.0
    elif p2_p3_count >= 12:
        pipeline_score = 9.0
    elif p2_p3_count >= 8:
        pipeline_score = 8.0
    elif p2_p3_count >= 5:
        pipeline_score = 7.0
    elif p2_p3_count >= 3:
        pipeline_score = 6.0
    elif p2_p3_count >= 1:
        pipeline_score = 5.0
    else:
        pipeline_score = 3.0

    # Approval Probability (30%): Based on Phase 3 ratio and historical success
    # Industry average: Phase 1→2: 63%, Phase 2→3: 31%, Phase 3→Approval: 58%
    approval_score = 5.0
    if total_active > 0:
        phase3_ratio = phase_counts["PHASE3"] / total_active
        if phase3_ratio > 0.3 and phase_counts["PHASE3"] >= 3:
            approval_score = 9.0
        elif phase3_ratio > 0.2 or phase_counts["PHASE3"] >= 2:
            approval_score = 7.0
        elif phase_counts["PHASE3"] >= 1:
            approval_score = 6.0
        elif phase_counts["PHASE2"] >= 3:
            approval_score = 5.0
        else:
            approval_score = 4.0
    elif len(recent_approvals) > 0:
        approval_score = 6.0

    # Catalyst Proximity (25%): PDUFA dates within 90 days
    catalyst_score = 5.0
    if len(pdufa_within_90d) >= 3:
        catalyst_score = 10.0
    elif len(pdufa_within_90d) >= 2:
        catalyst_score = 9.0
    elif len(pdufa_within_90d) >= 1:
        catalyst_score = 8.0
    elif len(upcoming_pdufa) >= 2:
        catalyst_score = 6.0
    elif len(upcoming_pdufa) >= 1:
        catalyst_score = 5.0
    else:
        catalyst_score = 3.0

    # Recent Wins (15%): Approvals in last 12 months
    wins_score = 5.0
    approval_count = len(recent_approvals)
    if approval_count >= 5:
        wins_score = 10.0
    elif approval_count >= 3:
        wins_score = 8.0
    elif approval_count >= 2:
        wins_score = 7.0
    elif approval_count >= 1:
        wins_score = 6.0
    else:
        wins_score = 3.0

    # Composite FDA Catalyst Score
    composite = (
        pipeline_score * 0.30
        + approval_score * 0.30
        + catalyst_score * 0.25
        + wins_score * 0.15
    )
    composite = round(max(1.0, min(10.0, composite)), 1)

    # Build pipeline funnel
    pipeline_funnel = {
        "phase1": phase_counts["PHASE1"],
        "phase2": phase_counts["PHASE2"],
        "phase3": phase_counts["PHASE3"],
        "phase4": phase_counts["PHASE4"],
        "approved": len(recent_approvals),
    }

    # Top trials (Phase 2 & 3, max 5)
    top_trials = [
        t for t in all_trials
        if "PHASE2" in t.get("phase", "").upper().replace(" ", "")
        or "PHASE3" in t.get("phase", "").upper().replace(" ", "")
        or "Phase 2" in t.get("phase", "")
        or "Phase 3" in t.get("phase", "")
    ][:5]

    return {
        "ticker": ticker,
        "score": composite,
        "totalActiveTrials": total_active,
        "phaseCounts": phase_counts,
        "pipelineFunnel": pipeline_funnel,
        "pipelineScore": round(pipeline_score, 1),
        "approvalScore": round(approval_score, 1),
        "catalystScore": round(catalyst_score, 1),
        "winsScore": round(wins_score, 1),
        "upcomingPDUFA": upcoming_pdufa[:5],
        "pdufaWithin90Days": len(pdufa_within_90d),
        "recentApprovals": recent_approvals[:5],
        "topTrials": top_trials,
        "sponsorName": sponsor,
        "dataSource": "ClinicalTrials.gov + OpenFDA",
        "analyzedAt": now.isoformat(),
    }

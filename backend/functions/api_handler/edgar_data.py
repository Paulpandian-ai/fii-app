"""SEC EDGAR XBRL Data Pipeline for FII.

Fetches financial fundamentals directly from SEC EDGAR's free XBRL APIs.
No API key needed. Rate limit: 10 req/sec.

Functions:
  - get_company_facts(ticker)     — All XBRL facts for a company
  - get_sector_benchmarks(metric) — Sector-wide benchmark stats
  - extract_supply_chain_from_filing(ticker) — Supply chain from 10-K
  - get_financial_ratios(ticker)  — Comprehensive ratios (EDGAR + yfinance fallback)
"""

import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# SEC requires a descriptive User-Agent header
SEC_USER_AGENT = "FII-App admin@fii.io"
SEC_HEADERS = {"User-Agent": SEC_USER_AGENT, "Accept": "application/json"}

# Rate limiting: 10 req/sec
_last_request_time = 0.0
_MIN_REQUEST_INTERVAL = 0.1  # 100ms between requests

# Ticker → CIK mapping cache (in-memory for Lambda lifetime)
_ticker_cik_cache: dict[str, str] = {}

# XBRL metric names for sector benchmarks
BENCHMARK_METRICS = [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "NetIncomeLoss",
    "EarningsPerShareBasic",
    "Assets",
    "Liabilities",
    "StockholdersEquity",
    "OperatingIncomeLoss",
    "CashAndCashEquivalentsAtCarryingValue",
]


def _rate_limit():
    """Enforce 10 req/sec rate limit for SEC EDGAR."""
    global _last_request_time
    now = time.time()
    elapsed = now - _last_request_time
    if elapsed < _MIN_REQUEST_INTERVAL:
        time.sleep(_MIN_REQUEST_INTERVAL - elapsed)
    _last_request_time = time.time()


def _sec_get(url: str, timeout: int = 15) -> Optional[dict]:
    """Make a rate-limited GET request to SEC EDGAR."""
    _rate_limit()
    try:
        resp = requests.get(url, headers=SEC_HEADERS, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.HTTPError as e:
        logger.warning(f"[EDGAR] HTTP error for {url}: {e}")
        return None
    except Exception as e:
        logger.error(f"[EDGAR] Request failed for {url}: {e}")
        return None


# ─── Ticker → CIK Resolution ───


def _resolve_cik(ticker: str) -> Optional[str]:
    """Resolve ticker to 10-digit zero-padded CIK.

    Checks in-memory cache, then DynamoDB, then fetches from SEC.
    """
    ticker_upper = ticker.upper()

    # Check in-memory cache
    if ticker_upper in _ticker_cik_cache:
        return _ticker_cik_cache[ticker_upper]

    # Check DynamoDB cache
    try:
        import db
        item = db.get_item("META#TICKER_MAP", ticker_upper)
        if item and item.get("cik"):
            cik = item["cik"]
            _ticker_cik_cache[ticker_upper] = cik
            return cik
    except Exception as e:
        logger.debug(f"[EDGAR] DynamoDB CIK lookup failed: {e}")

    # Fetch from SEC
    cik = _fetch_cik_from_sec(ticker_upper)
    if cik:
        _ticker_cik_cache[ticker_upper] = cik
        # Persist to DynamoDB
        try:
            import db
            db.put_item({
                "PK": "META#TICKER_MAP",
                "SK": ticker_upper,
                "cik": cik,
                "ticker": ticker_upper,
                "cachedAt": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as e:
            logger.debug(f"[EDGAR] Failed to cache CIK in DynamoDB: {e}")

    return cik


def _fetch_cik_from_sec(ticker: str) -> Optional[str]:
    """Fetch ticker→CIK mapping from SEC company_tickers.json."""
    url = "https://www.sec.gov/files/company_tickers.json"
    data = _sec_get(url, timeout=10)
    if not data:
        return None

    ticker_upper = ticker.upper()
    for entry in data.values():
        if entry.get("ticker", "").upper() == ticker_upper:
            return str(entry["cik_str"]).zfill(10)

    logger.warning(f"[EDGAR] Ticker {ticker} not found in SEC mapping")
    return None


# ─── Company Facts (XBRL) ───


def get_company_facts(ticker: str) -> dict:
    """Fetch all reported XBRL facts for a company from SEC EDGAR.

    Uses: https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json

    Args:
        ticker: Stock ticker symbol (e.g., "NVDA").

    Returns:
        Parsed JSON with all reported XBRL facts, or empty dict on failure.
    """
    cik = _resolve_cik(ticker)
    if not cik:
        logger.warning(f"[EDGAR] Cannot resolve CIK for {ticker}")
        return {}

    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
    data = _sec_get(url, timeout=20)
    if not data:
        return {}

    return data


def _get_latest_fact_value(facts: dict, concept: str,
                           taxonomy: str = "us-gaap",
                           unit: str = "USD",
                           form: str = "10-K") -> Optional[float]:
    """Extract the most recent value for a specific XBRL concept.

    Args:
        facts: Full company facts JSON from get_company_facts().
        concept: XBRL concept name (e.g., "NetIncomeLoss").
        taxonomy: XBRL taxonomy (default "us-gaap").
        unit: Unit type (default "USD", use "USD/shares" for EPS).
        form: Filing form type to filter by (default "10-K").

    Returns:
        Most recent value as float, or None if not found.
    """
    try:
        concept_data = facts.get("facts", {}).get(taxonomy, {}).get(concept, {})
        units = concept_data.get("units", {})
        entries = units.get(unit, [])

        if not entries:
            return None

        # Filter by form type and get most recent
        filed = [e for e in entries if e.get("form") == form]
        if not filed:
            filed = entries  # Fall back to all entries

        # Sort by end date descending
        filed.sort(key=lambda x: x.get("end", ""), reverse=True)

        if filed:
            return float(filed[0].get("val", 0))
    except Exception as e:
        logger.debug(f"[EDGAR] Failed to extract {concept}: {e}")

    return None


def _get_fact_values_by_year(facts: dict, concept: str,
                              taxonomy: str = "us-gaap",
                              unit: str = "USD",
                              form: str = "10-K",
                              years: int = 3) -> list[dict]:
    """Extract values for a concept across multiple years.

    Returns list of {year, value, end_date} sorted by year descending.
    """
    try:
        concept_data = facts.get("facts", {}).get(taxonomy, {}).get(concept, {})
        units = concept_data.get("units", {})
        entries = units.get(unit, [])

        if not entries:
            return []

        # Filter by form and deduplicate by fiscal year
        filed = [e for e in entries if e.get("form") == form]
        if not filed:
            filed = entries

        # Group by fiscal year (end date year)
        by_year: dict[int, dict] = {}
        for e in filed:
            end = e.get("end", "")
            if len(end) >= 4:
                year = int(end[:4])
                # Keep the latest filing per year
                if year not in by_year or end > by_year[year].get("end", ""):
                    by_year[year] = {
                        "year": year,
                        "value": float(e.get("val", 0)),
                        "end_date": end,
                    }

        result = sorted(by_year.values(), key=lambda x: x["year"], reverse=True)
        return result[:years]
    except Exception as e:
        logger.debug(f"[EDGAR] Failed to extract {concept} by year: {e}")
        return []


# ─── Sector Benchmarks ───


def get_sector_benchmarks(metric: str, year: int = None) -> dict:
    """Fetch sector-wide benchmark statistics for a given XBRL metric.

    Uses: https://data.sec.gov/api/xbrl/frames/us-gaap/{metric}/USD/CY{year}.json

    Args:
        metric: XBRL concept name (e.g., "NetIncomeLoss").
        year: Calendar year (defaults to current year - 1 for complete data).

    Returns:
        Dict with mean, median, p25, p75, count statistics.
    """
    if year is None:
        year = datetime.now(timezone.utc).year - 1

    # Check DynamoDB cache (weekly refresh)
    cache_pk = "META#SECTOR_BENCHMARKS"
    cache_sk = f"{metric}#{year}"
    try:
        import db
        cached = db.get_item(cache_pk, cache_sk)
        if cached:
            cached_at = cached.get("cachedAt", "")
            if cached_at:
                cached_dt = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                age_hours = (datetime.now(timezone.utc) - cached_dt).total_seconds() / 3600
                if age_hours < 168:  # 7 days
                    logger.info(f"[EDGAR] Benchmark cache hit: {metric}/{year}")
                    return {
                        "mean": cached.get("mean"),
                        "median": cached.get("median"),
                        "p25": cached.get("p25"),
                        "p75": cached.get("p75"),
                        "count": cached.get("count"),
                        "source": "edgar_cache",
                        "data_freshness": cached_at,
                    }
    except Exception:
        pass

    url = f"https://data.sec.gov/api/xbrl/frames/us-gaap/{metric}/USD/CY{year}.json"
    data = _sec_get(url, timeout=20)
    if not data:
        return {"error": f"No benchmark data for {metric}/{year}", "source": "edgar"}

    entries = data.get("data", [])
    if not entries:
        return {"error": f"Empty benchmark data for {metric}/{year}", "source": "edgar"}

    values = [float(e.get("val", 0)) for e in entries if e.get("val") is not None]
    if not values:
        return {"error": f"No valid values for {metric}/{year}", "source": "edgar"}

    values.sort()
    count = len(values)
    total = sum(values)
    mean = total / count

    # Percentile calculation
    def _percentile(sorted_vals, p):
        idx = (p / 100) * (len(sorted_vals) - 1)
        lo = int(idx)
        hi = min(lo + 1, len(sorted_vals) - 1)
        frac = idx - lo
        return sorted_vals[lo] + frac * (sorted_vals[hi] - sorted_vals[lo])

    result = {
        "mean": round(mean, 2),
        "median": round(_percentile(values, 50), 2),
        "p25": round(_percentile(values, 25), 2),
        "p75": round(_percentile(values, 75), 2),
        "count": count,
        "source": "edgar",
        "data_freshness": datetime.now(timezone.utc).isoformat(),
    }

    # Cache in DynamoDB
    try:
        import db
        db.put_item({
            "PK": cache_pk,
            "SK": cache_sk,
            **result,
            "cachedAt": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.debug(f"[EDGAR] Failed to cache benchmarks: {e}")

    return result


# ─── Supply Chain Extraction ───


def extract_supply_chain_from_filing(ticker: str) -> list[dict]:
    """Extract supply chain entities from SEC 10-K filings using EDGAR full-text search.

    Uses EDGAR EFTS search to find 10-K filings mentioning customers/suppliers,
    then applies regex patterns to extract entity relationships.

    Args:
        ticker: Stock ticker symbol (e.g., "NVDA").

    Returns:
        List of dicts with entity, relationship, detail, revenue_pct, source.
    """
    cik = _resolve_cik(ticker)
    if not cik:
        logger.warning(f"[EDGAR] Cannot resolve CIK for {ticker}")
        return []

    # Search for 10-K filings with supply chain mentions
    search_url = (
        f"https://efts.sec.gov/LATEST/search-index"
        f"?q=%22major+customer%22+OR+%22sole+source%22"
        f"&dateRange=custom&startdt=2024-01-01"
        f"&forms=10-K&entity={ticker}"
    )
    search_data = _sec_get(search_url, timeout=20)

    entities = []

    if not search_data:
        return _extract_from_latest_10k(ticker, cik)

    hits = search_data.get("hits", {}).get("hits", [])
    if not hits:
        return _extract_from_latest_10k(ticker, cik)

    # Process first result (most recent 10-K)
    for hit in hits[:1]:
        filing_url = hit.get("_source", {}).get("file_url", "")
        if not filing_url:
            continue

        try:
            _rate_limit()
            resp = requests.get(
                filing_url,
                headers={"User-Agent": SEC_USER_AGENT},
                timeout=30,
            )
            resp.raise_for_status()
            text = resp.text

            extracted = _extract_entities_from_text(text, ticker)
            entities.extend(extracted)
        except Exception as e:
            logger.warning(f"[EDGAR] Failed to fetch filing text: {e}")

    if not entities:
        entities = _extract_from_latest_10k(ticker, cik)

    return entities


def _extract_from_latest_10k(ticker: str, cik: str) -> list[dict]:
    """Fall back to fetching the latest 10-K and extracting entities."""
    try:
        submissions_url = f"https://data.sec.gov/submissions/CIK{cik}.json"
        data = _sec_get(submissions_url, timeout=15)
        if not data:
            return []

        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        accession_numbers = recent.get("accessionNumber", [])
        primary_docs = recent.get("primaryDocument", [])

        for i, form in enumerate(forms):
            if form == "10-K":
                accession = accession_numbers[i].replace("-", "")
                doc = primary_docs[i]
                cik_num = cik.lstrip("0")
                filing_url = f"https://www.sec.gov/Archives/edgar/data/{cik_num}/{accession}/{doc}"

                _rate_limit()
                resp = requests.get(
                    filing_url,
                    headers={"User-Agent": SEC_USER_AGENT},
                    timeout=30,
                )
                resp.raise_for_status()

                from bs4 import BeautifulSoup
                soup = BeautifulSoup(resp.text, "html.parser")
                for tag in soup(["script", "style"]):
                    tag.decompose()
                text = soup.get_text(separator="\n")

                return _extract_entities_from_text(text, ticker)
    except Exception as e:
        logger.error(f"[EDGAR] Failed to extract from 10-K for {ticker}: {e}")

    return []


def _extract_entities_from_text(text: str, ticker: str) -> list[dict]:
    """Extract customer/supplier entities from filing text using regex patterns.

    Uses basic patterns to find percentage mentions near company names
    and supply chain language. This extraction is imperfect—Claude refines
    it during scoring.
    """
    entities = []
    seen_entities = set()

    # Truncate to relevant sections (first 100k chars)
    text = text[:100_000]

    # Pattern: "X% of revenue" or "X% of net revenue" near company names
    revenue_pct_pattern = re.compile(
        r'([A-Z][A-Za-z\s&\.\,]+?)\s+'
        r'(?:accounted for|represented|comprised)\s+'
        r'(?:approximately\s+)?(\d{1,3})%\s+'
        r'of\s+(?:our\s+)?(?:total\s+)?(?:net\s+)?(?:revenue|sales|net revenue)',
        re.IGNORECASE,
    )

    for match in revenue_pct_pattern.finditer(text):
        entity_name = match.group(1).strip()
        pct = int(match.group(2))
        if entity_name and len(entity_name) > 2 and entity_name not in seen_entities:
            seen_entities.add(entity_name)
            entities.append({
                "entity": entity_name[:50],
                "relationship": "customer",
                "detail": f"Accounted for {pct}% of revenue",
                "revenue_pct": pct,
                "source": "10-K revenue disclosure",
            })

    # Pattern: "sole source" or "single source" supplier mentions
    sole_source_pattern = re.compile(
        r'(?:sole[- ]source|single[- ]source)\s+(?:supplier|vendor|provider)\s*'
        r'(?:of|for)?\s*([A-Za-z\s\,]+?)(?:\.|,|\s+and\s)',
        re.IGNORECASE,
    )

    for match in sole_source_pattern.finditer(text):
        detail = match.group(1).strip()
        if detail and len(detail) > 3:
            key = f"sole_source_{detail[:30]}"
            if key not in seen_entities:
                seen_entities.add(key)
                entities.append({
                    "entity": "Undisclosed",
                    "relationship": "supplier",
                    "detail": f"Sole-source supplier of {detail[:80]}",
                    "revenue_pct": None,
                    "source": "10-K risk factors",
                })

    # Pattern: "major customer" or "significant customer" mentions
    major_customer_pattern = re.compile(
        r'(?:major|significant|largest|key)\s+customer[s]?\s*'
        r'(?:include[s]?|(?:is|are))\s+([A-Z][A-Za-z\s&\.\,]+?)(?:\.|,\s+and\s)',
        re.IGNORECASE,
    )

    for match in major_customer_pattern.finditer(text):
        raw = match.group(1).strip()
        names = [n.strip() for n in re.split(r',\s*|\s+and\s+', raw) if n.strip()]
        for name in names[:5]:
            if len(name) > 2 and name not in seen_entities:
                seen_entities.add(name)
                entities.append({
                    "entity": name[:50],
                    "relationship": "customer",
                    "detail": "Major customer",
                    "revenue_pct": None,
                    "source": "10-K customer disclosure",
                })

    # Pattern: geographic concentration
    geo_pattern = re.compile(
        r'(?:operations|revenue|sales|manufacturing)\s+in\s+'
        r'(China|Taiwan|Japan|South Korea|India|Germany|Israel|Ireland|Singapore)'
        r'\s+(?:accounted for|represented|comprised)\s+(?:approximately\s+)?(\d{1,3})%',
        re.IGNORECASE,
    )

    for match in geo_pattern.finditer(text):
        country = match.group(1)
        pct = int(match.group(2))
        key = f"geo_{country}"
        if key not in seen_entities:
            seen_entities.add(key)
            entities.append({
                "entity": country,
                "relationship": "geographic_concentration",
                "detail": f"{pct}% of operations/revenue",
                "revenue_pct": pct,
                "source": "10-K geographic disclosure",
            })

    return entities


# ─── Financial Ratios ───


def get_financial_ratios(ticker: str) -> dict:
    """Compute comprehensive financial ratios from XBRL facts.

    Computes: pe_ratio, debt_to_equity, current_ratio, gross_margin,
    operating_margin, net_margin, roe, roa, revenue_growth_yoy,
    eps_growth_yoy. Falls back to yfinance if EDGAR data is incomplete.

    Args:
        ticker: Stock ticker symbol (e.g., "NVDA").

    Returns:
        Dict with all ratios + source ("edgar", "yfinance", or "mixed").
    """
    # Check DynamoDB cache (daily refresh)
    cache_pk = f"FINANCIALS#{ticker.upper()}"
    cache_sk = "RATIOS"
    try:
        import db
        cached = db.get_item(cache_pk, cache_sk)
        if cached:
            cached_at = cached.get("cachedAt", "")
            if cached_at:
                cached_dt = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                age_hours = (datetime.now(timezone.utc) - cached_dt).total_seconds() / 3600
                if age_hours < 24:
                    logger.info(f"[EDGAR] Ratios cache hit for {ticker}")
                    return cached
    except Exception:
        pass

    # Try EDGAR first
    ratios = _compute_ratios_from_edgar(ticker)

    # Fall back to yfinance for missing values
    if _has_missing_ratios(ratios):
        yf_ratios = _get_ratios_from_yfinance(ticker)
        ratios = _merge_ratios(ratios, yf_ratios)

    # Get market cap for P/E calculation
    if ratios.get("net_income") and not ratios.get("pe_ratio"):
        market_cap = _get_market_cap(ticker)
        if market_cap and ratios["net_income"] != 0:
            ratios["pe_ratio"] = round(market_cap / ratios["net_income"], 2)
            ratios["market_cap"] = market_cap

    # Add metadata
    ratios["ticker"] = ticker.upper()
    ratios["data_freshness"] = datetime.now(timezone.utc).isoformat()

    # Cache in DynamoDB
    try:
        import db
        from decimal import Decimal

        # Convert floats to Decimal for DynamoDB
        cache_item = {"PK": cache_pk, "SK": cache_sk}
        for k, v in ratios.items():
            if isinstance(v, float):
                cache_item[k] = Decimal(str(round(v, 6)))
            else:
                cache_item[k] = v
        cache_item["cachedAt"] = datetime.now(timezone.utc).isoformat()
        db.put_item(cache_item)
    except Exception as e:
        logger.debug(f"[EDGAR] Failed to cache ratios: {e}")

    return ratios


def _compute_ratios_from_edgar(ticker: str) -> dict:
    """Compute financial ratios from EDGAR XBRL facts."""
    facts = get_company_facts(ticker)
    if not facts:
        return {"source": "edgar", "error": "No EDGAR data available"}

    # Extract key financial values
    revenue = _get_latest_fact_value(facts, "RevenueFromContractWithCustomerExcludingAssessedTax")
    if revenue is None:
        revenue = _get_latest_fact_value(facts, "Revenues")
    if revenue is None:
        revenue = _get_latest_fact_value(facts, "SalesRevenueNet")

    net_income = _get_latest_fact_value(facts, "NetIncomeLoss")
    total_assets = _get_latest_fact_value(facts, "Assets")
    total_liabilities = _get_latest_fact_value(facts, "Liabilities")
    stockholders_equity = _get_latest_fact_value(facts, "StockholdersEquity")
    operating_income = _get_latest_fact_value(facts, "OperatingIncomeLoss")
    gross_profit = _get_latest_fact_value(facts, "GrossProfit")
    current_assets = _get_latest_fact_value(facts, "AssetsCurrent")
    current_liabilities = _get_latest_fact_value(facts, "LiabilitiesCurrent")
    cash = _get_latest_fact_value(facts, "CashAndCashEquivalentsAtCarryingValue")
    eps = _get_latest_fact_value(facts, "EarningsPerShareBasic", unit="USD/shares")

    # YoY growth calculations
    revenue_history = _get_fact_values_by_year(
        facts, "RevenueFromContractWithCustomerExcludingAssessedTax", years=2,
    )
    if len(revenue_history) < 2:
        revenue_history = _get_fact_values_by_year(facts, "Revenues", years=2)
    if len(revenue_history) < 2:
        revenue_history = _get_fact_values_by_year(facts, "SalesRevenueNet", years=2)

    eps_history = _get_fact_values_by_year(
        facts, "EarningsPerShareBasic", unit="USD/shares", years=2,
    )

    revenue_growth = None
    if len(revenue_history) >= 2:
        curr = revenue_history[0]["value"]
        prev = revenue_history[1]["value"]
        if prev and prev != 0:
            revenue_growth = round((curr - prev) / abs(prev) * 100, 2)

    eps_growth = None
    if len(eps_history) >= 2:
        curr = eps_history[0]["value"]
        prev = eps_history[1]["value"]
        if prev and prev != 0:
            eps_growth = round((curr - prev) / abs(prev) * 100, 2)

    # Compute ratios
    ratios = {
        "source": "edgar",
        "pe_ratio": None,  # Needs market cap from yfinance
        "debt_to_equity": _safe_ratio(total_liabilities, stockholders_equity),
        "current_ratio": _safe_ratio(current_assets, current_liabilities),
        "gross_margin": _safe_ratio(gross_profit, revenue, pct=True),
        "operating_margin": _safe_ratio(operating_income, revenue, pct=True),
        "net_margin": _safe_ratio(net_income, revenue, pct=True),
        "roe": _safe_ratio(net_income, stockholders_equity, pct=True),
        "roa": _safe_ratio(net_income, total_assets, pct=True),
        "revenue_growth_yoy": revenue_growth,
        "eps_growth_yoy": eps_growth,
        # Raw values for reference
        "revenue": revenue,
        "net_income": net_income,
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "stockholders_equity": stockholders_equity,
        "operating_income": operating_income,
        "gross_profit": gross_profit,
        "current_assets": current_assets,
        "current_liabilities": current_liabilities,
        "cash": cash,
        "eps": eps,
    }

    return ratios


def _safe_ratio(numerator, denominator, pct: bool = False) -> Optional[float]:
    """Compute ratio safely, returning None on division by zero."""
    if numerator is None or denominator is None or denominator == 0:
        return None
    result = numerator / denominator
    if pct:
        result *= 100
    return round(result, 2)


def _has_missing_ratios(ratios: dict) -> bool:
    """Check if key ratios are missing from EDGAR data."""
    key_fields = ["debt_to_equity", "current_ratio", "net_margin", "roe", "revenue_growth_yoy"]
    return any(ratios.get(f) is None for f in key_fields)


def _get_market_cap(ticker: str) -> Optional[float]:
    """Get market cap for P/E calculation, using yfinance."""
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        info = stock.info
        return info.get("marketCap")
    except Exception as e:
        logger.debug(f"[EDGAR] Failed to get market cap for {ticker}: {e}")

    # Fallback: try Finnhub
    try:
        import finnhub_client
        profile = finnhub_client.get_profile(ticker)
        if profile and profile.get("marketCapitalization"):
            # Finnhub returns market cap in millions
            return profile["marketCapitalization"] * 1_000_000
    except Exception:
        pass

    return None


def _get_ratios_from_yfinance(ticker: str) -> dict:
    """Fetch financial ratios from yfinance as fallback."""
    try:
        import yfinance as yf
        stock = yf.Ticker(ticker)
        info = stock.info

        return {
            "source": "yfinance",
            "pe_ratio": info.get("trailingPE"),
            "debt_to_equity": info.get("debtToEquity"),
            "current_ratio": info.get("currentRatio"),
            "gross_margin": _pct_or_none(info.get("grossMargins")),
            "operating_margin": _pct_or_none(info.get("operatingMargins")),
            "net_margin": _pct_or_none(info.get("profitMargins")),
            "roe": _pct_or_none(info.get("returnOnEquity")),
            "roa": _pct_or_none(info.get("returnOnAssets")),
            "revenue_growth_yoy": _pct_or_none(info.get("revenueGrowth")),
            "eps_growth_yoy": _pct_or_none(info.get("earningsGrowth")),
            "revenue": info.get("totalRevenue"),
            "net_income": info.get("netIncomeToCommon"),
            "total_assets": None,
            "total_liabilities": info.get("totalDebt"),
            "stockholders_equity": None,
            "operating_income": info.get("operatingCashflow"),
            "gross_profit": info.get("grossProfits"),
            "current_assets": None,
            "current_liabilities": None,
            "cash": info.get("totalCash"),
            "eps": info.get("trailingEps"),
            "market_cap": info.get("marketCap"),
        }
    except Exception as e:
        logger.warning(f"[EDGAR] yfinance fallback failed for {ticker}: {e}")
        return {"source": "yfinance", "error": str(e)}


def _pct_or_none(val) -> Optional[float]:
    """Convert yfinance ratio (0.xx) to percentage, or None."""
    if val is None:
        return None
    return round(val * 100, 2)


def _merge_ratios(edgar: dict, yfinance: dict) -> dict:
    """Merge EDGAR and yfinance ratios, preferring EDGAR values."""
    merged = dict(edgar)
    merged["source"] = "mixed" if edgar.get("source") == "edgar" else edgar.get("source", "unknown")

    for key, yf_val in yfinance.items():
        if key in ("source", "error"):
            continue
        if merged.get(key) is None and yf_val is not None:
            merged[key] = yf_val
            merged["source"] = "mixed"

    return merged

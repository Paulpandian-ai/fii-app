"""SEC EDGAR filing extraction for FII.

Uses the SEC EDGAR EFTS API and requests + BeautifulSoup to fetch
10-K filings and Claude to extract supply chain entities (suppliers,
customers, competitors, risks). Results are cached in S3 for 90 days.
"""

import json
import logging
import re
from typing import Optional

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# SEC requires a descriptive User-Agent header
SEC_USER_AGENT = "FII-App support@fii-app.com"

# S3 cache TTL in hours (90 days)
SEC_CACHE_TTL_HOURS = 90 * 24

# Max text length sent to Claude (to stay within token limits)
MAX_FILING_TEXT_LENGTH = 80_000

# SEC EDGAR EFTS full-text search API
EFTS_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index"

# SEC EDGAR company filings browse endpoint
BROWSE_URL = "https://www.sec.gov/cgi-bin/browse-edgar"

# SEC EDGAR company search (returns CIK + recent filings as JSON)
COMPANY_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"

EXTRACTION_PROMPT = """You are a financial analyst. From this SEC 10-K filing text, extract ALL of the following:

1. SUPPLIERS — with dependency level (critical/important/minor) and what they supply
2. CUSTOMERS — with revenue share percentage if mentioned, and relationship description
3. COMPETITORS — with competitive positioning notes
4. GEOGRAPHIC RISKS — with specific countries and risk descriptions
5. KEY DEPENDENCIES — sole-source suppliers, concentration risks, critical inputs

Return JSON only in this exact format:
{
  "suppliers": [{"name": "...", "dependency": "critical|important|minor", "supplies": "..."}],
  "customers": [{"name": "...", "revenue_share": "...", "relationship": "..."}],
  "competitors": [{"name": "...", "positioning": "..."}],
  "geographic_risks": [{"country": "...", "risk": "..."}],
  "key_dependencies": [{"type": "...", "description": "...", "severity": "high|medium|low"}]
}"""


def extract_supply_chain(ticker: str) -> dict:
    """Extract supply chain entities from SEC 10-K filing.

    Checks S3 cache first (90-day TTL). If cache miss, fetches
    the latest 10-K via SEC EDGAR API, extracts text, and sends
    to Claude for entity extraction.

    Args:
        ticker: Stock ticker symbol (e.g., "NVDA").

    Returns:
        Dict with suppliers, customers, competitors, geographic_risks,
        key_dependencies. Returns empty structure on failure.
    """
    import s3

    cache_key = f"sec_cache/{ticker}_10k.json"
    empty_result = _empty_supply_chain()

    # Check S3 cache
    cache_age = s3.get_file_age_hours(cache_key)
    if cache_age < SEC_CACHE_TTL_HOURS:
        cached = s3.read_json(cache_key)
        if cached:
            logger.info(f"[SEC] Cache hit for {ticker} (age: {cache_age:.0f}h)")
            return cached

    logger.info(f"[SEC] Cache miss for {ticker}, fetching from EDGAR")

    # Fetch 10-K filing text
    filing_text = _fetch_10k_text(ticker)
    if not filing_text:
        logger.warning(f"[SEC] No 10-K filing found for {ticker}")
        return empty_result

    # Extract entities via Claude
    entities = _extract_entities_via_claude(ticker, filing_text)

    # Cache result in S3
    s3.write_json(cache_key, entities)
    logger.info(f"[SEC] Cached extraction for {ticker}")

    return entities


def _get_cik(ticker: str) -> Optional[str]:
    """Look up the CIK number for a ticker symbol."""
    try:
        resp = requests.get(
            COMPANY_TICKERS_URL,
            headers={"User-Agent": SEC_USER_AGENT},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        ticker_upper = ticker.upper()
        for entry in data.values():
            if entry.get("ticker", "").upper() == ticker_upper:
                return str(entry["cik_str"]).zfill(10)
    except Exception as e:
        logger.error(f"[SEC] CIK lookup failed for {ticker}: {e}")
    return None


def _get_latest_10k_url(cik: str) -> Optional[str]:
    """Get the filing document URL for the latest 10-K."""
    try:
        submissions_url = f"https://data.sec.gov/submissions/CIK{cik}.json"
        resp = requests.get(
            submissions_url,
            headers={"User-Agent": SEC_USER_AGENT},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        accession_numbers = recent.get("accessionNumber", [])
        primary_docs = recent.get("primaryDocument", [])

        for i, form in enumerate(forms):
            if form == "10-K":
                accession = accession_numbers[i].replace("-", "")
                doc = primary_docs[i]
                return f"https://www.sec.gov/Archives/edgar/data/{cik.lstrip('0')}/{accession}/{doc}"

        logger.warning(f"[SEC] No 10-K found in recent filings for CIK {cik}")
    except Exception as e:
        logger.error(f"[SEC] Error fetching submissions for CIK {cik}: {e}")
    return None


def _fetch_10k_text(ticker: str) -> Optional[str]:
    """Fetch the latest 10-K filing text from SEC EDGAR.

    Uses the SEC submissions API to find the latest 10-K, then
    downloads and parses it with BeautifulSoup.
    """
    try:
        cik = _get_cik(ticker)
        if not cik:
            logger.warning(f"[SEC] Could not find CIK for {ticker}")
            return None

        filing_url = _get_latest_10k_url(cik)
        if not filing_url:
            return None

        logger.info(f"[SEC] Fetching 10-K from {filing_url}")
        resp = requests.get(
            filing_url,
            headers={"User-Agent": SEC_USER_AGENT},
            timeout=30,
        )
        resp.raise_for_status()

        # Parse HTML filing with built-in html.parser (no lxml needed)
        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove script and style elements
        for tag in soup(["script", "style"]):
            tag.decompose()

        # Extract text
        text = soup.get_text(separator="\n")

        # Clean up whitespace
        lines = [line.strip() for line in text.splitlines()]
        text = "\n".join(line for line in lines if line)

        # Try to extract key sections (Item 1, 1A, 7)
        sections = _extract_sections(text)
        if sections:
            combined = "\n\n---\n\n".join(sections)
        else:
            combined = text

        # Truncate to stay within token limits
        if len(combined) > MAX_FILING_TEXT_LENGTH:
            combined = combined[:MAX_FILING_TEXT_LENGTH]

        return combined if combined.strip() else None

    except Exception as e:
        logger.error(f"[SEC] Error fetching 10-K for {ticker}: {e}")
        return None


def _extract_sections(text: str) -> list[str]:
    """Try to extract Item 1, Item 1A, and Item 7 sections from filing text."""
    sections = []

    # Patterns to find section headers in 10-K filings
    section_patterns = [
        (r"(?i)\bItem\s+1[\.\s]+Business\b", r"(?i)\bItem\s+1A[\.\s]"),
        (r"(?i)\bItem\s+1A[\.\s]+Risk\s+Factors\b", r"(?i)\bItem\s+1B[\.\s]"),
        (r"(?i)\bItem\s+7[\.\s]+Management.s\s+Discussion\b", r"(?i)\bItem\s+7A[\.\s]"),
    ]

    for start_pattern, end_pattern in section_patterns:
        start_match = re.search(start_pattern, text)
        if not start_match:
            continue

        start_idx = start_match.start()
        end_match = re.search(end_pattern, text[start_idx + 100:])
        if end_match:
            end_idx = start_idx + 100 + end_match.start()
            section = text[start_idx:end_idx].strip()
        else:
            # Take up to 20k chars if we can't find the end marker
            section = text[start_idx:start_idx + 20_000].strip()

        if len(section) > 200:
            sections.append(section)

    return sections


def _extract_entities_via_claude(ticker: str, filing_text: str) -> dict:
    """Send filing text to Claude for entity extraction."""
    try:
        import anthropic
        import claude_client

        api_key = claude_client._get_api_key()
        client = anthropic.Anthropic(api_key=api_key)

        message = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=4096,
            messages=[
                {
                    "role": "user",
                    "content": f"Analyze this 10-K filing for {ticker}:\n\n{filing_text}\n\n{EXTRACTION_PROMPT}",
                }
            ],
        )

        response_text = message.content[0].text

        # Parse JSON from response (handle potential markdown wrapping)
        json_text = response_text
        if "```json" in json_text:
            json_text = json_text.split("```json")[1].split("```")[0]
        elif "```" in json_text:
            json_text = json_text.split("```")[1].split("```")[0]

        entities = json.loads(json_text.strip())
        entities["ticker"] = ticker
        entities["source"] = "10-K"
        return entities

    except Exception as e:
        logger.error(f"[SEC] Claude extraction failed for {ticker}: {e}")
        return _empty_supply_chain()


def _empty_supply_chain() -> dict:
    """Return an empty supply chain structure."""
    return {
        "suppliers": [],
        "customers": [],
        "competitors": [],
        "geographic_risks": [],
        "key_dependencies": [],
    }

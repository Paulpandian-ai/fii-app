"""SEC EDGAR filing extraction for FII.

Uses edgartools to fetch 10-K filings and Claude to extract
supply chain entities (suppliers, customers, competitors, risks).
Results are cached in S3 for 90 days.
"""

import json
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# S3 cache TTL in hours (90 days)
SEC_CACHE_TTL_HOURS = 90 * 24

# Max text length sent to Claude (to stay within token limits)
MAX_FILING_TEXT_LENGTH = 80_000

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
    the latest 10-K via edgartools, extracts key sections, and
    sends to Claude for entity extraction.

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


def _fetch_10k_text(ticker: str) -> Optional[str]:
    """Fetch the latest 10-K filing text using edgartools.

    Extracts Item 1 (Business), Item 1A (Risk Factors),
    and Item 7 (MD&A) sections.
    """
    try:
        from edgar import Company

        company = Company(ticker)
        filings = company.get_filings(form="10-K")

        if not filings or len(filings) == 0:
            logger.warning(f"[SEC] No 10-K filings found for {ticker}")
            return None

        latest_filing = filings[0]
        filing_obj = latest_filing.obj()

        sections = []

        # Try to extract key sections
        for section_attr in ["item1", "item1a", "item7"]:
            try:
                section = getattr(filing_obj, section_attr, None)
                if section:
                    text = str(section)
                    if text:
                        sections.append(text)
            except Exception as e:
                logger.debug(f"[SEC] Could not extract {section_attr}: {e}")

        if not sections:
            # Fallback: try to get the full text
            try:
                full_text = str(filing_obj)
                if full_text:
                    sections.append(full_text[:MAX_FILING_TEXT_LENGTH])
            except Exception:
                pass

        if not sections:
            return None

        combined = "\n\n---\n\n".join(sections)

        # Truncate to stay within token limits
        if len(combined) > MAX_FILING_TEXT_LENGTH:
            combined = combined[:MAX_FILING_TEXT_LENGTH]

        return combined

    except Exception as e:
        logger.error(f"[SEC] Error fetching 10-K for {ticker}: {e}")
        return None


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

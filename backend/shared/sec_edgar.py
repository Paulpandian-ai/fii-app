"""SEC EDGAR filing extraction for FII.

Fetches and analyzes recent SEC filings (10-K, 10-Q, 8-K)
for risk factors and material disclosures.
"""

from typing import Optional


def get_recent_filings(ticker: str, filing_types: Optional[list[str]] = None) -> list[dict]:
    """Fetch recent SEC filings for a company.

    Args:
        ticker: Stock ticker symbol.
        filing_types: List of filing types to fetch (default: ["10-K", "10-Q", "8-K"]).

    Returns:
        List of filing metadata dicts.
    """
    if filing_types is None:
        filing_types = ["10-K", "10-Q", "8-K"]

    # Placeholder — will use SEC EDGAR API in Prompt 2
    return []


def extract_risk_factors(filing_url: str) -> dict:
    """Extract risk factors from a filing document.

    Args:
        filing_url: URL to the SEC filing document.

    Returns:
        Dict with extracted risk factors and key changes.
    """
    # Placeholder — will parse EDGAR HTML in Prompt 2
    return {"risk_factors": [], "key_changes": []}

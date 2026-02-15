"""Claude API wrapper for FII signal analysis.

Retrieves the API key from AWS Secrets Manager and provides
a simple interface for generating stock analysis.
"""

import json
import os
from typing import Optional

import boto3

_secrets_client = boto3.client("secretsmanager")
_api_key: Optional[str] = None


def _get_api_key() -> str:
    """Retrieve Claude API key from Secrets Manager (cached)."""
    global _api_key
    if _api_key is None:
        arn = os.environ.get("CLAUDE_API_KEY_ARN", "")
        response = _secrets_client.get_secret_value(SecretId=arn)
        _api_key = response["SecretString"]
    return _api_key


def analyze_stock(
    ticker: str,
    factor_data: dict,
    system_prompt: Optional[str] = None,
) -> dict:
    """Send factor data to Claude for synthesis and scoring.

    Args:
        ticker: Stock ticker symbol.
        factor_data: Dict with raw factor data for all 6 factors.
        system_prompt: Optional custom system prompt.

    Returns:
        Dict with composite_score, signal, insight, and factor_scores.
    """
    # Placeholder — will use anthropic SDK in Prompt 2
    return {
        "composite_score": 5.0,
        "signal": "HOLD",
        "insight": f"Analysis pending for {ticker}",
        "factor_scores": [],
    }


def generate_coaching_insight(
    portfolio_actions: list[dict],
    bias_context: str,
) -> dict:
    """Generate behavioral coaching insight from trading patterns.

    Args:
        portfolio_actions: Recent user portfolio actions.
        bias_context: Description of potential behavioral bias.

    Returns:
        Dict with coaching insight and recommendations.
    """
    # Placeholder — will be implemented in Prompt 6
    return {
        "insight": "Coaching insights coming soon.",
        "recommendations": [],
    }

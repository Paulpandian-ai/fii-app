"""Pydantic models for FII data validation.

Defines the schema for all data types flowing through the system,
including the 6-factor scoring model (18 sub-factors A1–F3).
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ─── Enums ───

class Signal(str, Enum):
    BUY = "BUY"
    HOLD = "HOLD"
    SELL = "SELL"


class Confidence(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


# ─── 6-Factor Model Constants ───

FACTOR_IDS = [
    "A1", "A2", "A3",  # Upstream Suppliers
    "B1", "B2", "B3",  # Downstream Customers
    "C1", "C2", "C3",  # Geopolitics
    "D1", "D2", "D3",  # Monetary
    "E1", "E2", "E3",  # Correlations
    "F1", "F2", "F3",  # Risk & Performance
]

FACTOR_NAMES = {
    "A1": "Operational Disruption",
    "A2": "Supplier Earnings Miss",
    "A3": "Lead Time Extensions",
    "B1": "CapEx Guidance Changes",
    "B2": "Contract Updates",
    "B3": "Customer Revenue Growth",
    "C1": "Physical Conflict",
    "C2": "Trade Barriers",
    "C3": "Logistics Disruption",
    "D1": "Fed Decisions",
    "D2": "CPI/Inflation",
    "D3": "10Y Treasury Yield",
    "E1": "Sector Peers",
    "E2": "Commodity Link",
    "E3": "Risk Sentiment",
    "F1": "EPS Surprise",
    "F2": "Guidance Revision",
    "F3": "Beta/Volatility",
}

# Category weights (sum to 0.80, normalized internally)
CATEGORY_WEIGHTS = {
    "micro_web": 0.25,       # A + B
    "macro_climate": 0.20,   # C + D
    "correlations": 0.20,    # E
    "risk_performance": 0.15, # F
}

CATEGORY_FACTOR_MAP = {
    "micro_web": ["A1", "A2", "A3", "B1", "B2", "B3"],
    "macro_climate": ["C1", "C2", "C3", "D1", "D2", "D3"],
    "correlations": ["E1", "E2", "E3"],
    "risk_performance": ["F1", "F2", "F3"],
}

# Sector ETF mapping for correlations
SECTOR_ETF_MAP = {
    "NVDA": "SMH", "AMD": "SMH", "AVGO": "SMH", "INTC": "SMH",
    "AAPL": "XLK", "MSFT": "XLK", "GOOGL": "XLK", "META": "XLK", "CRM": "XLK",
    "AMZN": "XLY", "TSLA": "XLY", "NFLX": "XLY",
    "JPM": "XLF", "V": "XLF",
    "UNH": "XLV",
    "XOM": "XLE",
}

# Peer mapping for correlation analysis
PEER_MAP = {
    "NVDA": ["AMD", "AVGO", "INTC"],
    "AAPL": ["MSFT", "GOOGL", "SAMSUNG.KS"],
    "MSFT": ["AAPL", "GOOGL", "CRM"],
    "AMD": ["NVDA", "INTC", "AVGO"],
    "GOOGL": ["META", "MSFT", "AMZN"],
    "AMZN": ["GOOGL", "MSFT", "WMT"],
    "META": ["GOOGL", "SNAP", "PINS"],
    "TSLA": ["F", "GM", "RIVN"],
    "AVGO": ["NVDA", "QCOM", "TXN"],
    "CRM": ["MSFT", "NOW", "ORCL"],
    "NFLX": ["DIS", "WBD", "PARA"],
    "JPM": ["BAC", "GS", "MS"],
    "V": ["MA", "PYPL", "SQ"],
    "UNH": ["HUM", "CI", "ELV"],
    "XOM": ["CVX", "COP", "SLB"],
}

# Company names for the 15-stock universe
COMPANY_NAMES = {
    "NVDA": "NVIDIA Corporation",
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft Corporation",
    "AMD": "Advanced Micro Devices",
    "GOOGL": "Alphabet Inc.",
    "AMZN": "Amazon.com Inc.",
    "META": "Meta Platforms Inc.",
    "TSLA": "Tesla Inc.",
    "AVGO": "Broadcom Inc.",
    "CRM": "Salesforce Inc.",
    "NFLX": "Netflix Inc.",
    "JPM": "JPMorgan Chase & Co.",
    "V": "Visa Inc.",
    "UNH": "UnitedHealth Group Inc.",
    "XOM": "Exxon Mobil Corporation",
}

STOCK_UNIVERSE = list(COMPANY_NAMES.keys())


# ─── Factor Models ───

class FactorDetail(BaseModel):
    score: float = Field(ge=-2.0, le=2.0)
    reason: str


class FactorScore(BaseModel):
    name: str
    score: float = Field(ge=-2.0, le=2.0)


class Alternative(BaseModel):
    ticker: str
    company_name: str
    score: float
    signal: Signal
    reason: str
    alt_type: str  # "same_sector_peer" or "inverse_hedge"


# ─── Signal Results ───

class SignalResult(BaseModel):
    ticker: str
    company_name: str
    composite_score: float = Field(ge=1.0, le=10.0)
    signal: Signal
    confidence: Confidence = Confidence.MEDIUM
    insight: str
    reasoning: str = ""
    factors: list[FactorScore] = []
    factor_details: dict[str, FactorDetail] = {}
    alternatives: list[Alternative] = []
    analyzed_at: datetime
    updated_at: Optional[datetime] = None


class FeedItem(BaseModel):
    id: str
    ticker: str
    company_name: str
    composite_score: float
    signal: Signal
    insight: str
    top_factors: list[FactorScore]
    updated_at: datetime


# ─── Portfolio Models ───

class Holding(BaseModel):
    id: str
    ticker: str
    company_name: str
    shares: float
    avg_cost: float
    current_price: Optional[float] = None
    weight: Optional[float] = None


class Portfolio(BaseModel):
    id: str
    user_id: str
    name: str
    holdings: list[Holding]
    total_value: float = 0.0
    created_at: datetime
    updated_at: datetime


# ─── Strategy Models ───

class OptimizationResult(BaseModel):
    weights: dict[str, float]
    expected_return: float
    expected_volatility: float
    sharpe_ratio: float


class MonteCarloPoint(BaseModel):
    expected_return: float
    volatility: float
    sharpe_ratio: float
    weights: dict[str, float]


class StrategyResult(BaseModel):
    optimized: OptimizationResult
    efficient_frontier: list[MonteCarloPoint]
    current_portfolio_metrics: OptimizationResult


# ─── Scoring Utilities ───

def compute_composite_score(factor_scores: dict[str, float]) -> float:
    """Compute the weighted composite score from 18 factor scores.

    Args:
        factor_scores: Dict mapping factor IDs (A1-F3) to scores (-2 to +2).

    Returns:
        Composite score mapped to 1-10 scale.
    """
    total_weight = sum(CATEGORY_WEIGHTS.values())
    weighted_sum = 0.0

    for category, weight in CATEGORY_WEIGHTS.items():
        factor_ids = CATEGORY_FACTOR_MAP[category]
        scores = [factor_scores.get(fid, 0.0) for fid in factor_ids]
        if scores:
            category_avg = sum(scores) / len(scores)
        else:
            category_avg = 0.0
        weighted_sum += weight * category_avg

    # Normalize to [-2, +2] range
    normalized = weighted_sum / total_weight

    # Map from [-2, +2] to [1, 10]
    score_10 = ((normalized + 2) / 4) * 9 + 1
    return round(max(1.0, min(10.0, score_10)), 1)


def determine_signal(score: float) -> Signal:
    """Determine BUY/HOLD/SELL signal from composite score."""
    if score <= 3.0:
        return Signal.SELL
    elif score <= 6.0:
        return Signal.HOLD
    else:
        return Signal.BUY


def determine_confidence(factor_scores: dict[str, float]) -> Confidence:
    """Determine confidence level based on data coverage.

    LOW: <50% of factors have non-zero scores
    MEDIUM: 50-80% have data
    HIGH: >80% have data
    """
    total = len(FACTOR_IDS)
    with_data = sum(1 for fid in FACTOR_IDS if factor_scores.get(fid, 0.0) != 0.0)
    ratio = with_data / total

    if ratio < 0.5:
        return Confidence.LOW
    elif ratio <= 0.8:
        return Confidence.MEDIUM
    else:
        return Confidence.HIGH

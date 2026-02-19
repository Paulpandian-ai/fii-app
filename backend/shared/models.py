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
    "NVDA": "SMH", "AMD": "SMH", "AVGO": "SMH", "INTC": "SMH", "QCOM": "SMH",
    "TXN": "SMH", "AMAT": "SMH", "MU": "SMH", "SNPS": "SMH",
    "AAPL": "XLK", "MSFT": "XLK", "CRM": "XLK", "ADBE": "XLK", "CSCO": "XLK",
    "ACN": "XLK", "ORCL": "XLK", "IBM": "XLK", "INTU": "XLK", "NOW": "XLK",
    "PANW": "XLK",
    "GOOGL": "XLC", "META": "XLC", "NFLX": "XLC", "DIS": "XLC", "CMCSA": "XLC",
    "TMUS": "XLC", "VZ": "XLC", "T": "XLC", "EA": "XLC",
    "AMZN": "XLY", "TSLA": "XLY", "HD": "XLY", "MCD": "XLY", "NKE": "XLY",
    "LOW": "XLY", "SBUX": "XLY", "TJX": "XLY", "BKNG": "XLY", "ABNB": "XLY",
    "JPM": "XLF", "V": "XLF", "MA": "XLF", "BAC": "XLF", "WFC": "XLF",
    "GS": "XLF", "MS": "XLF", "BLK": "XLF", "SCHW": "XLF", "AXP": "XLF",
    "PYPL": "XLF", "SQ": "XLF",
    "UNH": "XLV", "JNJ": "XLV", "LLY": "XLV", "ABBV": "XLV", "PFE": "XLV",
    "MRK": "XLV", "TMO": "XLV", "ABT": "XLV", "DHR": "XLV", "BMY": "XLV",
    "AMGN": "XLV", "GILD": "XLV", "ISRG": "XLV",
    "XOM": "XLE", "CVX": "XLE", "COP": "XLE", "SLB": "XLE", "EOG": "XLE",
    "MPC": "XLE", "PSX": "XLE",
    "CAT": "XLI", "GE": "XLI", "HON": "XLI", "UPS": "XLI", "RTX": "XLI",
    "BA": "XLI", "LMT": "XLI", "DE": "XLI", "UNP": "XLI", "GD": "XLI", "NOC": "XLI",
    "PG": "XLP", "KO": "XLP", "PEP": "XLP", "COST": "XLP", "WMT": "XLP",
    "PM": "XLP", "CL": "XLP", "MDLZ": "XLP",
    "NEE": "XLU", "DUK": "XLU", "SO": "XLU", "AEP": "XLU",
    "PLD": "XLRE", "AMT": "XLRE", "CCI": "XLRE", "EQIX": "XLRE",
    "LIN": "XLB", "APD": "XLB", "SHW": "XLB", "FCX": "XLB", "NEM": "XLB",
}

# Peer mapping for correlation analysis
PEER_MAP = {
    "NVDA": ["AMD", "AVGO", "INTC"],
    "AAPL": ["MSFT", "GOOGL", "AVGO"],
    "MSFT": ["AAPL", "GOOGL", "CRM"],
    "AMD": ["NVDA", "INTC", "AVGO"],
    "GOOGL": ["META", "MSFT", "AMZN"],
    "AMZN": ["GOOGL", "MSFT", "WMT"],
    "META": ["GOOGL", "NFLX", "DIS"],
    "TSLA": ["NKE", "AMZN", "BKNG"],
    "AVGO": ["NVDA", "QCOM", "TXN"],
    "CRM": ["MSFT", "NOW", "ORCL"],
    "NFLX": ["DIS", "META", "CMCSA"],
    "JPM": ["BAC", "GS", "MS"],
    "V": ["MA", "PYPL", "SQ"],
    "UNH": ["JNJ", "LLY", "ABBV"],
    "XOM": ["CVX", "COP", "SLB"],
    "LLY": ["ABBV", "MRK", "PFE"],
    "JNJ": ["PFE", "MRK", "ABT"],
    "HD": ["LOW", "WMT", "COST"],
    "CAT": ["DE", "HON", "GE"],
    "LMT": ["RTX", "BA", "NOC"],
    "GS": ["MS", "JPM", "BLK"],
    "PG": ["KO", "PEP", "CL"],
    "NEE": ["DUK", "SO", "AEP"],
    "LIN": ["APD", "SHW", "FCX"],
}

# Company names for the 100+ stock universe (S&P 500 top by market cap, all 11 GICS sectors)
COMPANY_NAMES = {
    # ─── Information Technology ───
    "AAPL": "Apple Inc.",
    "MSFT": "Microsoft Corporation",
    "NVDA": "NVIDIA Corporation",
    "AVGO": "Broadcom Inc.",
    "AMD": "Advanced Micro Devices",
    "CRM": "Salesforce Inc.",
    "ADBE": "Adobe Inc.",
    "CSCO": "Cisco Systems Inc.",
    "ACN": "Accenture plc",
    "ORCL": "Oracle Corporation",
    "INTC": "Intel Corporation",
    "IBM": "International Business Machines",
    "INTU": "Intuit Inc.",
    "NOW": "ServiceNow Inc.",
    "TXN": "Texas Instruments Inc.",
    "QCOM": "Qualcomm Inc.",
    "AMAT": "Applied Materials Inc.",
    "MU": "Micron Technology Inc.",
    "PANW": "Palo Alto Networks Inc.",
    "SNPS": "Synopsys Inc.",
    # ─── Communication Services ───
    "GOOGL": "Alphabet Inc.",
    "META": "Meta Platforms Inc.",
    "NFLX": "Netflix Inc.",
    "DIS": "The Walt Disney Company",
    "CMCSA": "Comcast Corporation",
    "TMUS": "T-Mobile US Inc.",
    "VZ": "Verizon Communications Inc.",
    "T": "AT&T Inc.",
    "EA": "Electronic Arts Inc.",
    # ─── Consumer Discretionary ───
    "AMZN": "Amazon.com Inc.",
    "TSLA": "Tesla Inc.",
    "HD": "The Home Depot Inc.",
    "MCD": "McDonald's Corporation",
    "NKE": "NIKE Inc.",
    "LOW": "Lowe's Companies Inc.",
    "SBUX": "Starbucks Corporation",
    "TJX": "The TJX Companies Inc.",
    "BKNG": "Booking Holdings Inc.",
    "ABNB": "Airbnb Inc.",
    # ─── Financials ───
    "JPM": "JPMorgan Chase & Co.",
    "V": "Visa Inc.",
    "MA": "Mastercard Inc.",
    "BAC": "Bank of America Corporation",
    "WFC": "Wells Fargo & Company",
    "GS": "The Goldman Sachs Group",
    "MS": "Morgan Stanley",
    "BLK": "BlackRock Inc.",
    "SCHW": "Charles Schwab Corporation",
    "AXP": "American Express Company",
    "PYPL": "PayPal Holdings Inc.",
    "SQ": "Block Inc.",
    # ─── Healthcare ───
    "UNH": "UnitedHealth Group Inc.",
    "JNJ": "Johnson & Johnson",
    "LLY": "Eli Lilly and Company",
    "ABBV": "AbbVie Inc.",
    "PFE": "Pfizer Inc.",
    "MRK": "Merck & Co. Inc.",
    "TMO": "Thermo Fisher Scientific",
    "ABT": "Abbott Laboratories",
    "DHR": "Danaher Corporation",
    "BMY": "Bristol-Myers Squibb",
    "AMGN": "Amgen Inc.",
    "GILD": "Gilead Sciences Inc.",
    "ISRG": "Intuitive Surgical Inc.",
    # ─── Energy ───
    "XOM": "Exxon Mobil Corporation",
    "CVX": "Chevron Corporation",
    "COP": "ConocoPhillips",
    "SLB": "Schlumberger Limited",
    "EOG": "EOG Resources Inc.",
    "MPC": "Marathon Petroleum Corp.",
    "PSX": "Phillips 66",
    # ─── Industrials ───
    "CAT": "Caterpillar Inc.",
    "GE": "GE Aerospace",
    "HON": "Honeywell International",
    "UPS": "United Parcel Service",
    "RTX": "RTX Corporation",
    "BA": "The Boeing Company",
    "LMT": "Lockheed Martin Corporation",
    "DE": "Deere & Company",
    "UNP": "Union Pacific Corporation",
    "GD": "General Dynamics Corporation",
    "NOC": "Northrop Grumman Corporation",
    # ─── Consumer Staples ───
    "PG": "The Procter & Gamble Company",
    "KO": "The Coca-Cola Company",
    "PEP": "PepsiCo Inc.",
    "COST": "Costco Wholesale Corporation",
    "WMT": "Walmart Inc.",
    "PM": "Philip Morris International",
    "CL": "Colgate-Palmolive Company",
    "MDLZ": "Mondelez International",
    # ─── Utilities ───
    "NEE": "NextEra Energy Inc.",
    "DUK": "Duke Energy Corporation",
    "SO": "The Southern Company",
    "AEP": "American Electric Power",
    # ─── Real Estate ───
    "PLD": "Prologis Inc.",
    "AMT": "American Tower Corporation",
    "CCI": "Crown Castle Inc.",
    "EQIX": "Equinix Inc.",
    # ─── Materials ───
    "LIN": "Linde plc",
    "APD": "Air Products and Chemicals",
    "SHW": "The Sherwin-Williams Company",
    "FCX": "Freeport-McMoRan Inc.",
    "NEM": "Newmont Corporation",
}

STOCK_UNIVERSE = list(COMPANY_NAMES.keys())

# Top 50 stocks get full AI signal analysis; remainder get price + technicals only
FULL_ANALYSIS_TICKERS = STOCK_UNIVERSE[:50]
PRICE_ONLY_TICKERS = STOCK_UNIVERSE[50:]

# GICS sector classification for universe stocks
STOCK_SECTORS = {
    "AAPL": "Information Technology", "MSFT": "Information Technology", "NVDA": "Information Technology",
    "AVGO": "Information Technology", "AMD": "Information Technology", "CRM": "Information Technology",
    "ADBE": "Information Technology", "CSCO": "Information Technology", "ACN": "Information Technology",
    "ORCL": "Information Technology", "INTC": "Information Technology", "IBM": "Information Technology",
    "INTU": "Information Technology", "NOW": "Information Technology", "TXN": "Information Technology",
    "QCOM": "Information Technology", "AMAT": "Information Technology", "MU": "Information Technology",
    "PANW": "Information Technology", "SNPS": "Information Technology",
    "GOOGL": "Communication Services", "META": "Communication Services", "NFLX": "Communication Services",
    "DIS": "Communication Services", "CMCSA": "Communication Services", "TMUS": "Communication Services",
    "VZ": "Communication Services", "T": "Communication Services", "EA": "Communication Services",
    "AMZN": "Consumer Discretionary", "TSLA": "Consumer Discretionary", "HD": "Consumer Discretionary",
    "MCD": "Consumer Discretionary", "NKE": "Consumer Discretionary", "LOW": "Consumer Discretionary",
    "SBUX": "Consumer Discretionary", "TJX": "Consumer Discretionary", "BKNG": "Consumer Discretionary",
    "ABNB": "Consumer Discretionary",
    "JPM": "Financials", "V": "Financials", "MA": "Financials", "BAC": "Financials",
    "WFC": "Financials", "GS": "Financials", "MS": "Financials", "BLK": "Financials",
    "SCHW": "Financials", "AXP": "Financials", "PYPL": "Financials", "SQ": "Financials",
    "UNH": "Health Care", "JNJ": "Health Care", "LLY": "Health Care", "ABBV": "Health Care",
    "PFE": "Health Care", "MRK": "Health Care", "TMO": "Health Care", "ABT": "Health Care",
    "DHR": "Health Care", "BMY": "Health Care", "AMGN": "Health Care", "GILD": "Health Care",
    "ISRG": "Health Care",
    "XOM": "Energy", "CVX": "Energy", "COP": "Energy", "SLB": "Energy",
    "EOG": "Energy", "MPC": "Energy", "PSX": "Energy",
    "CAT": "Industrials", "GE": "Industrials", "HON": "Industrials", "UPS": "Industrials",
    "RTX": "Industrials", "BA": "Industrials", "LMT": "Industrials", "DE": "Industrials",
    "UNP": "Industrials", "GD": "Industrials", "NOC": "Industrials",
    "PG": "Consumer Staples", "KO": "Consumer Staples", "PEP": "Consumer Staples",
    "COST": "Consumer Staples", "WMT": "Consumer Staples", "PM": "Consumer Staples",
    "CL": "Consumer Staples", "MDLZ": "Consumer Staples",
    "NEE": "Utilities", "DUK": "Utilities", "SO": "Utilities", "AEP": "Utilities",
    "PLD": "Real Estate", "AMT": "Real Estate", "CCI": "Real Estate", "EQIX": "Real Estate",
    "LIN": "Materials", "APD": "Materials", "SHW": "Materials", "FCX": "Materials", "NEM": "Materials",
}


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

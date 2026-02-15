"""Pydantic models for FII data validation.

Defines the schema for all data types flowing through the system.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class Signal(str, Enum):
    BUY = "BUY"
    HOLD = "HOLD"
    SELL = "SELL"


class FactorScore(BaseModel):
    name: str
    score: float = Field(ge=-2.0, le=2.0)


class SignalResult(BaseModel):
    ticker: str
    company_name: str
    composite_score: float = Field(ge=1.0, le=10.0)
    signal: Signal
    insight: str
    factors: list[FactorScore]
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

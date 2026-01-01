"""Pydantic models for API validation"""
from pydantic import BaseModel, Field, field_validator
from typing import List, Dict, Optional
from datetime import datetime

class PortfolioHolding(BaseModel):
    ticker: str = Field(..., description="Stock ticker")
    shares: float = Field(..., gt=0, description="Number of shares")
    
    @field_validator('ticker')
    @classmethod
    def validate_ticker(cls, v):
        return v.upper().strip()

class Portfolio(BaseModel):
    id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=100)
    holdings: List[PortfolioHolding]
    created_at: Optional[datetime] = None
    
    @field_validator('holdings')
    @classmethod
    def validate_holdings(cls, v):
        if len(v) == 0:
            raise ValueError("Portfolio must have at least one holding")
        return v

class PortfolioCreate(BaseModel):
    name: str
    holdings: List[PortfolioHolding]

class RiskMetrics(BaseModel):
    portfolio_value: float
    expected_return: float
    volatility: float
    sharpe_ratio: float
    var_95: float
    cvar_95: float
    max_drawdown: float

class CorrelationMatrix(BaseModel):
    tickers: List[str]
    matrix: List[List[float]]

class MonteCarloResult(BaseModel):
    simulations: int
    confidence_level: float
    var: float
    cvar: float
    percentiles: Dict[str, float]
    distribution: List[float]

class EfficientFrontierPoint(BaseModel):
    expected_return: float = Field(..., alias="return")
    risk: float
    sharpe: float
    weights: Dict[str, float]
    
    class Config:
        populate_by_name = True

class EfficientFrontier(BaseModel):
    points: List[EfficientFrontierPoint]
    max_sharpe: EfficientFrontierPoint
    min_volatility: EfficientFrontierPoint

class StressTestScenario(BaseModel):
    name: str
    description: str
    market_shock: float
    result: float

class StressTestResult(BaseModel):
    current_value: float
    scenarios: List[StressTestScenario]

class AnalysisRequest(BaseModel):
    holdings: List[PortfolioHolding]
    lookback_days: int = Field(default=252, ge=30, le=1260)
    risk_free_rate: float = Field(default=0.04, ge=0, le=0.20)

class OptimizationRequest(BaseModel):
    holdings: List[PortfolioHolding]
    target_return: Optional[float] = None
    target_risk: Optional[float] = None
    lookback_days: int = Field(default=252, ge=30, le=1260)
    risk_free_rate: float = Field(default=0.04, ge=0, le=0.20)
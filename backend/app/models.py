"""Enhanced Pydantic models for API validation"""
from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import List, Dict, Optional
from datetime import datetime


class PortfolioHolding(BaseModel):
    """Single portfolio holding"""
    ticker: str = Field(..., description="Stock ticker symbol", min_length=1, max_length=12)
    shares: float = Field(..., gt=0, description="Number of shares (must be positive)")

    @field_validator('ticker')
    @classmethod
    def validate_ticker(cls, v: str) -> str:
        """Validate and normalize ticker format"""
        ticker = v.upper().strip()
        
        # Basic validation - allow common ticker patterns
        if not ticker:
            raise ValueError("Ticker cannot be empty")
        
        # Allow alphanumeric, dots, hyphens, and caret for indices
        valid_chars = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-^")
        if not all(c in valid_chars for c in ticker):
            raise ValueError(
                f"Invalid ticker format: {v}. "
                "Use only letters, numbers, dots, hyphens, or caret (for indices)"
            )
        
        return ticker


class Portfolio(BaseModel):
    """Portfolio with holdings"""
    id: Optional[int] = None
    name: str = Field(..., min_length=1, max_length=100, description="Portfolio name")
    holdings: List[PortfolioHolding] = Field(..., min_length=1, description="List of holdings")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @field_validator('holdings')
    @classmethod
    def validate_holdings(cls, v: List[PortfolioHolding]) -> List[PortfolioHolding]:
        """Validate holdings list"""
        if len(v) == 0:
            raise ValueError("Portfolio must have at least one holding")
        
        # Check for duplicate tickers
        tickers = [h.ticker for h in v]
        if len(tickers) != len(set(tickers)):
            raise ValueError("Duplicate tickers are not allowed")
        
        return v


class PortfolioCreate(BaseModel):
    """Schema for creating a portfolio"""
    name: str = Field(..., min_length=1, max_length=100)
    holdings: List[PortfolioHolding] = Field(..., min_length=1)


class RiskMetrics(BaseModel):
    """Comprehensive risk metrics for a portfolio"""
    portfolio_value: float = Field(..., description="Total portfolio value in USD")
    expected_return: float = Field(..., description="Annualized expected return (%)")
    volatility: float = Field(..., description="Annualized volatility (%)")
    sharpe_ratio: float = Field(..., description="Sharpe ratio (risk-adjusted return)")
    var_95: float = Field(..., description="95% Value at Risk (1-day, absolute USD)")
    cvar_95: float = Field(..., description="95% Conditional VaR (absolute USD)")
    max_drawdown: float = Field(..., description="Maximum drawdown (%)")


class CorrelationMatrix(BaseModel):
    """Correlation matrix for portfolio holdings"""
    tickers: List[str] = Field(..., description="List of ticker symbols")
    matrix: List[List[float]] = Field(..., description="Correlation matrix (NxN)")

    @field_validator('matrix')
    @classmethod
    def validate_matrix(cls, v: List[List[float]], info) -> List[List[float]]:
        """Validate matrix dimensions"""
        if not v:
            return v
        
        # Check if matrix is square
        n = len(v)
        for row in v:
            if len(row) != n:
                raise ValueError("Correlation matrix must be square (NxN)")
        
        return v


class MonteCarloResult(BaseModel):
    """Monte Carlo simulation results"""
    simulations: int = Field(..., description="Number of simulations run")
    confidence_level: float = Field(..., description="Confidence level (e.g., 0.95)")
    var: float = Field(..., description="Value at Risk (absolute USD)")
    cvar: float = Field(..., description="Conditional VaR (absolute USD)")
    percentiles: Dict[str, float] = Field(..., description="Distribution percentiles")
    distribution: List[float] = Field(..., description="Full distribution of returns")


class EfficientFrontierPoint(BaseModel):
    """Single point on the efficient frontier"""
    model_config = ConfigDict(populate_by_name=True)
    
    expected_return: float = Field(..., alias="return", description="Expected return (%)")
    risk: float = Field(..., description="Risk/volatility (%)")
    sharpe: float = Field(..., description="Sharpe ratio")
    weights: Dict[str, float] = Field(..., description="Asset allocation weights")


class EfficientFrontier(BaseModel):
    """Efficient frontier data"""
    points: List[EfficientFrontierPoint] = Field(
        ..., description="Points on the efficient frontier"
    )
    max_sharpe: EfficientFrontierPoint = Field(
        ..., description="Maximum Sharpe ratio portfolio"
    )
    min_volatility: EfficientFrontierPoint = Field(
        ..., description="Minimum volatility portfolio"
    )


class StressTestScenario(BaseModel):
    """Single stress test scenario result"""
    name: str = Field(..., description="Scenario name")
    description: str = Field(..., description="Scenario description")
    market_shock: float = Field(..., description="Market shock percentage")
    result: float = Field(..., description="Estimated loss (absolute USD)")


class StressTestResult(BaseModel):
    """Stress test results for multiple scenarios"""
    current_value: float = Field(..., description="Current portfolio value (USD)")
    scenarios: List[StressTestScenario] = Field(..., description="List of stress scenarios")


class AnalysisRequest(BaseModel):
    """Request for portfolio analysis"""
    holdings: List[PortfolioHolding] = Field(..., min_length=1, description="Portfolio holdings")
    lookback_days: int = Field(
        default=252,
        ge=30,
        le=1260,
        description="Lookback period in trading days (30-1260)"
    )
    risk_free_rate: float = Field(
        default=0.04,
        ge=0,
        le=0.20,
        description="Risk-free rate for Sharpe calculation (0-0.20)"
    )

    @field_validator('holdings')
    @classmethod
    def validate_holdings(cls, v: List[PortfolioHolding]) -> List[PortfolioHolding]:
        """Validate holdings"""
        if len(v) == 0:
            raise ValueError("At least one holding is required")
        
        if len(v) > 100:
            raise ValueError("Maximum 100 holdings allowed")
        
        return v


class OptimizationRequest(BaseModel):
    """Request for portfolio optimization"""
    holdings: List[PortfolioHolding] = Field(..., min_length=2, description="Portfolio holdings")
    target_return: Optional[float] = Field(None, description="Target return for optimization")
    target_risk: Optional[float] = Field(None, description="Target risk for optimization")
    lookback_days: int = Field(
        default=252,
        ge=30,
        le=1260,
        description="Lookback period in trading days"
    )
    risk_free_rate: float = Field(
        default=0.04,
        ge=0,
        le=0.20,
        description="Risk-free rate"
    )

    @field_validator('holdings')
    @classmethod
    def validate_holdings(cls, v: List[PortfolioHolding]) -> List[PortfolioHolding]:
        """Validate holdings for optimization"""
        if len(v) < 2:
            raise ValueError("At least 2 holdings required for optimization")
        
        if len(v) > 50:
            raise ValueError("Maximum 50 holdings allowed for optimization")
        
        return v


class ErrorResponse(BaseModel):
    """Standard error response"""
    detail: str = Field(..., description="Error message")
    code: Optional[str] = Field(None, description="Error code")
    timestamp: datetime = Field(default_factory=datetime.now, description="Error timestamp")


class SuccessResponse(BaseModel):
    """Standard success response"""
    message: str = Field(..., description="Success message")
    data: Optional[Dict] = Field(None, description="Response data")
    timestamp: datetime = Field(default_factory=datetime.now, description="Response timestamp")
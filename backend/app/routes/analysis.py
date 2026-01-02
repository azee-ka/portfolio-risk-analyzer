"""Enhanced Analysis API routes with comprehensive metrics"""
from fastapi import APIRouter, HTTPException
import numpy as np
import logging

from app.models import (
    AnalysisRequest,
    RiskMetrics,
    MonteCarloResult,
    CorrelationMatrix,
    StressTestResult,
    StressTestScenario,
)
from app.core.market_data import market_data
from app.core.monte_carlo import MonteCarloSimulator, DEFAULT_STRESS_SCENARIOS
from app.core.optimization import PortfolioOptimizer

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/var", response_model=MonteCarloResult)
async def calculate_var(request: AnalysisRequest):
    """Calculate Value at Risk using Monte Carlo simulation"""
    try:
        logger.info(f"Calculating VaR for {len(request.holdings)} holdings")
        
        tickers = [h.ticker for h in request.holdings]
        shares = np.array([h.shares for h in request.holdings])

        # Fetch data
        returns = await market_data.calculate_returns(tickers, request.lookback_days)
        prices = await market_data.get_current_prices(tickers)

        # Calculate portfolio metrics
        values = np.array([prices[t] * s for t, s in zip(tickers, shares)])
        portfolio_value = values.sum()
        weights = values / portfolio_value

        # Run Monte Carlo simulation
        simulator = MonteCarloSimulator(n_simulations=10000)
        result = simulator.calculate_var(
            returns=returns,
            weights=weights,
            portfolio_value=portfolio_value,
            confidence_level=0.95,
        )

        logger.info(f"VaR calculation complete: ${result['var_absolute']:,.0f}")

        return MonteCarloResult(
            simulations=result["simulations"],
            confidence_level=result["confidence_level"],
            var=result["var_absolute"],
            cvar=result["cvar_absolute"],
            percentiles=result["percentiles"],
            distribution=result["distribution"],
        )
        
    except Exception as e:
        logger.error(f"VaR calculation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/correlation", response_model=CorrelationMatrix)
async def calculate_correlation(request: AnalysisRequest):
    """Calculate correlation matrix for portfolio holdings"""
    try:
        logger.info(f"Calculating correlation for {len(request.holdings)} holdings")
        
        tickers = [h.ticker for h in request.holdings]
        returns = await market_data.calculate_returns(tickers, request.lookback_days)

        optimizer = PortfolioOptimizer()
        corr_matrix, ticker_list = optimizer.calculate_correlation_matrix(returns)

        logger.info("Correlation matrix calculated successfully")

        return CorrelationMatrix(tickers=ticker_list, matrix=corr_matrix.tolist())
        
    except Exception as e:
        logger.error(f"Correlation calculation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/risk-metrics", response_model=RiskMetrics)
async def calculate_risk_metrics(request: AnalysisRequest):
    """Calculate comprehensive risk metrics for portfolio"""
    try:
        logger.info(f"Calculating risk metrics for {len(request.holdings)} holdings")
        
        tickers = [h.ticker for h in request.holdings]
        shares = np.array([h.shares for h in request.holdings])

        # Fetch data
        returns = await market_data.calculate_returns(tickers, request.lookback_days)
        prices = await market_data.get_current_prices(tickers)

        # Portfolio calculations
        values = np.array([prices[t] * s for t, s in zip(tickers, shares)])
        portfolio_value = values.sum()
        weights = values / portfolio_value

        # Mean and covariance
        mean_returns = returns.mean().values
        cov_matrix = returns.cov().values

        # Portfolio metrics
        optimizer = PortfolioOptimizer(risk_free_rate=request.risk_free_rate)
        port_return, port_risk, sharpe = optimizer.calculate_portfolio_metrics(
            weights, mean_returns, cov_matrix
        )

        # VaR and CVaR
        simulator = MonteCarloSimulator()
        var_result = simulator.calculate_var(
            returns, weights, portfolio_value, confidence_level=0.95
        )
        
        # Max Drawdown
        max_dd = simulator.calculate_max_drawdown(returns, weights)

        logger.info(
            f"Risk metrics complete - Value: ${portfolio_value:,.0f}, "
            f"Sharpe: {sharpe:.3f}, VaR: ${var_result['var_absolute']:,.0f}"
        )

        return RiskMetrics(
            portfolio_value=portfolio_value,
            expected_return=port_return * 100,  # Convert to percentage
            volatility=port_risk * 100,  # Convert to percentage
            sharpe_ratio=sharpe,
            var_95=var_result["var_absolute"],
            cvar_95=var_result["cvar_absolute"],
            max_drawdown=max_dd,
        )
        
    except Exception as e:
        logger.error(f"Risk metrics calculation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stress-test", response_model=StressTestResult)
async def stress_test(request: AnalysisRequest):
    """Run stress test scenarios on portfolio"""
    try:
        logger.info(f"Running stress test for {len(request.holdings)} holdings")
        
        tickers = [h.ticker for h in request.holdings]
        shares = np.array([h.shares for h in request.holdings])

        # Get current portfolio value
        prices = await market_data.get_current_prices(tickers)
        values = np.array([prices[t] * s for t, s in zip(tickers, shares)])
        portfolio_value = values.sum()

        # Run stress test
        simulator = MonteCarloSimulator()
        result = simulator.stress_test(
            portfolio_value=portfolio_value, scenarios=DEFAULT_STRESS_SCENARIOS
        )

        # Format scenarios
        scenarios = [
            StressTestScenario(
                name=s["name"],
                description=f"Market shock: {s['market_shock']:.1f}%",
                market_shock=s["market_shock"],
                result=s["loss"],
            )
            for s in result["scenarios"]
        ]

        logger.info(f"Stress test complete with {len(scenarios)} scenarios")

        return StressTestResult(
            current_value=result["current_value"], scenarios=scenarios
        )
        
    except Exception as e:
        logger.error(f"Stress test failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """Health check endpoint for analysis service"""
    return {
        "status": "healthy",
        "service": "analysis",
        "endpoints": [
            "/var",
            "/correlation",
            "/risk-metrics",
            "/stress-test",
        ],
    }
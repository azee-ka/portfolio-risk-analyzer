"""Analysis API routes"""
from fastapi import APIRouter, HTTPException
import numpy as np

from app.models import (
    AnalysisRequest, RiskMetrics, MonteCarloResult,
    CorrelationMatrix, StressTestResult, StressTestScenario
)
from app.core.market_data import market_data
from app.core.monte_carlo import MonteCarloSimulator, DEFAULT_STRESS_SCENARIOS
from app.core.optimization import PortfolioOptimizer

router = APIRouter()

@router.post("/var", response_model=MonteCarloResult)
async def calculate_var(request: AnalysisRequest):
    try:
        tickers = [h.ticker for h in request.holdings]
        shares = np.array([h.shares for h in request.holdings])
        
        returns = await market_data.calculate_returns(tickers, request.lookback_days)
        prices = await market_data.get_current_prices(tickers)
        
        values = np.array([prices[t] * s for t, s in zip(tickers, shares)])
        portfolio_value = values.sum()
        weights = values / portfolio_value
        
        simulator = MonteCarloSimulator(n_simulations=10000)
        result = simulator.calculate_var(returns=returns, weights=weights, portfolio_value=portfolio_value, confidence_level=0.95)
        
        return MonteCarloResult(
            simulations=result['simulations'],
            confidence_level=result['confidence_level'],
            var=result['var_absolute'],
            cvar=result['cvar_absolute'],
            percentiles=result['percentiles'],
            distribution=result['distribution']
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/correlation", response_model=CorrelationMatrix)
async def calculate_correlation(request: AnalysisRequest):
    try:
        tickers = [h.ticker for h in request.holdings]
        returns = await market_data.calculate_returns(tickers, request.lookback_days)
        
        optimizer = PortfolioOptimizer()
        corr_matrix, ticker_list = optimizer.calculate_correlation_matrix(returns)
        
        return CorrelationMatrix(tickers=ticker_list, matrix=corr_matrix.tolist())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/risk-metrics", response_model=RiskMetrics)
async def calculate_risk_metrics(request: AnalysisRequest):
    try:
        tickers = [h.ticker for h in request.holdings]
        shares = np.array([h.shares for h in request.holdings])
        
        returns = await market_data.calculate_returns(tickers, request.lookback_days)
        prices = await market_data.get_current_prices(tickers)
        
        values = np.array([prices[t] * s for t, s in zip(tickers, shares)])
        portfolio_value = values.sum()
        weights = values / portfolio_value
        
        mean_returns = returns.mean().values
        cov_matrix = returns.cov().values
        
        optimizer = PortfolioOptimizer(risk_free_rate=request.risk_free_rate)
        port_return, port_risk, sharpe = optimizer.calculate_portfolio_metrics(weights, mean_returns, cov_matrix)
        
        simulator = MonteCarloSimulator()
        var_result = simulator.calculate_var(returns, weights, portfolio_value, confidence_level=0.95)
        max_dd = simulator.calculate_max_drawdown(returns, weights)
        
        return RiskMetrics(
            portfolio_value=portfolio_value,
            expected_return=port_return * 100,
            volatility=port_risk * 100,
            sharpe_ratio=sharpe,
            var_95=var_result['var_absolute'],
            cvar_95=var_result['cvar_absolute'],
            max_drawdown=max_dd
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stress-test", response_model=StressTestResult)
async def stress_test(request: AnalysisRequest):
    try:
        tickers = [h.ticker for h in request.holdings]
        shares = np.array([h.shares for h in request.holdings])
        
        prices = await market_data.get_current_prices(tickers)
        values = np.array([prices[t] * s for t, s in zip(tickers, shares)])
        portfolio_value = values.sum()
        
        simulator = MonteCarloSimulator()
        result = simulator.stress_test(portfolio_value=portfolio_value, scenarios=DEFAULT_STRESS_SCENARIOS)
        
        scenarios = [
            StressTestScenario(
                name=s['name'],
                description=f"Market shock: {s['market_shock']:.1f}%",
                market_shock=s['market_shock'],
                result=s['loss']
            )
            for s in result['scenarios']
        ]
        
        return StressTestResult(current_value=result['current_value'], scenarios=scenarios)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
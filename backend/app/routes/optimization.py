"""Optimization API routes"""
from fastapi import APIRouter, HTTPException
import numpy as np

from app.models import OptimizationRequest, EfficientFrontier, EfficientFrontierPoint
from app.core.market_data import market_data
from app.core.optimization import PortfolioOptimizer

router = APIRouter()

@router.post("/efficient-frontier", response_model=EfficientFrontier)
async def generate_efficient_frontier(request: OptimizationRequest):
    try:
        tickers = [h.ticker for h in request.holdings]
        returns = await market_data.calculate_returns(tickers, request.lookback_days)
        
        mean_returns = returns.mean().values
        cov_matrix = returns.cov().values
        
        optimizer = PortfolioOptimizer(risk_free_rate=request.risk_free_rate)
        
        frontier = optimizer.generate_efficient_frontier(mean_returns, cov_matrix, n_points=100)
        
        points = [
            EfficientFrontierPoint(
                expected_return=p['return'] * 100,
                risk=p['risk'] * 100,
                sharpe=p['sharpe'],
                weights={t: w for t, w in zip(tickers, p['weights'])}
            )
            for p in frontier
        ]
        
        max_sharpe = optimizer.optimize_sharpe(mean_returns, cov_matrix)
        max_sharpe_point = EfficientFrontierPoint(
            expected_return=max_sharpe['return'] * 100,
            risk=max_sharpe['risk'] * 100,
            sharpe=max_sharpe['sharpe'],
            weights={t: w for t, w in zip(tickers, max_sharpe['weights'])}
        )
        
        min_vol = optimizer.optimize_min_volatility(mean_returns, cov_matrix)
        min_vol_point = EfficientFrontierPoint(
            expected_return=min_vol['return'] * 100,
            risk=min_vol['risk'] * 100,
            sharpe=min_vol['sharpe'],
            weights={t: w for t, w in zip(tickers, min_vol['weights'])}
        )
        
        return EfficientFrontier(
            points=points,
            max_sharpe=max_sharpe_point,
            min_volatility=min_vol_point
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/optimize-sharpe")
async def optimize_for_sharpe(request: OptimizationRequest):
    try:
        tickers = [h.ticker for h in request.holdings]
        returns = await market_data.calculate_returns(tickers, request.lookback_days)
        
        mean_returns = returns.mean().values
        cov_matrix = returns.cov().values
        
        optimizer = PortfolioOptimizer(risk_free_rate=request.risk_free_rate)
        result = optimizer.optimize_sharpe(mean_returns, cov_matrix)
        
        return {
            'weights': {t: w for t, w in zip(tickers, result['weights'])},
            'expected_return': result['return'] * 100,
            'risk': result['risk'] * 100,
            'sharpe_ratio': result['sharpe']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
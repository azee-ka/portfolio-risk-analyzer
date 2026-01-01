"""Portfolio optimization - Markowitz efficient frontier"""
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from typing import Dict, List, Tuple, Optional

class PortfolioOptimizer:
    def __init__(self, risk_free_rate: float = 0.04):
        self.risk_free_rate = risk_free_rate
    
    def calculate_portfolio_metrics(
        self, weights: np.ndarray, mean_returns: np.ndarray, cov_matrix: np.ndarray
    ) -> Tuple[float, float, float]:
        portfolio_return = np.sum(mean_returns * weights) * 252
        portfolio_variance = np.dot(weights.T, np.dot(cov_matrix * 252, weights))
        portfolio_risk = np.sqrt(portfolio_variance)
        sharpe_ratio = (portfolio_return - self.risk_free_rate) / portfolio_risk
        return portfolio_return, portfolio_risk, sharpe_ratio
    
    def optimize_sharpe(self, mean_returns: np.ndarray, cov_matrix: np.ndarray) -> Dict:
        n_assets = len(mean_returns)
        
        def negative_sharpe(weights):
            _, _, sharpe = self.calculate_portfolio_metrics(weights, mean_returns, cov_matrix)
            return -sharpe
        
        constraints = [{'type': 'eq', 'fun': lambda w: np.sum(w) - 1}]
        bounds = tuple((0, 1) for _ in range(n_assets))
        init_weights = np.array([1/n_assets] * n_assets)
        
        result = minimize(negative_sharpe, init_weights, method='SLSQP', bounds=bounds, constraints=constraints)
        
        if not result.success:
            raise ValueError(f"Optimization failed: {result.message}")
        
        optimal_weights = result.x
        ret, risk, sharpe = self.calculate_portfolio_metrics(optimal_weights, mean_returns, cov_matrix)
        
        return {'weights': optimal_weights, 'return': ret, 'risk': risk, 'sharpe': sharpe}
    
    def optimize_min_volatility(
        self, mean_returns: np.ndarray, cov_matrix: np.ndarray, target_return: Optional[float] = None
    ) -> Dict:
        n_assets = len(mean_returns)
        
        def portfolio_variance(weights):
            return np.dot(weights.T, np.dot(cov_matrix * 252, weights))
        
        constraints = [{'type': 'eq', 'fun': lambda w: np.sum(w) - 1}]
        
        if target_return is not None:
            constraints.append({
                'type': 'eq',
                'fun': lambda w: np.sum(mean_returns * w) * 252 - target_return
            })
        
        bounds = tuple((0, 1) for _ in range(n_assets))
        init_weights = np.array([1/n_assets] * n_assets)
        
        result = minimize(portfolio_variance, init_weights, method='SLSQP', bounds=bounds, constraints=constraints)
        
        if not result.success:
            raise ValueError(f"Optimization failed: {result.message}")
        
        optimal_weights = result.x
        ret, risk, sharpe = self.calculate_portfolio_metrics(optimal_weights, mean_returns, cov_matrix)
        
        return {'weights': optimal_weights, 'return': ret, 'risk': risk, 'sharpe': sharpe}
    
    def generate_efficient_frontier(
        self, mean_returns: np.ndarray, cov_matrix: np.ndarray, n_points: int = 100
    ) -> List[Dict]:
        min_vol = self.optimize_min_volatility(mean_returns, cov_matrix)
        max_sharpe = self.optimize_sharpe(mean_returns, cov_matrix)
        
        min_return = min_vol['return']
        max_return = max_sharpe['return'] * 1.2
        
        target_returns = np.linspace(min_return, max_return, n_points)
        
        frontier = []
        for target in target_returns:
            try:
                result = self.optimize_min_volatility(mean_returns, cov_matrix, target_return=target)
                frontier.append(result)
            except:
                continue
        
        return frontier
    
    def calculate_correlation_matrix(self, returns: pd.DataFrame) -> Tuple[np.ndarray, List[str]]:
        corr_matrix = returns.corr().values
        tickers = returns.columns.tolist()
        return corr_matrix, tickers
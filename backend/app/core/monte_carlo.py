"""Monte Carlo simulation for Value at Risk"""
import numpy as np
import pandas as pd
from typing import Dict

class MonteCarloSimulator:
    def __init__(self, n_simulations: int = 10000):
        self.n_simulations = n_simulations
    
    def calculate_var(
        self,
        returns: pd.DataFrame,
        weights: np.ndarray,
        portfolio_value: float,
        time_horizon: int = 1,
        confidence_level: float = 0.95
    ) -> Dict:
        mean_returns = returns.mean().values
        cov_matrix = returns.cov().values
        
        portfolio_returns = self._simulate_returns(
            mean_returns, cov_matrix, weights, time_horizon
        )
        
        portfolio_values = portfolio_value * (1 + portfolio_returns)
        
        var_threshold = np.percentile(portfolio_values, (1 - confidence_level) * 100)
        var_absolute = portfolio_value - var_threshold
        
        worst_cases = portfolio_values[portfolio_values <= var_threshold]
        cvar_absolute = portfolio_value - worst_cases.mean()
        
        percentiles = {
            '1%': np.percentile(portfolio_returns, 1) * 100,
            '5%': np.percentile(portfolio_returns, 5) * 100,
            '10%': np.percentile(portfolio_returns, 10) * 100,
            '25%': np.percentile(portfolio_returns, 25) * 100,
            '50%': np.percentile(portfolio_returns, 50) * 100,
            '75%': np.percentile(portfolio_returns, 75) * 100,
            '90%': np.percentile(portfolio_returns, 90) * 100,
            '95%': np.percentile(portfolio_returns, 95) * 100,
            '99%': np.percentile(portfolio_returns, 99) * 100,
        }
        
        return {
            'simulations': self.n_simulations,
            'confidence_level': confidence_level,
            'var_absolute': var_absolute,
            'cvar_absolute': cvar_absolute,
            'percentiles': percentiles,
            'distribution': portfolio_returns.tolist()
        }
    
    def _simulate_returns(
        self,
        mean_returns: np.ndarray,
        cov_matrix: np.ndarray,
        weights: np.ndarray,
        time_horizon: int
    ) -> np.ndarray:
        simulated_returns = np.random.multivariate_normal(
            mean_returns * time_horizon,
            cov_matrix * time_horizon,
            size=self.n_simulations
        )
        portfolio_returns = simulated_returns @ weights
        return portfolio_returns
    
    def stress_test(self, portfolio_value: float, scenarios: Dict[str, float]) -> Dict:
        results = []
        for name, shock in scenarios.items():
            shocked_value = portfolio_value * (1 + shock)
            loss = portfolio_value - shocked_value
            results.append({
                'name': name,
                'market_shock': shock * 100,
                'portfolio_value': shocked_value,
                'loss': loss
            })
        return {'current_value': portfolio_value, 'scenarios': results}
    
    def calculate_max_drawdown(self, returns: pd.DataFrame, weights: np.ndarray) -> float:
        portfolio_returns = (returns * weights).sum(axis=1)
        cumulative = (1 + portfolio_returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = (cumulative - running_max) / running_max
        return abs(drawdown.min()) * 100

DEFAULT_STRESS_SCENARIOS = {
    '2008 Financial Crisis': -0.37,
    'COVID-19 Crash (2020)': -0.34,
    'Dot-com Bubble (2000-2002)': -0.49,
    'Black Monday (1987)': -0.20,
    'Moderate Correction': -0.10,
    'Severe Bear Market': -0.30,
}
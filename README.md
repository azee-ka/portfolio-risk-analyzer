# Portfolio Risk Analyzer

A web application for portfolio risk analysis using Monte Carlo simulation, correlation analysis, and stress testing.

**Live Demo:** https://portfolio-risk-analyzer-azee.vercel.app

## Description

Portfolio Risk Analyzer calculates comprehensive risk metrics for investment portfolios using historical market data. It provides Value at Risk (VaR), Conditional VaR, correlation matrices, and stress test scenarios based on historical market events.

**Educational purposes only.** This tool uses delayed market data and makes simplifying assumptions. Do not rely on it for actual investment decisions.

## Features

- Monte Carlo simulation (10,000 iterations) for VaR and CVaR
- Portfolio correlation matrix with visual heatmap
- Historical stress testing (2008 Financial Crisis, COVID-19, etc.)
- Expected returns, volatility, and Sharpe ratio
- Maximum drawdown analysis
- Auto-refresh capability
- Import/export portfolio configurations
- Responsive design

## Usage

### Getting Started

1. Visit https://portfolio-risk-analyzer-azee.vercel.app
2. Add holdings (ticker symbol and share quantity)
3. Click "Run Analysis"
4. View results across four tabs:
   - **Overview**: Portfolio value, returns, Sharpe ratio, VaR
   - **Monte Carlo**: Distribution histogram and percentiles
   - **Correlation**: Asset correlation heatmap
   - **Stress Test**: Historical scenario impacts

### Configuration

Click the settings icon to adjust:
- Lookback period (30-1260 trading days)
- Risk-free rate (0-20%)
- Auto-refresh interval (1-60 minutes)

### Import/Export

- **Export**: Save portfolio configuration as JSON
- **Import**: Load previously saved configuration

## Technology Stack

**Frontend:** React 18, TypeScript, Tailwind CSS, Vite  
**Backend:** FastAPI, Pandas, NumPy, SciPy, yfinance  
**Deployment:** Vercel (frontend), Render (backend)

## API Documentation

**Base URL:** https://portfolio-risk-analyzer-j1ah.onrender.com

**Interactive Docs:** https://portfolio-risk-analyzer-j1ah.onrender.com/docs

### Key Endpoints

```
POST /api/analysis/risk-metrics
POST /api/analysis/var
POST /api/analysis/correlation
POST /api/analysis/stress-test
POST /api/optimization/efficient-frontier
POST /api/optimization/optimize-sharpe
```

### Example Request

```bash
curl -X POST https://portfolio-risk-analyzer-j1ah.onrender.com/api/analysis/risk-metrics \
  -H "Content-Type: application/json" \
  -d '{
    "holdings": [
      {"ticker": "AAPL", "shares": 100},
      {"ticker": "GOOGL", "shares": 50}
    ],
    "lookback_days": 252,
    "risk_free_rate": 0.04
  }'
```

## Methodology

### Value at Risk (VaR)

Calculated using Monte Carlo simulation:
1. Compute daily returns from historical prices
2. Calculate mean vector and covariance matrix
3. Generate 10,000 simulated returns (multivariate normal)
4. VaR at 95% = 5th percentile loss
5. CVaR = average loss beyond VaR threshold

### Sharpe Ratio

`(Annualized Return - Risk-Free Rate) / Annualized Volatility`

Higher values indicate better risk-adjusted returns.

### Correlation Matrix

Pairwise correlations between asset returns (-1 to +1).

### Stress Testing

Historical market shock scenarios applied to estimate portfolio losses.

## Limitations

**Data Quality:**
- Delayed market data (15-20 minutes)
- Potential gaps from holidays or provider outages
- Corporate actions may not be reflected

**Model Assumptions:**
- Normal distribution (reality has fat tails)
- Historical correlations persist
- No transaction costs, taxes, or liquidity constraints

**Technical:**
- Maximum 100 holdings per portfolio
- Lookback limited to 5 years (1260 days)
- Rate limits from data providers

## Project Structure

```
portfolio-risk-analyzer/
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
└── backend/
    ├── app/
    │   ├── core/
    │   │   ├── market_data.py
    │   │   ├── monte_carlo.py
    │   │   └── optimization.py
    │   ├── routes/
    │   │   ├── analysis.py
    │   │   ├── optimization.py
    │   │   └── portfolio.py
    │   └── models.py
    ├── main.py
    ├── requirements.txt
    └── runtime.txt
```

## Development

### Local Setup

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

See deployment documentation for production setup.

## License

MIT License

## Acknowledgments

- Yahoo Finance for market data
- Stooq for fallback data
- FastAPI framework
- React and Tailwind CSS
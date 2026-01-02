# Portfolio Risk Analyzer

A web application for portfolio risk analysis using Monte Carlo simulation, correlation analysis, and stress testing.

## Description

Portfolio Risk Analyzer is a full-stack application that calculates comprehensive risk metrics for investment portfolios. It uses historical market data to compute Value at Risk (VaR), Conditional VaR, correlation matrices, and stress test scenarios based on historical market events.

**This tool is for educational purposes only.** It uses delayed market data and makes simplifying assumptions. Do not rely on it for actual investment decisions.

## Features

- Monte Carlo simulation (10,000 iterations) for VaR and CVaR calculation
- Portfolio correlation matrix with visual heatmap
- Historical stress testing scenarios (2008 Financial Crisis, COVID-19, etc.)
- Expected returns, volatility, and Sharpe ratio calculations
- Maximum drawdown analysis
- Portfolio optimization and efficient frontier
- Auto-refresh capability for continuous monitoring
- Import/export portfolio configurations
- Responsive web interface

## Technology Stack

### Frontend
- React 18 with TypeScript
- Tailwind CSS
- Axios for HTTP requests
- Vite for build tooling

### Backend
- FastAPI (Python)
- Pandas and NumPy for data processing
- SciPy for optimization
- yfinance for market data
- Redis for caching (optional)

## Installation

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set environment variables (optional):
```bash
export REDIS_URL="redis://localhost:6379"
export PORT=8000
```

5. Start the server:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at http://localhost:8000

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create a .env file:
```bash
echo "VITE_API_URL=http://localhost:8000" > .env
```

4. Start the development server:
```bash
npm run dev
```

The application will be available at http://localhost:5173

## Usage

### Basic Workflow

1. Add holdings by entering ticker symbols and share quantities
2. Click "Run Analysis" to compute risk metrics
3. View results across four tabs:
   - Overview: Portfolio value, returns, Sharpe ratio, VaR
   - Monte Carlo: Distribution histogram and percentiles
   - Correlation: Asset correlation heatmap
   - Stress Test: Historical scenario impacts

### Configuration

Access settings via the settings icon to adjust:
- Lookback period (30-1260 trading days)
- Risk-free rate (0-20%)
- Auto-refresh interval (1-60 minutes)

### Import/Export

- Export: Click the download icon to save portfolio as JSON
- Import: Click the upload icon and select a previously exported file

## API Documentation

### Base URL
```
http://localhost:8000
```

### Key Endpoints

#### Analysis
```
POST /api/analysis/risk-metrics
POST /api/analysis/var
POST /api/analysis/correlation
POST /api/analysis/stress-test
```

#### Portfolio Management
```
POST /api/portfolio/
GET /api/portfolio/{id}
GET /api/portfolio/
DELETE /api/portfolio/{id}
```

#### Optimization
```
POST /api/optimization/efficient-frontier
POST /api/optimization/optimize-sharpe
```

### Example Request

```bash
curl -X POST http://localhost:8000/api/analysis/risk-metrics \
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

Interactive API documentation is available at http://localhost:8000/docs

## Project Structure

```
portfolio-risk-analyzer/
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Main React component
│   │   ├── index.css            # Global styles
│   │   └── main.tsx             # Entry point
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── market_data.py   # Data fetching
│   │   │   ├── monte_carlo.py   # VaR calculations
│   │   │   └── optimization.py  # Portfolio optimization
│   │   ├── routes/
│   │   │   ├── analysis.py      # Risk analysis endpoints
│   │   │   ├── optimization.py  # Optimization endpoints
│   │   │   └── portfolio.py     # Portfolio CRUD
│   │   ├── models.py            # Pydantic models
│   │   └── main.py              # FastAPI application
│   └── requirements.txt
│
└── README.md
```

## Methodology

### Value at Risk (VaR)

VaR is calculated using Monte Carlo simulation. The process:
1. Compute daily returns from historical prices
2. Calculate mean vector and covariance matrix
3. Generate 10,000 simulated portfolio returns using multivariate normal distribution
4. VaR at 95% confidence is the 5th percentile loss
5. CVaR is the average loss beyond the VaR threshold

### Sharpe Ratio

Calculated as (annualized return - risk-free rate) / annualized volatility. Higher values indicate better risk-adjusted returns.

### Correlation Matrix

Shows pairwise correlations between asset returns. Values range from -1 (perfect negative correlation) to +1 (perfect positive correlation).

### Stress Testing

Applies historical market shock scenarios to estimate portfolio losses under extreme conditions.

## Limitations

### Data Quality
- Market data is delayed (15-20 minutes)
- Potential gaps on holidays or from data provider outages
- Corporate actions may not be reflected

### Model Assumptions
- Returns are normally distributed (reality has fat tails)
- Historical correlations persist into the future
- No transaction costs, taxes, or liquidity constraints
- No consideration of short-selling constraints

### Technical Constraints
- Maximum 100 holdings per portfolio
- Lookback period limited to 5 years (1260 trading days)
- Rate limits from data providers may cause failures

## Configuration Files

### requirements.txt
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
yfinance==0.2.32
pandas==2.1.3
numpy==1.26.2
scipy==1.11.4
redis[asyncio]==5.0.1
python-multipart==0.0.6
```

### package.json
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.6.2",
    "lucide-react": "^0.292.0"
  }
}
```

## License

MIT License - See LICENSE file for details

## Acknowledgments

- Yahoo Finance for market data API
- Stooq for fallback market data
- FastAPI for the web framework
- React and Tailwind CSS for the frontend
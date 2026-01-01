"""Portfolio CRUD API routes"""
from fastapi import APIRouter, HTTPException
from typing import List
from app.models import Portfolio, PortfolioCreate

router = APIRouter()

portfolios_db = {}
portfolio_counter = 0

@router.post("/", response_model=Portfolio, status_code=201)
async def create_portfolio(portfolio: PortfolioCreate):
    global portfolio_counter
    portfolio_counter += 1
    
    new_portfolio = Portfolio(
        id=portfolio_counter,
        name=portfolio.name,
        holdings=portfolio.holdings
    )
    
    portfolios_db[portfolio_counter] = new_portfolio
    return new_portfolio

@router.get("/{portfolio_id}", response_model=Portfolio)
async def get_portfolio(portfolio_id: int):
    if portfolio_id not in portfolios_db:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolios_db[portfolio_id]

@router.get("/", response_model=List[Portfolio])
async def list_portfolios():
    return list(portfolios_db.values())

@router.delete("/{portfolio_id}", status_code=204)
async def delete_portfolio(portfolio_id: int):
    if portfolio_id not in portfolios_db:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    del portfolios_db[portfolio_id]
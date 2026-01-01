"""
Portfolio Risk Analyzer - FastAPI Backend
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

from app.routes import portfolio, analysis, optimization

redis_client = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup resources"""
    global redis_client
    
    # Try to connect to Redis if available
    try:
        redis_url = os.getenv("REDIS_URL")
        if redis_url and redis_url != "none":
            import redis.asyncio as aioredis
            redis_client = await aioredis.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5
            )
            print("✅ Redis connected")
        else:
            print("ℹ️  Running without Redis")
    except Exception as e:
        print(f"⚠️  Redis unavailable: {e}")
        redis_client = None
    
    yield
    
    if redis_client:
        await redis_client.close()

app = FastAPI(
    title="Portfolio Risk Analyzer API",
    description="Monte Carlo VaR, Efficient Frontier, Portfolio Analytics",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["Portfolio"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(optimization.router, prefix="/api/optimization", tags=["Optimization"])

@app.get("/")
async def root():
    return {
        "service": "Portfolio Risk Analyzer API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "redis": "connected" if redis_client else "not configured"
    }

app.state.redis = redis_client
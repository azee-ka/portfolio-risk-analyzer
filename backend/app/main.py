"""
Portfolio Risk Analyzer - Enhanced FastAPI Backend
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import logging
from app.routes import portfolio, analysis, optimization
from app.core.market_data import set_redis_client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

redis_client = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize and cleanup resources"""
    global redis_client
    
    logger.info("Starting Portfolio Risk Analyzer API...")
    
    # Try to connect to Redis if available
    try:
        redis_url = os.getenv("REDIS_URL")
        if redis_url and redis_url != "none":
            import redis.asyncio as aioredis
            
            redis_client = await aioredis.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
                max_connections=10,
            )
            
            # Test connection
            await redis_client.ping()
            set_redis_client(redis_client)
            logger.info("✅ Redis connected successfully")
        else:
            logger.info("ℹ️  Running without Redis (caching disabled)")
            
    except Exception as e:
        logger.warning(f"⚠️  Redis connection failed: {e}")
        logger.info("ℹ️  Continuing without Redis (caching disabled)")
        redis_client = None

    yield
    
    # Cleanup
    if redis_client:
        logger.info("Closing Redis connection...")
        await redis_client.close()
    
    logger.info("Portfolio Risk Analyzer API stopped")


app = FastAPI(
    title="Portfolio Risk Analyzer API",
    description="Advanced Monte Carlo VaR, Efficient Frontier, and Portfolio Analytics",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(
    portfolio.router,
    prefix="/api/portfolio",
    tags=["Portfolio Management"]
)
app.include_router(
    analysis.router,
    prefix="/api/analysis",
    tags=["Risk Analysis"]
)
app.include_router(
    optimization.router,
    prefix="/api/optimization",
    tags=["Portfolio Optimization"]
)


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "service": "Portfolio Risk Analyzer API",
        "version": "2.0.0",
        "status": "running",
        "features": [
            "Monte Carlo VaR/CVaR",
            "Correlation Analysis",
            "Stress Testing",
            "Efficient Frontier",
            "Portfolio Optimization",
            "Risk Metrics",
        ],
        "docs": "/docs",
        "redoc": "/redoc",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    redis_status = "not configured"
    
    if redis_client:
        try:
            await redis_client.ping()
            redis_status = "connected"
        except Exception:
            redis_status = "disconnected"
    
    return {
        "status": "healthy",
        "redis": redis_status,
        "version": "2.0.0",
    }


@app.get("/api/status")
async def api_status():
    """Detailed API status"""
    return {
        "api_version": "2.0.0",
        "endpoints": {
            "portfolio": ["/api/portfolio/", "/api/portfolio/{id}"],
            "analysis": [
                "/api/analysis/var",
                "/api/analysis/correlation",
                "/api/analysis/risk-metrics",
                "/api/analysis/stress-test",
            ],
            "optimization": [
                "/api/optimization/efficient-frontier",
                "/api/optimization/optimize-sharpe",
            ],
        },
        "redis_enabled": redis_client is not None,
    }


# Store Redis client in app state
app.state.redis = redis_client


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info",
    )
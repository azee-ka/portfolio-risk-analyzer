"""Enhanced market data fetching with Yahoo Finance and Stooq fallback"""
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import json
import asyncio
from urllib.parse import quote_plus
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MarketDataError(Exception):
    """Custom exception for market data errors"""
    pass


class MarketData:
    def __init__(self, redis_client=None):
        self.redis = redis_client
        self.cache_ttl = 300  # 5 minutes for price data
        self.history_cache_ttl = 1800  # 30 minutes for historical data

    def _to_stooq_symbol(self, ticker: str) -> str:
        """Convert a common ticker to Stooq format"""
        t = ticker.strip().upper()
        if not t or t.startswith('^'):
            raise MarketDataError(f"Stooq fallback does not support index ticker: {ticker}")
        if '-USD' in t or t.endswith('-USD') or 'USD' == t:
            raise MarketDataError(f"Stooq fallback does not support crypto ticker: {ticker}")

        # Most US equities: <ticker>.US
        return f"{t.lower()}.us"

    async def _stooq_daily_history(self, ticker: str) -> pd.DataFrame:
        """Fetch daily OHLCV from Stooq as fallback"""
        try:
            symbol = self._to_stooq_symbol(ticker)
            url = f"https://stooq.com/q/d/l/?s={quote_plus(symbol)}&i=d"

            def _read_csv() -> pd.DataFrame:
                try:
                    df = pd.read_csv(url)
                    if df is None or len(df) == 0:
                        return pd.DataFrame()
                    
                    if 'Date' not in df.columns or 'Close' not in df.columns:
                        return pd.DataFrame()
                    
                    df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
                    df = df.dropna(subset=['Date'])
                    df = df.set_index('Date').sort_index()
                    return df
                except Exception as e:
                    logger.warning(f"Stooq CSV read failed for {ticker}: {e}")
                    return pd.DataFrame()

            return await asyncio.to_thread(_read_csv)
        except Exception as e:
            logger.error(f"Stooq history fetch failed for {ticker}: {e}")
            return pd.DataFrame()

    async def _stooq_close_series(self, tickers: List[str], days: int) -> pd.DataFrame:
        """Build close-price DataFrame from Stooq"""
        frames = []
        for t in tickers:
            df = await self._stooq_daily_history(t)
            if df is None or len(df) == 0:
                logger.warning(f"No Stooq data for {t}")
                continue
            close = df[['Close']].rename(columns={'Close': t})
            frames.append(close)

        if not frames:
            raise MarketDataError("No data available from Stooq fallback")

        prices = pd.concat(frames, axis=1)
        prices = prices.dropna(how='all').tail(days)
        
        if prices is None or len(prices) == 0:
            raise MarketDataError("No price data returned from Stooq fallback")
        
        return prices

    async def get_historical_prices(
        self, 
        tickers: List[str], 
        days: int = 252
    ) -> pd.DataFrame:
        """Get historical prices with caching and fallback"""
        cache_key = f"prices:{','.join(sorted(tickers))}:{days}"

        # Try cache first
        if self.redis:
            try:
                cached = await self.redis.get(cache_key)
                if cached:
                    data = json.loads(cached)
                    df = pd.DataFrame(data)
                    df['Date'] = pd.to_datetime(df['Date'])
                    return df.set_index('Date')
            except Exception as e:
                logger.warning(f"Cache read failed: {e}")

        end_date = datetime.now()
        start_date = end_date - timedelta(days=int(days * 1.5))

        try:
            # Try Yahoo Finance first
            logger.info(f"Fetching {len(tickers)} tickers from Yahoo Finance")
            data = yf.download(
                tickers,
                start=start_date,
                end=end_date,
                progress=False,
                auto_adjust=True,
                group_by="column",
                threads=True,
            )

            if len(tickers) == 1:
                prices = data[['Close']].rename(columns={'Close': tickers[0]})
            else:
                prices = data['Close']

            if prices is None or len(prices) == 0:
                logger.warning("Yahoo Finance returned empty data, trying Stooq")
                prices = await self._stooq_close_series(tickers, days)

            prices = prices.dropna().tail(days)

            # Check data quality
            if len(prices) < days * 0.8:
                logger.warning(f"Insufficient data from Yahoo ({len(prices)} days), trying Stooq")
                try:
                    prices = await self._stooq_close_series(tickers, days)
                    prices = prices.dropna().tail(days)
                except Exception as e:
                    logger.warning(f"Stooq fallback also failed: {e}")

            if len(prices) < days * 0.8:
                raise MarketDataError(
                    f"Insufficient data: got {len(prices)} days, needed {int(days * 0.8)}+"
                )

            # Cache the result
            if self.redis:
                try:
                    cache_data = prices.reset_index()
                    cache_data['Date'] = cache_data['Date'].astype(str)
                    await self.redis.setex(
                        cache_key,
                        self.history_cache_ttl,
                        json.dumps(cache_data.to_dict(orient='list'))
                    )
                except Exception as e:
                    logger.warning(f"Cache write failed: {e}")

            return prices
            
        except Exception as e:
            logger.error(f"Failed to fetch historical prices: {e}")
            raise MarketDataError(f"Failed to fetch data: {str(e)}")

    async def get_current_prices(self, tickers: List[str]) -> Dict[str, float]:
        """Get latest prices with multiple fallback strategies"""
        cache_key = f"current:{','.join(sorted(tickers))}"

        # Try cache first
        if self.redis:
            try:
                cached = await self.redis.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception as e:
                logger.warning(f"Cache read failed: {e}")

        try:
            prices: Dict[str, float] = {}

            # Strategy 1: Bulk download (most reliable)
            logger.info(f"Fetching current prices for {len(tickers)} tickers")
            data = yf.download(
                tickers=tickers,
                period="5d",
                interval="1d",
                progress=False,
                auto_adjust=True,
                group_by="column",
                threads=True,
            )

            def _extract_price(df, ticker: str) -> float:
                """Extract last close price from download result"""
                if df is None or len(df) == 0:
                    return 0.0
                try:
                    if isinstance(df.columns, pd.MultiIndex):
                        if ('Close', ticker) in df.columns:
                            series = df[('Close', ticker)]
                        elif (ticker, 'Close') in df.columns:
                            series = df[(ticker, 'Close')]
                        else:
                            series = df['Close'] if 'Close' in df.columns else None
                    else:
                        series = df['Close'] if 'Close' in df.columns else None

                    if series is None:
                        return 0.0

                    series = series.dropna()
                    if len(series) == 0:
                        return 0.0
                    
                    return float(series.iloc[-1])
                except Exception as e:
                    logger.warning(f"Price extraction failed for {ticker}: {e}")
                    return 0.0

            for ticker in tickers:
                price = _extract_price(data, ticker)
                if price and price > 0:
                    prices[ticker] = price

            # Strategy 2: Per-ticker fallback for missing prices
            missing = [t for t in tickers if t not in prices or prices[t] <= 0]
            
            for ticker in missing:
                try:
                    tk = yf.Ticker(ticker)
                    price = 0.0

                    # Try fast_info first
                    try:
                        fi = getattr(tk, 'fast_info', None)
                        if fi:
                            price = float(
                                fi.get('last_price') or 
                                fi.get('lastPrice') or 
                                fi.get('regularMarketPrice') or 
                                0
                            )
                    except Exception:
                        pass

                    # Try history if fast_info failed
                    if not price or price <= 0:
                        try:
                            hist = tk.history(period='5d', interval='1d', auto_adjust=True)
                            if hist is not None and len(hist) > 0 and 'Close' in hist.columns:
                                close_series = hist['Close'].dropna()
                                if len(close_series) > 0:
                                    price = float(close_series.iloc[-1])
                        except Exception:
                            pass

                    # Last resort: info (can be unreliable)
                    if not price or price <= 0:
                        try:
                            info = tk.info
                            price = float(
                                info.get('currentPrice') or 
                                info.get('regularMarketPrice') or 
                                0
                            )
                        except Exception:
                            pass

                    if price and price > 0:
                        prices[ticker] = float(price)
                    else:
                        prices[ticker] = 0.0
                        
                except Exception as e:
                    logger.warning(f"Per-ticker fallback failed for {ticker}: {e}")
                    prices[ticker] = 0.0

            # Strategy 3: Stooq fallback for remaining zeros
            failed = [t for t, p in prices.items() if not p or p <= 0]
            if failed:
                logger.info(f"Trying Stooq for {len(failed)} failed tickers")
                try:
                    stooq_prices = await self._stooq_close_series(failed, days=10)
                    for ticker in failed:
                        if ticker in stooq_prices.columns:
                            series = stooq_prices[ticker].dropna()
                            if len(series) > 0:
                                prices[ticker] = float(series.iloc[-1])
                except Exception as e:
                    logger.warning(f"Stooq fallback failed: {e}")

            # Final validation
            still_failed = [t for t, p in prices.items() if not p or p <= 0]
            if still_failed:
                raise MarketDataError(
                    f"Unable to fetch current prices for: {', '.join(still_failed)}. "
                    "Data providers may be rate-limiting. Try again in a few minutes."
                )

            # Cache successful results
            if self.redis:
                try:
                    await self.redis.setex(cache_key, self.cache_ttl, json.dumps(prices))
                except Exception as e:
                    logger.warning(f"Cache write failed: {e}")

            return prices
            
        except MarketDataError:
            raise
        except Exception as e:
            logger.error(f"Failed to fetch current prices: {e}")
            raise MarketDataError(f"Failed to fetch prices: {str(e)}")

    async def calculate_returns(
        self, 
        tickers: List[str], 
        days: int = 252
    ) -> pd.DataFrame:
        """Calculate daily returns from historical prices"""
        prices = await self.get_historical_prices(tickers, days)
        returns = prices.pct_change().dropna()
        return returns


# Global instance
market_data = MarketData()


def set_redis_client(redis_client):
    """Set Redis client for caching"""
    market_data.redis = redis_client
    logger.info("Redis client configured for market data")
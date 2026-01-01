"""Market data fetching with Yahoo Finance"""
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict
import json
import asyncio
from urllib.parse import quote_plus

class MarketDataError(Exception):
    pass

class MarketData:
    def __init__(self, redis_client=None):
        self.redis = redis_client
        self.cache_ttl = 300

    def _to_stooq_symbol(self, ticker: str) -> str:
        """Convert a common ticker (AAPL, GOOGL, BRK.B) to a Stooq symbol.

        Stooq uses lowercase and typically requires market suffixes.
        For US equities, the common format is: aapl.us

        NOTE:
        - This fallback is intended for equities/ETFs. Index tickers like ^GSPC won't work here.
        - Crypto tickers like BTC-USD also won't work with Stooq.
        """
        t = ticker.strip().upper()
        if not t or t.startswith('^'):
            raise MarketDataError(f"Stooq fallback does not support index ticker: {ticker}")
        if '-USD' in t or t.endswith('-USD') or 'USD' == t:
            raise MarketDataError(f"Stooq fallback does not support crypto ticker: {ticker}")

        # Stooq supports dotted tickers, keep dot
        # Most US equities: <ticker>.US
        return f"{t.lower()}.us"

    async def _stooq_daily_history(self, ticker: str) -> pd.DataFrame:
        """Fetch daily OHLCV from Stooq as a fallback when Yahoo is blocked.

        Returns a DataFrame indexed by Date, with a 'Close' column.
        """
        symbol = self._to_stooq_symbol(ticker)
        # Example: https://stooq.com/q/d/l/?s=aapl.us&i=d
        url = f"https://stooq.com/q/d/l/?s={quote_plus(symbol)}&i=d"

        def _read_csv() -> pd.DataFrame:
            df = pd.read_csv(url)
            if df is None or len(df) == 0:
                return pd.DataFrame()
            # Stooq columns: Date,Open,High,Low,Close,Volume
            if 'Date' not in df.columns or 'Close' not in df.columns:
                return pd.DataFrame()
            df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
            df = df.dropna(subset=['Date'])
            df = df.set_index('Date').sort_index()
            return df

        return await asyncio.to_thread(_read_csv)

    async def _stooq_close_series(self, tickers: List[str], days: int) -> pd.DataFrame:
        """Build a close-price DataFrame (columns=tickers) from Stooq."""
        frames = []
        for t in tickers:
            df = await self._stooq_daily_history(t)
            if df is None or len(df) == 0:
                raise MarketDataError(f"Stooq returned no data for {t}")
            close = df[['Close']].rename(columns={'Close': t})
            frames.append(close)

        prices = pd.concat(frames, axis=1)
        prices = prices.dropna(how='all').tail(days)
        if prices is None or len(prices) == 0:
            raise MarketDataError("No price data returned from Stooq fallback")
        return prices

    async def get_historical_prices(self, tickers: List[str], days: int = 252) -> pd.DataFrame:
        cache_key = f"prices:{','.join(sorted(tickers))}:{days}"

        if self.redis:
            try:
                cached = await self.redis.get(cache_key)
                if cached:
                    data = json.loads(cached)
                    return pd.DataFrame(data).set_index('Date')
            except:
                pass

        end_date = datetime.now()
        start_date = end_date - timedelta(days=int(days * 1.5))

        try:
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
                # Yahoo can be blocked/rate-limited and return empty.
                # Fall back to Stooq for equities/ETFs.
                prices = await self._stooq_close_series(tickers, days)

            prices = prices.dropna().tail(days)

            if len(prices) < days * 0.8:
                # If Yahoo gave sparse data, try Stooq once before failing.
                try:
                    prices = await self._stooq_close_series(tickers, days)
                    prices = prices.dropna().tail(days)
                except Exception:
                    pass

            if len(prices) < days * 0.8:
                raise MarketDataError(f"Insufficient data: got {len(prices)} days")

            if self.redis:
                try:
                    cache_data = prices.reset_index()
                    cache_data['Date'] = cache_data['Date'].astype(str)
                    await self.redis.setex(
                        cache_key,
                        self.cache_ttl,
                        json.dumps(cache_data.to_dict(orient='list'))
                    )
                except:
                    pass

            return prices
        except Exception as e:
            raise MarketDataError(f"Failed to fetch data: {str(e)}")

    async def get_current_prices(self, tickers: List[str]) -> Dict[str, float]:
        """Get latest prices for tickers.

        NOTE: Yahoo Finance's quoteSummary JSON endpoints used by `.info` can intermittently fail
        (rate-limits, HTML responses, malformed JSON). To keep the API stable, we prefer a
        download/history-based approach and only fall back to fast_info/info if needed.
        """
        cache_key = f"current:{','.join(sorted(tickers))}"

        if self.redis:
            try:
                cached = await self.redis.get(cache_key)
                if cached:
                    return json.loads(cached)
            except Exception:
                pass

        try:
            prices: Dict[str, float] = {}

            # 1) Preferred: download recent daily bars for all tickers at once.
            # This path is usually more reliable than quoteSummary JSON.
            data = yf.download(
                tickers=tickers,
                period="5d",
                interval="1d",
                progress=False,
                auto_adjust=True,
                group_by="column",
                threads=True,
            )

            def _last_close_from_download(df, t: str) -> float:
                if df is None or len(df) == 0:
                    return 0.0
                try:
                    if isinstance(df.columns, pd.MultiIndex):
                        if ('Close', t) in df.columns:
                            series = df[('Close', t)]
                        elif (t, 'Close') in df.columns:
                            series = df[(t, 'Close')]
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
                except Exception:
                    return 0.0

            for t in tickers:
                p = _last_close_from_download(data, t)
                if p and p > 0:
                    prices[t] = p

            # 2) Fallback: per-ticker fast_info/history for missing ones.
            missing = [t for t in tickers if t not in prices]
            for t in missing:
                try:
                    tk = yf.Ticker(t)

                    p = 0.0
                    try:
                        fi = getattr(tk, 'fast_info', None)
                        if fi:
                            p = float(fi.get('last_price') or fi.get('lastPrice') or fi.get('regularMarketPrice') or 0)
                    except Exception:
                        p = 0.0

                    if not p or p <= 0:
                        try:
                            hist = tk.history(period='5d', interval='1d', auto_adjust=True)
                            if hist is not None and len(hist) > 0 and 'Close' in hist.columns:
                                p2 = float(hist['Close'].dropna().iloc[-1])
                                if p2 > 0:
                                    p = p2
                        except Exception:
                            pass

                    # last resort: info (can still fail, so keep it guarded)
                    if not p or p <= 0:
                        try:
                            info = tk.info
                            p = float(info.get('currentPrice') or info.get('regularMarketPrice') or 0)
                        except Exception:
                            p = 0.0

                    prices[t] = float(p) if p and p > 0 else 0.0
                except Exception:
                    prices[t] = 0.0

            bad = [t for t, p in prices.items() if not p or p <= 0]
            if bad:
                # Final fallback: Stooq last close for any remaining tickers (equities/ETFs).
                try:
                    stooq_prices = await self._stooq_close_series(bad, days=10)
                    for t in bad:
                        if t in stooq_prices.columns:
                            s = stooq_prices[t].dropna()
                            if len(s) > 0:
                                prices[t] = float(s.iloc[-1])
                except Exception:
                    pass

            bad = [t for t, p in prices.items() if not p or p <= 0]
            if bad:
                raise MarketDataError(
                    "Unable to fetch current prices for: " + ", ".join(bad) +
                    ". Data providers may be rate-limiting. Try again, or use different tickers."
                )

            if self.redis:
                try:
                    await self.redis.setex(cache_key, 60, json.dumps(prices))
                except Exception:
                    pass

            return prices
        except MarketDataError:
            raise
        except Exception as e:
            raise MarketDataError(f"Failed to fetch prices: {str(e)}")

    async def calculate_returns(self, tickers: List[str], days: int = 252) -> pd.DataFrame:
        prices = await self.get_historical_prices(tickers, days)
        returns = prices.pct_change().dropna()
        return returns

market_data = MarketData()

def set_redis_client(redis_client):
    market_data.redis = redis_client
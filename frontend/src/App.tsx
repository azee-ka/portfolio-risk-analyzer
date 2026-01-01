import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TrendingUp,
  Plus,
  X,
  BarChart3,
  Sparkles,
  ShieldAlert,
  RefreshCcw,
  Settings,
  Download,
  Upload,
  PencilLine,
  Check,
  Undo2,
  Trash2,
  BookOpen,
  AlertTriangle,
} from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

interface Holding {
  ticker: string;
  shares: number;
}

interface RiskMetrics {
  portfolio_value: number;
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
  var_95: number;
  cvar_95: number;
  max_drawdown: number;
}

type AnalyzeSettings = {
  lookback_days: number;
  risk_free_rate: number;
};

const STORAGE_KEY = 'pra:v1';

function clampNumberString(v: string) {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 2) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function isValidTicker(t: string) {
  // Common ticker patterns: AAPL, BRK.B, RDS-A, BTC-USD, ^GSPC
  return /^[A-Z0-9^][A-Z0-9.-]{0,10}$/.test(t);
}

function formatPct(n: number) {
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export default function App() {
  const [holdings, setHoldings] = useState<Holding[]>([
    { ticker: 'AAPL', shares: 100 },
    { ticker: 'GOOGL', shares: 50 },
  ]);
  const [newTicker, setNewTicker] = useState('');
  const [newShares, setNewShares] = useState('');
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AnalyzeSettings>({ lookback_days: 252, risk_free_rate: 0.04 });
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Simple in-app routing (no dependency on react-router)
  const [route, setRoute] = useState<'app' | 'docs'>(() => (window.location.hash === '#/docs' ? 'docs' : 'app'));

  const DISCLAIMER = useMemo(
    () =>
      'Educational use only. This tool can be wrong or stale (delayed quotes, data gaps, modeling assumptions). It is not investment advice. Do not rely on it for trading or financial decisions.',
    [],
  );

  // Inline edit state
  const [editing, setEditing] = useState<Record<string, string>>({});

  // Load persisted state
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = safeJsonParse<{
      holdings?: Holding[];
      settings?: AnalyzeSettings;
      metrics?: RiskMetrics | null;
      lastRunAt?: number | null;
    }>(raw);
    if (!parsed) return;

    if (Array.isArray(parsed.holdings) && parsed.holdings.length > 0) {
      const cleaned = parsed.holdings
        .filter((h) => h && typeof h.ticker === 'string' && Number.isFinite(Number(h.shares)))
        .map((h) => ({ ticker: h.ticker.toUpperCase().trim(), shares: Number(h.shares) }))
        .filter((h) => h.ticker && h.shares > 0);
      if (cleaned.length > 0) setHoldings(cleaned);
    }

    if (
      parsed.settings &&
      Number.isFinite(parsed.settings.lookback_days) &&
      Number.isFinite(parsed.settings.risk_free_rate)
    ) {
      setSettings({
        lookback_days: Math.min(1260, Math.max(30, Math.floor(parsed.settings.lookback_days))),
        risk_free_rate: Math.min(0.2, Math.max(0, Number(parsed.settings.risk_free_rate))),
      });
    }

    if (parsed.metrics && typeof parsed.metrics === 'object') setMetrics(parsed.metrics);
    if (typeof parsed.lastRunAt === 'number') setLastRunAt(parsed.lastRunAt);
  }, []);

  // Hash route sync
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash === '#/docs' ? 'docs' : 'app');
    window.addEventListener('hashchange', onHash);
    onHash();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Persist state
  useEffect(() => {
    const payload = { holdings, settings, metrics, lastRunAt };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [holdings, settings, metrics, lastRunAt]);

  const totalShares = useMemo(() => {
    return holdings.reduce((acc, h) => acc + (Number.isFinite(h.shares) ? h.shares : 0), 0);
  }, [holdings]);

  const holdingsSummary = useMemo(() => {
    const tickers = holdings.map((h) => h.ticker);
    return {
      count: holdings.length,
      unique: new Set(tickers).size,
    };
  }, [holdings]);

  const canAnalyze = holdings.length > 0 && !loading;

  const addHolding = () => {
    const t = newTicker.toUpperCase().trim();
    const s = parseFloat(newShares);

    if (!t || !newShares) return;

    if (!isValidTicker(t)) {
      setError('Invalid ticker format. Examples: AAPL, BRK.B, BTC-USD');
      return;
    }
    if (!Number.isFinite(s) || s <= 0) {
      setError('Shares must be a positive number.');
      return;
    }

    setError('');

    // merge duplicates
    const existingIdx = holdings.findIndex((h) => h.ticker === t);
    if (existingIdx >= 0) {
      const next = [...holdings];
      next[existingIdx] = { ...next[existingIdx], shares: next[existingIdx].shares + s };
      setHoldings(next);
    } else {
      setHoldings([...holdings, { ticker: t, shares: s }]);
    }

    setNewTicker('');
    setNewShares('');
  };

  const removeHolding = (ticker: string) => {
    setHoldings((prev) => prev.filter((h) => h.ticker !== ticker));
    setEditing((prev) => {
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
  };

  const setShares = (ticker: string, shares: number) => {
    if (!Number.isFinite(shares) || shares <= 0) {
      setError('Shares must be a positive number.');
      return;
    }
    setError('');
    setHoldings((prev) => prev.map((h) => (h.ticker === ticker ? { ...h, shares } : h)));
  };

  const startEdit = (ticker: string, currentShares: number) => {
    setEditing((prev) => ({ ...prev, [ticker]: String(currentShares) }));
  };

  const cancelEdit = (ticker: string) => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
  };

  const commitEdit = (ticker: string) => {
    const raw = editing[ticker];
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || v <= 0) {
      setError('Shares must be a positive number.');
      return;
    }
    setShares(ticker, v);
    cancelEdit(ticker);
  };

  const analyzePortfolio = async () => {
    if (!canAnalyze) return;

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${API_URL}/api/analysis/risk-metrics`, {
        holdings,
        lookback_days: settings.lookback_days,
        risk_free_rate: settings.risk_free_rate,
      });

      setMetrics(response.data);
      setLastRunAt(Date.now());
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Analysis failed';
      setError(typeof msg === 'string' ? msg : 'Analysis failed');
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  const resetWorkspace = () => {
    setHoldings([]);
    setMetrics(null);
    setError('');
    setLastRunAt(null);
    setEditing({});
  };

  const exportWorkspace = () => {
    const payload = {
      version: 1,
      exported_at: new Date().toISOString(),
      disclaimer: DISCLAIMER,
      holdings,
      settings,
      metrics,
      lastRunAt,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'portfolio-risk-analyzer.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importWorkspace = async (file: File) => {
    const text = await file.text();
    const parsed = safeJsonParse<any>(text);
    if (!parsed) {
      setError('Import failed: invalid JSON file.');
      return;
    }

    const maybeHoldings = Array.isArray(parsed.holdings) ? parsed.holdings : null;
    if (!maybeHoldings || maybeHoldings.length === 0) {
      setError('Import failed: holdings missing.');
      return;
    }

    const cleaned: Holding[] = maybeHoldings
      .filter((h: any) => h && typeof h.ticker === 'string')
      .map((h: any) => ({ ticker: String(h.ticker).toUpperCase().trim(), shares: Number(h.shares) }))
      .filter(
        (h: Holding) => h.ticker && isValidTicker(h.ticker) && Number.isFinite(h.shares) && h.shares > 0,
      );

    if (cleaned.length === 0) {
      setError('Import failed: no valid holdings found.');
      return;
    }

    const nextSettings: AnalyzeSettings = {
      lookback_days: Number.isFinite(parsed.settings?.lookback_days)
        ? Math.min(1260, Math.max(30, Math.floor(Number(parsed.settings.lookback_days))))
        : settings.lookback_days,
      risk_free_rate: Number.isFinite(parsed.settings?.risk_free_rate)
        ? Math.min(0.2, Math.max(0, Number(parsed.settings.risk_free_rate)))
        : settings.risk_free_rate,
    };

    setHoldings(mergeHoldings(cleaned));
    setSettings(nextSettings);
    setMetrics(parsed.metrics && typeof parsed.metrics === 'object' ? parsed.metrics : null);
    setLastRunAt(typeof parsed.lastRunAt === 'number' ? parsed.lastRunAt : null);
    setError('');
  };

  const onKeyDownAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') addHolding();
  };

  const runMeta = useMemo(() => {
    if (!lastRunAt) return 'Not run yet';
    const d = new Date(lastRunAt);
    return `Last run: ${d.toLocaleString()}`;
  }, [lastRunAt]);

  return (
    <div className="min-h-screen text-white bg-black selection:bg-cyan-500/30 selection:text-white">
      {/* Ambient */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_20%_10%,rgba(34,211,238,0.20),transparent_55%),radial-gradient(800px_circle_at_85%_20%,rgba(168,85,247,0.18),transparent_55%),radial-gradient(1000px_circle_at_50%_95%,rgba(59,130,246,0.12),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.10] bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:56px_56px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black to-black" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <div className="absolute -inset-2 rounded-xl bg-cyan-500/15 blur-xl" />
                <div className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                  <TrendingUp className="text-cyan-300" size={22} />
                </div>
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">Portfolio Risk</h1>
                <p className="text-xs sm:text-sm text-white/60 truncate">
                  Delayed pricing • Monte Carlo VaR
                </p>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <Badge label={`${holdingsSummary.count} holdings`} />
              <Badge label={`${totalShares.toLocaleString()} shares`} icon={<Sparkles size={14} />} />
              <Badge label={runMeta} />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2"
                aria-label="Open docs"
                onClick={() => {
                  window.location.hash = '#/docs';
                }}
                disabled={loading}
              >
                <BookOpen size={18} className="text-white/80" />
              </button>
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2"
                aria-label="Open settings"
                onClick={() => setSettingsOpen(true)}
                disabled={loading}
              >
                <Settings size={18} className="text-white/80" />
              </button>
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2"
                aria-label="Export workspace"
                onClick={exportWorkspace}
                disabled={loading}
              >
                <Download size={18} className="text-white/80" />
              </button>
              <button
                type="button"
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2"
                aria-label="Import workspace"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                <Upload size={18} className="text-white/80" />
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importWorkspace(f);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-5 pb-4">
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-100/90">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 text-amber-200" />
              <div className="min-w-0">
                <div className="font-medium text-amber-100">Do not rely on this output</div>
                <div className="mt-0.5 text-amber-100/80">{DISCLAIMER}</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        {route === 'docs' ? (
          <DocsPage disclaimer={DISCLAIMER} onBack={() => (window.location.hash = '#/')} />
        ) : (
          <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Portfolio */}
          <NeonCard>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Holdings</h2>
                <p className="text-xs text-white/60 mt-1">
                  Edit shares inline, import/export workspace, and run analysis.
                </p>
              </div>

              <div className="flex gap-2 w-full justify-end">
                <button
                  onClick={resetWorkspace}
                  className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white/80 inline-flex items-center gap-2"
                  type="button"
                  disabled={loading}
                >
                  <Trash2 size={16} />
                  Reset
                </button>

                <button
                  onClick={analyzePortfolio}
                  disabled={!canAnalyze}
                  className="group relative px-4 py-2 rounded-lg font-medium text-sm border border-cyan-400/30 bg-cyan-500/15 hover:bg-cyan-500/20 disabled:opacity-40 disabled:hover:bg-cyan-500/15"
                  type="button"
                >
                  <span className="absolute -inset-px rounded-lg bg-gradient-to-r from-cyan-400/25 via-blue-500/20 to-fuchsia-400/25 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
                  <span className="relative inline-flex items-center gap-2">
                    {loading ? <RefreshCcw className="animate-spin" size={16} /> : <BarChart3 size={16} />}
                    {loading ? 'Running…' : 'Run analysis'}
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-6">
              {holdings.length === 0 ? (
                <EmptyState title="No holdings" subtitle="Add a ticker and shares to build a portfolio." />
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                  <div className="grid grid-cols-[1fr_160px_44px] gap-0 px-4 py-3 text-xs text-white/60 border-b border-white/10">
                    <div>Ticker</div>
                    <div className="text-right">Shares</div>
                    <div className="text-right">&nbsp;</div>
                  </div>

                  <div className="divide-y divide-white/10">
                    {holdings
                      .slice()
                      .sort((a, b) => a.ticker.localeCompare(b.ticker))
                      .map((h) => {
                        const isEditing = Object.prototype.hasOwnProperty.call(editing, h.ticker);

                        return (
                          <div key={h.ticker} className="grid grid-cols-[1fr_160px_44px] items-center px-4 py-3">
                            <div className="min-w-0">
                              <span className="font-mono text-sm px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white">
                                {h.ticker}
                              </span>
                            </div>

                            <div className="text-right">
                              {!isEditing ? (
                                <button
                                  type="button"
                                  onClick={() => startEdit(h.ticker, h.shares)}
                                  className="inline-flex items-center justify-end gap-2 w-full text-sm text-white/80 hover:text-white"
                                  aria-label={`Edit shares for ${h.ticker}`}
                                  disabled={loading}
                                >
                                  <span>{h.shares.toLocaleString()}</span>
                                  <PencilLine size={16} className="text-white/50" />
                                </button>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  <input
                                    value={editing[h.ticker]}
                                    onChange={(e) =>
                                      setEditing((prev) => ({
                                        ...prev,
                                        [h.ticker]: clampNumberString(e.target.value),
                                      }))
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') commitEdit(h.ticker);
                                      if (e.key === 'Escape') cancelEdit(h.ticker);
                                    }}
                                    className="w-28 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10 text-right"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    aria-label={`Shares for ${h.ticker}`}
                                    disabled={loading}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => commitEdit(h.ticker)}
                                    className="rounded-lg p-2 border border-white/10 bg-white/5 hover:bg-white/10"
                                    aria-label="Save"
                                    disabled={loading}
                                  >
                                    <Check size={16} className="text-emerald-200" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => cancelEdit(h.ticker)}
                                    className="rounded-lg p-2 border border-white/10 bg-white/5 hover:bg-white/10"
                                    aria-label="Cancel"
                                    disabled={loading}
                                  >
                                    <Undo2 size={16} className="text-white/70" />
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="text-right">
                              <button
                                onClick={() => removeHolding(h.ticker)}
                                className="rounded-lg p-2 text-white/70 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
                                type="button"
                                aria-label={`Remove ${h.ticker}`}
                                disabled={loading}
                              >
                                <X size={18} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  <div className="px-4 py-3 text-xs text-white/55 border-t border-white/10 flex items-center justify-between">
                    <div>Sorted A→Z</div>
                    <div>{totalShares.toLocaleString()} total shares</div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-3">
              <div className="relative">
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  placeholder="Ticker (AAPL, BRK.B, BTC-USD)"
                  value={newTicker}
                  onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                  onKeyDown={onKeyDownAdd}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 text-sm outline-none focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10"
                />
              </div>

              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="Shares"
                  value={newShares}
                  onChange={(e) => setNewShares(clampNumberString(e.target.value))}
                  onKeyDown={onKeyDownAdd}
                  className="w-full rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 text-sm outline-none focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/10"
                />
              </div>

              <button
                onClick={addHolding}
                className="group relative rounded-xl px-4 py-3 font-medium text-sm border border-white/10 bg-white/5 hover:bg-white/10"
                type="button"
                disabled={loading}
              >
                <span className="absolute -inset-px rounded-xl bg-gradient-to-r from-cyan-400/15 to-fuchsia-400/15 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
                <span className="relative inline-flex items-center gap-2">
                  <Plus size={16} />
                  Add
                </span>
              </button>
            </div>

            {error && (
              <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                <div className="flex gap-2 items-start">
                  <ShieldAlert className="mt-0.5 text-red-300" size={18} />
                  <div className="min-w-0">
                    <div className="font-medium text-red-200">Request failed</div>
                    <div className="text-red-100/90 mt-0.5 break-words">{error}</div>
                  </div>
                </div>
              </div>
            )}
          </NeonCard>

          {/* Metrics */}
          <NeonCard>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Risk Metrics</h2>
                <p className="text-sm text-white/60 mt-1">
                  Annualized return/volatility with 95% VaR and max drawdown.
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge label="Delayed quotes" icon={<BarChart3 size={14} />} />
                <div className="text-xs text-white/50">
                  Lookback: {settings.lookback_days}d • rƒ: {(settings.risk_free_rate * 100).toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="mt-6">
              {!metrics && !loading && <EmptyState title="No results" subtitle="Run analysis to generate metrics." />}

              {loading && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
                      <RefreshCcw className="animate-spin text-cyan-300" size={18} />
                    </div>
                    <div>
                      <div className="font-medium">Running analysis</div>
                      <div className="text-sm text-white/60">
                        Downloading history, computing VaR and drawdown…
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-white/5 border border-white/10">
                    <div className="h-full w-2/3 animate-pulse bg-white/20" />
                  </div>
                </div>
              )}

              {metrics && !loading && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <MetricCard
                      label="Portfolio Value"
                      value={`$${metrics.portfolio_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                      accent="cyan"
                      hint="Based on last available close and shares"
                    />
                    <MetricCard
                      label="Expected Return"
                      value={formatPct(metrics.expected_return)}
                      accent="green"
                      hint="Annualized mean return"
                    />
                    <MetricCard
                      label="Volatility"
                      value={formatPct(metrics.volatility)}
                      accent="yellow"
                      hint="Annualized standard deviation"
                    />
                    <MetricCard
                      label="Sharpe Ratio"
                      value={Number.isFinite(metrics.sharpe_ratio) ? metrics.sharpe_ratio.toFixed(3) : '—'}
                      accent="purple"
                      hint="(Return − rƒ) / Volatility"
                    />
                    <MetricCard
                      label="95% VaR (1-day)"
                      value={`$${metrics.var_95.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                      accent="red"
                      hint="Worst expected 1-day loss at 95%"
                    />
                    <MetricCard
                      label="CVaR"
                      value={`$${metrics.cvar_95.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                      accent="red"
                      hint="Average loss beyond VaR"
                    />
                    <MetricCard
                      label="Max Drawdown"
                      value={formatPct(metrics.max_drawdown)}
                      accent="orange"
                      hint="Peak-to-trough decline"
                    />
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="font-medium text-white/80">Run details</div>
                      <div className="text-xs text-white/50">{runMeta}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="text-white/60">Lookback</div>
                        <div className="mt-1 text-white/85">{settings.lookback_days} trading days</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="text-white/60">Risk-free rate</div>
                        <div className="mt-1 text-white/85">{(settings.risk_free_rate * 100).toFixed(2)}%</div>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="text-white/60">Holdings</div>
                        <div className="mt-1 text-white/85">{holdingsSummary.unique} tickers</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </NeonCard>
        </div>

        <div className="mt-6">
          <NeonCard>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">Interpretation</h3>
                <p className="text-sm text-white/60 mt-1">A concise cheat-sheet for the numbers above.</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-white/75">
              <InfoTile
                title="VaR (Value at Risk)"
                body="Estimated max loss at 95% confidence over a 1-day horizon."
                accent="cyan"
              />
              <InfoTile title="CVaR" body="Average loss in the worst tail beyond the VaR threshold." accent="red" />
              <InfoTile title="Volatility" body="Annualized standard deviation of returns (risk proxy)." accent="yellow" />
              <InfoTile title="Sharpe" body="Risk-adjusted performance vs the configured risk-free rate." accent="purple" />
            </div>
          </NeonCard>
        </div>
          </>
        )}
      </main>

      {settingsOpen && (
        <Modal onClose={() => setSettingsOpen(false)} title="Analysis settings">
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm font-medium">Lookback window</div>
              <div className="text-xs text-white/60 mt-1">Trading days used to compute returns (30–1260).</div>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={30}
                  max={1260}
                  step={1}
                  value={settings.lookback_days}
                  onChange={(e) => setSettings((s) => ({ ...s, lookback_days: Number(e.target.value) }))}
                  className="w-full"
                />
                <div className="w-20 text-right text-sm text-white/80 tabular-nums">{settings.lookback_days}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm font-medium">Risk-free rate</div>
              <div className="text-xs text-white/60 mt-1">Used in Sharpe ratio calculation (0%–20%).</div>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={0.2}
                  step={0.0005}
                  value={settings.risk_free_rate}
                  onChange={(e) => setSettings((s) => ({ ...s, risk_free_rate: Number(e.target.value) }))}
                  className="w-full"
                />
                <div className="w-20 text-right text-sm text-white/80 tabular-nums">
                  {(settings.risk_free_rate * 100).toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100/90">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 text-amber-200" />
                <div>
                  <div className="font-medium text-amber-100">Use at your own risk</div>
                  <div className="mt-1 text-amber-100/80">{DISCLAIMER}</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white/80"
                onClick={() => setSettings({ lookback_days: 252, risk_free_rate: 0.04 })}
              >
                Reset defaults
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-xl border border-cyan-400/30 bg-cyan-500/15 hover:bg-cyan-500/20 text-sm font-medium"
                onClick={() => setSettingsOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function mergeHoldings(list: Holding[]): Holding[] {
  const m = new Map<string, number>();
  for (const h of list) {
    const t = h.ticker.toUpperCase().trim();
    if (!t || !Number.isFinite(h.shares) || h.shares <= 0) continue;
    m.set(t, (m.get(t) || 0) + h.shares);
  }
  return Array.from(m.entries())
    .map(([ticker, shares]) => ({ ticker, shares }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

function NeonCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-px rounded-2xl bg-gradient-to-r from-cyan-400/10 via-blue-500/10 to-fuchsia-400/10 blur-xl"
      />
      <div className="relative rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        {children}
      </div>
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
      <div className="mx-auto mb-4 h-12 w-12 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
        <BarChart3 size={20} className="text-white/70" />
      </div>
      <div className="font-medium">{title}</div>
      <div className="text-sm text-white/60 mt-1">{subtitle}</div>
    </div>
  );
}

function Badge({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 max-w-[260px]">
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

function accentToClasses(accent: string) {
  switch (accent) {
    case 'cyan':
      return { ring: 'ring-cyan-400/10', border: 'border-cyan-400/20', glow: 'bg-cyan-400/10', text: 'text-cyan-200' };
    case 'green':
      return { ring: 'ring-emerald-400/10', border: 'border-emerald-400/20', glow: 'bg-emerald-400/10', text: 'text-emerald-200' };
    case 'yellow':
      return { ring: 'ring-yellow-400/10', border: 'border-yellow-400/20', glow: 'bg-yellow-400/10', text: 'text-yellow-200' };
    case 'purple':
      return { ring: 'ring-fuchsia-400/10', border: 'border-fuchsia-400/20', glow: 'bg-fuchsia-400/10', text: 'text-fuchsia-200' };
    case 'red':
      return { ring: 'ring-red-400/10', border: 'border-red-400/20', glow: 'bg-red-400/10', text: 'text-red-200' };
    case 'orange':
      return { ring: 'ring-orange-400/10', border: 'border-orange-400/20', glow: 'bg-orange-400/10', text: 'text-orange-200' };
    default:
      return { ring: 'ring-white/10', border: 'border-white/10', glow: 'bg-white/5', text: 'text-white' };
  }
}

function MetricCard({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent: string;
  hint?: string;
}) {
  const c = accentToClasses(accent);
  return (
    <div className={`relative rounded-2xl border ${c.border} bg-white/[0.03] p-4 ring-1 ${c.ring}`}>
      <div aria-hidden className={`absolute -inset-px rounded-2xl ${c.glow} blur-xl opacity-40`} />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs text-white/60">{label}</div>
          {hint ? <div className="text-[11px] text-white/45 text-right">{hint}</div> : null}
        </div>
        <div className={`mt-1 text-2xl font-semibold tracking-tight ${c.text}`}>{value}</div>
      </div>
    </div>
  );
}

function InfoTile({ title, body, accent }: { title: string; body: string; accent: string }) {
  const c = accentToClasses(accent);
  return (
    <div className={`relative rounded-2xl border ${c.border} bg-white/[0.03] p-4 ring-1 ${c.ring}`}>
      <div aria-hidden className={`absolute -inset-px rounded-2xl ${c.glow} blur-xl opacity-35`} />
      <div className="relative">
        <div className={`font-medium ${c.text}`}>{title}</div>
        <div className="mt-1 text-white/70 text-sm">{body}</div>
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-5">
        <div className="relative w-full max-w-xl">
          <div
            aria-hidden
            className="absolute -inset-px rounded-2xl bg-gradient-to-r from-cyan-400/15 via-blue-500/15 to-fuchsia-400/15 blur-xl"
          />
          <div className="relative rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-xs text-white/55 mt-1">Esc to close</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2"
                aria-label="Close"
              >
                <X size={18} className="text-white/80" />
              </button>
            </div>
            <div className="mt-4">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
function DocsPage({
  disclaimer,
  onBack,
}: {
  disclaimer: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <NeonCard>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Docs</h2>
            <p className="text-sm text-white/60 mt-1">Methods, assumptions, and limitations.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white/80"
            >
              Back
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-100/90">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 text-amber-200" />
            <div>
              <div className="font-semibold text-amber-100">Disclaimer</div>
              <div className="mt-1 text-amber-100/80">{disclaimer}</div>
            </div>
          </div>
        </div>
      </NeonCard>

      <NeonCard>
        <h3 className="font-semibold">Data</h3>
        <div className="mt-2 text-sm text-white/70 space-y-3">
          <p>
            Quotes are delayed and may be incomplete. Portfolio value is computed from the latest available close per
            ticker multiplied by shares, then summed across holdings.
          </p>
          <p>
            If the data source is missing bars (holidays, delistings, symbol mismatches, outages), computed returns and all
            downstream metrics can drift or fail.
          </p>
        </div>
      </NeonCard>

      <NeonCard>
        <h3 className="font-semibold">Returns & annualization</h3>
        <div className="mt-2 text-sm text-white/70 space-y-3">
          <p>
            Daily returns are computed as simple percent change: r(t) = P(t) / P(t-1) − 1 over the configured lookback
            window.
          </p>
          <p>
            Expected return is the mean of daily returns, annualized using 252 trading days: E[R] ≈ mean(r) × 252.
          </p>
          <p>
            Volatility is the standard deviation of daily returns, annualized: σ ≈ std(r) × √252.
          </p>
        </div>
      </NeonCard>

      <NeonCard>
        <h3 className="font-semibold">Weights</h3>
        <div className="mt-2 text-sm text-white/70 space-y-3">
          <p>
            Position weights are derived from market value: wᵢ = (priceᵢ × sharesᵢ) / portfolio_value.
          </p>
          <p>
            Any error in prices (stale close, corporate actions, symbol mapping) directly changes weights and therefore all
            portfolio-level metrics.
          </p>
        </div>
      </NeonCard>

      <NeonCard>
        <h3 className="font-semibold">Sharpe ratio</h3>
        <div className="mt-2 text-sm text-white/70 space-y-3">
          <p>
            Sharpe is computed as (annualized_return − risk_free_rate) / annualized_volatility.
          </p>
          <p>
            This is sensitive to the risk-free rate, volatility estimate, and the lookback window. A high Sharpe here is not
            a guarantee of future performance.
          </p>
        </div>
      </NeonCard>

      <NeonCard>
        <h3 className="font-semibold">VaR / CVaR via Monte Carlo</h3>
        <div className="mt-2 text-sm text-white/70 space-y-3">
          <p>
            The simulation samples portfolio returns from a multivariate normal model using the empirical mean vector and
            covariance matrix of daily returns.
          </p>
          <p>
            For each simulation, a 1-day portfolio return is generated and mapped to a simulated portfolio value. VaR at 95%
            is the 5th percentile loss; CVaR is the average loss beyond that percentile.
          </p>
          <p>
            Normality is a strong assumption: real returns are fat-tailed, skewed, regime-dependent, and correlations can
            spike in stress. Treat VaR/CVaR as rough, not precise.
          </p>
        </div>
      </NeonCard>

      <NeonCard>
        <h3 className="font-semibold">Max drawdown</h3>
        <div className="mt-2 text-sm text-white/70 space-y-3">
          <p>
            Max drawdown is computed from the cumulative product of portfolio returns over the lookback window, tracking the
            worst peak-to-trough percentage decline.
          </p>
          <p>
            It is entirely backward-looking and depends on the same historical window and data quality.
          </p>
        </div>
      </NeonCard>

      <NeonCard>
        <h3 className="font-semibold">Limitations</h3>
        <ul className="mt-2 text-sm text-white/70 space-y-2 list-disc pl-5">
          <li>Not investment advice. Not a trading signal. Not a substitute for professional analysis.</li>
          <li>Delayed/partial data can materially change results.</li>
          <li>Model risk: historical mean/covariance and normal simulations can understate tail risk.</li>
          <li>No transaction costs, taxes, liquidity, borrowing, or short constraints are modeled.</li>
          <li>Corporate actions, splits, symbol changes, and delistings can break inputs.</li>
        </ul>
      </NeonCard>
    </div>
  );
}
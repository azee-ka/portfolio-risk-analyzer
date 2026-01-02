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
  Activity,
  DollarSign,
  Target,
  TrendingDown,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  PieChart,
  LineChart,
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

interface MonteCarloResult {
  simulations: number;
  confidence_level: number;
  var: number;
  cvar: number;
  percentiles: Record<string, number>;
  distribution: number[];
}

interface CorrelationMatrix {
  tickers: string[];
  matrix: number[][];
}

interface StressTestScenario {
  name: string;
  description: string;
  market_shock: number;
  result: number;
}

interface StressTestResult {
  current_value: number;
  scenarios: StressTestScenario[];
}

type AnalyzeSettings = {
  lookback_days: number;
  risk_free_rate: number;
};

const STORAGE_KEY = 'pra:v2';

function clampNumberString(v: string) {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length <= 2) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function isValidTicker(t: string) {
  return /^[A-Z0-9^][A-Z0-9.-]{0,10}$/.test(t);
}

function formatPct(n: number) {
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

function formatCurrency(n: number) {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
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
    { ticker: 'MSFT', shares: 75 },
  ]);
  const [newTicker, setNewTicker] = useState('');
  const [newShares, setNewShares] = useState('');
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [monteCarloData, setMonteCarloData] = useState<MonteCarloResult | null>(null);
  const [correlationData, setCorrelationData] = useState<CorrelationMatrix | null>(null);
  const [stressTestData, setStressTestData] = useState<StressTestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AnalyzeSettings>({ lookback_days: 252, risk_free_rate: 0.04 });
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'montecarlo' | 'correlation' | 'stress'>('overview');
  const [route, setRoute] = useState<'app' | 'docs'>(() => (window.location.hash === '#/docs' ? 'docs' : 'app'));
  const [expandedSection, setExpandedSection] = useState<string | null>('holdings');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(300000); // 5 minutes

  const DISCLAIMER = useMemo(
    () =>
      'Educational use only. This tool can be wrong or stale (delayed quotes, data gaps, modeling assumptions). It is not investment advice. Do not rely on it for trading or financial decisions.',
    [],
  );

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
      monteCarloData?: MonteCarloResult | null;
      correlationData?: CorrelationMatrix | null;
      stressTestData?: StressTestResult | null;
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
    if (parsed.monteCarloData) setMonteCarloData(parsed.monteCarloData);
    if (parsed.correlationData) setCorrelationData(parsed.correlationData);
    if (parsed.stressTestData) setStressTestData(parsed.stressTestData);
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
    const payload = {
      holdings,
      settings,
      metrics,
      lastRunAt,
      monteCarloData,
      correlationData,
      stressTestData,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [holdings, settings, metrics, lastRunAt, monteCarloData, correlationData, stressTestData]);

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh || !holdings.length) return;

    const timer = setInterval(() => {
      analyzePortfolio();
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [autoRefresh, refreshInterval, holdings]);

  // Auto-expand results when metrics are loaded
  useEffect(() => {
    if (metrics && expandedSection !== 'results') {
      setExpandedSection('results');
    }
  }, [metrics]);

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
      const payload = {
        holdings,
        lookback_days: settings.lookback_days,
        risk_free_rate: settings.risk_free_rate,
      };

      // Run all analyses in parallel
      const [metricsRes, monteCarloRes, correlationRes, stressTestRes] = await Promise.all([
        axios.post(`${API_URL}/api/analysis/risk-metrics`, payload),
        axios.post(`${API_URL}/api/analysis/var`, payload),
        axios.post(`${API_URL}/api/analysis/correlation`, payload),
        axios.post(`${API_URL}/api/analysis/stress-test`, payload),
      ]);

      setMetrics(metricsRes.data);
      setMonteCarloData(monteCarloRes.data);
      setCorrelationData(correlationRes.data);
      setStressTestData(stressTestRes.data);
      setLastRunAt(Date.now());
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Analysis failed';
      setError(typeof msg === 'string' ? msg : 'Analysis failed');
      setMetrics(null);
      setMonteCarloData(null);
      setCorrelationData(null);
      setStressTestData(null);
    } finally {
      setLoading(false);
    }
  };

  const resetWorkspace = () => {
    setHoldings([]);
    setMetrics(null);
    setMonteCarloData(null);
    setCorrelationData(null);
    setStressTestData(null);
    setError('');
    setLastRunAt(null);
    setEditing({});
  };

  const exportWorkspace = () => {
    const payload = {
      version: 2,
      exported_at: new Date().toISOString(),
      disclaimer: DISCLAIMER,
      holdings,
      settings,
      metrics,
      monteCarloData,
      correlationData,
      stressTestData,
      lastRunAt,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-risk-analyzer-${Date.now()}.json`;
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
      .filter((h: Holding) => h.ticker && isValidTicker(h.ticker) && Number.isFinite(h.shares) && h.shares > 0);

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
    setMonteCarloData(parsed.monteCarloData || null);
    setCorrelationData(parsed.correlationData || null);
    setStressTestData(parsed.stressTestData || null);
    setLastRunAt(typeof parsed.lastRunAt === 'number' ? parsed.lastRunAt : null);
    setError('');
  };

  const onKeyDownAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') addHolding();
  };

  const runMeta = useMemo(() => {
    if (!lastRunAt) return 'Not run yet';
    const d = new Date(lastRunAt);
    const now = Date.now();
    const diff = now - lastRunAt;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min${mins > 1 ? 's' : ''} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
    return d.toLocaleDateString();
  }, [lastRunAt]);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="min-h-screen text-white bg-black selection:bg-cyan-500/30 selection:text-white">
      {/* Enhanced Ambient Background */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_25%_15%,rgba(34,211,238,0.25),transparent_60%),radial-gradient(1000px_circle_at_80%_20%,rgba(168,85,247,0.22),transparent_60%),radial-gradient(1400px_circle_at_50%_90%,rgba(59,130,246,0.18),transparent_65%)]" />
        <div className="absolute inset-0 opacity-[0.12] bg-[linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/80" />
      </div>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/50 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              <div className="relative shrink-0">
                <div className="absolute -inset-3 rounded-2xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 blur-2xl" />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 shadow-lg">
                  <TrendingUp className="text-cyan-300" size={24} />
                </div>
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 via-blue-300 to-purple-300">
                  Portfolio Risk Analyzer
                </h1>
                <p className="text-xs sm:text-sm text-white/60 truncate flex items-center gap-2">
                  <Activity size={14} className="text-cyan-400/60" />
                  Advanced Monte Carlo VaR • Correlation Analysis
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge label={`${holdingsSummary.count} holdings`} icon={<PieChart size={14} />} />
              <Badge label={runMeta} icon={<Zap size={14} className="text-yellow-400" />} />

              <div className="flex items-center gap-2 border-l border-white/10 pl-2 ml-2">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2.5 transition-all hover:scale-105"
                  aria-label="Open docs"
                  onClick={() => (window.location.hash = '#/docs')}
                  disabled={loading}
                >
                  <BookOpen size={18} className="text-white/80" />
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2.5 transition-all hover:scale-105"
                  aria-label="Open settings"
                  onClick={() => setSettingsOpen(true)}
                  disabled={loading}
                >
                  <Settings size={18} className="text-white/80" />
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2.5 transition-all hover:scale-105"
                  aria-label="Export workspace"
                  onClick={exportWorkspace}
                  disabled={loading}
                >
                  <Download size={18} className="text-white/80" />
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2.5 transition-all hover:scale-105"
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

          <div className="mt-4">
            <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-400/10 to-orange-400/10 px-4 py-3 text-xs text-amber-100/90 backdrop-blur-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 text-amber-200 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-amber-100">Risk Disclaimer</div>
                  <div className="mt-0.5 text-amber-100/80">{DISCLAIMER}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {route === 'docs' ? (
          <DocsPage disclaimer={DISCLAIMER} onBack={() => (window.location.hash = '#/')} />
        ) : (
          <>
            {/* Control Panel */}
            <div className="mb-6">
              <GlassCard>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-400/30">
                      <BarChart3 className="text-cyan-300" size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Analysis Control</h2>
                      <p className="text-sm text-white/60">Run comprehensive portfolio analysis</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5">
                      <input
                        type="checkbox"
                        id="auto-refresh"
                        checked={autoRefresh}
                        onChange={(e) => setAutoRefresh(e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="auto-refresh" className="text-sm text-white/80 cursor-pointer">
                        Auto-refresh
                      </label>
                    </div>

                    <button
                      onClick={resetWorkspace}
                      className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white/80 inline-flex items-center gap-2 transition-all hover:scale-105"
                      type="button"
                      disabled={loading}
                    >
                      <Trash2 size={16} />
                      Reset
                    </button>

                    <button
                      onClick={analyzePortfolio}
                      disabled={!canAnalyze}
                      className="group relative px-6 py-2.5 rounded-xl font-semibold text-sm border border-cyan-400/40 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-105 shadow-lg shadow-cyan-500/20"
                      type="button"
                    >
                      <span className="absolute -inset-px rounded-xl bg-gradient-to-r from-cyan-400/30 via-blue-500/25 to-purple-400/30 opacity-0 blur-lg transition-opacity group-hover:opacity-100" />
                      <span className="relative inline-flex items-center gap-2">
                        {loading ? (
                          <RefreshCcw className="animate-spin" size={16} />
                        ) : (
                          <Sparkles size={16} className="text-cyan-300" />
                        )}
                        {loading ? 'Analyzing...' : 'Run Analysis'}
                      </span>
                    </button>
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* Holdings Section */}
            <CollapsibleSection
              title="Portfolio Holdings"
              subtitle="Manage your positions and shares"
              icon={<PieChart size={20} />}
              isExpanded={expandedSection === 'holdings'}
              onToggle={() => toggleSection('holdings')}
              defaultExpanded={true}
            >
              <div className="space-y-4">
                {holdings.length === 0 ? (
                  <EmptyState title="No holdings" subtitle="Add a ticker and shares to build a portfolio." />
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden backdrop-blur-sm">
                    <div className="grid grid-cols-[1fr_160px_44px] gap-0 px-4 py-3 text-xs font-medium text-white/60 border-b border-white/10 bg-white/5">
                      <div>Ticker</div>
                      <div className="text-right">Shares</div>
                      <div className="text-right">&nbsp;</div>
                    </div>

                    <div className="divide-y divide-white/10">
                      {holdings
                        .slice()
                        .sort((a, b) => a.ticker.localeCompare(b.ticker))
                        .map((h, idx) => {
                          const isEditing = Object.prototype.hasOwnProperty.call(editing, h.ticker);

                          return (
                            <div
                              key={h.ticker}
                              className="grid grid-cols-[1fr_160px_44px] items-center px-4 py-3.5 hover:bg-white/[0.03] transition-colors"
                              style={{ animationDelay: `${idx * 50}ms` }}
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-semibold text-sm px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-400/20 text-cyan-100 shadow-sm">
                                  {h.ticker}
                                </span>
                              </div>

                              <div className="text-right">
                                {!isEditing ? (
                                  <button
                                    type="button"
                                    onClick={() => startEdit(h.ticker, h.shares)}
                                    className="inline-flex items-center justify-end gap-2 w-full text-sm text-white/80 hover:text-white transition-colors"
                                    aria-label={`Edit shares for ${h.ticker}`}
                                    disabled={loading}
                                  >
                                    <span className="font-medium">{h.shares.toLocaleString()}</span>
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
                                      className="w-28 rounded-xl bg-white/[0.06] border border-white/20 px-3 py-2 text-sm outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20 text-right font-medium"
                                      inputMode="decimal"
                                      autoComplete="off"
                                      aria-label={`Shares for ${h.ticker}`}
                                      disabled={loading}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => commitEdit(h.ticker)}
                                      className="rounded-xl p-2 border border-emerald-400/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                                      aria-label="Save"
                                      disabled={loading}
                                    >
                                      <Check size={16} className="text-emerald-300" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => cancelEdit(h.ticker)}
                                      className="rounded-xl p-2 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
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
                                  className="rounded-xl p-2 text-white/70 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all"
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

                    <div className="px-4 py-3 text-xs text-white/60 border-t border-white/10 bg-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                        <span>Sorted A→Z</span>
                      </div>
                      <div className="font-medium text-white/75">{totalShares.toLocaleString()} total shares</div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-3">
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      placeholder="Ticker (AAPL, BRK.B, BTC-USD)"
                      value={newTicker}
                      onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                      onKeyDown={onKeyDownAdd}
                      className="w-full rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3 text-sm outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20 transition-all"
                      disabled={loading}
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
                      className="w-full rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3 text-sm outline-none focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20 transition-all"
                      disabled={loading}
                    />
                  </div>

                  <button
                    onClick={addHolding}
                    className="group relative rounded-xl px-5 py-3 font-semibold text-sm border border-cyan-400/30 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 transition-all hover:scale-105"
                    type="button"
                    disabled={loading}
                  >
                    <span className="absolute -inset-px rounded-xl bg-gradient-to-r from-cyan-400/20 to-blue-400/20 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
                    <span className="relative inline-flex items-center gap-2">
                      <Plus size={18} />
                      Add
                    </span>
                  </button>
                </div>
              </div>
            </CollapsibleSection>

            {error && (
              <div className="mb-6 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/10 to-orange-500/10 px-4 py-3 text-sm text-red-100 backdrop-blur-sm animate-in slide-in-from-top">
                <div className="flex gap-2 items-start">
                  <ShieldAlert className="mt-0.5 text-red-300 shrink-0" size={18} />
                  <div className="min-w-0">
                    <div className="font-semibold text-red-200">Request failed</div>
                    <div className="text-red-100/90 mt-0.5 break-words">{error}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Analysis Results */}
            {(metrics || loading) && (
              <CollapsibleSection
                title="Analysis Results"
                subtitle="Comprehensive risk metrics and statistics"
                icon={<Activity size={20} />}
                isExpanded={expandedSection === 'results'}
                defaultExpanded={true}
                onToggle={() => toggleSection('results')}
              >
                {loading ? (
                  <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-8 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                        <RefreshCcw className="animate-spin text-cyan-300" size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-lg">Running comprehensive analysis</div>
                        <div className="text-sm text-white/60 mt-1">
                          Computing VaR, correlations, stress tests, and risk metrics…
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 h-2.5 w-full overflow-hidden rounded-full bg-white/5 border border-white/10">
                      <div className="h-full w-3/4 animate-pulse bg-gradient-to-r from-cyan-500/40 via-blue-500/40 to-purple-500/40 rounded-full" />
                    </div>
                  </div>
                ) : metrics ? (
                  <div className="space-y-6">
                    {/* Tab Navigation */}
                    <div className="flex gap-2 p-1 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-x-auto">
                      {[
                        { id: 'overview', label: 'Overview', icon: <BarChart3 size={16} /> },
                        { id: 'montecarlo', label: 'Monte Carlo', icon: <Activity size={16} /> },
                        { id: 'correlation', label: 'Correlation', icon: <Target size={16} /> },
                        { id: 'stress', label: 'Stress Test', icon: <ShieldAlert size={16} /> },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as any)}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                            activeTab === tab.id
                              ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 text-cyan-100 shadow-lg'
                              : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                          }`}
                        >
                          {tab.icon}
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'overview' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <MetricCard
                          label="Portfolio Value"
                          value={formatCurrency(metrics.portfolio_value)}
                          accent="cyan"
                          hint="Based on last available close × shares"
                          icon={<DollarSign size={18} />}
                        />
                        <MetricCard
                          label="Expected Return"
                          value={formatPct(metrics.expected_return)}
                          accent="green"
                          hint="Annualized mean return (252 days)"
                          icon={<TrendingUp size={18} />}
                        />
                        <MetricCard
                          label="Volatility"
                          value={formatPct(metrics.volatility)}
                          accent="yellow"
                          hint="Annualized standard deviation"
                          icon={<Activity size={18} />}
                        />
                        <MetricCard
                          label="Sharpe Ratio"
                          value={Number.isFinite(metrics.sharpe_ratio) ? metrics.sharpe_ratio.toFixed(3) : '—'}
                          accent="purple"
                          hint="(Return − rf) / Volatility"
                          icon={<Target size={18} />}
                        />
                        <MetricCard
                          label="95% VaR (1-day)"
                          value={formatCurrency(metrics.var_95)}
                          accent="red"
                          hint="Worst expected 1-day loss at 95%"
                          icon={<TrendingDown size={18} />}
                        />
                        <MetricCard
                          label="CVaR"
                          value={formatCurrency(metrics.cvar_95)}
                          accent="red"
                          hint="Average loss beyond VaR threshold"
                          icon={<ShieldAlert size={18} />}
                        />
                        <MetricCard
                          label="Max Drawdown"
                          value={formatPct(metrics.max_drawdown)}
                          accent="orange"
                          hint="Peak-to-trough decline"
                          icon={<LineChart size={18} />}
                        />
                      </div>
                    )}

                    {activeTab === 'montecarlo' && monteCarloData && (
                      <MonteCarloView data={monteCarloData} portfolioValue={metrics.portfolio_value} />
                    )}

                    {activeTab === 'correlation' && correlationData && (
                      <CorrelationView data={correlationData} />
                    )}

                    {activeTab === 'stress' && stressTestData && <StressTestView data={stressTestData} />}

                    {/* Run Details */}
                    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 backdrop-blur-sm">
                      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                        <div className="flex items-center gap-2">
                          <Info size={16} className="text-cyan-400" />
                          <span className="font-semibold text-white/90">Run Details</span>
                        </div>
                        <div className="text-xs text-white/50 flex items-center gap-2">
                          <Zap size={14} className="text-yellow-400" />
                          {runMeta}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="text-white/60 mb-1.5">Lookback Period</div>
                          <div className="text-lg font-semibold text-white/90">
                            {settings.lookback_days}
                            <span className="text-sm font-normal text-white/60 ml-1">days</span>
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="text-white/60 mb-1.5">Risk-free Rate</div>
                          <div className="text-lg font-semibold text-white/90">
                            {(settings.risk_free_rate * 100).toFixed(2)}%
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="text-white/60 mb-1.5">Holdings</div>
                          <div className="text-lg font-semibold text-white/90">
                            {holdingsSummary.unique}
                            <span className="text-sm font-normal text-white/60 ml-1">tickers</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </CollapsibleSection>
            )}

            {/* Interpretation Guide */}
            {metrics && (
              <CollapsibleSection
                title="Interpretation Guide"
                subtitle="Understanding the metrics"
                icon={<Info size={20} />}
                isExpanded={expandedSection === 'guide'}
                onToggle={() => toggleSection('guide')}
                defaultExpanded={false}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <InfoTile
                    title="Value at Risk (VaR)"
                    body="Maximum expected loss at 95% confidence over 1 trading day. Lower is better."
                    accent="cyan"
                  />
                  <InfoTile
                    title="Conditional VaR (CVaR)"
                    body="Average loss in the worst 5% of outcomes. Shows tail risk severity."
                    accent="red"
                  />
                  <InfoTile
                    title="Volatility"
                    body="Annualized standard deviation of returns. Measures price fluctuation risk."
                    accent="yellow"
                  />
                  <InfoTile
                    title="Sharpe Ratio"
                    body="Risk-adjusted return. Higher is better. Above 1.0 is generally good."
                    accent="purple"
                  />
                  <InfoTile
                    title="Max Drawdown"
                    body="Largest peak-to-trough decline historically. Shows worst-case scenario."
                    accent="orange"
                  />
                  <InfoTile
                    title="Expected Return"
                    body="Annualized mean return based on historical data. Past ≠ future."
                    accent="green"
                  />
                </div>
              </CollapsibleSection>
            )}
          </>
        )}
      </main>

      {settingsOpen && (
        <Modal onClose={() => setSettingsOpen(false)} title="Analysis Settings">
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 backdrop-blur-sm">
              <div className="text-sm font-semibold mb-1">Lookback Window</div>
              <div className="text-xs text-white/60 mb-4">Trading days for return calculation (30–1260)</div>
              <div className="flex items-center gap-4">
                <div className="flex-1 py-2">
                  <input
                    type="range"
                    min={30}
                    max={1260}
                    step={1}
                    value={settings.lookback_days}
                    onChange={(e) => setSettings((s) => ({ ...s, lookback_days: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                <div className="w-20 text-right text-sm font-mono text-white/90 bg-white/5 px-3 py-2 rounded-lg border border-white/10">
                  {settings.lookback_days}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 backdrop-blur-sm">
              <div className="text-sm font-semibold mb-1">Risk-free Rate</div>
              <div className="text-xs text-white/60 mb-4">For Sharpe ratio calculation (0%–20%)</div>
              <div className="flex items-center gap-4">
                <div className="flex-1 py-2">
                  <input
                    type="range"
                    min={0}
                    max={0.2}
                    step={0.0005}
                    value={settings.risk_free_rate}
                    onChange={(e) => setSettings((s) => ({ ...s, risk_free_rate: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                <div className="w-20 text-right text-sm font-mono text-white/90 bg-white/5 px-3 py-2 rounded-lg border border-white/10">
                  {(settings.risk_free_rate * 100).toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 backdrop-blur-sm">
              <div className="text-sm font-semibold mb-1">Auto-refresh Interval</div>
              <div className="text-xs text-white/60 mb-4">Automatic analysis frequency (1–60 minutes)</div>
              <div className="flex items-center gap-4">
                <div className="flex-1 py-2">
                  <input
                    type="range"
                    min={60000}
                    max={3600000}
                    step={60000}
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div className="w-20 text-right text-sm font-mono text-white/90 bg-white/5 px-3 py-2 rounded-lg border border-white/10">
                  {Math.floor(refreshInterval / 60000)}m
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-400/10 to-orange-400/10 p-4 text-sm text-amber-100/90">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 text-amber-200 shrink-0" />
                <div>
                  <div className="font-semibold text-amber-100">Use at your own risk</div>
                  <div className="mt-1 text-amber-100/80">{DISCLAIMER}</div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                className="px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white/80 transition-all"
                onClick={() => setSettings({ lookback_days: 252, risk_free_rate: 0.04 })}
              >
                Reset Defaults
              </button>
              <button
                type="button"
                className="px-5 py-2.5 rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-sm font-semibold transition-all"
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

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div
        aria-hidden
        className="absolute -inset-px rounded-2xl bg-gradient-to-r from-cyan-400/10 via-blue-500/10 to-purple-400/10 blur-xl"
      />
      <div className="relative rounded-2xl border border-white/10 bg-black/40 backdrop-blur-2xl p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        {children}
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  icon,
  children,
  isExpanded,
  defaultExpanded,
  onToggle,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isExpanded?: boolean;
  onToggle: () => void;
  defaultExpanded: boolean;
}) {
  const [isExpandedState, setIsExpandedState] = useState(defaultExpanded);
  return (
    <GlassCard className="mb-6">
      <button
        onClick={() => {
          setIsExpandedState(!isExpandedState);
          onToggle();
        }}
        className="w-full flex items-center justify-between gap-4 text-left group"
        type="button"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 group-hover:scale-110 transition-transform">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">{title}</h2>
            <p className="text-sm text-white/60 truncate">{subtitle}</p>
          </div>
        </div>
        <div className="shrink-0 p-2 rounded-xl bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
          {isExpandedState ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>

      {isExpandedState && <div className="mt-6 animate-in slide-in-from-top duration-300">{children}</div>}
    </GlassCard>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-10 text-center backdrop-blur-sm">
      <div className="mx-auto mb-4 h-14 w-14 rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 flex items-center justify-center">
        <BarChart3 size={24} className="text-cyan-300" />
      </div>
      <div className="font-semibold text-lg">{title}</div>
      <div className="text-sm text-white/60 mt-2">{subtitle}</div>
    </div>
  );
}

function Badge({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 max-w-[260px] backdrop-blur-sm">
      {icon}
      <span className="truncate font-medium">{label}</span>
    </div>
  );
}

function accentToClasses(accent: string) {
  const configs = {
    cyan: { ring: 'ring-cyan-400/15', border: 'border-cyan-400/25', glow: 'from-cyan-400/15 to-cyan-600/10', text: 'text-cyan-200' },
    green: { ring: 'ring-emerald-400/15', border: 'border-emerald-400/25', glow: 'from-emerald-400/15 to-emerald-600/10', text: 'text-emerald-200' },
    yellow: { ring: 'ring-yellow-400/15', border: 'border-yellow-400/25', glow: 'from-yellow-400/15 to-yellow-600/10', text: 'text-yellow-200' },
    purple: { ring: 'ring-purple-400/15', border: 'border-purple-400/25', glow: 'from-purple-400/15 to-purple-600/10', text: 'text-purple-200' },
    red: { ring: 'ring-red-400/15', border: 'border-red-400/25', glow: 'from-red-400/15 to-red-600/10', text: 'text-red-200' },
    orange: { ring: 'ring-orange-400/15', border: 'border-orange-400/25', glow: 'from-orange-400/15 to-orange-600/10', text: 'text-orange-200' },
  };
  return configs[accent as keyof typeof configs] || { ring: 'ring-white/10', border: 'border-white/10', glow: 'from-white/5 to-white/5', text: 'text-white' };
}

function MetricCard({
  label,
  value,
  accent,
  hint,
  icon,
}: {
  label: string;
  value: string;
  accent: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  const c = accentToClasses(accent);
  return (
    <div className={`relative rounded-2xl border ${c.border} bg-gradient-to-br ${c.glow} p-5 ring-1 ${c.ring} backdrop-blur-sm transition-all hover:scale-[1.02]`}>
      <div aria-hidden className={`absolute -inset-px rounded-2xl bg-gradient-to-br ${c.glow} blur-xl opacity-50`} />
      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="text-xs font-medium text-white/70 uppercase tracking-wider">{label}</div>
          {icon && <div className={`${c.text} opacity-60`}>{icon}</div>}
        </div>
        <div className={`text-3xl font-bold tracking-tight ${c.text}`}>{value}</div>
        {hint && <div className="text-xs text-white/50 mt-2">{hint}</div>}
      </div>
    </div>
  );
}

function InfoTile({ title, body, accent }: { title: string; body: string; accent: string }) {
  const c = accentToClasses(accent);
  return (
    <div className={`relative rounded-2xl border ${c.border} bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 ring-1 ${c.ring} backdrop-blur-sm hover:scale-[1.02] transition-transform`}>
      <div aria-hidden className={`absolute -inset-px rounded-2xl bg-gradient-to-br ${c.glow} blur-xl opacity-40`} />
      <div className="relative">
        <div className={`font-semibold mb-2 ${c.text}`}>{title}</div>
        <div className="text-white/70 text-sm leading-relaxed">{body}</div>
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
    <div className="fixed inset-0 z-50 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300" 
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Content wrapper - pointer-events-none to allow backdrop clicks */}
      <div className="absolute inset-0 flex items-center justify-center p-5 pointer-events-none">
        {/* Modal content - pointer-events-auto to enable interactions */}
        <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto pointer-events-auto animate-in slide-in-from-bottom duration-300">
          <div
            aria-hidden
            className="absolute -inset-px rounded-2xl bg-gradient-to-r from-cyan-400/20 via-blue-500/20 to-purple-400/20 blur-2xl animate-pulse"
            style={{ animationDuration: '3s' }}
          />
          <div className="relative rounded-2xl border border-white/20 bg-black/90 backdrop-blur-2xl p-6 shadow-2xl transition-all duration-300">
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <div className="text-lg font-semibold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-blue-300">
                  {title}
                </div>
                <div className="text-xs text-white/55 mt-1 flex items-center gap-2">
                  <kbd className="px-2 py-0.5 text-[10px] rounded bg-white/10 border border-white/20">Esc</kbd>
                  or click outside to close
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-2.5 transition-all hover:scale-110 hover:rotate-90 duration-300"
                aria-label="Close"
              >
                <X size={20} className="text-white/80" />
              </button>
            </div>
            <div>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonteCarloView({ data, portfolioValue }: { data: MonteCarloResult; portfolioValue: number }) {
  const distribution = useMemo(() => {
    const sorted = [...data.distribution].sort((a, b) => a - b);
    const bins = 50;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const binSize = (max - min) / bins;
    const histogram = new Array(bins).fill(0);

    sorted.forEach((val) => {
      const binIndex = Math.min(Math.floor((val - min) / binSize), bins - 1);
      histogram[binIndex]++;
    });

    return histogram.map((count, i) => ({
      x: min + i * binSize,
      y: count,
    }));
  }, [data.distribution]);

  const maxY = Math.max(...distribution.map((d) => d.y));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Simulations"
          value={data.simulations.toLocaleString()}
          accent="cyan"
          hint={`${data.confidence_level * 100}% confidence`}
          icon={<Activity size={18} />}
        />
        <MetricCard
          label="VaR (Absolute)"
          value={formatCurrency(data.var)}
          accent="red"
          hint="95% worst-case 1-day loss"
          icon={<TrendingDown size={18} />}
        />
        <MetricCard
          label="CVaR (Absolute)"
          value={formatCurrency(data.cvar)}
          accent="orange"
          hint="Expected loss beyond VaR"
          icon={<ShieldAlert size={18} />}
        />
        <MetricCard
          label="VaR (%)"
          value={formatPct((data.var / portfolioValue) * 100)}
          accent="purple"
          hint="As % of portfolio value"
          icon={<Target size={18} />}
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 backdrop-blur-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <LineChart className="text-cyan-400" size={18} />
          Return Distribution
        </h3>
        <div className="h-64 flex items-end gap-1">
          {distribution.map((bin, i) => (
            <div
              key={i}
              className="flex-1 bg-gradient-to-t from-cyan-500/60 to-blue-500/40 rounded-t transition-all hover:from-cyan-500/80 hover:to-blue-500/60"
              style={{ height: `${(bin.y / maxY) * 100}%` }}
              title={`Return: ${formatPct(bin.x * 100)}, Count: ${bin.y}`}
            />
          ))}
        </div>
        <div className="mt-4 text-xs text-white/60 text-center">
          Histogram of {data.simulations.toLocaleString()} simulated portfolio returns
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 backdrop-blur-sm">
        <h3 className="font-semibold mb-4">Percentile Distribution</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Object.entries(data.percentiles)
            .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
            .map(([key, val]) => (
              <div key={key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
                <div className="text-xs text-white/60 mb-1">{key}</div>
                <div className="text-sm font-semibold text-white/90">{formatPct(val)}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function CorrelationView({ data }: { data: CorrelationMatrix }) {
  const getCorrelationColor = (val: number) => {
    const abs = Math.abs(val);
    if (abs > 0.8) return val > 0 ? 'bg-red-500/70' : 'bg-blue-500/70';
    if (abs > 0.6) return val > 0 ? 'bg-red-500/50' : 'bg-blue-500/50';
    if (abs > 0.4) return val > 0 ? 'bg-red-500/30' : 'bg-blue-500/30';
    if (abs > 0.2) return val > 0 ? 'bg-red-500/15' : 'bg-blue-500/15';
    return 'bg-white/5';
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 backdrop-blur-sm overflow-x-auto">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Target className="text-purple-400" size={18} />
          Correlation Matrix
        </h3>
        <div className="min-w-max">
          <div className="flex gap-1">
            <div className="w-20" />
            {data.tickers.map((ticker) => (
              <div key={ticker} className="w-20 text-xs text-center font-mono text-white/70 pb-2">
                {ticker}
              </div>
            ))}
          </div>
          {data.matrix.map((row, i) => (
            <div key={i} className="flex gap-1 mb-1">
              <div className="w-20 text-xs font-mono text-white/70 flex items-center">{data.tickers[i]}</div>
              {row.map((val, j) => (
                <div
                  key={j}
                  className={`w-20 h-12 rounded flex items-center justify-center text-xs font-semibold ${getCorrelationColor(val)}`}
                  title={`${data.tickers[i]} vs ${data.tickers[j]}: ${val.toFixed(3)}`}
                >
                  {val.toFixed(2)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 backdrop-blur-sm">
        <h3 className="font-semibold mb-3">Color Legend</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-red-500/70" />
            <span>Strong Positive (&gt;0.8)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-red-500/30" />
            <span>Moderate Positive (0.4-0.8)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-white/5" />
            <span>Weak (&lt;0.2)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-500/30" />
            <span>Moderate Negative (-0.4 to -0.8)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-500/70" />
            <span>Strong Negative (&lt;-0.8)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StressTestView({ data }: { data: StressTestResult }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold flex items-center gap-2">
            <ShieldAlert className="text-red-400" size={18} />
            Historical Stress Scenarios
          </h3>
          <div className="text-sm">
            <span className="text-white/60">Current Value: </span>
            <span className="font-semibold">{formatCurrency(data.current_value)}</span>
          </div>
        </div>

        <div className="space-y-3">
          {data.scenarios.map((scenario, i) => {
            const lossPercent = (scenario.result / data.current_value) * 100;
            return (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1">
                    <div className="font-semibold text-white/90">{scenario.name}</div>
                    <div className="text-xs text-white/60 mt-1">{scenario.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-red-300">{formatCurrency(scenario.result)}</div>
                    <div className="text-xs text-red-400/80">{formatPct(lossPercent)} loss</div>
                  </div>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, Math.abs(lossPercent))}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-400/10 to-orange-400/10 p-4 text-sm text-amber-100/90">
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 text-amber-200 shrink-0" />
          <div>
            <div className="font-semibold text-amber-100">Stress Test Note</div>
            <div className="mt-1 text-amber-100/80">
              These scenarios apply historical market shocks to your current portfolio. Actual losses may vary based on
              position changes and market conditions.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocsPage({ disclaimer, onBack }: { disclaimer: string; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-400/30">
              <BookOpen className="text-cyan-300" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Documentation</h2>
              <p className="text-sm text-white/60">Methods, assumptions, and limitations</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-white/80 transition-all"
          >
            Back to App
          </button>
        </div>

        <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-400/10 to-orange-400/10 px-4 py-4 text-sm text-amber-100/90">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 text-amber-200 shrink-0" />
            <div>
              <div className="font-semibold text-amber-100">Disclaimer</div>
              <div className="mt-1 text-amber-100/80">{disclaimer}</div>
            </div>
          </div>
        </div>
      </GlassCard>

      {[
        {
          title: 'Data Sources',
          content: [
            'Quotes are delayed and may be incomplete. Portfolio value is computed from the latest available close per ticker multiplied by shares, then summed across holdings.',
            'If the data source is missing bars (holidays, delistings, symbol mismatches, outages), computed returns and all downstream metrics can drift or fail.',
          ],
        },
        {
          title: 'Returns & Annualization',
          content: [
            'Daily returns are computed as simple percent change: r(t) = P(t) / P(t-1) − 1 over the configured lookback window.',
            'Expected return is the mean of daily returns, annualized using 252 trading days: E[R] ≈ mean(r) × 252.',
            'Volatility is the standard deviation of daily returns, annualized: σ ≈ std(r) × √252.',
          ],
        },
        {
          title: 'Position Weights',
          content: [
            'Position weights are derived from market value: wᵢ = (priceᵢ × sharesᵢ) / portfolio_value.',
            'Any error in prices (stale close, corporate actions, symbol mapping) directly changes weights and therefore all portfolio-level metrics.',
          ],
        },
        {
          title: 'Sharpe Ratio',
          content: [
            'Sharpe is computed as (annualized_return − risk_free_rate) / annualized_volatility.',
            'This is sensitive to the risk-free rate, volatility estimate, and the lookback window. A high Sharpe here is not a guarantee of future performance.',
          ],
        },
        {
          title: 'VaR / CVaR via Monte Carlo',
          content: [
            'The simulation samples portfolio returns from a multivariate normal model using the empirical mean vector and covariance matrix of daily returns.',
            'For each simulation, a 1-day portfolio return is generated and mapped to a simulated portfolio value. VaR at 95% is the 5th percentile loss; CVaR is the average loss beyond that percentile.',
            'Normality is a strong assumption: real returns are fat-tailed, skewed, regime-dependent, and correlations can spike in stress. Treat VaR/CVaR as rough, not precise.',
          ],
        },
        {
          title: 'Max Drawdown',
          content: [
            'Max drawdown is computed from the cumulative product of portfolio returns over the lookback window, tracking the worst peak-to-trough percentage decline.',
            'It is entirely backward-looking and depends on the same historical window and data quality.',
          ],
        },
        {
          title: 'Correlation Matrix',
          content: [
            'Shows pairwise correlations between asset returns over the lookback period.',
            'Values range from -1 (perfect negative correlation) to +1 (perfect positive correlation).',
            'High correlations (>0.8) indicate assets tend to move together, reducing diversification benefits.',
          ],
        },
        {
          title: 'Stress Testing',
          content: [
            'Applies historical market shock scenarios to estimate potential portfolio losses.',
            'Scenarios are based on actual historical events (2008 Financial Crisis, COVID-19, etc.).',
            'Results show estimated loss if similar market conditions occurred with your current holdings.',
          ],
        },
        {
          title: 'Key Limitations',
          content: [
            'Not investment advice. Not a trading signal. Not a substitute for professional analysis.',
            'Delayed/partial data can materially change results.',
            'Model risk: historical mean/covariance and normal simulations can understate tail risk.',
            'No transaction costs, taxes, liquidity, borrowing, or short constraints are modeled.',
            'Corporate actions, splits, symbol changes, and delistings can break inputs.',
          ],
        },
      ].map((section, i) => (
        <GlassCard key={i}>
          <h3 className="font-semibold text-lg mb-3">{section.title}</h3>
          <div className="text-sm text-white/70 space-y-2.5">
            {section.content.map((para, j) => (
              <p key={j} className="leading-relaxed">
                {para}
              </p>
            ))}
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
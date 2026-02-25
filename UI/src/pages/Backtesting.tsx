import { useState, useCallback, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Line, Cell,
} from 'recharts';
import { usePortfolio } from '@/context/PortfolioContext';
import { api } from '@/services/api';
import {
  History, Play, Loader2, TrendingUp, TrendingDown, BarChart3, ShieldAlert,
  Calendar, DollarSign, RefreshCw, Target,
  ChevronDown, ChevronRight, AlertTriangle,
} from 'lucide-react';

/* ─── Benchmark options (same as Analytics) ─── */
const BENCHMARK_OPTIONS = [
  { value: 'SPY', label: 'S&P 500 (SPY)' },
  { value: 'QQQ', label: 'NASDAQ 100 (QQQ)' },
  { value: 'IWM', label: 'Russell 2000 (IWM)' },
  { value: 'VOO', label: 'Vanguard S&P 500 (VOO)' },
  { value: 'VTI', label: 'Total Stock Market (VTI)' },
  { value: 'BND', label: 'Total Bond (BND)' },
  { value: 'GLD', label: 'Gold (GLD)' },
  { value: '^GSPC', label: 'S&P 500 Index' },
];

const REBALANCE_OPTIONS = [
  { value: 'none', label: 'No Rebalance' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semi-annual', label: 'Semi-Annual' },
  { value: 'annual', label: 'Annual' },
];

const PRESET_RANGES = [
  { label: '1Y', years: 1 },
  { label: '2Y', years: 2 },
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
  { label: '10Y', years: 10 },
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Section = 'overview' | 'performance' | 'risk' | 'attribution' | 'trades';

const SECTION_TABS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'risk', label: 'Risk & Drawdown' },
  { id: 'attribution', label: 'Attribution' },
  { id: 'trades', label: 'Trade Log' },
];

/* ─────────────── helpers ─────────────── */


function heatColor(v: number): string {
  if (v >= 5) return 'bg-emerald-500 text-white';
  if (v >= 2) return 'bg-emerald-400/70 text-white';
  if (v >= 0.5) return 'bg-emerald-300/40 text-emerald-200';
  if (v >= -0.5) return 'bg-slate-700 text-slate-300';
  if (v >= -2) return 'bg-red-300/40 text-red-200';
  if (v >= -5) return 'bg-red-400/70 text-white';
  return 'bg-red-500 text-white';
}

/* ═════════════════════════════════════════════════════
   MAIN COMPONENT
   ═════════════════════════════════════════════════════ */
export function Backtesting() {
  const { activePortfolio: pf, activePortfolioId } = usePortfolio();

  /* ── Config state ── */
  const today = new Date();
  const twoYearsAgo = new Date(today.getFullYear() - 2, today.getMonth(), today.getDate());
  const [startDate, setStartDate] = useState(twoYearsAgo.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [capital, setCapital] = useState(10000);
  const [benchmark, setBenchmark] = useState('SPY');
  const [customBenchmark, setCustomBenchmark] = useState('');
  const [rebalance, setRebalance] = useState('none');

  /* ── Result state ── */
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [tradesExpanded, setTradesExpanded] = useState<number | null>(null);

  const effectiveBenchmark = customBenchmark.trim() || benchmark;

  /* ── Run backtest ── */
  const runBacktest = useCallback(async () => {
    if (!activePortfolioId) return;
    const numId = parseInt(activePortfolioId);
    if (isNaN(numId)) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api.portfolios.runBacktest(numId, {
        start_date: startDate,
        end_date: endDate,
        initial_capital: capital,
        benchmark: effectiveBenchmark,
        rebalance_freq: rebalance,
      });
      setResult(data);
      setSection('overview');
    } catch (e: any) {
      setError(e.message || 'Backtest failed');
    } finally {
      setLoading(false);
    }
  }, [activePortfolioId, startDate, endDate, capital, effectiveBenchmark, rebalance]);

  /* ── Preset range helpers ── */
  const applyPreset = (years: number) => {
    const end = new Date();
    const start = new Date(end.getFullYear() - years, end.getMonth(), end.getDate());
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  if (!pf) return <div className="text-slate-400 p-8">Select a portfolio first.</div>;

  const currSym = pf.summary.currency === 'EUR' ? '€' : '$';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <History className="w-7 h-7 text-blue-400" /> Backtesting
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Test your portfolio's allocation against historical market data
        </p>
      </div>

      {/* Configuration Panel */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Backtest Configuration</h2>
          <button
            onClick={runBacktest}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-600/20"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {loading ? 'Running...' : 'Run Backtest'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Date range */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5 font-medium">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5 font-medium">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:border-blue-500" />
          </div>
          {/* Capital */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5 font-medium">Initial Capital ({currSym})</label>
            <input type="number" value={capital} onChange={e => setCapital(Math.max(100, Number(e.target.value) || 10000))} min={100}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 font-mono focus:outline-none focus:border-blue-500" />
          </div>
          {/* Benchmark */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5 font-medium">Benchmark</label>
            <div className="flex gap-2">
              <select value={benchmark} onChange={e => { setBenchmark(e.target.value); setCustomBenchmark(''); }}
                className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-2 py-2 focus:outline-none focus:border-blue-500">
                {BENCHMARK_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
              <input type="text" placeholder="or ticker" value={customBenchmark}
                onChange={e => { setCustomBenchmark(e.target.value.toUpperCase()); if (e.target.value) setBenchmark(''); }}
                className="w-24 bg-slate-900/50 border border-slate-700 rounded-lg text-xs text-white px-2 py-2 font-mono placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
            </div>
          </div>
        </div>

        {/* Bottom row: presets + rebalance */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Quick:</span>
            {PRESET_RANGES.map(p => (
              <button key={p.label} onClick={() => applyPreset(p.years)}
                className="px-2.5 py-1 text-xs text-slate-400 hover:text-white bg-slate-900/50 border border-slate-700 rounded-md hover:border-slate-600 transition-all">
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs text-slate-400">Rebalance:</span>
            <div className="flex gap-1 bg-slate-900/50 rounded-lg p-0.5">
              {REBALANCE_OPTIONS.map(r => (
                <button key={r.value} onClick={() => setRebalance(r.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${rebalance === r.value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-sm text-red-300">{error}</div>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Section tabs */}
          <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-0.5 w-fit">
            {SECTION_TABS.map(t => (
              <button key={t.id} onClick={() => setSection(t.id)}
                className={`px-4 py-2 text-xs font-medium rounded-md transition-all ${section === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {section === 'overview' && <OverviewSection result={result} currSym={currSym} />}
          {section === 'performance' && <PerformanceSection result={result} />}
          {section === 'risk' && <RiskSection result={result} />}
          {section === 'attribution' && <AttributionSection result={result} />}
          {section === 'trades' && <TradesSection result={result} currSym={currSym} expanded={tradesExpanded} setExpanded={setTradesExpanded} />}
        </>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-10 text-center">
          <History className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Configure & Run</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Set the date range, initial capital, and rebalancing strategy above, then click <strong>Run Backtest</strong> to
            see how your portfolio's current allocation would have performed historically.
          </p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   1. OVERVIEW
   ═══════════════════════════════════════════════════════════ */
function OverviewSection({ result, currSym }: { result: any; currSym: string }) {
  const s = result.summary;
  const gain = s.totalReturn >= 0;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={DollarSign} color="text-emerald-400 bg-emerald-500/10" label="Final Value" value={`${currSym}${Math.round(s.finalValue).toLocaleString()}`} sub={`from ${currSym}${Math.round(s.initialCapital).toLocaleString()}`} />
        <KpiCard icon={gain ? TrendingUp : TrendingDown} color={gain ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'} label="Total Return" value={`${s.totalReturn > 0 ? '+' : ''}${s.totalReturn}%`} sub={`CAGR: ${s.cagr}%`} />
        <KpiCard icon={BarChart3} color="text-blue-400 bg-blue-500/10" label="Sharpe Ratio" value={s.sharpeRatio.toFixed(2)} sub={`Sortino: ${s.sortinoRatio.toFixed(2)}`} />
        <KpiCard icon={ShieldAlert} color="text-red-400 bg-red-500/10" label="Max Drawdown" value={`${s.maxDrawdown}%`} sub={`Vol: ${s.volatility}%`} />
        <KpiCard icon={Target} color="text-blue-400 bg-blue-500/10" label="Win Rate" value={`${s.winRate}%`} sub={`Best: +${s.bestDay}%`} />
        <KpiCard icon={RefreshCw} color="text-violet-400 bg-violet-500/10" label="Rebalances" value={String(s.rebalanceEvents)} sub={`${s.tradingDays} trading days`} />
      </div>

      {/* Equity curve */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Equity Curve — Portfolio vs Benchmark</h3>
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={result.equityCurve.filter((_: any, i: number) => i % 2 === 0)}>
            <defs>
              <linearGradient id="btGradPf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.max(1, Math.floor(result.equityCurve.length / 16))} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${currSym}${(v / 1000).toFixed(1)}k`} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number | undefined) => [`${currSym}${(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]} />
            <Area type="monotone" dataKey="portfolio" name="Portfolio" stroke="#3b82f6" strokeWidth={2} fill="url(#btGradPf)" />
            <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="#6b7280" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Yearly returns */}
      {result.yearlyReturns?.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Yearly Returns (%)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={result.yearlyReturns} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`]} />
              <Bar dataKey="portfolio" name="Portfolio" radius={[4, 4, 0, 0]}>
                {result.yearlyReturns.map((e: any, i: number) => (
                  <Cell key={i} fill={e.portfolio >= 0 ? '#3b82f6' : '#ef4444'} />
                ))}
              </Bar>
              <Bar dataKey="benchmark" name="Benchmark" fill="#4b5563" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Benchmark comparison */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Portfolio vs Benchmark Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-slate-700/50">
              <th className="text-left px-3 py-2 text-slate-500 uppercase">Metric</th>
              <th className="text-right px-3 py-2 text-blue-400 uppercase">Portfolio</th>
              <th className="text-right px-3 py-2 text-slate-400 uppercase">Benchmark</th>
            </tr></thead>
            <tbody>
              <SummaryRow label="Total Return" pf={`${s.totalReturn}%`} bench={`${s.benchmarkTotalReturn}%`} pfBetter={s.totalReturn > s.benchmarkTotalReturn} />
              <SummaryRow label="CAGR" pf={`${s.cagr}%`} bench="—" pfBetter />
              <SummaryRow label="Max Drawdown" pf={`${s.maxDrawdown}%`} bench="—" pfBetter={false} />
              <SummaryRow label="Sharpe Ratio" pf={s.sharpeRatio.toFixed(2)} bench="—" pfBetter />
              <SummaryRow label="Sortino Ratio" pf={s.sortinoRatio.toFixed(2)} bench="—" pfBetter />
              <SummaryRow label="Calmar Ratio" pf={s.calmarRatio.toFixed(2)} bench="—" pfBetter />
              <SummaryRow label="Volatility" pf={`${s.volatility}%`} bench="—" pfBetter={false} />
              <SummaryRow label="Win Rate" pf={`${s.winRate}%`} bench="—" pfBetter />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   2. PERFORMANCE
   ═══════════════════════════════════════════════════════════ */
function PerformanceSection({ result }: { result: any }) {
  /* Monthly heatmap — pivot to  year × month */
  const heatmap = result.monthlyHeatmap ?? [];
  const years = [...new Set(heatmap.map((h: any) => h.year))].sort() as number[];
  const grid = useMemo(() => {
    const map = new Map<string, number>();
    heatmap.forEach((h: any) => map.set(`${h.year}-${h.month}`, h.value));
    return { map, years };
  }, [heatmap, years]);

  const cumData = (result.cumulativeReturn ?? []).filter((_: any, i: number) => i % 2 === 0);

  return (
    <div className="space-y-6">
      {/* Cumulative Return */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Cumulative Return (%)</h3>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={cumData}>
            <defs>
              <linearGradient id="btCumGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.max(1, Math.floor(cumData.length / 8))} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`]} />
            <Area type="monotone" dataKey="portfolio" name="Portfolio" stroke="#3b82f6" strokeWidth={2} fill="url(#btCumGrad)" />
            <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="#6b7280" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Returns Heatmap */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Monthly Returns Heatmap (%)</h3>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr>
                <th className="px-2 py-2 text-slate-500 text-left">Year</th>
                {MONTH_LABELS.map(m => <th key={m} className="px-1.5 py-2 text-slate-500 text-center w-14">{m}</th>)}
                <th className="px-2 py-2 text-slate-500 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {grid.years.map(year => {
                let yearTotal = 1;
                const cells = Array.from({ length: 12 }, (_, mi) => {
                  const v = grid.map.get(`${year}-${mi + 1}`);
                  if (v !== undefined) yearTotal *= (1 + v / 100);
                  return v;
                });
                const yearRet = (yearTotal - 1) * 100;
                return (
                  <tr key={year}>
                    <td className="px-2 py-1.5 text-slate-400 font-mono">{year}</td>
                    {cells.map((v, mi) => (
                      <td key={mi} className="px-1 py-1">
                        {v !== undefined ? (
                          <div className={`w-14 h-7 flex items-center justify-center rounded font-mono text-[10px] font-medium ${heatColor(v)}`}>
                            {v > 0 ? '+' : ''}{v.toFixed(1)}
                          </div>
                        ) : (
                          <div className="w-14 h-7 flex items-center justify-center rounded bg-slate-800 text-slate-600 text-[10px]">—</div>
                        )}
                      </td>
                    ))}
                    <td className="px-1 py-1">
                      <div className={`w-16 h-7 flex items-center justify-center rounded font-mono text-[10px] font-bold ${heatColor(yearRet)}`}>
                        {yearRet > 0 ? '+' : ''}{yearRet.toFixed(1)}%
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-center gap-2 mt-4 text-[10px]">
          <span className="text-slate-500">Large Loss</span>
          <div className="flex gap-0.5">
            {['bg-red-500', 'bg-red-400/70', 'bg-red-300/40', 'bg-slate-700', 'bg-emerald-300/40', 'bg-emerald-400/70', 'bg-emerald-500'].map((c, i) => (
              <div key={i} className={`w-6 h-3 rounded-sm ${c}`} />
            ))}
          </div>
          <span className="text-slate-500">Large Gain</span>
        </div>
      </div>

      {/* Weight evolution (stacked area if rebalanced) */}
      {result.weightHistory?.length > 1 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Weight Evolution Over Time</h3>
          <WeightChart data={result.weightHistory} />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   3. RISK & DRAWDOWN
   ═══════════════════════════════════════════════════════════ */
function RiskSection({ result }: { result: any }) {
  const ddData = (result.drawdownData ?? []).filter((_: any, i: number) => i % 2 === 0);
  const rvData = result.rollingVolatility ?? [];
  const rcData = result.rollingCorrelation ?? [];
  const rm = result.riskMetrics ?? {};

  return (
    <div className="space-y-6">
      {/* Risk metrics table */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Risk Metrics</h3>
          <div className="space-y-0">
            <SectionHeader title="Return Statistics" />
            <MetricRow label="Annualized Return" value={`${rm.annualizedReturn ?? 0}%`} positive={(rm.annualizedReturn ?? 0) >= 0} />
            <MetricRow label="Best Day" value={`+${rm.bestDay ?? 0}%`} positive />
            <MetricRow label="Worst Day" value={`${rm.worstDay ?? 0}%`} positive={false} />
            <MetricRow label="Best Month" value={`+${rm.bestMonth ?? 0}%`} positive />
            <MetricRow label="Worst Month" value={`${rm.worstMonth ?? 0}%`} positive={false} />
            <MetricRow label="Positive Months" value={`${rm.positiveMonths ?? 0}%`} />
            <MetricRow label="Win Rate" value={`${rm.winRate ?? 0}%`} />
            <SectionHeader title="Volatility" />
            <MetricRow label="Ann. Volatility" value={`${rm.annualizedVolatility ?? 0}%`} />
            <MetricRow label="Downside Dev." value={`${rm.downsideDeviation ?? 0}%`} />
            <MetricRow label="Skewness" value={(rm.skewness ?? 0).toFixed(2)} />
            <MetricRow label="Kurtosis" value={(rm.kurtosis ?? 0).toFixed(2)} />
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Risk-Adjusted & VaR</h3>
          <div className="space-y-0">
            <SectionHeader title="Risk-Adjusted Ratios" />
            <MetricRow label="Sharpe Ratio" value={(rm.sharpeRatio ?? 0).toFixed(2)} />
            <MetricRow label="Sortino Ratio" value={(rm.sortinoRatio ?? 0).toFixed(2)} />
            <MetricRow label="Calmar Ratio" value={(rm.calmarRatio ?? 0).toFixed(2)} />
            <MetricRow label="Information Ratio" value={(rm.informationRatio ?? 0).toFixed(2)} />
            <SectionHeader title="Value at Risk (1-Day)" />
            <MetricRow label="VaR (95%)" value={`${rm.var95 ?? 0}%`} positive={false} />
            <MetricRow label="VaR (99%)" value={`${rm.var99 ?? 0}%`} positive={false} />
            <MetricRow label="CVaR (95%)" value={`${rm.cvar95 ?? 0}%`} positive={false} />
            <MetricRow label="CVaR (99%)" value={`${rm.cvar99 ?? 0}%`} positive={false} />
            <SectionHeader title="Benchmark-Relative" />
            <MetricRow label="Alpha" value={`${rm.alpha ?? 0}%`} positive={(rm.alpha ?? 0) >= 0} />
            <MetricRow label="Beta" value={(rm.beta ?? 0).toFixed(2)} />
            <MetricRow label="Tracking Error" value={`${rm.trackingError ?? 0}%`} />
            <MetricRow label="R-Squared" value={(rm.rSquared ?? 0).toFixed(2)} />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Drawdown */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Underwater / Drawdown (%)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={ddData}>
              <defs>
                <linearGradient id="btDDGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.max(1, Math.floor(ddData.length / 6))} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`]} />
              <Area type="monotone" dataKey="drawdown" name="Drawdown" stroke="#ef4444" strokeWidth={1.5} fill="url(#btDDGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Rolling vol */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Rolling 60-Day Volatility (%)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={rvData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.max(1, Math.floor(rvData.length / 6))} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`]} />
              <Line type="monotone" dataKey="portfolio" name="Portfolio Vol" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="benchmark" name="Benchmark Vol" stroke="#6b7280" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Rolling Correlation */}
      {rcData.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Rolling 60-Day Correlation with Benchmark</h3>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={rcData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.max(1, Math.floor(rcData.length / 6))} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[-1, 1]} tickFormatter={(v: number) => v.toFixed(1)} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(3)}`, 'Correlation']} />
              <Line type="monotone" dataKey="correlation" name="Correlation" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   4. ATTRIBUTION
   ═══════════════════════════════════════════════════════════ */
function AttributionSection({ result }: { result: any }) {
  const attribs = result.positionAttribution ?? [];

  return (
    <div className="space-y-6">
      {/* Bar chart */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Return Contribution by Position</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={attribs} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} />
            <YAxis type="category" dataKey="symbol" stroke="#64748b" tick={{ fontSize: 11 }} width={70} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`]} />
            <Bar dataKey="contribution" name="Contribution" radius={[0, 4, 4, 0]}>
              {attribs.map((e: any, i: number) => (
                <Cell key={i} fill={e.contribution >= 0 ? '#3b82f6' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Position Detail</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-3 py-2 text-slate-500 uppercase">Symbol</th>
                <th className="text-right px-3 py-2 text-slate-500 uppercase">Weight</th>
                <th className="text-right px-3 py-2 text-slate-500 uppercase">Total Return</th>
                <th className="text-right px-3 py-2 text-slate-500 uppercase">Contribution</th>
              </tr>
            </thead>
            <tbody>
              {attribs.map((a: any) => (
                <tr key={a.symbol} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                  <td className="px-3 py-2.5 font-mono font-semibold text-blue-400">{a.symbol}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-slate-300">{a.weight}%</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-medium ${a.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {a.totalReturn > 0 ? '+' : ''}{a.totalReturn}%
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono font-medium ${a.contribution >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {a.contribution > 0 ? '+' : ''}{a.contribution}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   5. TRADE LOG (rebalance events)
   ═══════════════════════════════════════════════════════════ */
function TradesSection({ result, currSym, expanded, setExpanded }: {
  result: any; currSym: string; expanded: number | null; setExpanded: (v: number | null) => void;
}) {
  const trades = result.tradeLog ?? [];

  if (!trades.length) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-10 text-center">
        <RefreshCw className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">No Rebalance Events</h2>
        <p className="text-sm text-slate-400">Enable a rebalancing strategy in the config panel to see trade events here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">{trades.length} Rebalance Event{trades.length !== 1 ? 's' : ''}</h3>
        <div className="space-y-2">
          {trades.map((t: any, i: number) => (
            <div key={i} className="bg-slate-900/40 border border-slate-700/30 rounded-lg overflow-hidden">
              <button onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-700/20 transition-colors">
                <div className="flex items-center gap-3">
                  {expanded === i ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-white font-mono">{t.date}</span>
                  <span className="text-xs text-slate-500">{t.trades?.length ?? 0} adjustment{(t.trades?.length ?? 0) !== 1 ? 's' : ''}</span>
                </div>
                <span className="text-sm font-mono text-slate-300">{currSym}{t.totalValue?.toLocaleString()}</span>
              </button>
              {expanded === i && t.trades?.length > 0 && (
                <div className="px-4 pb-3 pl-12">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-700/50">
                      <th className="text-left py-1.5 text-slate-500">Symbol</th>
                      <th className="text-right py-1.5 text-slate-500">Weight Δ</th>
                    </tr></thead>
                    <tbody>
                      {t.trades.map((tr: any, j: number) => (
                        <tr key={j} className="border-b border-slate-700/20">
                          <td className="py-1.5 font-mono text-blue-400">{tr.symbol}</td>
                          <td className={`py-1.5 text-right font-mono font-medium ${tr.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {tr.delta > 0 ? '+' : ''}{tr.delta}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SHARED SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════ */
function KpiCard({ icon: Icon, color, label, value, sub }: {
  icon: React.ElementType; color: string; label: string; value: string; sub: string;
}) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="text-lg font-bold text-white font-mono">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <div className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider pt-4 pb-2 border-b border-slate-700/50">{title}</div>;
}

function MetricRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-700/20">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-sm font-mono font-medium ${positive === undefined ? 'text-slate-200' : positive ? 'text-emerald-400' : 'text-red-400'}`}>
        {value}
      </span>
    </div>
  );
}

function SummaryRow({ label, pf, bench, pfBetter }: { label: string; pf: string; bench: string; pfBetter: boolean }) {
  return (
    <tr className="border-b border-slate-700/20">
      <td className="px-3 py-2.5 text-slate-400">{label}</td>
      <td className={`px-3 py-2.5 text-right font-mono font-medium ${pfBetter ? 'text-emerald-400' : 'text-red-400'}`}>{pf}</td>
      <td className="px-3 py-2.5 text-right font-mono text-slate-400">{bench}</td>
    </tr>
  );
}

/* Weight stacked area — dynamic keys */
function WeightChart({ data }: { data: any[] }) {
  if (!data.length) return null;
  const keys = Object.keys(data[0]).filter(k => k !== 'date');
  const colors = ['#3b82f6', '#6366f1', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f59e0b', '#14b8a6'];
  return (
    <>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} stackOffset="expand">
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.max(1, Math.floor(data.length / 6))} />
          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(1)}%`]} />
          {keys.map((k, i) => (
            <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={colors[i % colors.length]}
              fill={colors[i % colors.length]} fillOpacity={0.6} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-3 mt-3 text-xs text-slate-400 flex-wrap">
        {keys.map((k, i) => (
          <span key={k} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: colors[i % colors.length] }} />
            {k}
          </span>
        ))}
      </div>
    </>
  );
}

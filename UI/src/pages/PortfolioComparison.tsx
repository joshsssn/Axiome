import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, ComposedChart, Line, LineChart,
} from 'recharts';
import { usePortfolio } from '@/context/PortfolioContext';
import { api } from '@/services/api';
import type { PortfolioData, AllocationItem, StressScenario, RiskMetricsData } from '@/data/mockData';
import {
  GitCompareArrows, ShieldAlert, TrendingDown, BarChart3, Activity,
  ChevronDown, AlertTriangle,
} from 'lucide-react';

/* ─── Types ─── */
type Section = 'allocation' | 'performance' | 'risk' | 'stress';
type AllocView = 'class' | 'sector' | 'country';
type TimeRange = 'YTD' | '6M' | '1Y' | '2Y';

const BENCHMARK_OPTIONS = [
  { value: '', label: 'Portfolio Default' },
  { value: 'SPY', label: 'S&P 500 (SPY)' },
  { value: 'QQQ', label: 'NASDAQ 100 (QQQ)' },
  { value: 'IWM', label: 'Russell 2000 (IWM)' },
  { value: 'VOO', label: 'Vanguard S&P 500 (VOO)' },
  { value: 'VTI', label: 'Total Stock Market (VTI)' },
  { value: 'BND', label: 'Total Bond (BND)' },
  { value: 'GLD', label: 'Gold (GLD)' },
  { value: '^GSPC', label: 'S&P 500 Index' },
];

const SECTION_TABS: { id: Section; label: string }[] = [
  { id: 'allocation', label: 'Allocation' },
  { id: 'performance', label: 'Performance' },
  { id: 'risk', label: 'Risk' },
  { id: 'stress', label: 'Stress Test' },
];

/* ─── Color helpers ─── */
const COLORS_A = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
const COLORS_B = ['#6366f1', '#14b8a6', '#eab308', '#a855f7', '#f97316', '#0ea5e9', '#f43f5e', '#22c55e'];

function delta(a: number, b: number, higherIsGreen = true): string {
  const d = a - b;
  if (Math.abs(d) < 0.005) return 'text-slate-400';
  return (higherIsGreen ? d > 0 : d < 0) ? 'text-emerald-400' : 'text-red-400';
}

function fmtNum(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

function getCorrelationColor(val: number): string {
  if (val >= 0.7) return 'bg-blue-500 text-white';
  if (val >= 0.4) return 'bg-blue-400/60 text-white';
  if (val >= 0.1) return 'bg-blue-300/30 text-blue-200';
  if (val >= -0.1) return 'bg-slate-700 text-slate-300';
  if (val >= -0.4) return 'bg-red-300/30 text-red-200';
  if (val >= -0.7) return 'bg-red-400/60 text-white';
  return 'bg-red-500 text-white';
}

/* ─────────────────────── COMPONENT ─────────────────────── */
export function PortfolioComparison() {
  const { portfolios, activePortfolioId } = usePortfolio();

  /* Portfolio selectors */
  const [idA, setIdA] = useState<string>('');
  const [idB, setIdB] = useState<string>('');
  const [section, setSection] = useState<Section>('allocation');

  /* Shared controls */
  const [allocView, setAllocView] = useState<AllocView>('class');
  const [range, setRange] = useState<TimeRange>('2Y');
  const [benchmark, setBenchmark] = useState('');
  const [varDays, setVarDays] = useState(1);
  const [selectedScenario, setSelectedScenario] = useState(0);

  /* Analytics fetched from backend for each portfolio */
  const [analyticsA, setAnalyticsA] = useState<any>(null);
  const [analyticsB, setAnalyticsB] = useState<any>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  /* Default selection — pick first two portfolios */
  useEffect(() => {
    if (portfolios.length >= 2) {
      if (!idA) setIdA(activePortfolioId || portfolios[0].id);
      if (!idB) setIdB(portfolios.find(p => p.id !== (activePortfolioId || portfolios[0].id))?.id ?? portfolios[1].id);
    } else if (portfolios.length === 1) {
      if (!idA) setIdA(portfolios[0].id);
    }
  }, [portfolios, activePortfolioId, idA, idB]);

  const pfA = portfolios.find(p => p.id === idA) ?? null;
  const pfB = portfolios.find(p => p.id === idB) ?? null;

  /* Fetch custom analytics when benchmark changes */
  const fetchAnalytics = useCallback(async (pfId: string, setter: (d: any) => void, setLoading: (l: boolean) => void) => {
    if (!pfId || !benchmark) { setter(null); return; }
    const numId = parseInt(pfId);
    if (isNaN(numId)) return;
    setLoading(true);
    try {
      const data = await api.portfolios.getAnalytics(numId, { benchmark });
      setter(data);
    } catch { setter(null); }
    finally { setLoading(false); }
  }, [benchmark]);

  useEffect(() => { fetchAnalytics(idA, setAnalyticsA, setLoadingA); }, [idA, benchmark, fetchAnalytics]);
  useEffect(() => { fetchAnalytics(idB, setAnalyticsB, setLoadingB); }, [idB, benchmark, fetchAnalytics]);

  /* Resolved data sources */
  const srcA = useMemo(() => analyticsA || pfA, [analyticsA, pfA]);
  const srcB = useMemo(() => analyticsB || pfB, [analyticsB, pfB]);

  const loading = loadingA || loadingB;

  /* ─── Range slice helper ─── */
  const getSlice = useCallback((data: any[]) => {
    if (!data?.length) return data ?? [];
    if (range === 'YTD') {
      const yr = new Date().getFullYear();
      const idx = data.findIndex((p: any) => p.date?.startsWith(String(yr)));
      return idx >= 0 ? data.slice(idx) : data;
    }
    if (range === '6M') return data.slice(-126);
    if (range === '1Y') return data.slice(-252);
    return data; // 2Y = all
  }, [range]);

  if (portfolios.length < 2) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <GitCompareArrows className="w-7 h-7 text-blue-400" /> Portfolio Comparison
          </h1>
          <p className="text-slate-400 text-sm mt-1">You need at least two portfolios to compare.</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-10 text-center">
          <GitCompareArrows className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Not Enough Portfolios</h2>
          <p className="text-sm text-slate-400">Create a second portfolio from the Dashboard to unlock side-by-side comparison.</p>
        </div>
      </div>
    );
  }

  /* ──────────────────────── RENDER ──────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header + selectors */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <GitCompareArrows className="w-7 h-7 text-blue-400" /> Portfolio Comparison
          </h1>
          <p className="text-slate-400 text-sm mt-1">Side-by-side analysis across allocation, performance, risk &amp; stress</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <PortfolioSelector label="Portfolio A" value={idA} onChange={setIdA} portfolios={portfolios} color="blue" />
          <span className="text-slate-600 font-bold text-lg">vs</span>
          <PortfolioSelector label="Portfolio B" value={idB} onChange={setIdB} portfolios={portfolios} color="indigo" />
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-0.5 w-fit">
        {SECTION_TABS.map(t => (
          <button key={t.id} onClick={() => setSection(t.id)}
            className={`px-4 py-2 text-xs font-medium rounded-md transition-all ${section === t.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-xs text-blue-400 animate-pulse">Loading analytics...</div>}

      {(!pfA || !pfB) && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center text-slate-400">
          Select two different portfolios above to begin comparison.
        </div>
      )}

      {pfA && pfB && section === 'allocation' && (
        <AllocationSection pfA={pfA} pfB={pfB} allocView={allocView} setAllocView={setAllocView} />
      )}
      {pfA && pfB && section === 'performance' && (
        <PerformanceSection
          pfA={pfA} pfB={pfB} srcA={srcA} srcB={srcB}
          range={range} setRange={setRange}
          benchmark={benchmark} setBenchmark={setBenchmark}
          getSlice={getSlice}
        />
      )}
      {pfA && pfB && section === 'risk' && (
        <RiskSection pfA={pfA} pfB={pfB} srcA={srcA} srcB={srcB} varDays={varDays} setVarDays={setVarDays} getSlice={getSlice} />
      )}
      {pfA && pfB && section === 'stress' && (
        <StressSection pfA={pfA} pfB={pfB} selectedScenario={selectedScenario} setSelectedScenario={setSelectedScenario} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PORTFOLIO SELECTOR
   ═══════════════════════════════════════════════════════════ */
function PortfolioSelector({ label, value, onChange, portfolios, color }: {
  label: string; value: string; onChange: (v: string) => void; portfolios: PortfolioData[]; color: string;
}) {
  const ring = color === 'blue' ? 'focus:border-blue-500 border-blue-500/30' : 'focus:border-indigo-500 border-indigo-500/30';
  return (
    <div className="flex flex-col gap-1">
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${color === 'blue' ? 'text-blue-400' : 'text-indigo-400'}`}>{label}</span>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className={`bg-slate-800/50 border rounded-lg px-3 py-2 text-sm text-white focus:outline-none appearance-none pr-8 min-w-[180px] ${ring}`}>
          {portfolios.map(p => (
            <option key={p.id} value={p.id}>{p.summary.name}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   1. ALLOCATION SECTION
   ═══════════════════════════════════════════════════════════ */
function AllocationSection({ pfA, pfB, allocView, setAllocView }: {
  pfA: PortfolioData; pfB: PortfolioData; allocView: AllocView; setAllocView: (v: AllocView) => void;
}) {
  const dataA: AllocationItem[] = allocView === 'class' ? pfA.allocationByClass : allocView === 'sector' ? pfA.allocationBySector : pfA.allocationByCountry;
  const dataB: AllocationItem[] = allocView === 'class' ? pfB.allocationByClass : allocView === 'sector' ? pfB.allocationBySector : pfB.allocationByCountry;

  /* Concentration (Herfindahl-Hirschman): lower = more diversified */
  const hhi = (d: AllocationItem[]) => d.reduce((s, a) => s + (a.value / 100) ** 2, 0);
  const hhiA = hhi(dataA);
  const hhiB = hhi(dataB);

  return (
    <div className="space-y-6">
      {/* View toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Allocation Comparison</h2>
        <div className="flex gap-1 bg-slate-900/50 rounded-lg p-0.5">
          {(['class', 'sector', 'country'] as AllocView[]).map(v => (
            <button key={v} onClick={() => setAllocView(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${allocView === v ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {v === 'class' ? 'Asset Class' : v === 'sector' ? 'Sector' : 'Country'}
            </button>
          ))}
        </div>
      </div>

      {/* Diversification indicator */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 flex items-center justify-between text-xs">
        <span className="text-slate-400">Diversification (lower HHI = better)</span>
        <div className="flex items-center gap-4">
          <span className={`font-mono ${hhiA < hhiB ? 'text-emerald-400' : hhiA > hhiB ? 'text-red-400' : 'text-slate-300'}`}>
            A: {(hhiA * 100).toFixed(1)}%
          </span>
          <span className={`font-mono ${hhiB < hhiA ? 'text-emerald-400' : hhiB > hhiA ? 'text-red-400' : 'text-slate-300'}`}>
            B: {(hhiB * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Dual pie charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <AllocCard label={pfA.summary.name} data={dataA} colors={COLORS_A} tag="A" tagColor="text-blue-400 bg-blue-500/10" />
        <AllocCard label={pfB.summary.name} data={dataB} colors={COLORS_B} tag="B" tagColor="text-indigo-400 bg-indigo-500/10" />
      </div>

      {/* Side-by-side breakdown table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Detailed Breakdown (Top 5)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-3 py-2 text-slate-500 uppercase tracking-wider">Category</th>
                <th className="text-right px-3 py-2 text-blue-400 uppercase tracking-wider">{pfA.summary.name}</th>
                <th className="text-right px-3 py-2 text-indigo-400 uppercase tracking-wider">{pfB.summary.name}</th>
                <th className="text-right px-3 py-2 text-slate-500 uppercase tracking-wider">Delta</th>
              </tr>
            </thead>
            <tbody>
              {mergeAllocKeys(dataA, dataB).slice(0, 5).map(key => {
                const a = dataA.find(x => x.name === key)?.value ?? 0;
                const b = dataB.find(x => x.name === key)?.value ?? 0;
                return (
                  <tr key={key} className="border-b border-slate-700/20">
                    <td className="px-3 py-2.5 text-slate-300">{key}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-200">{a.toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-200">{b.toFixed(1)}%</td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${(a - b) > 0 ? 'text-blue-400' : (a - b) < 0 ? 'text-indigo-400' : 'text-slate-500'}`}>
                      {(a - b) > 0 ? '+' : ''}{(a - b).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AllocCard({ label, data, colors, tag, tagColor }: {
  label: string; data: AllocationItem[]; colors: string[]; tag: string; tagColor: string;
}) {
  const top5 = data.slice(0, 5);
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tagColor}`}>{tag}</span>
        <h3 className="text-sm font-semibold text-white">{label}</h3>
      </div>
      <div className="flex items-center gap-6">
        <ResponsiveContainer width="45%" height={200}>
          <PieChart>
            <Pie data={top5} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} dataKey="value">
              {top5.map((_e, i) => <Cell key={i} fill={top5[i]?.color || colors[i % colors.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number | undefined) => [`${v ?? 0}%`]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2">
          {top5.map((a, i) => (
            <div key={a.name} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color || colors[i % colors.length] }} />
                <span className="text-slate-300">{a.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${a.value}%`, backgroundColor: a.color || colors[i % colors.length] }} />
                </div>
                <span className="text-slate-400 font-mono w-10 text-right">{a.value}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function mergeAllocKeys(a: AllocationItem[], b: AllocationItem[]): string[] {
  const map = new Map<string, number>();
  a.forEach(x => map.set(x.name, (map.get(x.name) ?? 0) + x.value));
  b.forEach(x => map.set(x.name, (map.get(x.name) ?? 0) + x.value));
  return [...map.entries()].sort((x, y) => y[1] - x[1]).map(e => e[0]);
}

/* ═══════════════════════════════════════════════════════════
   2. PERFORMANCE SECTION
   ═══════════════════════════════════════════════════════════ */
function PerformanceSection({ pfA, pfB, srcA, srcB, range, setRange, benchmark, setBenchmark, getSlice }: {
  pfA: PortfolioData; pfB: PortfolioData; srcA: any; srcB: any;
  range: TimeRange; setRange: (r: TimeRange) => void;
  benchmark: string; setBenchmark: (b: string) => void;
  getSlice: (d: any[]) => any[];
}) {
  const perfA = getSlice(srcA?.performanceData ?? pfA.performanceData).filter((_: unknown, i: number) => i % 2 === 0);
  const perfB = getSlice(srcB?.performanceData ?? pfB.performanceData).filter((_: unknown, i: number) => i % 2 === 0);
  const monthlyA = srcA?.monthlyReturns ?? pfA.monthlyReturns;
  const monthlyB = srcB?.monthlyReturns ?? pfB.monthlyReturns;
  const distA = srcA?.returnDistribution ?? pfA.returnDistribution;
  const distB = srcB?.returnDistribution ?? pfB.returnDistribution;
  const riskA: RiskMetricsData = srcA?.riskMetrics ?? pfA.riskMetrics;
  const riskB: RiskMetricsData = srcB?.riskMetrics ?? pfB.riskMetrics;

  /* Merge perf datasets for overlay chart (align by date) */
  const mergedPerf = useMemo(() => {
    const map = new Map<string, any>();
    perfA.forEach((d: any) => { map.set(d.date, { date: d.date, returnA: d.portfolioReturn, benchmarkReturn: d.benchmarkReturn }); });
    perfB.forEach((d: any) => { const e = map.get(d.date) ?? { date: d.date }; e.returnB = d.portfolioReturn; if (!e.benchmarkReturn) e.benchmarkReturn = d.benchmarkReturn; map.set(d.date, e); });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [perfA, perfB]);

  /* Last 12 months merged */
  const mergedMonthly = useMemo(() => {
    const map = new Map<string, any>();
    monthlyA.forEach((d: any) => map.set(d.month, { month: d.month, portfolioA: d.portfolio, benchmarkA: d.benchmark }));
    monthlyB.forEach((d: any) => { const e = map.get(d.month) ?? { month: d.month }; e.portfolioB = d.portfolio; map.set(d.month, e); });
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [monthlyA, monthlyB]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-white">Performance Comparison</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={benchmark} onChange={e => setBenchmark(e.target.value)}
            className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500">
            {BENCHMARK_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
          <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-0.5">
            {(['YTD', '6M', '1Y', '2Y'] as TimeRange[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${range === r ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cumulative Return overlay */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Cumulative Return (%) — A vs B{benchmark ? ` vs ${benchmark}` : ''}</h3>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={mergedPerf}>
            <defs>
              <linearGradient id="gradA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradB" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.floor(mergedPerf.length / 8)} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }} formatter={(v: number | undefined, name?: string) => [`${(v ?? 0).toFixed(2)}%`, name ?? '']} />
            <Area type="monotone" dataKey="returnA" name={pfA.summary.name} stroke="#3b82f6" strokeWidth={2} fill="url(#gradA)" />
            <Area type="monotone" dataKey="returnB" name={pfB.summary.name} stroke="#6366f1" strokeWidth={2} fill="url(#gradB)" />
            {benchmark && <Line type="monotone" dataKey="benchmarkReturn" name="Benchmark" stroke="#6b7280" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />}
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-6 mt-3 text-xs">
          <span className="flex items-center gap-1.5"><div className="w-3 h-1 rounded bg-blue-500" /> {pfA.summary.name}</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-1 rounded bg-indigo-500" /> {pfB.summary.name}</span>
          {benchmark && <span className="flex items-center gap-1.5"><div className="w-3 h-1 rounded bg-gray-500 border-dashed" /> Benchmark</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Monthly returns side-by-side */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Monthly Returns (%) — Last 12M</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={mergedMonthly} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number | undefined, name?: string) => [`${(v ?? 0).toFixed(2)}%`, name ?? '']} />
              <Bar dataKey="portfolioA" name={pfA.summary.name} fill="#3b82f6" radius={[3, 3, 0, 0]} />
              <Bar dataKey="portfolioB" name={pfB.summary.name} fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Return Distribution dual */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Return Distribution</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-bold text-blue-400 uppercase">A — {pfA.summary.name}</span>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={distA}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="bin" stroke="#64748b" tick={{ fontSize: 8 }} interval={4} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="frequency" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <span className="text-[10px] font-bold text-indigo-400 uppercase">B — {pfB.summary.name}</span>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={distB}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="bin" stroke="#64748b" tick={{ fontSize: 8 }} interval={4} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="frequency" fill="#6366f1" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics Table */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Performance Metrics</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-3 py-2 text-slate-500 uppercase tracking-wider">Metric</th>
                <th className="text-right px-3 py-2 text-blue-400 uppercase tracking-wider">{pfA.summary.name}</th>
                <th className="text-right px-3 py-2 text-indigo-400 uppercase tracking-wider">{pfB.summary.name}</th>
                <th className="text-right px-3 py-2 text-slate-500 uppercase tracking-wider">Delta</th>
              </tr>
            </thead>
            <tbody>
              <CompRow label="Annualized Return" a={`${riskA.annualizedReturn}%`} b={`${riskB.annualizedReturn}%`} av={riskA.annualizedReturn} bv={riskB.annualizedReturn} higherGreen />
              <CompRow label="Best Day" a={`+${riskA.bestDay}%`} b={`+${riskB.bestDay}%`} av={riskA.bestDay} bv={riskB.bestDay} higherGreen />
              <CompRow label="Worst Day" a={`${riskA.worstDay}%`} b={`${riskB.worstDay}%`} av={riskA.worstDay} bv={riskB.worstDay} higherGreen />
              <CompRow label="Best Month" a={`+${riskA.bestMonth}%`} b={`+${riskB.bestMonth}%`} av={riskA.bestMonth} bv={riskB.bestMonth} higherGreen />
              <CompRow label="Worst Month" a={`${riskA.worstMonth}%`} b={`${riskB.worstMonth}%`} av={riskA.worstMonth} bv={riskB.worstMonth} higherGreen />
              <CompRow label="Positive Months" a={`${riskA.positiveMonths}%`} b={`${riskB.positiveMonths}%`} av={riskA.positiveMonths} bv={riskB.positiveMonths} higherGreen />
              <CompRow label="Win Rate" a={`${riskA.winRate}%`} b={`${riskB.winRate}%`} av={riskA.winRate} bv={riskB.winRate} higherGreen />
              <CompRow label="Skewness" a={fmtNum(riskA.skewness)} b={fmtNum(riskB.skewness)} av={riskA.skewness} bv={riskB.skewness} higherGreen />
              <CompRow label="Kurtosis" a={fmtNum(riskA.kurtosis)} b={fmtNum(riskB.kurtosis)} av={riskA.kurtosis} bv={riskB.kurtosis} higherGreen={false} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   3. RISK SECTION
   ═══════════════════════════════════════════════════════════ */
function RiskSection({ pfA, pfB, srcA, srcB, varDays, setVarDays, getSlice }: {
  pfA: PortfolioData; pfB: PortfolioData; srcA: any; srcB: any;
  varDays: number; setVarDays: (d: number) => void;
  getSlice: (d: any[]) => any[];
}) {
  const mA: RiskMetricsData = srcA?.riskMetrics ?? pfA.riskMetrics;
  const mB: RiskMetricsData = srcB?.riskMetrics ?? pfB.riskMetrics;
  const scaleFactor = Math.sqrt(varDays);
  const varLabel = varDays === 1 ? '1-day' : `${varDays}-day`;

  const scaled = (m: RiskMetricsData) => ({
    var95: parseFloat((m.var95 * scaleFactor).toFixed(2)),
    var99: parseFloat((m.var99 * scaleFactor).toFixed(2)),
    cvar95: parseFloat((m.cvar95 * scaleFactor).toFixed(2)),
    cvar99: parseFloat((m.cvar99 * scaleFactor).toFixed(2)),
  });
  const sA = scaled(mA);
  const sB = scaled(mB);

  /* Chart data */
  const ddA = getSlice(srcA?.drawdownData ?? pfA.drawdownData).filter((_: unknown, i: number) => i % 2 === 0);
  const ddB = getSlice(srcB?.drawdownData ?? pfB.drawdownData).filter((_: unknown, i: number) => i % 2 === 0);
  const rvA = srcA?.rollingVolatility ?? pfA.rollingVolatility;
  const rvB = srcB?.rollingVolatility ?? pfB.rollingVolatility;
  const rcA = pfA.rollingCorrelation;
  const rcB = pfB.rollingCorrelation;

  /* Merge drawdown */
  const mergedDD = useMemo(() => {
    const map = new Map<string, any>();
    ddA.forEach((d: any) => map.set(d.date, { date: d.date, drawdownA: d.drawdown }));
    ddB.forEach((d: any) => { const e = map.get(d.date) ?? { date: d.date }; e.drawdownB = d.drawdown; map.set(d.date, e); });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [ddA, ddB]);

  /* Merge rolling vol */
  const mergedRV = useMemo(() => {
    const map = new Map<string, any>();
    rvA.forEach((d: any) => map.set(d.date, { date: d.date, volA: d.portfolio }));
    rvB.forEach((d: any) => { const e = map.get(d.date) ?? { date: d.date }; e.volB = d.portfolio; map.set(d.date, e); });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [rvA, rvB]);

  /* Merge rolling correlation */
  const mergedRC = useMemo(() => {
    const map = new Map<string, any>();
    rcA.forEach((d: any) => map.set(d.date, { date: d.date, corrA: d.correlation }));
    rcB.forEach((d: any) => { const e = map.get(d.date) ?? { date: d.date }; e.corrB = d.correlation; map.set(d.date, e); });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [rcA, rcB]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Risk Comparison</h2>

      {/* Top KPI Cards — 4 per portfolio */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <RiskKpiCard icon={ShieldAlert} color="text-amber-400 bg-amber-500/10" label={`VaR 95% (${varLabel})`} vA={`${sA.var95}%`} vB={`${sB.var95}%`} nameA={pfA.summary.name} nameB={pfB.summary.name} higherGreen={false} nA={sA.var95} nB={sB.var95} />
        <RiskKpiCard icon={TrendingDown} color="text-red-400 bg-red-500/10" label="Max Drawdown" vA={`${mA.maxDrawdown}%`} vB={`${mB.maxDrawdown}%`} nameA={pfA.summary.name} nameB={pfB.summary.name} higherGreen={false} nA={mA.maxDrawdown} nB={mB.maxDrawdown} />
        <RiskKpiCard icon={BarChart3} color="text-blue-400 bg-blue-500/10" label="Sharpe Ratio" vA={mA.sharpeRatio.toFixed(2)} vB={mB.sharpeRatio.toFixed(2)} nameA={pfA.summary.name} nameB={pfB.summary.name} higherGreen nA={mA.sharpeRatio} nB={mB.sharpeRatio} />
        <RiskKpiCard icon={Activity} color="text-violet-400 bg-violet-500/10" label="Beta" vA={mA.beta.toFixed(2)} vB={mB.beta.toFixed(2)} nameA={pfA.summary.name} nameB={pfB.summary.name} higherGreen={false} nA={mA.beta} nB={mB.beta} />
      </div>

      {/* VaR Period Selector */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 flex items-center gap-4 flex-wrap">
        <span className="text-xs text-slate-400 font-medium">VaR Holding Period:</span>
        <div className="flex gap-1 bg-slate-900/50 rounded-lg p-0.5">
          {[1, 5, 10, 21, 63, 252].map(d => (
            <button key={d} onClick={() => setVarDays(d)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${varDays === d ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {d === 1 ? '1D' : d === 5 ? '1W' : d === 10 ? '2W' : d === 21 ? '1M' : d === 63 ? '3M' : '1Y'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">or custom:</span>
          <input type="number" value={varDays} onChange={e => setVarDays(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={504}
            className="w-16 bg-slate-900/50 border border-slate-700 rounded-lg text-xs text-white px-2 py-1.5 font-mono focus:outline-none focus:border-blue-500" />
          <span className="text-xs text-slate-500">days</span>
        </div>
      </div>

      {/* Full metrics table side-by-side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: Volatility + VaR */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Volatility &amp; Value at Risk</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-2 py-2 text-slate-500 uppercase tracking-wider">Metric</th>
                <th className="text-right px-2 py-2 text-blue-400 uppercase tracking-wider">A</th>
                <th className="text-right px-2 py-2 text-indigo-400 uppercase tracking-wider">B</th>
                <th className="text-right px-2 py-2 text-slate-500 uppercase tracking-wider">Δ</th>
              </tr>
            </thead>
            <tbody>
              <SectionHeaderRow title="Volatility Measures" />
              <CompRow label="Ann. Volatility" a={`${mA.annualizedVolatility}%`} b={`${mB.annualizedVolatility}%`} av={mA.annualizedVolatility} bv={mB.annualizedVolatility} higherGreen={false} />
              <CompRow label="Downside Dev." a={`${mA.downsideDeviation}%`} b={`${mB.downsideDeviation}%`} av={mA.downsideDeviation} bv={mB.downsideDeviation} higherGreen={false} />
              <CompRow label="Skewness" a={fmtNum(mA.skewness)} b={fmtNum(mB.skewness)} av={mA.skewness} bv={mB.skewness} higherGreen />
              <CompRow label="Kurtosis" a={fmtNum(mA.kurtosis)} b={fmtNum(mB.kurtosis)} av={mA.kurtosis} bv={mB.kurtosis} higherGreen={false} />
              <SectionHeaderRow title={`Value at Risk (${varLabel})`} />
              <CompRow label="VaR (95%)" a={`${sA.var95}%`} b={`${sB.var95}%`} av={sA.var95} bv={sB.var95} higherGreen={false} />
              <CompRow label="VaR (99%)" a={`${sA.var99}%`} b={`${sB.var99}%`} av={sA.var99} bv={sB.var99} higherGreen={false} />
              <CompRow label="CVaR (95%)" a={`${sA.cvar95}%`} b={`${sB.cvar95}%`} av={sA.cvar95} bv={sB.cvar95} higherGreen={false} />
              <CompRow label="CVaR (99%)" a={`${sA.cvar99}%`} b={`${sB.cvar99}%`} av={sA.cvar99} bv={sB.cvar99} higherGreen={false} />
            </tbody>
          </table>
        </div>

        {/* Right: Risk-adjusted + benchmark */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Risk-Adjusted &amp; Benchmark</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-2 py-2 text-slate-500 uppercase tracking-wider">Metric</th>
                <th className="text-right px-2 py-2 text-blue-400 uppercase tracking-wider">A</th>
                <th className="text-right px-2 py-2 text-indigo-400 uppercase tracking-wider">B</th>
                <th className="text-right px-2 py-2 text-slate-500 uppercase tracking-wider">Δ</th>
              </tr>
            </thead>
            <tbody>
              <SectionHeaderRow title="Risk-Adjusted Ratios" />
              <CompRow label="Sharpe Ratio" a={mA.sharpeRatio.toFixed(2)} b={mB.sharpeRatio.toFixed(2)} av={mA.sharpeRatio} bv={mB.sharpeRatio} higherGreen />
              <CompRow label="Sortino Ratio" a={mA.sortinoRatio.toFixed(2)} b={mB.sortinoRatio.toFixed(2)} av={mA.sortinoRatio} bv={mB.sortinoRatio} higherGreen />
              <CompRow label="Calmar Ratio" a={mA.calmarRatio.toFixed(2)} b={mB.calmarRatio.toFixed(2)} av={mA.calmarRatio} bv={mB.calmarRatio} higherGreen />
              <CompRow label="Information Ratio" a={mA.informationRatio.toFixed(2)} b={mB.informationRatio.toFixed(2)} av={mA.informationRatio} bv={mB.informationRatio} higherGreen />
              <SectionHeaderRow title="Benchmark-Relative" />
              <CompRow label="Alpha" a={`${mA.alpha}%`} b={`${mB.alpha}%`} av={mA.alpha} bv={mB.alpha} higherGreen />
              <CompRow label="Beta" a={mA.beta.toFixed(2)} b={mB.beta.toFixed(2)} av={mA.beta} bv={mB.beta} higherGreen={false} />
              <CompRow label="Tracking Error" a={`${mA.trackingError}%`} b={`${mB.trackingError}%`} av={mA.trackingError} bv={mB.trackingError} higherGreen={false} />
              <CompRow label="R-Squared" a={mA.rSquared.toFixed(2)} b={mB.rSquared.toFixed(2)} av={mA.rSquared} bv={mB.rSquared} higherGreen />
              <SectionHeaderRow title="Drawdown" />
              <CompRow label="Max Drawdown" a={`${mA.maxDrawdown}%`} b={`${mB.maxDrawdown}%`} av={mA.maxDrawdown} bv={mB.maxDrawdown} higherGreen={false} />
              <CompRow label="Duration" a={`${mA.maxDrawdownDuration}d`} b={`${mB.maxDrawdownDuration}d`} av={mA.maxDrawdownDuration} bv={mB.maxDrawdownDuration} higherGreen={false} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts: Drawdown, Rolling Vol, Rolling Correlation */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Drawdown overlay */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Drawdown Over Time</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={mergedDD}>
              <defs>
                <linearGradient id="gradDDA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradDDB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.floor(mergedDD.length / 6)} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number | undefined, name?: string) => [`${(v ?? 0).toFixed(2)}%`, name ?? '']} />
              <Area type="monotone" dataKey="drawdownA" name={pfA.summary.name} stroke="#3b82f6" strokeWidth={1.5} fill="url(#gradDDA)" />
              <Area type="monotone" dataKey="drawdownB" name={pfB.summary.name} stroke="#6366f1" strokeWidth={1.5} fill="url(#gradDDB)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Rolling Volatility overlay */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Rolling 60-Day Volatility (%)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={mergedRV}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.floor(mergedRV.length / 6)} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number | undefined, name?: string) => [`${(v ?? 0).toFixed(2)}%`, name ?? '']} />
              <Line type="monotone" dataKey="volA" name={pfA.summary.name} stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="volB" name={pfB.summary.name} stroke="#6366f1" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Rolling Correlation */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Rolling 60-Day Correlation with Benchmark</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={mergedRC}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.floor(mergedRC.length / 8)} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 1]} tickFormatter={(v: number) => v.toFixed(1)} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number | undefined, name?: string) => [(v ?? 0).toFixed(3), name ?? '']} />
            <Line type="monotone" dataKey="corrA" name={pfA.summary.name} stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="corrB" name={pfB.summary.name} stroke="#6366f1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Correlation Matrices */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <CorrelationMatrixCard label={pfA.summary.name} matrix={pfA.correlationMatrix} tag="A" tagColor="text-blue-400 bg-blue-500/10" />
        <CorrelationMatrixCard label={pfB.summary.name} matrix={pfB.correlationMatrix} tag="B" tagColor="text-indigo-400 bg-indigo-500/10" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   4. STRESS TEST SECTION
   ═══════════════════════════════════════════════════════════ */
function StressSection({ pfA, pfB, selectedScenario, setSelectedScenario }: {
  pfA: PortfolioData; pfB: PortfolioData; selectedScenario: number; setSelectedScenario: (n: number) => void;
}) {
  /* Use scenarios from A (they share the same historical set). If B has unique ones, merge. */
  const allScenarios = useMemo(() => {
    const map = new Map<string, StressScenario>();
    pfA.stressScenarios.forEach(s => map.set(s.name, s));
    pfB.stressScenarios.forEach(s => { if (!map.has(s.name)) map.set(s.name, s); });
    return [...map.values()];
  }, [pfA.stressScenarios, pfB.stressScenarios]);

  const scenarioName = allScenarios[selectedScenario]?.name;
  const scenA = pfA.stressScenarios.find(s => s.name === scenarioName) ?? allScenarios[selectedScenario];
  const scenB = pfB.stressScenarios.find(s => s.name === scenarioName);

  if (!allScenarios.length) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-10 text-center">
        <AlertTriangle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">No Stress Scenarios</h2>
        <p className="text-sm text-slate-400">Add stress scenarios from the Stress Test page first.</p>
      </div>
    );
  }

  const impactBarsA = scenA ? [
    { name: 'Equities', impact: scenA.equityShock },
    { name: 'Bonds', impact: scenA.bondShock },
    { name: 'Commodities', impact: scenA.commodityShock },
    { name: 'Portfolio', impact: scenA.portfolioImpact },
  ] : [];

  const impactBarsB = scenB ? [
    { name: 'Equities', impact: scenB.equityShock },
    { name: 'Bonds', impact: scenB.bondShock },
    { name: 'Commodities', impact: scenB.commodityShock },
    { name: 'Portfolio', impact: scenB.portfolioImpact },
  ] : [];

  /* Merge for overlay chart */
  const mergedImpact = impactBarsA.map((a, i) => ({
    name: a.name,
    impactA: a.impact,
    impactB: impactBarsB[i]?.impact ?? 0,
  }));

  /* Position-level comparison — top 10 from each */
  const contribA = pfA.stressContributions.slice(0, 10);
  const contribB = pfB.stressContributions.slice(0, 10);
  const mergedContrib = useMemo(() => {
    const map = new Map<string, any>();
    contribA.forEach(c => map.set(c.symbol, { symbol: c.symbol, crisis2008A: c.crisis2008, covid2020A: c.covid2020, rateShockA: c.rateShock }));
    contribB.forEach(c => { const e = map.get(c.symbol) ?? { symbol: c.symbol }; e.crisis2008B = c.crisis2008; e.covid2020B = c.covid2020; e.rateShockB = c.rateShock; map.set(c.symbol, e); });
    return [...map.values()].slice(0, 10);
  }, [contribA, contribB]);

  const lossA = scenA ? Math.abs(Math.round(pfA.summary.totalValue * scenA.portfolioImpact / 100)) : 0;
  const lossB = scenB ? Math.abs(Math.round(pfB.summary.totalValue * scenB.portfolioImpact / 100)) : 0;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Stress Test Comparison</h2>

      {/* Scenario selector */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 flex items-center gap-4 flex-wrap">
        <span className="text-xs text-slate-400 font-medium">Scenario:</span>
        <div className="flex gap-1 bg-slate-900/50 rounded-lg p-0.5 flex-wrap">
          {allScenarios.map((s, i) => (
            <button key={s.name} onClick={() => setSelectedScenario(i)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${selectedScenario === i ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Impact bars overlay */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-1">{scenarioName} — Impact by Asset Class</h3>
        <p className="text-xs text-slate-400 mb-4">Side-by-side projected shocks</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={mergedImpact} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number | undefined, name?: string) => [`${(v ?? 0).toFixed(1)}%`, name ?? '']} />
            <Bar dataKey="impactA" name={pfA.summary.name} fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="impactB" name={pfB.summary.name} fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Result cards side-by-side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <StressResultCard pf={pfA} scenario={scenA} loss={lossA} tag="A" tagColor="text-blue-400 bg-blue-500/10" />
        {scenB ? <StressResultCard pf={pfB} scenario={scenB} loss={lossB} tag="B" tagColor="text-indigo-400 bg-indigo-500/10" /> : (
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 flex items-center justify-center text-sm text-slate-500">
            This scenario is not available for Portfolio B.
          </div>
        )}
      </div>

      {/* Position-level stress comparison */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Position-Level Stress Impact (Top 10)</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={mergedContrib} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="symbol" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(1)}%`]} />
            <Bar dataKey="crisis2008A" name={`${pfA.summary.name} — 2008`} fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Bar dataKey="crisis2008B" name={`${pfB.summary.name} — 2008`} fill="#f97316" radius={[3, 3, 0, 0]} />
            <Bar dataKey="covid2020A" name={`${pfA.summary.name} — COVID`} fill="#f59e0b" radius={[3, 3, 0, 0]} />
            <Bar dataKey="covid2020B" name={`${pfB.summary.name} — COVID`} fill="#eab308" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-4 mt-3 text-xs text-slate-400 flex-wrap">
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500" /> {pfA.summary.name} — 2008</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-orange-500" /> {pfB.summary.name} — 2008</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-500" /> {pfA.summary.name} — COVID</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-yellow-500" /> {pfB.summary.name} — COVID</span>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════
   SHARED SUB-COMPONENTS
   ═════════════════════════════════════════════ */

function CompRow({ label, a, b, av, bv, higherGreen }: {
  label: string; a: string; b: string; av: number; bv: number; higherGreen: boolean;
}) {
  const d = av - bv;
  const colorA = delta(av, bv, higherGreen);
  const colorB = delta(bv, av, higherGreen);
  return (
    <tr className="border-b border-slate-700/20">
      <td className="px-2 py-2.5 text-slate-400">{label}</td>
      <td className={`px-2 py-2.5 text-right font-mono font-medium ${colorA}`}>{a}</td>
      <td className={`px-2 py-2.5 text-right font-mono font-medium ${colorB}`}>{b}</td>
      <td className={`px-2 py-2.5 text-right font-mono text-slate-500`}>{d > 0 ? '+' : ''}{fmtNum(d)}</td>
    </tr>
  );
}

function SectionHeaderRow({ title }: { title: string }) {
  return (
    <tr><td colSpan={4} className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider pt-4 pb-2 border-b border-slate-700/50 px-2">{title}</td></tr>
  );
}

function RiskKpiCard({ icon: Icon, color, label, vA, vB, nameA, nameB, higherGreen, nA, nB }: {
  icon: React.ElementType; color: string; label: string; vA: string; vB: string; nameA: string; nameB: string; higherGreen: boolean; nA: number; nB: number;
}) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xs text-slate-400 mb-2">{label}</div>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className={`text-base font-bold font-mono ${delta(nA, nB, higherGreen)}`}>{vA}</div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[80px]">{nameA}</div>
        </div>
        <div className="text-slate-600">/</div>
        <div className="text-right">
          <div className={`text-base font-bold font-mono ${delta(nB, nA, higherGreen)}`}>{vB}</div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[80px]">{nameB}</div>
        </div>
      </div>
    </div>
  );
}

function CorrelationMatrixCard({ label, matrix, tag, tagColor }: {
  label: string; matrix: { labels: string[]; data: number[][] }; tag: string; tagColor: string;
}) {
  if (!matrix.labels.length) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 text-center text-sm text-slate-500">
        No correlation data for this portfolio.
      </div>
    );
  }
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tagColor}`}>{tag}</span>
        <h3 className="text-sm font-semibold text-white">Correlation Matrix — {label}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="px-2 py-2" />
              {matrix.labels.map(l => (
                <th key={l} className="px-2 py-2 text-slate-400 font-mono font-medium whitespace-nowrap">{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.labels.map((lbl, i) => (
              <tr key={lbl}>
                <td className="px-2 py-1.5 text-slate-400 font-mono font-medium whitespace-nowrap">{lbl}</td>
                {matrix.data[i].map((val, j) => (
                  <td key={j} className="px-1 py-1">
                    <div className={`w-12 h-8 flex items-center justify-center rounded font-mono text-[10px] font-medium ${getCorrelationColor(val)}`}>
                      {val.toFixed(2)}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-center gap-2 mt-3 text-[10px]">
        <span className="text-slate-500">Strong Neg</span>
        <div className="flex gap-0.5">
          {['bg-red-500', 'bg-red-400/60', 'bg-red-300/30', 'bg-slate-700', 'bg-blue-300/30', 'bg-blue-400/60', 'bg-blue-500'].map((c, i) => (
            <div key={i} className={`w-5 h-2.5 rounded-sm ${c}`} />
          ))}
        </div>
        <span className="text-slate-500">Strong Pos</span>
      </div>
    </div>
  );
}

function StressResultCard({ pf, scenario, loss, tag, tagColor }: {
  pf: PortfolioData; scenario: StressScenario | undefined; loss: number; tag: string; tagColor: string;
}) {
  if (!scenario) return null;
  const currSym = pf.summary.currency === 'EUR' ? '€' : '$';
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${tagColor}`}>{tag}</span>
        <h3 className="text-sm font-semibold text-white">{pf.summary.name}</h3>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900/50 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 mb-1">Portfolio Impact</div>
          <div className="text-lg font-bold font-mono text-red-400">{scenario.portfolioImpact}%</div>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 mb-1">Worst Position</div>
          <div className="text-sm font-bold font-mono text-amber-400">{scenario.worstPosition}</div>
          <div className="text-[10px] font-mono text-slate-500">{scenario.worstPositionImpact}%</div>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 mb-1">Est. Dollar Loss</div>
          <div className="text-sm font-bold font-mono text-red-400">{currSym}{loss.toLocaleString()}</div>
        </div>
      </div>
      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-400">
            <span className="text-red-400 font-medium">Risk Warning:</span> Estimated loss of{' '}
            <span className="text-red-400 font-mono font-medium">{currSym}{loss.toLocaleString()}</span>{' '}
            under <span className="text-white">{scenario.name}</span> scenario.
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import {
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, AreaChart, Area, ComposedChart
} from 'recharts';
import { usePortfolio } from '@/context/PortfolioContext';
import { api } from '@/services/api';

type TimeRange = 'YTD' | '6M' | '1Y' | '2Y' | 'Custom';

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

export function Analytics() {
  const { activePortfolio: pf, activePortfolioId } = usePortfolio();
  const [range, setRange] = useState<TimeRange>('2Y');
  const [benchmark, setBenchmark] = useState('');
  const [customBenchmark, setCustomBenchmark] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customData, setCustomData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // The effective benchmark is the custom ticker if set, else dropdown
  const effectiveBenchmark = customBenchmark.trim() || benchmark;

  // Fetch custom analytics when benchmark or custom dates change
  const fetchCustomAnalytics = useCallback(async () => {
    if (!activePortfolioId) return;
    const numId = parseInt(activePortfolioId);
    if (isNaN(numId)) return;

    const params: { benchmark?: string; start_date?: string; end_date?: string } = {};
    if (effectiveBenchmark) params.benchmark = effectiveBenchmark;
    if (range === 'Custom' && customStart) params.start_date = customStart;
    if (range === 'Custom' && customEnd) params.end_date = customEnd;
    // For non-custom ranges, we slice locally
    if (!effectiveBenchmark && range !== 'Custom') {
      setCustomData(null);
      return;
    }

    setLoading(true);
    try {
      const data = await api.portfolios.getAnalytics(numId, params);
      setCustomData(data);
    } catch (e) {
      console.error('Custom analytics failed', e);
      setCustomData(null);
    } finally {
      setLoading(false);
    }
  }, [activePortfolioId, effectiveBenchmark, range, customStart, customEnd]);

  useEffect(() => {
    if (effectiveBenchmark || range === 'Custom') {
      fetchCustomAnalytics();
    } else {
      setCustomData(null);
    }
  }, [effectiveBenchmark, range, fetchCustomAnalytics]);

  if (!pf) return <div className="text-slate-400 p-8">Select a portfolio first.</div>;

  // Use custom data if available, otherwise default portfolio data
  const source = customData || pf;
  const perfData = source.performanceData ?? pf.performanceData;
  const ddSource = source.drawdownData ?? pf.drawdownData;
  const rvSource = source.rollingVolatility ?? pf.rollingVolatility;
  const monthlySource = source.monthlyReturns ?? pf.monthlyReturns;
  const distSource = source.returnDistribution ?? pf.returnDistribution;
  const riskSource = source.riskMetrics ?? pf.riskMetrics;

  // Compute range slice (for non-custom, non-benchmark)
  const getSlice = () => {
    if (range === 'Custom') return undefined; // already filtered server-side
    if (range === 'YTD') {
      const yr = new Date().getFullYear();
      const ytdIdx = perfData.findIndex((p: any) => p.date?.startsWith(String(yr)));
      return ytdIdx >= 0 ? -1 * (perfData.length - ytdIdx) : undefined;
    }
    if (range === '6M') return -126;
    if (range === '1Y') return -252;
    return undefined; // 2Y = all
  };
  const rangeSlice = getSlice();
  const chartData = (rangeSlice ? perfData.slice(rangeSlice) : perfData).filter((_: unknown, i: number) => i % 2 === 0);
  const ddData = (rangeSlice ? ddSource.slice(rangeSlice) : ddSource).filter((_: unknown, i: number) => i % 2 === 0);
  const rvData = rangeSlice ? rvSource.slice(Math.floor(rangeSlice / 5)) : rvSource;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Performance Analytics</h1>
          <p className="text-slate-400 text-sm mt-1">Detailed return analysis and benchmark comparison</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Benchmark selector */}
          <select
            value={benchmark}
            onChange={e => { setBenchmark(e.target.value); setCustomBenchmark(''); }}
            className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            {BENCHMARK_OPTIONS.map(b => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
          {/* Custom ticker input */}
          <input
            type="text"
            placeholder="Custom ticker..."
            value={customBenchmark}
            onChange={e => { setCustomBenchmark(e.target.value.toUpperCase()); if (e.target.value) setBenchmark(''); }}
            className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 w-32 font-mono placeholder:text-slate-500"
          />
          {/* Time range */}
          <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-0.5">
            {(['YTD', '6M', '1Y', '2Y', 'Custom'] as TimeRange[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${range === r ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom date range inputs */}
      {range === 'Custom' && (
        <div className="flex items-center gap-3 bg-slate-800/30 border border-slate-700/30 rounded-lg px-4 py-3">
          <span className="text-xs text-slate-400">From:</span>
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="bg-slate-900/50 border border-slate-700 rounded-lg text-xs text-white px-2.5 py-1.5 focus:outline-none focus:border-blue-500" />
          <span className="text-xs text-slate-400">To:</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="bg-slate-900/50 border border-slate-700 rounded-lg text-xs text-white px-2.5 py-1.5 focus:outline-none focus:border-blue-500" />
          {loading && <span className="text-xs text-blue-400 animate-pulse ml-2">Loading...</span>}
        </div>
      )}

      {/* Cumulative Return */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Cumulative Return (%) — Portfolio vs Benchmark</h2>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gradPort" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.floor(chartData.length / 8)} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }} formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`]} />
            <Area type="monotone" dataKey="portfolioReturn" name="Portfolio" stroke="#3b82f6" strokeWidth={2} fill="url(#gradPort)" />
            <Line type="monotone" dataKey="benchmarkReturn" name="Benchmark" stroke="#6b7280" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Monthly Returns */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Monthly Returns (%)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlySource} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`]} />
              <Bar dataKey="portfolio" name="Portfolio" radius={[3, 3, 0, 0]}>
                {monthlySource.map((entry: { portfolio: number }, i: number) => (
                  <Cell key={i} fill={entry.portfolio >= 0 ? '#3b82f6' : '#ef4444'} />
                ))}
              </Bar>
              <Bar dataKey="benchmark" name="Benchmark" fill="#4b5563" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Return Distribution */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Return Distribution</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={distSource}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="bin" stroke="#64748b" tick={{ fontSize: 9 }} interval={4} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="frequency" name="Frequency" fill="#6366f1" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-3 text-xs text-slate-400">
            <span>Skewness: <span className="text-white font-mono">{riskSource.skewness}</span></span>
            <span>Kurtosis: <span className="text-white font-mono">{riskSource.kurtosis}</span></span>
            <span>Best Day: <span className="text-emerald-400 font-mono">+{riskSource.bestDay}%</span></span>
            <span>Worst Day: <span className="text-red-400 font-mono">{riskSource.worstDay}%</span></span>
          </div>
        </div>

        {/* Drawdown */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Drawdown Analysis</h2>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={ddData}>
              <defs>
                <linearGradient id="gradDD" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.floor(ddData.length / 6)} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`]} />
              <Area type="monotone" dataKey="drawdown" name="Drawdown" stroke="#ef4444" strokeWidth={1.5} fill="url(#gradDD)" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-3 text-xs text-slate-400">
            <span>Max Drawdown: <span className="text-red-400 font-mono">{riskSource.maxDrawdown}%</span></span>
            <span>Duration: <span className="text-white font-mono">{riskSource.maxDrawdownDuration} days</span></span>
          </div>
        </div>

        {/* Rolling Volatility */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Rolling 60-Day Volatility (%)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={rvData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.floor(rvData.length / 6)} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`]} />
              <Line type="monotone" dataKey="portfolio" name="Portfolio Vol" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="benchmark" name="Benchmark Vol" stroke="#6b7280" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

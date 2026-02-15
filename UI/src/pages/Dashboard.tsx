import { useState, useCallback, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3,
  Layers, Clock, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { usePortfolio } from '@/context/PortfolioContext';
import { api } from '@/services/api';

type TimeRange = 'YTD' | '6M' | '1Y' | '2Y';

const BENCH_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'SPY', label: 'SPY' },
  { value: 'QQQ', label: 'QQQ' },
  { value: 'IWM', label: 'IWM' },
  { value: 'VOO', label: 'VOO' },
  { value: 'BND', label: 'BND' },
  { value: 'GLD', label: 'GLD' },
];

const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export function Dashboard() {
  const { activePortfolio: pf, activePortfolioId, isLoading } = usePortfolio();
  const [dashRange, setDashRange] = useState<TimeRange>('2Y');
  const [dashBenchmark, setDashBenchmark] = useState('');
  const [customTicker, setCustomTicker] = useState('');
  const [dashPerfData, setDashPerfData] = useState<any[] | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  const effectiveBench = customTicker.trim() || dashBenchmark;

  const fetchDashPerf = useCallback(async () => {
    if (!activePortfolioId) return;
    const numId = parseInt(activePortfolioId);
    if (isNaN(numId)) return;
    if (!effectiveBench) { setDashPerfData(null); return; }
    setDashLoading(true);
    try {
      const data = await api.portfolios.getAnalytics(numId, { benchmark: effectiveBench });
      setDashPerfData(data?.performanceData ?? null);
    } catch { setDashPerfData(null); }
    finally { setDashLoading(false); }
  }, [activePortfolioId, effectiveBench]);

  useEffect(() => { fetchDashPerf(); }, [effectiveBench, fetchDashPerf]);

  if (isLoading) {
    return <div className="p-10 text-center text-slate-400">Loading portfolio data...</div>;
  }

  if (!pf) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl text-white font-semibold mb-2">No Portfolio Selected</h2>
        <p className="text-slate-400">Create a portfolio to get started.</p>
        {/* Add a button here to open create modal if possible, or just instruction */}
      </div>
    );
  }

  const summary = pf.summary;
  const currSym = summary.currency === 'EUR' ? '€' : '$';
  const fmt = (n: number) => `${currSym}${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}${n < 0 ? '' : ''}`;
  const fmtSigned = (n: number) => `${n < 0 ? '-' : ''}${currSym}${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  // Apply time range to performance data
  const rawPerf = dashPerfData ?? pf.performanceData ?? [];
  const getSlice = () => {
    if (dashRange === 'YTD') {
      const yr = new Date().getFullYear();
      const ytdIdx = rawPerf.findIndex((p: any) => p.date?.startsWith(String(yr)));
      return ytdIdx >= 0 ? -1 * (rawPerf.length - ytdIdx) : undefined;
    }
    if (dashRange === '6M') return -126;
    if (dashRange === '1Y') return -252;
    return undefined;
  };
  const rangeSlice = getSlice();
  const chartData = (rangeSlice ? rawPerf.slice(rangeSlice) : rawPerf).filter((_: unknown, i: number) => i % 3 === 0);

  // Top daily movers (sorted by absolute daily change)
  const movers = [...pf.positions]
    .filter(p => p.dailyChange !== 0)
    .sort((a, b) => Math.abs(b.dailyChange) - Math.abs(a.dailyChange))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{summary.name}</h1>
        <p className="text-slate-400 text-sm mt-1">
          {summary.currency} • Benchmark: {summary.benchmark} • Inception: {summary.inceptionDate}
        </p>
        {summary.description && <p className="text-slate-500 text-xs mt-1">{summary.description}</p>}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Portfolio Value"
          value={fmt(summary.totalValue)}
          icon={DollarSign}
          iconColor="text-blue-400 bg-blue-500/10"
        />
        <KPICard
          title="Daily P&L"
          value={fmtSigned(summary.dailyPnl)}
          subtitle={pct(summary.dailyPnlPercent)}
          positive={summary.dailyPnl >= 0}
          icon={summary.dailyPnl >= 0 ? TrendingUp : TrendingDown}
          iconColor={summary.dailyPnl >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}
        />
        <KPICard
          title="Total Return"
          value={pct(summary.totalPnlPercent)}
          subtitle={fmtSigned(summary.totalPnl)}
          positive={summary.totalPnl >= 0}
          icon={BarChart3}
          iconColor="text-violet-400 bg-violet-500/10"
        />
        <KPICard
          title="Sharpe Ratio"
          value={pf.riskMetrics.sharpeRatio.toFixed(2)}
          subtitle={`Vol: ${pf.riskMetrics.annualizedVolatility.toFixed(1)}%`}
          icon={Layers}
          iconColor="text-amber-400 bg-amber-500/10"
        />
      </div>

      {/* Main charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Performance Chart */}
        <div className="xl:col-span-2 bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-white">Cumulative Performance</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={dashBenchmark} onChange={e => { setDashBenchmark(e.target.value); setCustomTicker(''); }}
                className="bg-slate-900/50 border border-slate-700/50 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-blue-500">
                {BENCH_OPTIONS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
              <input type="text" placeholder="Ticker..." value={customTicker}
                onChange={e => { setCustomTicker(e.target.value.toUpperCase()); if (e.target.value) setDashBenchmark(''); }}
                className="bg-slate-900/50 border border-slate-700/50 rounded-lg px-2 py-1 text-[11px] text-white w-20 font-mono placeholder:text-slate-500 focus:outline-none focus:border-blue-500" />
              <div className="flex gap-0.5 bg-slate-900/50 border border-slate-700/50 rounded-lg p-0.5">
                {(['YTD', '6M', '1Y', '2Y'] as TimeRange[]).map(r => (
                  <button key={r} onClick={() => setDashRange(r)}
                    className={`px-2 py-1 text-[11px] font-medium rounded-md transition-all ${dashRange === r ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>{r}</button>
                ))}
              </div>
              {dashLoading && <span className="text-[10px] text-blue-400 animate-pulse">Loading...</span>}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.floor(chartData.length / 8)} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(2)}%`]}
              />
              <Line type="monotone" dataKey="portfolioReturn" name="Portfolio" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="benchmarkReturn" name="Benchmark" stroke="#6b7280" strokeWidth={1.5} dot={false} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Allocation */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Asset Allocation</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pf.allocationByClass} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                {pf.allocationByClass.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} formatter={(v: number | undefined) => [`${v ?? 0}%`]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {pf.allocationByClass.map(a => (
              <div key={a.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                  <span className="text-slate-300">{a.name}</span>
                </div>
                <span className="text-slate-400 font-mono">{a.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Key Risk Metrics */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Key Risk Metrics</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <MetricRow label="Ann. Return" value={pct(pf.riskMetrics.annualizedReturn)} positive />
            <MetricRow label="Ann. Volatility" value={`${pf.riskMetrics.annualizedVolatility.toFixed(2)}%`} />
            <MetricRow label="Sharpe Ratio" value={pf.riskMetrics.sharpeRatio.toFixed(2)} positive />
            <MetricRow label="Sortino Ratio" value={pf.riskMetrics.sortinoRatio.toFixed(2)} positive />
            <MetricRow label="Max Drawdown" value={`${pf.riskMetrics.maxDrawdown.toFixed(2)}%`} positive={false} />
            <MetricRow label="Beta" value={pf.riskMetrics.beta.toFixed(2)} />
            <MetricRow label="Alpha" value={`${pf.riskMetrics.alpha.toFixed(2)}%`} positive />
            <MetricRow label="VaR (95%)" value={`${pf.riskMetrics.var95.toFixed(2)}%`} positive={false} />
            <MetricRow label="Win Rate" value={`${pf.riskMetrics.winRate}%`} positive />
            <MetricRow label="R²" value={pf.riskMetrics.rSquared.toFixed(2)} />
          </div>
        </div>

        {/* Top Daily Movers */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Top Daily Movers</h2>
          {movers.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">No price movement data available</p>
          ) : (
            <div className="space-y-2.5">
              {movers.map(m => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-slate-700/30">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${m.dailyChange >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {m.dailyChange >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="text-sm text-white font-medium">{m.symbol}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[120px]">{m.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-mono font-semibold ${m.dailyChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {m.dailyChange >= 0 ? '+' : ''}{m.dailyChange.toFixed(2)}%
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">{currSym}{m.currentPrice.toFixed(2)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {pf.recentActivity.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">No recent activity</p>
            ) : pf.recentActivity.map((a, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="shrink-0 mt-0.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono">{a.date}</span>
                    <span className="text-xs font-medium text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{a.action}</span>
                  </div>
                  <p className="text-slate-300 text-xs mt-0.5 truncate">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, subtitle, positive, icon: Icon, iconColor }: {
  title: string; value: string; subtitle?: string; positive?: boolean; icon: React.ElementType; iconColor: string;
}) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
      {subtitle && (
        <div className={`text-xs mt-1 flex items-center gap-1 ${positive === undefined ? 'text-slate-400' : positive ? 'text-emerald-400' : 'text-red-400'}`}>
          {positive !== undefined && (positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />)}
          {subtitle}
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-700/30">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-sm font-mono font-medium ${positive === undefined ? 'text-slate-200' : positive ? 'text-emerald-400' : 'text-red-400'}`}>
        {value}
      </span>
    </div>
  );
}

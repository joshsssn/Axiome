import { useState } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldAlert, TrendingDown, BarChart3, Activity } from 'lucide-react';

function getCorrelationColor(val: number): string {
  if (val >= 0.7) return 'bg-blue-500 text-white';
  if (val >= 0.4) return 'bg-blue-400/60 text-white';
  if (val >= 0.1) return 'bg-blue-300/30 text-blue-200';
  if (val >= -0.1) return 'bg-slate-700 text-slate-300';
  if (val >= -0.4) return 'bg-red-300/30 text-red-200';
  if (val >= -0.7) return 'bg-red-400/60 text-white';
  return 'bg-red-500 text-white';
}

export function Risk() {
  const { activePortfolio: pf } = usePortfolio();
  const [varDays, setVarDays] = useState(1);
  if (!pf) return <div className="text-slate-400 p-8">Select a portfolio first.</div>;
  const m = pf.riskMetrics;

  // Scale VaR/CVaR by sqrt(days)
  const scaleFactor = Math.sqrt(varDays);
  const scaledVar95 = parseFloat((m.var95 * scaleFactor).toFixed(2));
  const scaledVar99 = parseFloat((m.var99 * scaleFactor).toFixed(2));
  const scaledCvar95 = parseFloat((m.cvar95 * scaleFactor).toFixed(2));
  const scaledCvar99 = parseFloat((m.cvar99 * scaleFactor).toFixed(2));
  const varLabel = varDays === 1 ? '1-day' : `${varDays}-day`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Risk Analysis</h1>
        <p className="text-slate-400 text-sm mt-1">Comprehensive risk metrics, VaR analysis, and correlation structure</p>
      </div>

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <RiskCard icon={ShieldAlert} color="text-amber-400 bg-amber-500/10" label="VaR (95%)" value={`${scaledVar95}%`} sub={`${varLabel} parametric`} />
        <RiskCard icon={TrendingDown} color="text-red-400 bg-red-500/10" label="Max Drawdown" value={`${m.maxDrawdown}%`} sub={`${m.maxDrawdownDuration} days`} />
        <RiskCard icon={BarChart3} color="text-blue-400 bg-blue-500/10" label="Sharpe Ratio" value={m.sharpeRatio.toFixed(2)} sub={`Vol: ${m.annualizedVolatility}%`} />
        <RiskCard icon={Activity} color="text-violet-400 bg-violet-500/10" label="Beta" value={m.beta.toFixed(2)} sub={`Alpha: ${m.alpha}%`} />
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

      {/* Full Metrics */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Risk & Return Measures</h2>
          <div className="space-y-0">
            <SectionHeader title="Return Statistics" />
            <MetricRow label="Annualized Return" value={`${m.annualizedReturn}%`} />
            <MetricRow label="Best Day" value={`+${m.bestDay}%`} positive />
            <MetricRow label="Worst Day" value={`${m.worstDay}%`} positive={false} />
            <MetricRow label="Best Month" value={`+${m.bestMonth}%`} positive />
            <MetricRow label="Worst Month" value={`${m.worstMonth}%`} positive={false} />
            <MetricRow label="Positive Months" value={`${m.positiveMonths}%`} />
            <MetricRow label="Win Rate" value={`${m.winRate}%`} />
            <SectionHeader title="Volatility Measures" />
            <MetricRow label="Annualized Volatility" value={`${m.annualizedVolatility}%`} />
            <MetricRow label="Downside Deviation" value={`${m.downsideDeviation}%`} />
            <MetricRow label="Skewness" value={m.skewness.toFixed(2)} />
            <MetricRow label="Kurtosis" value={m.kurtosis.toFixed(2)} />
            <SectionHeader title={`Value at Risk (${varLabel})`} />
            <MetricRow label={`VaR (95%) — ${varLabel}`} value={`${scaledVar95}%`} positive={false} />
            <MetricRow label={`VaR (99%) — ${varLabel}`} value={`${scaledVar99}%`} positive={false} />
            <MetricRow label={`CVaR (95%) — ${varLabel}`} value={`${scaledCvar95}%`} positive={false} />
            <MetricRow label={`CVaR (99%) — ${varLabel}`} value={`${scaledCvar99}%`} positive={false} />
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Risk-Adjusted & Benchmark Metrics</h2>
          <div className="space-y-0">
            <SectionHeader title="Risk-Adjusted Ratios" />
            <MetricRow label="Sharpe Ratio" value={m.sharpeRatio.toFixed(2)} />
            <MetricRow label="Sortino Ratio" value={m.sortinoRatio.toFixed(2)} />
            <MetricRow label="Calmar Ratio" value={m.calmarRatio.toFixed(2)} />
            <MetricRow label="Information Ratio" value={m.informationRatio.toFixed(2)} />
            <SectionHeader title="Benchmark-Relative" />
            <MetricRow label="Alpha" value={`${m.alpha}%`} positive />
            <MetricRow label="Beta" value={m.beta.toFixed(2)} />
            <MetricRow label="Tracking Error" value={`${m.trackingError}%`} />
            <MetricRow label="R-Squared" value={m.rSquared.toFixed(2)} />
            <SectionHeader title="Drawdown Analysis" />
            <MetricRow label="Max Drawdown" value={`${m.maxDrawdown}%`} positive={false} />
            <MetricRow label="Drawdown Duration" value={`${m.maxDrawdownDuration} days`} />
          </div>
        </div>
      </div>

      {/* Correlation Matrix */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Correlation Matrix</h2>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="px-2 py-2" />
                {pf.correlationMatrix.labels.map((l: string) => (
                  <th key={l} className="px-2 py-2 text-slate-400 font-mono font-medium max-w-[56px] truncate" title={l}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pf.correlationMatrix.labels.map((label: string, i: number) => (
                <tr key={label}>
                  <td className="px-2 py-1.5 text-slate-400 font-mono font-medium max-w-[56px] truncate" title={label}>{label}</td>
                  {pf.correlationMatrix.data[i].map((val: number, j: number) => (
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
        <div className="flex items-center justify-center gap-2 mt-4 text-[10px]">
          <span className="text-slate-500">Strong Negative</span>
          <div className="flex gap-0.5">
            {['bg-red-500', 'bg-red-400/60', 'bg-red-300/30', 'bg-slate-700', 'bg-blue-300/30', 'bg-blue-400/60', 'bg-blue-500'].map((c, i) => (
              <div key={i} className={`w-6 h-3 rounded-sm ${c}`} />
            ))}
          </div>
          <span className="text-slate-500">Strong Positive</span>
        </div>
      </div>

      {/* Rolling Correlation */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Rolling 60-Day Correlation with Benchmark</h2>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={pf.rollingCorrelation}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} interval={Math.floor(pf.rollingCorrelation.length / 8)} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 1]} tickFormatter={(v: number) => v.toFixed(1)} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number | undefined) => [(v ?? 0).toFixed(3), 'Correlation']} />
            <Line type="monotone" dataKey="correlation" name="Correlation" stroke="#8b5cf6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function RiskCard({ icon: Icon, color, label, value, sub }: {
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

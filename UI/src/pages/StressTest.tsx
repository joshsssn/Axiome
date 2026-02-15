import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { usePortfolio } from '@/context/PortfolioContext';
import type { StressScenario } from '@/data/mockData';
import { Zap, AlertTriangle, TrendingDown, Clock, Plus, X, Trash2, Check, Sliders } from 'lucide-react';
import { seededRandom } from '@/data/mockData';

export function StressTest() {
  const { activePortfolio: pf, addStressScenario, removeStressScenario } = usePortfolio();
  const [selectedScenario, setSelectedScenario] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Create form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<'historical' | 'parametric'>('parametric');
  const [formEquityShock, setFormEquityShock] = useState(-20);
  const [formBondShock, setFormBondShock] = useState(0);
  const [formCommodityShock, setFormCommodityShock] = useState(-10);

  if (!pf) return <div className="text-slate-400 p-8">Select a portfolio first.</div>;

  const scenario = pf.stressScenarios[selectedScenario] || pf.stressScenarios[0];
  if (!scenario) return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Zap className="w-7 h-7 text-amber-400" /> Stress Testing
        </h1>
        <p className="text-slate-400 text-sm mt-1">Simulate market shocks and evaluate portfolio resilience</p>
      </div>
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-10 text-center">
        <AlertTriangle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-white mb-2">No Stress Scenarios</h2>
        <p className="text-sm text-slate-400 mb-6">Create your first stress test scenario to analyze portfolio resilience under adverse market conditions.</p>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Create Scenario
        </button>
      </div>
      {renderCreateModal()}
    </div>
  );

  const impactBars = [
    { name: 'Equities', impact: scenario.equityShock },
    { name: 'Bonds', impact: scenario.bondShock },
    { name: 'Commodities', impact: scenario.commodityShock },
    { name: 'Portfolio', impact: scenario.portfolioImpact },
  ];

  const handleCreate = () => {
    if (!formName.trim()) return;

    // Compute portfolio impact from position weights and shocks
    // Use allocationByClass if available, otherwise compute from positions directly
    let equityWeight = 0;
    let bondWeight = 0;
    let commodityWeight = 0;

    if (pf.allocationByClass.length > 0) {
      equityWeight = pf.allocationByClass
        .filter(a => {
          const n = a.name.toLowerCase();
          return n.includes('equity') || n.includes('stock') || n.includes('option') || n === 'etf';
        })
        .reduce((s, a) => s + a.value, 0) / 100;
      bondWeight = pf.allocationByClass
        .filter(a => {
          const n = a.name.toLowerCase();
          return n.includes('bond') || n.includes('fixed income');
        })
        .reduce((s, a) => s + a.value, 0) / 100;
      commodityWeight = pf.allocationByClass
        .filter(a => {
          const n = a.name.toLowerCase();
          return n.includes('commodity') || n.includes('gold') || n.includes('oil');
        })
        .reduce((s, a) => s + a.value, 0) / 100;
    }

    // If no allocations matched, derive from positions asset classes directly
    if (equityWeight === 0 && bondWeight === 0 && commodityWeight === 0 && pf.positions.length > 0) {
      const totalVal = pf.positions.reduce((s, p) => s + p.quantity * p.currentPrice, 0);
      if (totalVal > 0) {
        pf.positions.forEach(p => {
          const w = (p.quantity * p.currentPrice) / totalVal;
          const ac = p.assetClass.toLowerCase();
          if (ac.includes('bond') || ac.includes('fixed')) bondWeight += w;
          else if (ac.includes('commodity') || ac.includes('gold') || ac.includes('oil')) commodityWeight += w;
          else equityWeight += w;  // Default to equity for stocks, ETFs, options, etc.
        });
      }
    }

    // If still all zero (e.g. single equities), default to 100% equity
    if (equityWeight === 0 && bondWeight === 0 && commodityWeight === 0) {
      equityWeight = 1;
    }

    const portfolioImpact = parseFloat((
      equityWeight * formEquityShock +
      bondWeight * formBondShock +
      commodityWeight * formCommodityShock
    ).toFixed(1));

    // Find worst position
    const positions = pf.positions;
    let worstSymbol = positions[0]?.symbol || 'N/A';
    let worstImpact = 0;
    positions.forEach(p => {
      let shock = 0;
      if (p.assetClass === 'Equity' || p.assetClass === 'Option') shock = formEquityShock;
      else if (p.assetClass.includes('Bond')) shock = formBondShock;
      else if (p.assetClass.includes('Commodity')) shock = formCommodityShock;
      else shock = formEquityShock * 0.5;

      // Add some variance per position
      const posImpact = shock * (0.8 + seededRandom(p.id * 73) * 0.6);
      if (posImpact < worstImpact) {
        worstImpact = posImpact;
        worstSymbol = p.symbol;
      }
    });

    addStressScenario({
      name: formName.trim(),
      description: formDesc.trim() || `Custom ${formType} scenario`,
      type: formType,
      equityShock: formEquityShock,
      bondShock: formBondShock,
      commodityShock: formCommodityShock,
      portfolioImpact,
      worstPosition: worstSymbol,
      worstPositionImpact: parseFloat(worstImpact.toFixed(1)),
    });

    // Select the newly created one (will be at the end after state update)
    // Use setTimeout to let React state update first
    const newIdx = pf.stressScenarios.length; // current length = index of new item after add
    setTimeout(() => setSelectedScenario(newIdx), 0);

    // Reset
    setFormName('');
    setFormDesc('');
    setFormType('parametric');
    setFormEquityShock(-20);
    setFormBondShock(0);
    setFormCommodityShock(-10);
    setShowCreateModal(false);
  };

  const handleDelete = (id: number) => {
    removeStressScenario(id);
    setDeleteConfirm(null);
    if (selectedScenario >= pf.stressScenarios.length - 1) {
      setSelectedScenario(Math.max(0, pf.stressScenarios.length - 2));
    }
  };

  // Severity indicator for create form
  const totalShock = Math.abs(formEquityShock) + Math.abs(formBondShock) + Math.abs(formCommodityShock);
  const severity = totalShock < 15 ? 'Low' : totalShock < 40 ? 'Moderate' : totalShock < 70 ? 'High' : 'Severe';
  const severityColor = totalShock < 15 ? 'text-emerald-400 bg-emerald-500/10' : totalShock < 40 ? 'text-amber-400 bg-amber-500/10' : totalShock < 70 ? 'text-orange-400 bg-orange-500/10' : 'text-red-400 bg-red-500/10';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Stress Testing</h1>
          <p className="text-slate-400 text-sm mt-1">Historical replay and parametric shock analysis</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" /> Create Scenario
        </button>
      </div>

      {/* Scenario Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {pf.stressScenarios.map((s: StressScenario, i: number) => (
          <div key={s.id} className="relative group">
            <button onClick={() => setSelectedScenario(i)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${selectedScenario === i
                ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/20'
                : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'}`}>
              <div className="flex items-center gap-2 mb-2">
                {s.type === 'historical' ? <Clock className="w-3.5 h-3.5 text-amber-400" /> : <Zap className="w-3.5 h-3.5 text-violet-400" />}
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${s.type === 'historical' ? 'bg-amber-500/10 text-amber-400' : 'bg-violet-500/10 text-violet-400'}`}>
                  {s.type}
                </span>
                {s.id > 100 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                    Custom
                  </span>
                )}
              </div>
              <div className="text-sm font-semibold text-white mb-1 pr-6">{s.name}</div>
              <div className="text-xs text-slate-400 mb-3 line-clamp-2">{s.description}</div>
              <div className={`text-xl font-bold font-mono ${s.portfolioImpact < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {s.portfolioImpact > 0 ? '+' : ''}{s.portfolioImpact}%
              </div>
            </button>

            {/* Delete button for custom scenarios */}
            {s.id > 100 && (
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                {deleteConfirm === s.id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                      className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                      title="Confirm"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteConfirm(null); }}
                      className="p-1 rounded bg-slate-700/50 text-slate-400 hover:bg-slate-700"
                      title="Cancel"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteConfirm(s.id); }}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                    title="Delete scenario"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Scenario Detail */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h2 className="text-sm font-semibold text-white mb-1">{scenario.name}</h2>
          <p className="text-xs text-slate-400 mb-4">Projected impact by asset class</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={impactBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(1)}%`, 'Impact']} />
              <Bar dataKey="impact" radius={[4, 4, 0, 0]}>
                {impactBars.map((entry, i) => (
                  <Cell key={i} fill={entry.impact >= 0 ? '#10b981' : entry.name === 'Portfolio' ? '#f59e0b' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white">Scenario Results</h2>
          <div className="grid grid-cols-2 gap-4">
            <ResultCard icon={TrendingDown} label="Portfolio Impact" value={`${scenario.portfolioImpact}%`} color="text-red-400" />
            <ResultCard icon={AlertTriangle} label="Worst Position" value={scenario.worstPosition} sub={`${scenario.worstPositionImpact}%`} color="text-amber-400" />
          </div>
          <div className="space-y-0">
            <DetailRow label="Equity Shock" value={`${scenario.equityShock}%`} negative={scenario.equityShock < 0} />
            <DetailRow label="Bond Shock" value={`${scenario.bondShock}%`} negative={scenario.bondShock < 0} />
            <DetailRow label="Commodity Shock" value={`${scenario.commodityShock}%`} negative={scenario.commodityShock < 0} />
            <DetailRow label="Portfolio Impact" value={`${scenario.portfolioImpact}%`} negative={scenario.portfolioImpact < 0} />
            <DetailRow label="Worst Position" value={`${scenario.worstPosition} (${scenario.worstPositionImpact}%)`} negative />
            <DetailRow label="Scenario Type" value={scenario.type === 'historical' ? 'Historical Replay' : 'Parametric Shock'} />
          </div>
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-400">
                <span className="text-red-400 font-medium">Risk Warning:</span> This scenario would result in a portfolio loss of approximately{' '}
                <span className="text-red-400 font-mono font-medium">${Math.abs(Math.round(pf.summary.totalValue * scenario.portfolioImpact / 100)).toLocaleString()}</span>
                {' '}based on current portfolio value.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Position-level contributions */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Position-Level Stress Impact Comparison</h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={pf.stressContributions}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="symbol" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(1)}%`]} />
            <Bar dataKey="crisis2008" name="2008 Crisis" fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Bar dataKey="covid2020" name="COVID 2020" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            <Bar dataKey="rateShock" name="2022 Rates" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-6 mt-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-500" /> 2008 Financial Crisis</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-500" /> COVID 2020</span>
          <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-violet-500" /> 2022 Rate Shock</span>
        </div>
      </div>

      {/* Create Scenario Modal */}
      {renderCreateModal()}
    </div>
  );

  function renderCreateModal() {
    if (!showCreateModal) return null;
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-400" />
                Create Custom Scenario
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Name & Description */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">Scenario Name <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. Tech Bubble Burst, China Crisis"
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">Description</label>
                  <input
                    type="text"
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    placeholder="Brief description of the scenario..."
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600"
                  />
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="text-xs text-slate-400 block mb-2 font-medium">Scenario Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFormType('parametric')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                      formType === 'parametric'
                        ? 'bg-violet-600/20 border-violet-500 text-violet-400'
                        : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    <Zap className="w-4 h-4" /> Parametric
                  </button>
                  <button
                    onClick={() => setFormType('historical')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${
                      formType === 'historical'
                        ? 'bg-amber-600/20 border-amber-500 text-amber-400'
                        : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                    }`}
                  >
                    <Clock className="w-4 h-4" /> Historical
                  </button>
                </div>
              </div>

              {/* Shock Parameters */}
              <div>
                <label className="text-xs text-slate-400 block mb-3 font-medium">Shock Parameters</label>
                <div className="space-y-4">
                  <ShockSlider
                    label="Equity Shock"
                    value={formEquityShock}
                    onChange={setFormEquityShock}
                    color="blue"
                  />
                  <ShockSlider
                    label="Bond Shock"
                    value={formBondShock}
                    onChange={setFormBondShock}
                    color="indigo"
                  />
                  <ShockSlider
                    label="Commodity Shock"
                    value={formCommodityShock}
                    onChange={setFormCommodityShock}
                    color="amber"
                  />
                </div>
              </div>

              {/* Severity indicator */}
              <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-xs text-slate-400">Estimated Severity</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${severityColor}`}>
                  {severity}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!formName.trim()}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Create Scenario
                </button>
              </div>
            </div>
          </div>
        </div>
      );
  }
}

function ShockSlider({ label, value, onChange, color }: {
  label: string; value: number; onChange: (v: number) => void; color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'accent-blue-500',
    indigo: 'accent-indigo-500',
    amber: 'accent-amber-500',
  };
  return (
    <div className="flex items-center gap-4">
      <div className="w-28 text-xs text-slate-400 shrink-0">{label}</div>
      <input
        type="range"
        min={-60}
        max={40}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className={`flex-1 h-1.5 rounded-full appearance-none bg-slate-700 cursor-pointer ${colorClasses[color] || 'accent-blue-500'}`}
      />
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-18 bg-slate-900/50 border border-slate-700 rounded-lg text-xs text-white px-2 py-1.5 font-mono text-center focus:outline-none focus:border-blue-500"
        step={1}
      />
      <span className={`text-xs font-mono w-6 ${value < 0 ? 'text-red-400' : value > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>%</span>
    </div>
  );
}

function ResultCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-4">
      <Icon className={`w-5 h-5 ${color} mb-2`} />
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5 font-mono">{sub}</div>}
    </div>
  );
}

function DetailRow({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-700/20">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`text-sm font-mono font-medium ${negative === undefined ? 'text-slate-200' : negative ? 'text-red-400' : 'text-emerald-400'}`}>
        {value}
      </span>
    </div>
  );
}

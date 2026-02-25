import { useState, useRef, useEffect } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { api } from '@/services/api';
import { ChevronDown, Plus, Briefcase, DollarSign, X, Trash2, Settings, Download, Upload } from 'lucide-react';

export function TopBar() {
  const { portfolios, activePortfolio, activePortfolioId, setActivePortfolioId, createPortfolio, deletePortfolio, updatePortfolioMeta, refreshPortfolios } = usePortfolio();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // Create Form State
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCurrency, setFormCurrency] = useState<'USD' | 'EUR'>('USD');
  const [formBenchmark, setFormBenchmark] = useState('');

  // Edit Form State
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editBenchmark, setEditBenchmark] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Pre-fill edit form when opening
  useEffect(() => {
    if (editModalOpen && activePortfolio) {
      setEditName(activePortfolio.summary.name);
      setEditDesc(activePortfolio.summary.description);
      setEditBenchmark(activePortfolio.summary.benchmark);
    }
  }, [editModalOpen, activePortfolio]);

  const handleCreate = () => {
    if (!formName.trim()) return;
    createPortfolio({
      name: formName.trim(),
      description: formDesc.trim(),
      currency: formCurrency,
      benchmark: formBenchmark.trim().toUpperCase() || 'SPY',
    });
    setFormName('');
    setFormDesc('');
    setFormCurrency('USD');
    setFormBenchmark('');
    setModalOpen(false);
  };

  const handleUpdate = () => {
    if (!editName.trim()) return;
    updatePortfolioMeta({
      name: editName.trim(),
      description: editDesc.trim(),
      benchmark: editBenchmark.trim().toUpperCase()
    });
    setEditModalOpen(false);
  };

  const handleExportJson = async () => {
    if (!activePortfolio) return;
    const numId = parseInt(activePortfolioId);
    if (isNaN(numId)) return;
    try {
      const data = await api.portfolioJson.exportPortfolio(numId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activePortfolio.summary.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error('Export failed', e); }
    setDropdownOpen(false);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);
        await api.portfolioJson.importPortfolio(data);
        refreshPortfolios();
      } catch (err) { console.error('Import failed', err); alert('Import failed: ' + (err instanceof Error ? err.message : String(err))); }
    };
    reader.readAsText(file);
    e.target.value = '';
    setDropdownOpen(false);
  };

  const currencySymbol = activePortfolio ? (activePortfolio.summary.currency === 'EUR' ? '€' : '$') : '$';
  const fmtValue = activePortfolio ? `${currencySymbol}${activePortfolio.summary.totalValue.toLocaleString()}` : '$0';

  return (
    <>
      <div className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800/60">
        <div className="flex items-center justify-between px-6 lg:px-8 h-14">
          {/* Portfolio Switcher */}
          <div className="flex items-center gap-2">
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-slate-800/60 transition-colors group"
              >
                {/* ... existing button content ... */}
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
                  <Briefcase className="w-4 h-4 text-white" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-white leading-tight">
                    {activePortfolio ? activePortfolio.summary.name : 'Select Portfolio'}
                  </div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    {activePortfolio ? `${activePortfolio.summary.currency} • Benchmark: ${activePortfolio.summary.benchmark}` : 'No portfolio selected'}
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Content */}
              {dropdownOpen && (
                <div className="absolute left-0 top-full mt-1 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                  <div className="p-2 border-b border-slate-700/50">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 py-1">Your Portfolios</div>
                  </div>
                  <div className="max-h-72 overflow-y-auto p-1">
                    {portfolios.map(pf => (
                      <div
                        key={pf.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all group/item ${pf.id === activePortfolioId ? 'bg-blue-600/15 text-blue-400' : 'hover:bg-slate-700/50 text-slate-300'
                          }`}
                      >
                        <div
                          className="flex-1 min-w-0"
                          onClick={() => { setActivePortfolioId(pf.id); setDropdownOpen(false); }}
                        >
                          <div className="text-sm font-medium truncate">{pf.summary.name}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-mono font-medium ${pf.summary.currency === 'EUR' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
                              }`}>
                              {pf.summary.currency}
                            </span>
                            <span>{pf.summary.positionCount} pos</span>
                          </div>
                        </div>
                        {portfolios.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deletePortfolio(pf.id); }}
                            className="opacity-0 group-hover/item:opacity-100 p-1.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
                            title="Delete portfolio"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="p-2 border-t border-slate-700/50 space-y-0.5">
                    <button
                      onClick={() => { setDropdownOpen(false); setModalOpen(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-blue-400 hover:bg-blue-500/10 transition-colors font-medium"
                    >
                      <Plus className="w-4 h-4" /> Create New Portfolio
                    </button>
                    {activePortfolio && (
                      <button
                        onClick={handleExportJson}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-700/50 hover:text-white transition-colors font-medium"
                      >
                        <Download className="w-4 h-4" /> Export as JSON
                      </button>
                    )}
                    <button
                      onClick={() => jsonInputRef.current?.click()}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-700/50 hover:text-white transition-colors font-medium"
                    >
                      <Upload className="w-4 h-4" /> Import from JSON
                    </button>
                    <input ref={jsonInputRef} type="file" accept=".json" className="hidden" onChange={handleImportJson} />
                  </div>
                </div>
              )}
            </div>

            {/* Edit Button (Only visible when portfolio is active) */}
            {activePortfolio && (
              <button
                onClick={() => setEditModalOpen(true)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Portfolio Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Right side info (remains same) */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 text-slate-400">
                <DollarSign className="w-3.5 h-3.5" />
                <span className="font-mono text-white font-medium">{fmtValue}</span>
              </div>
              <div className="w-px h-4 bg-slate-700" />
              <span className={`font-mono font-medium ${activePortfolio && activePortfolio.summary.dailyPnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {activePortfolio ? (activePortfolio.summary.dailyPnlPercent >= 0 ? '+' : '') + activePortfolio.summary.dailyPnlPercent.toFixed(2) : '0.00'}% today
              </span>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New
            </button>
          </div>
        </div>
      </div>

      {/* Edit Portfolio Modal */}
      {editModalOpen && activePortfolio && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEditModalOpen(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Edit Portfolio</h2>
              <button onClick={() => setEditModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Portfolio Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Description</label>
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Benchmark Ticker</label>
                <input
                  type="text"
                  value={editBenchmark}
                  onChange={e => setEditBenchmark(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div className="flex gap-3 pt-3">
                <button
                  onClick={() => setEditModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={!editName.trim()}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Portfolio Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setModalOpen(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Create New Portfolio</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Portfolio Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. US Growth Equities"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Description</label>
                <textarea
                  placeholder="Brief portfolio strategy description..."
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">Reference Currency</label>
                  <div className="flex gap-2">
                    {(['USD', 'EUR'] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => setFormCurrency(c)}
                        className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-all border ${formCurrency === c
                          ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                          : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                          }`}
                      >
                        {c === 'USD' ? '$ USD' : '€ EUR'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">Benchmark Ticker</label>
                  <input
                    type="text"
                    placeholder="e.g. SPY, QQQ, ^GSPC"
                    value={formBenchmark}
                    onChange={e => setFormBenchmark(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600 font-mono"
                  />
                  <span className="text-[10px] text-slate-600 mt-0.5 block">Leave empty for no benchmark</span>
                </div>
              </div>
              <div className="flex gap-3 pt-3">
                <button
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!formName.trim()}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Create Portfolio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

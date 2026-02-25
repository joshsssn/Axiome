import { useState, useRef } from 'react';
import { usePortfolio } from '@/context/PortfolioContext';
import { api } from '@/services/api';
import {
  ArrowUpRight, ArrowDownRight, Search,
  Plus, X, Trash2, ArrowLeftRight, TrendingUp, TrendingDown,
  Loader2
} from 'lucide-react';

const typeConfig: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  buy: { label: 'Buy', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: ArrowDownRight },
  sell: { label: 'Sell', color: 'text-red-400', bg: 'bg-red-500/10', icon: ArrowUpRight },
};

export function Transactions() {
  const { activePortfolio, addTransaction, removeTransaction } = usePortfolio();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Add form state
  const [formType, setFormType] = useState<'buy' | 'sell'>('buy');
  const [formSymbol, setFormSymbol] = useState('');
  const [formName, setFormName] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formQty, setFormQty] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Ticker search state for buy
  const [tickerSuggestions, setTickerSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [tickerSearchLoading, setTickerSearchLoading] = useState(false);
  const [priceFetched, setPriceFetched] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const tickerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // For sell: show available positions
  const positions = activePortfolio?.positions ?? [];
  const availableForSell = positions.filter(p => p.quantity > 0);

  const handleSelectSellPosition = (symbol: string) => {
    const pos = positions.find(p => p.symbol === symbol);
    if (pos) {
      setFormSymbol(pos.symbol);
      setFormName(pos.name);
      setFormPrice(pos.currentPrice.toFixed(2));
    }
  };

  // Ticker search for buy (like Positions.tsx)
  const handleTickerInput = (value: string) => {
    setFormSymbol(value);
    setPriceFetched(false);
    setPriceError('');
    if (tickerSearchTimer.current) clearTimeout(tickerSearchTimer.current);
    if (value.trim().length < 1) { setTickerSuggestions([]); setShowSuggestions(false); return; }
    setTickerSearchLoading(true);
    tickerSearchTimer.current = setTimeout(async () => {
      try {
        const results = await api.marketData.searchTicker(value.trim());
        setTickerSuggestions(results || []);
        setShowSuggestions(true);
      } catch { setTickerSuggestions([]); }
      finally { setTickerSearchLoading(false); }
    }, 300);
  };

  const selectTicker = (s: { symbol: string; name: string }) => {
    setFormSymbol(s.symbol);
    setFormName(s.name);
    setShowSuggestions(false);
    setTickerSuggestions([]);
    fetchPrice(s.symbol);
  };

  const fetchPrice = async (symbol?: string) => {
    const sym = (symbol || formSymbol).trim();
    if (!sym) { setPriceError('Enter a ticker first'); return; }
    setPriceLoading(true); setPriceError('');
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await api.marketData.getPrice(sym, today);
      if (data?.price != null) { setFormPrice(data.price.toFixed(2)); setPriceFetched(true); if (data.name && !formName) setFormName(data.name); }
      else setPriceError('Price not available');
    } catch { setPriceError('Failed to fetch price'); }
    finally { setPriceLoading(false); }
  };

  if (!activePortfolio) return <div className="text-slate-400 p-8">Select a portfolio first.</div>;
  const pf = activePortfolio;
  const { transactions, summary } = pf;

  // Mono-user: always full access
  const canEdit = true;

  const filtered = transactions.filter(tx => {
    const matchesSearch = search === '' ||
      tx.symbol.toLowerCase().includes(search.toLowerCase()) ||
      tx.name.toLowerCase().includes(search.toLowerCase()) ||
      tx.notes.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'all' || tx.type === filterType;
    return matchesSearch && matchesType;
  });

  // Summary stats
  const totalBuys = transactions.filter(t => t.type === 'buy').reduce((s, t) => s + t.total, 0);
  const totalSells = transactions.filter(t => t.type === 'sell').reduce((s, t) => s + t.total, 0);

  // Compute PnL for transactions
  const computePnl = (tx: typeof transactions[0]) => {
    if (tx.type === 'buy') {
      const pos = positions.find(p => p.symbol === tx.symbol);
      if (pos && pos.currentPrice > 0) return (pos.currentPrice - tx.price) * tx.quantity;
      return 0;
    }
    if (tx.type === 'sell') {
      const pos = positions.find(p => p.symbol === tx.symbol);
      if (pos) return (tx.price - pos.entryPrice) * tx.quantity;
      return tx.total;
    }
    return 0;
  };
  const totalPnl = transactions.reduce((s, t) => s + computePnl(t), 0);

  const cs = summary.currency === 'EUR' ? '€' : '$';

  const handleAdd = () => {
    const qty = parseFloat(formQty) || 1;
    const price = parseFloat(formPrice) || 0;
    const total = qty * price;

    addTransaction({
      date: formDate,
      type: formType,
      symbol: formSymbol.toUpperCase() || '—',
      name: formName || formSymbol.toUpperCase(),
      quantity: qty,
      price,
      total: parseFloat(total.toFixed(2)),
      currency: summary.currency,
      notes: formNotes,
    });

    setFormType('buy'); setFormSymbol(''); setFormName('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormQty(''); setFormPrice(''); setFormNotes('');
    setPriceFetched(false); setPriceError('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <ArrowLeftRight className="w-7 h-7 text-blue-400" />
            Transactions
          </h1>
          <p className="text-sm text-slate-400 mt-1">Transaction history for {summary.name}</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Transaction
        </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            Total Bought
          </div>
          <div className="text-xl font-bold text-white">{cs}{totalBuys.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="text-[11px] text-slate-500 mt-1">{transactions.filter(t => t.type === 'buy').length} transactions</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <TrendingDown className="w-3.5 h-3.5 text-red-400" />
            Total Sold
          </div>
          <div className="text-xl font-bold text-white">{cs}{totalSells.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          <div className="text-[11px] text-slate-500 mt-1">{transactions.filter(t => t.type === 'sell').length} transactions</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-2">
            <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" />
            Estimated P&L
          </div>
          <div className={`text-xl font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalPnl >= 0 ? '+' : ''}{cs}{Math.abs(totalPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Based on current prices</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['all', 'buy', 'sell'].map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                filterType === t
                  ? 'bg-blue-600/20 border-blue-500/50 text-blue-400'
                  : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
              {t !== 'all' && (
                <span className="ml-1.5 text-[10px] opacity-60">
                  {transactions.filter(tx => tx.type === t).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-slate-900/50 border border-slate-800/60 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800/60">
                <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Date</th>
                <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Type</th>
                <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Instrument</th>
                <th className="text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Qty</th>
                <th className="text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Price</th>
                <th className="text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Total</th>
                <th className="text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">P&L</th>
                <th className="text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Notes</th>
                {canEdit && (
                  <th className="text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-16"></th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => {
                const cfg = typeConfig[tx.type] || typeConfig.buy;
                const Icon = cfg.icon;
                const pnl = computePnl(tx);
                return (
                  <tr key={tx.id} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors group">
                    <td className="px-4 py-3.5 text-sm text-slate-300 font-mono whitespace-nowrap">{tx.date}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color} ${cfg.bg}`}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-sm text-white font-medium">{tx.symbol}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-[180px]">{tx.name}</div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300 text-right font-mono">
                      {tx.quantity.toLocaleString()}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-300 text-right font-mono">
                      {tx.price > 0 ? `${cs}${tx.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={`text-sm font-semibold font-mono ${tx.type === 'sell' ? 'text-emerald-400' : 'text-white'}`}>
                        {tx.type === 'sell' ? '+' : '-'}{cs}{Math.abs(tx.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={`text-sm font-semibold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pnl >= 0 ? '+' : ''}{cs}{Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 max-w-[200px] truncate">{tx.notes}</td>
                    {canEdit && (
                    <td className="px-4 py-3.5 text-center">
                      {deleteConfirm === tx.id ? (
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => { removeTransaction(tx.id); setDeleteConfirm(null); }}
                            className="px-2 py-1 rounded bg-red-500/20 text-red-400 text-[10px] font-medium hover:bg-red-500/30"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1 rounded bg-slate-700/50 text-slate-400 text-[10px] font-medium hover:bg-slate-700"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(tx.id)}
                          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="text-center py-12 text-slate-500 text-sm">
                    No transactions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {filtered.length} of {transactions.length} transactions</span>
          <span className="font-mono">
            Net flow: <span className={transactions.reduce((s, t) => s + t.total, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {cs}{transactions.reduce((s, t) => s + t.total, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </span>
        </div>
      </div>

      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Add Transaction</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Type selector — only Buy and Sell */}
              <div>
                <label className="text-xs text-slate-400 block mb-2 font-medium">Transaction Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['buy', 'sell'] as const).map(t => {
                    const cfg = typeConfig[t];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={t}
                        onClick={() => { setFormType(t); setFormSymbol(''); setFormName(''); setFormPrice(''); setPriceFetched(false); setPriceError(''); }}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all border ${
                          formType === t
                            ? `${cfg.bg} border-current ${cfg.color}`
                            : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Instrument section */}
              <div className="space-y-3">
                {/* For sell: position selector */}
                {formType === 'sell' && availableForSell.length > 0 && (
                    <div>
                      <label className="text-xs text-slate-400 block mb-1.5 font-medium">Select Position to Sell</label>
                      <select
                        value={formSymbol}
                        onChange={e => handleSelectSellPosition(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Choose a position...</option>
                        {availableForSell.map(p => (
                          <option key={p.id} value={p.symbol}>
                            {p.symbol} — {p.name} ({p.quantity} shares @ ${p.entryPrice.toFixed(2)})
                          </option>
                        ))}
                      </select>
                      {formSymbol && (() => {
                        const pos = positions.find(p => p.symbol === formSymbol);
                        if (!pos) return null;
                        const qty = parseFloat(formQty) || 0;
                        const sellPrice = parseFloat(formPrice) || 0;
                        const profit = qty * (sellPrice - pos.entryPrice);
                        return (
                          <div className="mt-2 bg-slate-900/30 border border-slate-800 rounded-lg px-3 py-2 space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-500">Available</span>
                              <span className="text-white font-mono">{pos.quantity} shares</span>
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-500">Entry Price</span>
                              <span className="text-white font-mono">${pos.entryPrice.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-500">Current Price</span>
                              <span className="text-white font-mono">${pos.currentPrice.toFixed(2)}</span>
                            </div>
                            {qty > 0 && sellPrice > 0 && (
                              <div className="flex justify-between text-[11px] pt-1 border-t border-slate-700/30">
                                <span className="text-slate-500">Est. Profit/Loss</span>
                                <span className={`font-mono font-semibold ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {profit >= 0 ? '+' : ''}${profit.toFixed(2)}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  {/* For buy: ticker search with autocomplete */}
                  {formType === 'buy' && (
                    <div className="space-y-3">
                      <div className="relative">
                        <label className="text-xs text-slate-400 block mb-1.5 font-medium">Search Ticker <span className="text-red-400">*</span></label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input type="text" placeholder="Search by symbol or name..."
                              value={formSymbol} onChange={e => handleTickerInput(e.target.value)}
                              className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 font-mono uppercase" />
                            {tickerSearchLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 animate-spin" />}
                            {showSuggestions && tickerSuggestions.length > 0 && (
                              <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
                                {tickerSuggestions.map((s: any, i: number) => (
                                  <button key={i} onClick={() => selectTicker(s)}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors border-b border-slate-700/30 last:border-0">
                                    <span className="text-sm font-mono text-blue-400 font-semibold">{s.symbol}</span>
                                    <span className="text-xs text-slate-400 ml-2">{s.name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button onClick={() => fetchPrice()} disabled={priceLoading || !formSymbol.trim()}
                            className="px-3 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap">
                            {priceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Get Price'}
                          </button>
                        </div>
                        {priceFetched && <span className="text-[10px] text-emerald-400 mt-1 block">Price fetched from market data</span>}
                        {priceError && <span className="text-[10px] text-red-400 mt-1 block">{priceError}</span>}
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1.5 font-medium">Name</label>
                        <input type="text" placeholder="e.g. Apple Inc." value={formName} onChange={e => setFormName(e.target.value)}
                          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 placeholder:text-slate-600" />
                      </div>
                    </div>
                  )}
                  {/* For sell without positions */}
                  {formType === 'sell' && availableForSell.length === 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1.5 font-medium">Symbol <span className="text-red-400">*</span></label>
                        <input type="text" placeholder="e.g. AAPL" value={formSymbol} onChange={e => setFormSymbol(e.target.value)}
                          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 font-mono uppercase" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1.5 font-medium">Name</label>
                        <input type="text" placeholder="e.g. Apple Inc." value={formName} onChange={e => setFormName(e.target.value)}
                          className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 placeholder:text-slate-600" />
                      </div>
                    </div>
                  )}
                </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">Quantity</label>
                  <input
                    type="number"
                    placeholder="100"
                    value={formQty}
                    onChange={e => setFormQty(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 font-mono"
                    min="0"
                    step="1"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">Price per unit</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={formPrice}
                    onChange={e => setFormPrice(e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 font-mono"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              {/* Computed total */}
              {formPrice && (
                <div className="bg-slate-900/30 border border-slate-800 rounded-lg px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Total Amount</span>
                  <span className="text-sm font-mono font-semibold text-white">
                    {cs}{((parseFloat(formQty) || 1) * (parseFloat(formPrice) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Notes</label>
                <input
                  type="text"
                  placeholder="Optional notes..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!formSymbol.trim()}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Add Transaction
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

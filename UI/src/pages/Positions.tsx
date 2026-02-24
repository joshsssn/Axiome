import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { usePortfolio } from '@/context/PortfolioContext';
import { ImportInstruments } from './ImportInstruments';

import {
  Plus, Trash2, Search, X, ArrowUpRight, ArrowDownRight,
  RefreshCw, Lock, Unlock, Calendar, DollarSign, Hash, Tag,
  Globe, Building2, AlertCircle, Check, FileSpreadsheet,
  Layers, Combine, Loader2
} from 'lucide-react';
import type { Position } from '@/data/mockData';

const assetClassOptions = ['Equity', 'Bond ETF', 'Bond', 'Commodity ETF', 'Option', 'Futures', 'Index'];
const sectorOptions = [
  'Technology', 'Healthcare', 'Financials', 'Consumer Staples', 'Consumer Discretionary',
  'Energy', 'Industrials', 'Materials', 'Utilities', 'Real Estate', 'Telecom',
  'Fixed Income', 'Commodities', 'Derivatives', 'Other'
];
const countryOptions = ['US', 'DE', 'NL', 'FR', 'GB', 'JP', 'CH', 'CA', 'AU', 'Other'];

export function Positions() {
  const { activePortfolio: pf, addPosition, removePosition, updatePosition, isLoading, currentUserId, refreshDetail } = usePortfolio();
  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [dupAction, setDupAction] = useState<'merging' | 'removing' | null>(null);
  const [dupBannerDismissed, setDupBannerDismissed] = useState(false);
  const [dupHiddenForPf, setDupHiddenForPf] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeSelections, setRemoveSelections] = useState<Record<string, number>>({}); // groupKey -> positionId to DELETE

  // Ticker search autocomplete state
  const [tickerSuggestions, setTickerSuggestions] = useState<Array<{ symbol: string; name: string; sector: string; country: string; asset_class: string; currency: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [tickerSearchLoading, setTickerSearchLoading] = useState(false);
  const tickerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Add form state
  const [formSymbol, setFormSymbol] = useState('');
  const [formName, setFormName] = useState('');
  const [formAssetClass, setFormAssetClass] = useState('Equity');
  const [formSector, setFormSector] = useState('Technology');
  const [formCountry, setFormCountry] = useState('US');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formQuantity, setFormQuantity] = useState('');
  const [formEntryDate, setFormEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [formEntryPrice, setFormEntryPrice] = useState('');
  const [formPricingMode, setFormPricingMode] = useState<'market' | 'fixed'>('market');
  const [formManualPrice, setFormManualPrice] = useState('');
  const [fetchedMarketPrice, setFetchedMarketPrice] = useState<number | null>(null);
  const [priceFetched, setPriceFetched] = useState(false);
  const [priceError, setPriceError] = useState('');

  // Edit inline state
  const [editQuantity, setEditQuantity] = useState('');
  const [editEntryPrice, setEditEntryPrice] = useState('');
  const [editCurrentPrice, setEditCurrentPrice] = useState('');
  const [editPricingMode, setEditPricingMode] = useState<'market' | 'fixed'>('market');

  // Load "don't show again" preference from localStorage
  useEffect(() => {
    if (pf) {
      const hidden = localStorage.getItem(`dup_hidden_pf_${pf.id}`);
      setDupHiddenForPf(hidden === 'true');
      setDupBannerDismissed(false);
    }
  }, [pf?.id]);

  if (isLoading) return <div className="p-10 text-center text-slate-400">Loading...</div>;
  if (!pf) return <div className="p-10 text-center text-slate-400">No portfolio selected</div>;

  // Check if user can edit (owner or edit-permission collaborator)
  const isOwner = pf.ownerId === currentUserId;
  const userCollab = pf.collaborators.find(c => c.userId === currentUserId);
  const canEdit = isOwner || userCollab?.permission === 'edit';

  const ccySymbols: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF', JPY: '¥', CAD: 'C$', SEK: 'kr', NOK: 'kr', DKK: 'kr', HKD: 'HK$', AUD: 'A$', SGD: 'S$' };
  const currSym = ccySymbols[pf.summary.currency] || pf.summary.currency;
  const fmt = (n: number) => `${currSym}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filtered = useMemo(() =>
    pf.positions.filter((p: Position) =>
      p.symbol.toLowerCase().includes(search.toLowerCase()) ||
      p.name.toLowerCase().includes(search.toLowerCase())
    ), [pf.positions, search]);

  const totalMarketValue = pf.positions.reduce((s: number, p: Position) => s + p.quantity * p.currentPrice, 0);

  // Duplicate detection (same symbol + same entry price)
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, Position[]>();
    pf.positions.forEach((p: Position) => {
      const key = `${p.symbol}|${p.entryPrice.toFixed(2)}`;
      const arr = groups.get(key) || [];
      arr.push(p);
      groups.set(key, arr);
    });
    return Array.from(groups.entries())
      .filter(([, arr]) => arr.length > 1)
      .map(([, arr]) => arr);
  }, [pf.positions]);

  const duplicateIds = useMemo(() => {
    const ids = new Set<number>();
    duplicateGroups.forEach(g => g.forEach(p => ids.add(p.id)));
    return ids;
  }, [duplicateGroups]);

  const totalDupExtra = duplicateGroups.reduce((s, g) => s + g.length - 1, 0);

  const handleMergeDuplicates = async () => {
    if (!pf) return;
    setDupAction('merging');
    try {
      await api.portfolios.mergeDuplicates(Number(pf.id));
      refreshDetail();
    } catch (e) { console.error('Merge duplicates failed', e); }
    finally { setDupAction(null); }
  };

  const handleRemoveExtras = () => {
    if (!pf) return;
    // Check if any group has positions with different quantities
    const needsPicker = duplicateGroups.some(g => {
      const quantities = g.map(p => p.quantity);
      return new Set(quantities).size > 1;
    });

    if (needsPicker) {
      // Pre-select: for each group, default to deleting the most recent (highest id)
      const selections: Record<string, number> = {};
      duplicateGroups.forEach(g => {
        const key = `${g[0].symbol}|${g[0].entryPrice.toFixed(2)}`;
        const sorted = [...g].sort((a, b) => a.id - b.id);
        // Default: delete the most recent one
        selections[key] = sorted[sorted.length - 1].id;
      });
      setRemoveSelections(selections);
      setShowRemoveModal(true);
    } else {
      // All same qty → just delete most recent automatically
      handleAutoRemove();
    }
  };

  const handleAutoRemove = async () => {
    if (!pf) return;
    setDupAction('removing');
    try {
      // Delete the most recent position in each group
      for (const group of duplicateGroups) {
        const sorted = [...group].sort((a, b) => a.id - b.id);
        // Delete all except the first (oldest)
        for (let i = 1; i < sorted.length; i++) {
          await api.portfolios.deletePosition(Number(pf.id), sorted[i].id);
        }
      }
      refreshDetail();
    } catch (e) { console.error('Remove duplicates failed', e); }
    finally { setDupAction(null); }
  };

  const handleConfirmRemoveSelections = async () => {
    if (!pf) return;
    setDupAction('removing');
    setShowRemoveModal(false);
    try {
      for (const group of duplicateGroups) {
        const key = `${group[0].symbol}|${group[0].entryPrice.toFixed(2)}`;
        const toDeleteId = removeSelections[key];
        if (toDeleteId) {
          await api.portfolios.deletePosition(Number(pf.id), toDeleteId);
        }
      }
      refreshDetail();
    } catch (e) { console.error('Remove duplicates failed', e); }
    finally { setDupAction(null); }
  };

  const handleDupDontShowAgain = (checked: boolean) => {
    if (pf) {
      if (checked) {
        localStorage.setItem(`dup_hidden_pf_${pf.id}`, 'true');
      } else {
        localStorage.removeItem(`dup_hidden_pf_${pf.id}`);
      }
      setDupHiddenForPf(checked);
    }
  };

  // Ticker search with debounce
  const handleTickerInput = (value: string) => {
    setFormSymbol(value);
    setPriceFetched(false);
    setPriceError('');

    if (tickerSearchTimer.current) clearTimeout(tickerSearchTimer.current);

    if (value.trim().length < 1) {
      setTickerSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setTickerSearchLoading(true);
    tickerSearchTimer.current = setTimeout(async () => {
      try {
        const results = await api.marketData.searchTicker(value.trim());
        setTickerSuggestions(results || []);
        setShowSuggestions(true);
      } catch {
        setTickerSuggestions([]);
      } finally {
        setTickerSearchLoading(false);
      }
    }, 300);
  };

  const selectTicker = (suggestion: { symbol: string; name: string; sector: string; country: string; asset_class: string; currency: string }) => {
    setFormSymbol(suggestion.symbol);
    setFormName(suggestion.name);
    if (suggestion.sector) setFormSector(suggestion.sector);
    if (suggestion.country) setFormCountry(suggestion.country);
    if (suggestion.asset_class) setFormAssetClass(suggestion.asset_class);
    if (suggestion.currency) setFormCurrency(suggestion.currency);
    setShowSuggestions(false);
    setTickerSuggestions([]);
  };

  const handleFetchPrice = async () => {
    if (!formSymbol.trim()) {
      setPriceError('Enter a ticker symbol first');
      return;
    }

    try {
      // Use real API to fetch historical price
      const data = await api.marketData.getPrice(formSymbol.trim(), formEntryDate);

      if (data && typeof data.price === 'number') {
        const price = parseFloat(data.price.toFixed(2));
        setFetchedMarketPrice(price);
        setPriceFetched(true);
        setPriceError('');
        if (!formEntryPrice) {
          setFormEntryPrice(price.toString());
        }
      } else {
        throw new Error("Invalid price data");
      }
    } catch (e) {
      console.error(e);
      setFetchedMarketPrice(null);
      setPriceFetched(true);
      setPriceError(`No market data found for "${formSymbol.toUpperCase()}" on ${formEntryDate}.`);
    }
  };

  const handleAddPosition = () => {
    if (!formSymbol.trim() || !formQuantity || !formEntryPrice) return;

    const qty = parseFloat(formQuantity);
    const entryPx = parseFloat(formEntryPrice);
    if (isNaN(qty) || isNaN(entryPx) || qty <= 0 || entryPx <= 0) return;

    let currentPrice: number;
    if (formPricingMode === 'fixed') {
      const mp = parseFloat(formManualPrice);
      currentPrice = !isNaN(mp) && mp > 0 ? mp : entryPx;
    } else {
      currentPrice = fetchedMarketPrice ?? entryPx;
    }

    addPosition({
      symbol: formSymbol.trim().toUpperCase(),
      name: formName.trim() || formSymbol.trim().toUpperCase(),
      assetClass: formAssetClass,
      sector: formSector,
      country: formCountry,
      currency: formCurrency,
      originalCurrency: formCurrency,
      originalEntryPrice: parseFloat(formEntryPrice),
      fxRate: 1.0,
      quantity: qty,
      entryPrice: entryPx,
      currentPrice,
      entryDate: formEntryDate,
      pricingMode: formPricingMode,
    });

    // Reset form
    setFormSymbol('');
    setFormName('');
    setFormQuantity('');
    setFormEntryPrice('');
    setFormManualPrice('');
    setFetchedMarketPrice(null);
    setPriceFetched(false);
    setPriceError('');
    setShowAddForm(false);
  };

  const startEdit = (p: Position) => {
    setEditingId(p.id);
    setEditQuantity(p.quantity.toString());
    setEditEntryPrice(p.entryPrice.toString());
    setEditCurrentPrice(p.currentPrice.toString());
    setEditPricingMode(p.pricingMode);
  };

  const saveEdit = (id: number) => {
    const qty = parseFloat(editQuantity);
    const ep = parseFloat(editEntryPrice);
    const cp = parseFloat(editCurrentPrice);
    if (!isNaN(qty) && !isNaN(ep) && !isNaN(cp)) {
      updatePosition(id, {
        quantity: qty,
        entryPrice: ep,
        currentPrice: cp,
        pricingMode: editPricingMode,
      });
    }
    setEditingId(null);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Instruments & Positions</h1>
            <p className="text-slate-400 text-sm mt-1">
              Add, edit, and manage instruments in <span className="text-blue-400 font-medium">{pf.summary.name}</span>
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Import CSV
              </button>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${showAddForm
                  ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20'
                  }`}
              >
                {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {showAddForm ? 'Cancel' : 'Add Instrument'}
              </button>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <div className="text-xs text-slate-500 mb-1">Total Positions</div>
            <div className="text-xl font-bold text-white">{pf.positions.length}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <div className="text-xs text-slate-500 mb-1">Market Value</div>
            <div className="text-xl font-bold text-white">{fmt(totalMarketValue)}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <div className="text-xs text-slate-500 mb-1">Market Priced</div>
            <div className="text-xl font-bold text-blue-400">{pf.positions.filter((p: Position) => p.pricingMode === 'market').length}</div>
          </div>
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <div className="text-xs text-slate-500 mb-1">Fixed Priced</div>
            <div className="text-xl font-bold text-amber-400">{pf.positions.filter((p: Position) => p.pricingMode === 'fixed').length}</div>
          </div>
        </div>

        {/* Duplicate Positions Banner */}
        {canEdit && duplicateGroups.length > 0 && !dupBannerDismissed && !dupHiddenForPf && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 relative">
            {/* Close button */}
            <button
              onClick={() => setDupBannerDismissed(true)}
              className="absolute top-2 right-2 p-1 rounded-lg text-amber-400/50 hover:text-amber-300 hover:bg-amber-500/10 transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pr-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <Layers className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-amber-300">
                    {duplicateGroups.length} duplicate group{duplicateGroups.length > 1 ? 's' : ''} found
                    <span className="text-amber-400/70 font-normal ml-1">({totalDupExtra} extra position{totalDupExtra > 1 ? 's' : ''})</span>
                  </p>
                  <p className="text-xs text-amber-400/60 mt-0.5">
                    Positions with the same ticker and entry price.
                    {duplicateGroups.map((g, i) => (
                      <span key={i} className="ml-1 font-mono text-amber-400/80">
                        {g[0].symbol} ×{g.length}{i < duplicateGroups.length - 1 ? ',' : ''}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleMergeDuplicates}
                  disabled={dupAction !== null}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-all bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                >
                  {dupAction === 'merging' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Combine className="w-3.5 h-3.5" />}
                  Merge (sum qty)
                </button>
                <button
                  onClick={handleRemoveExtras}
                  disabled={dupAction !== null}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-all bg-red-600/80 hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/20"
                >
                  {dupAction === 'removing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Remove extras
                </button>
              </div>
            </div>

            {/* Don't show again checkbox */}
            <label className="flex items-center gap-2 mt-3 pt-2 border-t border-amber-500/15 cursor-pointer group w-fit">
              <input
                type="checkbox"
                checked={dupHiddenForPf}
                onChange={e => handleDupDontShowAgain(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-amber-500/40 bg-slate-900/50 text-amber-500 focus:ring-amber-500/30 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-[11px] text-amber-400/50 group-hover:text-amber-400/70 transition-colors select-none">
                Don&apos;t show again for this portfolio
              </span>
            </label>
          </div>
        )}

        {/* Add Instrument Form */}
        {showAddForm && (
          <div className="bg-slate-800/50 rounded-xl border border-blue-500/30 p-6 shadow-lg shadow-blue-500/5">
            <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-400" />
              Add New Instrument
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Ticker / Symbol with autocomplete */}
              <div className="relative">
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                  <Tag className="w-3 h-3 inline mr-1" />Ticker Symbol <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Search ticker e.g. AAPL, MSFT..."
                  value={formSymbol}
                  onChange={e => handleTickerInput(e.target.value)}
                  onFocus={() => { if (tickerSuggestions.length > 0) setShowSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600 font-mono uppercase"
                  autoComplete="off"
                />
                {tickerSearchLoading && (
                  <div className="absolute right-3 top-[34px]">
                    <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                  </div>
                )}
                {showSuggestions && tickerSuggestions.length > 0 && (
                  <div ref={suggestionsRef} className="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                    {tickerSuggestions.map((s, i) => (
                      <button
                        key={`${s.symbol}-${i}`}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); selectTicker(s); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-700/60 transition-colors border-b border-slate-700/30 last:border-0"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono font-semibold text-blue-400">{s.symbol}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">{s.asset_class}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 truncate">{s.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{s.sector} • {s.country}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                  Instrument Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apple Inc."
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600"
                />
              </div>

              {/* Asset Class */}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                  <Building2 className="w-3 h-3 inline mr-1" />Asset Class
                </label>
                <select
                  value={formAssetClass}
                  onChange={e => setFormAssetClass(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500"
                >
                  {assetClassOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              {/* Sector */}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">Sector</label>
                <select
                  value={formSector}
                  onChange={e => setFormSector(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500"
                >
                  {sectorOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              {/* Country */}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                  <Globe className="w-3 h-3 inline mr-1" />Country
                </label>
                <select
                  value={formCountry}
                  onChange={e => setFormCountry(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500"
                >
                  {countryOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              {/* Currency */}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                  <DollarSign className="w-3 h-3 inline mr-1" />Currency
                </label>
                <div className="flex flex-wrap gap-2">
                  {['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'SEK', 'HKD'].map(c => (
                    <button
                      key={c}
                      onClick={() => setFormCurrency(c)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${formCurrency === c
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                        : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-slate-700/50 my-5" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Quantity */}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                  <Hash className="w-3 h-3 inline mr-1" />Quantity / Units <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  placeholder="e.g. 100"
                  value={formQuantity}
                  onChange={e => setFormQuantity(e.target.value)}
                  min="0"
                  step="1"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600 font-mono"
                />
              </div>

              {/* Entry Date */}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                  <Calendar className="w-3 h-3 inline mr-1" />Acquisition Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={formEntryDate}
                  onChange={e => { setFormEntryDate(e.target.value); setPriceFetched(false); }}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                />
              </div>

              {/* Entry Price */}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                  <DollarSign className="w-3 h-3 inline mr-1" />Entry Price (per unit) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  placeholder="e.g. 150.25"
                  value={formEntryPrice}
                  onChange={e => setFormEntryPrice(e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 placeholder:text-slate-600 font-mono"
                />
              </div>

              {/* Fetch Market Price */}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                  Market Price (at acq. date)
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={handleFetchPrice}
                    className="flex items-center gap-1.5 px-3 py-2.5 bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 hover:bg-indigo-600/30 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Fetch Price
                  </button>
                  <div className="flex-1 flex items-center px-3 py-2.5 bg-slate-900/50 border border-slate-700 rounded-lg">
                    {priceFetched ? (
                      fetchedMarketPrice !== null ? (
                        <span className="text-sm font-mono text-emerald-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          {currSym}{fetchedMarketPrice}
                        </span>
                      ) : (
                        <span className="text-xs text-red-400">N/A</span>
                      )
                    ) : (
                      <span className="text-xs text-slate-600">Not fetched</span>
                    )}
                  </div>
                </div>
                {priceError && (
                  <p className="text-[10px] text-amber-400 mt-1 flex items-start gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                    {priceError}
                  </p>
                )}
              </div>
            </div>

            {/* Pricing Mode */}
            <div className="border-t border-slate-700/50 my-5" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-2 font-medium">Pricing Mode</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setFormPricingMode('market')}
                    className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border transition-all ${formPricingMode === 'market'
                      ? 'bg-blue-600/15 border-blue-500/50 text-blue-400'
                      : 'bg-slate-900/30 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                      }`}
                  >
                    <Unlock className="w-4 h-4" />
                    <div className="text-left">
                      <div className="text-sm font-medium">Market</div>
                      <div className="text-[10px] opacity-60">Auto-updated daily</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setFormPricingMode('fixed')}
                    className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border transition-all ${formPricingMode === 'fixed'
                      ? 'bg-amber-600/15 border-amber-500/50 text-amber-400'
                      : 'bg-slate-900/30 border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                      }`}
                  >
                    <Lock className="w-4 h-4" />
                    <div className="text-left">
                      <div className="text-sm font-medium">Fixed</div>
                      <div className="text-[10px] opacity-60">Manual override</div>
                    </div>
                  </button>
                </div>
              </div>

              {formPricingMode === 'fixed' && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                    <Lock className="w-3 h-3 inline mr-1" />Manual Current Price Override
                  </label>
                  <input
                    type="number"
                    placeholder="Enter current price manually"
                    value={formManualPrice}
                    onChange={e => setFormManualPrice(e.target.value)}
                    min="0"
                    step="0.01"
                    className="w-full bg-slate-900/50 border border-amber-700/50 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 placeholder:text-slate-600 font-mono"
                  />
                  <span className="text-[10px] text-slate-600 mt-1 block">This price won't be auto-updated</span>
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-5 py-2.5 border border-slate-700 text-slate-400 rounded-lg text-sm hover:bg-slate-700 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPosition}
                disabled={!formSymbol.trim() || !formQuantity || !formEntryPrice}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
              >
                <Plus className="w-4 h-4 inline mr-1" />
                Add to Portfolio
              </button>
            </div>
          </div>
        )}

        {/* Positions Table */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="p-4 border-b border-slate-700/50 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search by symbol or name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <span className="text-xs text-slate-500 ml-auto">{filtered.length} instruments</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50">
                  {['Symbol', 'Name', 'Class', 'CCY', 'Qty', 'Entry Date', 'Entry Px', 'Current Px', 'Weight', 'P&L', 'P&L %', 'Mode', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p: Position) => {
                  const isDup = duplicateIds.has(p.id);
                  return (
                  <tr key={p.id} className={`border-b border-slate-700/20 transition-colors ${editingId === p.id ? 'bg-blue-500/5' : isDup ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-slate-700/20'}`}>
                    <td className="px-4 py-3 font-mono font-semibold text-blue-400">
                      <span className="flex items-center gap-1.5">
                        {isDup && <Layers className="w-3 h-3 text-amber-400 shrink-0" />}
                        {p.symbol}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-[160px] truncate">{p.name}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300">{p.assetClass}</span>
                    </td>

                    {/* Currency / FX */}
                    <td className="px-4 py-3">
                      {p.originalCurrency !== p.currency && p.fxRate !== 1.0 ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-medium">
                            {p.originalCurrency}→{p.currency}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">@{p.fxRate.toFixed(4)}</span>
                        </div>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">{p.currency}</span>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="px-4 py-3">
                      {editingId === p.id ? (
                        <input type="number" value={editQuantity} onChange={e => setEditQuantity(e.target.value)}
                          className="w-20 bg-slate-900 border border-blue-500/50 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none" />
                      ) : (
                        <span className="text-slate-300 font-mono">{p.quantity.toLocaleString()}</span>
                      )}
                    </td>

                    {/* Entry Date */}
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">{p.entryDate}</td>

                    {/* Entry Price */}
                    <td className="px-4 py-3">
                      {editingId === p.id ? (
                        <input type="number" value={editEntryPrice} onChange={e => setEditEntryPrice(e.target.value)} step="0.01"
                          className="w-24 bg-slate-900 border border-blue-500/50 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none" />
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-slate-400 font-mono">{fmt(p.entryPrice)}</span>
                          {p.originalCurrency !== p.currency && p.fxRate !== 1.0 && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              {ccySymbols[p.originalCurrency] || p.originalCurrency}{p.originalEntryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Current Price */}
                    <td className="px-4 py-3">
                      {editingId === p.id ? (
                        <div className="flex items-center gap-1">
                          <input type="number" value={editCurrentPrice} onChange={e => setEditCurrentPrice(e.target.value)} step="0.01"
                            className="w-24 bg-slate-900 border border-blue-500/50 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none"
                            disabled={editPricingMode === 'market'}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span className="text-slate-200 font-mono">{fmt(p.currentPrice)}</span>
                          {p.originalCurrency !== p.currency && p.fxRate !== 1.0 && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              {ccySymbols[p.originalCurrency] || p.originalCurrency}{(p.currentPrice / p.fxRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Weight */}
                    <td className="px-4 py-3 text-slate-300 font-mono">{p.weight}%</td>

                    {/* P&L */}
                    <td className={`px-4 py-3 font-mono ${p.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {p.pnl >= 0 ? '' : '-'}{fmt(Math.abs(p.pnl))}
                    </td>

                    {/* P&L % */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-0.5 font-mono text-xs ${p.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {p.pnlPercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(p.pnlPercent).toFixed(2)}%
                      </span>
                    </td>

                    {/* Pricing Mode */}
                    <td className="px-4 py-3">
                      {editingId === p.id ? (
                        <button
                          onClick={() => setEditPricingMode(editPricingMode === 'market' ? 'fixed' : 'market')}
                          className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${editPricingMode === 'market' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'
                            }`}
                        >
                          {editPricingMode === 'market' ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {editPricingMode}
                        </button>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded inline-flex items-center gap-1 ${p.pricingMode === 'market' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                          {p.pricingMode === 'market' ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {p.pricingMode}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {editingId === p.id ? (
                          <>
                            <button onClick={() => saveEdit(p.id)}
                              className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors" title="Save">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors" title="Cancel">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(p)}
                              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-700 hover:text-white transition-colors" title="Edit">
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            {deleteConfirm === p.id ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => { removePosition(p.id); setDeleteConfirm(null); }}
                                  className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors" title="Confirm delete">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setDeleteConfirm(null)}
                                  className="p-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-700 transition-colors" title="Cancel">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirm(p.id)}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors" title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-12 text-center text-slate-500">
                      {pf.positions.length === 0 ? (
                        <div>
                          <p className="text-base mb-1">No instruments yet</p>
                          <p className="text-xs">Click "Add Instrument" to add your first position</p>
                        </div>
                      ) : (
                        <p>No results for "{search}"</p>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImport && <ImportInstruments onClose={() => setShowImport(false)} />}

      {/* Remove Duplicates Picker Modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowRemoveModal(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-700/50">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-red-400" />
                  Choose which duplicate to remove
                </h3>
                <button onClick={() => setShowRemoveModal(false)} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">For each group, select the position to delete. The other will be kept.</p>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[55vh]">
              {duplicateGroups.map((group, gi) => {
                const key = `${group[0].symbol}|${group[0].entryPrice.toFixed(2)}`;
                const quantities = group.map(p => p.quantity);
                const allSameQty = new Set(quantities).size === 1;
                return (
                  <div key={gi} className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-mono font-semibold text-blue-400 text-sm">{group[0].symbol}</span>
                      <span className="text-xs text-slate-500">@ {currSym}{group[0].entryPrice.toFixed(2)}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 ml-auto">{group.length} positions</span>
                    </div>
                    <div className="space-y-2">
                      {[...group].sort((a, b) => a.id - b.id).map((p, pi) => {
                        const isSelected = removeSelections[key] === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => setRemoveSelections(prev => ({ ...prev, [key]: p.id }))}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
                              isSelected
                                ? 'border-red-500/50 bg-red-500/10'
                                : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-red-500 bg-red-500' : 'border-slate-600'
                            }`}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-white font-mono">Qty: {p.quantity.toLocaleString()}</span>
                                <span className="text-[10px] text-slate-500">ID #{p.id}</span>
                                {pi === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">oldest</span>}
                                {pi === group.length - 1 && group.length > 1 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400">newest</span>}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                Entry: {p.entryDate} · Current: {currSym}{p.currentPrice.toFixed(2)} · Mode: {p.pricingMode}
                              </div>
                            </div>
                            {isSelected && (
                              <span className="text-[10px] font-medium text-red-400 shrink-0">WILL DELETE</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {allSameQty && (
                      <p className="text-[10px] text-slate-500 mt-2 italic">Same quantity — newest pre-selected for deletion</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-slate-700/50 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowRemoveModal(false)}
                className="px-4 py-2 border border-slate-700 text-slate-400 rounded-lg text-sm hover:bg-slate-700 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoveSelections}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-red-500/20"
              >
                <Trash2 className="w-3.5 h-3.5 inline mr-1.5" />
                Delete selected ({Object.keys(removeSelections).length})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

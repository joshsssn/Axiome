import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  defaultPortfolios,
  seededRandom,
  type PortfolioData,
  type Position,
  type Transaction,
  type StressScenario,
  type RiskMetricsData,
} from '@/data/mockData';
import { api } from '../services/api';

/* ────────────────────────────────────────────────── Types */
interface PortfolioContextType {
  portfolios: PortfolioData[];
  activePortfolio: PortfolioData | null;
  activePortfolioId: string;
  setActivePortfolioId: (id: string) => void;
  createPortfolio: (cfg: { name: string; description: string; currency: 'USD' | 'EUR'; benchmark: string }) => void;
  deletePortfolio: (id: string) => void;
  addPosition: (pos: Omit<Position, 'id' | 'pnl' | 'pnlPercent' | 'dailyChange' | 'weight'>) => void;
  removePosition: (posId: number) => void;
  updatePosition: (posId: number, updates: Partial<Position>) => void;
  updatePortfolioMeta: (updates: { name?: string; description?: string; benchmark?: string }) => void;
  addTransaction: (tx: Omit<Transaction, 'id'>) => void;
  removeTransaction: (txId: number) => void;
  duplicatePortfolio: (id: string) => void;
  addStressScenario: (scenario: Omit<StressScenario, 'id'>) => void;
  removeStressScenario: (id: number) => void;
  isLoading: boolean;
  refreshPortfolios: () => void;
  refreshDetail: () => void;
}

const PortfolioContext = createContext<PortfolioContextType | null>(null);

/* ────────────────────── Zero-value defaults */
const EMPTY_RISK: RiskMetricsData = {
  annualizedReturn: 0, annualizedVolatility: 0, sharpeRatio: 0, sortinoRatio: 0,
  calmarRatio: 0, informationRatio: 0, maxDrawdown: 0, maxDrawdownDuration: 0,
  beta: 0, alpha: 0, trackingError: 0, rSquared: 0,
  var95: 0, var99: 0, cvar95: 0, cvar99: 0, downsideDeviation: 0,
  skewness: 0, kurtosis: 0, bestDay: 0, worstDay: 0,
  bestMonth: 0, worstMonth: 0, positiveMonths: 0, winRate: 0,
};

/** Generate default historical stress scenarios based on positions */
function generateDefaultStressScenarios(positions: Position[]): StressScenario[] {
  if (positions.length === 0) return [];
  const topSymbols = positions.sort((a, b) => b.weight - a.weight).map(p => p.symbol);
  const seed = positions.reduce((s, p) => s + p.id, 0);
  const bondPos = positions.find(p => p.assetClass.toLowerCase().includes('bond'));
  return [
    { id: 1, name: '2008 Financial Crisis', description: 'Replay of Sep-Nov 2008 market conditions', type: 'historical', equityShock: -38.5, bondShock: -5.2, commodityShock: -25.0, portfolioImpact: parseFloat((-20 - seededRandom(seed + 400) * 15).toFixed(1)), worstPosition: topSymbols[2] || topSymbols[0] || 'N/A', worstPositionImpact: parseFloat((-40 - seededRandom(seed + 401) * 15).toFixed(1)) },
    { id: 2, name: '2020 COVID Crash', description: 'Replay of Feb-Mar 2020 pandemic sell-off', type: 'historical', equityShock: -33.9, bondShock: 8.5, commodityShock: -12.4, portfolioImpact: parseFloat((-15 - seededRandom(seed + 410) * 12).toFixed(1)), worstPosition: topSymbols[3] || topSymbols[0] || 'N/A', worstPositionImpact: parseFloat((-35 - seededRandom(seed + 411) * 15).toFixed(1)) },
    { id: 3, name: '2022 Rate Shock', description: 'Replay of 2022 interest rate hiking cycle', type: 'historical', equityShock: -19.4, bondShock: -17.8, commodityShock: 15.2, portfolioImpact: parseFloat((-10 - seededRandom(seed + 420) * 10).toFixed(1)), worstPosition: bondPos?.symbol || topSymbols[0] || 'N/A', worstPositionImpact: parseFloat((-25 - seededRandom(seed + 421) * 10).toFixed(1)) },
    { id: 4, name: 'Equity Bear Market', description: '-30% equity decline scenario', type: 'parametric', equityShock: -30.0, bondShock: 5.0, commodityShock: -10.0, portfolioImpact: parseFloat((-15 - seededRandom(seed + 430) * 8).toFixed(1)), worstPosition: topSymbols[2] || topSymbols[0] || 'N/A', worstPositionImpact: parseFloat((-35 - seededRandom(seed + 431) * 10).toFixed(1)) },
    { id: 5, name: 'Stagflation', description: 'Rates up + equity down + commodities up', type: 'parametric', equityShock: -15.0, bondShock: -12.0, commodityShock: 20.0, portfolioImpact: parseFloat((-8 - seededRandom(seed + 440) * 8).toFixed(1)), worstPosition: bondPos?.symbol || topSymbols[0] || 'N/A', worstPositionImpact: parseFloat((-20 - seededRandom(seed + 441) * 10).toFixed(1)) },
  ];
}

/** Generate stress contribution data from positions */
function generateStressContributions(positions: Position[]): Array<{ symbol: string; crisis2008: number; covid2020: number; rateShock: number }> {
  const seed = positions.reduce((s, p) => s + p.id, 0);
  return positions.slice(0, Math.min(10, positions.length)).map(p => ({
    symbol: p.symbol,
    crisis2008: parseFloat((-15 - seededRandom(seed + p.id * 50) * 40).toFixed(1)),
    covid2020: parseFloat((-10 - seededRandom(seed + p.id * 51) * 35).toFixed(1)),
    rateShock: parseFloat((-5 - seededRandom(seed + p.id * 52) * 25 + (p.assetClass.toLowerCase().includes('bond') ? 10 : 0)).toFixed(1)),
  }));
}

function emptyPortfolio(id: string, name: string, description: string, currency: string, benchmark: string): PortfolioData {
  return {
    id,
    summary: { name, description, currency: currency as 'USD' | 'EUR', benchmark, totalValue: 0, dailyPnl: 0, dailyPnlPercent: 0, totalPnl: 0, totalPnlPercent: 0, positionCount: 0, cashBalance: 0, inceptionDate: new Date().toISOString().split('T')[0] },
    positions: [], transactions: [],
    performanceData: [], monthlyReturns: [], returnDistribution: [],
    allocationByClass: [], allocationBySector: [], allocationByCountry: [],
    riskMetrics: { ...EMPTY_RISK },
    correlationMatrix: { labels: [], data: [] },
    efficientFrontierData: [], currentPortfolioPoint: { volatility: 0, return: 0 }, minVolPoint: { volatility: 0, return: 0 }, maxSharpePoint: { volatility: 0, return: 0 },
    optimizedWeights: [], stressScenarios: [], stressContributions: [],
    drawdownData: [], rollingVolatility: [], rollingCorrelation: [], recentActivity: [],
  };
}

/* ────────────────────── Helpers to map backend → frontend */
function mapPosition(p: any): Position {
  const entryVal = p.quantity * p.entry_price;
  const currentPrice = p.current_price ?? p.entry_price;
  const currentVal = p.quantity * currentPrice;
  const pnl = currentVal - entryVal;
  return {
    id: p.id,
    symbol: p.instrument_symbol ?? p.symbol ?? '',
    name: p.name ?? p.instrument_symbol ?? p.symbol ?? '',
    assetClass: p.asset_class ?? 'Equity',
    sector: p.sector ?? 'Other',
    country: p.country ?? 'US',
    currency: p.currency ?? 'USD',
    originalCurrency: p.original_currency ?? p.currency ?? 'USD',
    originalEntryPrice: p.original_entry_price ?? p.entry_price,
    fxRate: p.fx_rate ?? 1.0,
    quantity: p.quantity,
    entryPrice: p.entry_price,
    currentPrice,
    entryDate: p.entry_date ?? '',
    pricingMode: p.pricing_mode ?? 'market',
    weight: p.weight ?? 0,
    pnl: p.pnl ?? parseFloat(pnl.toFixed(2)),
    pnlPercent: p.pnl_percent ?? (entryVal > 0 ? parseFloat(((pnl / entryVal) * 100).toFixed(2)) : 0),
    dailyChange: p.daily_change ?? 0,
  };
}

function mapTransaction(t: any): Transaction {
  return {
    id: t.id,
    date: t.date ?? '',
    type: t.type ?? 'buy',
    symbol: t.symbol ?? '',
    name: t.name ?? t.symbol ?? '',
    quantity: t.quantity ?? 0,
    price: t.price ?? 0,
    total: t.total ?? 0,
    currency: t.currency ?? 'USD',
    notes: t.notes ?? '',
  };
}

/* ────────────────────── Provider */
export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolios, setPortfolios] = useState<PortfolioData[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const isBackend = useRef(false);
  const initialLoadDone = useRef(false);

  /** Full refresh (list + detail) — only for create/delete/duplicate portfolio */
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);
  /** Detail-only refresh — for add/remove position, transaction, etc. */
  const refreshDetail = useCallback(() => setDetailRefreshKey(k => k + 1), []);

  /* ─── Fetch portfolio list (with retry for sidecar startup) ─── */
  useEffect(() => {
    let cancelled = false;
    const MAX_RETRIES = 6;
    const BASE_DELAY = 600; // ms

    async function loadPortfolios(attempt: number) {
      try {
        // Only show loading spinner on initial load, not on refresh
        if (!initialLoadDone.current) setIsLoading(true);
        // Always try the backend API (no token check needed — auth removed)
        isBackend.current = true;
        const pfs: any[] = await api.portfolios.list();
        if (cancelled) return;

        setPortfolios(prev => {
          const mapped = pfs.map((p: any) => {
            // Preserve existing detail data if we already have it
            const existing = prev.find(ep => ep.id === String(p.id));
            if (existing) {
              return { ...existing, summary: { ...existing.summary, name: p.name, description: p.description ?? existing.summary.description } };
            }
            return emptyPortfolio(String(p.id), p.name, p.description ?? '', p.currency ?? 'USD', p.benchmark_symbol ?? 'SPY');
          });
          return mapped;
        });

        // Set active portfolio if none set
        const pfIds = pfs.map((p: any) => String(p.id));
        if (pfIds.length > 0 && (!activePortfolioId || !pfIds.includes(activePortfolioId))) {
          setActivePortfolioId(pfIds[0]);
        }

        if (!cancelled) {
          setIsLoading(false);
          initialLoadDone.current = true;

          // Preload details + analytics for ALL portfolios in background
          const allIds = pfs.map((p: any) => p.id as number);
          setTimeout(() => {
            allIds.forEach(pid => {
              Promise.all([
                api.portfolios.get(pid).catch(() => null),
                api.portfolios.getAnalytics(pid).catch(() => null),
              ]).then(([details, analytics]) => {
                if (cancelled || !details) return;
                setPortfolios(prev => prev.map(pf => {
                  if (pf.id !== String(pid)) return pf;
                  // Only update if we don't already have positions loaded
                  if (pf.positions.length > 0) return pf;
                  const positions: Position[] = (details.positions ?? []).map(mapPosition);
                  const summary = details.summary ?? {};
                  const totalValue = summary.totalValue ?? positions.reduce((s: number, p: Position) => s + p.quantity * p.currentPrice, 0);
                  if (totalValue > 0) {
                    positions.forEach(p => { p.weight = parseFloat(((p.quantity * p.currentPrice / totalValue) * 100).toFixed(1)); });
                  }
                  const a = analytics ?? {};
                  return {
                    ...pf,
                    summary: { ...pf.summary, totalValue: Math.round(totalValue), dailyPnl: summary.dailyPnl ?? 0, totalPnl: summary.totalPnl ?? 0, totalPnlPct: summary.totalPnlPct ?? 0, positionCount: positions.length },
                    positions,
                    riskMetrics: a.riskMetrics ? { ...EMPTY_RISK, ...a.riskMetrics } : pf.riskMetrics,
                    performanceData: a.performanceData ?? pf.performanceData,
                    monthlyReturns: a.monthlyReturns ?? pf.monthlyReturns,
                    correlationMatrix: a.correlationMatrix ?? pf.correlationMatrix,
                    rollingCorrelation: a.rollingCorrelation ?? pf.rollingCorrelation,
                    rollingVolatility: a.rollingVolatility ?? pf.rollingVolatility,
                    drawdownData: a.drawdownData ?? pf.drawdownData,
                    allocationByClass: a.allocationByClass ?? pf.allocationByClass,
                    allocationBySector: a.allocationBySector ?? pf.allocationBySector,
                    allocationByCountry: a.allocationByCountry ?? pf.allocationByCountry,
                    returnDistribution: a.returnDistribution ?? pf.returnDistribution,
                  };
                }));
              }).catch(() => {});
            });
          }, 300);
        }
      } catch (err) {
        console.warn(`Fetch portfolios failed (attempt ${attempt + 1}/${MAX_RETRIES})`, err);
        if (!cancelled && attempt < MAX_RETRIES - 1 && !initialLoadDone.current) {
          // Retry — sidecar may still be starting
          const delay = BASE_DELAY * Math.pow(1.5, attempt);
          setTimeout(() => loadPortfolios(attempt + 1), delay);
        } else if (!cancelled) {
          // All retries exhausted — fall back to mock data
          console.error('All retries exhausted, falling back to mock data');
          isBackend.current = false;
          setPortfolios(defaultPortfolios);
          setActivePortfolioId(defaultPortfolios[0]?.id ?? '');
          setIsLoading(false);
          initialLoadDone.current = true;
        }
      }
    }

    loadPortfolios(0);
    return () => { cancelled = true; };
  }, [refreshKey]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Fetch full details for active portfolio ─── */
  useEffect(() => {
    if (!activePortfolioId || !isBackend.current) return;
    const numId = parseInt(activePortfolioId);
    if (isNaN(numId)) return;
    let cancelled = false;

    (async () => {
      try {
        const [details, analytics] = await Promise.all([
          api.portfolios.get(numId),
          api.portfolios.getAnalytics(numId).catch(() => null),
        ]);
        if (cancelled) return;

        // Map positions
        const positions: Position[] = (details.positions ?? []).map(mapPosition);
        const transactions: Transaction[] = (details.transactions ?? []).map(mapTransaction);

        // Summary from backend or compute
        const summary = details.summary ?? {};
        const totalValue = summary.totalValue ?? positions.reduce((s, p) => s + p.quantity * p.currentPrice, 0);
        const totalCost = positions.reduce((s, p) => s + p.quantity * p.entryPrice, 0);
        const totalPnl = summary.totalPnl ?? (totalValue - totalCost);

        // Recalc weights
        if (totalValue > 0) {
          positions.forEach(p => { p.weight = parseFloat(((p.quantity * p.currentPrice / totalValue) * 100).toFixed(1)); });
        }

        // Analytics data (or defaults)
        const a = analytics ?? {};
        const risk: RiskMetricsData = a.riskMetrics ?? { ...EMPTY_RISK };

        setPortfolios(prev => prev.map(pf => {
          if (pf.id !== activePortfolioId) return pf;
          return {
            ...pf,
            summary: {
              name: details.name ?? pf.summary.name,
              description: details.description ?? pf.summary.description,
              currency: (details.currency ?? pf.summary.currency) as 'USD' | 'EUR',
              benchmark: details.benchmark_symbol ?? pf.summary.benchmark,
              totalValue: Math.round(totalValue),
              dailyPnl: summary.dailyPnl ?? 0,
              dailyPnlPercent: summary.dailyPnlPercent ?? 0,
              totalPnl: Math.round(totalPnl),
              totalPnlPercent: totalCost > 0 ? parseFloat(((totalPnl / totalCost) * 100).toFixed(2)) : 0,
              positionCount: positions.length,
              cashBalance: summary.cashBalance ?? 0,
              inceptionDate: summary.inceptionDate ?? details.created_at?.split('T')[0] ?? pf.summary.inceptionDate,
            },
            positions,
            transactions,
            riskMetrics: risk,
            performanceData: a.performanceData ?? [],
            monthlyReturns: a.monthlyReturns ?? [],
            returnDistribution: a.returnDistribution ?? [],
            allocationByClass: a.allocationByClass ?? [],
            allocationBySector: a.allocationBySector ?? [],
            allocationByCountry: a.allocationByCountry ?? [],
            correlationMatrix: a.correlationMatrix ?? { labels: [], data: [] },
            drawdownData: a.drawdownData ?? [],
            rollingVolatility: a.rollingVolatility ?? [],
            rollingCorrelation: a.rollingCorrelation ?? [],
            // Derive recent activity from transactions (last 8)
            recentActivity: transactions.slice(0, 8).map(t => {
              const actionMap: Record<string, string> = { buy: 'Bought', sell: 'Sold', dividend: 'Dividend', fee: 'Fee', deposit: 'Deposit', withdrawal: 'Withdrawal' };
              const action = actionMap[t.type] || t.type;
              const detail = t.type === 'buy' || t.type === 'sell'
                ? `${action} ${t.quantity} × ${t.symbol} @ $${t.price.toFixed(2)}`
                : t.type === 'dividend'
                  ? `${t.symbol} dividend: $${t.total.toFixed(2)}`
                  : `${action}: $${Math.abs(t.total).toFixed(2)}${t.notes ? ' — ' + t.notes : ''}`;
              return { date: t.date, action, detail };
            }),
            // Populate stress scenarios if not already set (client-side computed)
            stressScenarios: pf.stressScenarios.length > 0 ? pf.stressScenarios : generateDefaultStressScenarios(positions),
            stressContributions: pf.stressContributions.length > 0 ? pf.stressContributions : generateStressContributions(positions),
          };
        }));
      } catch (e) {
        console.error('Fetch details failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [activePortfolioId, refreshKey, detailRefreshKey]);

  const activePortfolio = portfolios.find(p => p.id === activePortfolioId) || null;

  /* ────────────────────── CRUD callbacks ────────────────────── */

  const createPortfolio = useCallback(async (cfg: { name: string; description: string; currency: 'USD' | 'EUR'; benchmark: string }) => {
    if (!isBackend.current) {
      // mock-mode
      const id = `pf-${Date.now()}`;
      setPortfolios(prev => [...prev, emptyPortfolio(id, cfg.name, cfg.description, cfg.currency, cfg.benchmark)]);
      setActivePortfolioId(id);
      return;
    }
    try {
      const r = await api.portfolios.create({ name: cfg.name, description: cfg.description, currency: cfg.currency, benchmark_symbol: cfg.benchmark });
      const id = String(r.id);
      setPortfolios(prev => [...prev, emptyPortfolio(id, r.name, r.description ?? '', r.currency ?? cfg.currency, r.benchmark_symbol ?? cfg.benchmark)]);
      setActivePortfolioId(id);
    } catch (e) { console.error('Create portfolio failed', e); }
  }, []);

  const deletePortfolio = useCallback(async (id: string) => {
    if (!isBackend.current) {
      setPortfolios(prev => {
        const remaining = prev.filter(p => p.id !== id);
        if (activePortfolioId === id) {
          setActivePortfolioId(remaining[0]?.id ?? '');
        }
        return remaining;
      });
      return;
    }
    try {
      await api.portfolios.delete(parseInt(id));
      setPortfolios(prev => {
        const remaining = prev.filter(p => p.id !== id);
        if (activePortfolioId === id) {
          setActivePortfolioId(remaining[0]?.id ?? '');
        }
        return remaining;
      });
    } catch (e) { console.error('Delete portfolio failed', e); }
  }, [activePortfolioId]);

  const addPosition = useCallback(async (pos: Omit<Position, 'id' | 'pnl' | 'pnlPercent' | 'dailyChange' | 'weight'>) => {
    if (!activePortfolioId) return;
    if (!isBackend.current) {
      setPortfolios(prev => prev.map(pf => {
        if (pf.id !== activePortfolioId) return pf;
        const newPos: Position = { ...pos, id: Date.now(), weight: 0, pnl: 0, pnlPercent: 0, dailyChange: 0 };
        return { ...pf, positions: [...pf.positions, newPos] };
      }));
      return;
    }
    try {
      await api.portfolios.addPosition(parseInt(activePortfolioId), {
        instrument_symbol: pos.symbol,
        quantity: pos.quantity,
        entry_price: pos.entryPrice,
        entry_date: pos.entryDate,
        pricing_mode: pos.pricingMode,
        ...(pos.pricingMode === 'fixed' && pos.currentPrice ? { current_price: pos.currentPrice } : {}),
      });
      refreshDetail();
      // Schedule a delayed refresh to pick up updated prices from background sync
      setTimeout(() => refreshDetail(), 4000);
    } catch (e) { console.error('Add position failed', e); }
  }, [activePortfolioId, refreshDetail]);

  const removePosition = useCallback(async (posId: number) => {
    if (!activePortfolioId) return;
    if (!isBackend.current) {
      setPortfolios(prev => prev.map(pf => pf.id !== activePortfolioId ? pf : { ...pf, positions: pf.positions.filter(p => p.id !== posId) }));
      return;
    }
    try {
      await api.portfolios.deletePosition(parseInt(activePortfolioId), posId);
      refreshDetail();
    } catch (e) { console.error('Remove position failed', e); }
  }, [activePortfolioId, refreshDetail]);

  const updatePosition = useCallback(async (posId: number, updates: Partial<Position>) => {
    if (!activePortfolioId) return;
    if (!isBackend.current) {
      setPortfolios(prev => prev.map(pf => pf.id !== activePortfolioId ? pf : { ...pf, positions: pf.positions.map(p => p.id === posId ? { ...p, ...updates } : p) }));
      return;
    }
    try {
      const payload: any = {};
      if (updates.quantity != null) payload.quantity = updates.quantity;
      if (updates.entryPrice != null) payload.entry_price = updates.entryPrice;
      if (updates.currentPrice != null) payload.current_price = updates.currentPrice;
      if (updates.pricingMode != null) payload.pricing_mode = updates.pricingMode;
      await api.portfolios.updatePosition(parseInt(activePortfolioId), posId, payload);
      refreshDetail();
    } catch (e) { console.error('Update position failed', e); }
  }, [activePortfolioId, refreshDetail]);

  const updatePortfolioMeta = useCallback(async (updates: { name?: string; description?: string; benchmark?: string }) => {
    if (!activePortfolioId) return;
    if (!isBackend.current) {
      setPortfolios(prev => prev.map(pf => pf.id !== activePortfolioId ? pf : { ...pf, summary: { ...pf.summary, ...updates } }));
      return;
    }
    try {
      const payload: any = {};
      if (updates.name) payload.name = updates.name;
      if (updates.description) payload.description = updates.description;
      if (updates.benchmark) payload.benchmark_symbol = updates.benchmark;
      await api.portfolios.update(parseInt(activePortfolioId), payload);
      refreshDetail();
    } catch (e) { console.error('Update portfolio meta failed', e); }
  }, [activePortfolioId, refreshDetail]);

  const addTransaction = useCallback(async (tx: Omit<Transaction, 'id'>) => {
    if (!activePortfolioId) return;
    if (!isBackend.current) {
      setPortfolios(prev => prev.map(pf => pf.id !== activePortfolioId ? pf : { ...pf, transactions: [{ ...tx, id: Date.now() }, ...pf.transactions] }));
      return;
    }
    try {
      await api.portfolios.addTransaction(parseInt(activePortfolioId), tx);
      refreshDetail();
    } catch (e) { console.error('Add transaction failed', e); }
  }, [activePortfolioId, refreshDetail]);

  const removeTransaction = useCallback(async (txId: number) => {
    if (!activePortfolioId) return;
    if (!isBackend.current) {
      setPortfolios(prev => prev.map(pf => pf.id !== activePortfolioId ? pf : { ...pf, transactions: pf.transactions.filter(t => t.id !== txId) }));
      return;
    }
    try {
      await api.portfolios.deleteTransaction(parseInt(activePortfolioId), txId);
      refreshDetail();
    } catch (e) { console.error('Remove transaction failed', e); }
  }, [activePortfolioId, refreshDetail]);

  const duplicatePortfolio = useCallback(async (id: string) => {
    if (!isBackend.current) {
      const src = portfolios.find(p => p.id === id);
      if (!src) return;
      const newId = `pf-${Date.now()}`;
      setPortfolios(prev => [...prev, { ...src, id: newId, summary: { ...src.summary, name: `${src.summary.name} (Copy)` } }]);
      setActivePortfolioId(newId);
      return;
    }
    try {
      const r = await api.portfolios.duplicate(parseInt(id));
      refresh();
      setActivePortfolioId(String(r.id));
    } catch (e) { console.error('Duplicate portfolio failed', e); }
  }, [portfolios, refresh]);

  /* Stress scenarios stay client-side (computed, not persisted) */
  const addStressScenario = useCallback((scenario: Omit<StressScenario, 'id'>) => {
    if (!activePortfolioId) return;
    setPortfolios(prev => prev.map(pf => {
      if (pf.id !== activePortfolioId) return pf;
      const newScenario: StressScenario = { ...scenario, id: Date.now() };
      return { ...pf, stressScenarios: [...pf.stressScenarios, newScenario] };
    }));
  }, [activePortfolioId]);

  const removeStressScenario = useCallback((scenarioId: number) => {
    if (!activePortfolioId) return;
    setPortfolios(prev => prev.map(pf => pf.id !== activePortfolioId ? pf : { ...pf, stressScenarios: pf.stressScenarios.filter(s => s.id !== scenarioId) }));
  }, [activePortfolioId]);

  /* ────────────────────── Render ────────────────────── */
  return (
    <PortfolioContext.Provider value={{
      portfolios,
      activePortfolio,
      activePortfolioId,
      setActivePortfolioId,
      createPortfolio,
      deletePortfolio,
      addPosition,
      removePosition,
      updatePosition,
      updatePortfolioMeta,
      addTransaction,
      removeTransaction,
      duplicatePortfolio,
      addStressScenario,
      removeStressScenario,
      isLoading,
      refreshPortfolios: refresh,
      refreshDetail,
    }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error('usePortfolio must be used within PortfolioProvider');
  return ctx;
}

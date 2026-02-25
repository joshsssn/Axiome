// Generate deterministic pseudo-random performance data
export function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateDailyReturns(days: number, annualReturn: number, annualVol: number, seed: number) {
  const dailyReturn = annualReturn / 252;
  const dailyVol = annualVol / Math.sqrt(252);
  const returns: number[] = [];
  for (let i = 0; i < days; i++) {
    const r = dailyReturn + dailyVol * (seededRandom(seed + i) - 0.5) * 3;
    returns.push(r);
  }
  return returns;
}

function cumulativeFromReturns(returns: number[], startValue: number = 100) {
  const values: number[] = [startValue];
  for (const r of returns) {
    values.push(values[values.length - 1] * (1 + r));
  }
  return values;
}

export interface Position {
  id: number;
  symbol: string;
  name: string;
  assetClass: string;
  sector: string;
  country: string;
  currency: string;
  originalCurrency: string;
  fxRate: number;
  quantity: number;
  entryPrice: number;
  originalEntryPrice: number;
  currentPrice: number;
  entryDate: string;
  pricingMode: 'market' | 'fixed';
  weight: number;
  pnl: number;
  pnlPercent: number;
  dailyChange: number;
}

export interface AllocationItem {
  name: string;
  value: number;
  color: string;
}

export interface RiskMetricsData {
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  informationRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  beta: number;
  alpha: number;
  trackingError: number;
  rSquared: number;
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  downsideDeviation: number;
  skewness: number;
  kurtosis: number;
  bestDay: number;
  worstDay: number;
  bestMonth: number;
  worstMonth: number;
  positiveMonths: number;
  winRate: number;
}

export interface PortfolioSummaryData {
  name: string;
  description: string;
  currency: 'USD' | 'EUR';
  benchmark: string;
  totalValue: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  totalPnl: number;
  totalPnlPercent: number;
  positionCount: number;
  cashBalance: number;
  inceptionDate: string;
}

export interface StressScenario {
  id: number;
  name: string;
  description: string;
  type: 'historical' | 'parametric';
  equityShock: number;
  bondShock: number;
  commodityShock: number;
  portfolioImpact: number;
  worstPosition: string;
  worstPositionImpact: number;
}

export interface PortfolioData {
  id: string;
  summary: PortfolioSummaryData;
  positions: Position[];
  transactions: Transaction[];
  performanceData: { date: string; portfolio: number; benchmark: number; portfolioReturn: number; benchmarkReturn: number }[];
  monthlyReturns: { month: string; portfolio: number; benchmark: number }[];
  returnDistribution: { bin: string; frequency: number }[];
  allocationByClass: AllocationItem[];
  allocationBySector: AllocationItem[];
  allocationByCountry: AllocationItem[];
  riskMetrics: RiskMetricsData;
  correlationMatrix: { labels: string[]; data: number[][] };
  efficientFrontierData: { volatility: number; return: number }[];
  currentPortfolioPoint: { volatility: number; return: number };
  minVolPoint: { volatility: number; return: number };
  maxSharpePoint: { volatility: number; return: number };
  optimizedWeights: { symbol: string; current: number; minVol: number; maxSharpe: number; diff: number }[];
  stressScenarios: StressScenario[];
  stressContributions: { symbol: string; crisis2008: number; covid2020: number; rateShock: number }[];
  drawdownData: { date: string; drawdown: number; cumReturn: number }[];
  rollingVolatility: { date: string; portfolio: number; benchmark: number }[];
  rollingCorrelation: { date: string; correlation: number }[];
  recentActivity: { date: string; action: string; detail: string }[];
}

// =========== POSITION TEMPLATES ===========
const positionSets: Record<string, Omit<Position, 'originalCurrency' | 'originalEntryPrice' | 'fxRate'>[]> = {
  'global-multi-asset': [
    { id: 1, symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'Equity', sector: 'Technology', country: 'US', currency: 'USD', quantity: 500, entryPrice: 142.50, currentPrice: 189.84, entryDate: '2023-03-15', pricingMode: 'market', weight: 8.2, pnl: 23670, pnlPercent: 33.22, dailyChange: 1.24 },
    { id: 2, symbol: 'MSFT', name: 'Microsoft Corp.', assetClass: 'Equity', sector: 'Technology', country: 'US', currency: 'USD', quantity: 350, entryPrice: 248.30, currentPrice: 378.91, entryDate: '2023-01-10', pricingMode: 'market', weight: 11.4, pnl: 45713.50, pnlPercent: 52.59, dailyChange: 0.87 },
    { id: 3, symbol: 'NVDA', name: 'NVIDIA Corp.', assetClass: 'Equity', sector: 'Technology', country: 'US', currency: 'USD', quantity: 200, entryPrice: 180.12, currentPrice: 495.22, entryDate: '2023-02-20', pricingMode: 'market', weight: 8.5, pnl: 63020, pnlPercent: 175.0, dailyChange: 2.31 },
    { id: 4, symbol: 'JPM', name: 'JPMorgan Chase', assetClass: 'Equity', sector: 'Financials', country: 'US', currency: 'USD', quantity: 400, entryPrice: 131.80, currentPrice: 183.27, entryDate: '2023-04-05', pricingMode: 'market', weight: 6.3, pnl: 20588, pnlPercent: 39.05, dailyChange: -0.45 },
    { id: 5, symbol: 'JNJ', name: 'Johnson & Johnson', assetClass: 'Equity', sector: 'Healthcare', country: 'US', currency: 'USD', quantity: 300, entryPrice: 162.40, currentPrice: 156.74, entryDate: '2023-01-25', pricingMode: 'market', weight: 4.0, pnl: -1698, pnlPercent: -3.49, dailyChange: -0.12 },
    { id: 6, symbol: 'PG', name: 'Procter & Gamble', assetClass: 'Equity', sector: 'Consumer Staples', country: 'US', currency: 'USD', quantity: 250, entryPrice: 142.10, currentPrice: 157.83, entryDate: '2023-05-10', pricingMode: 'market', weight: 3.4, pnl: 3932.50, pnlPercent: 11.07, dailyChange: 0.33 },
    { id: 7, symbol: 'XOM', name: 'Exxon Mobil', assetClass: 'Equity', sector: 'Energy', country: 'US', currency: 'USD', quantity: 450, entryPrice: 108.50, currentPrice: 104.21, entryDate: '2023-03-01', pricingMode: 'market', weight: 4.0, pnl: -1930.50, pnlPercent: -3.95, dailyChange: -1.87 },
    { id: 8, symbol: 'LLY', name: 'Eli Lilly', assetClass: 'Equity', sector: 'Healthcare', country: 'US', currency: 'USD', quantity: 120, entryPrice: 340.20, currentPrice: 598.43, entryDate: '2023-02-14', pricingMode: 'market', weight: 6.2, pnl: 30987.60, pnlPercent: 75.90, dailyChange: 1.56 },
    { id: 9, symbol: 'V', name: 'Visa Inc.', assetClass: 'Equity', sector: 'Financials', country: 'US', currency: 'USD', quantity: 280, entryPrice: 218.90, currentPrice: 264.51, entryDate: '2023-06-01', pricingMode: 'market', weight: 6.4, pnl: 12770.80, pnlPercent: 20.84, dailyChange: 0.62 },
    { id: 10, symbol: 'SAP', name: 'SAP SE', assetClass: 'Equity', sector: 'Technology', country: 'DE', currency: 'EUR', quantity: 200, entryPrice: 112.30, currentPrice: 162.84, entryDate: '2023-04-20', pricingMode: 'market', weight: 2.8, pnl: 10108, pnlPercent: 45.0, dailyChange: 0.94 },
    { id: 11, symbol: 'ASML', name: 'ASML Holding', assetClass: 'Equity', sector: 'Technology', country: 'NL', currency: 'EUR', quantity: 50, entryPrice: 580.40, currentPrice: 712.50, entryDate: '2023-07-15', pricingMode: 'market', weight: 3.1, pnl: 6605, pnlPercent: 22.75, dailyChange: 1.12 },
    { id: 12, symbol: 'TLT', name: 'iShares 20+ Yr Treasury', assetClass: 'Bond ETF', sector: 'Fixed Income', country: 'US', currency: 'USD', quantity: 800, entryPrice: 102.30, currentPrice: 92.15, entryDate: '2023-01-05', pricingMode: 'market', weight: 6.3, pnl: -8120, pnlPercent: -9.92, dailyChange: 0.18 },
    { id: 13, symbol: 'LQD', name: 'iShares IG Corporate Bond', assetClass: 'Bond ETF', sector: 'Fixed Income', country: 'US', currency: 'USD', quantity: 600, entryPrice: 108.90, currentPrice: 107.24, entryDate: '2023-02-10', pricingMode: 'market', weight: 5.5, pnl: -996, pnlPercent: -1.52, dailyChange: 0.08 },
    { id: 14, symbol: 'GLD', name: 'SPDR Gold Shares', assetClass: 'Commodity ETF', sector: 'Commodities', country: 'US', currency: 'USD', quantity: 300, entryPrice: 175.40, currentPrice: 193.62, entryDate: '2023-03-20', pricingMode: 'market', weight: 5.0, pnl: 5466, pnlPercent: 10.39, dailyChange: 0.41 },
    { id: 15, symbol: 'CORP-BOND-A', name: 'Corporate Bond Series A', assetClass: 'Bond', sector: 'Fixed Income', country: 'US', currency: 'USD', quantity: 100, entryPrice: 980.00, currentPrice: 995.50, entryDate: '2023-05-01', pricingMode: 'fixed', weight: 8.6, pnl: 1550, pnlPercent: 1.58, dailyChange: 0.0 },
    { id: 16, symbol: 'SPY-PUT-4500', name: 'SPY Put 4500 Dec24', assetClass: 'Option', sector: 'Derivatives', country: 'US', currency: 'USD', quantity: 20, entryPrice: 42.50, currentPrice: 18.30, entryDate: '2024-06-15', pricingMode: 'market', weight: 0.3, pnl: -484, pnlPercent: -56.94, dailyChange: -3.21 },
  ],
  'tech-growth': [
    { id: 1, symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'Equity', sector: 'Technology', country: 'US', currency: 'USD', quantity: 800, entryPrice: 150.20, currentPrice: 189.84, entryDate: '2023-06-10', pricingMode: 'market', weight: 14.5, pnl: 31712, pnlPercent: 26.39, dailyChange: 1.24 },
    { id: 2, symbol: 'MSFT', name: 'Microsoft Corp.', assetClass: 'Equity', sector: 'Technology', country: 'US', currency: 'USD', quantity: 500, entryPrice: 280.00, currentPrice: 378.91, entryDate: '2023-04-15', pricingMode: 'market', weight: 18.1, pnl: 49455, pnlPercent: 35.33, dailyChange: 0.87 },
    { id: 3, symbol: 'NVDA', name: 'NVIDIA Corp.', assetClass: 'Equity', sector: 'Technology', country: 'US', currency: 'USD', quantity: 400, entryPrice: 220.50, currentPrice: 495.22, entryDate: '2023-05-01', pricingMode: 'market', weight: 18.9, pnl: 109888, pnlPercent: 124.57, dailyChange: 2.31 },
    { id: 4, symbol: 'GOOGL', name: 'Alphabet Inc.', assetClass: 'Equity', sector: 'Technology', country: 'US', currency: 'USD', quantity: 600, entryPrice: 108.40, currentPrice: 142.65, entryDate: '2023-03-20', pricingMode: 'market', weight: 8.2, pnl: 20550, pnlPercent: 31.59, dailyChange: 0.95 },
    { id: 5, symbol: 'META', name: 'Meta Platforms', assetClass: 'Equity', sector: 'Technology', country: 'US', currency: 'USD', quantity: 250, entryPrice: 210.30, currentPrice: 358.42, entryDate: '2023-02-10', pricingMode: 'market', weight: 8.6, pnl: 37030, pnlPercent: 70.38, dailyChange: 1.45 },
    { id: 6, symbol: 'AMD', name: 'Advanced Micro Devices', assetClass: 'Equity', sector: 'Technology', country: 'US', currency: 'USD', quantity: 350, entryPrice: 85.60, currentPrice: 145.80, entryDate: '2023-07-01', pricingMode: 'market', weight: 4.9, pnl: 21070, pnlPercent: 70.33, dailyChange: 1.88 },
    { id: 7, symbol: 'CRM', name: 'Salesforce Inc.', assetClass: 'Equity', sector: 'Technology', country: 'US', currency: 'USD', quantity: 200, entryPrice: 195.20, currentPrice: 265.30, entryDate: '2023-08-15', pricingMode: 'market', weight: 5.1, pnl: 14020, pnlPercent: 35.91, dailyChange: 0.72 },
    { id: 8, symbol: 'ADBE', name: 'Adobe Inc.', assetClass: 'Equity', sector: 'Technology', country: 'US', currency: 'USD', quantity: 120, entryPrice: 420.10, currentPrice: 542.80, entryDate: '2023-04-05', pricingMode: 'market', weight: 6.2, pnl: 14724, pnlPercent: 29.22, dailyChange: 0.56 },
    { id: 9, symbol: 'NOW', name: 'ServiceNow', assetClass: 'Equity', sector: 'Technology', country: 'US', currency: 'USD', quantity: 80, entryPrice: 485.30, currentPrice: 712.40, entryDate: '2023-05-20', pricingMode: 'market', weight: 5.4, pnl: 18168, pnlPercent: 46.82, dailyChange: 1.10 },
    { id: 10, symbol: 'ASML', name: 'ASML Holding', assetClass: 'Equity', sector: 'Technology', country: 'NL', currency: 'EUR', quantity: 60, entryPrice: 590.00, currentPrice: 712.50, entryDate: '2023-06-01', pricingMode: 'market', weight: 4.1, pnl: 7350, pnlPercent: 20.76, dailyChange: 1.12 },
    { id: 11, symbol: 'QQQ-CALL-420', name: 'QQQ Call 420 Mar25', assetClass: 'Option', sector: 'Derivatives', country: 'US', currency: 'USD', quantity: 50, entryPrice: 28.40, currentPrice: 45.20, entryDate: '2024-09-01', pricingMode: 'market', weight: 2.2, pnl: 840, pnlPercent: 59.15, dailyChange: 4.50 },
    { id: 12, symbol: 'TLT', name: 'iShares 20+ Yr Treasury', assetClass: 'Bond ETF', sector: 'Fixed Income', country: 'US', currency: 'USD', quantity: 200, entryPrice: 98.50, currentPrice: 92.15, entryDate: '2024-01-10', pricingMode: 'market', weight: 1.8, pnl: -1270, pnlPercent: -6.45, dailyChange: 0.18 },
  ],
  'conservative-income': [
    { id: 1, symbol: 'TLT', name: 'iShares 20+ Yr Treasury', assetClass: 'Bond ETF', sector: 'Fixed Income', country: 'US', currency: 'USD', quantity: 2000, entryPrice: 100.50, currentPrice: 92.15, entryDate: '2023-01-05', pricingMode: 'market', weight: 15.2, pnl: -16700, pnlPercent: -8.31, dailyChange: 0.18 },
    { id: 2, symbol: 'LQD', name: 'iShares IG Corporate Bond', assetClass: 'Bond ETF', sector: 'Fixed Income', country: 'US', currency: 'USD', quantity: 1500, entryPrice: 110.20, currentPrice: 107.24, entryDate: '2023-01-15', pricingMode: 'market', weight: 13.3, pnl: -4440, pnlPercent: -2.69, dailyChange: 0.08 },
    { id: 3, symbol: 'BND', name: 'Vanguard Total Bond Market', assetClass: 'Bond ETF', sector: 'Fixed Income', country: 'US', currency: 'USD', quantity: 1800, entryPrice: 73.80, currentPrice: 72.10, entryDate: '2023-02-01', pricingMode: 'market', weight: 10.7, pnl: -3060, pnlPercent: -2.30, dailyChange: 0.05 },
    { id: 4, symbol: 'CORP-BOND-A', name: 'Corporate Bond Series A', assetClass: 'Bond', sector: 'Fixed Income', country: 'US', currency: 'USD', quantity: 150, entryPrice: 980.00, currentPrice: 995.50, entryDate: '2023-03-01', pricingMode: 'fixed', weight: 12.3, pnl: 2325, pnlPercent: 1.58, dailyChange: 0.0 },
    { id: 5, symbol: 'CORP-BOND-B', name: 'Corporate Bond Series B', assetClass: 'Bond', sector: 'Fixed Income', country: 'US', currency: 'USD', quantity: 100, entryPrice: 1020.00, currentPrice: 1035.00, entryDate: '2023-04-15', pricingMode: 'fixed', weight: 8.5, pnl: 1500, pnlPercent: 1.47, dailyChange: 0.0 },
    { id: 6, symbol: 'JNJ', name: 'Johnson & Johnson', assetClass: 'Equity', sector: 'Healthcare', country: 'US', currency: 'USD', quantity: 400, entryPrice: 158.30, currentPrice: 156.74, entryDate: '2023-02-10', pricingMode: 'market', weight: 5.2, pnl: -624, pnlPercent: -0.99, dailyChange: -0.12 },
    { id: 7, symbol: 'PG', name: 'Procter & Gamble', assetClass: 'Equity', sector: 'Consumer Staples', country: 'US', currency: 'USD', quantity: 350, entryPrice: 145.60, currentPrice: 157.83, entryDate: '2023-03-20', pricingMode: 'market', weight: 4.6, pnl: 4280.50, pnlPercent: 8.40, dailyChange: 0.33 },
    { id: 8, symbol: 'KO', name: 'Coca-Cola Co.', assetClass: 'Equity', sector: 'Consumer Staples', country: 'US', currency: 'USD', quantity: 500, entryPrice: 58.40, currentPrice: 61.25, entryDate: '2023-01-20', pricingMode: 'market', weight: 2.5, pnl: 1425, pnlPercent: 4.88, dailyChange: 0.21 },
    { id: 9, symbol: 'VZ', name: 'Verizon Communications', assetClass: 'Equity', sector: 'Telecom', country: 'US', currency: 'USD', quantity: 600, entryPrice: 38.90, currentPrice: 42.15, entryDate: '2023-05-01', pricingMode: 'market', weight: 2.1, pnl: 1950, pnlPercent: 8.35, dailyChange: -0.28 },
    { id: 10, symbol: 'GLD', name: 'SPDR Gold Shares', assetClass: 'Commodity ETF', sector: 'Commodities', country: 'US', currency: 'USD', quantity: 500, entryPrice: 178.20, currentPrice: 193.62, entryDate: '2023-04-01', pricingMode: 'market', weight: 8.0, pnl: 7710, pnlPercent: 8.65, dailyChange: 0.41 },
    { id: 11, symbol: 'VNQ', name: 'Vanguard Real Estate ETF', assetClass: 'Equity', sector: 'Real Estate', country: 'US', currency: 'USD', quantity: 400, entryPrice: 82.50, currentPrice: 85.30, entryDate: '2023-06-15', pricingMode: 'market', weight: 2.8, pnl: 1120, pnlPercent: 3.39, dailyChange: 0.15 },
  ],
};

const allocationSets: Record<string, { byClass: AllocationItem[]; bySector: AllocationItem[]; byCountry: AllocationItem[] }> = {
  'global-multi-asset': {
    byClass: [
      { name: 'Equity', value: 64.3, color: '#3b82f6' },
      { name: 'Bond ETF', value: 11.8, color: '#10b981' },
      { name: 'Bond', value: 8.6, color: '#6366f1' },
      { name: 'Commodity ETF', value: 5.0, color: '#f59e0b' },
      { name: 'Option', value: 0.3, color: '#ef4444' },
      { name: 'Cash', value: 10.0, color: '#94a3b8' },
    ],
    bySector: [
      { name: 'Technology', value: 34.0, color: '#3b82f6' },
      { name: 'Financials', value: 12.7, color: '#10b981' },
      { name: 'Healthcare', value: 10.2, color: '#8b5cf6' },
      { name: 'Fixed Income', value: 20.4, color: '#6366f1' },
      { name: 'Consumer Staples', value: 3.4, color: '#f59e0b' },
      { name: 'Energy', value: 4.0, color: '#ef4444' },
      { name: 'Commodities', value: 5.0, color: '#ec4899' },
      { name: 'Derivatives', value: 0.3, color: '#14b8a6' },
      { name: 'Cash', value: 10.0, color: '#94a3b8' },
    ],
    byCountry: [
      { name: 'United States', value: 83.5, color: '#3b82f6' },
      { name: 'Germany', value: 2.8, color: '#f59e0b' },
      { name: 'Netherlands', value: 3.1, color: '#ef4444' },
      { name: 'Cash/Other', value: 10.6, color: '#94a3b8' },
    ],
  },
  'tech-growth': {
    byClass: [
      { name: 'Equity', value: 93.9, color: '#3b82f6' },
      { name: 'Bond ETF', value: 1.8, color: '#10b981' },
      { name: 'Option', value: 2.2, color: '#ef4444' },
      { name: 'Cash', value: 2.1, color: '#94a3b8' },
    ],
    bySector: [
      { name: 'Technology', value: 93.9, color: '#3b82f6' },
      { name: 'Fixed Income', value: 1.8, color: '#6366f1' },
      { name: 'Derivatives', value: 2.2, color: '#14b8a6' },
      { name: 'Cash', value: 2.1, color: '#94a3b8' },
    ],
    byCountry: [
      { name: 'United States', value: 91.8, color: '#3b82f6' },
      { name: 'Netherlands', value: 4.1, color: '#ef4444' },
      { name: 'Cash/Other', value: 4.1, color: '#94a3b8' },
    ],
  },
  'conservative-income': {
    byClass: [
      { name: 'Equity', value: 17.2, color: '#3b82f6' },
      { name: 'Bond ETF', value: 39.2, color: '#10b981' },
      { name: 'Bond', value: 20.8, color: '#6366f1' },
      { name: 'Commodity ETF', value: 8.0, color: '#f59e0b' },
      { name: 'Cash', value: 14.8, color: '#94a3b8' },
    ],
    bySector: [
      { name: 'Fixed Income', value: 60.0, color: '#6366f1' },
      { name: 'Healthcare', value: 5.2, color: '#8b5cf6' },
      { name: 'Consumer Staples', value: 7.1, color: '#f59e0b' },
      { name: 'Telecom', value: 2.1, color: '#ec4899' },
      { name: 'Commodities', value: 8.0, color: '#f59e0b' },
      { name: 'Real Estate', value: 2.8, color: '#14b8a6' },
      { name: 'Cash', value: 14.8, color: '#94a3b8' },
    ],
    byCountry: [
      { name: 'United States', value: 100.0, color: '#3b82f6' },
    ],
  },
};

// Generate full portfolio data from parameters
export function generatePortfolioData(config: {
  id: string;
  name: string;
  description: string;
  currency: 'USD' | 'EUR';
  benchmark: string;
  seed: number;
  annualReturn: number;
  annualVol: number;
  benchReturn: number;
  benchVol: number;
  startValue: number;
  positionSet: string;
}): PortfolioData {
  const {
    id, name, description, currency, benchmark, seed,
    annualReturn, annualVol, benchReturn, benchVol, startValue, positionSet
  } = config;

  const tradingDays = 504;
  const dates: string[] = [];
  const startDate = new Date('2023-01-03');
  for (let i = 0; i < tradingDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + Math.floor(i * 365.25 / 252));
    dates.push(d.toISOString().split('T')[0]);
  }

  const pReturns = generateDailyReturns(tradingDays, annualReturn, annualVol, seed);
  const bReturns = generateDailyReturns(tradingDays, benchReturn, benchVol, seed + 57);
  const pValues = cumulativeFromReturns(pReturns, startValue);
  const bValues = cumulativeFromReturns(bReturns, startValue);

  const finalValue = Math.round(pValues[pValues.length - 1]);
  const totalPnl = finalValue - startValue;
  const totalPnlPercent = (totalPnl / startValue) * 100;
  const dailyPnl = Math.round(pValues[pValues.length - 1] - pValues[pValues.length - 2]);
  const dailyPnlPercent = ((pValues[pValues.length - 1] / pValues[pValues.length - 2]) - 1) * 100;

  const positions = (positionSets[positionSet] || positionSets['global-multi-asset']).map(p => ({ ...p, originalCurrency: p.currency, originalEntryPrice: p.entryPrice, fxRate: 1.0 }));
  const allocs = allocationSets[positionSet] || allocationSets['global-multi-asset'];

  const performanceData = dates.map((date, i) => ({
    date,
    portfolio: Math.round(pValues[i]),
    benchmark: Math.round(bValues[i]),
    portfolioReturn: ((pValues[i] / pValues[0] - 1) * 100),
    benchmarkReturn: ((bValues[i] / bValues[0] - 1) * 100),
  }));

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyReturns = monthNames.map((m, i) => ({
    month: `${m} 24`,
    portfolio: parseFloat((((seededRandom(seed + i * 3) - 0.4) * 6)).toFixed(1)),
    benchmark: parseFloat((((seededRandom(seed + i * 3 + 100) - 0.4) * 5)).toFixed(1)),
  }));

  const returnDistribution = Array.from({ length: 30 }, (_, i) => {
    const binCenter = -3 + i * 0.2;
    const freq = Math.round(Math.exp(-0.5 * binCenter * binCenter / 0.8) * 40 + seededRandom(seed + i * 7) * 5);
    return { bin: `${binCenter.toFixed(1)}%`, frequency: freq };
  });

  const vol = annualVol * 100;
  const ret = annualReturn * 100;
  const sharpe = ret / vol;
  const maxDD = -(vol * 0.8 + seededRandom(seed + 200) * 5);

  const riskMetrics: RiskMetricsData = {
    annualizedReturn: parseFloat(ret.toFixed(2)),
    annualizedVolatility: parseFloat(vol.toFixed(2)),
    sharpeRatio: parseFloat(sharpe.toFixed(2)),
    sortinoRatio: parseFloat((sharpe * 1.4 + seededRandom(seed + 10) * 0.3).toFixed(2)),
    calmarRatio: parseFloat(Math.abs(ret / maxDD).toFixed(2)),
    informationRatio: parseFloat(((ret - benchReturn * 100) / (vol * 0.4)).toFixed(2)),
    maxDrawdown: parseFloat(maxDD.toFixed(2)),
    maxDrawdownDuration: Math.round(30 + seededRandom(seed + 20) * 40),
    beta: parseFloat((0.6 + seededRandom(seed + 30) * 0.6).toFixed(2)),
    alpha: parseFloat(((ret - benchReturn * 100) * (0.5 + seededRandom(seed + 40) * 0.5)).toFixed(2)),
    trackingError: parseFloat((4 + seededRandom(seed + 50) * 5).toFixed(2)),
    rSquared: parseFloat((0.7 + seededRandom(seed + 60) * 0.25).toFixed(2)),
    var95: parseFloat((-vol / 7 - seededRandom(seed + 70) * 0.5).toFixed(2)),
    var99: parseFloat((-vol / 5 - seededRandom(seed + 80) * 0.5).toFixed(2)),
    cvar95: parseFloat((-vol / 6 - seededRandom(seed + 90) * 0.8).toFixed(2)),
    cvar99: parseFloat((-vol / 4 - seededRandom(seed + 91) * 0.8).toFixed(2)),
    downsideDeviation: parseFloat((vol * 0.7).toFixed(2)),
    skewness: parseFloat((-0.1 - seededRandom(seed + 92) * 0.5).toFixed(2)),
    kurtosis: parseFloat((3 + seededRandom(seed + 93) * 2).toFixed(2)),
    bestDay: parseFloat((vol / 4 + seededRandom(seed + 94) * 1).toFixed(2)),
    worstDay: parseFloat((-vol / 3 - seededRandom(seed + 95) * 1).toFixed(2)),
    bestMonth: parseFloat((vol / 3 + seededRandom(seed + 96) * 2).toFixed(2)),
    worstMonth: parseFloat((-vol / 2.5 - seededRandom(seed + 97) * 2).toFixed(2)),
    positiveMonths: Math.round(55 + seededRandom(seed + 98) * 20),
    winRate: parseFloat((50 + seededRandom(seed + 99) * 15).toFixed(1)),
  };

  const corrLabels = positions.slice(0, Math.min(10, positions.length)).map(p => p.symbol);
  const n = corrLabels.length;
  const corrData: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) row.push(1.0);
      else if (j < i) row.push(corrData[j][i]);
      else {
        const val = parseFloat((seededRandom(seed + i * 100 + j) * 1.6 - 0.4).toFixed(2));
        row.push(Math.max(-1, Math.min(1, val)));
      }
    }
    corrData.push(row);
  }

  const efficientFrontierData = Array.from({ length: 25 }, (_, i) => {
    const v = 8 + i * 1.2;
    const r = 3 + v * 0.55 - 0.008 * v * v + seededRandom(seed + i * 13) * 1.5;
    return { volatility: parseFloat(v.toFixed(2)), return: parseFloat(r.toFixed(2)) };
  });

  const currentPortfolioPoint = { volatility: parseFloat(vol.toFixed(2)), return: parseFloat(ret.toFixed(2)) };
  const minVolPoint = { volatility: parseFloat((8 + seededRandom(seed + 300) * 2).toFixed(1)), return: parseFloat((5 + seededRandom(seed + 301) * 3).toFixed(1)) };
  const maxSharpePoint = { volatility: parseFloat((11 + seededRandom(seed + 302) * 3).toFixed(1)), return: parseFloat((10 + seededRandom(seed + 303) * 4).toFixed(1)) };

  const optimizedWeights = positions.slice(0, Math.min(positions.length, 14)).map(p => {
    const mv = parseFloat((p.weight * (0.4 + seededRandom(seed + p.id * 10) * 1.2)).toFixed(1));
    const ms = parseFloat((p.weight * (0.6 + seededRandom(seed + p.id * 11) * 0.8)).toFixed(1));
    return { symbol: p.symbol, current: p.weight, minVol: mv, maxSharpe: ms, diff: parseFloat((ms - p.weight).toFixed(1)) };
  });
  optimizedWeights.push({ symbol: 'Cash', current: parseFloat((100 - positions.reduce((s, p) => s + p.weight, 0)).toFixed(1)), minVol: 2.0, maxSharpe: 4.0, diff: -6.0 });

  const topSymbols = positions.slice(0, 5).map(p => p.symbol);
  const stressScenarios: StressScenario[] = [
    { id: 1, name: '2008 Financial Crisis', description: 'Replay of Sep-Nov 2008 market conditions', type: 'historical', equityShock: -38.5, bondShock: -5.2, commodityShock: -25.0, portfolioImpact: parseFloat((-20 - seededRandom(seed + 400) * 15).toFixed(1)), worstPosition: topSymbols[2] || 'N/A', worstPositionImpact: parseFloat((-40 - seededRandom(seed + 401) * 15).toFixed(1)) },
    { id: 2, name: '2020 COVID Crash', description: 'Replay of Feb-Mar 2020 pandemic sell-off', type: 'historical', equityShock: -33.9, bondShock: 8.5, commodityShock: -12.4, portfolioImpact: parseFloat((-15 - seededRandom(seed + 410) * 12).toFixed(1)), worstPosition: topSymbols[3] || 'N/A', worstPositionImpact: parseFloat((-35 - seededRandom(seed + 411) * 15).toFixed(1)) },
    { id: 3, name: '2022 Rate Shock', description: 'Replay of 2022 interest rate hiking cycle', type: 'historical', equityShock: -19.4, bondShock: -17.8, commodityShock: 15.2, portfolioImpact: parseFloat((-10 - seededRandom(seed + 420) * 10).toFixed(1)), worstPosition: positions.find(p => p.assetClass.includes('Bond'))?.symbol || topSymbols[0], worstPositionImpact: parseFloat((-25 - seededRandom(seed + 421) * 10).toFixed(1)) },
    { id: 4, name: 'Equity Bear Market', description: 'Custom scenario: -30% equity decline', type: 'parametric', equityShock: -30.0, bondShock: 5.0, commodityShock: -10.0, portfolioImpact: parseFloat((-15 - seededRandom(seed + 430) * 8).toFixed(1)), worstPosition: topSymbols[2] || 'N/A', worstPositionImpact: parseFloat((-35 - seededRandom(seed + 431) * 10).toFixed(1)) },
    { id: 5, name: 'Stagflation', description: 'Custom: rates up + equity down + commodities up', type: 'parametric', equityShock: -15.0, bondShock: -12.0, commodityShock: 20.0, portfolioImpact: parseFloat((-8 - seededRandom(seed + 440) * 8).toFixed(1)), worstPosition: positions.find(p => p.assetClass.includes('Bond'))?.symbol || topSymbols[0], worstPositionImpact: parseFloat((-20 - seededRandom(seed + 441) * 10).toFixed(1)) },
  ];

  const stressContributions = positions.slice(0, Math.min(10, positions.length)).map(p => ({
    symbol: p.symbol,
    crisis2008: parseFloat((-15 - seededRandom(seed + p.id * 50) * 40).toFixed(1)),
    covid2020: parseFloat((-10 - seededRandom(seed + p.id * 51) * 35).toFixed(1)),
    rateShock: parseFloat((-5 - seededRandom(seed + p.id * 52) * 25 + (p.assetClass.includes('Bond') ? 10 : 0)).toFixed(1)),
  }));

  const drawdownData = dates.map((date, i) => {
    const cumRet = pValues[i] / pValues[0];
    let peak = pValues[0];
    for (let j = 0; j <= i; j++) {
      if (pValues[j] > peak) peak = pValues[j];
    }
    const dd = ((pValues[i] - peak) / peak) * 100;
    return { date, drawdown: parseFloat(dd.toFixed(2)), cumReturn: parseFloat(((cumRet - 1) * 100).toFixed(2)) };
  });

  const rollingVolatility = dates.filter((_, i) => i % 5 === 0).map((date, i) => ({
    date,
    portfolio: vol * 0.7 + Math.sin(i * 0.15) * vol * 0.3 + seededRandom(seed + i * 23) * vol * 0.15,
    benchmark: benchVol * 100 * 0.8 + Math.sin(i * 0.12 + 1) * benchVol * 100 * 0.2 + seededRandom(seed + i * 31) * benchVol * 100 * 0.15,
  }));

  const rollingCorrelation = dates.filter((_, i) => i % 5 === 0).map((date, i) => ({
    date,
    correlation: 0.75 + Math.sin(i * 0.1) * 0.15 + (seededRandom(seed + i * 17) - 0.5) * 0.08,
  }));

  const recentActivity = [
    { date: '2024-12-20', action: 'Price Update', detail: `Market prices updated for ${positions.filter(p => p.pricingMode === 'market').length} instruments` },
    { date: '2024-12-19', action: 'Position Added', detail: `Added ${positions[positions.length - 1]?.symbol || 'N/A'}` },
    { date: '2024-12-18', action: 'Optimization Run', detail: 'Max Sharpe optimization completed' },
    { date: '2024-12-17', action: 'Shared Access', detail: 'Portfolio shared with jsmith (view-only)' },
    { date: '2024-12-16', action: 'Stress Test', detail: '2008 Crisis scenario analysis completed' },
    { date: '2024-12-15', action: 'Rebalance', detail: 'Portfolio rebalanced to target weights' },
  ];

  // Generate transactions from positions
  // transaction generation
  const transactions: Transaction[] = [];
  let txId = 1;

  // Initial deposit
  transactions.push({
    id: txId++, date: '2023-01-02', type: 'deposit', symbol: '—', name: 'Initial Deposit',
    quantity: 1, price: startValue, total: startValue, currency, notes: 'Portfolio funding',
  });

  // Generate buy transactions from positions
  positions.forEach(p => {
    transactions.push({
      id: txId++, date: p.entryDate, type: 'buy', symbol: p.symbol, name: p.name,
      quantity: p.quantity, price: p.entryPrice, total: parseFloat((p.quantity * p.entryPrice).toFixed(2)),
      currency: p.currency, notes: `Acquired ${p.quantity} units of ${p.symbol}`,
    });
  });

  // Some dividends and fees
  const divSymbols = positions.filter(p => p.assetClass === 'Equity').slice(0, 4);
  divSymbols.forEach((p, i) => {
    const divDate = new Date(p.entryDate);
    divDate.setMonth(divDate.getMonth() + 3 + i);
    const divAmount = parseFloat((p.quantity * (0.5 + seededRandom(seed + p.id * 77) * 1.5)).toFixed(2));
    transactions.push({
      id: txId++, date: divDate.toISOString().split('T')[0], type: 'dividend', symbol: p.symbol, name: p.name,
      quantity: p.quantity, price: parseFloat((divAmount / p.quantity).toFixed(4)), total: divAmount,
      currency: p.currency, notes: `Quarterly dividend`,
    });
  });

  // A few fees
  transactions.push({
    id: txId++, date: '2023-06-30', type: 'fee', symbol: '—', name: 'Management Fee',
    quantity: 1, price: 250, total: -250, currency, notes: 'H1 2023 management fee',
  });
  transactions.push({
    id: txId++, date: '2023-12-31', type: 'fee', symbol: '—', name: 'Management Fee',
    quantity: 1, price: 250, total: -250, currency, notes: 'H2 2023 management fee',
  });

  // Maybe a sell
  if (positions.length > 5) {
    const soldPos = positions[4];
    const sellQty = Math.round(soldPos.quantity * 0.3);
    transactions.push({
      id: txId++, date: '2024-03-15', type: 'sell', symbol: soldPos.symbol, name: soldPos.name,
      quantity: sellQty, price: soldPos.currentPrice, total: parseFloat((sellQty * soldPos.currentPrice).toFixed(2)),
      currency: soldPos.currency, notes: `Partial trim of ${soldPos.symbol}`,
    });
  }

  // Sort by date descending
  transactions.sort((a, b) => b.date.localeCompare(a.date));

  return {
    id,
    summary: {
      name, description, currency, benchmark,
      totalValue: finalValue,
      dailyPnl, dailyPnlPercent: parseFloat(dailyPnlPercent.toFixed(2)),
      totalPnl, totalPnlPercent: parseFloat(totalPnlPercent.toFixed(2)),
      positionCount: positions.length,
      cashBalance: Math.round(finalValue * 0.1),
      inceptionDate: '2023-01-03',
    },
    positions,
    transactions,
    performanceData,
    monthlyReturns,
    returnDistribution,
    allocationByClass: allocs.byClass,
    allocationBySector: allocs.bySector,
    allocationByCountry: allocs.byCountry,
    riskMetrics,
    correlationMatrix: { labels: corrLabels, data: corrData },
    efficientFrontierData,
    currentPortfolioPoint,
    minVolPoint,
    maxSharpePoint,
    optimizedWeights,
    stressScenarios,
    stressContributions,
    drawdownData,
    rollingVolatility,
    rollingCorrelation,
    recentActivity,
  };
}

// =========== DEFAULT PORTFOLIOS ===========

export const defaultPortfolios: PortfolioData[] = [
  generatePortfolioData({
    id: 'pf-1',
    name: 'Global Multi-Asset Fund',
    description: 'Diversified portfolio across equities, bonds, and commodities with global exposure',
    currency: 'USD',
    benchmark: 'S&P 500 (SPY)',
    seed: 42,
    annualReturn: 0.12,
    annualVol: 0.16,
    benchReturn: 0.10,
    benchVol: 0.18,
    startValue: 1000000,
    positionSet: 'global-multi-asset',
  }),
  generatePortfolioData({
    id: 'pf-2',
    name: 'Tech Growth Alpha',
    description: 'Concentrated technology equity portfolio targeting high-growth companies',
    currency: 'USD',
    benchmark: 'NASDAQ 100 (QQQ)',
    seed: 137,
    annualReturn: 0.22,
    annualVol: 0.28,
    benchReturn: 0.18,
    benchVol: 0.24,
    startValue: 500000,
    positionSet: 'tech-growth',
  }),
  generatePortfolioData({
    id: 'pf-3',
    name: 'Conservative Income',
    description: 'Income-focused portfolio with heavy fixed income allocation and defensive equities',
    currency: 'EUR',
    benchmark: 'Euro Stoxx 50 (SX5E)',
    seed: 256,
    annualReturn: 0.05,
    annualVol: 0.08,
    benchReturn: 0.07,
    benchVol: 0.15,
    startValue: 750000,
    positionSet: 'conservative-income',
  }),
];

// =========== USERS (unchanged) ===========

export interface Transaction {
  id: number;
  date: string;
  type: 'buy' | 'sell' | 'dividend' | 'fee' | 'deposit' | 'withdrawal';
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
  currency: string;
  notes: string;
}



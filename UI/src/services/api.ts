// In dev mode, Vite proxies /api to the sidecar. In production (Tauri), connect directly.
const API_URL = import.meta.env.DEV ? '/api/v1' : 'http://127.0.0.1:8742/api/v1';

/** Current user ID — set by AuthContext when a user is selected */
let _currentUserId: number | null = null;
export function setCurrentUserId(id: number | null) { _currentUserId = id; }
export function getCurrentUserId() { return _currentUserId; }

export async function request(endpoint: string, options: RequestInit = {}) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    // Attach user ID header if set
    if (_currentUserId != null) {
        headers['X-User-Id'] = String(_currentUserId);
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        const detail = error.detail;
        const message = typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
                ? detail.map((e: any) => typeof e === 'string' ? e : (e.msg || JSON.stringify(e))).join('; ')
                : (detail ? JSON.stringify(detail) : 'API request failed');
        throw new Error(message);
    }

    // Handle 204 No Content
    if (response.status === 204) return null;
    return response.json();
}

export const api = {
    // ─── Users (multi-user) ─────────────────────────────
    users: {
        list: () => request('/users/'),
        create: (data: { display_name: string; organization?: string; avatar_url?: string }) =>
            request('/users/', { method: 'POST', body: JSON.stringify(data) }),
        get: (id: number) => request(`/users/${id}`),
        update: (id: number, data: { display_name?: string; organization?: string; avatar_url?: string }) =>
            request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        delete: (id: number) => request(`/users/${id}`, { method: 'DELETE' }),
    },

    // ─── Portfolios ─────────────────────────────────────
    portfolios: {
        list: () => request('/portfolios/'),
        create: (data: any) => request('/portfolios/', { method: 'POST', body: JSON.stringify(data) }),
        get: (id: number) => request(`/portfolios/${id}`),
        update: (id: number, data: any) => request(`/portfolios/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        delete: (id: number) => request(`/portfolios/${id}`, { method: 'DELETE' }),
        duplicate: (id: number) => request(`/portfolios/${id}/duplicate`, { method: 'POST' }),

        // Positions
        addPosition: (id: number, data: any) =>
            request(`/portfolios/${id}/positions`, { method: 'POST', body: JSON.stringify(data) }),
        updatePosition: (id: number, posId: number, data: any) =>
            request(`/portfolios/${id}/positions/${posId}`, { method: 'PUT', body: JSON.stringify(data) }),
        deletePosition: (id: number, posId: number) =>
            request(`/portfolios/${id}/positions/${posId}`, { method: 'DELETE' }),
        importPositions: (id: number, positions: any[]) =>
            request(`/portfolios/${id}/import`, { method: 'POST', body: JSON.stringify({ positions }) }),
        findDuplicates: (id: number) =>
            request(`/portfolios/${id}/positions/duplicates`),
        mergeDuplicates: (id: number) =>
            request(`/portfolios/${id}/positions/merge-duplicates`, { method: 'POST' }),
        removeDuplicates: (id: number) =>
            request(`/portfolios/${id}/positions/remove-duplicates`, { method: 'POST' }),

        // Transactions
        listTransactions: (id: number) => request(`/portfolios/${id}/transactions`),
        addTransaction: (id: number, data: any) =>
            request(`/portfolios/${id}/transactions`, { method: 'POST', body: JSON.stringify(data) }),
        deleteTransaction: (id: number, txId: number) =>
            request(`/portfolios/${id}/transactions/${txId}`, { method: 'DELETE' }),

        // Analytics & Optimization
        getAnalytics: (id: number, params?: { benchmark?: string; start_date?: string; end_date?: string }) => {
            const qs = new URLSearchParams();
            if (params?.benchmark) qs.set('benchmark', params.benchmark);
            if (params?.start_date) qs.set('start_date', params.start_date);
            if (params?.end_date) qs.set('end_date', params.end_date);
            const suffix = qs.toString() ? `?${qs.toString()}` : '';
            return request(`/portfolios/${id}/analytics${suffix}`);
        },
        optimize: (id: number, target: string, constraints?: { min_weight?: number; max_weight?: number; risk_aversion?: number }) =>
            request(`/portfolios/${id}/optimize`, { method: 'POST', body: JSON.stringify({ target, ...constraints }) }),
        getOptimizationData: (id: number, constraints?: { min_weight?: number; max_weight?: number; risk_aversion?: number }) => {
            const qs = new URLSearchParams();
            if (constraints?.min_weight != null) qs.set('min_weight', String(constraints.min_weight));
            if (constraints?.max_weight != null) qs.set('max_weight', String(constraints.max_weight));
            if (constraints?.risk_aversion != null) qs.set('risk_aversion', String(constraints.risk_aversion));
            const suffix = qs.toString() ? `?${qs.toString()}` : '';
            return request(`/portfolios/${id}/optimize/frontier${suffix}`);
        },
        saveOptimized: (id: number, name: string, weights: Record<string, number>) =>
            request(`/portfolios/${id}/optimize/save`, { method: 'POST', body: JSON.stringify({ name, weights }) }),

        // Backtesting
        runBacktest: (id: number, params: {
            start_date: string; end_date: string;
            initial_capital?: number; benchmark?: string;
            rebalance_freq?: string; custom_weights?: Record<string, number>;
        }) => request(`/portfolios/${id}/backtest`, { method: 'POST', body: JSON.stringify(params) }),
    },

    // ─── Market Data ────────────────────────────────────
    marketData: {
        getPrice: (symbol: string, date: string) => request(`/market-data/price/${symbol}?date=${date}`),
        searchTicker: (query: string) => request(`/market-data/search/${encodeURIComponent(query)}`),
        validateTickers: (symbols: string[], currencyHints?: (string | null)[]) =>
            request('/market-data/validate-tickers', { method: 'POST', body: JSON.stringify({ symbols, currency_hints: currencyHints }) }),
    },

    // ─── JSON Portfolio Export/Import ────────────────────
    portfolioJson: {
        exportPortfolio: (id: number) => request(`/portfolios/${id}/export-json`),
        importPortfolio: (data: any) =>
            request('/portfolios/import-json', { method: 'POST', body: JSON.stringify(data) }),
    },
};

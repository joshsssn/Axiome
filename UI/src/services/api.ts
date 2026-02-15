const API_URL = '/api/v1';

export async function request(endpoint: string, options: RequestInit = {}) {
    const token = localStorage.getItem('access_token');
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(options.headers as Record<string, string>),
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'API request failed');
    }

    // Handle 204 No Content
    if (response.status === 204) return null;
    return response.json();
}

export const api = {
    // ─── Auth ───────────────────────────────────────────
    auth: {
        login: (username: string, password: string) =>
            request('/login/access-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ username, password }),
            }),
    },

    // ─── Users ──────────────────────────────────────────
    users: {
        me: () => request('/users/me'),
        updateMe: (data: { email?: string; username?: string; display_name?: string; organization?: string; avatar_url?: string }) =>
            request('/users/me', { method: 'PUT', body: JSON.stringify(data) }),
        changePassword: (currentPassword: string, newPassword: string) =>
            request('/users/me/password', {
                method: 'PUT',
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
            }),
        list: () => request('/users/'),
        create: (data: { username: string; email: string; password: string; role?: string }) =>
            request('/users/', { method: 'POST', body: JSON.stringify(data) }),
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

        // Transactions
        listTransactions: (id: number) => request(`/portfolios/${id}/transactions`),
        addTransaction: (id: number, data: any) =>
            request(`/portfolios/${id}/transactions`, { method: 'POST', body: JSON.stringify(data) }),
        deleteTransaction: (id: number, txId: number) =>
            request(`/portfolios/${id}/transactions/${txId}`, { method: 'DELETE' }),

        // Collaborators
        listCollaborators: (id: number) => request(`/portfolios/${id}/collaborators`),
        addCollaborator: (id: number, data: { user_id: number; permission: string }) =>
            request(`/portfolios/${id}/collaborators`, { method: 'POST', body: JSON.stringify(data) }),
        updateCollaborator: (id: number, collabId: number, data: { permission: string }) =>
            request(`/portfolios/${id}/collaborators/${collabId}`, { method: 'PUT', body: JSON.stringify(data) }),
        deleteCollaborator: (id: number, collabId: number) =>
            request(`/portfolios/${id}/collaborators/${collabId}`, { method: 'DELETE' }),

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
    },
};

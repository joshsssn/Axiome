import pandas as pd
import numpy as np
import logging
from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import List, Dict, Any, Optional

from app.models.portfolio import Portfolio, Position
from app.services.market_data import MarketDataService
from app.schemas.analytics import (
    RiskMetrics, PortfolioAnalytics, AllocationItem,
    PerformancePoint, MonthlyReturn, DistributionBin, CorrelationMatrix
)

logger = logging.getLogger(__name__)


def _safe_float(val: Any, default: float = 0.0) -> float:
    """Safely convert any value to float, returning default on failure."""
    if val is None:
        return default
    try:
        result = float(val)
        if np.isnan(result) or np.isinf(result):
            return default
        return result
    except (ValueError, TypeError):
        return default

# Color palettes for allocation charts
ALLOC_COLORS = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#94a3b8', '#f97316']

class AnalyticsService:
    def __init__(self, db: Session):
        self.db = db
        self.md_service = MarketDataService(db)

    def get_portfolio_analytics(self, portfolio: Portfolio, benchmark_override: Optional[str] = None, start_date_override: Optional[date] = None, end_date_override: Optional[date] = None) -> PortfolioAnalytics:
        if not portfolio.positions:
            return self._get_empty_analytics()

        end_date = end_date_override or date.today()

        # Default start = earliest position entry date (not 2 years ago)
        if start_date_override:
            start_date = start_date_override
        else:
            entry_dates = [p.entry_date for p in portfolio.positions if p.entry_date]
            start_date = min(entry_dates) if entry_dates else (end_date - timedelta(days=365 * 2))
            # Pad a few days before earliest entry so first-day return is computable
            start_date = start_date - timedelta(days=5)

        symbols = [p.instrument_symbol for p in portfolio.positions]
        benchmark_symbol = benchmark_override or portfolio.benchmark_symbol or "SPY"
        all_symbols = list(set(symbols + [benchmark_symbol]))

        # Batch: ensure all instruments exist (DB only) then download missing history
        self.md_service.ensure_instruments_exist(all_symbols)
        self.md_service.batch_download_history(all_symbols, start_date, end_date)

        price_data = {}
        for sym in all_symbols:
            try:
                history = self.md_service.get_price_history(sym, start_date, end_date)
                if history:
                    dates = [h.date for h in history]
                    prices = [h.adjusted_close or h.close for h in history]
                    s = pd.Series(data=prices, index=pd.to_datetime(dates))
                    s = s[~s.index.duplicated(keep='first')]
                    price_data[sym] = s
            except Exception as e:
                logger.warning(f"Error fetching {sym}: {e}")

        df_prices = pd.DataFrame(price_data)
        df_prices = df_prices.ffill().dropna()

        if df_prices.empty or len(df_prices) < 5:
            return self._get_empty_analytics()

        # -- Aggregate position quantities & entry dates --
        position_qty: Dict[str, float] = {}
        position_entry: Dict[str, date] = {}
        for p in portfolio.positions:
            sym = p.instrument_symbol
            if sym in df_prices.columns:
                position_qty[sym] = position_qty.get(sym, 0) + p.quantity
                ed = p.entry_date or start_date
                if sym not in position_entry or ed < position_entry[sym]:
                    position_entry[sym] = ed

        # Current weights (used for allocation charts)
        current_values: Dict[str, float] = {}
        total_value = 0.0
        for sym, qty in position_qty.items():
            last_price = float(df_prices[sym].iloc[-1])
            val = qty * last_price
            current_values[sym] = val
            total_value += val
        weights = {sym: val / total_value for sym, val in current_values.items()} if total_value > 0 else {}
        valid_symbols = [s for s in weights.keys() if s in df_prices.columns]

        if not valid_symbols:
            return self._get_empty_analytics()

        returns = df_prices.pct_change().dropna()

        # -- Dynamic weights: position-aware (weight=0 before entry_date) --
        qty_series = pd.Series({sym: position_qty[sym] for sym in valid_symbols})
        mask = pd.DataFrame(0.0, index=df_prices.index, columns=valid_symbols)
        for sym in valid_symbols:
            entry_ts = pd.Timestamp(position_entry.get(sym, start_date))
            mask.loc[mask.index >= entry_ts, sym] = 1.0

        mkt_vals = df_prices[valid_symbols].multiply(qty_series) * mask
        daily_total = mkt_vals.sum(axis=1).replace(0, np.nan)
        weights_df = mkt_vals.div(daily_total, axis=0).fillna(0)

        # Use previous day's weights for today's return (standard methodology)
        shifted_w = weights_df.shift(1)
        shifted_w.iloc[0] = weights_df.iloc[0]

        # Align mask to returns index
        ret_mask = mask.reindex(returns.index).fillna(0)
        pf_returns = (returns[valid_symbols] * shifted_w.reindex(returns.index).fillna(0) * ret_mask).sum(axis=1)

        # Keep only days with at least one active position
        active_days = ret_mask.sum(axis=1) > 0
        pf_returns = pf_returns[active_days]

        bench_returns = returns[benchmark_symbol] if benchmark_symbol in returns.columns else pd.Series(0, index=returns.index)

        # Align indices
        common_idx = pf_returns.index.intersection(bench_returns.index)
        pf_returns = pf_returns.loc[common_idx]
        bench_returns = bench_returns.loc[common_idx]

        if len(pf_returns) < 5:
            return self._get_empty_analytics()

        # ======= RISK METRICS =======
        metrics = self._compute_risk_metrics(pf_returns, bench_returns)

        # ======= PERFORMANCE DATA (cumulative) =======
        pf_cum_ret = ((1 + pf_returns).cumprod() - 1) * 100
        bench_cum_ret = ((1 + bench_returns).cumprod() - 1) * 100

        performance_data = []
        for dt in pf_cum_ret.index:
            dt_str = dt.strftime('%Y-%m-%d')
            try:
                pf_val = _safe_float((1 + pf_returns.loc[:dt]).prod() * 100, 100.0)
                bench_val = _safe_float((1 + bench_returns.loc[:dt]).prod() * 100, 100.0)
                pf_ret = _safe_float(pf_cum_ret.loc[dt])
                bench_ret = _safe_float(bench_cum_ret.loc[dt])
            except Exception:
                pf_val, bench_val, pf_ret, bench_ret = 100.0, 100.0, 0.0, 0.0

            performance_data.append(PerformancePoint(
                date=dt_str,
                portfolio=round(pf_val, 2),
                benchmark=round(bench_val, 2),
                portfolioReturn=round(pf_ret, 2),
                benchmarkReturn=round(bench_ret, 2),
            ))

        # ======= MONTHLY RETURNS =======
        monthly_data = self._compute_monthly_returns(pf_returns, bench_returns)

        # ======= RETURN DISTRIBUTION =======
        return_distribution = self._compute_return_distribution(pf_returns)

        # ======= ALLOCATIONS =======
        alloc_class = self._calculate_allocation(portfolio.positions, weights, 'asset_class')
        alloc_sector = self._calculate_allocation(portfolio.positions, weights, 'sector')
        alloc_country = self._calculate_allocation(portfolio.positions, weights, 'country')

        # ======= CORRELATION MATRIX =======
        component_rets = returns[valid_symbols]
        corr_matrix = component_rets.corr().fillna(0)
        correlation_data = CorrelationMatrix(
            labels=list(corr_matrix.columns),
            data=[[round(v, 2) for v in row] for row in corr_matrix.values.tolist()]
        )

        # ======= DRAWDOWN DATA =======
        drawdown_data = self._compute_drawdown_data(pf_returns)

        # ======= ROLLING VOLATILITY =======
        rolling_vol = self._compute_rolling_volatility(pf_returns, bench_returns, window=60)

        # ======= ROLLING CORRELATION =======
        rolling_corr = self._compute_rolling_correlation(pf_returns, bench_returns, window=60)

        return PortfolioAnalytics(
            riskMetrics=metrics,
            performanceData=performance_data,
            monthlyReturns=monthly_data,
            returnDistribution=return_distribution,
            allocationByClass=alloc_class,
            allocationBySector=alloc_sector,
            allocationByCountry=alloc_country,
            correlationMatrix=correlation_data,
            drawdownData=drawdown_data,
            rollingVolatility=rolling_vol,
            rollingCorrelation=rolling_corr,
        )

    def _compute_risk_metrics(self, pf_returns: pd.Series, bench_returns: pd.Series) -> RiskMetrics:
        """Compute all risk metrics without relying on QuantStats."""
        try:
            return self._compute_risk_metrics_inner(pf_returns, bench_returns)
        except Exception as e:
            logger.error(f"Error computing risk metrics: {e}")
            return RiskMetrics(
                annualizedReturn=0, annualizedVolatility=0, sharpeRatio=0, sortinoRatio=0,
                calmarRatio=0, informationRatio=0, maxDrawdown=0, maxDrawdownDuration=0,
                beta=0, alpha=0, trackingError=0, rSquared=0, var95=0, var99=0, cvar95=0, cvar99=0,
                downsideDeviation=0, skewness=0, kurtosis=0, bestDay=0, worstDay=0,
                bestMonth=0, worstMonth=0, positiveMonths=0, winRate=0
            )

    def _compute_risk_metrics_inner(self, pf_returns: pd.Series, bench_returns: pd.Series) -> RiskMetrics:
        """Compute all risk metrics without relying on QuantStats."""
        n = len(pf_returns)
        ann_factor = 252

        # Basic stats
        mean_daily = pf_returns.mean()
        std_daily = pf_returns.std()
        ann_return = float(mean_daily * ann_factor)
        ann_vol = float(std_daily * np.sqrt(ann_factor))

        # Compound return (CAGR approximation)
        total_ret = float((1 + pf_returns).prod() - 1)
        years = n / ann_factor
        cagr = float((1 + total_ret) ** (1 / max(years, 0.01)) - 1) if total_ret > -1 else 0.0

        # Sharpe
        sharpe = float(ann_return / ann_vol) if ann_vol > 0 else 0.0

        # Sortino
        downside = pf_returns[pf_returns < 0]
        downside_std = float(downside.std() * np.sqrt(ann_factor)) if len(downside) > 0 else ann_vol
        sortino = float(ann_return / downside_std) if downside_std > 0 else 0.0

        # Max drawdown
        cum = (1 + pf_returns).cumprod()
        rolling_max = cum.cummax()
        drawdown = (cum - rolling_max) / rolling_max
        max_dd = float(drawdown.min()) * 100  # in percent

        # Max drawdown duration
        is_dd = drawdown < 0
        dd_groups = (~is_dd).cumsum()
        dd_lengths = is_dd.groupby(dd_groups).sum()
        max_dd_duration = int(dd_lengths.max()) if len(dd_lengths) > 0 else 0

        # Calmar
        calmar = float(cagr * 100 / abs(max_dd)) if max_dd != 0 else 0.0

        # Beta, Alpha
        bench_var = bench_returns.var()
        cov = pf_returns.cov(bench_returns)
        beta = float(cov / bench_var) if bench_var > 0 else 1.0
        alpha = float((ann_return - beta * bench_returns.mean() * ann_factor) * 100)

        # Information Ratio
        tracking = pf_returns - bench_returns
        te = float(tracking.std() * np.sqrt(ann_factor)) if len(tracking) > 0 else 1.0
        ir = float(tracking.mean() * ann_factor / te) if te > 0 else 0.0

        # R-squared
        if bench_var > 0:
            correlation = pf_returns.corr(bench_returns)
            r_squared = float(correlation ** 2) if not np.isnan(correlation) else 0.0
        else:
            r_squared = 0.0

        # VaR & CVaR
        var95 = float(np.percentile(pf_returns, 5)) * 100
        var99 = float(np.percentile(pf_returns, 1)) * 100
        cvar95 = float(pf_returns[pf_returns <= np.percentile(pf_returns, 5)].mean()) * 100 if len(pf_returns[pf_returns <= np.percentile(pf_returns, 5)]) > 0 else var95
        cvar99 = float(pf_returns[pf_returns <= np.percentile(pf_returns, 1)].mean()) * 100 if len(pf_returns[pf_returns <= np.percentile(pf_returns, 1)]) > 0 else var99

        # Distribution stats
        skew = float(pf_returns.skew())
        kurt = float(pf_returns.kurtosis())

        # Best/worst
        best_day = float(pf_returns.max()) * 100
        worst_day = float(pf_returns.min()) * 100

        # Monthly aggregation
        monthly_rets = pf_returns.resample('ME').apply(lambda x: (1 + x).prod() - 1)
        best_month = float(monthly_rets.max()) * 100 if len(monthly_rets) > 0 else 0.0
        worst_month = float(monthly_rets.min()) * 100 if len(monthly_rets) > 0 else 0.0
        positive_months = int((monthly_rets > 0).sum() / max(len(monthly_rets), 1) * 100) if len(monthly_rets) > 0 else 0

        # Win rate
        win_rate = float((pf_returns > 0).sum() / max(len(pf_returns), 1)) * 100

        return RiskMetrics(
            annualizedReturn=round(_safe_float(cagr * 100), 2),
            annualizedVolatility=round(_safe_float(ann_vol * 100), 2),
            sharpeRatio=round(_safe_float(sharpe), 2),
            sortinoRatio=round(_safe_float(sortino), 2),
            calmarRatio=round(_safe_float(calmar), 2),
            informationRatio=round(_safe_float(ir), 2),
            maxDrawdown=round(_safe_float(max_dd), 2),
            maxDrawdownDuration=_safe_float(max_dd_duration),
            beta=round(_safe_float(beta), 2),
            alpha=round(_safe_float(alpha), 2),
            trackingError=round(_safe_float(te * 100), 2),
            rSquared=round(_safe_float(r_squared), 2),
            var95=round(_safe_float(var95), 2),
            var99=round(_safe_float(var99), 2),
            cvar95=round(_safe_float(cvar95), 2),
            cvar99=round(_safe_float(cvar99), 2),
            downsideDeviation=round(_safe_float(downside_std * 100), 2),
            skewness=round(_safe_float(skew), 2),
            kurtosis=round(_safe_float(kurt), 2),
            bestDay=round(_safe_float(best_day), 2),
            worstDay=round(_safe_float(worst_day), 2),
            bestMonth=round(_safe_float(best_month), 2),
            worstMonth=round(_safe_float(worst_month), 2),
            positiveMonths=int(_safe_float(positive_months)),
            winRate=round(_safe_float(win_rate), 1),
        )

    def _compute_monthly_returns(self, pf_returns: pd.Series, bench_returns: pd.Series) -> List[MonthlyReturn]:
        try:
            pf_monthly = pf_returns.resample('ME').apply(lambda x: (1 + x).prod() - 1).fillna(0)
            bench_monthly = bench_returns.resample('ME').apply(lambda x: (1 + x).prod() - 1).fillna(0)
            data = []
            for dt in pf_monthly.index:
                data.append(MonthlyReturn(
                    month=dt.strftime('%b %y'),
                    portfolio=round(_safe_float(pf_monthly.loc[dt]) * 100, 2),
                    benchmark=round(_safe_float(bench_monthly.get(dt, 0)) * 100, 2),
                ))
            return data
        except Exception as e:
            logger.error(f"Error computing monthly returns: {e}")
            return []

    def _compute_return_distribution(self, pf_returns: pd.Series) -> List[DistributionBin]:
        daily_pct = pf_returns * 100
        bins = np.arange(-4, 4.2, 0.2)
        hist, bin_edges = np.histogram(daily_pct, bins=bins)
        result = []
        for i, freq in enumerate(hist):
            center = (bin_edges[i] + bin_edges[i + 1]) / 2
            result.append(DistributionBin(bin=f"{center:.1f}%", frequency=int(freq)))
        return result

    def _compute_drawdown_data(self, pf_returns: pd.Series) -> List[Dict[str, float]]:
        try:
            cum = (1 + pf_returns).cumprod()
            rolling_max = cum.cummax()
            drawdown = ((cum - rolling_max) / rolling_max) * 100
            cum_ret = (cum / cum.iloc[0] - 1) * 100
            data = []
            for dt in pf_returns.index:
                data.append({
                    "date": dt.strftime('%Y-%m-%d'),
                    "drawdown": round(_safe_float(drawdown.loc[dt]), 2),
                    "cumReturn": round(_safe_float(cum_ret.loc[dt]), 2),
                })
            return data
        except Exception as e:
            logger.error(f"Error computing drawdown: {e}")
            return []

    def _compute_rolling_volatility(self, pf_returns: pd.Series, bench_returns: pd.Series, window: int = 60) -> List[Dict[str, float]]:
        try:
            pf_vol = pf_returns.rolling(window).std() * np.sqrt(252) * 100
            bench_vol = bench_returns.rolling(window).std() * np.sqrt(252) * 100
            data = []
            # Sample every 5 days
            sampled = pf_vol.dropna().iloc[::5]
            for dt in sampled.index:
                data.append({
                    "date": dt.strftime('%Y-%m-%d'),
                    "portfolio": round(_safe_float(pf_vol.loc[dt]), 2),
                    "benchmark": round(_safe_float(bench_vol.get(dt, 0)), 2),
                })
            return data
        except Exception as e:
            logger.error(f"Error computing rolling volatility: {e}")
            return []

    def _compute_rolling_correlation(self, pf_returns: pd.Series, bench_returns: pd.Series, window: int = 60) -> List[Dict[str, float]]:
        try:
            rolling_corr = pf_returns.rolling(window).corr(bench_returns)
            data = []
            sampled = rolling_corr.dropna().iloc[::5]
            for dt in sampled.index:
                data.append({
                    "date": dt.strftime('%Y-%m-%d'),
                    "correlation": round(_safe_float(rolling_corr.loc[dt]), 3),
                })
            return data
        except Exception as e:
            logger.error(f"Error computing rolling correlation: {e}")
            return []

    @staticmethod
    def _normalize_alloc_key(attr: str, raw_key: str) -> str:
        """Normalize allocation category keys to prevent duplicates."""
        if not raw_key:
            return 'Unknown'
        normalized = raw_key.strip().upper()
        if attr == 'asset_class':
            _ALLOC_CLASS_MAP = {
                'EQUITY': 'Equity', 'EQUITIES': 'Equity', 'STOCK': 'Equity', 'STOCKS': 'Equity',
                'ETF': 'ETF', 'ETFS': 'ETF', 'MUTUAL FUND': 'ETF',
                'BOND': 'Bond', 'BONDS': 'Bond', 'FIXED INCOME': 'Bond',
                'FUTURES': 'Futures', 'FUTURE': 'Futures',
                'OPTION': 'Option', 'OPTIONS': 'Option',
                'INDEX': 'Index',
                'CRYPTO': 'Crypto', 'CRYPTOCURRENCY': 'Crypto',
                'CURRENCY': 'Currency',
            }
            return _ALLOC_CLASS_MAP.get(normalized, raw_key.strip().title())
        if attr == 'country':
            _ALLOC_COUNTRY_MAP = {
                'US': 'United States', 'USA': 'United States', 'UNITED STATES': 'United States',
                'UNITED STATES OF AMERICA': 'United States', 'U.S.': 'United States',
                'U.S.A.': 'United States', 'AMERICA': 'United States',
                'UK': 'United Kingdom', 'UNITED KINGDOM': 'United Kingdom',
                'GB': 'United Kingdom', 'GREAT BRITAIN': 'United Kingdom',
                'ENGLAND': 'United Kingdom',
                'CN': 'China', 'CHINA': 'China', 'PRC': 'China',
                'JP': 'Japan', 'JAPAN': 'Japan',
                'DE': 'Germany', 'GERMANY': 'Germany',
                'FR': 'France', 'FRANCE': 'France',
                'CA': 'Canada', 'CANADA': 'Canada',
                'AU': 'Australia', 'AUSTRALIA': 'Australia',
                'KR': 'South Korea', 'SOUTH KOREA': 'South Korea', 'KOREA': 'South Korea',
                'IN': 'India', 'INDIA': 'India',
                'BR': 'Brazil', 'BRAZIL': 'Brazil',
                'CH': 'Switzerland', 'SWITZERLAND': 'Switzerland',
                'TW': 'Taiwan', 'TAIWAN': 'Taiwan',
                'NL': 'Netherlands', 'NETHERLANDS': 'Netherlands', 'HOLLAND': 'Netherlands',
                'HK': 'Hong Kong', 'HONG KONG': 'Hong Kong',
                'ES': 'Spain', 'SPAIN': 'Spain',
                'IT': 'Italy', 'ITALY': 'Italy',
                'SE': 'Sweden', 'SWEDEN': 'Sweden',
                'SG': 'Singapore', 'SINGAPORE': 'Singapore',
                'IE': 'Ireland', 'IRELAND': 'Ireland',
                'IL': 'Israel', 'ISRAEL': 'Israel',
                'DK': 'Denmark', 'DENMARK': 'Denmark',
                'NO': 'Norway', 'NORWAY': 'Norway',
                'FI': 'Finland', 'FINLAND': 'Finland',
                'BE': 'Belgium', 'BELGIUM': 'Belgium',
                'MX': 'Mexico', 'MEXICO': 'Mexico',
                'ZA': 'South Africa', 'SOUTH AFRICA': 'South Africa',
                'RU': 'Russia', 'RUSSIA': 'Russia',
                'AT': 'Austria', 'AUSTRIA': 'Austria',
                'NZ': 'New Zealand', 'NEW ZEALAND': 'New Zealand',
                'PT': 'Portugal', 'PORTUGAL': 'Portugal',
            }
            return _ALLOC_COUNTRY_MAP.get(normalized, raw_key.strip().title())
        return raw_key.strip().title() if raw_key else 'Unknown'

    def _calculate_allocation(self, positions: List[Position], weights: Dict[str, float], attr: str) -> List[AllocationItem]:
        allocs: Dict[str, float] = {}
        seen_symbols: set = set()
        for p in positions:
            sym = p.instrument_symbol
            if sym in seen_symbols:
                continue  # Only count each symbol once (weights are already aggregated)
            seen_symbols.add(sym)
            if p.instrument and sym in weights:
                raw_key = getattr(p.instrument, attr, None) or 'Unknown'
                key = self._normalize_alloc_key(attr, raw_key)
                allocs[key] = allocs.get(key, 0) + weights[sym]
            elif sym in weights:
                allocs['Unknown'] = allocs.get('Unknown', 0) + weights[sym]

        items = sorted(allocs.items(), key=lambda x: -x[1])
        return [AllocationItem(name=k, value=round(v * 100, 1), color=ALLOC_COLORS[i % len(ALLOC_COLORS)]) for i, (k, v) in enumerate(items)]

    def _get_empty_analytics(self) -> PortfolioAnalytics:
        empty_metrics = RiskMetrics(
            annualizedReturn=0, annualizedVolatility=0, sharpeRatio=0, sortinoRatio=0,
            calmarRatio=0, informationRatio=0, maxDrawdown=0, maxDrawdownDuration=0,
            beta=0, alpha=0, trackingError=0, rSquared=0, var95=0, var99=0, cvar95=0, cvar99=0,
            downsideDeviation=0, skewness=0, kurtosis=0, bestDay=0, worstDay=0,
            bestMonth=0, worstMonth=0, positiveMonths=0, winRate=0
        )
        return PortfolioAnalytics(
            riskMetrics=empty_metrics,
            performanceData=[], monthlyReturns=[], returnDistribution=[],
            allocationByClass=[], allocationBySector=[], allocationByCountry=[],
            correlationMatrix=CorrelationMatrix(labels=[], data=[]),
            drawdownData=[], rollingVolatility=[], rollingCorrelation=[]
        )

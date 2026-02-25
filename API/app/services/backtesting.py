"""
Backtesting engine.
Applies a set of portfolio weights to historical price data over a
user-chosen date window, optionally rebalancing at a given frequency.
Returns a rich result set: equity curve, drawdown, risk metrics,
monthly returns heatmap, yearly returns, per-position attribution, and
trade log (rebalance events).
"""

import pandas as pd
import numpy as np
import logging
from datetime import date, timedelta
from typing import Dict, List, Any, Optional

from sqlalchemy.orm import Session

from app.models.portfolio import Portfolio, Position
from app.services.market_data import MarketDataService
from app.services.analytics import AnalyticsService, _safe_float

logger = logging.getLogger(__name__)

REBALANCE_MAP = {
    "none": None,
    "monthly": "ME",
    "quarterly": "QE",
    "semi-annual": "2QE",
    "annual": "YE",
}


class BacktestingService:
    def __init__(self, db: Session):
        self.db = db
        self.md = MarketDataService(db)
        self.analytics = AnalyticsService(db)

    # ------------------------------------------------------------------ #
    #  PUBLIC
    # ------------------------------------------------------------------ #
    def run_backtest(
        self,
        portfolio: Portfolio,
        start_date: date,
        end_date: date,
        initial_capital: float = 10_000.0,
        benchmark_symbol: str = "SPY",
        rebalance_freq: str = "none",
        custom_weights: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """Run a full historical back-test and return all result data."""

        # 1) Derive target weights -------------------------------------
        if custom_weights:
            weights = custom_weights
        else:
            weights = self._derive_weights(portfolio)

        if not weights:
            return self._empty_result()

        symbols = list(weights.keys())
        all_symbols = list(set(symbols + [benchmark_symbol]))

        # 2) Fetch price data ------------------------------------------
        price_data: Dict[str, pd.Series] = {}
        for sym in all_symbols:
            try:
                self.md.sync_instrument(sym)
                history = self.md.get_price_history(sym, start_date, end_date)
                if history:
                    dates = [h.date for h in history]
                    prices = [h.adjusted_close or h.close for h in history]
                    s = pd.Series(data=prices, index=pd.to_datetime(dates))
                    # Remove duplicate dates if any
                    s = s[~s.index.duplicated(keep='first')]
                    price_data[sym] = s
            except Exception as e:
                logger.warning(f"Backtest: could not fetch {sym}: {e}")

        df = pd.DataFrame(price_data).ffill().dropna()
        if df.empty or len(df) < 5:
            return self._empty_result()

        valid = [s for s in symbols if s in df.columns]
        if not valid:
            return self._empty_result()

        # re-normalise weights to valid symbols
        total_w = sum(weights[s] for s in valid)
        if total_w <= 0:
            return self._empty_result()
        w = {s: weights[s] / total_w for s in valid}

        returns = df.pct_change().dropna()
        bench_in = benchmark_symbol in returns.columns

        # 3) Simulate --------------------------------------------------
        rebal_rule = REBALANCE_MAP.get(rebalance_freq)
        sim = self._simulate(returns, w, initial_capital, rebal_rule)

        pf_values = sim["portfolio_values"]         # pd.Series
        pf_returns = sim["portfolio_returns"]        # pd.Series
        trade_log = sim["trade_log"]                 # list[dict]
        weight_history = sim["weight_history"]       # list[dict]

        bench_returns = returns[benchmark_symbol] if bench_in else pd.Series(0.0, index=returns.index)
        common = pf_returns.index.intersection(bench_returns.index)
        pf_returns = pf_returns.loc[common]
        bench_returns = bench_returns.loc[common]

        bench_values = initial_capital * (1 + bench_returns).cumprod()

        # 4) Build result payload --------------------------------------
        result: Dict[str, Any] = {}

        # -- equity curve
        eq_curve = []
        for dt in pf_values.index:
            eq_curve.append({
                "date": dt.strftime("%Y-%m-%d"),
                "portfolio": round(float(pf_values.loc[dt]), 2),
                "benchmark": round(float(bench_values.get(dt, initial_capital)), 2),
            })
        result["equityCurve"] = eq_curve

        # -- cumulative return curve (%)
        pf_cum = ((1 + pf_returns).cumprod() - 1) * 100
        bench_cum = ((1 + bench_returns).cumprod() - 1) * 100
        cum_ret = []
        for dt in pf_cum.index:
            cum_ret.append({
                "date": dt.strftime("%Y-%m-%d"),
                "portfolio": round(_safe_float(pf_cum.loc[dt]), 2),
                "benchmark": round(_safe_float(bench_cum.get(dt, 0)), 2),
            })
        result["cumulativeReturn"] = cum_ret

        # -- drawdown
        cum_prod = (1 + pf_returns).cumprod()
        rolling_max = cum_prod.cummax()
        dd = ((cum_prod - rolling_max) / rolling_max) * 100
        dd_list = []
        for dt in dd.index:
            dd_list.append({
                "date": dt.strftime("%Y-%m-%d"),
                "drawdown": round(_safe_float(dd.loc[dt]), 2),
            })
        result["drawdownData"] = dd_list

        # -- monthly returns heatmap (year x month)
        monthly = pf_returns.resample("ME").apply(lambda x: (1 + x).prod() - 1)
        heatmap_rows = []
        for dt, val in monthly.items():
            heatmap_rows.append({
                "year": dt.year,
                "month": dt.month,
                "value": round(_safe_float(val) * 100, 2),
            })
        result["monthlyHeatmap"] = heatmap_rows

        # -- yearly returns
        yearly = pf_returns.resample("YE").apply(lambda x: (1 + x).prod() - 1)
        bench_yearly = bench_returns.resample("YE").apply(lambda x: (1 + x).prod() - 1)
        yearly_list = []
        for dt in yearly.index:
            yearly_list.append({
                "year": dt.year,
                "portfolio": round(_safe_float(yearly.loc[dt]) * 100, 2),
                "benchmark": round(_safe_float(bench_yearly.get(dt, 0)) * 100, 2),
            })
        result["yearlyReturns"] = yearly_list

        # -- risk metrics (re-use existing analytics engine)
        risk = self.analytics._compute_risk_metrics(pf_returns, bench_returns)
        result["riskMetrics"] = risk.dict() if hasattr(risk, "dict") else risk.model_dump()

        # -- summary KPIs
        total_ret = float((1 + pf_returns).prod() - 1) * 100
        bench_total_ret = float((1 + bench_returns).prod() - 1) * 100
        n_days = len(pf_returns)
        years = n_days / 252 if n_days > 0 else 1
        cagr = float(((1 + total_ret / 100) ** (1 / max(years, 0.01)) - 1) * 100) if total_ret > -100 else -100.0
        final_value = float(pf_values.iloc[-1]) if len(pf_values) else initial_capital
        result["summary"] = {
            "initialCapital": initial_capital,
            "finalValue": round(final_value, 2),
            "totalReturn": round(total_ret, 2),
            "cagr": round(cagr, 2),
            "benchmarkTotalReturn": round(bench_total_ret, 2),
            "maxDrawdown": round(_safe_float(dd.min()), 2),
            "sharpeRatio": result["riskMetrics"]["sharpeRatio"],
            "sortinoRatio": result["riskMetrics"]["sortinoRatio"],
            "volatility": result["riskMetrics"]["annualizedVolatility"],
            "calmarRatio": result["riskMetrics"]["calmarRatio"],
            "winRate": result["riskMetrics"]["winRate"],
            "bestDay": result["riskMetrics"]["bestDay"],
            "worstDay": result["riskMetrics"]["worstDay"],
            "tradingDays": n_days,
            "rebalanceEvents": len(trade_log),
        }

        # -- per-position attribution
        attribs = []
        for sym in valid:
            sym_ret = returns[sym].loc[common]
            contrib = float((sym_ret * w[sym]).sum()) * 100
            attribs.append({
                "symbol": sym,
                "weight": round(w[sym] * 100, 2),
                "contribution": round(_safe_float(contrib), 2),
                "totalReturn": round(float((1 + sym_ret).prod() - 1) * 100, 2),
            })
        attribs.sort(key=lambda x: x["contribution"], reverse=True)
        result["positionAttribution"] = attribs

        # -- trade log
        result["tradeLog"] = trade_log

        # -- weight history (for stacked area)
        result["weightHistory"] = weight_history

        # -- rolling volatility (60d)
        roll_vol = pf_returns.rolling(60).std() * np.sqrt(252) * 100
        bench_roll_vol = bench_returns.rolling(60).std() * np.sqrt(252) * 100
        rv = []
        sampled = roll_vol.dropna().iloc[::5]
        for dt in sampled.index:
            rv.append({
                "date": dt.strftime("%Y-%m-%d"),
                "portfolio": round(_safe_float(roll_vol.loc[dt]), 2),
                "benchmark": round(_safe_float(bench_roll_vol.get(dt, 0)), 2),
            })
        result["rollingVolatility"] = rv

        # -- rolling correlation with benchmark (60d)
        roll_corr = pf_returns.rolling(60).corr(bench_returns)
        rc = []
        rc_sampled = roll_corr.dropna().iloc[::5]
        for dt in rc_sampled.index:
            rc.append({
                "date": dt.strftime("%Y-%m-%d"),
                "correlation": round(_safe_float(roll_corr.loc[dt]), 3),
            })
        result["rollingCorrelation"] = rc

        # -- underwater chart (same as drawdown, but with recovery markers)
        result["underwaterData"] = dd_list  # reuse

        return result

    # ------------------------------------------------------------------ #
    #  SIMULATION ENGINE
    # ------------------------------------------------------------------ #
    def _simulate(
        self,
        returns: pd.DataFrame,
        target_weights: Dict[str, float],
        initial_capital: float,
        rebal_rule: Optional[str],
    ) -> Dict[str, Any]:
        """Walk-forward simulation with optional rebalance."""
        symbols = list(target_weights.keys())
        dates = returns.index

        # Position sizes in dollar terms
        positions = {s: initial_capital * target_weights[s] for s in symbols}
        portfolio_values = []
        portfolio_returns_list = []
        trade_log: List[Dict[str, Any]] = []
        weight_history: List[Dict[str, Any]] = []

        if rebal_rule:
            rebal_dates = set(returns.resample(rebal_rule).last().index)
        else:
            rebal_dates = set()

        prev_total = initial_capital

        for i, dt in enumerate(dates):
            # apply daily returns
            for s in symbols:
                r = float(returns.loc[dt, s]) if s in returns.columns else 0.0
                positions[s] *= (1 + r)

            total = sum(positions.values())
            daily_ret = (total / prev_total - 1) if prev_total != 0 else 0.0
            portfolio_values.append(total)
            portfolio_returns_list.append(daily_ret)

            # record weights
            if i % 20 == 0 or dt in rebal_dates:
                wh: Dict[str, Any] = {"date": dt.strftime("%Y-%m-%d")}
                for s in symbols:
                    wh[s] = round(positions[s] / total * 100, 2) if total > 0 else 0
                weight_history.append(wh)

            # rebalance?
            if dt in rebal_dates and total > 0:
                old_w = {s: positions[s] / total for s in symbols}
                for s in symbols:
                    positions[s] = total * target_weights[s]
                trades = []
                for s in symbols:
                    delta_w = target_weights[s] - old_w.get(s, 0)
                    if abs(delta_w) > 0.001:
                        trades.append({"symbol": s, "delta": round(delta_w * 100, 2)})
                trade_log.append({
                    "date": dt.strftime("%Y-%m-%d"),
                    "totalValue": round(total, 2),
                    "trades": trades,
                })

            prev_total = total

        pf_values = pd.Series(portfolio_values, index=dates)
        pf_returns = pd.Series(portfolio_returns_list, index=dates)
        return {
            "portfolio_values": pf_values,
            "portfolio_returns": pf_returns,
            "trade_log": trade_log,
            "weight_history": weight_history,
        }

    # ------------------------------------------------------------------ #
    #  HELPERS
    # ------------------------------------------------------------------ #
    def _derive_weights(self, portfolio: Portfolio) -> Dict[str, float]:
        """Compute current dollar-weighted allocation from positions."""
        vals: Dict[str, float] = {}
        total = 0.0
        for p in portfolio.positions:
            price = p.current_price or p.entry_price
            val = p.quantity * price
            sym = p.instrument_symbol
            vals[sym] = vals.get(sym, 0) + val
            total += val
        if total <= 0:
            return {}
        return {s: v / total for s, v in vals.items()}

    @staticmethod
    def _empty_result() -> Dict[str, Any]:
        return {
            "equityCurve": [],
            "cumulativeReturn": [],
            "drawdownData": [],
            "monthlyHeatmap": [],
            "yearlyReturns": [],
            "riskMetrics": {},
            "summary": {
                "initialCapital": 0, "finalValue": 0, "totalReturn": 0,
                "cagr": 0, "benchmarkTotalReturn": 0, "maxDrawdown": 0,
                "sharpeRatio": 0, "sortinoRatio": 0, "volatility": 0,
                "calmarRatio": 0, "winRate": 0, "bestDay": 0, "worstDay": 0,
                "tradingDays": 0, "rebalanceEvents": 0,
            },
            "positionAttribution": [],
            "tradeLog": [],
            "weightHistory": [],
            "rollingVolatility": [],
            "rollingCorrelation": [],
            "underwaterData": [],
        }

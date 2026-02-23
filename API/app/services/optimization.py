import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

try:
    from pypfopt import EfficientFrontier, risk_models, expected_returns
    _PYPFOPT_AVAILABLE = True
except ImportError as e:
    logger.error(f"PyPortfolioOpt or scikit-learn not available: {e}. "
                 "Install with: pip install pyportfolioopt scikit-learn")
    _PYPFOPT_AVAILABLE = False

from sqlalchemy.orm import Session
from datetime import date, timedelta
from typing import List, Dict, Any, Optional

from app.models.portfolio import Portfolio
from app.services.market_data import MarketDataService


class OptimizationService:
    def __init__(self, db: Session):
        self.db = db
        self.md_service = MarketDataService(db)

    # ------------------------------------------------------------------ helpers
    def _fetch_prices(self, symbols: List[str]) -> pd.DataFrame:
        end_date = date.today()
        start_date = end_date - timedelta(days=365 * 2)

        # Batch update/fetch
        try:
            self.md_service.batch_sync_instruments(symbols)
            self.md_service.batch_download_history(symbols, start_date, end_date)
        except Exception as e:
            logger.error(f"Batch fetch failed: {e}")

        price_data: Dict[str, pd.Series] = {}
        for sym in symbols:
            try:
                # Still use get_price_history in case batch missed something or for DB retrieval
                history = self.md_service.get_price_history(sym, start_date, end_date)
                if history:
                    dates = [h.date for h in history]
                    prices = [h.adjusted_close or h.close for h in history]
                    price_data[sym] = pd.Series(data=prices, index=pd.to_datetime(dates))
            except Exception:
                pass
        df = pd.DataFrame(price_data).ffill().dropna()
        return df

    def _current_weights(self, portfolio: Portfolio, df: pd.DataFrame) -> Dict[str, float]:
        values: Dict[str, float] = {}
        total = 0.0
        for p in portfolio.positions:
            sym = p.instrument_symbol
            if sym in df.columns:
                val = p.quantity * float(df[sym].iloc[-1])
                values[sym] = values.get(sym, 0) + val
                total += val
        if total == 0:
            return {}
        return {s: v / total for s, v in values.items()}

    # ------------------------------------------------------------------ optimise
    def optimize_portfolio(
        self,
        portfolio: Portfolio,
        target: str = "max_sharpe",
        constraints: Optional[Dict] = None,
        risk_aversion: float = 1.0,
    ) -> Dict[str, Any]:
        if not _PYPFOPT_AVAILABLE:
            return {"error": "Optimization unavailable: scikit-learn is not installed. Run: pip install scikit-learn"}

        if not portfolio.positions:
            return {"error": "No positions to optimize"}

        symbols = list({p.instrument_symbol for p in portfolio.positions})
        df = self._fetch_prices(symbols)
        if df.empty or len(df.columns) < 2:
            return {"error": "Insufficient data for optimization"}

        mu = expected_returns.mean_historical_return(df)
        S = risk_models.CovarianceShrinkage(df).ledoit_wolf()

        try:
            # Apply weight constraints if provided
            weight_bounds = (0, 1)  # default
            if constraints:
                lo = constraints.get("min_weight", 0)
                hi = constraints.get("max_weight", 1)
                weight_bounds = (max(lo, 0), min(hi, 1))

            ef = EfficientFrontier(mu, S, weight_bounds=weight_bounds)
            if target == "min_volatility":
                ef.min_volatility()
            elif target == "mean_variance":
                # Quadratic utility: max  mu^T w - (risk_aversion/2) * w^T S w
                ef.max_quadratic_utility(risk_aversion=risk_aversion)
            else:
                ef.max_sharpe()

            cleaned = ef.clean_weights()
            perf = ef.portfolio_performance(verbose=False)

            cur_w = self._current_weights(portfolio, df)

            weights_table = []
            for sym in symbols:
                weights_table.append({
                    "symbol": sym,
                    "current": round(cur_w.get(sym, 0) * 100, 2),
                    "optimized": round(cleaned.get(sym, 0) * 100, 2),
                    "diff": round((cleaned.get(sym, 0) - cur_w.get(sym, 0)) * 100, 2),
                })

            return {
                "optimized_weights": {k: round(v, 4) for k, v in cleaned.items()},
                "expected_annual_return": round(float(perf[0]) * 100, 2),
                "annual_volatility": round(float(perf[1]) * 100, 2),
                "sharpe_ratio": round(float(perf[2]), 2),
                "weights_table": weights_table,
            }
        except Exception as e:
            return {"error": str(e)}

    # -------------------------------------------------- efficient frontier
    def get_efficient_frontier(
        self, portfolio: Portfolio, points: int = 25
    ) -> List[Dict[str, float]]:
        if not _PYPFOPT_AVAILABLE:
            return []
        symbols = list({p.instrument_symbol for p in portfolio.positions})
        df = self._fetch_prices(symbols)
        if df.empty or len(df.columns) < 2:
            return []

        mu = expected_returns.mean_historical_return(df)
        S = risk_models.CovarianceShrinkage(df).ledoit_wolf()

        try:
            # Get min-vol return and max-return anchors
            ef_min = EfficientFrontier(mu, S)
            ef_min.min_volatility()
            min_ret, min_vol, _ = ef_min.portfolio_performance(verbose=False)

            max_ret = float(mu.max())
            target_rets = np.linspace(float(min_ret), max_ret * 0.99, points)

            frontier: List[Dict[str, float]] = []
            for tr in target_rets:
                try:
                    ef_pt = EfficientFrontier(mu, S)
                    ef_pt.efficient_return(tr)
                    perf = ef_pt.portfolio_performance(verbose=False)
                    frontier.append({
                        "risk": round(float(perf[1]) * 100, 2),
                        "return": round(float(perf[0]) * 100, 2),
                    })
                except Exception:
                    continue
            return frontier
        except Exception:
            return []

    # --------------------------------- full data for the Optimization page
    def get_full_optimization_data(self, portfolio: Portfolio, constraints: Optional[Dict] = None, risk_aversion: float = 1.0) -> Dict[str, Any]:
        """Return efficient frontier, key portfolios and weight comparison."""
        if not _PYPFOPT_AVAILABLE:
            return {"error": "Optimization unavailable: scikit-learn is not installed. Run: pip install scikit-learn"}

        if not portfolio.positions:
            return {"error": "No positions to optimize"}

        symbols = list({p.instrument_symbol for p in portfolio.positions})
        df = self._fetch_prices(symbols)
        if df.empty or len(df.columns) < 2:
            return {"error": "Insufficient data for optimization"}

        mu = expected_returns.mean_historical_return(df)
        S = risk_models.CovarianceShrinkage(df).ledoit_wolf()
        cur_w = self._current_weights(portfolio, df)

        # Weight bounds from constraints
        weight_bounds = (0, 1)
        if constraints:
            lo = constraints.get("min_weight", 0)
            hi = constraints.get("max_weight", 1)
            weight_bounds = (max(lo, 0), min(hi, 1))

        # ---------- Current portfolio performance ----------
        w_arr = np.array([cur_w.get(s, 0) for s in mu.index])
        cur_ret = float(w_arr @ mu.values) * 100
        cur_vol = float(np.sqrt(w_arr @ S.values @ w_arr)) * 100
        current_point = {"risk": round(cur_vol, 2), "return": round(cur_ret, 2)}

        # ---------- Min-Vol portfolio ----------
        try:
            ef_mv = EfficientFrontier(mu, S, weight_bounds=weight_bounds)
            ef_mv.min_volatility()
            mv_weights = ef_mv.clean_weights()
            mv_perf = ef_mv.portfolio_performance(verbose=False)
            min_vol_point = {
                "risk": round(float(mv_perf[1]) * 100, 2),
                "return": round(float(mv_perf[0]) * 100, 2),
            }
        except Exception:
            mv_weights = {}
            min_vol_point = current_point

        # ---------- Max-Sharpe portfolio ----------
        try:
            ef_ms = EfficientFrontier(mu, S, weight_bounds=weight_bounds)
            ef_ms.max_sharpe()
            ms_weights = ef_ms.clean_weights()
            ms_perf = ef_ms.portfolio_performance(verbose=False)
            max_sharpe_point = {
                "risk": round(float(ms_perf[1]) * 100, 2),
                "return": round(float(ms_perf[0]) * 100, 2),
            }
        except Exception:
            ms_weights = {}
            max_sharpe_point = current_point

        # ---------- Mean-Variance (quadratic utility) portfolio ----------
        try:
            ef_qu = EfficientFrontier(mu, S, weight_bounds=weight_bounds)
            ef_qu.max_quadratic_utility(risk_aversion=risk_aversion)
            qu_weights = ef_qu.clean_weights()
            qu_perf = ef_qu.portfolio_performance(verbose=False)
            mean_var_point = {
                "risk": round(float(qu_perf[1]) * 100, 2),
                "return": round(float(qu_perf[0]) * 100, 2),
            }
        except Exception:
            qu_weights = {}
            mean_var_point = current_point

        # ---------- Efficient frontier ----------
        frontier = self.get_efficient_frontier(portfolio, points=25)

        # ---------- Weights comparison table ----------
        weights_table = []
        for sym in symbols:
            weights_table.append({
                "symbol": sym,
                "name": sym,
                "current": round(cur_w.get(sym, 0) * 100, 2),
                "minVol": round(mv_weights.get(sym, 0) * 100, 2),
                "maxSharpe": round(ms_weights.get(sym, 0) * 100, 2),
                "meanVar": round(qu_weights.get(sym, 0) * 100, 2),
                "diff": round((ms_weights.get(sym, 0) - cur_w.get(sym, 0)) * 100, 2),
            })

        return {
            "efficientFrontier": frontier,
            "currentPortfolio": current_point,
            "minVolPortfolio": min_vol_point,
            "maxSharpePortfolio": max_sharpe_point,
            "meanVarPortfolio": mean_var_point,
            "weightsTable": weights_table,
            "metrics": {
                "current": {
                    "return": current_point["return"],
                    "risk": current_point["risk"],
                    "sharpe": round(cur_ret / cur_vol, 2) if cur_vol > 0 else 0,
                },
                "minVol": {
                    "return": min_vol_point["return"],
                    "risk": min_vol_point["risk"],
                    "sharpe": round(float(mv_perf[2]), 2) if mv_weights else 0,
                },
                "maxSharpe": {
                    "return": max_sharpe_point["return"],
                    "risk": max_sharpe_point["risk"],
                    "sharpe": round(float(ms_perf[2]), 2) if ms_weights else 0,
                },
                "meanVar": {
                    "return": mean_var_point["return"],
                    "risk": mean_var_point["risk"],
                    "sharpe": round(float(qu_perf[2]), 2) if qu_weights else 0,
                },
            },
        }

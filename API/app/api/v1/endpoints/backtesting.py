from typing import Any, Dict, Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session

from app import models
from app.api import deps
from app.models.portfolio import Portfolio, Collaborator
from app.services.backtesting import BacktestingService

router = APIRouter()


def _check_portfolio_access(db: Session, id: int, current_user: models.User) -> Portfolio:
    portfolio = db.query(Portfolio).filter(Portfolio.id == id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if portfolio.owner_id != current_user.id:
        collab = db.query(Collaborator).filter(
            Collaborator.portfolio_id == id,
            Collaborator.user_id == current_user.id,
        ).first()
        if not collab:
            raise HTTPException(status_code=403, detail="Access denied")
    return portfolio


@router.post("/{id}/backtest")
def run_backtest(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    start_date: date = Body(..., description="Back-test start date"),
    end_date: date = Body(..., description="Back-test end date"),
    initial_capital: float = Body(10_000.0, description="Starting capital in portfolio currency"),
    benchmark: str = Body("SPY", description="Benchmark ticker"),
    rebalance_freq: str = Body("none", description="Rebalance frequency: none, monthly, quarterly, semi-annual, annual"),
    custom_weights: Optional[Dict[str, float]] = Body(None, description="Optional override weights {symbol: decimal_weight}"),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Run a historical back-test on a portfolio's current weights (or custom ones)
    over a specified date range and return comprehensive results.
    """
    portfolio = _check_portfolio_access(db, id, current_user)

    # Validate dates
    if start_date >= end_date:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")
    if (end_date - start_date).days < 30:
        raise HTTPException(status_code=400, detail="Back-test period must be at least 30 days")
    if (end_date - start_date).days > 365 * 20:
        raise HTTPException(status_code=400, detail="Back-test period cannot exceed 20 years")

    svc = BacktestingService(db)
    try:
        result = svc.run_backtest(
            portfolio=portfolio,
            start_date=start_date,
            end_date=end_date,
            initial_capital=initial_capital,
            benchmark_symbol=benchmark,
            rebalance_freq=rebalance_freq,
            custom_weights=custom_weights,
        )
        return result
    except Exception as e:
        print(f"Backtest error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

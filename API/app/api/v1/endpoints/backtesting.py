from typing import Any, Dict, Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.api import deps
from app.models.portfolio import Portfolio
from app.services.backtesting import BacktestingService

router = APIRouter()


class BacktestRequest(BaseModel):
    start_date: date
    end_date: date
    initial_capital: float = 10_000.0
    benchmark: str = "SPY"
    rebalance_freq: str = "none"
    custom_weights: Optional[Dict[str, float]] = None


def _check_portfolio_access(db: Session, id: int) -> Portfolio:
    portfolio = db.query(Portfolio).filter(Portfolio.id == id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


@router.post("/{id}/backtest")
def run_backtest(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    body: BacktestRequest,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """
    Run a historical back-test on a portfolio's current weights (or custom ones)
    over a specified date range and return comprehensive results.
    """
    portfolio = _check_portfolio_access(db, id)

    # Validate dates
    if body.start_date >= body.end_date:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")
    if (body.end_date - body.start_date).days < 30:
        raise HTTPException(status_code=400, detail="Back-test period must be at least 30 days")
    if (body.end_date - body.start_date).days > 365 * 20:
        raise HTTPException(status_code=400, detail="Back-test period cannot exceed 20 years")

    svc = BacktestingService(db)
    try:
        result = svc.run_backtest(
            portfolio=portfolio,
            start_date=body.start_date,
            end_date=body.end_date,
            initial_capital=body.initial_capital,
            benchmark_symbol=body.benchmark,
            rebalance_freq=body.rebalance_freq,
            custom_weights=body.custom_weights,
        )
        return result
    except Exception as e:
        print(f"Backtest error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

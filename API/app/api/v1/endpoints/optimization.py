from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from datetime import date

from app.api import deps
from app.api.deps import get_current_user_id
from app.models.portfolio import Portfolio, Position
from app.models.instrument import Instrument
from app.services.optimization import OptimizationService

router = APIRouter()


def _check_portfolio_access(db: Session, id: int) -> Portfolio:
    """Get portfolio by id."""
    portfolio = db.query(Portfolio).filter(Portfolio.id == id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


@router.post("/{id}/optimize")
def optimize_portfolio(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    target: str = Body(..., embed=False),
    min_weight: Optional[float] = Body(None),
    max_weight: Optional[float] = Body(None),
    risk_aversion: Optional[float] = Body(None),
    _: bool = Depends(deps.verify_session),
) -> Any:
    """Optimize portfolio weights with optional weight constraints."""
    portfolio = _check_portfolio_access(db, id)
    opt_service = OptimizationService(db)
    constraints = {}
    if min_weight is not None:
        constraints["min_weight"] = min_weight
    if max_weight is not None:
        constraints["max_weight"] = max_weight
    ra = risk_aversion if risk_aversion is not None else 1.0
    result = opt_service.optimize_portfolio(portfolio, target=target, constraints=constraints if constraints else None, risk_aversion=ra)
    return result

@router.get("/{id}/optimize/frontier")
def get_efficient_frontier(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    min_weight: Optional[float] = Query(None),
    max_weight: Optional[float] = Query(None),
    risk_aversion: Optional[float] = Query(None),
    _: bool = Depends(deps.verify_session),
) -> Any:
    """Get efficient frontier data and optimization results with optional weight constraints."""
    portfolio = _check_portfolio_access(db, id)
    opt_service = OptimizationService(db)
    constraints = {}
    if min_weight is not None:
        constraints["min_weight"] = min_weight
    if max_weight is not None:
        constraints["max_weight"] = max_weight
    ra = risk_aversion if risk_aversion is not None else 1.0
    result = opt_service.get_full_optimization_data(portfolio, constraints=constraints if constraints else None, risk_aversion=ra)
    return result


@router.post("/{id}/optimize/save")
def save_optimized_portfolio(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    name: str = Body(...),
    weights: Dict[str, float] = Body(...),
    user_id: Optional[int] = Depends(deps.get_current_user_id),
    _: bool = Depends(deps.verify_session),
) -> Any:
    """
    Save optimized weights as a new portfolio.
    `weights` is a dict of {symbol: weight_percent} e.g. {"AAPL": 35.0, "MSFT": 25.0, ...}
    The total portfolio value from the source portfolio is re-allocated according to the new weights.
    """
    source = _check_portfolio_access(db, id)

    # Calculate total portfolio value from source positions
    total_value = 0.0
    price_map: Dict[str, float] = {}
    for pos in source.positions:
        price = pos.current_price or pos.entry_price
        val = abs(pos.quantity * price)
        total_value += val
        price_map[pos.instrument_symbol] = price

    if total_value <= 0:
        raise HTTPException(status_code=400, detail="Source portfolio has no value")

    # Create new portfolio
    new_pf = Portfolio(
        name=name or f"Optimized - {source.name}",
        description=f"Optimized version of '{source.name}'",
        currency=source.currency,
        owner_id=user_id,
        benchmark_symbol=source.benchmark_symbol,
    )
    db.add(new_pf)
    db.flush()  # get new_pf.id

    # Create positions for each non-zero weight
    for symbol, weight_pct in weights.items():
        if weight_pct <= 0.01:  # skip essentially 0
            continue
        price = price_map.get(symbol)
        if not price:
            # Try to get price from instruments table
            inst = db.query(Instrument).filter(Instrument.symbol == symbol).first()
            if inst and inst.current_price:
                price = inst.current_price
            else:
                price = 1.0  # fallback
        allocated_value = total_value * (weight_pct / 100.0)
        quantity = round(allocated_value / price, 4) if price > 0 else 0

        pos = Position(
            portfolio_id=new_pf.id,
            instrument_symbol=symbol,
            quantity=quantity,
            entry_price=price,
            entry_date=date.today(),
        )
        db.add(pos)

    db.commit()
    db.refresh(new_pf)

    return {
        "id": new_pf.id,
        "name": new_pf.name,
        "description": new_pf.description,
        "positions": len([w for w in weights.values() if w > 0.01]),
    }

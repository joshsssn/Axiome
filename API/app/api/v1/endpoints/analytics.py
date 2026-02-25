from typing import Any, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.api import deps
from app.models.portfolio import Portfolio
from app.services.analytics import AnalyticsService

router = APIRouter()

@router.get("/{id}/analytics", response_model=schemas.analytics.PortfolioAnalytics)
def get_portfolio_analytics(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    benchmark: Optional[str] = Query(None, description="Override benchmark symbol"),
    start_date: Optional[date] = Query(None, description="Custom start date"),
    end_date: Optional[date] = Query(None, description="Custom end date"),
    _: bool = Depends(deps.verify_session),
) -> Any:
    """
    Get portfolio analytics (performance, risk metrics, allocation).
    Accepts optional benchmark, start_date, end_date overrides.
    """
    portfolio = db.query(Portfolio).filter(Portfolio.id == id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    analytics_service = AnalyticsService(db)
    try:
        data = analytics_service.get_portfolio_analytics(
            portfolio,
            benchmark_override=benchmark,
            start_date_override=start_date,
            end_date_override=end_date,
        )
        return data
    except Exception as e:
        print(f"Analytics Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

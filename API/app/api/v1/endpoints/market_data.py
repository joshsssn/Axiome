from typing import Any, Optional, List
from datetime import date, timedelta
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.api import deps
from app.services.market_data import MarketDataService, _KNOWN_META

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/price/{symbol}")
def get_price(
    symbol: str,
    date: date,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Get historical price for a symbol on a specific date.
    If the exact date has no data (weekend/holiday), look back up to 7 days for the nearest trading day.
    """
    md_service = MarketDataService(db)

    try:
        # Try a 7-day window backwards to find the nearest trading day
        start_window = date - timedelta(days=7)
        history = md_service.get_price_history(symbol, start_window, date)
    except Exception as e:
        logger.error(f"Error fetching price for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching market data for '{symbol}'")

    if not history:
        raise HTTPException(status_code=404, detail=f"No market data found for '{symbol}'. The symbol may be delisted or invalid.")

    # Return the most recent data point (closest to requested date)
    latest = history[-1]
    return {"symbol": symbol, "date": str(latest.date), "price": latest.close}


@router.get("/search/{query}")
def search_ticker(
    query: str,
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_active_user),
) -> Any:
    """
    Search for tickers matching the query string.
    First checks known metadata, then tries yfinance.
    Returns list of matching tickers with metadata.
    """
    query_upper = query.strip().upper()
    if not query_upper:
        return []

    results = []

    # Search in known metadata
    for sym, meta in _KNOWN_META.items():
        if query_upper in sym.upper() or query_upper in meta.get("name", "").upper():
            results.append({
                "symbol": sym,
                "name": meta.get("name", sym),
                "sector": meta.get("sector", ""),
                "country": meta.get("country", "US"),
                "asset_class": meta.get("asset_class", "Equity"),
                "currency": meta.get("currency", "USD"),
            })

    # If exact match not found in known, try yfinance lookup
    if len(results) == 0 or not any(r["symbol"] == query_upper for r in results):
        try:
            md_service = MarketDataService(db)
            info = md_service.get_instrument_info(query_upper)
            if info and info.get("name"):
                results.insert(0, {
                    "symbol": query_upper,
                    "name": info.get("name", query_upper),
                    "sector": info.get("sector", ""),
                    "country": info.get("country", "US"),
                    "asset_class": info.get("asset_class", "Equity"),
                    "currency": info.get("currency", "USD"),
                })
        except Exception as e:
            logger.warning(f"yfinance lookup failed for '{query_upper}': {e}")

    # Limit results
    return results[:15]

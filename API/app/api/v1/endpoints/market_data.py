from typing import Any, Optional, List
from datetime import date, timedelta
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api import deps
from app.services.market_data import MarketDataService, _KNOWN_META

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/price/{symbol}")
def get_price(
    symbol: str,
    date: date,
    db: Session = Depends(deps.get_db),
    _: bool = Depends(deps.verify_session),
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
    _: bool = Depends(deps.verify_session),
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


from pydantic import BaseModel

class ValidateTickersRequest(BaseModel):
    symbols: List[str]
    currency_hints: Optional[List[Optional[str]]] = None

@router.post("/validate-tickers")
def validate_tickers(
    body: ValidateTickersRequest,
    db: Session = Depends(deps.get_db),
    _: bool = Depends(deps.verify_session),
) -> Any:
    """
    Validate a list of tickers against yfinance.
    When currency_hints are provided (parallel array), the backend will
    resolve tickers to the exchange listing that trades in that currency
    (e.g. RACE + EUR -> RACE.MI on Milan exchange).
    Returns { valid: [{symbol, name, sector, country, currency, asset_class}], unresolved: [symbol ...] }
    """
    md_service = MarketDataService(db)
    valid = []
    unresolved = []

    hints = body.currency_hints or []

    for idx, sym in enumerate(body.symbols):
        sym = sym.strip().upper()
        if not sym:
            continue

        currency_hint = hints[idx].strip().upper() if idx < len(hints) and hints[idx] else None

        # If a currency hint is provided and it's not USD, try to resolve
        # the symbol to the correct exchange listing
        resolved_sym = sym
        if currency_hint and currency_hint != "USD":
            resolved_sym = md_service.resolve_symbol_for_currency(sym, currency_hint)
            logger.info(f"validate_tickers: {sym} + hint={currency_hint} -> {resolved_sym}")

        # Try known meta first (only for the original symbol)
        meta = _KNOWN_META.get(resolved_sym) or _KNOWN_META.get(sym)
        if meta and meta.get("name"):
            # If we resolved to a different symbol, still use the resolved one
            final_sym = resolved_sym if resolved_sym != sym else sym
            valid.append({
                "symbol": final_sym,
                "name": meta.get("name", final_sym),
                "sector": meta.get("sector", ""),
                "country": meta.get("country", ""),
                "asset_class": meta.get("asset_class", "Equity"),
                "currency": meta.get("currency", "USD"),
            })
            continue

        # Try yfinance with the resolved symbol
        try:
            info = md_service.get_instrument_info(resolved_sym)
            if info and info.get("name"):
                valid.append({
                    "symbol": resolved_sym,
                    "name": info.get("name", resolved_sym),
                    "sector": info.get("sector", ""),
                    "country": info.get("country", ""),
                    "asset_class": info.get("asset_class", "Equity"),
                    "currency": info.get("currency", "USD"),
                })
                continue
        except Exception as e:
            logger.warning(f"validate_tickers: yfinance lookup failed for '{resolved_sym}': {e}")
        unresolved.append(sym)

    return {"valid": valid, "unresolved": unresolved}


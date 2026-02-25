"""Portfolio CRUD endpoints - multi-user desktop app."""
from typing import List, Any, Optional
from pydantic import BaseModel as PydanticBaseModel
from datetime import date, timedelta
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session

from app import models, schemas
from app.api import deps
from app.models.portfolio import Portfolio, Position, Transaction
from app.services.market_data import MarketDataService

logger = logging.getLogger(__name__)


def _last_trading_day(d: date) -> date:
    """Return d if weekday, else roll back to Friday."""
    wd = d.weekday()
    if wd == 5:  # Saturday
        return d - timedelta(days=1)
    elif wd == 6:  # Sunday
        return d - timedelta(days=2)
    return d


def _prev_trading_day(d: date) -> date:
    """Return the trading day before d."""
    prev = d - timedelta(days=1)
    return _last_trading_day(prev)

router = APIRouter()

# ========== PORTFOLIO CRUD ==========

@router.get("/", response_model=List[schemas.portfolio.Portfolio])
def read_portfolios(
    db: Session = Depends(deps.get_db),
    user_id: Optional[int] = Depends(deps.get_current_user_id),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """Retrieve portfolios for the current user."""
    q = db.query(Portfolio)
    if user_id is not None:
        q = q.filter(Portfolio.owner_id == user_id)
    portfolios = q.offset(skip).limit(limit).all()
    return portfolios

@router.post("/", response_model=schemas.portfolio.Portfolio)
def create_portfolio(
    *,
    db: Session = Depends(deps.get_db),
    portfolio_in: schemas.portfolio.PortfolioCreate,
    user_id: Optional[int] = Depends(deps.get_current_user_id),
) -> Any:
    """Create new portfolio."""
    portfolio = Portfolio(**portfolio_in.model_dump(), owner_id=user_id)
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return portfolio

@router.get("/{id}", response_model=schemas.portfolio.PortfolioFull)
def read_portfolio(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """Get portfolio by ID with enriched positions and transactions."""
    portfolio = _get_portfolio(db, id)

    md_service = MarketDataService(db)

    # -- Batch: ensure instrument rows exist (DB only, no yfinance) --
    symbols = list({p.instrument_symbol for p in portfolio.positions})
    inst_map = md_service.ensure_instruments_exist(symbols)

    # -- Batch: get latest prices + previous day prices (2 DB queries, no yfinance) --
    latest_prices = md_service.get_latest_prices_bulk(symbols)

    today = date.today()
    td = _last_trading_day(today)
    prev_td = _prev_trading_day(td)
    prev_prices = md_service.get_prices_at_date_bulk(symbols, prev_td)

    # Enrich positions (native currency values first)
    enriched_positions = []
    for p in portfolio.positions:
        inst = inst_map.get(p.instrument_symbol) or p.instrument
        # Determine current price: market mode uses DB latest, otherwise use cached or entry
        if p.pricing_mode == 'market':
            cp = latest_prices.get(p.instrument_symbol) or (inst.current_price if inst else None) or p.entry_price
        elif p.current_price:
            cp = p.current_price
        else:
            cp = p.entry_price
        inst_ccy = (inst.currency if inst and inst.currency else "USD")
        enriched_positions.append({
            "id": p.id,
            "portfolio_id": p.portfolio_id,
            "instrument_symbol": p.instrument_symbol,
            "quantity": p.quantity,
            "entry_price": p.entry_price,
            "entry_date": p.entry_date,
            "pricing_mode": p.pricing_mode,
            "current_price": cp,
            "name": (inst.name if inst and inst.name else p.instrument_symbol),
            "asset_class": (inst.asset_class if inst and inst.asset_class else "Equity"),
            "sector": (inst.sector if inst and inst.sector else "Other"),
            "country": (inst.country if inst and inst.country else "US"),
            "original_currency": inst_ccy,
        })

    # -- FX conversion: convert all prices to portfolio display currency --
    display_ccy = (portfolio.currency or "USD").upper()
    inst_currencies = [ep["original_currency"] for ep in enriched_positions]
    fx_rates = md_service.get_fx_rates_bulk(inst_currencies, display_ccy)

    total_value = 0.0
    for ep in enriched_positions:
        rate = fx_rates.get(ep["original_currency"].upper(), 1.0)
        ep["fx_rate"] = round(rate, 6)
        ep["currency"] = display_ccy
        # Preserve original entry price before conversion
        ep["original_entry_price"] = ep["entry_price"]
        # Convert prices for display (DB unchanged)
        ep["entry_price"] = round(ep["entry_price"] * rate, 4)
        ep["current_price"] = round(ep["current_price"] * rate, 4)
        total_value += ep["quantity"] * ep["current_price"]

    # Calculate weights, pnl, daily_change (all in portfolio currency now)
    daily_pnl_total = 0.0
    for ep in enriched_positions:
        rate = ep["fx_rate"]
        mkt_val = ep["quantity"] * ep["current_price"]
        ep["weight"] = round((mkt_val / total_value * 100) if total_value > 0 else 0, 2)
        ep["pnl"] = round((ep["current_price"] - ep["entry_price"]) * ep["quantity"], 2)
        ep["pnl_percent"] = round(((ep["current_price"] - ep["entry_price"]) / ep["entry_price"] * 100) if ep["entry_price"] > 0 else 0, 2)

        # Previous price also needs FX conversion
        raw_prev = prev_prices.get(ep["instrument_symbol"])
        prev_price_converted = (raw_prev * rate) if raw_prev else ep["current_price"]
        if prev_price_converted and prev_price_converted > 0:
            daily_chg = ((ep["current_price"] - prev_price_converted) / prev_price_converted) * 100
        else:
            daily_chg = 0.0
        ep["daily_change"] = round(daily_chg, 2)
        daily_pnl_total += ep["quantity"] * (ep["current_price"] - prev_price_converted)

    # Build summary (all values in portfolio currency)
    total_cost = sum(ep["entry_price"] * ep["quantity"] for ep in enriched_positions)
    total_pnl = total_value - total_cost
    daily_pnl_pct = (daily_pnl_total / (total_value - daily_pnl_total) * 100) if (total_value - daily_pnl_total) > 0 else 0
    summary = {
        "name": portfolio.name,
        "description": portfolio.description or "",
        "currency": display_ccy,
        "benchmark": portfolio.benchmark_symbol or "SPY",
        "totalValue": round(total_value, 2),
        "dailyPnl": round(daily_pnl_total, 2),
        "dailyPnlPercent": round(daily_pnl_pct, 2),
        "totalPnl": round(total_pnl, 2),
        "totalPnlPercent": round((total_pnl / total_cost * 100) if total_cost > 0 else 0, 2),
        "positionCount": len(enriched_positions),
        "cashBalance": 0,
        "inceptionDate": str(min((ep["entry_date"] for ep in enriched_positions), default="2024-01-01")),
    }

    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "description": portfolio.description,
        "currency": portfolio.currency,
        "benchmark_symbol": portfolio.benchmark_symbol,
        "positions": enriched_positions,
        "transactions": [_tx_to_dict(t) for t in sorted(portfolio.transactions, key=lambda t: t.date, reverse=True)],
        "summary": summary,
    }

@router.put("/{id}", response_model=schemas.portfolio.Portfolio)
def update_portfolio(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    portfolio_in: schemas.portfolio.PortfolioUpdate,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """Update portfolio metadata."""
    portfolio = _get_portfolio(db, id)
    update_data = portfolio_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(portfolio, field, value)
    db.commit()
    db.refresh(portfolio)
    return portfolio

@router.delete("/{id}")
def delete_portfolio(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """Delete portfolio."""
    portfolio = _get_portfolio(db, id)
    db.delete(portfolio)
    db.commit()
    return {"ok": True}

@router.post("/{id}/duplicate", response_model=schemas.portfolio.Portfolio)
def duplicate_portfolio(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """Duplicate a portfolio."""
    source = _get_portfolio(db, id)
    new_portfolio = Portfolio(
        name=f"{source.name} (Copy)",
        description=source.description,
        currency=source.currency,
        benchmark_symbol=source.benchmark_symbol,
        owner_id=source.owner_id,
    )
    db.add(new_portfolio)
    db.flush()
    # Copy positions
    for p in source.positions:
        new_pos = Position(
            portfolio_id=new_portfolio.id,
            instrument_symbol=p.instrument_symbol,
            quantity=p.quantity,
            entry_price=p.entry_price,
            entry_date=p.entry_date,
            pricing_mode=p.pricing_mode,
            current_price=p.current_price,
        )
        db.add(new_pos)
    # Copy transactions
    for t in source.transactions:
        new_tx = Transaction(
            portfolio_id=new_portfolio.id,
            date=t.date,
            type=t.type,
            symbol=t.symbol,
            name=t.name,
            quantity=t.quantity,
            price=t.price,
            total=t.total,
            currency=t.currency,
            notes=t.notes,
        )
        db.add(new_tx)
    db.commit()
    db.refresh(new_portfolio)
    return new_portfolio

# ========== POSITIONS ==========

@router.post("/{id}/positions", response_model=schemas.portfolio.Position)
def create_position(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    position_in: schemas.portfolio.PositionCreate,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """Add a position to a portfolio."""
    portfolio = _get_portfolio(db, id)

    # Fast DB-only: ensure instrument row exists (no yfinance call)
    md_service = MarketDataService(db)
    inst_map = md_service.ensure_instruments_exist([position_in.instrument_symbol])
    instrument = inst_map.get(position_in.instrument_symbol)

    position = Position(
        portfolio_id=portfolio.id,
        instrument_symbol=position_in.instrument_symbol,
        quantity=position_in.quantity,
        entry_price=position_in.entry_price,
        entry_date=position_in.entry_date,
        pricing_mode=position_in.pricing_mode,
        current_price=position_in.current_price or (instrument.current_price if instrument else position_in.entry_price),
    )
    db.add(position)
    db.commit()
    db.refresh(position)

    # Kick off a background sync for metadata + price (non-blocking)
    import threading
    def _bg_sync():
        from app.db.session import SessionLocal
        bg_db = SessionLocal()
        try:
            bg_md = MarketDataService(bg_db)
            bg_md.sync_instrument(position_in.instrument_symbol)
        except Exception as e:
            logger.warning(f"Background sync for {position_in.instrument_symbol}: {e}")
        finally:
            bg_db.close()
    threading.Thread(target=_bg_sync, daemon=True).start()

    return position


# -- Import positions Pydantic models --
class ImportPositionItem(PydanticBaseModel):
    symbol: str
    quantity: float
    entry_price: float
    entry_date: date  # YYYY-MM-DD - Pydantic auto-parses str->date
    currency: Optional[str] = None  # if None, use yfinance detection
    pricing_mode: str = "market"

class ImportPositionsRequest(PydanticBaseModel):
    positions: List[ImportPositionItem]


@router.post("/{id}/import")
def import_positions(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    body: ImportPositionsRequest,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """
    Bulk import positions into a portfolio.
    Each position is a {symbol, quantity, entry_price, entry_date, currency?, pricing_mode?}.
    Instruments are synced via yfinance automatically.
    """
    portfolio = _get_portfolio(db, id)
    md_service = MarketDataService(db)

    # Fast: ensure all instrument rows exist first (DB-only, instant)
    all_symbols = [item.symbol.strip().upper() for item in body.positions]
    inst_map = md_service.ensure_instruments_exist(all_symbols)

    created = []
    errors = []

    for item in body.positions:
        sym = item.symbol.strip().upper()
        try:
            instrument = inst_map.get(sym)

            pos = Position(
                portfolio_id=portfolio.id,
                instrument_symbol=sym,
                quantity=item.quantity,
                entry_price=item.entry_price,
                entry_date=item.entry_date,
                pricing_mode=item.pricing_mode,
                current_price=instrument.current_price if instrument and instrument.current_price else item.entry_price,
            )
            db.add(pos)
            db.commit()
            db.refresh(pos)
            created.append({"symbol": sym, "id": pos.id})
        except Exception as e:
            db.rollback()
            logger.error(f"Import position failed for {sym}: {e}")
            errors.append({"symbol": sym, "error": str(e)})

    # Kick off background yfinance sync for all symbols (non-blocking)
    import threading
    def _bg_batch_sync():
        from app.db.session import SessionLocal
        bg_db = SessionLocal()
        try:
            bg_md = MarketDataService(bg_db)
            bg_md.batch_sync_instruments(all_symbols)
        except Exception as e:
            logger.warning(f"Background batch sync failed: {e}")
        finally:
            bg_db.close()
    threading.Thread(target=_bg_batch_sync, daemon=True).start()

    return {
        "imported": len(created),
        "errors": len(errors),
        "created": created,
        "failed": errors,
    }


@router.put("/{id}/positions/{pos_id}", response_model=schemas.portfolio.Position)
def update_position(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    pos_id: int,
    position_in: schemas.portfolio.PositionUpdate,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """Update a position."""
    _get_portfolio(db, id)
    position = db.query(Position).filter(Position.id == pos_id, Position.portfolio_id == id).first()
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    update_data = position_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(position, field, value)
    db.commit()
    db.refresh(position)
    return position

@router.delete("/{id}/positions/{pos_id}")
def delete_position(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    pos_id: int,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """Remove a position."""
    _get_portfolio(db, id)
    position = db.query(Position).filter(Position.id == pos_id, Position.portfolio_id == id).first()
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")
    db.delete(position)
    db.commit()
    return {"ok": True}


# ========== DUPLICATE MANAGEMENT ==========

@router.get("/{id}/positions/duplicates")
def find_duplicates(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """
    Find duplicate positions in a portfolio.
    Duplicates = same instrument_symbol AND same entry_price (date ignored).
    Returns groups of duplicate position IDs.
    """
    _get_portfolio(db, id)
    positions = db.query(Position).filter(Position.portfolio_id == id).all()

    from collections import defaultdict
    groups: dict = defaultdict(list)
    for p in positions:
        key = (p.instrument_symbol, round(float(p.entry_price), 2))
        groups[key].append({
            "id": p.id,
            "symbol": p.instrument_symbol,
            "quantity": float(p.quantity),
            "entry_price": float(p.entry_price),
            "entry_date": str(p.entry_date) if p.entry_date else None,
        })

    # Only return groups with more than 1 position
    duplicates = []
    for (symbol, price), items in groups.items():
        if len(items) > 1:
            duplicates.append({
                "symbol": symbol,
                "entry_price": price,
                "count": len(items),
                "total_quantity": sum(i["quantity"] for i in items),
                "positions": items,
            })

    return {"duplicates": duplicates, "total_duplicate_positions": sum(d["count"] - 1 for d in duplicates)}


@router.post("/{id}/positions/merge-duplicates")
def merge_duplicates(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """
    Merge duplicate positions: combine quantities into the earliest position,
    delete the rest. Duplicates = same symbol + same entry_price.
    """
    portfolio = _get_portfolio(db, id)
    positions = db.query(Position).filter(Position.portfolio_id == id).all()

    from collections import defaultdict
    groups: dict = defaultdict(list)
    for p in positions:
        key = (p.instrument_symbol, round(float(p.entry_price), 2))
        groups[key].append(p)

    merged_count = 0
    deleted_count = 0
    for (symbol, price), group in groups.items():
        if len(group) <= 1:
            continue
        # Sort by id (keep the first/earliest created)
        group.sort(key=lambda p: p.id)
        keeper = group[0]
        total_qty = sum(float(p.quantity) for p in group)
        keeper.quantity = total_qty
        for dup in group[1:]:
            db.delete(dup)
            deleted_count += 1
        merged_count += 1

    db.commit()
    return {
        "merged_groups": merged_count,
        "deleted_positions": deleted_count,
        "ok": True,
    }


@router.post("/{id}/positions/remove-duplicates")
def remove_duplicates(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """
    Remove duplicate positions: keep only one per (symbol, entry_price) group,
    delete the extras WITHOUT merging quantities.
    """
    portfolio = _get_portfolio(db, id)
    positions = db.query(Position).filter(Position.portfolio_id == id).all()

    from collections import defaultdict
    groups: dict = defaultdict(list)
    for p in positions:
        key = (p.instrument_symbol, round(float(p.entry_price), 2))
        groups[key].append(p)

    deleted_count = 0
    for (symbol, price), group in groups.items():
        if len(group) <= 1:
            continue
        group.sort(key=lambda p: p.id)
        # Keep the first, delete the rest
        for dup in group[1:]:
            db.delete(dup)
            deleted_count += 1

    db.commit()
    return {
        "deleted_positions": deleted_count,
        "ok": True,
    }


# ========== TRANSACTIONS ==========

@router.get("/{id}/transactions", response_model=List[schemas.portfolio.Transaction])
def list_transactions(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """List portfolio transactions."""
    _get_portfolio(db, id)
    txs = db.query(Transaction).filter(Transaction.portfolio_id == id).order_by(Transaction.date.desc()).all()
    return txs

@router.post("/{id}/transactions", response_model=schemas.portfolio.Transaction)
def create_transaction(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    tx_in: schemas.portfolio.TransactionCreate,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """Add a transaction. Buy/sell also update positions."""
    portfolio = _get_portfolio(db, id)
    tx = Transaction(
        portfolio_id=id,
        **tx_in.model_dump(),
    )
    db.add(tx)

    # Integrate buy/sell with positions
    if tx_in.type == 'buy' and tx_in.symbol and tx_in.symbol != '-':
        existing_pos = db.query(Position).filter(
            Position.portfolio_id == id,
            Position.instrument_symbol == tx_in.symbol,
        ).first()
        if existing_pos:
            old_cost = existing_pos.quantity * existing_pos.entry_price
            new_cost = (tx_in.quantity or 0) * (tx_in.price or 0)
            new_qty = existing_pos.quantity + (tx_in.quantity or 0)
            if new_qty > 0:
                existing_pos.entry_price = (old_cost + new_cost) / new_qty
            existing_pos.quantity = new_qty
        else:
            md_service = MarketDataService(db)
            try:
                md_service.sync_instrument(tx_in.symbol)
            except Exception:
                pass
            new_pos = Position(
                portfolio_id=id,
                instrument_symbol=tx_in.symbol,
                quantity=tx_in.quantity or 0,
                entry_price=tx_in.price or 0,
                entry_date=tx_in.date or date.today(),
                pricing_mode='market',
            )
            db.add(new_pos)
    elif tx_in.type == 'sell' and tx_in.symbol and tx_in.symbol != '-':
        existing_pos = db.query(Position).filter(
            Position.portfolio_id == id,
            Position.instrument_symbol == tx_in.symbol,
        ).first()
        if existing_pos:
            existing_pos.quantity -= (tx_in.quantity or 0)
            if existing_pos.quantity <= 0:
                db.delete(existing_pos)

    db.commit()
    db.refresh(tx)
    return tx

@router.delete("/{id}/transactions/{tx_id}")
def delete_transaction(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    tx_id: int,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """Delete a transaction."""
    _get_portfolio(db, id)
    tx = db.query(Transaction).filter(Transaction.id == tx_id, Transaction.portfolio_id == id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(tx)
    db.commit()
    return {"ok": True}


# ========== HELPERS ==========

def _get_portfolio(db: Session, portfolio_id: int) -> Portfolio:
    """Get portfolio by ID (mono-user - no access checks needed)."""
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


def _tx_to_dict(t: Transaction) -> dict:
    return {
        "id": t.id,
        "portfolio_id": t.portfolio_id,
        "date": t.date,
        "type": t.type,
        "symbol": t.symbol,
        "name": t.name,
        "quantity": t.quantity,
        "price": t.price,
        "total": t.total,
        "currency": t.currency,
        "notes": t.notes,
    }


# ========== JSON EXPORT / IMPORT ==========

@router.get("/{id}/export-json")
def export_portfolio_json(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    _: bool = Depends(deps.verify_session),
) -> Any:
    """Export a portfolio as a portable JSON object (positions + transactions)."""
    portfolio = _get_portfolio(db, id)
    return {
        "axiome_export": True,
        "version": "2.0",
        "name": portfolio.name,
        "description": portfolio.description or "",
        "currency": portfolio.currency or "USD",
        "benchmark_symbol": portfolio.benchmark_symbol or "",
        "positions": [
            {
                "symbol": p.instrument_symbol,
                "quantity": float(p.quantity),
                "entry_price": float(p.entry_price),
                "entry_date": str(p.entry_date) if p.entry_date else None,
                "pricing_mode": p.pricing_mode or "market",
                "current_price": float(p.current_price) if p.current_price else None,
            }
            for p in portfolio.positions
        ],
        "transactions": [
            {
                "date": str(t.date) if t.date else None,
                "type": t.type,
                "symbol": t.symbol,
                "name": t.name,
                "quantity": float(t.quantity) if t.quantity else 0,
                "price": float(t.price) if t.price else 0,
                "total": float(t.total) if t.total else 0,
                "currency": t.currency or "USD",
                "notes": t.notes or "",
            }
            for t in portfolio.transactions
        ],
    }


class ImportJsonRequest(PydanticBaseModel):
    name: str
    description: Optional[str] = ""
    currency: str = "USD"
    benchmark_symbol: Optional[str] = ""
    positions: list = []
    transactions: list = []


@router.post("/import-json")
def import_portfolio_json(
    *,
    db: Session = Depends(deps.get_db),
    body: ImportJsonRequest,
    user_id: Optional[int] = Depends(deps.get_current_user_id),
) -> Any:
    """Import a portfolio from an exported JSON file. Creates a new portfolio."""
    md_service = MarketDataService(db)

    # Create the portfolio
    portfolio = Portfolio(
        name=body.name,
        description=body.description or "",
        currency=body.currency or "USD",
        benchmark_symbol=body.benchmark_symbol or "",
        owner_id=user_id,
    )
    db.add(portfolio)
    db.flush()

    created_positions = 0
    created_transactions = 0

    # Import positions
    all_symbols = []
    for p in body.positions:
        sym = (p.get("symbol") or "").strip().upper()
        if not sym:
            continue
        all_symbols.append(sym)

    # Ensure instrument rows exist
    if all_symbols:
        md_service.ensure_instruments_exist(all_symbols)

    for p in body.positions:
        sym = (p.get("symbol") or "").strip().upper()
        if not sym:
            continue
        try:
            entry_date_str = p.get("entry_date")
            entry_date_val = date.fromisoformat(entry_date_str) if entry_date_str else date.today()
        except (ValueError, TypeError):
            entry_date_val = date.today()

        pos = Position(
            portfolio_id=portfolio.id,
            instrument_symbol=sym,
            quantity=float(p.get("quantity", 0)),
            entry_price=float(p.get("entry_price", 0)),
            entry_date=entry_date_val,
            pricing_mode=p.get("pricing_mode", "market"),
            current_price=float(p["current_price"]) if p.get("current_price") else None,
        )
        db.add(pos)
        created_positions += 1

    # Import transactions
    for t in body.transactions:
        try:
            tx_date_str = t.get("date")
            tx_date_val = date.fromisoformat(tx_date_str) if tx_date_str else date.today()
        except (ValueError, TypeError):
            tx_date_val = date.today()

        tx = Transaction(
            portfolio_id=portfolio.id,
            date=tx_date_val,
            type=t.get("type", "buy"),
            symbol=t.get("symbol", "-"),
            name=t.get("name", ""),
            quantity=float(t.get("quantity", 0)),
            price=float(t.get("price", 0)),
            total=float(t.get("total", 0)),
            currency=t.get("currency", "USD"),
            notes=t.get("notes", ""),
        )
        db.add(tx)
        created_transactions += 1

    db.commit()
    db.refresh(portfolio)

    # Background sync instruments
    if all_symbols:
        import threading
        def _bg_sync():
            from app.db.session import SessionLocal
            bg_db = SessionLocal()
            try:
                bg_md = MarketDataService(bg_db)
                bg_md.batch_sync_instruments(all_symbols)
            except Exception as e:
                logger.warning(f"Background sync after JSON import: {e}")
            finally:
                bg_db.close()
        threading.Thread(target=_bg_sync, daemon=True).start()

    return {
        "id": portfolio.id,
        "name": portfolio.name,
        "positions_imported": created_positions,
        "transactions_imported": created_transactions,
    }

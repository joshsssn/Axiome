from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from app.core.config import settings
from app.models.user import User
from app.models.portfolio import Portfolio, Position
from app.models.instrument import Instrument

from app.db.base import Base
from app.db.session import engine
from datetime import date, timedelta
import logging

logger = logging.getLogger(__name__)


def init_db(db: Session) -> None:
    """Initialize the SQLite database: create tables, add missing columns, seed data."""
    # Create all tables
    Base.metadata.create_all(bind=engine)

    # Add missing columns to existing tables (SQLite compatible)
    _add_column_if_not_exists(db, "positions", "current_price", "FLOAT")
    _add_column_if_not_exists(db, "portfolios", "owner_id", "INTEGER REFERENCES users(id)")

    # Ensure at least one user exists
    if db.query(User).count() == 0:
        default_user = User(display_name="User", organization="", avatar_url="")
        db.add(default_user)
        db.commit()
        logger.info("Created default user (id=1)")

    # Deduplicate price_history rows BEFORE creating unique constraint
    _deduplicate_price_history(db)

    # Add composite index & unique constraint on price_history (idempotent)
    _create_index_if_not_exists(db, "ix_price_history_symbol_date", "price_history", "instrument_symbol, date")
    _create_unique_constraint_if_not_exists(db, "uq_price_history_symbol_date", "price_history", "instrument_symbol, date")

    # Seed default portfolios if none exist
    existing = db.query(Portfolio).count()
    if existing == 0:
        first_user = db.query(User).first()
        _seed_default_portfolios(db, owner_id=first_user.id if first_user else None)
        logger.info("Seeded default portfolios")
    else:
        logger.info(f"Database already has {existing} portfolios")


def _seed_default_portfolios(db: Session, owner_id: int | None = None) -> None:
    """Create 4 default portfolios with sample positions."""
    today = date.today()
    one_year_ago = today - timedelta(days=365)

    portfolios_data = [
        {
            "name": "US Growth",
            "description": "Large-cap US growth portfolio",
            "currency": "USD",
            "benchmark_symbol": "QQQ",
            "positions": [
                ("AAPL", 50, 150.0),
                ("MSFT", 30, 280.0),
                ("GOOGL", 20, 120.0),
                ("AMZN", 15, 130.0),
                ("NVDA", 25, 40.0),
            ],
        },
        {
            "name": "Diversified Global",
            "description": "Balanced global multi-asset portfolio",
            "currency": "USD",
            "benchmark_symbol": "SPY",
            "positions": [
                ("SPY", 40, 420.0),
                ("EFA", 30, 70.0),
                ("BND", 50, 75.0),
                ("GLD", 15, 175.0),
                ("VWO", 25, 40.0),
            ],
        },
        {
            "name": "European Value",
            "description": "European large-cap value equities",
            "currency": "EUR",
            "benchmark_symbol": "VOO",
            "positions": [
                ("SAP", 20, 140.0),
                ("ASML", 10, 600.0),
                ("SIE.DE", 15, 130.0),
                ("MC.PA", 5, 750.0),
            ],
        },
        {
            "name": "Income & Dividends",
            "description": "High-yield dividend stocks and bond ETFs",
            "currency": "USD",
            "benchmark_symbol": "SPY",
            "positions": [
                ("VYM", 40, 105.0),
                ("SCHD", 35, 72.0),
                ("BND", 30, 75.0),
                ("JNJ", 20, 155.0),
                ("PG", 15, 145.0),
            ],
        },
    ]

    for pf_data in portfolios_data:
        # 1. Ensure all instruments for this portfolio exist
        for sym, qty, price in pf_data["positions"]:
            instrument = db.query(Instrument).filter(Instrument.symbol == sym).first()
            if not instrument:
                instrument = Instrument(
                    symbol=sym,
                    name=sym,
                    currency=pf_data["currency"],
                    asset_class="stock",
                )
                db.add(instrument)

        # Flush instruments before creating portfolio/positions
        db.flush()

        # 2. Create the portfolio
        portfolio = Portfolio(
            name=pf_data["name"],
            description=pf_data["description"],
            currency=pf_data["currency"],
            benchmark_symbol=pf_data["benchmark_symbol"],
            owner_id=owner_id,
        )
        db.add(portfolio)
        db.flush()  # Get portfolio.id

        # 3. Create positions
        for sym, qty, price in pf_data["positions"]:
            pos = Position(
                portfolio_id=portfolio.id,
                instrument_symbol=sym,
                quantity=qty,
                entry_price=price,
                entry_date=one_year_ago,
                pricing_mode="market",
            )
            db.add(pos)

        db.flush()

    db.commit()
    logger.info(f"Seeded {len(portfolios_data)} default portfolios")


def _add_column_if_not_exists(db: Session, table: str, column: str, col_type: str) -> None:
    """Safely add a column to an existing table if it doesn't exist yet."""
    try:
        insp = inspect(engine)
        columns = [c["name"] for c in insp.get_columns(table)]
        if column not in columns:
            db.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {col_type}'))
            db.commit()
            logger.info(f"Added column {column} to {table}")
    except Exception as e:
        db.rollback()
        logger.debug(f"Column migration skipped ({table}.{column}): {e}")


def _deduplicate_price_history(db: Session) -> None:
    """Remove duplicate (instrument_symbol, date) rows, keeping the one with the lowest id."""
    try:
        result = db.execute(text(
            "DELETE FROM price_history "
            "WHERE id NOT IN ("
            "  SELECT MIN(id) FROM price_history GROUP BY instrument_symbol, date"
            ")"
        ))
        db.commit()
        removed = result.rowcount
        if removed and removed > 0:
            logger.info(f"Deduplicated price_history: removed {removed} duplicate rows")
    except Exception as e:
        db.rollback()
        logger.debug(f"Deduplication skipped: {e}")


def _create_index_if_not_exists(db: Session, index_name: str, table: str, columns: str) -> None:
    """Create a DB index if it doesn't already exist."""
    try:
        db.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({columns})"))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.debug(f"Index migration skipped ({index_name}): {e}")


def _create_unique_constraint_if_not_exists(db: Session, constraint_name: str, table: str, columns: str) -> None:
    """Create a unique index (acts as unique constraint) if it doesn't exist."""
    try:
        db.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS {constraint_name} ON {table} ({columns})"))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.debug(f"Unique constraint migration skipped ({constraint_name}): {e}")

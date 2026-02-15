from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from app.core import security
from app.core.config import settings
from app.models.user import User
from app.models.portfolio import Portfolio, Position

from app.db.base import Base
from app.db.session import engine
from datetime import date, timedelta

def init_db(db: Session) -> None:
    # Create tables if they don't exist (handles NEW tables like transactions, collaborators)
    Base.metadata.create_all(bind=engine)

    # Add missing columns to existing tables (create_all won't do this)
    _add_column_if_not_exists(db, "positions", "current_price", "FLOAT")
    _add_column_if_not_exists(db, "users", "display_name", "VARCHAR")
    _add_column_if_not_exists(db, "users", "organization", "VARCHAR")
    _add_column_if_not_exists(db, "users", "avatar_url", "VARCHAR")

    # Deduplicate price_history rows BEFORE creating unique constraint
    _deduplicate_price_history(db)

    # Add composite index & unique constraint on price_history (idempotent)
    _create_index_if_not_exists(db, "ix_price_history_symbol_date", "price_history", "instrument_symbol, date")
    _create_unique_constraint_if_not_exists(db, "uq_price_history_symbol_date", "price_history", "instrument_symbol, date")

    # Check by email OR username to avoid unique constraint violations
    user = db.query(User).filter(
        (User.email == "admin@portfolio.io") | (User.username == "admin")
    ).first()
    

    if not user:
        user_in = User(
            email="admin@portfolio.io",
            username="admin",
            hashed_password=security.get_password_hash("admin"),
            role="admin",
            is_active=True,
        )
        db.add(user_in)
        db.commit()
        db.refresh(user_in)
        print("Admin user created")

        # Seed default portfolios for admin
        _seed_default_portfolios(db, user_in.id)
    else:
        print("Admin user already exists")
        # Seed default portfolios if admin has none
        existing = db.query(Portfolio).filter(Portfolio.owner_id == user.id).count()
        if existing == 0:
            _seed_default_portfolios(db, user.id)


def _seed_default_portfolios(db: Session, owner_id: int) -> None:
    """Create 4 default portfolios with sample positions for the admin user."""
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
        portfolio = Portfolio(
            name=pf_data["name"],
            description=pf_data["description"],
            currency=pf_data["currency"],
            benchmark_symbol=pf_data["benchmark_symbol"],
            owner_id=owner_id,
        )
        db.add(portfolio)
        db.flush()

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

    db.commit()
    print(f"Seeded {len(portfolios_data)} default portfolios for admin")


def _add_column_if_not_exists(db: Session, table: str, column: str, col_type: str) -> None:
    """Safely add a column to an existing table if it doesn't exist yet."""
    try:
        insp = inspect(engine)
        columns = [c["name"] for c in insp.get_columns(table)]
        if column not in columns:
            db.execute(text(f'ALTER TABLE {table} ADD COLUMN {column} {col_type}'))
            db.commit()
            print(f"Added column {column} to {table}")
    except Exception as e:
        db.rollback()
        print(f"Column migration skipped ({table}.{column}): {e}")


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
        if removed > 0:
            print(f"Deduplicated price_history: removed {removed} duplicate rows")
    except Exception as e:
        db.rollback()
        print(f"Deduplication skipped: {e}")


def _create_index_if_not_exists(db: Session, index_name: str, table: str, columns: str) -> None:
    """Create a DB index if it doesn't already exist."""
    try:
        db.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({columns})"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Index migration skipped ({index_name}): {e}")


def _create_unique_constraint_if_not_exists(db: Session, constraint_name: str, table: str, columns: str) -> None:
    """Create a unique index (acts as unique constraint) if it doesn't exist."""
    try:
        db.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS {constraint_name} ON {table} ({columns})"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Unique constraint migration skipped ({constraint_name}): {e}")

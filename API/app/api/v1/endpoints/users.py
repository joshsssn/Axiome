"""
Multi-user management endpoints.
Netflix-style: pick or create a user profile, no passwords.
"""
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api import deps
from app.models.user import User
from app.models.portfolio import Portfolio, Position
from app.models.instrument import Instrument
from datetime import date, timedelta

router = APIRouter()


# -- Schemas ----------------------------------------------
class UserCreate(BaseModel):
    display_name: str = "User"
    organization: str = ""
    avatar_url: str = ""


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    organization: Optional[str] = None
    avatar_url: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    display_name: str
    organization: str
    avatar_url: str

    class Config:
        from_attributes = True


# -- Endpoints --------------------------------------------

@router.get("/", response_model=List[UserResponse])
def list_users(db: Session = Depends(deps.get_db)) -> Any:
    """List all user profiles."""
    return db.query(User).all()


@router.post("/", response_model=UserResponse)
def create_user(
    *,
    db: Session = Depends(deps.get_db),
    user_in: UserCreate,
) -> Any:
    """Create a new user profile and seed default portfolios."""
    user = User(
        display_name=user_in.display_name or "User",
        organization=user_in.organization,
        avatar_url=user_in.avatar_url,
    )
    db.add(user)
    db.flush()

    # Seed default portfolios for the new user
    _seed_user_portfolios(db, user.id)

    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(deps.get_db)) -> Any:
    """Get a specific user profile."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    *,
    db: Session = Depends(deps.get_db),
    user_in: UserUpdate,
) -> Any:
    """Update a user profile."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user_in.display_name is not None:
        user.display_name = user_in.display_name
    if user_in.organization is not None:
        user.organization = user_in.organization
    if user_in.avatar_url is not None:
        user.avatar_url = user_in.avatar_url
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(deps.get_db)) -> Any:
    """Delete a user and all their portfolios."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Delete portfolios one by one through ORM so cascade="all, delete-orphan"
    # properly removes positions & transactions (bulk SQL delete bypasses ORM cascades
    # and fails with FK constraints when PRAGMA foreign_keys=ON).
    portfolios = db.query(Portfolio).filter(Portfolio.owner_id == user_id).all()
    for pf in portfolios:
        db.delete(pf)
    db.flush()
    db.delete(user)
    db.commit()
    return {"ok": True}


# -- Helper: seed default portfolios for a new user ------
def _seed_user_portfolios(db: Session, owner_id: int) -> None:
    """Create 4 default portfolios with sample positions for a new user."""
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
        for sym, qty, price in pf_data["positions"]:
            existing = db.query(Instrument).filter(Instrument.symbol == sym).first()
            if not existing:
                db.add(Instrument(symbol=sym, name=sym, currency=pf_data["currency"], asset_class="stock"))

        db.flush()

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
            db.add(Position(
                portfolio_id=portfolio.id,
                instrument_symbol=sym,
                quantity=qty,
                entry_price=price,
                entry_date=one_year_ago,
                pricing_mode="market",
            ))

    db.flush()

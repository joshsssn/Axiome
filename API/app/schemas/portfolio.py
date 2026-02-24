from typing import Optional, List, Any
from pydantic import BaseModel
from datetime import date

# --- Position Schemas ---
class PositionBase(BaseModel):
    instrument_symbol: str
    quantity: float
    entry_price: float
    entry_date: date
    pricing_mode: str = "market"
    current_price: Optional[float] = None

class PositionCreate(PositionBase):
    pass

class PositionUpdate(BaseModel):
    quantity: Optional[float] = None
    entry_price: Optional[float] = None
    entry_date: Optional[date] = None
    pricing_mode: Optional[str] = None
    current_price: Optional[float] = None

class Position(PositionBase):
    id: int
    portfolio_id: int

    class Config:
        from_attributes = True

class PositionEnriched(BaseModel):
    id: int
    portfolio_id: int
    instrument_symbol: str
    quantity: float
    entry_price: float
    entry_date: date
    pricing_mode: str
    current_price: float
    name: str = ""
    asset_class: str = "Equity"
    sector: str = "Other"
    country: str = "US"
    currency: str = "USD"
    original_currency: str = "USD"
    original_entry_price: float = 0.0
    fx_rate: float = 1.0
    weight: float = 0.0
    pnl: float = 0.0
    pnl_percent: float = 0.0
    daily_change: float = 0.0

    class Config:
        from_attributes = True

# --- Transaction Schemas ---
class TransactionBase(BaseModel):
    date: date
    type: str  # buy, sell, dividend, fee, deposit, withdrawal
    symbol: str = "—"
    name: str = ""
    quantity: float = 0
    price: float = 0
    total: float = 0
    currency: str = "USD"
    notes: str = ""

class TransactionCreate(TransactionBase):
    pass

class Transaction(TransactionBase):
    id: int
    portfolio_id: int

    class Config:
        from_attributes = True

# --- Collaborator Schemas ---
class CollaboratorBase(BaseModel):
    user_id: int
    permission: str = "view"

class CollaboratorCreate(CollaboratorBase):
    pass

class CollaboratorUpdate(BaseModel):
    permission: str

class Collaborator(BaseModel):
    id: int
    portfolio_id: int
    user_id: int
    permission: str
    added_date: Optional[date] = None
    username: str = ""
    email: str = ""

    class Config:
        from_attributes = True

# --- Portfolio Schemas ---
class PortfolioBase(BaseModel):
    name: str
    description: Optional[str] = None
    currency: str = "USD"
    benchmark_symbol: Optional[str] = None

class PortfolioCreate(PortfolioBase):
    pass

class PortfolioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    currency: Optional[str] = None
    benchmark_symbol: Optional[str] = None

class Portfolio(PortfolioBase):
    id: int
    owner_id: int
    positions: List[Position] = []

    class Config:
        from_attributes = True

class PortfolioFull(PortfolioBase):
    """Full portfolio with enriched positions, transactions, and collaborators."""
    id: int
    owner_id: int
    positions: List[PositionEnriched] = []
    transactions: List[Transaction] = []
    collaborators: List[Collaborator] = []
    summary: dict = {}

    class Config:
        from_attributes = True

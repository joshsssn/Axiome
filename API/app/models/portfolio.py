from sqlalchemy import Column, Integer, String, ForeignKey, Float, Date
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base_class import Base


class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String)
    currency = Column(String, default="USD")
    benchmark_symbol = Column(String, nullable=True)

    owner = relationship("User", backref="portfolios")

    positions = relationship("Position", back_populates="portfolio", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="portfolio", cascade="all, delete-orphan")

class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"))
    instrument_symbol = Column(String, ForeignKey("instruments.symbol"))
    quantity = Column(Float, nullable=False)
    entry_price = Column(Float, nullable=False)
    entry_date = Column(Date, nullable=False)
    pricing_mode = Column(String, default="market") # 'market' or 'fixed'
    current_price = Column(Float, nullable=True)  # cached current price for fixed-mode or last fetched

    portfolio = relationship("Portfolio", back_populates="positions")
    instrument = relationship("Instrument")

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"))
    date = Column(Date, nullable=False)
    type = Column(String, nullable=False)  # buy, sell, dividend, fee, deposit, withdrawal
    symbol = Column(String, default="-")
    name = Column(String, default="")
    quantity = Column(Float, default=0)
    price = Column(Float, default=0)
    total = Column(Float, default=0)
    currency = Column(String, default="USD")
    notes = Column(String, default="")

    portfolio = relationship("Portfolio", back_populates="transactions")



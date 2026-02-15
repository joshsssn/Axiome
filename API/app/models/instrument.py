from sqlalchemy import Column, String, Float, Date, Integer, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base_class import Base

class Instrument(Base):
    __tablename__ = "instruments"

    symbol = Column(String, primary_key=True, index=True)
    name = Column(String)
    asset_class = Column(String)
    sector = Column(String)
    country = Column(String)
    currency = Column(String)
    current_price = Column(Float)
    last_updated = Column(Date)

class PriceHistory(Base):
    __tablename__ = "price_history"
    __table_args__ = (
        UniqueConstraint('instrument_symbol', 'date', name='uq_price_history_symbol_date'),
        Index('ix_price_history_symbol_date', 'instrument_symbol', 'date'),
    )

    id = Column(Integer, primary_key=True, index=True)
    instrument_symbol = Column(String, ForeignKey("instruments.symbol"), index=True)
    date = Column(Date, nullable=False, index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Float)
    adjusted_close = Column(Float)

    instrument = relationship("Instrument", backref="price_history")

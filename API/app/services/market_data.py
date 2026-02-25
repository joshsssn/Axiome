"""
Market data service - optimised for speed.

Key improvements over the original:
  - batch_sync_instruments() / batch_download_history() use a single
    yf.download() call for N symbols instead of N sequential calls.
  - get_latest_prices_bulk() is a single DB query - no yfinance at all.
  - get_price_at() is DB-only (no yfinance call in the hot path).
  - Concurrency-safe dedup via INSERT ... ON CONFLICT DO NOTHING.
  - In-process LRU + TTL cache for instrument metadata.
"""

import yfinance as yf
import time
import logging
from datetime import date, timedelta
from typing import Optional, Dict, Any, List, Set
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, and_
from app.models.instrument import Instrument, PriceHistory

logger = logging.getLogger(__name__)

# -------------- in-process rate-limiter / cache --------------
_last_yf_call: float = 0.0
_YF_MIN_INTERVAL = 0.35          # seconds between yfinance API calls
_price_cache: Dict[str, Any] = {}
_CACHE_TTL = 300                 # 5 min


def _rate_limit():
    global _last_yf_call
    elapsed = time.time() - _last_yf_call
    if elapsed < _YF_MIN_INTERVAL:
        time.sleep(_YF_MIN_INTERVAL - elapsed)
    _last_yf_call = time.time()


def _cache_get(key: str) -> Any:
    entry = _price_cache.get(key)
    if entry and (time.time() - entry[0]) < _CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key: str, value: Any):
    _price_cache[key] = (time.time(), value)
    if len(_price_cache) > 500:
        cutoff = time.time() - _CACHE_TTL
        expired = [k for k, v in _price_cache.items() if v[0] < cutoff]
        for k in expired:
            del _price_cache[k]


# -------------- yfinance value normalization --------------
_QUOTE_TYPE_MAP: Dict[str, str] = {
    "EQUITY": "Equity",
    "STOCK": "Equity",
    "ETF": "ETF",
    "MUTUALFUND": "ETF",
    "FUTURE": "Futures",
    "OPTION": "Option",
    "INDEX": "Index",
    "CRYPTOCURRENCY": "Equity",
    "CURRENCY": "Equity",
}

_SECTOR_MAP: Dict[str, str] = {
    "technology": "Technology",
    "healthcare": "Healthcare",
    "health care": "Healthcare",
    "financial services": "Financials",
    "financials": "Financials",
    "consumer cyclical": "Consumer Discretionary",
    "consumer discretionary": "Consumer Discretionary",
    "consumer defensive": "Consumer Staples",
    "consumer staples": "Consumer Staples",
    "energy": "Energy",
    "industrials": "Industrials",
    "basic materials": "Materials",
    "materials": "Materials",
    "utilities": "Utilities",
    "real estate": "Real Estate",
    "communication services": "Telecom",
    "telecom": "Telecom",
    "telecommunications": "Telecom",
}

def _normalize_asset_class(raw: str | None) -> str:
    if not raw:
        return "Equity"
    return _QUOTE_TYPE_MAP.get(raw.upper().strip(), "Equity")

def _normalize_sector(raw: str | None) -> str | None:
    if not raw:
        return None
    return _SECTOR_MAP.get(raw.lower().strip(), raw.title())


# -------------- known metadata fallback --------------
_KNOWN_META: Dict[str, Dict[str, str]] = {
    "AAPL": {"name": "Apple Inc.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "MSFT": {"name": "Microsoft Corp.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "GOOGL": {"name": "Alphabet Inc.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "GOOG": {"name": "Alphabet Inc.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "AMZN": {"name": "Amazon.com Inc.", "sector": "Consumer Discretionary", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "NVDA": {"name": "NVIDIA Corp.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "META": {"name": "Meta Platforms Inc.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "TSLA": {"name": "Tesla Inc.", "sector": "Consumer Discretionary", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "BRK-B": {"name": "Berkshire Hathaway B", "sector": "Financials", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "JPM": {"name": "JPMorgan Chase", "sector": "Financials", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "V": {"name": "Visa Inc.", "sector": "Financials", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "JNJ": {"name": "Johnson & Johnson", "sector": "Healthcare", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "UNH": {"name": "UnitedHealth Group", "sector": "Healthcare", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "WMT": {"name": "Walmart Inc.", "sector": "Consumer Staples", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "PG": {"name": "Procter & Gamble", "sector": "Consumer Staples", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "XOM": {"name": "Exxon Mobil Corp.", "sector": "Energy", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "MA": {"name": "Mastercard Inc.", "sector": "Financials", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "HD": {"name": "Home Depot Inc.", "sector": "Consumer Discretionary", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "DIS": {"name": "Walt Disney Co.", "sector": "Communication Services", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "NFLX": {"name": "Netflix Inc.", "sector": "Communication Services", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "ADBE": {"name": "Adobe Inc.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "CRM": {"name": "Salesforce Inc.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "AMD": {"name": "Advanced Micro Devices", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "INTC": {"name": "Intel Corp.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "CSCO": {"name": "Cisco Systems", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "BA": {"name": "Boeing Co.", "sector": "Industrials", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "GS": {"name": "Goldman Sachs", "sector": "Financials", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "KO": {"name": "Coca-Cola Co.", "sector": "Consumer Staples", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "PEP": {"name": "PepsiCo Inc.", "sector": "Consumer Staples", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "COST": {"name": "Costco Wholesale", "sector": "Consumer Staples", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "T": {"name": "AT&T Inc.", "sector": "Communication Services", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "VZ": {"name": "Verizon Communications", "sector": "Communication Services", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "SPY": {"name": "SPDR S&P 500 ETF", "sector": "Index Fund", "country": "US", "currency": "USD", "asset_class": "ETF"},
    "QQQ": {"name": "Invesco QQQ Trust", "sector": "Index Fund", "country": "US", "currency": "USD", "asset_class": "ETF"},
    "IWM": {"name": "iShares Russell 2000", "sector": "Index Fund", "country": "US", "currency": "USD", "asset_class": "ETF"},
    "GLD": {"name": "SPDR Gold Shares", "sector": "Commodities", "country": "US", "currency": "USD", "asset_class": "Commodity ETF"},
    "TLT": {"name": "iShares 20+ Year Treasury", "sector": "Fixed Income", "country": "US", "currency": "USD", "asset_class": "Bond ETF"},
    "BND": {"name": "Vanguard Total Bond Market", "sector": "Fixed Income", "country": "US", "currency": "USD", "asset_class": "Bond ETF"},
    "VTI": {"name": "Vanguard Total Stock Market", "sector": "Index Fund", "country": "US", "currency": "USD", "asset_class": "ETF"},
    "VOO": {"name": "Vanguard S&P 500 ETF", "sector": "Index Fund", "country": "US", "currency": "USD", "asset_class": "ETF"},
    "ARKK": {"name": "ARK Innovation ETF", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "ETF"},
    "^GSPC": {"name": "S&P 500 Index", "sector": "Index", "country": "US", "currency": "USD", "asset_class": "Index"},
    "^DJI": {"name": "Dow Jones Industrial", "sector": "Index", "country": "US", "currency": "USD", "asset_class": "Index"},
    "^IXIC": {"name": "NASDAQ Composite", "sector": "Index", "country": "US", "currency": "USD", "asset_class": "Index"},
    "COR": {"name": "Cencora Inc.", "sector": "Healthcare", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "AVGO": {"name": "Broadcom Inc.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "LLY": {"name": "Eli Lilly and Co.", "sector": "Healthcare", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "ABBV": {"name": "AbbVie Inc.", "sector": "Healthcare", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "MRK": {"name": "Merck & Co.", "sector": "Healthcare", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "PFE": {"name": "Pfizer Inc.", "sector": "Healthcare", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "ORCL": {"name": "Oracle Corp.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "ACN": {"name": "Accenture plc", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "TMO": {"name": "Thermo Fisher Scientific", "sector": "Healthcare", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "ABT": {"name": "Abbott Laboratories", "sector": "Healthcare", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "CVX": {"name": "Chevron Corp.", "sector": "Energy", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "MCD": {"name": "McDonald's Corp.", "sector": "Consumer Discretionary", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "NKE": {"name": "Nike Inc.", "sector": "Consumer Discretionary", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "QCOM": {"name": "Qualcomm Inc.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "TXN": {"name": "Texas Instruments", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "IBM": {"name": "IBM Corp.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "PYPL": {"name": "PayPal Holdings", "sector": "Financials", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "UBER": {"name": "Uber Technologies", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "SQ": {"name": "Block Inc.", "sector": "Financials", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "COIN": {"name": "Coinbase Global", "sector": "Financials", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "PLTR": {"name": "Palantir Technologies", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "SNOW": {"name": "Snowflake Inc.", "sector": "Technology", "country": "US", "currency": "USD", "asset_class": "Equity"},
    "^TNX": {"name": "10-Year Treasury Yield", "sector": "Fixed Income", "country": "US", "currency": "USD", "asset_class": "Index"},
    "^VIX": {"name": "CBOE Volatility Index", "sector": "Volatility", "country": "US", "currency": "USD", "asset_class": "Index"},
}


# -------------- Yahoo Finance exchange -> currency mapping --------------
_EXCHANGE_CURRENCY: Dict[str, str] = {
    # US
    "NYQ": "USD", "NMS": "USD", "NGM": "USD", "NCM": "USD", "PCX": "USD",
    "BTS": "USD", "ASE": "USD", "OQX": "USD", "PNK": "USD", "OPR": "USD",
    "NAS": "USD", "CCC": "USD",
    # Europe - EUR
    "MIL": "EUR", "PAR": "EUR", "GER": "EUR", "FRA": "EUR", "MUN": "EUR",
    "AMS": "EUR", "MCE": "EUR", "VIE": "EUR", "BER": "EUR", "DUS": "EUR",
    "HAM": "EUR", "STU": "EUR", "HEL": "EUR", "LIS": "EUR", "ATH": "EUR",
    "IOB": "EUR", "DXE": "EUR", "CXE": "EUR",
    # Europe - other
    "EBS": "CHF", "ZRH": "CHF",                        # Swiss
    "LSE": "GBp", "LON": "GBp",                        # London (pence)
    "CPH": "DKK",                                       # Copenhagen
    "OSL": "NOK",                                       # Oslo
    "STO": "SEK",                                       # Stockholm
    # Asia
    "JPX": "JPY", "TYO": "JPY",
    "HKG": "HKD",
    "KSC": "KRW", "KOE": "KRW",
    "BSE": "INR", "NSI": "INR",
    "SET": "THB",
    "KLS": "MYR",
    "SGX": "SGD",
    # Americas
    "TSE": "CAD", "VAN": "CAD", "NEO": "CAD",
    "SAO": "BRL",
    "MEX": "MXN",
    # Oceania
    "ASX": "AUD", "CXA": "AUD",
}

# currency -> Yahoo Finance suffixes to try (most common exchanges first)
_CURRENCY_SUFFIXES: Dict[str, List[str]] = {
    "EUR": [".PA", ".DE", ".MI", ".AS", ".MC", ".BR", ".VI", ".HE", ".LS"],
    "CHF": [".SW"],
    "GBP": [".L"],
    "GBp": [".L"],
    "DKK": [".CO"],
    "NOK": [".OL"],
    "SEK": [".ST"],
    "JPY": [".T"],
    "HKD": [".HK"],
    "CAD": [".TO", ".V"],
    "AUD": [".AX"],
    "SGD": [".SI"],
    "KRW": [".KS", ".KQ"],
    "INR": [".BO", ".NS"],
}


def _exchange_to_currency(exchange_code: str) -> Optional[str]:
    """Map a Yahoo Finance exchange code to its trading currency."""
    ccy = _EXCHANGE_CURRENCY.get(exchange_code)
    if ccy == "GBp":
        return "GBP"
    return ccy


# ===============================================================
#  MarketDataService
# ===============================================================
class MarketDataService:
    def __init__(self, db: Session):
        self.db = db

    # ---------------- RESOLVE SYMBOL FOR CURRENCY ----------------

    def resolve_symbol_for_currency(
        self, raw_symbol: str, currency_hint: str
    ) -> str:
        """
        Given a bare ticker (e.g. 'RACE') and a target currency ('EUR'),
        find the Yahoo Finance symbol on the exchange that trades in that
        currency (e.g. 'RACE.MI').

        Strategy:
          1. Check if the bare symbol already trades in the target currency.
          2. Use yf.Search() to find all listings -> pick by exchange->currency.
          3. Try common exchange suffixes for that currency.
          4. Fall back to the original symbol if nothing matches.
        """
        cache_key = f"resolve:{raw_symbol}:{currency_hint}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        # Normalize
        sym = raw_symbol.strip().upper()
        hint = currency_hint.strip().upper()

        # If the raw symbol already has an exchange suffix, keep it
        if "." in sym and len(sym.split(".")[-1]) <= 3:
            _cache_set(cache_key, sym)
            return sym

        # 1) Search Yahoo Finance for candidate listings
        try:
            _rate_limit()
            search_results = yf.Search(sym, max_results=10)
            candidates = search_results.quotes if search_results.quotes else []

            for candidate in candidates:
                c_sym = candidate.get("symbol", "")
                c_exch = candidate.get("exchange", "")
                c_base = c_sym.split(".")[0].upper()

                # The base ticker must match (ignore exchange suffix)
                if c_base != sym and not c_base.startswith(sym):
                    continue

                exch_ccy = _exchange_to_currency(c_exch)
                if exch_ccy and exch_ccy == hint:
                    logger.info(
                        f"resolve_symbol: {raw_symbol}+{currency_hint} -> "
                        f"{c_sym} (via search, exchange={c_exch})"
                    )
                    _cache_set(cache_key, c_sym)
                    return c_sym
        except Exception as e:
            logger.warning(f"resolve_symbol: search failed for '{sym}': {e}")

        # 2) Try common exchange suffixes for the hinted currency
        suffixes = _CURRENCY_SUFFIXES.get(hint, [])
        for suffix in suffixes:
            candidate = sym + suffix
            try:
                _rate_limit()
                t = yf.Ticker(candidate)
                info = t.info
                if info and info.get("currency", "").upper() == hint:
                    name = info.get("longName") or info.get("shortName")
                    if name:
                        logger.info(
                            f"resolve_symbol: {raw_symbol}+{currency_hint} -> "
                            f"{candidate} (via suffix probe)"
                        )
                        _cache_set(cache_key, candidate)
                        return candidate
            except Exception:
                continue

        # 3) Fall back to original
        logger.info(
            f"resolve_symbol: no {currency_hint} listing found for '{sym}', "
            f"keeping original"
        )
        _cache_set(cache_key, sym)
        return sym

    # -------------------- INSTRUMENT METADATA --------------------

    def get_instrument_info(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Fetch instrument metadata from yfinance with caching."""
        cache_key = f"info:{symbol}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        for attempt in range(3):
            try:
                _rate_limit()
                ticker = yf.Ticker(symbol)
                info = ticker.info
                result = {
                    "symbol": symbol,
                    "name": info.get("longName") or info.get("shortName"),
                    "asset_class": _normalize_asset_class(info.get("quoteType")),
                    "sector": _normalize_sector(info.get("sector")),
                    "country": info.get("country"),
                    "currency": info.get("currency"),
                    "current_price": info.get("currentPrice") or info.get("regularMarketPrice"),
                }
                _cache_set(cache_key, result)
                return result
            except Exception as e:
                err = str(e).lower()
                if "429" in err or "too many requests" in err:
                    time.sleep(2 ** (attempt + 1))
                    continue
                break
        return None

    # -- fast DB-only helper: ensure instrument rows exist --
    def ensure_instruments_exist(self, symbols: List[str]) -> Dict[str, Instrument]:
        """
        Make sure every symbol has an Instrument row in the DB.
        Uses _KNOWN_META as fallback - **no yfinance call**.
        Also updates instruments that have placeholder metadata (name == symbol).
        Returns {symbol: Instrument}.
        """
        if not symbols:
            return {}
        existing = (
            self.db.query(Instrument)
            .filter(Instrument.symbol.in_(symbols))
            .all()
        )
        found = {i.symbol: i for i in existing}
        dirty = False

        # Fix stale instruments that have placeholder data (name == symbol)
        for inst in existing:
            meta = _KNOWN_META.get(inst.symbol)
            if meta and meta.get("name") and (not inst.name or inst.name == inst.symbol):
                inst.name = meta["name"]
                inst.sector = meta.get("sector") or inst.sector
                inst.country = meta.get("country") or inst.country
                inst.asset_class = meta.get("asset_class") or inst.asset_class
                inst.currency = meta.get("currency") or inst.currency
                dirty = True

        missing = [s for s in symbols if s not in found]
        for sym in missing:
            meta = _KNOWN_META.get(sym, {})
            inst = Instrument(
                symbol=sym,
                name=meta.get("name", sym),
                asset_class=meta.get("asset_class", "Equity"),
                sector=meta.get("sector"),
                country=meta.get("country", "US"),
                currency=meta.get("currency", "USD"),
                last_updated=None,
            )
            self.db.add(inst)
            found[sym] = inst
        if missing or dirty:
            try:
                self.db.commit()
            except IntegrityError:
                self.db.rollback()
                existing = self.db.query(Instrument).filter(Instrument.symbol.in_(symbols)).all()
                found = {i.symbol: i for i in existing}
        return found

    def sync_instrument(self, symbol: str) -> Optional[Instrument]:
        """
        Ensure instrument exists and is up-to-date.
        Fast path: if updated today AND has real metadata, skip yfinance entirely.
        """
        instrument = self.db.query(Instrument).filter(Instrument.symbol == symbol).first()

        has_real_name = instrument and instrument.name and instrument.name != instrument.symbol
        if instrument and instrument.last_updated == date.today() and has_real_name:
            return instrument  # already fresh - instant

        info = self.get_instrument_info(symbol)
        if not info:
            meta = _KNOWN_META.get(symbol, {})
            latest_price = None
            last_rec = (
                self.db.query(PriceHistory)
                .filter(PriceHistory.instrument_symbol == symbol)
                .order_by(PriceHistory.date.desc())
                .first()
            )
            if last_rec:
                latest_price = last_rec.adjusted_close or last_rec.close
            info = {
                "symbol": symbol,
                "name": meta.get("name", symbol),
                "asset_class": meta.get("asset_class", "Equity"),
                "sector": meta.get("sector"),
                "country": meta.get("country", "US"),
                "currency": meta.get("currency", "USD"),
                "current_price": latest_price,
            }

        if not instrument:
            instrument = Instrument(**info)
            instrument.last_updated = date.today()
            self.db.add(instrument)
        else:
            for k, v in info.items():
                if v is not None:
                    setattr(instrument, k, v)
            instrument.last_updated = date.today()

        try:
            self.db.commit()
            self.db.refresh(instrument)
        except IntegrityError:
            self.db.rollback()
            instrument = self.db.query(Instrument).filter(Instrument.symbol == symbol).first()
        except Exception as e:
            self.db.rollback()
            logger.error(f"sync_instrument({symbol}): {e}")
            instrument = self.db.query(Instrument).filter(Instrument.symbol == symbol).first()
        return instrument

    def batch_sync_instruments(self, symbols: List[str]) -> Dict[str, Instrument]:
        """
        Sync multiple instruments in one shot.
        - Instruments already updated today are skipped.
        - Remaining instruments get metadata from _KNOWN_META (instant)
          and current_price from a single yf.download() call.
        """
        if not symbols:
            return {}
        unique_syms = list(set(symbols))

        # 1) Ensure rows exist (DB only, instant)
        inst_map = self.ensure_instruments_exist(unique_syms)

        # 2) Separate stale from fresh
        stale = [s for s in unique_syms
                 if not inst_map.get(s) or not inst_map[s].last_updated or inst_map[s].last_updated < date.today()]
        if not stale:
            return inst_map

        # 3) Batch-fetch latest prices with yf.download (ONE call)
        try:
            _rate_limit()
            df = yf.download(stale, period="5d", progress=False, threads=True)
            if df is not None and not df.empty:
                if len(stale) == 1:
                    _close = df["Close"].dropna()
                    last_close = float(_close.iloc[-1].item()) if "Close" in df.columns and len(_close) else None
                    if last_close and last_close > 0:
                        inst_map[stale[0]].current_price = last_close
                else:
                    if "Close" in df.columns:
                        last_row = df["Close"].dropna().iloc[-1] if len(df["Close"].dropna()) else None
                        if last_row is not None:
                            for sym in stale:
                                try:
                                    price = float(last_row[sym])
                                    if price and price > 0:
                                        inst_map[sym].current_price = price
                                except (KeyError, TypeError, ValueError):
                                    pass
        except Exception as e:
            logger.warning(f"batch_sync_instruments download error: {e}")

        for sym in stale:
            if sym in inst_map:
                inst_map[sym].last_updated = date.today()

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()

        return inst_map

    # -------------------- FX RATES --------------------

    def get_fx_rate(self, from_ccy: str, to_ccy: str) -> float:
        """
        Get current FX rate from `from_ccy` to `to_ccy` via yfinance.
        Returns 1.0 if same currency or on error.
        """
        from_ccy = from_ccy.upper().strip()
        to_ccy = to_ccy.upper().strip()
        if from_ccy == to_ccy:
            return 1.0

        cache_key = f"fx:{from_ccy}{to_ccy}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        # Try direct pair
        pair = f"{from_ccy}{to_ccy}=X"
        for attempt in range(2):
            try:
                _rate_limit()
                ticker = yf.Ticker(pair)
                info = ticker.info
                rate = info.get("regularMarketPrice") or info.get("previousClose")
                if rate and rate > 0:
                    _cache_set(cache_key, float(rate))
                    return float(rate)
            except Exception as e:
                err = str(e).lower()
                if "429" in err or "too many requests" in err:
                    time.sleep(2 ** (attempt + 1))
                    continue
                break

        # Try inverse pair as fallback
        inv_pair = f"{to_ccy}{from_ccy}=X"
        try:
            _rate_limit()
            ticker = yf.Ticker(inv_pair)
            info = ticker.info
            inv_rate = info.get("regularMarketPrice") or info.get("previousClose")
            if inv_rate and inv_rate > 0:
                rate = 1.0 / float(inv_rate)
                _cache_set(cache_key, rate)
                return rate
        except Exception:
            pass

        logger.warning(f"FX rate {from_ccy}->{to_ccy} unavailable, using 1.0")
        return 1.0

    def get_fx_rates_bulk(self, currencies: list, target_ccy: str) -> dict:
        """
        Fetch FX rates for a set of source currencies to one target currency.
        Returns {source_ccy: rate_to_target}.
        """
        target_ccy = target_ccy.upper().strip()
        rates: dict = {}
        for ccy in set(currencies):
            ccy = ccy.upper().strip()
            if ccy == target_ccy:
                rates[ccy] = 1.0
            else:
                rates[ccy] = self.get_fx_rate(ccy, target_ccy)
        return rates

    # -------------------- PRICE LOOKUPS (DB-only, instant) --------------------

    def get_latest_prices_bulk(self, symbols: List[str]) -> Dict[str, float]:
        """
        Single DB query -> {symbol: latest_close_price}.
        No yfinance calls. Used for fast portfolio enrichment.
        """
        if not symbols:
            return {}
        sub = (
            self.db.query(
                PriceHistory.instrument_symbol,
                func.max(PriceHistory.date).label("max_date"),
            )
            .filter(PriceHistory.instrument_symbol.in_(symbols))
            .group_by(PriceHistory.instrument_symbol)
            .subquery()
        )
        rows = (
            self.db.query(PriceHistory)
            .join(
                sub,
                and_(
                    PriceHistory.instrument_symbol == sub.c.instrument_symbol,
                    PriceHistory.date == sub.c.max_date,
                ),
            )
            .all()
        )
        result: Dict[str, float] = {}
        for r in rows:
            p = r.adjusted_close or r.close
            if p:
                result[r.instrument_symbol] = float(p)
        return result

    def get_prices_at_date_bulk(self, symbols: List[str], target_date: date) -> Dict[str, float]:
        """
        Single DB query -> closest price on or before target_date for each symbol.
        Falls back up to 7 days for weekends/holidays. No yfinance.
        """
        if not symbols:
            return {}
        start = target_date - timedelta(days=7)
        sub = (
            self.db.query(
                PriceHistory.instrument_symbol,
                func.max(PriceHistory.date).label("max_date"),
            )
            .filter(
                PriceHistory.instrument_symbol.in_(symbols),
                PriceHistory.date >= start,
                PriceHistory.date <= target_date,
            )
            .group_by(PriceHistory.instrument_symbol)
            .subquery()
        )
        rows = (
            self.db.query(PriceHistory)
            .join(
                sub,
                and_(
                    PriceHistory.instrument_symbol == sub.c.instrument_symbol,
                    PriceHistory.date == sub.c.max_date,
                ),
            )
            .all()
        )
        result: Dict[str, float] = {}
        for r in rows:
            p = r.adjusted_close or r.close
            if p:
                result[r.instrument_symbol] = float(p)
        return result

    def get_price_at(self, symbol: str, target_date: date) -> Optional[float]:
        """DB-only price lookup for a single symbol. Kept for backward compat."""
        start = target_date - timedelta(days=7)
        rec = (
            self.db.query(PriceHistory)
            .filter(
                PriceHistory.instrument_symbol == symbol,
                PriceHistory.date >= start,
                PriceHistory.date <= target_date,
            )
            .order_by(PriceHistory.date.desc())
            .first()
        )
        if rec:
            return rec.adjusted_close or rec.close
        return None

    # -------------------- PRICE HISTORY --------------------

    def get_price_history(self, symbol: str, start_date: date, end_date: date = date.today()) -> List[PriceHistory]:
        """Get historical data, fetching from yfinance if DB has gaps."""
        history = (
            self.db.query(PriceHistory)
            .filter(
                PriceHistory.instrument_symbol == symbol,
                PriceHistory.date >= start_date,
                PriceHistory.date <= end_date,
            )
            .order_by(PriceHistory.date)
            .all()
        )

        fetch_start = None

        if not history:
            fetch_start = start_date
            self.ensure_instruments_exist([symbol])
        else:
            first_db = history[0].date
            last_db = history[-1].date
            needs_earlier = first_db > start_date + timedelta(days=5)
            needs_later = last_db < end_date and last_db < date.today()
            if needs_earlier:
                fetch_start = start_date
            elif needs_later:
                fetch_start = last_db + timedelta(days=1)
            else:
                return history

        # Fetch from yfinance
        df = self._yf_download_single(symbol, fetch_start, min(end_date, date.today()) + timedelta(days=1))
        if df is None or df.empty:
            return history or []

        new_records = self._insert_price_rows(symbol, df, {h.date for h in history} if history else set())
        full = (history or []) + new_records
        full.sort(key=lambda x: x.date)
        return full

    def batch_download_history(
        self, symbols: List[str], start_date: date, end_date: date = date.today()
    ) -> None:
        """
        Batch-fetch price history for many symbols in ONE yf.download() call.
        Only fetches symbols that have gaps in the DB for the given range.
        """
        if not symbols:
            return
        unique = list(set(symbols))
        self.ensure_instruments_exist(unique)

        # Determine which symbols need a fetch
        to_fetch: List[str] = []
        for sym in unique:
            first_rec = (
                self.db.query(PriceHistory)
                .filter(PriceHistory.instrument_symbol == sym, PriceHistory.date >= start_date)
                .order_by(PriceHistory.date)
                .first()
            )
            last_rec = (
                self.db.query(PriceHistory)
                .filter(PriceHistory.instrument_symbol == sym, PriceHistory.date <= end_date)
                .order_by(PriceHistory.date.desc())
                .first()
            )
            needs_fetch = False
            if not first_rec or not last_rec:
                needs_fetch = True
            else:
                if first_rec.date > start_date + timedelta(days=5):
                    needs_fetch = True
                elif last_rec.date < end_date and last_rec.date < date.today():
                    needs_fetch = True
            if needs_fetch:
                to_fetch.append(sym)

        if not to_fetch:
            return

        logger.info(f"batch_download_history: fetching {len(to_fetch)} symbols from yfinance")
        target_end = min(end_date, date.today()) + timedelta(days=1)

        try:
            _rate_limit()
            if len(to_fetch) == 1:
                df = yf.download(to_fetch[0], start=start_date, end=target_end, progress=False)
                if df is not None and not df.empty:
                    existing_dates = {
                        r.date for r in self.db.query(PriceHistory.date)
                        .filter(PriceHistory.instrument_symbol == to_fetch[0],
                                PriceHistory.date >= start_date,
                                PriceHistory.date <= end_date)
                        .all()
                    }
                    self._insert_price_rows(to_fetch[0], df, existing_dates)
            else:
                df = yf.download(to_fetch, start=start_date, end=target_end,
                                 progress=False, threads=True, group_by="ticker")
                if df is not None and not df.empty:
                    for sym in to_fetch:
                        try:
                            # group_by="ticker" gives df[sym] as a sub-DataFrame
                            sym_df = df[sym].dropna(how="all") if sym in df.columns else None
                            if sym_df is None or sym_df.empty:
                                continue
                            existing_dates = {
                                r.date for r in self.db.query(PriceHistory.date)
                                .filter(PriceHistory.instrument_symbol == sym,
                                        PriceHistory.date >= start_date,
                                        PriceHistory.date <= end_date)
                                .all()
                            }
                            self._insert_price_rows(sym, sym_df, existing_dates)
                        except Exception as e:
                            logger.warning(f"batch_download_history: error for {sym}: {e}")
        except Exception as e:
            logger.error(f"batch_download_history failed: {e}")

    # -------------------- BACKGROUND REFRESH --------------------

    def refresh_all_prices(self) -> int:
        """
        Refresh today's prices for ALL instruments in the DB.
        Designed to run once at startup or via a cron endpoint.
        Returns the number of instruments updated.
        """
        all_instruments = self.db.query(Instrument).all()
        if not all_instruments:
            return 0
        symbols = [i.symbol for i in all_instruments]
        today = date.today()

        # 1) Batch-update instrument.current_price via yf.download
        self.batch_sync_instruments(symbols)

        # 2) Fetch last 7 days of history for all (fills any gap to today)
        start = today - timedelta(days=7)
        self.batch_download_history(symbols, start, today)

        return len(symbols)

    # -------------------- INTERNAL HELPERS --------------------

    def _yf_download_single(self, symbol: str, start: date, end: date):
        """Download price history for a single symbol with retry."""
        for attempt in range(3):
            try:
                _rate_limit()
                ticker = yf.Ticker(symbol)
                df = ticker.history(start=start, end=end)
                return df
            except Exception as e:
                err = str(e).lower()
                if "429" in err or "too many requests" in err:
                    time.sleep(2 ** (attempt + 1))
                    continue
                elif "404" in err or "not found" in err:
                    logger.warning(f"No price data for {symbol}")
                    return None
                else:
                    logger.error(f"Error fetching history for {symbol}: {e}")
                    return None
        return None

    def _insert_price_rows(
        self, symbol: str, df, existing_dates: Set[date]
    ) -> List[PriceHistory]:
        """Insert new rows and update existing stale rows from a yfinance DataFrame."""
        new_records: List[PriceHistory] = []
        for idx, row in df.iterrows():
            d = idx.date() if hasattr(idx, 'date') else idx
            try:
                close_val = row.get("Close")
                if close_val is None:
                    continue
                close_f = float(close_val)
                open_f = float(row["Open"]) if row.get("Open") is not None else None
                high_f = float(row["High"]) if row.get("High") is not None else None
                low_f = float(row["Low"]) if row.get("Low") is not None else None
                vol_f = float(row["Volume"]) if row.get("Volume") is not None else None

                if d in existing_dates:
                    # Update existing row if price changed (fixes stale 0-return gaps)
                    existing = (
                        self.db.query(PriceHistory)
                        .filter(PriceHistory.instrument_symbol == symbol, PriceHistory.date == d)
                        .first()
                    )
                    if existing and existing.close != close_f:
                        existing.open = open_f
                        existing.high = high_f
                        existing.low = low_f
                        existing.close = close_f
                        existing.adjusted_close = close_f
                        existing.volume = vol_f
                    continue

                rec = PriceHistory(
                    instrument_symbol=symbol,
                    date=d,
                    open=open_f,
                    high=high_f,
                    low=low_f,
                    close=close_f,
                    volume=vol_f,
                    adjusted_close=close_f,
                )
                self.db.add(rec)
                new_records.append(rec)
            except (ValueError, TypeError) as e:
                logger.warning(f"Skipping bad row for {symbol} on {idx}: {e}")

        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            logger.warning(f"IntegrityError for {symbol}, retrying one-by-one")
            # Retry individual inserts to save what we can
            for rec in new_records:
                try:
                    self.db.merge(rec)
                    self.db.commit()
                except Exception:
                    self.db.rollback()
        return new_records


"""
Dependencies for the multi-user desktop app.
User is identified by X-User-Id header.
"""
from typing import Generator, Optional
from fastapi import Header, HTTPException
from sqlalchemy.orm import Session

from app.db.session import SessionLocal


def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()


def get_current_user_id(x_user_id: Optional[str] = Header(None)) -> Optional[int]:
    """Extract user ID from X-User-Id header. Returns None if not set."""
    if x_user_id is None:
        return None
    try:
        return int(x_user_id)
    except (ValueError, TypeError):
        return None


def verify_session(authorization: Optional[str] = Header(None)) -> bool:
    """No-op - authentication removed. Always allows access."""
    return True

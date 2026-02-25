import threading
import logging
from fastapi import FastAPI
from app.core.config import settings

logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

from app.db.init_db import init_db
from app.db.session import SessionLocal


def _background_price_refresh():
    """Refresh all instrument prices in a background thread so startup is instant."""
    try:
        from app.services.market_data import MarketDataService
        db = SessionLocal()
        try:
            svc = MarketDataService(db)
            count = svc.refresh_all_prices()
            logger.info(f"Background price refresh complete: {count} instruments updated")
        except Exception as e:
            logger.warning(f"Background price refresh failed: {e}")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Background price refresh thread error: {e}")


@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    init_db(db)
    db.close()

    # Refresh prices in background - does NOT block the server from accepting requests
    t = threading.Thread(target=_background_price_refresh, daemon=True)
    t.start()
    logger.info("Background price refresh thread started")

from fastapi.middleware.cors import CORSMiddleware
import os

# Set all CORS enabled origins
# Parse comma-separated list from env var, or default to ["*"]
backend_cors_origins_str = os.getenv("BACKEND_CORS_ORIGINS", "")
if backend_cors_origins_str:
    origins = [origin.strip() for origin in backend_cors_origins_str.split(",")]
else:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.v1.api import api_router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {"message": "Welcome to Axiome API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("AXIOME_PORT", "8742"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")

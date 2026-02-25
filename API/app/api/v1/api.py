from fastapi import APIRouter
from app.api.v1.endpoints import portfolios, analytics, optimization, market_data, users, backtesting

api_router = APIRouter()
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(portfolios.router, prefix="/portfolios", tags=["portfolios"])
api_router.include_router(analytics.router, prefix="/portfolios", tags=["analytics"])
api_router.include_router(optimization.router, prefix="/portfolios", tags=["optimization"])
api_router.include_router(backtesting.router, prefix="/portfolios", tags=["backtesting"])
api_router.include_router(market_data.router, prefix="/market-data", tags=["market-data"])

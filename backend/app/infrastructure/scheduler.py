"""Background scheduler — periodic infrastructure tasks"""
import asyncio
import logging

from app.db.database import SessionLocal
from app.factories import build_territory_service

logger = logging.getLogger(__name__)

_TERRITORY_SETTLEMENT_INTERVAL = 300  # seconds


async def territory_settlement_task() -> None:
    """Periodically settle GT activities whose deadline has passed."""
    while True:
        try:
            await asyncio.sleep(_TERRITORY_SETTLEMENT_INTERVAL)
        except asyncio.CancelledError:
            return
        try:
            with SessionLocal() as db:
                count = build_territory_service(db).settle_expired()
                if count:
                    logger.info("Auto-settled %d expired GT activities", count)
        except Exception:
            logger.exception("Territory settlement task failed")

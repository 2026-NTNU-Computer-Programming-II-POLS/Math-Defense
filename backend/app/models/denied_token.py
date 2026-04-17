"""ORM model for the JWT revocation deny-list.

A token's JTI lives here until its natural JWT expiry, after which it's purged.
Persisted so "logout" actually means "revoked" across process restarts and
across replicas in a multi-instance deployment.
"""
from datetime import datetime
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class DeniedToken(Base):
    __tablename__ = "denied_tokens"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

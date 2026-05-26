import uuid
from datetime import datetime, UTC
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class ClassPendingInvite(Base):
    __tablename__ = "class_pending_invites"
    __table_args__ = (
        UniqueConstraint("class_id", "email", name="uq_class_invites_class_email"),
        Index("ix_class_pending_invites_email", "email"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    class_id: Mapped[str] = mapped_column(
        String, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    invited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )

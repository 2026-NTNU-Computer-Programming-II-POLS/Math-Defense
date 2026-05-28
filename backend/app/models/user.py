import uuid
from datetime import datetime, UTC
from sqlalchemy import Boolean, CheckConstraint, String, Integer, Float, DateTime, Enum, Text, text
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "ia_recent_accuracy BETWEEN 0.0 AND 1.0",
            name="ck_user_ia_accuracy_range",
        ),
        # Endpoint marker style + hit-FX enum allowlists at the DB layer —
        # defense-in-depth behind Pydantic + aggregate. NULL is allowed
        # (legacy rows + users who haven't set the preference).
        CheckConstraint(
            "endpoint_marker_style IS NULL OR endpoint_marker_style IN "
            "('star', 'gorilla', 'custom')",
            name="ck_user_endpoint_marker_style",
        ),
        CheckConstraint(
            "endpoint_hit_fx IS NULL OR endpoint_hit_fx IN "
            "('random', 'fragments', 'crying', 'angry')",
            name="ck_user_endpoint_hit_fx",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    player_name: Mapped[str] = mapped_column(String(50), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    role: Mapped[str] = mapped_column(
        Enum("admin", "teacher", "student", name="user_role", create_type=False),
        nullable=False,
        server_default="student",
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    password_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    totp_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    totp_last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Rolling fraction of the last 10 completed sessions whose Initial-Answer
    # phase was answered correctly. Recomputed by the session-service at
    # session-end and read by the frontend at level start to drive
    # concrete-fading on the Star-1 path renderer (spec §17).
    ia_recent_accuracy: Mapped[float] = mapped_column(Float, nullable=False, server_default="0.0")
    # Endpoint marker (P*) display preferences — server-side persistence so
    # the choice follows the player across devices. All nullable; NULL means
    # the player has not chosen and the FE falls back to its local default.
    # Allowlist enforced at three layers: Pydantic schema (early 422), domain
    # aggregate (canonical invariant), DB CheckConstraint above.
    endpoint_marker_style: Mapped[str | None] = mapped_column(String(16), nullable=True)
    endpoint_marker_custom_dataurl: Mapped[str | None] = mapped_column(Text, nullable=True)
    endpoint_hit_fx: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        server_onupdate=text("CURRENT_TIMESTAMP"),
    )

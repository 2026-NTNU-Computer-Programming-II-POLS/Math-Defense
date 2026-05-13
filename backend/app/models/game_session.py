import uuid
from datetime import datetime, UTC
from sqlalchemy import BigInteger, String, Integer, SmallInteger, Float, Boolean, DateTime, ForeignKey, Index, CheckConstraint, text, Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base
from app.domain.value_objects import SessionStatus
from app.shared_constants import INITIAL_GOLD


class GameSession(Base):
    __tablename__ = "game_sessions"
    __table_args__ = (
        Index("ix_game_session_user_id", "user_id"),
        Index(
            "uq_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        CheckConstraint("star_rating BETWEEN 1 AND 5", name="ck_game_session_star_range"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    # Backlog §23 — set when this session was launched from a challenge deep-link.
    # ON DELETE SET NULL so soft-deleting a challenge doesn't cascade to history.
    challenge_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("challenges.id", ondelete="SET NULL"), nullable=True,
    )
    star_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    path_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    initial_answer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Backlog §20 — slider-fallback / practice mode flag. Server filters these
    # out of the global leaderboard but still awards achievements & talent points.
    practice_mode: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false"),
    )
    status: Mapped[str] = mapped_column(
        SAEnum(SessionStatus, values_callable=lambda e: [m.value for m in e]),
        default=SessionStatus.ACTIVE.value,
    )
    current_wave: Mapped[int] = mapped_column(Integer, default=0)
    gold: Mapped[int] = mapped_column(Integer, default=INITIAL_GOLD)
    hp: Mapped[int] = mapped_column(Integer, default=20)
    score: Mapped[int] = mapped_column(Integer, default=0)
    kills: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    waves_survived: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    kill_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    cost_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    health_origin: Mapped[int | None] = mapped_column(Integer, nullable=True)
    health_final: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_exclude_prepare: Mapped[list | None] = mapped_column(JSON, nullable=True)
    total_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    reflection_text: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    # Backlog §24 — per-session deterministic RNG seed forwarded by the client
    # at session creation. Persisted so the Replay/Spectate playback can rebuild
    # the same mulberry32 stream and re-drive the engine against the stored
    # session_events log. BigInteger because the client emits a 32-bit unsigned
    # value (Date.now() & 0xffffffff in fallback paths) that does not fit in a
    # SQL INTEGER on every backend dialect; nullable for legacy rows and for
    # callers that don't support replay.
    rng_seed: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # 施工計畫書 §3.8 — replay protocol version. 1 = legacy mulberry32+JS Math.*
    # (ε = 0.0005); 2 = PCG64/32 + WASM musl transcendentals (bit-exact). Client
    # tags new sessions v2 when the WASM determinism module loads, otherwise v1.
    replay_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default=text("1"),
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

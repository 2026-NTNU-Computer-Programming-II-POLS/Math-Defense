"""add rng_seed on game_sessions and create session_events table

Revision ID: t4c5d6e7f8a9
Revises: s3b4c5d6e7f8
Create Date: 2026-05-08

Spec: docs/Pedagogical_Backlog_Spec.md §24 (Replay / Spectate Mode).

Two changes land together because §24 is meaningless without both:

* ``game_sessions.rng_seed`` — the per-session deterministic seed forwarded
  by the client at create time. The Replay player feeds this back into the
  engine's mulberry32 stream so re-running the recorded event log produces
  bit-identical (within ε = 0.0005) randomness.

* ``session_events`` — append-only event log written by the recorder while
  the session is active. ``ts`` is monotonic game-time in seconds (NOT
  wall-clock); ``payload`` is the event-bus payload as JSONB. Indexed on
  ``(session_id, seq)`` so a player can stream events in order without an
  ORDER BY scan, and on ``session_id`` alone for the simple "load all
  events for this session" query path.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "t4c5d6e7f8a9"
down_revision = "s3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "game_sessions",
        sa.Column("rng_seed", sa.BigInteger(), nullable=True),
    )

    op.create_table(
        "session_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "session_id",
            sa.String(),
            sa.ForeignKey("game_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Monotonically increasing per-session sequence number. Source of
        # truth for replay ordering — the recorder assigns it client-side so
        # batched POSTs that arrive out of order at the server still replay
        # in the order they fired in the live engine.
        sa.Column("seq", sa.Integer(), nullable=False),
        # Game-time at emission, in seconds. Not wall-clock — the spec's
        # determinism contract requires all time-dependent logic to read
        # game.time, so this is what the EventPlayer schedules events
        # against.
        sa.Column("ts", sa.Float(), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("payload", JSONB(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("session_id", "seq", name="uq_session_event_seq"),
    )
    op.create_index(
        "ix_session_event_session_id",
        "session_events",
        ["session_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_session_event_session_id", table_name="session_events")
    op.drop_table("session_events")
    op.drop_column("game_sessions", "rng_seed")

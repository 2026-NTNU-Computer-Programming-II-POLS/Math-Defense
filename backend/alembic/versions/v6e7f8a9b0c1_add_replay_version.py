"""add replay_version on game_sessions

Revision ID: v6e7f8a9b0c1
Revises: u5d6e7f8a9b0
Create Date: 2026-05-08

施工計畫書 §3.8 — Replay protocol versioning.

Adds a small-int column to ``game_sessions`` so the player UI can branch
between determinism contracts:

* ``replay_version=1`` — legacy: mulberry32 PRNG + JS ``Math.*`` transcendentals.
  Acceptance budget ε = 0.0005 in the final score (cross-browser drift).
* ``replay_version=2`` — Phase 4: PCG64/32 PRNG + WASM-musl transcendentals.
  Bit-exact across every browser that successfully loads the .wasm. The
  player surfaces an explicit error if WASM fails on a v2 replay (no silent
  fallback — we'd produce a wrong answer).

The column defaults to 1 so existing rows and any backend-only-aware client
keep their current acceptance behaviour. New v2 sessions are tagged client-
side at creation time when the WASM determinism module loads successfully.
"""
import sqlalchemy as sa
from alembic import op


revision = "v6e7f8a9b0c1"
down_revision = "u5d6e7f8a9b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "game_sessions",
        sa.Column(
            "replay_version",
            sa.SmallInteger(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )


def downgrade() -> None:
    op.drop_column("game_sessions", "replay_version")

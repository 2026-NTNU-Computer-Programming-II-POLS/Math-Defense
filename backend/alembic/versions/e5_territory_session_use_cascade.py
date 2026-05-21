"""change territory_session_uses.session_id FK to ON DELETE CASCADE

Revision ID: e5_territory_session_use_cascade
Revises: d4_drop_redundant_constraints
Create Date: 2026-05-21

BUG-2026-05-21: GameSession.user_id is ON DELETE CASCADE, so deleting a user
cascades into game_sessions. territory_session_uses.session_id pointed at
game_sessions with ON DELETE RESTRICT (added in y9b0c1d2e3f4), which then
blocked the cascade — deleting any user who had ever captured territory failed
with a foreign-key violation.

RESTRICT was originally chosen to keep replay-prevention records durable, but
that concern only holds while the game_session still exists: once the session
row itself is deleted there is no rng_seed / session_events left to replay, so
the use-record has nothing left to protect. CASCADE both fixes user deletion
and keeps territory_session_uses free of rows pointing at sessions that no
longer exist.
"""
from alembic import op

revision = "e5_territory_session_use_cascade"
down_revision = "d4_drop_redundant_constraints"
branch_labels = None
depends_on = None

_FK = "fk_territory_session_uses_session_id"


def upgrade() -> None:
    op.drop_constraint(_FK, "territory_session_uses", type_="foreignkey")
    op.create_foreign_key(
        _FK,
        "territory_session_uses",
        "game_sessions",
        ["session_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(_FK, "territory_session_uses", type_="foreignkey")
    op.create_foreign_key(
        _FK,
        "territory_session_uses",
        "game_sessions",
        ["session_id"],
        ["id"],
        ondelete="RESTRICT",
    )

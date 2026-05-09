"""leaderboard challenge_id ON DELETE CASCADE (B-BUG-4)

Revision ID: w7f8a9b0c1d2
Revises: v6e7f8a9b0c1
Create Date: 2026-05-09

Audit B-BUG-4: when a challenge was deleted (e.g. cascading from a
soft-deleted teacher), the prior ``ON DELETE SET NULL`` on
``leaderboard_entries.challenge_id`` left the entries in place with a
NULL challenge_id, causing them to fall back into the global / per-level
leaderboard. Those rows ran under challenge-specific wave/score caps and
should not compete with general runs.

Switching to ``ON DELETE CASCADE`` removes the entries together with
their challenge so the global leaderboard stays clean.
"""
import sqlalchemy as sa  # noqa: F401  (kept for parity with sibling revisions)
from alembic import op


revision = "w7f8a9b0c1d2"
down_revision = "v6e7f8a9b0c1"
branch_labels = None
depends_on = None


_FK_NAME = "fk_leaderboard_entries_challenge_id"
_TABLE = "leaderboard_entries"
_REF_TABLE = "challenges"
_LOCAL_COLS = ["challenge_id"]
_REMOTE_COLS = ["id"]


def upgrade() -> None:
    op.drop_constraint(_FK_NAME, _TABLE, type_="foreignkey")
    op.create_foreign_key(
        _FK_NAME,
        _TABLE,
        _REF_TABLE,
        _LOCAL_COLS,
        _REMOTE_COLS,
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(_FK_NAME, _TABLE, type_="foreignkey")
    op.create_foreign_key(
        _FK_NAME,
        _TABLE,
        _REF_TABLE,
        _LOCAL_COLS,
        _REMOTE_COLS,
        ondelete="SET NULL",
    )

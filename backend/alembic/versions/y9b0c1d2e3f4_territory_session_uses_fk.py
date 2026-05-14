"""add FK on territory_session_uses.session_id

Revision ID: y9b0c1d2e3f4
Revises: x8a9b0c1d2e3f
Create Date: 2026-05-15

BD-8: territory_session_uses.session_id had no FK to game_sessions.id, allowing
orphan rows and typo'd session ids to be inserted.  RESTRICT prevents deleting a
game_session whose id appears in territory_session_uses, which is the desired
behaviour — these records must be durable (replay prevention).  CASCADE would
re-open the replay window and SET NULL is impossible because session_id is the PK.
"""
from alembic import op

revision = "y9b0c1d2e3f4"
down_revision = "x8a9b0c1d2e3f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_foreign_key(
        "fk_territory_session_uses_session_id",
        "territory_session_uses",
        "game_sessions",
        ["session_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_territory_session_uses_session_id",
        "territory_session_uses",
        type_="foreignkey",
    )

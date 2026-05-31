"""Recreate talent_allocations, user_achievements, removed_class_memberships

Revision ID: 58cbdc857a81
Revises: m7b8c9d0e1f2
Create Date: 2026-05-02 05:08:09.692425

BD-9: tables were dropped by a prior failed migration and need to be recreated.

Replayability fix: each CREATE is now guarded by an existence check. The
original revision CREATEd all three tables unconditionally, but
`removed_class_memberships` was ALREADY created by an ancestor
(i3d4e5f6a7b8) with a byte-identical definition and is never dropped in the
chain — so `alembic upgrade head` against a fresh DB died with
`DuplicateTable: relation "removed_class_memberships" already exists`. CI never
caught it because the test suite builds schema via Base.metadata.create_all,
not migrations. The guards make this revision a no-op for any table that is
already present and recreate (with the full, correct definition) only those
genuinely missing — so it is correct both on a fresh chain and on the BD-9
incident DBs where the tables really were dropped. It does not mask schema
drift: an existing-but-drifted table is left to the schema-validation tooling,
exactly as before, since the guard keys only on table presence.
"""
from alembic import op
import sqlalchemy as sa

revision = "58cbdc857a81"
down_revision = "m7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    # First created here in the chain — absent on a fresh DB, so this runs.
    if "talent_allocations" not in existing:
        op.create_table(
            "talent_allocations",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("talent_node_id", sa.String(length=100), nullable=False),
            sa.Column("current_level", sa.Integer(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.CheckConstraint("current_level >= 1", name="ck_talent_level_min"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "talent_node_id", name="uq_user_talent_node"),
        )
        op.create_index("ix_talent_allocation_user_id", "talent_allocations", ["user_id"], unique=False)

    # First created here in the chain — absent on a fresh DB, so this runs.
    if "user_achievements" not in existing:
        op.create_table(
            "user_achievements",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("achievement_id", sa.String(length=100), nullable=False),
            sa.Column("talent_points", sa.Integer(), nullable=False),
            sa.Column("unlocked_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),
        )
        op.create_index("ix_user_achievement_user_id", "user_achievements", ["user_id"], unique=False)

    # Already created (identically) by ancestor i3d4e5f6a7b8 and never dropped
    # in the chain — so on a fresh upgrade it exists and this block is skipped.
    # Only the BD-9 incident DBs (where it was dropped out-of-band) hit the
    # create path.
    if "removed_class_memberships" not in existing:
        op.create_table(
            "removed_class_memberships",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("class_id", sa.String(), nullable=False),
            sa.Column("student_id", sa.String(), nullable=False),
            sa.Column("removed_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("class_id", "student_id", name="uq_removed_memberships_class_student"),
        )
        op.create_index("ix_removed_memberships_student_id", "removed_class_memberships", ["student_id"], unique=False)


def downgrade() -> None:
    # talent_allocations + user_achievements are introduced by THIS revision, so
    # they are dropped on downgrade. removed_class_memberships is owned by the
    # ancestor i3d4e5f6a7b8 and must survive a downgrade to m7b8c9d0e1f2 — its
    # own revision's downgrade() is what drops it. (The original code dropped it
    # here too, which would have corrupted the m7b8c9d0e1f2 schema.)
    op.drop_index("ix_user_achievement_user_id", table_name="user_achievements")
    op.drop_table("user_achievements")
    op.drop_index("ix_talent_allocation_user_id", table_name="talent_allocations")
    op.drop_table("talent_allocations")

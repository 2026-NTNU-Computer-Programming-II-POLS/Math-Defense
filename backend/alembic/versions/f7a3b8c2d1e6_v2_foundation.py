"""V2 foundation: roles, classes, email-based auth

Revision ID: f7a3b8c2d1e6
Revises: e5b2c9d4a1f7
Create Date: 2026-04-28 00:00:00.000000

Phase 0: expand users with email/player_name/avatar_url/role;
create classes and class_memberships tables; add join_code to classes.
"""
from alembic import op
import sqlalchemy as sa

revision = "f7a3b8c2d1e6"
down_revision = "e5b2c9d4a1f7"
branch_labels = None
depends_on = None

_role_enum = sa.Enum("admin", "teacher", "student", name="user_role")


def upgrade() -> None:
    _role_enum.create(op.get_bind(), checkfirst=True)

    op.add_column("users", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("player_name", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(500), nullable=True))
    op.add_column(
        "users",
        sa.Column("role", _role_enum, nullable=False, server_default="student"),
    )

    op.execute("UPDATE users SET email = username || '@migrated.local' WHERE email IS NULL")
    op.execute("UPDATE users SET player_name = username WHERE player_name IS NULL")

    op.alter_column("users", "email", nullable=False)
    op.alter_column("users", "player_name", nullable=False)
    op.create_unique_constraint("uq_users_email", "users", ["email"])

    op.alter_column("users", "username", nullable=True)

    op.create_table(
        "classes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("teacher_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("join_code", sa.String(8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_unique_constraint("uq_classes_join_code", "classes", ["join_code"])
    op.create_index("ix_classes_teacher_id", "classes", ["teacher_id"])

    op.create_table(
        "class_memberships",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("class_id", sa.String(), sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_unique_constraint("uq_class_memberships_class_student", "class_memberships", ["class_id", "student_id"])
    op.create_index("ix_class_memberships_student_id", "class_memberships", ["student_id"])


def downgrade() -> None:
    op.drop_table("class_memberships")
    op.drop_table("classes")
    op.alter_column("users", "username", nullable=False)
    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.drop_column("users", "role")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "player_name")
    op.drop_column("users", "email")
    _role_enum.drop(op.get_bind(), checkfirst=True)

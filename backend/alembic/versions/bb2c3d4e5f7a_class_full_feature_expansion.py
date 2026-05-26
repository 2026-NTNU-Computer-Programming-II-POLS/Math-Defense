"""class feature expansion: metadata, archive, co-teachers, groups, invites

Revision ID: bb2c3d4e5f7a
Revises: aa1d2e3f4a6, e5_territory_session_use_cascade
Create Date: 2026-05-26

Adds the surface needed for Tier-C class management:
- classes: description / subject / school_year / capacity / color / icon
- classes.archived_at — nullable timestamp; NULL ⇒ active. Soft-delete flow
  (audit B2/M1/O8 of class-design review).
- class_co_teachers — many-to-many supplement teachers per class.
- class_pending_invites — pre-registration invites that auto-attach on signup.
- class_groups + class_group_members — within-class grouping for activities.

Also merges the two pre-existing heads (aa1d2e3f4a6 from the is_preview
branch and e5_territory_session_use_cascade from the constraint-tightening
branch) — both diverged from z0c1d2e3f4a5 and the project must end up
single-headed.

All new tables FK on classes.id with ondelete=CASCADE so a class delete fans
out cleanly. Membership-level cascades remain unchanged.
"""
import sqlalchemy as sa
from alembic import op


revision = "bb2c3d4e5f7a"
down_revision = ("aa1d2e3f4a6", "e5_territory_session_use_cascade")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. New columns on classes
    op.add_column("classes", sa.Column("description", sa.String(length=500), nullable=True))
    op.add_column("classes", sa.Column("subject", sa.String(length=80), nullable=True))
    op.add_column("classes", sa.Column("school_year", sa.String(length=40), nullable=True))
    op.add_column("classes", sa.Column("capacity", sa.Integer(), nullable=True))
    op.add_column("classes", sa.Column("color", sa.String(length=16), nullable=True))
    op.add_column("classes", sa.Column("icon", sa.String(length=40), nullable=True))
    op.add_column("classes", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_classes_archived_at", "classes", ["archived_at"])
    op.create_check_constraint(
        "ck_classes_capacity_positive", "classes", "capacity IS NULL OR capacity > 0",
    )

    # 2. class_co_teachers
    op.create_table(
        "class_co_teachers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "class_id", sa.String(),
            sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "teacher_id", sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "added_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.UniqueConstraint("class_id", "teacher_id", name="uq_class_co_teachers_class_teacher"),
    )
    op.create_index("ix_class_co_teachers_class_id", "class_co_teachers", ["class_id"])
    op.create_index("ix_class_co_teachers_teacher_id", "class_co_teachers", ["teacher_id"])

    # 3. class_pending_invites
    op.create_table(
        "class_pending_invites",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "class_id", sa.String(),
            sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column(
            "invited_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.UniqueConstraint("class_id", "email", name="uq_class_invites_class_email"),
    )
    op.create_index("ix_class_pending_invites_email", "class_pending_invites", ["email"])

    # 4. class_groups
    op.create_table(
        "class_groups",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "class_id", sa.String(),
            sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("color", sa.String(length=16), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.UniqueConstraint("class_id", "name", name="uq_class_groups_class_name"),
    )
    op.create_index("ix_class_groups_class_id", "class_groups", ["class_id"])

    # 5. class_group_members — a student belongs to at most one group per class.
    # We enforce that with the unique (class_id, student_id) pair; group_id
    # is the actual group they belong to.
    op.create_table(
        "class_group_members",
        sa.Column(
            "group_id", sa.String(),
            sa.ForeignKey("class_groups.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "class_id", sa.String(),
            sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "student_id", sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
        sa.PrimaryKeyConstraint("group_id", "student_id"),
        sa.UniqueConstraint("class_id", "student_id", name="uq_group_members_class_student"),
    )
    op.create_index("ix_group_members_class_id", "class_group_members", ["class_id"])
    op.create_index("ix_group_members_student_id", "class_group_members", ["student_id"])


def downgrade() -> None:
    op.drop_index("ix_group_members_student_id", table_name="class_group_members")
    op.drop_index("ix_group_members_class_id", table_name="class_group_members")
    op.drop_table("class_group_members")

    op.drop_index("ix_class_groups_class_id", table_name="class_groups")
    op.drop_table("class_groups")

    op.drop_index("ix_class_pending_invites_email", table_name="class_pending_invites")
    op.drop_table("class_pending_invites")

    op.drop_index("ix_class_co_teachers_teacher_id", table_name="class_co_teachers")
    op.drop_index("ix_class_co_teachers_class_id", table_name="class_co_teachers")
    op.drop_table("class_co_teachers")

    op.drop_constraint("ck_classes_capacity_positive", "classes", type_="check")
    op.drop_index("ix_classes_archived_at", table_name="classes")
    op.drop_column("classes", "archived_at")
    op.drop_column("classes", "icon")
    op.drop_column("classes", "color")
    op.drop_column("classes", "capacity")
    op.drop_column("classes", "school_year")
    op.drop_column("classes", "subject")
    op.drop_column("classes", "description")

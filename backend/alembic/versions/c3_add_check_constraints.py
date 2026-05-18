"""M-15/M-16/M-17: Add CHECK constraints for domain value bounds

Revision ID: c3_add_check_constraints
Revises: b2_fix_h06_h07_h10
Create Date: 2026-05-18

M-15: score, kills, waves_survived, hp, gold >= 0 on game_sessions.
M-16: alpha > 0, beta > 0 on user_competency_state.
M-17: ia_recent_accuracy BETWEEN 0.0 AND 1.0 on users.
"""
from alembic import op

revision = "c3_add_check_constraints"
down_revision = "b2_fix_h06_h07_h10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_game_session_score_nonneg", "game_sessions", "score >= 0",
    )
    op.create_check_constraint(
        "ck_game_session_kills_nonneg", "game_sessions", "kills >= 0",
    )
    op.create_check_constraint(
        "ck_game_session_waves_nonneg", "game_sessions", "waves_survived >= 0",
    )
    op.create_check_constraint(
        "ck_game_session_hp_nonneg", "game_sessions", "hp >= 0",
    )
    op.create_check_constraint(
        "ck_game_session_gold_nonneg", "game_sessions", "gold >= 0",
    )

    op.create_check_constraint(
        "ck_competency_alpha_positive", "user_competency_state", "alpha > 0",
    )
    op.create_check_constraint(
        "ck_competency_beta_positive", "user_competency_state", "beta > 0",
    )

    op.create_check_constraint(
        "ck_user_ia_accuracy_range", "users", "ia_recent_accuracy BETWEEN 0.0 AND 1.0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_user_ia_accuracy_range", "users", type_="check")
    op.drop_constraint("ck_competency_beta_positive", "user_competency_state", type_="check")
    op.drop_constraint("ck_competency_alpha_positive", "user_competency_state", type_="check")
    op.drop_constraint("ck_game_session_gold_nonneg", "game_sessions", type_="check")
    op.drop_constraint("ck_game_session_hp_nonneg", "game_sessions", type_="check")
    op.drop_constraint("ck_game_session_waves_nonneg", "game_sessions", type_="check")
    op.drop_constraint("ck_game_session_kills_nonneg", "game_sessions", type_="check")
    op.drop_constraint("ck_game_session_score_nonneg", "game_sessions", type_="check")

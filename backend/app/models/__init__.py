# Eager-import every ORM model so SQLAlchemy's declarative metadata is fully
# populated by the time test fixtures call Base.metadata.create_all (production
# uses Alembic and is unaffected). Without this, models only imported on first
# request (e.g. audit_log) are missing from the metadata snapshot and their
# tables never get created in the test DB.
from . import (  # noqa: F401
    achievement,
    audit_log,
    challenge,
    class_,
    class_co_teacher,
    class_group,
    class_membership,
    class_pending_invite,
    competency_state,
    denied_token,
    email_verification_token,
    game_session,
    leaderboard,
    login_attempt,
    refresh_token,
    removed_class_membership,
    season,
    session_event,
    study,
    talent,
    territory,
    user,
)

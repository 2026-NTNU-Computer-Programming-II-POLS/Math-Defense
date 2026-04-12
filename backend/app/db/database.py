import os
from urllib.parse import urlparse

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

_is_sqlite = "sqlite" in settings.database_url


def _ensure_sqlite_dir(url: str) -> None:
    """SQLite does not create parent directories; ensure they exist before connecting."""
    # sqlite:///./data/math_defense.db  or  sqlite:////abs/path/math_defense.db
    parsed = urlparse(url)
    path = parsed.path.lstrip("/") if not parsed.path.startswith("//") else parsed.path
    if not path or path == ":memory:":
        return
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


if _is_sqlite:
    _ensure_sqlite_dir(settings.database_url)

# SQLite implements SERIALIZABLE by serialising writers; under wave-end PATCH load that
# produces "database is locked" errors. The unique partial index + UoW already enforce
# the cross-session invariants we care about, so default isolation is enough.
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    isolation_level=None if _is_sqlite else "READ COMMITTED",
)

if _is_sqlite:
    # SQLite ignores FK constraints unless PRAGMA foreign_keys=ON is issued per connection.
    @event.listens_for(engine, "connect")
    def _enable_sqlite_fk(dbapi_conn, _conn_record):
        cursor = dbapi_conn.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    from app.models import user, leaderboard, game_session  # noqa: F401
    Base.metadata.create_all(bind=engine)

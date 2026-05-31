from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

# M-13: runtime queries use the least-privilege app role when DATABASE_URL_APP
# is set; otherwise fall back to the admin DATABASE_URL. Alembic migrations
# always run as the admin role (alembic/env.py reads settings.database_url) —
# only this runtime engine honours the override, so DDL keeps its DDL rights
# while day-to-day reads/writes can be scoped to DML-only.
_runtime_database_url = settings.database_url_app or settings.database_url

engine = create_engine(
    _runtime_database_url,
    isolation_level="READ COMMITTED",
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_recycle=settings.db_pool_recycle,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    # B-BUG-9: no auto-commit on yield exit. All writes go through UoW; an
    # auto-commit here would race the UoW pattern and flush mid-state work
    # that a route deliberately did not commit. Rollback any uncommitted
    # state so a half-built transaction never escapes.
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    else:
        db.rollback()
    finally:
        db.close()

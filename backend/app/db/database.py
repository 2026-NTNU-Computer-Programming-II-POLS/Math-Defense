from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

engine = create_engine(
    settings.database_url,
    isolation_level="READ COMMITTED",
    pool_size=10,
    max_overflow=20,
    pool_recycle=3600,
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

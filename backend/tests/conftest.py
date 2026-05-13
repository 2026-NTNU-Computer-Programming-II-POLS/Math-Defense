"""Test fixtures backed by a real PostgreSQL test database.

The suite now runs against PG (not in-memory SQLite) so that behaviour that
silently differs — `with_for_update`, partial indexes scoped by ENUM values,
`timestamp with time zone` columns, FK enforcement — is actually exercised.

Resolving the test DB URL:
  - If `TEST_DATABASE_URL` is set, use it verbatim (CI sets this explicitly).
  - Otherwise, append `_test` to the database name of `settings.database_url`
    so local dev doesn't clobber the primary DB.

The test DB is created on first use against the `postgres` admin DB. The
POSTGRES_USER created by the official image has CREATEDB (it is a superuser),
so no extra privilege setup is needed.
"""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.db.database import Base, get_db
from app.limiter import limiter
from app.main import app


def _resolve_test_db_url() -> str:
    explicit = os.environ.get("TEST_DATABASE_URL")
    if explicit:
        return explicit
    base_url, sep, dbname = settings.database_url.rpartition("/")
    if not sep or not dbname:
        raise RuntimeError(
            f"Cannot derive test DB URL from {settings.database_url!r}. "
            "Set TEST_DATABASE_URL explicitly."
        )
    return f"{base_url}/{dbname}_test"


TEST_DB_URL = _resolve_test_db_url()


def _ensure_test_database() -> None:
    """Create the test database if it doesn't already exist. Idempotent."""
    base_url, _, target_db = TEST_DB_URL.rpartition("/")
    admin_engine = create_engine(f"{base_url}/postgres", isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as conn:
            exists = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": target_db},
            ).first()
            if exists is None:
                # Identifier is safe: derived from our own DATABASE_URL config,
                # not user input. Quoting defends against DB names with hyphens.
                conn.execute(text(f'CREATE DATABASE "{target_db}"'))
    finally:
        admin_engine.dispose()


@pytest.fixture(scope="session")
def engine():
    _ensure_test_database()
    eng = create_engine(TEST_DB_URL, isolation_level="READ COMMITTED")
    # Clean slate in case a previous aborted run left state behind.
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


def _truncate_all(eng) -> None:
    names = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    if not names:
        return
    with eng.begin() as conn:
        # RESTART IDENTITY resets any sequences; CASCADE handles FK order.
        conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))


@pytest.fixture
def session_factory(engine):
    """Per-test session factory bound to a freshly-truncated PG test DB."""
    _truncate_all(engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture
def client(session_factory):
    def override_get_db():
        db = session_factory()
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    limiter.enabled = False
    yield TestClient(app)
    limiter.enabled = True
    app.dependency_overrides.clear()


@pytest.fixture
def db_session(session_factory):
    """Raw DB session for tests that bypass the HTTP layer."""
    db = session_factory()
    try:
        yield db
    finally:
        db.close()

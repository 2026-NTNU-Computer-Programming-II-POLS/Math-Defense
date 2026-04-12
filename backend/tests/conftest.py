import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.db.database import Base, get_db
from app.limiter import limiter


@pytest.fixture
def client():
    # StaticPool forces all connections to share a single in-memory DB
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    limiter.enabled = False
    yield TestClient(app)
    limiter.enabled = True
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)

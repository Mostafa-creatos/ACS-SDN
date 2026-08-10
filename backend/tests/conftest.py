"""Shared pytest infrastructure for the SDN controller backend test suite.

Provides:
- A dedicated SQLite database for tests (self-contained, isolated from the
  development database used by the running application).
- Automatic schema creation (models + hand-rolled column migrations) so every
  TestClient request resolves against the test database.
- A `db_session` fixture and per-test table cleanup for isolation.
- Registration of the `e2e` marker (integration tests requiring the live lab).
"""

import os
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.db import Base, get_db
from app.main import app, migrate_db_columns

TEST_DB_URL = "sqlite:///./test_sdn_refactor.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "e2e: end-to-end integration test requiring the live lab/container stack",
    )


@pytest.fixture(scope="session", autouse=True)
def _shared_test_database():
    """Create the test schema once and route every app DB dependency to it."""
    Base.metadata.create_all(bind=engine)
    migrate_db_columns(engine)

    def _override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("test_sdn_refactor.db"):
        try:
            os.remove("test_sdn_refactor.db")
        except OSError:
            pass


@pytest.fixture(autouse=True)
def _clean_database():
    """Empty all tables after each test to guarantee isolation."""
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


class _FakeAsyncResult:
    """Minimal stand-in for a Celery AsyncResult used by task `.delay()` calls."""

    def __init__(self):
        self.id = "00000000-0000-0000-0000-000000000000"
        self.task_id = self.id
        self.state = "PENDING"
        self.status = "PENDING"

    def get(self, timeout=None):
        return None


@pytest.fixture(autouse=True)
def _mock_celery_dispatch(monkeypatch):
    """Never enqueue real Celery tasks during unit tests (no broker needed).

    Replaces `delay`/`apply_async` on the Celery Task base class so any
    endpoint that fires-and-forgets a background job returns a fake result
    instead of blocking on a Redis/broker connection. Tests that specifically
    assert on `.delay` arguments apply their own narrower `patch`.
    """
    from celery import Task

    monkeypatch.setattr(
        Task, "delay", lambda self, *args, **kwargs: _FakeAsyncResult()
    )
    monkeypatch.setattr(
        Task, "apply_async", lambda self, *args, **kwargs: _FakeAsyncResult()
    )


@pytest.fixture
def db_session():
    """A transactional session bound to the shared test database."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="session")
def client():
    """A TestClient wired to the shared test database."""
    return TestClient(app)

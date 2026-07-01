from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

# Attempt to connect to PostgreSQL. If it fails, fallback to local SQLite for offline testing.
try:
    # Use a short timeout of 2 seconds to avoid freezing the startup loop
    connect_args = {"connect_timeout": 2} if "postgresql" in settings.DATABASE_URL else {}
    engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
    # Test connection
    with engine.connect() as conn:
        pass
    print("[SDN DATABASE] Connected to PostgreSQL clustered backend.")
except Exception:
    print("[SDN DATABASE] PostgreSQL offline. Falling back to local development SQLite (sdn_dev.db).")
    SQLALCHEMY_DATABASE_URL = "sqlite:///./sdn_dev.db"
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """
    FastAPI dependency that provides a transactional database session context.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

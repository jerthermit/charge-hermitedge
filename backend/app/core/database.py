from __future__ import annotations

from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings


def _is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")


def _engine_kwargs(url: str) -> dict[str, Any]:
    """Return connection settings for the configured database."""
    base: dict[str, Any] = {"pool_pre_ping": True}

    if _is_sqlite(url):
        base["connect_args"] = {"check_same_thread": False}
    else:
        base.update(
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=1800,
        )
        base["connect_args"] = {
            "connect_timeout": 10,
            "options": "-c statement_timeout=30000",
            "sslmode": "prefer",
        }

    return base


SQLALCHEMY_DATABASE_URL = settings.DATABASE_URI

engine: Engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    **_engine_kwargs(SQLALCHEMY_DATABASE_URL),
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

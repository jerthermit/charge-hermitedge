from __future__ import annotations

import logging
import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.auth.api import router as auth_router
from app.charging.api import router as charging_router
from app.core.config import settings
from app.core.database import Base, engine, get_db


logging.basicConfig(
    level=logging.INFO,
    format=(
        "%(asctime)s %(levelname)s "
        "%(name)s: %(message)s"
    ),
)

logger = logging.getLogger(__name__)


def _cors_options() -> dict[str, object]:
    origins = settings.BACKEND_CORS_ORIGINS

    if isinstance(origins, str):
        origins = [
            origin.strip()
            for origin in origins.split(",")
            if origin.strip()
        ]

    allow_all = "*" in origins

    return {
        "allow_origins": (
            ["*"] if allow_all else origins
        ),
        "allow_credentials": not allow_all,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }


if settings.ENV in {"development", "test"}:
    Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="Charge API",
    version=settings.VERSION,
    openapi_url=(
        f"{settings.API_V1_STR}/openapi.json"
    ),
    docs_url=(
        f"{settings.API_V1_STR}/docs"
        if settings.ENV != "production"
        else None
    ),
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    **_cors_options(),
)

app.include_router(
    auth_router,
    prefix=settings.API_V1_STR,
)

app.include_router(
    charging_router,
    prefix=settings.API_V1_STR,
)


@app.get("/", include_in_schema=False)
def read_root():
    return {
        "name": "Charge API",
        "version": settings.VERSION,
    }


@app.get("/healthz", include_in_schema=False)
def healthcheck():
    return {"status": "ok"}


@app.get("/readyz", include_in_schema=False)
def readiness_check(
    db: Session = Depends(get_db),
):
    db.execute(text("SELECT 1"))
    return {"status": "ready"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )
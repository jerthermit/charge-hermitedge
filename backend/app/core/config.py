from __future__ import annotations

import logging
import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

DEFAULT_SECRET_KEY = "CHANGE_THIS_IN_PRODUCTION_USE_STRONG_32_CHAR_KEY"


class Settings(BaseSettings):
    PROJECT_NAME: str = "Charge API"
    VERSION: str = "0.2.0"
    API_V1_STR: str = "/api/v1"

    ENV: Literal["development", "staging", "production", "test"] = "development"

    TOGETHER_API_KEY: str | None = None
    TOGETHER_MODEL: str = "Qwen/Qwen3.5-9B"
    AI_REQUEST_TIMEOUT_MS: int = 15_000

    SECRET_KEY: str = DEFAULT_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8

    DEMO_AUTH_ENABLED: bool = False
    DEMO_USER_EMAIL: str = "demo.driver@hermitedge.dev"
    DEMO_OWNER_EMAIL: str = "demo.owner@hermitedge.dev"
    DEMO_SESSION_TTL_MINUTES: int = 30

    DATABASE_URL: str | None = None
    DATABASE_URI: str | None = None

    SQLITE_FILE: str = "local.db"

    ALLOWED_ORIGINS: str | None = None
    BACKEND_CORS_ORIGINS: list[str] = Field(default_factory=list)

    model_config = SettingsConfigDict(
        case_sensitive=True,
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    @field_validator("AI_REQUEST_TIMEOUT_MS")
    @classmethod
    def validate_ai_timeout(cls, value: int) -> int:
        return max(1_000, min(value, 60_000))

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, value: str, info) -> str:
        if not value:
            raise ValueError("SECRET_KEY cannot be empty")

        insecure_keys = {
            DEFAULT_SECRET_KEY,
            "your_32_character_secret_key_for_jwt_signing",
            "secret",
            "key",
            "password",
            "123456",
        }

        environment = info.data.get("ENV")

        if value in insecure_keys:
            if environment == "production":
                raise ValueError(
                    "SECRET_KEY must be replaced with a secure value in production"
                )

            logger.warning(
                "Using the local default SECRET_KEY. Replace it before deployment."
            )

        if environment == "production" and len(value) < 32:
            raise ValueError(
                "SECRET_KEY must contain at least 32 characters in production"
            )

        return value

    @field_validator("DEMO_SESSION_TTL_MINUTES")
    @classmethod
    def validate_demo_session_ttl(cls, value: int) -> int:
        if not 5 <= value <= 60:
            raise ValueError(
                "DEMO_SESSION_TTL_MINUTES must be between 5 and 60"
            )

        return value

    @field_validator("ALLOWED_ORIGINS")
    @classmethod
    def validate_allowed_origins(cls, value: str | None, info) -> str | None:
        if (
            info.data.get("ENV") == "production"
            and value
            and "*" in value
        ):
            raise ValueError(
                "Wildcard CORS origins are not allowed in production"
            )

        return value


def _compute_cors_origins(settings: Settings) -> list[str]:
    configured_origins = [
        origin.strip()
        for origin in (settings.ALLOWED_ORIGINS or "").split(",")
        if origin.strip()
    ]

    if settings.ENV == "production":
        return configured_origins

    local_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    return list(dict.fromkeys([*configured_origins, *local_origins]))


def _normalize_database_url(database_url: str) -> str:
    if database_url.startswith("postgres://"):
        return database_url.replace(
            "postgres://",
            "postgresql+psycopg2://",
            1,
        )

    if database_url.startswith("postgresql://"):
        return database_url.replace(
            "postgresql://",
            "postgresql+psycopg2://",
            1,
        )

    return database_url


def _build_database_uri(settings: Settings) -> str:
    if settings.DATABASE_URL:
        return _normalize_database_url(settings.DATABASE_URL)

    use_sqlite = os.getenv("USE_SQLITE", "").lower() in {
        "true",
        "1",
        "yes",
    }

    if use_sqlite:
        sqlite_path = Path(
            os.getenv("SQLITE_DIR", ".")
        ).joinpath(settings.SQLITE_FILE)

        return f"sqlite:///{sqlite_path.as_posix()}"

    sqlite_path = Path(
        os.getenv("SQLITE_DIR", ".")
    ).joinpath(settings.SQLITE_FILE)

    return f"sqlite:///{sqlite_path.as_posix()}"


def validate_production_config(settings: Settings) -> None:
    if settings.ENV != "production":
        return

    errors: list[str] = []

    if settings.SECRET_KEY == DEFAULT_SECRET_KEY:
        errors.append(
            "SECRET_KEY must be replaced before deployment"
        )

    if len(settings.SECRET_KEY) < 32:
        errors.append(
            "SECRET_KEY must contain at least 32 characters"
        )

    if not settings.DATABASE_URL:
        errors.append(
            "DATABASE_URL is required in production"
        )
    elif settings.DATABASE_URL.startswith("sqlite"):
        errors.append(
            "SQLite is not supported in production"
        )

    if not settings.ALLOWED_ORIGINS:
        errors.append(
            "ALLOWED_ORIGINS is required in production"
        )
    elif "*" in settings.ALLOWED_ORIGINS:
        errors.append(
            "Wildcard CORS origins are not allowed in production"
        )

    if not errors:
        return

    logger.error("Production configuration is invalid:")

    for error in errors:
        logger.error("  - %s", error)

    sys.exit(1)


@lru_cache
def get_settings() -> Settings:
    try:
        settings = Settings()

        if not settings.BACKEND_CORS_ORIGINS:
            settings.BACKEND_CORS_ORIGINS = (
                _compute_cors_origins(settings)
            )

        settings.DATABASE_URI = _build_database_uri(settings)

        validate_production_config(settings)

        return settings
    except ValidationError as error:
        logger.error(
            "Configuration validation failed: %s",
            error,
        )

        if os.getenv("ENV") == "production":
            sys.exit(1)

        raise


settings = get_settings()

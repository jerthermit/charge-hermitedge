from __future__ import annotations

import logging
import secrets

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.charging.seed import seed_recording_workspace
from app.core import security
from app.core.config import settings

from . import models, schemas, service

logger = logging.getLogger(__name__)

DEMO_DRIVER_NAME = "Sam Rivera"
DEMO_OWNER_NAME = "Nina Lim"


def _validate_demo_user(user: models.User) -> None:
    if (
        not user.is_demo
        or user.is_superuser
        or not user.is_active
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Demo access is unavailable.",
        )


def _get_or_create_demo_principal(
    db: Session,
    *,
    email: str,
    full_name: str,
) -> models.User:
    existing = service.get_user_by_email(db, email)

    if existing is not None:
        _validate_demo_user(existing)

        if existing.full_name != full_name:
            existing.full_name = full_name
            db.commit()
            db.refresh(existing)

        return existing

    user = models.User(
        email=email,
        full_name=full_name,
        hashed_password=security.get_password_hash(
            secrets.token_urlsafe(48)
        ),
        is_active=True,
        is_superuser=False,
        is_demo=True,
    )
    db.add(user)

    try:
        db.commit()
        db.refresh(user)
        return user
    except IntegrityError:
        db.rollback()
        existing = service.get_user_by_email(db, email)

        if existing is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Demo access is unavailable.",
            )

        _validate_demo_user(existing)
        return existing


def get_or_create_demo_user(
    db: Session,
    persona: schemas.DemoPersona,
) -> models.User:
    if not settings.DEMO_AUTH_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )

    driver = _get_or_create_demo_principal(
        db,
        email=settings.DEMO_USER_EMAIL,
        full_name=DEMO_DRIVER_NAME,
    )
    owner = _get_or_create_demo_principal(
        db,
        email=settings.DEMO_OWNER_EMAIL,
        full_name=DEMO_OWNER_NAME,
    )

    try:
        seed_recording_workspace(
            db,
            driver_user_id=driver.id,
            owner_user_id=owner.id,
        )
        selected = owner if persona == "owner" else driver
        db.refresh(selected)
        return selected
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("Charge demo initialization failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The Charge demo is temporarily unavailable.",
        ) from exc

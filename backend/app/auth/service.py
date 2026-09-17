from datetime import timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.auth import models, schemas


def get_user(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email).first()


def create_user(db: Session, user: schemas.UserCreate) -> models.User:
    hashed_password = security.get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def update_user(
    db: Session, db_user: models.User, user_update: schemas.UserUpdate
) -> models.User:
    update_data = user_update.model_dump(exclude_unset=True)

    if "password" in update_data:
        hashed_password = security.get_password_hash(update_data["password"])
        del update_data["password"]
        update_data["hashed_password"] = hashed_password

    for field, value in update_data.items():
        setattr(db_user, field, value)

    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def authenticate_user(db: Session, email: str, password: str) -> Optional[models.User]:
    user = get_user_by_email(db, email=email)
    if not user:
        return None
    if not security.verify_password(password, user.hashed_password):
        return None
    return user


def create_access_token_for_user(user: models.User) -> str:
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return security.create_access_token(
        subject=user.email, expires_delta=access_token_expires
    )


def create_demo_access_token(user: models.User) -> str:
    access_token_expires = timedelta(minutes=settings.DEMO_SESSION_TTL_MINUTES)
    return security.create_access_token(
        subject=user.email, expires_delta=access_token_expires
    )

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Literal, Optional
from datetime import datetime

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    email: Optional[str] = None

DemoPersona = Literal["driver", "owner"]


class DemoSessionCreate(BaseModel):
    persona: DemoPersona = "driver"


class DemoCapabilities(BaseModel):
    enabled: bool
    personas: list[DemoPersona] = Field(default_factory=list)

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str = Field(..., min_length=6, max_length=100)

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=6, max_length=100)
    is_active: Optional[bool] = None

class UserInDB(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    is_superuser: bool
    is_demo: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

from pydantic import BaseModel, EmailStr
from app.models.user import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: UserRole = UserRole.SCORE_KEEPER
    organization_id: str | None = None
    assigned_tournament_ids: list[str] = []
    assigned_age_group_ids: list[str] = []


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    role: UserRole | None = None
    organization_id: str | None = None
    is_active: bool | None = None
    assigned_tournament_ids: list[str] | None = None
    assigned_age_group_ids: list[str] | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    role: UserRole
    organization_id: str | None
    is_active: bool
    security_questions_configured: bool = False
    assigned_tournament_ids: list[str] = []
    assigned_age_group_ids: list[str] = []

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordReset(BaseModel):
    password: str


class PasswordResetConfirm(BaseModel):
    token: str
    password: str

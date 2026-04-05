from __future__ import annotations

from pydantic import BaseModel, Field


class AuthUserResponse(BaseModel):
    id: str
    email: str
    display_name: str | None = None
    created_at: str
    email_verified: bool = False


class AuthSessionResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: int


class AuthResponse(BaseModel):
    user: AuthUserResponse
    session: AuthSessionResponse | None = None
    requires_email_verification: bool = False


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=16)


class ResendVerificationRequest(BaseModel):
    email: str = Field(min_length=3)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=8)
    display_name: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=16)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=16)

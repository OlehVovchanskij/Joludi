from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from services.auth import (
    authenticate_user,
    get_current_user_from_token,
    logout_session,
    refresh_session,
    resend_verification_email,
    register_user,
    verify_email_token,
)


router = APIRouter(tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


class AuthUserResponse(BaseModel):
    id: str
    email: str
    display_name: str | None = None
    created_at: str


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


def _to_user_response(user: dict) -> AuthUserResponse:
    return AuthUserResponse(**user)


def _to_auth_response(result: dict) -> AuthResponse:
    return AuthResponse(
        user=_to_user_response(result["user"]),
        session=(
            AuthSessionResponse(**result["session"])
            if result.get("session") is not None
            else None
        ),
        requires_email_verification=bool(
            result.get("requires_email_verification", False)),
    )


@router.post("/auth/register", response_model=AuthResponse)
def register(payload: RegisterRequest) -> AuthResponse:
    try:
        result = register_user(
            payload.email, payload.password, payload.display_name)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _to_auth_response(result)


@router.post("/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest) -> AuthResponse:
    try:
        result = authenticate_user(payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return _to_auth_response(result)


@router.post("/auth/refresh", response_model=AuthResponse)
def refresh(payload: RefreshRequest) -> AuthResponse:
    try:
        result = refresh_session(payload.refresh_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return _to_auth_response(result)


@router.post("/auth/logout")
def logout(payload: LogoutRequest) -> dict[str, str]:
    try:
        logout_session(payload.refresh_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    return {"status": "logged_out"}


@router.post("/auth/verify-email", response_model=AuthResponse)
def verify_email(payload: VerifyEmailRequest) -> AuthResponse:
    try:
        result = verify_email_token(payload.token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _to_auth_response(result)


@router.post("/auth/resend-verification")
def resend_verification(payload: ResendVerificationRequest) -> dict[str, str]:
    try:
        return resend_verification_email(payload.email)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/auth/me", response_model=AuthUserResponse)
def me(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> AuthUserResponse:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = get_current_user_from_token(credentials.credentials)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _to_user_response(user)

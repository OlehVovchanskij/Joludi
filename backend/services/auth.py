from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from functools import lru_cache

from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session

from models.auth import AuthSession, AuthUser


DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

PASSWORD_ITERATIONS = 210_000
ACCESS_TOKEN_TTL_SECONDS = 60 * 60
REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
EMAIL_VERIFICATION_TOKEN_TTL_MINUTES = int(
    os.getenv("EMAIL_VERIFICATION_TOKEN_TTL_MINUTES", "1440"))


def _env_bool(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USER)
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Joludi")
SMTP_USE_TLS = _env_bool("SMTP_USE_TLS", False)
SMTP_USE_SSL = _env_bool("SMTP_USE_SSL", True)
SMTP_PORT = int(os.getenv("SMTP_PORT", "465" if SMTP_USE_SSL else "587"))
APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "http://localhost:3000")
logger = logging.getLogger(__name__)


class EmailDeliveryError(Exception):
    """Raised when verification email cannot be delivered."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _from_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@lru_cache(maxsize=1)
def _engine():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured")
    return create_engine(DATABASE_URL, pool_pre_ping=True)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
        raise ValueError("Invalid email address")
    return normalized


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt_bytes = salt or secrets.token_bytes(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt_bytes,
        PASSWORD_ITERATIONS,
    )
    return "pbkdf2_sha256${}${}${}".format(
        PASSWORD_ITERATIONS,
        base64.urlsafe_b64encode(salt_bytes).decode("ascii"),
        base64.urlsafe_b64encode(password_hash).decode("ascii"),
    )


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, hash_text = stored_hash.split(
            "$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected_hash = base64.urlsafe_b64decode(hash_text.encode("ascii"))
    except (ValueError, TypeError, base64.binascii.Error):
        return False

    derived_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return secrets.compare_digest(derived_hash, expected_hash)


def _public_user(user: AuthUser) -> dict[str, object]:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "created_at": _to_iso(_as_utc(user.created_at)),
        "email_verified": user.email_verified,
    }


def _new_session(user_id: str) -> AuthSession:
    now = _now()
    return AuthSession(
        user_id=user_id,
        access_token=secrets.token_urlsafe(32),
        refresh_token=secrets.token_urlsafe(48),
        access_expires_at=now + timedelta(seconds=ACCESS_TOKEN_TTL_SECONDS),
        refresh_expires_at=now + timedelta(seconds=REFRESH_TOKEN_TTL_SECONDS),
        created_at=now,
    )


def _verification_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _verification_expires_at() -> datetime:
    return _now() + timedelta(minutes=EMAIL_VERIFICATION_TOKEN_TTL_MINUTES)


def _issue_email_verification(user: AuthUser) -> str:
    token = secrets.token_urlsafe(32)
    user.email_verification_token_hash = _verification_token_hash(token)
    user.email_verification_expires_at = _verification_expires_at()
    return token


def _send_verification_email(email: str, token: str, display_name: str | None = None) -> None:
    if not SMTP_HOST or not SMTP_FROM_EMAIL:
        return

    verification_link = f"{APP_PUBLIC_URL.rstrip('/')}/verify-email?token={token}"
    message = EmailMessage()
    message["Subject"] = "Підтвердіть пошту"
    message["From"] = f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
    message["To"] = email

    greeting = f"Привіт, {display_name}!" if display_name else "Привіт!"
    message.set_content(
        "\n".join(
            [
                greeting,
                "",
                "Підтвердіть вашу пошту, натиснувши на посилання нижче:",
                verification_link,
                "",
                "Якщо ви не реєструвалися, просто ігноруйте цей лист.",
            ]
        )
    )

    try:
        if SMTP_USE_SSL:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context, timeout=15) as client:
                if SMTP_USER:
                    client.login(SMTP_USER, SMTP_PASSWORD)
                client.send_message(message)
            return

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as client:
            if SMTP_USE_TLS:
                client.starttls(context=ssl.create_default_context())
            if SMTP_USER:
                client.login(SMTP_USER, SMTP_PASSWORD)
            client.send_message(message)
    except (OSError, smtplib.SMTPException, TimeoutError) as exc:
        logger.exception("Failed to send verification email to %s", email)
        raise EmailDeliveryError(
            "Unable to send verification email right now"
        ) from exc


def _session_response(session: AuthSession) -> dict[str, object]:
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_TTL_SECONDS,
        "refresh_expires_in": REFRESH_TOKEN_TTL_SECONDS,
    }


def _session_is_active(session: AuthSession) -> bool:
    return _as_utc(session.access_expires_at) > _now()


def _refresh_is_active(session: AuthSession) -> bool:
    return _as_utc(session.refresh_expires_at) > _now()


def register_user(email: str, password: str, display_name: str | None = None) -> dict[str, object]:
    normalized_email = _normalize_email(email)
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")

    with Session(_engine()) as session:
        existing = session.execute(
            select(AuthUser).where(AuthUser.email == normalized_email)
        ).scalar_one_or_none()
        if existing is not None:
            raise ValueError("User already exists")

        user = AuthUser(
            id=secrets.token_hex(16),
            email=normalized_email,
            display_name=display_name.strip() if display_name else None,
            password_hash=_hash_password(password),
            created_at=_now(),
            email_verified=False,
            email_verification_token_hash=None,
            email_verification_expires_at=None,
        )
        verification_token = _issue_email_verification(user)
        session.add(user)
        session.flush()

        user_response = _public_user(user)
        session.commit()

    _send_verification_email(
        normalized_email, verification_token, display_name)

    return {
        "user": user_response,
        "session": None,
        "requires_email_verification": True,
    }


def authenticate_user(email: str, password: str) -> dict[str, object]:
    normalized_email = _normalize_email(email)

    with Session(_engine()) as session:
        user = session.execute(
            select(AuthUser).where(AuthUser.email == normalized_email)
        ).scalar_one_or_none()
        if user is None or not _verify_password(password, user.password_hash):
            raise ValueError("Invalid email or password")

        if not user.email_verified:
            raise ValueError("Email is not verified")

        auth_session = _new_session(user.id)
        session.add(auth_session)
        user_response = _public_user(user)
        session_resp = _session_response(auth_session)
        session.commit()

    return {"user": user_response, "session": session_resp}


def refresh_session(refresh_token: str) -> dict[str, object]:
    with Session(_engine()) as session:
        current_session = session.execute(
            select(AuthSession).where(
                AuthSession.refresh_token == refresh_token)
        ).scalar_one_or_none()
        if current_session is None or not _refresh_is_active(current_session):
            raise ValueError("Invalid or expired refresh token")

        user = session.execute(
            select(AuthUser).where(AuthUser.id == current_session.user_id)
        ).scalar_one_or_none()
        if user is None:
            raise ValueError("User not found")

        session.delete(current_session)
        new_session = _new_session(user.id)
        session.add(new_session)
        user_response = _public_user(user)
        session_resp = _session_response(new_session)
        session.commit()

    return {"user": user_response, "session": session_resp}


def logout_session(refresh_token: str) -> None:
    with Session(_engine()) as session:
        result = session.execute(
            delete(AuthSession).where(
                AuthSession.refresh_token == refresh_token)
        )
        if result.rowcount == 0:
            raise ValueError("Invalid refresh token")
        session.commit()


def get_current_user_from_token(access_token: str) -> dict[str, object] | None:
    with Session(_engine()) as session:
        auth_session = session.execute(
            select(AuthSession).where(AuthSession.access_token == access_token)
        ).scalar_one_or_none()
        if auth_session is None or not _session_is_active(auth_session):
            return None

        user = session.execute(
            select(AuthUser).where(AuthUser.id == auth_session.user_id)
        ).scalar_one_or_none()
        if user is None:
            return None

        return _public_user(user)


def verify_email_token(token: str) -> dict[str, object]:
    token_hash = _verification_token_hash(token)

    with Session(_engine()) as session:
        user = session.execute(
            select(AuthUser).where(
                AuthUser.email_verification_token_hash == token_hash)
        ).scalar_one_or_none()
        if user is None:
            raise ValueError("Invalid verification token")

        expires_at = user.email_verification_expires_at
        if not expires_at or _as_utc(expires_at) <= _now():
            raise ValueError("Verification token expired")

        user.email_verified = True
        user.email_verification_token_hash = None
        user.email_verification_expires_at = None
        auth_session = _new_session(user.id)
        session.add(auth_session)
        user_response = _public_user(user)
        session_resp = _session_response(auth_session)
        session.commit()

    return {"user": user_response, "session": session_resp}


def resend_verification_email(email: str) -> dict[str, str]:
    normalized_email = _normalize_email(email)

    with Session(_engine()) as session:
        user = session.execute(
            select(AuthUser).where(AuthUser.email == normalized_email)
        ).scalar_one_or_none()
        if user is None:
            raise ValueError("User not found")
        if user.email_verified:
            raise ValueError("Email already verified")

        verification_token = _issue_email_verification(user)
        display_name_to_send = user.display_name
        session.commit()

    _send_verification_email(
        normalized_email, verification_token, display_name_to_send)
    return {"status": "verification_sent"}

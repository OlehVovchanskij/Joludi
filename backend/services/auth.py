from __future__ import annotations

import base64
import hashlib
import hashlib
import json
import os
import secrets
import smtplib
import threading
import ssl
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from email.message import EmailMessage


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
STORE_PATH = DATA_DIR / "auth_store.json"
STORE_LOCK = threading.Lock()

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
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USER)
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Joludi")
SMTP_USE_TLS = _env_bool("SMTP_USE_TLS", True)
SMTP_USE_SSL = _env_bool("SMTP_USE_SSL", False)
APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "http://localhost:3000")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _from_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _default_store() -> dict[str, list[dict[str, Any]]]:
    return {"users": [], "sessions": []}


def _ensure_store() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not STORE_PATH.exists():
        _save_store(_default_store())


def _load_store() -> dict[str, list[dict[str, Any]]]:
    _ensure_store()
    try:
        with STORE_PATH.open("r", encoding="utf-8") as handle:
            store = json.load(handle)
    except json.JSONDecodeError:
        store = _default_store()

    store.setdefault("users", [])
    store.setdefault("sessions", [])
    return store


def _save_store(store: dict[str, list[dict[str, Any]]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = STORE_PATH.with_suffix(".tmp")
    with temp_path.open("w", encoding="utf-8") as handle:
        json.dump(store, handle, ensure_ascii=True, indent=2)
    temp_path.replace(STORE_PATH)


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


def _public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user["id"],
        "email": user["email"],
        "display_name": user.get("display_name"),
        "created_at": user["created_at"],
        "email_verified": user.get("email_verified", False),
    }


def _new_session(user_id: str) -> dict[str, Any]:
    now = _now()
    return {
        "user_id": user_id,
        "access_token": secrets.token_urlsafe(32),
        "refresh_token": secrets.token_urlsafe(48),
        "access_expires_at": _to_iso(now + timedelta(seconds=ACCESS_TOKEN_TTL_SECONDS)),
        "refresh_expires_at": _to_iso(now + timedelta(seconds=REFRESH_TOKEN_TTL_SECONDS)),
    }


def _verification_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _verification_expires_at() -> str:
    return _to_iso(_now() + timedelta(minutes=EMAIL_VERIFICATION_TOKEN_TTL_MINUTES))


def _find_user_by_verification_token(
    store: dict[str, list[dict[str, Any]]], token: str
) -> dict[str, Any] | None:
    token_hash = _verification_token_hash(token)
    return next(
        (
            user
            for user in store["users"]
            if user.get("email_verification_token_hash") == token_hash
        ),
        None,
    )


def _issue_email_verification(user: dict[str, Any]) -> str:
    token = secrets.token_urlsafe(32)
    user["email_verification_token_hash"] = _verification_token_hash(token)
    user["email_verification_expires_at"] = _verification_expires_at()
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


def _session_response(session: dict[str, Any]) -> dict[str, Any]:
    return {
        "access_token": session["access_token"],
        "refresh_token": session["refresh_token"],
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_TTL_SECONDS,
        "refresh_expires_in": REFRESH_TOKEN_TTL_SECONDS,
    }


def _find_user_by_email(store: dict[str, list[dict[str, Any]]], email: str) -> dict[str, Any] | None:
    return next((user for user in store["users"] if user["email"] == email), None)


def _find_user_by_id(store: dict[str, list[dict[str, Any]]], user_id: str) -> dict[str, Any] | None:
    return next((user for user in store["users"] if user["id"] == user_id), None)


def _find_session_by_access_token(store: dict[str, list[dict[str, Any]]], access_token: str) -> dict[str, Any] | None:
    return next((session for session in store["sessions"] if session["access_token"] == access_token), None)


def _find_session_by_refresh_token(store: dict[str, list[dict[str, Any]]], refresh_token: str) -> dict[str, Any] | None:
    return next((session for session in store["sessions"] if session["refresh_token"] == refresh_token), None)


def _session_is_active(session: dict[str, Any]) -> bool:
    return _from_iso(session["access_expires_at"]) > _now()


def _refresh_is_active(session: dict[str, Any]) -> bool:
    return _from_iso(session["refresh_expires_at"]) > _now()


def register_user(email: str, password: str, display_name: str | None = None) -> dict[str, Any]:
    normalized_email = _normalize_email(email)
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")

    with STORE_LOCK:
        store = _load_store()
        if _find_user_by_email(store, normalized_email) is not None:
            raise ValueError("User already exists")

        user = {
            "id": secrets.token_hex(16),
            "email": normalized_email,
            "display_name": display_name.strip() if display_name else None,
            "password_hash": _hash_password(password),
            "created_at": _to_iso(_now()),
            "email_verified": False,
            "email_verification_token_hash": None,
            "email_verification_expires_at": None,
        }
        verification_token = _issue_email_verification(user)
        session = _new_session(user["id"])
        store["users"].append(user)
        store["sessions"].append(session)
        _save_store(store)

    _send_verification_email(
        user["email"], verification_token, user.get("display_name"))

    return {
        "user": _public_user(user),
        "session": _session_response(session),
        "requires_email_verification": True,
    }


def authenticate_user(email: str, password: str) -> dict[str, Any]:
    normalized_email = _normalize_email(email)

    with STORE_LOCK:
        store = _load_store()
        user = _find_user_by_email(store, normalized_email)
        if user is None or not _verify_password(password, user["password_hash"]):
            raise ValueError("Invalid email or password")

        if not user.get("email_verified", False):
            raise ValueError("Email is not verified")

        session = _new_session(user["id"])
        store["sessions"].append(session)
        _save_store(store)

    return {"user": _public_user(user), "session": _session_response(session)}


def refresh_session(refresh_token: str) -> dict[str, Any]:
    with STORE_LOCK:
        store = _load_store()
        session = _find_session_by_refresh_token(store, refresh_token)
        if session is None or not _refresh_is_active(session):
            raise ValueError("Invalid or expired refresh token")

        user = _find_user_by_id(store, session["user_id"])
        if user is None:
            raise ValueError("User not found")

        store["sessions"] = [current for current in store["sessions"]
                             if current["refresh_token"] != refresh_token]
        new_session = _new_session(user["id"])
        store["sessions"].append(new_session)
        _save_store(store)

    return {"user": _public_user(user), "session": _session_response(new_session)}


def logout_session(refresh_token: str) -> None:
    with STORE_LOCK:
        store = _load_store()
        before_count = len(store["sessions"])
        store["sessions"] = [session for session in store["sessions"]
                             if session["refresh_token"] != refresh_token]
        if len(store["sessions"]) == before_count:
            raise ValueError("Invalid refresh token")
        _save_store(store)


def get_current_user_from_token(access_token: str) -> dict[str, Any] | None:
    with STORE_LOCK:
        store = _load_store()
        session = _find_session_by_access_token(store, access_token)
        if session is None or not _session_is_active(session):
            return None

        user = _find_user_by_id(store, session["user_id"])
        if user is None:
            return None

        return _public_user(user)


def verify_email_token(token: str) -> dict[str, Any]:
    with STORE_LOCK:
        store = _load_store()
        user = _find_user_by_verification_token(store, token)
        if user is None:
            raise ValueError("Invalid verification token")

        expires_at = user.get("email_verification_expires_at")
        if not expires_at or _from_iso(expires_at) <= _now():
            raise ValueError("Verification token expired")

        user["email_verified"] = True
        user["email_verification_token_hash"] = None
        user["email_verification_expires_at"] = None
        session = _new_session(user["id"])
        store["sessions"].append(session)
        _save_store(store)

    return {"user": _public_user(user), "session": _session_response(session)}


def resend_verification_email(email: str) -> dict[str, Any]:
    normalized_email = _normalize_email(email)

    with STORE_LOCK:
        store = _load_store()
        user = _find_user_by_email(store, normalized_email)
        if user is None:
            raise ValueError("User not found")
        if user.get("email_verified", False):
            raise ValueError("Email already verified")

        verification_token = _issue_email_verification(user)
        _save_store(store)

    _send_verification_email(
        user["email"], verification_token, user.get("display_name"))
    return {"status": "verification_sent"}

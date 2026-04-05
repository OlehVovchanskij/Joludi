from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class AuthUser(Base):
    __tablename__ = "auth_users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str | None] = mapped_column(
        String(120), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verification_token_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    email_verification_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("auth_users.id", ondelete="CASCADE"), index=True
    )
    access_token: Mapped[str] = mapped_column(
        String(128), unique=True, index=True)
    refresh_token: Mapped[str] = mapped_column(
        String(128), unique=True, index=True)
    access_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True)
    refresh_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True)

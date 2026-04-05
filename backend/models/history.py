from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class ParseHistory(Base):
    __tablename__ = "parse_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str | None] = mapped_column(
        String(64), index=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_distance_m: Mapped[float | None] = mapped_column(
        Float, nullable=True)
    max_horizontal_speed_mps: Mapped[float |
                                     None] = mapped_column(Float, nullable=True)
    max_vertical_speed_mps: Mapped[float |
                                   None] = mapped_column(Float, nullable=True)
    max_acceleration_mps2: Mapped[float |
                                  None] = mapped_column(Float, nullable=True)
    max_altitude_gain_m: Mapped[float |
                                None] = mapped_column(Float, nullable=True)
    analysis_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)

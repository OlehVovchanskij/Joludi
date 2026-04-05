from __future__ import annotations

from pydantic import BaseModel


class HistoryItem(BaseModel):
    id: str
    user_id: str
    created_at: str
    filename: str | None = None
    message_count: int | None = None
    duration_s: float | None = None
    total_distance_m: float | None = None
    max_horizontal_speed_mps: float | None = None
    max_vertical_speed_mps: float | None = None
    max_acceleration_mps2: float | None = None
    max_altitude_gain_m: float | None = None
    has_snapshot: bool = False


class HistoryListResponse(BaseModel):
    items: list[HistoryItem]

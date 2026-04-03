from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi.encoders import jsonable_encoder
from sqlalchemy import DateTime, Float, Integer, JSON, String, create_engine, delete, inspect, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


DATABASE_URL = os.getenv("DATABASE_URL", "")
HISTORY_ENABLED = os.getenv("HISTORY_ENABLED", "true").strip().lower() in {
    "1", "true", "yes", "on"}
HISTORY_RETENTION_DAYS = int(os.getenv("HISTORY_RETENTION_DAYS", "30"))
HISTORY_MAX_ROWS = int(os.getenv("HISTORY_MAX_ROWS", "20000"))


class Base(DeclarativeBase):
    pass


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


def _is_configured() -> bool:
    return HISTORY_ENABLED and bool(DATABASE_URL)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _engine():
    if not _is_configured():
        return None
    return create_engine(DATABASE_URL, pool_pre_ping=True)


def create_history_tables() -> None:
    engine = _engine()
    if engine is None:
        return
    Base.metadata.create_all(engine)
    _ensure_history_schema(engine)


def _ensure_history_schema(engine) -> None:
    inspector = inspect(engine)
    if "parse_history" not in inspector.get_table_names():
        return

    columns = {column["name"]
               for column in inspector.get_columns("parse_history")}
    if "user_id" in columns:
        if "analysis_snapshot" in columns:
            return

    with engine.begin() as connection:
        if "user_id" not in columns:
            connection.execute(
                text("ALTER TABLE parse_history ADD COLUMN user_id VARCHAR(64)"))
            connection.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_parse_history_user_id ON parse_history (user_id)"))
        if "analysis_snapshot" not in columns:
            connection.execute(
                text("ALTER TABLE parse_history ADD COLUMN analysis_snapshot JSON"))


def _to_float(value: object) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def save_analysis_history(analysis: dict, user_id: str | None) -> bool:
    engine = _engine()
    if engine is None or not user_id:
        return False

    metrics = analysis.get("metrics") if isinstance(analysis, dict) else {}
    metrics = metrics if isinstance(metrics, dict) else {}
    filename = analysis.get("filename") if isinstance(analysis, dict) else None
    message_count = analysis.get(
        "message_count") if isinstance(analysis, dict) else None
    snapshot = jsonable_encoder(analysis)

    try:
        with Session(engine) as session:
            item = ParseHistory(
                id=str(uuid.uuid4()),
                user_id=user_id,
                created_at=_now(),
                filename=str(filename)[:255] if filename is not None else None,
                message_count=message_count if isinstance(
                    message_count, int) else None,
                duration_s=_to_float(metrics.get("duration_s")),
                total_distance_m=_to_float(metrics.get("total_distance_m")),
                max_horizontal_speed_mps=_to_float(
                    metrics.get("max_horizontal_speed_mps")),
                max_vertical_speed_mps=_to_float(
                    metrics.get("max_vertical_speed_mps")),
                max_acceleration_mps2=_to_float(
                    metrics.get("max_acceleration_mps2")),
                max_altitude_gain_m=_to_float(
                    metrics.get("max_altitude_gain_m")),
                analysis_snapshot=snapshot,
            )
            session.add(item)
            session.commit()

        prune_history(user_id=user_id)
        return True
    except Exception:
        return False


def get_recent_history(limit: int = 30, user_id: str | None = None) -> list[dict]:
    engine = _engine()
    if engine is None or not user_id:
        return []

    with Session(engine) as session:
        rows = session.execute(
            select(ParseHistory)
            .where(ParseHistory.user_id == user_id)
            .order_by(ParseHistory.created_at.desc())
            .limit(limit)
        ).scalars()

        return [
            {
                "id": row.id,
                "user_id": row.user_id,
                "created_at": row.created_at.isoformat(),
                "filename": row.filename,
                "message_count": row.message_count,
                "duration_s": row.duration_s,
                "total_distance_m": row.total_distance_m,
                "max_horizontal_speed_mps": row.max_horizontal_speed_mps,
                "max_vertical_speed_mps": row.max_vertical_speed_mps,
                "max_acceleration_mps2": row.max_acceleration_mps2,
                "max_altitude_gain_m": row.max_altitude_gain_m,
                "has_snapshot": row.analysis_snapshot is not None,
            }
            for row in rows
        ]


def get_history_item(item_id: str, user_id: str | None = None) -> dict | None:
    engine = _engine()
    if engine is None or not user_id:
        return None

    with Session(engine) as session:
        row = session.execute(
            select(ParseHistory).where(
                ParseHistory.id == item_id,
                ParseHistory.user_id == user_id,
            )
        ).scalar_one_or_none()

        if row is None:
            return None

        snapshot = row.analysis_snapshot
        if snapshot is None:
            snapshot = {
                "filename": row.filename,
                "message_count": row.message_count,
                "metrics": {
                    "duration_s": row.duration_s,
                    "total_distance_m": row.total_distance_m,
                    "max_horizontal_speed_mps": row.max_horizontal_speed_mps,
                    "max_vertical_speed_mps": row.max_vertical_speed_mps,
                    "max_acceleration_mps2": row.max_acceleration_mps2,
                    "max_altitude_gain_m": row.max_altitude_gain_m,
                },
                "trajectory_enu": [],
                "plotly_figure": None,
                "parsed": None,
                "history_preview": True,
            }

        return {
            "id": row.id,
            "user_id": row.user_id,
            "created_at": row.created_at.isoformat(),
            "filename": row.filename,
            "message_count": row.message_count,
            "duration_s": row.duration_s,
            "total_distance_m": row.total_distance_m,
            "max_horizontal_speed_mps": row.max_horizontal_speed_mps,
            "max_vertical_speed_mps": row.max_vertical_speed_mps,
            "max_acceleration_mps2": row.max_acceleration_mps2,
            "max_altitude_gain_m": row.max_altitude_gain_m,
            "analysis_snapshot": snapshot,
            "has_snapshot": row.analysis_snapshot is not None,
        }


def prune_history(user_id: str | None = None) -> int:
    engine = _engine()
    if engine is None or not user_id:
        return 0

    removed = 0
    cutoff = _now() - timedelta(days=max(1, HISTORY_RETENTION_DAYS))

    with Session(engine) as session:
        old_ids = session.execute(
            select(ParseHistory.id).where(
                ParseHistory.user_id == user_id,
                ParseHistory.created_at < cutoff,
            )
        ).scalars().all()
        if old_ids:
            session.execute(delete(ParseHistory).where(
                ParseHistory.id.in_(old_ids)))
            removed += len(old_ids)

        total_count = session.query(ParseHistory).filter(
            ParseHistory.user_id == user_id).count()
        overflow = total_count - max(100, HISTORY_MAX_ROWS)
        if overflow > 0:
            overflow_ids = session.execute(
                select(ParseHistory.id)
                .where(ParseHistory.user_id == user_id)
                .order_by(ParseHistory.created_at.asc())
                .limit(overflow)
            ).scalars().all()
            if overflow_ids:
                session.execute(delete(ParseHistory).where(
                    ParseHistory.id.in_(overflow_ids)))
                removed += len(overflow_ids)

        session.commit()

    return removed

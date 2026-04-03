from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine


MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def _split_sql(sql: str) -> list[str]:
    statements: list[str] = []
    buffer: list[str] = []
    for line in sql.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        buffer.append(line)
        if stripped.endswith(";"):
            statement = "\n".join(buffer).strip()
            statement = statement[:-1].strip()
            if statement:
                statements.append(statement)
            buffer = []
    if buffer:
        statement = "\n".join(buffer).strip()
        if statement:
            statements.append(statement)
    return statements


def _ensure_migrations_table(conn) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id VARCHAR(64) PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    )


def _load_migration_files() -> list[Path]:
    if not MIGRATIONS_DIR.exists():
        return []
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def apply_migrations(engine: Engine) -> int:
    applied_count = 0
    migration_files = _load_migration_files()
    if not migration_files:
        return applied_count

    with engine.begin() as conn:
        _ensure_migrations_table(conn)
        result = conn.execute(text("SELECT id FROM schema_migrations"))
        applied = {row[0] for row in result}

        for path in migration_files:
            migration_id = path.name
            if migration_id in applied:
                continue
            sql = path.read_text(encoding="utf-8")
            statements = _split_sql(sql)
            for statement in statements:
                conn.exec_driver_sql(statement)
            conn.execute(
                text("INSERT INTO schema_migrations (id) VALUES (:id)"),
                {"id": migration_id},
            )
            applied_count += 1

    return applied_count


def apply_migrations_from_env() -> int:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set")
    from sqlalchemy import create_engine

    engine = create_engine(database_url, pool_pre_ping=True)
    return apply_migrations(engine)

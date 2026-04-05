from __future__ import annotations

import os
from pathlib import Path
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine.url import make_url

from models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _load_dotenv_if_needed() -> None:
    if os.getenv("DATABASE_URL", "").strip():
        return

    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _running_inside_docker() -> bool:
    return Path("/.dockerenv").exists()


def _normalize_host_for_local_run(db_url: str) -> str:
    if _running_inside_docker():
        return db_url

    try:
        url = make_url(db_url)
    except Exception:
        return db_url

    if (url.host or "").strip().lower() != "postgres":
        return db_url

    local_host = os.getenv(
        "ALEMBIC_DB_HOST", "localhost").strip() or "localhost"
    local_port_raw = os.getenv("ALEMBIC_DB_PORT", "").strip()
    local_port = int(local_port_raw) if local_port_raw.isdigit() else url.port
    return str(url.set(host=local_host, port=local_port))


def _database_url() -> str:
    _load_dotenv_if_needed()
    db_url = os.getenv("DATABASE_URL", "").strip()
    if db_url:
        return _normalize_host_for_local_run(db_url)
    ini_url = config.get_main_option("sqlalchemy.url", "").strip()
    if ini_url:
        return _normalize_host_for_local_run(ini_url)
    raise RuntimeError(
        "DATABASE_URL is not set and sqlalchemy.url is empty in alembic.ini"
    )


def _set_sqlalchemy_url() -> None:
    config.set_main_option("sqlalchemy.url", _database_url())


target_metadata = Base.metadata


def run_migrations_offline() -> None:
    _set_sqlalchemy_url()
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    _set_sqlalchemy_url()
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

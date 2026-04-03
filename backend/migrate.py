from __future__ import annotations

from db_migrations import apply_migrations_from_env


def main() -> None:
    applied = apply_migrations_from_env()
    print(f"Applied {applied} migrations.")


if __name__ == "__main__":
    main()

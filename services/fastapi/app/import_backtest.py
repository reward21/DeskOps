from __future__ import annotations

import argparse

from app.core.config import settings
from app.services.sqlite_importer import import_sqlite_to_postgres


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sqlite", default=settings.backtest_sqlite_path)
    parser.add_argument("--pg", default=settings.database_url)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    limit = args.limit if args.limit and args.limit > 0 else None
    imported = import_sqlite_to_postgres(args.sqlite, args.pg, limit=limit)
    print("Imported tables:", ", ".join(imported))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import sqlite3
from typing import Iterable

import psycopg

TABLES = [
    "runs",
    "signals",
    "trades",
    "trades_pass",
    "gate_decisions",
    "gate_metrics",
    "gate_daily_stats",
    "trades_legacy",
]


def _sqlite_connect_readonly(path: str) -> sqlite3.Connection:
    uri = f"file:{path}?mode=ro"
    return sqlite3.connect(uri, uri=True)


def import_sqlite_to_postgres(sqlite_path: str, pg_dsn: str, limit: int | None = None) -> list[str]:
    imported = []
    with _sqlite_connect_readonly(sqlite_path) as sconn, psycopg.connect(pg_dsn) as pconn:
        for table in TABLES:
            cols = _get_sqlite_columns(sconn, table)
            if not cols:
                continue
            rows = _iter_rows(sconn, table, cols, limit)
            _copy_rows(pconn, table, cols, rows)
            imported.append(table)
        pconn.commit()
    return imported


def _get_sqlite_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    cur = conn.execute(f"PRAGMA table_info({table})")
    rows = cur.fetchall()
    return [r[1] for r in rows]


def _iter_rows(conn: sqlite3.Connection, table: str, cols: list[str], limit: int | None) -> Iterable[tuple]:
    col_list = ",".join(cols)
    sql = f"SELECT {col_list} FROM {table}"
    if limit and limit > 0:
        sql += f" LIMIT {int(limit)}"
    cur = conn.execute(sql)
    while True:
        batch = cur.fetchmany(500)
        if not batch:
            break
        for row in batch:
            yield row


def _copy_rows(pconn: psycopg.Connection, table: str, cols: list[str], rows: Iterable[tuple]) -> None:
    col_list = ",".join(cols)
    placeholders = ",".join(["%s"] * len(cols))
    insert = f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT DO NOTHING"
    with pconn.cursor() as cur:
        for row in rows:
            cur.execute(insert, row)

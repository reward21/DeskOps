# DeskOps PostgreSQL migration — September 11, 2026

Migrated the existing `deskops` database from PostgreSQL 16 to the running PostgreSQL 18 instance at localhost:5432 using PostgreSQL 18 pg_dump/pg_restore. The user explicitly authorized the migration and API restart.

- Source: `/Users/cole/.databases/DeskOps/pgdata`; temporarily served on localhost:5433 with read-only transactions, then cleanly stopped.
- Destination: `/opt/homebrew/var/postgresql@18`; database `deskops`, owner `cole`.
- All nine public tables and the normalized schema matched before/after. All source tables contained zero rows; no Multigate backtest data was imported.
- The DeskOps API was restarted on port 9090. Health returned `ok`, a connection to the PostgreSQL 18 `deskops` database was observed, and startup had no database-unavailable error.
- The existing connection address was retained. Multigate and other DeskOps services were not restarted.
- The original PostgreSQL 16 data directory remains available as a fallback and is stopped.

Durable backup: `/Users/cole/.databases/DeskOps/backups/migration-to-pg18-20260911/deskops-pg16.dump`

SHA-256: `0ca0b99a8c6ccd95c0345f21f3cfd3f5f0968d012f748acb22cd644ef241fdfa`

Verification, archive listing, and startup/restore logs are retained alongside the backup in `/Users/cole/.databases/DeskOps/backups/migration-to-pg18-20260911`. This backup is outside DeskOps's disposable `.run` directory.

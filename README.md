# DeskOps (Docker)

DeskOps is the unified console for GulfChain. This branch is the **Docker-first** setup for sharing and running the full stack quickly.

## What’s Included

- `web` SvelteKit UI
- `api` Go backend
- `fastapi` Python service (data/LLM/analytics)
- `db` Postgres database

## Requirements

- Docker Desktop
- Optional: a local backtest SQLite file (for FastAPI ingestion)

## Quick Start

```bash
docker compose up --build
```

That brings up all services.

## Ports

- Web UI: http://localhost:8888
- Go API: http://localhost:9090
- FastAPI: http://localhost:8090
- Postgres: localhost:5432

## Backtest SQLite (Optional)

FastAPI can read the Multigate backtest SQLite file if you mount it. Set `BACKTEST_SQLITE_PATH` in your environment before starting Docker:

```bash
export BACKTEST_SQLITE_PATH=/Users/cole/Projects/gulfchain/multigate-backtest/runs/backtests.sqlite
```

If not set, the container will still run, but backtest import endpoints won’t have access to the SQLite file.

## Common Commands

Start services (detached):
```bash
docker compose up -d
```

Rebuild a service:
```bash
docker compose build web
```

Stop services:
```bash
docker compose down
```

## Troubleshooting

- If a service doesn’t appear in Docker Desktop, it likely wasn’t started. Run `docker compose up -d`.
- If FastAPI won’t start, check that `BACKTEST_SQLITE_PATH` points to a real file.

---

This README applies to the `deskops-docker` branch only.

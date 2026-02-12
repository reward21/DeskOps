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

The UI uses same-origin proxies (`/api/...` and `/api/fastapi/...`), so it works cleanly across LAN devices without CORS issues.

### API Access

The UI talks to the backend through these same-origin routes:

- `http://localhost:8888/api/backtests/runs` → Go API (`/v1/backtests/runs`)
- `http://localhost:8888/api/fastapi/*` → FastAPI

Direct service ports still work for tooling and scripts:
- Go API: `http://localhost:9090`
- FastAPI: `http://localhost:8090`

## Ports

- Web UI: http://localhost:8888
- Go API: http://localhost:9090
- FastAPI: http://localhost:8090
- Postgres: localhost:5433

## Backtest SQLite (Optional)

FastAPI can read the Multigate backtest SQLite file if you mount it. By default, the container uses an internal `/data/backtests.sqlite` path.

To bind your local file, create a `docker-compose.override.yml` next to the main compose file:

```yaml
services:
  fastapi:
    volumes:
      - /absolute/path/to/backtests.sqlite:/data/backtests.sqlite:ro
```

If you don’t mount anything, the container still runs; backtest import endpoints just won’t have real data.

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
- If FastAPI won’t start, check your `docker-compose.override.yml` path.
- Fresh clones auto-run migrations on first boot; if you delete volumes, the DB is re-initialized.

---

This README applies to the `deskops-docker` branch only.

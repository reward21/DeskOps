# DeskOps

Source-first control console for GulfChain.

## Structure

- `apps/web` SvelteKit UI (port 8888)
- `apps/api` Go API (port 9090)
- `services/fastapi` Python service (port 8090)
- `db/` Postgres migrations
- `docs/` architecture notes

## Requirements

- Postgres running locally
- Node 18+ (for SvelteKit)
- Go 1.22+
- Python 3.11+

## Environment

Create `.env` in repo root:

```bash
cp .env.example .env
set -a
source .env
set +a
```

## Start services (source-first)

### Go API

```bash
cd apps/api
go mod tidy
go run ./cmd/server
```

### FastAPI

```bash
cd services/fastapi
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8090
```

### SvelteKit

```bash
cd apps/web
npm install
npm run dev -- --host 127.0.0.1 --port 8888
```

The UI uses same-origin proxies (`/api/...` and `/api/fastapi/...`), so it works cleanly across LAN devices without CORS issues. Make sure the Go API and FastAPI are running.

## Import backtest data (SQLite -> Postgres)

```bash
cd services/fastapi
source .venv/bin/activate
python -m app.import_backtest --sqlite "$BACKTEST_SQLITE_PATH" --pg "$DATABASE_URL"
```

Notes:
- Imports only backtest tables. Market data files are not touched.
- SQLite file is read-only; nothing is deleted.

## Pages

- `/` Landing
- `/console` Console & dashboard
- `/backtest` Multigate backtest
- `/gulf-sync` GulfSync governance
- `/communities` Communities & socials
- `/docs` Development/docs
- `/charts` Charts/market data

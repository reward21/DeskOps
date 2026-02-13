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
- psql client (`brew install postgresql@16` or `brew install libpq` + PATH)

## Environment

DeskOps uses `.envrc` (direnv) in the repo root. Update values there and run:

```bash
direnv allow
```

Optional: set `BACKTEST_API_BASE` (e.g. `http://127.0.0.1:8765`) to have the Go API read directly from the multigate-backtest `db_tool.py web` server instead of Postgres.

## Start services (source-first)

### Do This In Order (Source Build)

```bash
cd /Users/cole/Projects/gulfchain/DeskOps
direnv allow
make setup
createdb deskops
make migrate
make up
```

Verify:

```bash
curl -sS http://localhost:9090/health
curl -sS http://localhost:8888/api/backtests/runs
```

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

If `BACKTEST_API_BASE` is set, start the backtest API first:

```bash
cd /Users/cole/Projects/gulfchain/multigate-backtest
source .venv/bin/activate
python scripts/db_tool.py web --host 127.0.0.1 --port 8765
```

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

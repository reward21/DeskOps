# DeskOps Architecture

## Goals

- Source-first build
- Unified console for GulfChain projects
- Local-first LLM assistance with read/write toggles
- Backtest data import from SQLite to Postgres (no market data files)

## Services

- `apps/web` SvelteKit UI (port 8888)
- `apps/api` Go API (port 9090)
- `services/fastapi` Python service (port 8090)
- Postgres (local)

## Data Flow (v1)

1. Importer reads `multigate-backtest` SQLite (read-only).
2. Importer writes rows into Postgres tables.
3. Go API serves backtest data to UI.
4. UI provides navigation + LLM placeholders.

## Next

- Add FastAPI endpoints for LLM with workspace read/write gating.
- Add GulfSync integration endpoints and permission controls.

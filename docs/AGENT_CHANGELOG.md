# AGENT_CHANGELOG (DeskOps)
Append-only log of Codex changes in the DeskOps repo.
## FROM: Codex (GPT-5)
Rule: add a dated entry for every Codex change (what/where/why). Do not edit old entries.

## 2026-02-28 01:43 CST — DeskOps
- File: `README.md`
  - Rewrote stale absolute root references from `/Volumes/OWC/gulfchain/...` to `/Volumes/OWC/gulfchain/...` to match the external-drive repo location.

## 2026-02-28 01:48 CST — DeskOps
- File: `.envrc`
  - Removed hardcoded internal-drive `GULFCHAIN_ROOT` and now derive `DESKOPS_ROOT`, `GULFCHAIN_ROOT`, `MULTIGATE_ROOT`, and `GULFSYNC_ROOT` dynamically from the current external-drive workspace path.
- Files: `apps/web/src/routes/api/docs/tree/+server.js`, `apps/web/src/routes/api/docs/file/+server.js`, `apps/web/src/routes/api/metadata/[page]/+server.js`
  - Replaced direct `env.GULFCHAIN_ROOT` dependency with auto-detected Gulfchain root resolution, including validation/fallback behavior and clearer error responses when root discovery fails.
- File: `apps/web/src/lib/server/gulfchainRoot.js`
  - Added shared resolver for Gulfchain root detection (validated env value first, then cwd ascent fallback).

## 2026-02-28 01:55 CST — DeskOps
- Files: `apps/api/internal/config/config.go`, `apps/api/cmd/server/main.go`
  - Changed API startup to allow backtest-only mode when Postgres is unavailable, as long as `BACKTEST_API_BASE`/`BACKTEST_API_URL` is configured; no longer hard-fails solely on DB ping failure.
- File: `apps/api/internal/httpapi/router.go`
  - Added safer data-source handling for run endpoints: prefer backtest API, fall back to Postgres when available, and return explicit 5xx errors when no source is available.
- Files: `apps/web/src/routes/api/backtests/runs/+server.js`, `apps/web/src/routes/api/backtests/run/+server.js`, `apps/web/src/routes/api/backtests/query/+server.js`, `apps/web/src/routes/api/backtests/schema/+server.js`, `apps/web/src/routes/api/backtests/schema-profile/+server.js`
  - Added proxy-level error handling so upstream connection failures return structured JSON errors (`503`) instead of opaque Svelte route crashes (`fetch failed`).
- File: `apps/web/src/lib/api.js`
  - Improved client error parsing to surface backend error messages in UI instead of generic `API error: <status>`.

## 2026-02-28 02:19 CST — DeskOps
- Files: `apps/web/src/routes/api/backtests/artifacts/+server.js`, `apps/web/src/routes/api/backtests/artifacts/file/+server.js`
  - Added artifacts discovery and secure file-serving endpoints for backtest runs, including legacy absolute-path normalization (`/Users/cole/...` to external-drive root), bounded directory scanning, and path-confinement checks under `multigate-backtest/runs/artifacts`.
- File: `apps/web/src/routes/backtest/artifacts/[run_id]/+page.svelte`
  - Added run-specific artifacts page that lists reports/charts/other files, supports image/text preview, and open/download actions via the new API.
  - Updated page loading behavior to refresh when route `run_id` changes client-side.
- File: `apps/web/src/routes/backtest/+page.svelte`
  - Linked run IDs and selected-run artifact section to `/backtest/artifacts/[run_id]` and added `.run-link` styling for visible navigation affordance.

## 2026-02-28 02:31 CST — DeskOps Postgres repair
- Runtime path: `~/.databases/DeskOps/pgdata`
  - Initialized missing/empty PostgreSQL cluster directory with Postgres 16 (`initdb --auth-local=trust --auth-host=trust`), started server on `127.0.0.1:5432`, and ensured `deskops` database exists.
  - Applied migrations `db/migrations/0001_init.sql` and `db/migrations/0002_views.sql` to restore expected DeskOps schema tables/views.

## 2026-02-28 06:16 CST — DeskOps backtest run feed + filters refresh
- File: `apps/web/src/routes/api/backtests/runs/+server.js`
  - Replaced pass-through proxy with a merged run index that combines DeskOps API run rows and artifact-discovered runs from `multigate-backtest/runs/artifacts`.
  - Added run-type inference (`single`, `batch`, `walk_forward`, `regime_switch`), source labeling (`db`, `artifacts`, `merged`), no-store caching, and limit controls so recent runs appear even when not yet imported into the `runs` table.
- File: `apps/web/src/lib/api.js`
  - Extended `fetchRuns` to pass query options (`limit`, `include_artifacts`) and force `cache: no-store` for fresh run feed pulls.
- File: `apps/web/src/routes/backtest/+page.svelte`
  - Updated the Runs panel to show unified run feed metadata (type/source), quick run-type chips, source/date filters, row-limit selector, refresh/reset actions, and shown-vs-indexed counts.
  - Improved selection behavior for artifact-only runs by falling back to index metadata when DB run detail is unavailable.
  - Added run filter defaults for type/source/time to saved view config and surfaced warning banners when upstream/artifact index warnings are returned.

## 2026-02-28 06:39 CST — DeskOps gate metrics scrolling + trade detail presentation
- File: `apps/web/src/routes/backtest/+page.svelte`
  - Added dedicated scroll containers for Gate Metrics and Trade Profile panel bodies so performance snapshot, winners/losers, and denials remain reachable in resized containers.
  - Added tighter per-table scroll caps for snapshot sub-tables (`Top Winners`, `Top Losers`, `Top Denial Codes`) to keep panel navigation predictable.
  - Replaced raw JSON trade detail output with structured grouped detail cards (`Identifiers`, `Timing`, `Position`, `Outcome`) that show only present fields in concise key/value format.

## 2026-03-01 10:49 CST — DeskOps path portability cleanup
- File: `apps/web/src/routes/api/backtests/artifacts/+server.js`
  - Removed hardcoded legacy Gulfchain root mapping and replaced it with generic path normalization that remaps any absolute path containing `/gulfchain/` or `/multigate-backtest/` onto the currently detected workspace root.
  - Preserved artifacts confinement checks while making run artifact path normalization resilient to future root moves.
- File: `README.md`
  - Replaced hardcoded absolute `cd` commands with repo-relative startup commands (`cd DeskOps`, `cd ../multigate-backtest`) so setup instructions work regardless of mount point.

## 2026-03-01 10:57 CST — DeskOps venv path repair after repo move
- Files: `.venv/bin/activate`, `.venv/bin/activate.bat`, `.venv/bin/activate.csh`, `.venv/bin/activate.fish`, `.venv/bin/activate.nu`, `.venv/bin/pip`, `.venv/bin/pip3`, `.venv/bin/pip3.11`, `.venv/bin/uvicorn`, `.venv/bin/fastapi`, `.venv/bin/httpx`, `.venv/bin/dotenv`
  - Rewrote embedded venv absolute path references from `/Volumes/OWC/gulfchain/DeskOps/.venv` to `/Volumes/OWC/gulfchain/DeskOps/.venv` so `source .venv/bin/activate` and entry-point scripts resolve the local SSD workspace instead of the old external-drive path.

## 2026-03-08 00:00 CST — DeskOps artifact run metadata normalization
- File: `apps/web/src/routes/api/backtests/run/+server.js`
  - Added artifact-report fallback/enrichment for run detail: when Go API run detail is missing or sparse, DeskOps now locates the run’s `*_multigate_report.json`/`*_report_contract.json` under `multigate-backtest/runs/artifacts`, parses backtester `run/context/summary`, and returns normalized `params`, `params_json`, `metrics`, and `metrics_json`.
  - Added merge logic so DB-backed run detail is preserved while missing fields are backfilled from artifact metadata (strategy/spec/gates, data window/source fields, report/equity paths, batch id).
  - Added bounded artifact lookup helpers and run-type inference so artifact-only batch runs render with the same schema shape expected by the Backtest page.

## 2026-03-08 00:00 CST — DeskOps docs PDF preview support
- File: `apps/web/src/routes/api/docs/tree/+server.js`
  - Added `.pdf` files to the docs explorer allowlist so PDF docs appear in the tree.
- File: `apps/web/src/routes/api/docs/file/+server.js`
  - Added binary PDF serving (`Content-Type: application/pdf`, inline disposition) with a larger PDF preview size cap, while preserving JSON text-preview responses for non-PDF files.
  - Tightened path validation using `path.relative` to prevent path traversal edge cases.
- Files: `apps/web/src/routes/docs/+page.svelte`, `apps/web/src/lib/components/DocsTree.svelte`
  - Added PDF filter option and PDF-aware selection flow.
  - Added embedded PDF viewer (`iframe`) in the docs page so selecting a PDF renders it directly instead of text preview.

## 2026-03-24 00:00 CST — DeskOps walk-forward visuals workflow + navbar icon
- File: `apps/web/src/routes/api/backtests/walk-forward-visuals/+server.js`
  - Added dedicated API for walk-forward visuals:
    - `GET` discovers walk-forward artifact batches and returns dashboard-ready summaries.
    - `POST` generates a dashboard PNG for a requested batch by invoking the multigate dashboard script.
  - Added strict artifact-root path confinement checks and no-store response headers.
- File: `apps/web/src/routes/walk-forward-visuals/+page.svelte`
  - Added a dedicated Walk-Forward Visuals page with:
    - batch list + summary stats
    - one-click generate/re-generate action
    - inline rendered dashboard preview via existing artifacts file endpoint
- File: `apps/web/src/lib/api.js`
  - Added frontend helpers: `fetchWalkForwardVisuals()` and `generateWalkForwardVisual(batchId)`.
- File: `apps/web/src/lib/components/Nav.svelte`
  - Added separate navigation item with icon (`WF Visuals`) pointing to `/walk-forward-visuals`.

## 2026-05-18 20:46 CDT — documentation-first full-firm transition pass
- File: `docs/AGENT_CHANGELOG.md`
  - Added this entry to record a workspace-level transition documentation kickoff under:
    - `../docs/full_firm_transition_codex_2026-05-18/` (workspace root docs)
  - No DeskOps application code or API behavior was modified in this pass.

## 2026-09-11 — DeskOps PostgreSQL 16 to 18 migration
- User authorized database/service changes outside GulfSync for this repair.
- Exported the existing deskops database from the original PostgreSQL 16 cluster and restored it transactionally into PostgreSQL 18 on localhost:5432.
- Verified matching schema and content hashes for all nine tables (all source tables were empty).
- Restarted only the Go API; verified health, database connection, and startup without database errors. Stopped temporary PostgreSQL 16 instance; retained its data directory.
- Retained a durable export and evidence under ~/.databases/DeskOps/backups/migration-to-pg18-20260911/.
- Added docs/POSTGRES_MIGRATION_2026-09-11.md. No application source or connection configuration was changed.


## 2026-09-14 — DeskOps Quant page and menu integration
- User request: add a DeskOps GUI page to interact with the existing Quant agent and put a tab in the menu bar. Added `/quant` and a Quant navigation tab beside Backtest, with theme support and responsive chat/experiment panels.
- Added saved browser conversations, tool-result cards, experiment selection and configuration inspection, direct backtest/matrix/research controls, separate evaluation/failure/target status and actual latest-backtest windows and metric units. Controls reuse existing agent tools and the existing engine.
- Added a same-origin SvelteKit `/api/quant` endpoint and fixed-process JSON bridge to `multigate-backtest/src/quant_web.py`. Uses the repository virtual environment, existing Quant YAML model priority, `quant.chat_reply` and `quant.execute_chat_tool`. No new service or port. Browser input cannot choose an executable or supply canonical system/tool history.
- Conversations persist under `runs/quant/web` with request IDs, conversation locks, transcripts, status and worker logs. Accepted work survives reload/disconnect; retries do not rerun accepted actions; interrupted/failed workers are visible. Direct tool failures preserve the full assistant/tool exchange. Foreign-origin/non-JSON POSTs and unsupported operations/IDs are rejected.
- Factored a read-only experiment snapshot from the existing inspector so status remains readable while execution owns the experiment lock. Reads atomically published manifests, immutable checked revisions and research state; omits a partial attempt row until the next refresh. Editing retains existing locks and revision rules.
- Documented usage in `DeskOps/docs/QUANT.md`, DeskOps README and the Quant agent guide. Final validation outcomes will be appended below. Legacy root `quant.py` remains untouched.


### Quant GUI final validation — 2026-09-14
- All 91 Python tests passed (139.273 s); the DeskOps production build passed. Added eight focused transport/snapshot tests. Thirteen live HTTP checks passed, including retrying a completed request without changing any saved conversation file.
- Browser chat survived reload and preserved native tool results. Qwen initially selected the wrong strategy; its rejected call and incorrectly selected private test are retained. An exact-ID follow-up created the correct ORB experiment. Matrix generation published revision 2; a real five-day backtest completed with five trades. Research was started and explicitly stopped through the page; its cancelled attempt remains visible and no GUI test campaign was left active.
- Verified desktop/phone layout and no browser console errors. Fixed structured research-error rendering and exposed full backtest configuration alongside strategy/gate/matrix/settings. Forty-six protected input hashes still match, including legacy quant.py and the prior research experiment manifest.
- Evidence, limitations, exact IDs, metrics and logs: `DeskOps/docs/validation/quant_gui_2026-09-14.md` and companion JSON/log files. Usage: `DeskOps/docs/QUANT.md`.


## 2026-09-14 — Fix Quant chat request IDs in browsers without randomUUID
- User reported `crypto.randomUUID is not a function` when sending chat. The page called that browser API without checking availability, so message submission could fail before reaching Quant.
- Replaced it with a shared `createQuantRequestId` helper using `crypto.getRandomValues`. The existing 32-character hexadecimal ID format, 128 random bits and pending-request reuse remain intact. This also fixes direct action buttons, which share the submit path. No model, configuration, engine or research behavior was changed.
- Added two focused browser-compatibility regression tests: IDs work when randomUUID is absent and match backend validation, and a missing secure random source produces a readable error. Both tests passed; DeskOps production build passed. Updated DeskOps/docs/QUANT.md with compatibility and refresh guidance.
- Live browser verification: submitted a harmless connection check with the new ID generator; Qwen replied `Chat connection OK`. Saved conversation `e4ec03148d3642a88a6f0c7260c8098a`, request `33b6242282167fc79bdbc49df400ff84`, completed with no error and no experiment actions.


## 2026-09-14 — Increase Quant model response timeout
- User requested more than 120 seconds for complex tasks. Increased `multigate-backtest/agent/quant/quant.yaml` → `chat.timeout_seconds` from 120 to 600 seconds (10 minutes per model response), within the existing supported range.
- Verified the real Quant configuration loader and settings validator resolve 600 seconds and retain qwen3.5:9b. New DeskOps chat workers read the updated setting automatically. Existing terminal chat sessions and already-running workers retain their loaded settings until restarted.


## 2026-09-14 — Recover Quant chat from malformed native tool JSON
- User reported HTTP 500 `failed to parse JSON: unexpected end of JSON input` at 21:56:32. Ollama logged `qwen3 tool call parsing failed`; the prior inspect_tuning_options read completed. This was a model tool-output parse failure, separate from the earlier timeout. The raw failed generation and completion metadata were not returned, so output-budget truncation cannot be proven for that call.
- Added targeted parser-error classification and bounded structured-output recovery in agent/quant/quant.py. Chat selects one allowed tool, generates arguments constrained by its schema, validates required fields/types, then uses the existing execution/validation path. A final text answer is also supported. Recovery continues from recorded history and keeps the per-turn result cache, so successful calls are not re-executed. Known length-limited native responses are rejected before dispatch; malformed/truncated structured output receives one corrective retry. Unrelated server errors are not retried by this path.
- Added configurable chat.max_output_tokens=4096 (previous native chat limit 1200 and structured limit 2400). Retained timeout_seconds=600, qwen3.5:9b, existing model priority, and current research/tool budgets. Research still unloads its model before backtesting; structured chat recovery keeps it loaded between requests.
- Added regression coverage for exact HTTP 500 recovery, duplicate prevention after a real temporary-plan save, invalid/truncated arguments, unsupported tools, unrelated errors, output-budget transport and durable web-worker recovery. All 53 related tests passed. Updated the Quant agent guide and DeskOps/docs/QUANT.md. Legacy root quant.py hash remains unchanged.
- Live proposal-only verification and its retained interruption are recorded under multigate-backtest/docs/validation/quant_json_recovery_2026-09-14*.json. No experiment tools are dispatched by that replay. Final live outcome follows below.
- Additional validation exposed doubled JSON encoding in recovery context. Packed tool results as actual JSON objects and represented exact duplicates by an explicit reference to the first full result. Original transcript/history is unchanged. Added context-preservation coverage; all 54 related tests now pass. Preserved the interrupted and oversized-context live checks as separate evidence files.
- The compact live replay still produced invalid structured JSON on both corrective attempts. Investigation matched Ollama issue #14645: Qwen 3.5 can ignore the format grammar when think=False. Installed Ollama is 0.17.4; release 0.17.6 separately documents a Qwen 3.5 native tool parsing/rendering fix. Preserved this failed check as *_grammar_disabled.json.
- Applied a Quant-side compatibility workaround: enable thinking only for Qwen 3.5 structured requests, then discard thinking text before returning/recording the usable result. Ordinary native chat remains non-thinking. Added a transport regression test; all 55 related tests passed. Ollama was not upgraded by this task. Updated both usage guides and the validation report with the limitation and workaround.

### Quant JSON recovery final validation — 2026-09-14
- The live replay of the reported failed conversation passed with qwen3.5:9b on Ollama 0.17.4. Structured selection and arguments both completed on their first attempt. The resulting define_parameter proposal preserved experiment b24de31a0cb8438f83c2227e2376c232 and revision 9, proposing ORB windows [5, 10, 15, 30]. Selection took 126.30 seconds; arguments took 118.60 seconds. This was model-generation/argument-shape verification only, with zero experiment tool executions.
- All 55 related tests passed. Retained the final live JSON, live log, test log and earlier failed/interrupted attempts under multigate-backtest/docs/validation/quant_json_recovery_2026-09-14*. The validation report distinguishes transport recovery from downstream validation and trading performance.
- User offered an update to 0.17.16, then preferred continuing the Quant fix if updating was troublesome. The official GitHub release-by-tag API returned 404 for v0.17.16; Ollama was left at 0.17.4. New DeskOps chat workers pick up the fix automatically; reopen existing terminal chat sessions. No production experiment was modified by this verification; legacy root quant.py remains unchanged.

## 2026-10-14 20:45 CDT — .gitignore tightening before commit (Claude Code)
- File: `.gitignore`
  - Appended `.env.*` (keeps `.env.example`), `*.key`, `*.pem`, `*.sqlite`, `*.sqlite3`, SQLite sidecars, `*.db`, `/apps/web/build/`, `test-results/`, `playwright-report/`.
  - Why: the untracked local LLM memory DB `db/llm_memory.sqlite` was about to be committed. No tracked file is affected.

## 2026-10-14 21:30 CDT — retire runs/backtests.sqlite as a default DB (Claude Code)
- File: `deskops` — `check_backtest_api_deps` no longer requires `multigate-backtest/runs/backtests.sqlite`; it asks multigate's `src.config.configured_db_path()` (via the repo `.venv`) and checks that file exists. `bash -n` passes.
- File: `.envrc` (local, gitignored) — `BACKTEST_SQLITE_PATH` now points at `runs/backtests_ride_ssd.sqlite`. Requires `direnv allow` again.
- Why: the user is archiving the old 142.8 GB `runs/backtests.sqlite`; the launcher refused to start without it.

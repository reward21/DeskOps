<script>
  import { onMount } from 'svelte';
  import LLMPanel from '$lib/components/LLMPanel.svelte';
  import { fetchRuns, fetchRunDetail, runBacktestQuery } from '$lib/api.js';

  let runs = [];
  let loading = true;
  let error = '';
  let selectedRunId = '';
  let selectedRun = null;
  let selectedLoading = false;
  let selectedError = '';
  let runFilter = '';
  let querySql = 'SELECT run_id, created_at_utc, date_start_et, date_end_et FROM runs ORDER BY created_at_utc DESC LIMIT 50';
  let queryLimit = 200;
  let queryResult = null;
  let queryLoading = false;
  let queryError = '';
  let selectedSchema = 'runs';
  let schemaProfile = [];
  let profileLoading = false;
  let profileError = '';
  let selectedBlock = null;


  const schemaBlocks = [
    {
      title: 'runs',
      desc: 'Core run metadata, params, and report paths.',
      query: 'SELECT run_id, created_at_utc, date_start_et, date_end_et, params_json, metrics_json FROM runs ORDER BY created_at_utc DESC LIMIT 50',
      profile: [
        {
          label: 'Run count + date range',
          sql: 'SELECT COUNT(*) AS total_runs, MIN(created_at_utc) AS first_run, MAX(created_at_utc) AS last_run FROM runs'
        },
        {
          label: 'Top symbols',
          sql: "SELECT COALESCE(symbol, 'unknown') AS symbol, COUNT(*) AS runs FROM runs GROUP BY symbol ORDER BY runs DESC LIMIT 5"
        }
      ]
    },
    {
      title: 'signals',
      desc: 'Signal rows with feature payloads.',
      query: 'SELECT run_id, signal_id, ts, direction FROM signals ORDER BY ts DESC LIMIT 50',
      profile: [
        {
          label: 'Signal count + date range',
          sql: 'SELECT COUNT(*) AS total_signals, MIN(ts) AS first_signal, MAX(ts) AS last_signal FROM signals'
        },
        {
          label: 'Direction breakdown',
          sql: 'SELECT direction, COUNT(*) AS signals FROM signals GROUP BY direction ORDER BY signals DESC LIMIT 5'
        }
      ]
    },
    {
      title: 'trades',
      desc: 'Trade execution records per run.',
      query: 'SELECT run_id, signal_id, entry_ts, exit_ts, side, pnl_points FROM trades ORDER BY entry_ts DESC LIMIT 100',
      profile: [
        {
          label: 'Trade count + entry range',
          sql: 'SELECT COUNT(*) AS total_trades, MIN(entry_ts) AS first_entry, MAX(entry_ts) AS last_entry FROM trades'
        },
        {
          label: 'Avg PnL (points)',
          sql: 'SELECT AVG(pnl_points) AS avg_pnl_points FROM trades'
        }
      ]
    },
    {
      title: 'trades_pass',
      desc: 'Trade pass/deny per gate.',
      query: 'SELECT run_id, gate_id, trade_id, entry_ts, exit_ts, pnl_points, exit_reason FROM trades_pass ORDER BY entry_ts DESC LIMIT 100',
      profile: [
        {
          label: 'Pass trades',
          sql: 'SELECT COUNT(*) AS total_pass_trades FROM trades_pass'
        },
        {
          label: 'Top gates',
          sql: 'SELECT gate_id, COUNT(*) AS trades FROM trades_pass GROUP BY gate_id ORDER BY trades DESC LIMIT 5'
        }
      ]
    },
    {
      title: 'gate_decisions',
      desc: 'Per-gate decisions for each trade.',
      query: 'SELECT run_id, gate_id, signal_id, decision, denial_code, ts FROM gate_decisions ORDER BY ts DESC LIMIT 100',
      profile: [
        {
          label: 'Decision count + date range',
          sql: 'SELECT COUNT(*) AS total_decisions, MIN(ts) AS first_decision, MAX(ts) AS last_decision FROM gate_decisions'
        },
        {
          label: 'Decision breakdown',
          sql: 'SELECT decision, COUNT(*) AS count FROM gate_decisions GROUP BY decision ORDER BY count DESC LIMIT 5'
        },
        {
          label: 'Top denial codes',
          sql: 'SELECT denial_code, COUNT(*) AS count FROM gate_decisions WHERE denial_code IS NOT NULL AND denial_code != \"\" GROUP BY denial_code ORDER BY count DESC LIMIT 5'
        }
      ]
    },
    {
      title: 'gate_metrics',
      desc: 'Gate-level metrics.',
      query: 'SELECT run_id, gate_id, trade_count, win_rate, pf, expectancy FROM gate_metrics ORDER BY run_id DESC LIMIT 100',
      profile: [
        {
          label: 'Metric rows',
          sql: 'SELECT COUNT(*) AS total_metrics FROM gate_metrics'
        },
        {
          label: 'Avg win rate',
          sql: 'SELECT AVG(win_rate) AS avg_win_rate FROM gate_metrics'
        }
      ]
    },
    {
      title: 'gate_daily_stats',
      desc: 'Daily aggregates by gate.',
      query: 'SELECT run_id, gate_id, session_date, trades_taken, pnl_day, dd_day FROM gate_daily_stats ORDER BY session_date DESC LIMIT 100',
      profile: [
        {
          label: 'Daily rows + range',
          sql: 'SELECT COUNT(*) AS total_rows, MIN(session_date) AS first_day, MAX(session_date) AS last_day FROM gate_daily_stats'
        },
        {
          label: 'Top gates',
          sql: 'SELECT gate_id, COUNT(*) AS rows FROM gate_daily_stats GROUP BY gate_id ORDER BY rows DESC LIMIT 5'
        }
      ]
    },
    {
      title: 'trades_legacy',
      desc: 'Legacy trade format (if present).',
      query: 'SELECT * FROM trades_legacy ORDER BY trade_id DESC LIMIT 100',
      profile: [
        {
          label: 'Legacy rows',
          sql: 'SELECT COUNT(*) AS total_rows FROM trades_legacy'
        }
      ]
    }
  ];

  onMount(async () => {
    try {
      const data = await fetchRuns();
      runs = data.items || [];
    } catch (err) {
      error = err?.message || 'Failed to load runs.';
    } finally {
      loading = false;
    }

    return () => {};
  });

  $: filteredRuns =
    runFilter.trim().length === 0
      ? runs
      : runs.filter((run) =>
          String(run.run_id || '')
            .toLowerCase()
            .includes(runFilter.trim().toLowerCase())
        );
  $: selectedBlock = schemaBlocks.find((b) => b.title === selectedSchema);

  const formatJson = (value) => {
    if (!value) return '';
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch (err) {
      return String(value);
    }
  };

  const loadRunDetail = async (runId) => {
    if (!runId) return;
    selectedRunId = runId;
    selectedLoading = true;
    selectedError = '';
    try {
      selectedRun = await fetchRunDetail(runId);
    } catch (err) {
      selectedRun = null;
      selectedError = err?.message || 'Failed to load run detail.';
    } finally {
      selectedLoading = false;
    }
  };

  const runQuery = async () => {
    queryLoading = true;
    queryError = '';
    try {
      queryResult = await runBacktestQuery(querySql, queryLimit);
    } catch (err) {
      queryResult = null;
      queryError = err?.message || 'Failed to run query.';
    } finally {
      queryLoading = false;
    }
  };

  const presetQuery = (sql) => {
    querySql = sql;
  };

  const selectSchema = async (block) => {
    selectedSchema = block.title;
    presetQuery(block.query);
    await runQuery();
    await loadSchemaProfile(block);
  };

  const loadSchemaProfile = async (block) => {
    profileLoading = true;
    profileError = '';
    schemaProfile = [];
    const queries = block?.profile || [];
    for (const q of queries) {
      try {
        const res = await runBacktestQuery(q.sql, 200);
        schemaProfile = [
          ...schemaProfile,
          { label: q.label, columns: res.columns || [], rows: res.rows || [], error: '' }
        ];
      } catch (err) {
        schemaProfile = [
          ...schemaProfile,
          { label: q.label, columns: [], rows: [], error: err?.message || 'Query failed.' }
        ];
      }
    }
    profileLoading = false;
  };

</script>

<section class="page">
  <h2>Multigate Backtest</h2>
  <p>Read from SQLite or Postgres. Import pipeline is wired in FastAPI.</p>
  <div class="layout">
    <div class="main">
      <div class="card selected-card">
        <div class="card-head">
          <div>
            <h3>Selected Schema</h3>
            <p class="muted">Quick context + active data feed.</p>
          </div>
          <span class="badge mono">{selectedSchema}</span>
        </div>
        {#if selectedBlock}
          <p class="muted">{selectedBlock.desc}</p>
        {/if}
        <div class="selected-actions">
          <button class="run" on:click={runQuery} disabled={queryLoading}>Run Feed</button>
          {#if queryLoading}
            <span class="muted">Running…</span>
          {/if}
          {#if queryError}
            <span class="error">{queryError}</span>
          {/if}
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Runs</h3>
            <p class="muted">Core run metadata keyed by <code>run_id</code>.</p>
          </div>
          <div class="runs-meta">
            <input class="filter" type="search" placeholder="Filter run_id…" bind:value={runFilter} />
            <span class="badge">{filteredRuns.length} runs</span>
          </div>
        </div>
        {#if loading}
          <p>Loading runs...</p>
        {:else if error}
          <p class="error">{error}</p>
        {:else if filteredRuns.length === 0}
          <p>No runs imported yet.</p>
        {:else}
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run ID</th>
                  <th>Created (UTC)</th>
                  <th>Start (ET)</th>
                  <th>End (ET)</th>
                </tr>
              </thead>
              <tbody>
                {#each filteredRuns as run}
                  <tr
                    class:selected={selectedRunId === run.run_id}
                    on:click={() => loadRunDetail(run.run_id)}
                  >
                    <td class="mono">{run.run_id}</td>
                    <td>{run.created_at_utc || '-'}</td>
                    <td>{run.date_start_et || '-'}</td>
                    <td>{run.date_end_et || '-'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Selected Run</h3>
            <p class="muted">Full row from <code>runs</code> (params + metrics).</p>
          </div>
          {#if selectedRunId}
            <span class="badge mono">{selectedRunId}</span>
          {/if}
        </div>
        {#if selectedLoading}
          <p>Loading run details...</p>
        {:else if selectedError}
          <p class="error">{selectedError}</p>
        {:else if !selectedRun}
          <p>Select a run to view details.</p>
        {:else}
          <div class="detail-grid">
            <div>
              <h4>Run Info</h4>
              <ul class="kv">
                <li><span>Run ID</span><span class="mono">{selectedRun.run_id}</span></li>
                <li><span>Created (UTC)</span><span>{selectedRun.created_at_utc || '-'}</span></li>
                <li><span>Start (ET)</span><span>{selectedRun.date_start_et || '-'}</span></li>
                <li><span>End (ET)</span><span>{selectedRun.date_end_et || '-'}</span></li>
              </ul>
              <h4>Artifacts</h4>
              <ul class="kv">
                <li><span>Report Path</span><span class="mono">{selectedRun.report_path || '-'}</span></li>
                <li><span>Equity Curve</span><span class="mono">{selectedRun.equity_curve_path || '-'}</span></li>
              </ul>
            </div>
            <div>
              <h4>Params</h4>
              <pre class="code">{formatJson(selectedRun.params_json)}</pre>
              <h4>Metrics</h4>
              <pre class="code">{formatJson(selectedRun.metrics_json)}</pre>
            </div>
          </div>
        {/if}
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Query Console</h3>
            <p class="muted">Run read-only SQL against the backtest API.</p>
          </div>
          <div class="limit">
            <label>Limit</label>
            <input type="number" min="1" max="2000" bind:value={queryLimit} />
          </div>
        </div>
        <div class="preset-row">
          {#each schemaBlocks as block}
            <button class:selected={selectedSchema === block.title} on:click={() => selectSchema(block)}>
              {block.title}
            </button>
          {/each}
        </div>
        <textarea class="sql" bind:value={querySql} rows="6"></textarea>
        <div class="query-actions">
          <button class="run" on:click={runQuery} disabled={queryLoading}>Run Query</button>
          {#if queryLoading}
            <span class="muted">Running…</span>
          {/if}
        </div>
        {#if queryError}
          <p class="error">{queryError}</p>
        {:else if queryResult}
          <div class="query-meta">
            <span class="mono">rows: {queryResult.row_count ?? (queryResult.rows?.length || 0)}</span>
            {#if queryResult.elapsed_ms}
              <span>elapsed: {queryResult.elapsed_ms} ms</span>
            {/if}
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  {#each queryResult.columns || [] as col}
                    <th class="mono">{col}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each queryResult.rows || [] as row}
                  <tr>
                    {#each row as cell}
                      <td>{cell}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Schema Profile</h3>
            <p class="muted">Quick stats and summaries for <code>{selectedSchema}</code>.</p>
          </div>
        </div>
        {#if profileLoading}
          <p>Building schema profile…</p>
        {:else if profileError}
          <p class="error">{profileError}</p>
        {:else if schemaProfile.length === 0}
          <p>Select a schema to load profile stats.</p>
        {:else}
          <div class="profile-grid">
            {#each schemaProfile as block}
              <div class="profile-card">
                <h4>{block.label}</h4>
                {#if block.error}
                  <p class="error">{block.error}</p>
                {:else if (block.rows || []).length === 0}
                  <p class="muted">No data.</p>
                {:else}
                  <table>
                    <thead>
                      <tr>
                        {#each block.columns as col}
                          <th class="mono">{col}</th>
                        {/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each block.rows as row}
                        <tr>
                          {#each row as cell}
                            <td>{cell}</td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <aside class="side">
      <div class="card pinned">
        <div class="card-head compact">
          <h3>Schema Map</h3>
          <span class="pin-label">Pinned</span>
        </div>
        <p class="muted">Aligned to the multigate-backtest SQLite schema.</p>
        <ul class="schema">
          {#each schemaBlocks as block}
            <li>
              <button class:selected={selectedSchema === block.title} on:click={() => selectSchema(block)}>
                <span class="mono">{block.title}</span>
                <span>{block.desc}</span>
              </button>
            </li>
          {/each}
        </ul>
      </div>
      <div class="card pinned">
        <div class="card-head compact">
          <h3>Signals & Trades</h3>
          <span class="pin-label">Pinned</span>
        </div>
        <p class="muted">
          Use <code>signals</code>, <code>trades</code>, <code>trades_pass</code>, and <code>gate_decisions</code> to
          explain why positions were accepted or denied by each gate.
        </p>
      </div>
    </aside>
  </div>
  <LLMPanel title="Backtest LLM" />
</section>

<style>
  .page {
    max-width: none;
    width: 100%;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 3rem;
  }
  p { color: var(--text-muted); }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 1.5rem;
    margin: 1.5rem 0 2rem;
  }
  .main {
    display: grid;
    gap: 1rem;
  }
  .side {
    display: grid;
    gap: 1rem;
    align-content: start;
    position: sticky;
    top: 90px;
    height: fit-content;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
  }
  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }
  .card-head.compact {
    align-items: center;
  }
  .card-actions {
    display: flex;
    gap: 0.35rem;
  }
  .card-actions button {
    border: 1px solid var(--border);
    background: var(--surface-alt);
    color: var(--text);
    border-radius: 8px;
    padding: 0.15rem 0.45rem;
    cursor: pointer;
  }
  .runs-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .filter {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.35rem 0.8rem;
    color: var(--text);
    font-size: 0.85rem;
  }
  .muted {
    color: var(--text-muted);
    font-size: 0.95rem;
  }
  .badge {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .mono {
    font-family: 'Space Mono', monospace;
  }
  .table-wrap {
    margin-top: 0.75rem;
    overflow: auto;
    border-radius: 10px;
    border: 1px solid var(--border);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  th, td {
    padding: 0.6rem 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  tbody tr {
    cursor: pointer;
    transition: background 0.15s ease;
  }
  tbody tr:hover {
    background: var(--surface-alt);
  }
  tbody tr.selected {
    background: rgba(0, 172, 172, 0.18);
  }
  .detail-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  }
  .limit {
    display: grid;
    gap: 0.35rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .limit input {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.35rem 0.5rem;
    color: var(--text);
    width: 110px;
  }
  .preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.75rem 0;
  }
  .preset-row button,
  .query-actions .run {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 999px;
    padding: 0.35rem 0.85rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .preset-row button.selected {
    border-color: var(--accent);
    color: var(--accent);
  }
  .query-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0.75rem 0;
  }
  .query-actions .run,
  .selected-actions .run {
    background: var(--accent);
    color: #001414;
    border: none;
    font-weight: 600;
  }
  .sql {
    width: 100%;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.75rem;
    color: var(--text);
    font-family: 'Space Mono', monospace;
    font-size: 0.85rem;
  }
  .selected-card {
    border-color: rgba(0, 172, 172, 0.5);
    box-shadow: 0 18px 30px rgba(0, 0, 0, 0.25);
  }
  .selected-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.75rem;
  }
  .profile-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    margin-top: 1rem;
  }
  .profile-card {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.75rem;
    overflow: auto;
  }
  .profile-card h4 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }
  .query-meta {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.5rem;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .kv {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 1rem;
    display: grid;
    gap: 0.35rem;
  }
  .kv li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .code {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.75rem;
    font-size: 0.8rem;
    white-space: pre-wrap;
  }
  .schema {
    list-style: none;
    padding: 0;
    margin: 1rem 0 0;
    display: grid;
    gap: 0.75rem;
  }
  .schema li button {
    display: grid;
    gap: 0.35rem;
    width: 100%;
    text-align: left;
    padding: 0.5rem;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .schema li button.selected {
    border-color: var(--accent);
    background: rgba(0, 172, 172, 0.12);
  }
  .error {
    color: #ffb8b8;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .side {
      position: static;
    }
    .detail-grid {
      grid-template-columns: 1fr;
    }
  }
  .pin-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }
</style>

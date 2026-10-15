<script>
  import { onMount, onDestroy } from 'svelte';
  import { fetchGulfSyncLive } from '$lib/api.js';

  let loading = true;
  let refreshing = false;
  let error = '';
  let live = null;
  let refreshEverySec = 8;
  let autoRefresh = true;
  let timer = null;

  const formatNum = (value) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString();
  };

  const formatDateTime = (value) => {
    const text = String(value || '').trim();
    if (!text) return '-';
    const ms = Date.parse(text);
    if (!Number.isFinite(ms)) return text;
    return new Date(ms).toLocaleString();
  };

  const statusTone = (status) => {
    const key = String(status || '').toLowerCase();
    if (key === 'busy') return 'busy';
    if (key === 'idle') return 'idle';
    return 'unknown';
  };

  const stopTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    if (typeof window === 'undefined') return;
    if (!autoRefresh) return;
    const intervalMs = Math.max(3, Number(refreshEverySec || 8)) * 1000;
    timer = setInterval(() => {
      loadLive({ background: true });
    }, intervalMs);
  };

  const loadLive = async ({ background = false } = {}) => {
    if (!background) loading = true;
    if (background) refreshing = true;
    error = '';
    try {
      live = await fetchGulfSyncLive({ recent_limit: 8, preview_chars: 220 });
    } catch (err) {
      error = err?.message || 'Failed to load GulfSync live view.';
    } finally {
      loading = false;
      refreshing = false;
    }
  };

  const manualRefresh = async () => {
    await loadLive({ background: false });
  };

  $: startTimer();

  onMount(async () => {
    await loadLive();
    startTimer();
  });

  onDestroy(() => {
    stopTimer();
  });
</script>

<section class="page">
  <div class="header">
    <div>
      <h2>GulfSync Live Dashboard</h2>
      <p>Realtime view of agent state, queue flow, outbox routing, and contract ingestion.</p>
    </div>
    <div class="header-actions">
      <a class="link-btn" href="/gulf-sync/control">Open Control Page</a>
      <button on:click={manualRefresh} disabled={loading || refreshing}>Refresh now</button>
    </div>
  </div>

  <div class="controls">
    <label>
      <input type="checkbox" bind:checked={autoRefresh} />
      Auto refresh
    </label>
    <label>
      Every
      <input type="number" min="3" max="120" bind:value={refreshEverySec} />
      sec
    </label>
    {#if refreshing}
      <span class="muted">refreshing…</span>
    {/if}
  </div>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if loading}
    <p class="muted">Loading GulfSync live dashboard…</p>
  {:else if live}
    <div class="stats-grid">
      <article class="stat">
        <div class="label">Agent Status</div>
        <div class="value status {statusTone(live?.state?.status)}">{live?.state?.status || 'UNKNOWN'}</div>
        <div class="sub">{live?.state?.step || 'step: -'}</div>
      </article>
      <article class="stat">
        <div class="label">Queue Pending (Est.)</div>
        <div class="value">{formatNum(live?.queue?.pending_estimate)}</div>
        <div class="sub">queued {formatNum(live?.queue?.queued_total)} / done {formatNum(live?.queue?.done_total)}</div>
      </article>
      <article class="stat">
        <div class="label">Outbox Threads</div>
        <div class="value">{formatNum(live?.counts?.outbox_threads)}</div>
        <div class="sub">last queue: {formatDateTime(live?.queue?.latest_queued_at_utc)}</div>
      </article>
      <article class="stat">
        <div class="label">Contracts</div>
        <div class="value">{formatNum(live?.counts?.contracts)}</div>
        <div class="sub">last run: {live?.latest?.last_backtest_run_id || '-'}</div>
      </article>
      <article class="stat">
        <div class="label">Inbox Files</div>
        <div class="value">{formatNum(live?.counts?.inbox_files)}</div>
        <div class="sub">Packets: {formatNum(live?.counts?.packet_files)}</div>
      </article>
    </div>

    {#if live?.warnings?.length}
      <div class="warnings">
        {#each live.warnings as warning}
          <p>{warning}</p>
        {/each}
      </div>
    {/if}

    <div class="panel">
      <h3>Outbox Thread Activity</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Thread</th>
              <th>Queued</th>
              <th>Done</th>
              <th>Skipped</th>
              <th>Last Done</th>
              <th>Preview</th>
            </tr>
          </thead>
          <tbody>
            {#each live.threads || [] as row}
              <tr>
                <td>{row.thread}</td>
                <td>{formatNum(row?.queue?.queued)}</td>
                <td>{formatNum(row?.queue?.done)}</td>
                <td>{formatNum(row?.queue?.skipped)}</td>
                <td>{formatDateTime(row?.queue?.last_done_at_utc)}</td>
                <td class="preview">{row.preview || '-'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>Recent Contracts</h3>
        {#if live?.recent?.contracts?.length}
          <ul>
            {#each live.recent.contracts as row}
              <li>
                <div class="name">{row.name}</div>
                <div class="meta">{row.type} · {formatDateTime(row.mtime_utc)}</div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">No contract records found.</p>
        {/if}
      </div>

      <div class="card">
        <h3>Recent Packets</h3>
        {#if live?.recent?.packets?.length}
          <ul>
            {#each live.recent.packets as row}
              <li>
                <div class="name">{row.name}</div>
                <div class="meta">{formatDateTime(row.mtime_utc)}</div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">No packet files found.</p>
        {/if}
      </div>

      <div class="card">
        <h3>Loop Logs</h3>
        {#if live?.logs?.length}
          <ul>
            {#each live.logs as row}
              <li>
                <div class="name">{row.name}</div>
                <div class="meta">{formatDateTime(row.mtime_utc)}</div>
                <div class="line">{row.last_line || '-'}</div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">No loop logs detected.</p>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .page {
    max-width: none;
    width: 100%;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 3rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .header p {
    color: var(--text-muted);
    margin-top: 0.35rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  button,
  .link-btn {
    font: inherit;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    padding: 0.5rem 0.75rem;
    cursor: pointer;
  }

  .link-btn {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }

  button:hover,
  .link-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin: 1rem 0 1.25rem;
    color: var(--text-muted);
  }

  .controls label {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .controls input[type='number'] {
    width: 72px;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.35rem 0.45rem;
    background: var(--surface);
    color: var(--text);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.9rem;
    margin-bottom: 1rem;
  }

  .stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 0.8rem 0.9rem;
  }

  .label {
    color: var(--text-muted);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .value {
    margin-top: 0.35rem;
    font-size: 1.45rem;
    font-weight: 600;
  }

  .value.status.busy {
    color: #e9af49;
  }

  .value.status.idle {
    color: #56c49b;
  }

  .value.status.unknown {
    color: var(--text-muted);
  }

  .sub {
    margin-top: 0.2rem;
    color: var(--text-muted);
    font-size: 0.85rem;
  }

  .warnings {
    border: 1px solid #825f22;
    background: rgba(130, 95, 34, 0.15);
    border-radius: 12px;
    padding: 0.65rem 0.8rem;
    margin-bottom: 1rem;
  }

  .warnings p {
    margin: 0.25rem 0;
    color: #f2d08c;
    font-size: 0.9rem;
  }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .table-wrap {
    overflow: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    min-width: 840px;
  }

  th,
  td {
    text-align: left;
    border-bottom: 1px solid var(--border);
    padding: 0.55rem 0.4rem;
    font-size: 0.9rem;
    vertical-align: top;
  }

  th {
    color: var(--text-muted);
    font-weight: 500;
  }

  td.preview {
    min-width: 320px;
    color: var(--text-muted);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.55rem;
  }

  .name {
    font-size: 0.9rem;
    word-break: break-word;
  }

  .meta {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 0.18rem;
  }

  .line {
    margin-top: 0.22rem;
    font-size: 0.82rem;
    color: var(--text-muted);
    word-break: break-word;
  }

  .muted {
    color: var(--text-muted);
  }

  .error {
    border: 1px solid #b14d4d;
    background: rgba(177, 77, 77, 0.13);
    border-radius: 12px;
    color: #f3c8c8;
    padding: 0.7rem 0.85rem;
    margin: 0.8rem 0 1rem;
  }
</style>

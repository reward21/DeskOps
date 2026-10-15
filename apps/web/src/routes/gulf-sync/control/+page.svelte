<script>
  import { onMount } from 'svelte';
  import { fetchGulfSyncLive, listGulfSyncActionOptions, runGulfSyncAction } from '$lib/api.js';

  let loading = true;
  let error = '';
  let running = false;
  let live = null;
  let threads = [];
  let selectedThread = '';
  let startInterval = 15;
  let lastRun = null;
  let history = [];

  const formatDateTime = (value) => {
    const text = String(value || '').trim();
    if (!text) return '-';
    const ms = Date.parse(text);
    if (!Number.isFinite(ms)) return text;
    return new Date(ms).toLocaleString();
  };

  const refreshContext = async () => {
    const [liveData, actionData] = await Promise.all([fetchGulfSyncLive({ recent_limit: 5 }), listGulfSyncActionOptions()]);
    live = liveData;
    threads = Array.isArray(actionData?.threads) ? actionData.threads : [];
    if (!selectedThread && threads.length) selectedThread = threads[0];
  };

  const runAction = async (action, payload = {}) => {
    running = true;
    error = '';
    try {
      const result = await runGulfSyncAction(action, payload);
      lastRun = result;
      history = [result, ...history].slice(0, 8);
      await refreshContext();
    } catch (err) {
      error = err?.message || `Failed to run ${action}`;
    } finally {
      running = false;
    }
  };

  onMount(async () => {
    loading = true;
    error = '';
    try {
      await refreshContext();
    } catch (err) {
      error = err?.message || 'Failed to load GulfSync control context.';
    } finally {
      loading = false;
    }
  });
</script>

<section class="page">
  <div class="header">
    <div>
      <h2>GulfSync Control</h2>
      <p>Run operational commands and interact with thread handlers.</p>
    </div>
    <div class="header-actions">
      <a class="link-btn" href="/gulf-sync">Back to Live Dashboard</a>
      <button on:click={refreshContext} disabled={running || loading}>Refresh context</button>
    </div>
  </div>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if loading}
    <p class="muted">Loading GulfSync controls…</p>
  {:else}
    <div class="status-bar">
      <span class="chip">State: {live?.state?.status || 'UNKNOWN'}</span>
      <span class="chip">Step: {live?.state?.step || '-'}</span>
      <span class="chip">Queue pending: {live?.queue?.pending_estimate || 0}</span>
    </div>

    <div class="grid">
      <div class="card">
        <h3>Core Runs</h3>
        <div class="actions">
          <button on:click={() => runAction('agent_run')} disabled={running}>Run once</button>
          <button on:click={() => runAction('bridge_pull')} disabled={running}>Bridge pull</button>
          <button on:click={() => runAction('quant_run')} disabled={running}>Quant run</button>
          <button on:click={() => runAction('agent_stop')} disabled={running}>Stop loops</button>
        </div>
      </div>

      <div class="card">
        <h3>Start All Agents</h3>
        <p class="muted">Launches bridge, quant, agent, and handler loops with a shared interval.</p>
        <div class="row">
          <label for="interval">Interval (sec)</label>
          <input id="interval" type="number" min="1" max="600" bind:value={startInterval} />
          <button on:click={() => runAction('start_agents', { interval: startInterval })} disabled={running}>Start agents</button>
        </div>
      </div>

      <div class="card">
        <h3>Handle Outbox Thread</h3>
        <p class="muted">Runs `./gs agent handle --thread …` and writes to inbox.</p>
        <div class="row">
          <label for="thread">Thread</label>
          <select id="thread" bind:value={selectedThread}>
            {#each threads as thread}
              <option value={thread}>{thread}</option>
            {/each}
          </select>
          <button on:click={() => runAction('handle_thread', { thread: selectedThread })} disabled={running || !selectedThread}>
            Handle thread
          </button>
        </div>
      </div>
    </div>

    {#if running}
      <p class="muted">Running command…</p>
    {/if}

    {#if lastRun}
      <div class="output">
        <h3>Latest Command Output</h3>
        <p class="meta">
          <code>{lastRun.command}</code> · exit {lastRun.exit_code} · {lastRun.duration_ms}ms ·
          {formatDateTime(lastRun.ended_at_utc)}
        </p>
        {#if !lastRun.ok}
          <p class="warn">Command finished with a non-zero exit code.</p>
        {/if}
        <pre>{(lastRun.stdout || '').trim() || '(no stdout)'}</pre>
        {#if (lastRun.stderr || '').trim()}
          <pre class="stderr">{lastRun.stderr.trim()}</pre>
        {/if}
      </div>
    {/if}

    {#if history.length > 1}
      <div class="history card">
        <h3>Recent Commands</h3>
        <ul>
          {#each history as row}
            <li>
              <code>{row.command}</code>
              <span class="muted">exit {row.exit_code} · {formatDateTime(row.ended_at_utc)}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
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
    gap: 0.65rem;
  }

  .status-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin: 1rem 0;
  }

  .chip {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.3rem 0.65rem;
    background: var(--surface);
    font-size: 0.86rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
    margin: 1rem 0;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(120px, 1fr));
    gap: 0.6rem;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
    margin-top: 0.55rem;
  }

  button,
  select,
  input,
  .link-btn {
    font: inherit;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    padding: 0.45rem 0.7rem;
  }

  button:hover,
  .link-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    cursor: pointer;
  }

  .link-btn {
    display: inline-flex;
    text-decoration: none;
    align-items: center;
  }

  .output {
    margin-top: 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
  }

  .meta {
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  pre {
    margin: 0.8rem 0 0;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.7rem;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: 'Space Mono', monospace;
    font-size: 0.82rem;
    max-height: 320px;
  }

  pre.stderr {
    border-color: #a56060;
  }

  .history {
    margin-top: 1rem;
  }

  .history ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  .history li {
    display: flex;
    justify-content: space-between;
    gap: 0.8rem;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.4rem;
  }

  .warn {
    margin: 0.55rem 0 0;
    color: #f2ca85;
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

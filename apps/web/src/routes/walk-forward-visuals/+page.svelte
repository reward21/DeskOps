<script>
  import { onMount } from 'svelte';
  import { fetchWalkForwardVisuals, generateWalkForwardVisual } from '$lib/api.js';

  let loading = true;
  let error = '';
  let batches = [];
  let selectedBatchId = '';
  let selected = null;
  let generatingBatchId = '';
  let actionError = '';
  let actionNotice = '';

  const imageUrl = (relPath) =>
    `/api/backtests/artifacts/file?path=${encodeURIComponent(String(relPath || ''))}`;

  const fmtWhen = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  };

  const refresh = async () => {
    loading = true;
    error = '';
    actionError = '';
    try {
      const payload = await fetchWalkForwardVisuals();
      batches = Array.isArray(payload?.batches) ? payload.batches : [];
      if (!selectedBatchId && batches.length) {
        selectedBatchId = String(batches[0].batch_id || '');
      }
      selected = batches.find((b) => String(b.batch_id) === String(selectedBatchId)) || batches[0] || null;
      if (selected) selectedBatchId = String(selected.batch_id || '');
    } catch (err) {
      error = err?.message || 'Failed to load walk-forward batches.';
      batches = [];
      selected = null;
    } finally {
      loading = false;
    }
  };

  const chooseBatch = (batchId) => {
    selectedBatchId = String(batchId || '');
    selected = batches.find((b) => String(b.batch_id) === selectedBatchId) || null;
    actionError = '';
    actionNotice = '';
  };

  const generateForSelected = async () => {
    if (!selected?.batch_id) return;
    generatingBatchId = String(selected.batch_id);
    actionError = '';
    actionNotice = '';
    try {
      const out = await generateWalkForwardVisual(selected.batch_id);
      actionNotice = `Generated dashboard: ${out?.output_path || ''}`;
      await refresh();
      selected = batches.find((b) => String(b.batch_id) === String(generatingBatchId)) || selected;
      selectedBatchId = selected?.batch_id || selectedBatchId;
    } catch (err) {
      actionError = err?.message || 'Failed to generate dashboard.';
    } finally {
      generatingBatchId = '';
    }
  };

  onMount(() => {
    void refresh();
  });
</script>

<section class="wrap">
  <div class="head">
    <h2>Walk-Forward Visuals</h2>
    <p class="muted">Generate and preview dashboard visuals for walk-forward artifact batches.</p>
    <div class="actions">
      <button on:click={refresh} disabled={loading}>Refresh</button>
      <button on:click={generateForSelected} disabled={!selected || !!generatingBatchId}>
        {#if generatingBatchId}
          Generating...
        {:else}
          Generate Dashboard
        {/if}
      </button>
    </div>
    {#if actionNotice}
      <p class="notice">{actionNotice}</p>
    {/if}
    {#if actionError}
      <p class="error">{actionError}</p>
    {/if}
  </div>

  {#if loading}
    <p>Loading walk-forward batches...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <div class="layout">
      <aside class="list">
        <h3>Batches <span>{batches.length}</span></h3>
        {#if batches.length === 0}
          <p class="muted">No walk-forward batches found.</p>
        {:else}
          {#each batches as batch}
            <button
              class:selected={String(batch.batch_id) === String(selectedBatchId)}
              on:click={() => chooseBatch(batch.batch_id)}
            >
              <span class="id">{batch.batch_id}</span>
              <span class="meta">
                windows {batch.windows} · fallback {batch.fallback} · no-candidate {batch.no_candidate}
              </span>
              <span class="meta">score {batch.score_metric || '-'}</span>
              <span class="meta">updated {fmtWhen(batch.results_mtime_utc)}</span>
            </button>
          {/each}
        {/if}
      </aside>

      <main class="detail">
        {#if !selected}
          <p>Select a batch.</p>
        {:else}
          <div class="stats">
            <div><span>Batch</span><strong class="mono">{selected.batch_id}</strong></div>
            <div><span>Gate</span><strong>{selected.gate_id || '-'}</strong></div>
            <div><span>Strategy</span><strong class="mono">{selected.strategy_id || '-'}</strong></div>
            <div><span>Score Metric</span><strong>{selected.score_metric || '-'}</strong></div>
            <div><span>Windows</span><strong>{selected.windows}</strong></div>
            <div><span>Selected</span><strong>{selected.selected}</strong></div>
            <div><span>Fallback</span><strong>{selected.fallback}</strong></div>
            <div><span>No Candidate</span><strong>{selected.no_candidate}</strong></div>
            <div><span>Generated</span><strong>{fmtWhen(selected.generated_at_utc)}</strong></div>
          </div>

          {#if selected.dashboard_exists && selected.dashboard_path}
            <div class="preview-head">
              <h3>Dashboard Preview</h3>
              <a href={imageUrl(selected.dashboard_path)} target="_blank" rel="noreferrer">Open Full Image</a>
            </div>
            <div class="image-wrap">
              <img alt={`Walk-forward dashboard ${selected.batch_id}`} src={imageUrl(selected.dashboard_path)} />
            </div>
          {:else}
            <p class="muted">No dashboard image yet. Click “Generate Dashboard”.</p>
          {/if}
        {/if}
      </main>
    </div>
  {/if}
</section>

<style>
  .wrap {
    display: grid;
    gap: 1rem;
    padding: 1.5rem;
  }

  .head h2 {
    margin: 0;
  }

  .actions {
    display: flex;
    gap: 0.6rem;
    margin-top: 0.7rem;
  }

  .actions button {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.45rem 0.7rem;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }

  .actions button:hover:enabled {
    border-color: var(--accent);
    color: var(--accent);
  }

  .layout {
    display: grid;
    grid-template-columns: 360px 1fr;
    gap: 1rem;
    min-height: 60vh;
  }

  .list,
  .detail {
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }

  .list {
    padding: 0.9rem;
    display: grid;
    gap: 0.5rem;
    align-content: start;
    overflow: auto;
    max-height: 75vh;
  }

  .list h3 {
    display: flex;
    justify-content: space-between;
    margin: 0 0 0.4rem 0;
  }

  .list button {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    padding: 0.55rem 0.6rem;
    text-align: left;
    cursor: pointer;
    display: grid;
    gap: 0.16rem;
  }

  .list button:hover {
    border-color: var(--accent);
  }

  .list button.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .id {
    font-family: 'Space Mono', monospace;
    font-size: 0.9rem;
  }

  .meta {
    font-size: 0.76rem;
    color: var(--muted);
  }

  .detail {
    padding: 0.95rem;
    display: grid;
    gap: 0.8rem;
    align-content: start;
  }

  .stats {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.7rem;
    background: var(--surface-alt);
  }

  .stats div {
    display: grid;
    gap: 0.2rem;
  }

  .stats span {
    font-size: 0.73rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .preview-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.6rem;
  }

  .preview-head h3 {
    margin: 0;
  }

  .image-wrap {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.6rem;
    background: var(--surface-alt);
  }

  .image-wrap img {
    width: 100%;
    height: auto;
    display: block;
    border-radius: 8px;
  }

  .mono {
    font-family: 'Space Mono', monospace;
  }

  .muted {
    color: var(--muted);
  }

  .error {
    color: #f08080;
  }

  .notice {
    color: #89d185;
  }

  @media (max-width: 1000px) {
    .layout {
      grid-template-columns: 1fr;
    }

    .list {
      max-height: 38vh;
    }
  }
</style>

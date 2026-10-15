<script>
  import { page } from '$app/stores';

  let runId = '';
  let loading = true;
  let error = '';
  let run = null;
  let artifactsRoot = '';
  let runDirs = [];
  let reports = [];
  let charts = [];
  let artifacts = [];
  let selected = null;
  let previewText = '';
  let previewLoading = false;
  let previewError = '';
  let loadedRunId = '';

  $: runId = $page.params.run_id || '';

  const bucketFor = (item) => {
    if (!item) return 'artifacts';
    if (reports.some((f) => f.path === item.path)) return 'reports';
    if (charts.some((f) => f.path === item.path)) return 'charts';
    return 'artifacts';
  };

  const isImage = (item) => String(item?.mime || '').startsWith('image/');
  const isText = (item) => {
    const mime = String(item?.mime || '');
    return mime.startsWith('text/') || mime.includes('json');
  };

  const fileUrl = (file, download = false) =>
    `/api/backtests/artifacts/file?path=${encodeURIComponent(file.path)}${download ? '&download=1' : ''}`;

  const fmtBytes = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return '-';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fmtWhen = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  };

  const loadPreview = async (file) => {
    previewError = '';
    previewText = '';
    if (!file || !isText(file)) return;
    previewLoading = true;
    try {
      const res = await fetch(fileUrl(file));
      if (!res.ok) throw new Error(`Preview request failed (${res.status})`);
      previewText = await res.text();
    } catch (err) {
      previewError = err?.message || 'Failed to load preview.';
    } finally {
      previewLoading = false;
    }
  };

  const selectFile = async (file) => {
    selected = file;
    if (isText(file)) {
      await loadPreview(file);
    } else {
      previewLoading = false;
      previewText = '';
      previewError = '';
    }
  };

  const loadArtifacts = async () => {
    loading = true;
    error = '';
    run = null;
    runDirs = [];
    reports = [];
    charts = [];
    artifacts = [];
    selected = null;
    previewText = '';
    previewError = '';

    try {
      const res = await fetch(`/api/backtests/artifacts?run_id=${encodeURIComponent(runId)}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `Artifacts request failed (${res.status})`);
      }
      run = data.run || null;
      artifactsRoot = data.artifacts_root || '';
      runDirs = data.run_dirs || [];
      reports = data.reports || [];
      charts = data.charts || [];
      artifacts = data.artifacts || [];

      const first = reports[0] || charts[0] || artifacts[0] || null;
      if (first) {
        await selectFile(first);
      }
    } catch (err) {
      error = err?.message || 'Failed to load run artifacts.';
    } finally {
      loading = false;
    }
  };

  $: if (runId && runId !== loadedRunId) {
    loadedRunId = runId;
    void loadArtifacts();
  }
</script>

<section class="wrap">
  <div class="head">
    <a class="back" href="/backtest">Back to Backtest</a>
    <h2>Run Artifacts</h2>
    <p class="muted">Browse generated reports and charts for run <code>{runId}</code>.</p>
  </div>

  {#if loading}
    <p>Loading artifacts…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <div class="run-meta">
      <div><span>Run ID</span><strong class="mono">{run?.run_id || runId}</strong></div>
      <div><span>Created</span><strong>{run?.created_at_utc || '-'}</strong></div>
      <div><span>Artifacts Root</span><strong class="mono">{artifactsRoot || '-'}</strong></div>
      <div><span>Matched Dirs</span><strong>{runDirs.length}</strong></div>
    </div>

    {#if runDirs.length}
      <details>
        <summary>Matched Artifact Directories</summary>
        <ul class="dirs">
          {#each runDirs as dir}
            <li><code>{dir}</code></li>
          {/each}
        </ul>
      </details>
    {/if}

    <div class="layout">
      <aside class="files">
        <div class="bucket">
          <h3>Reports <span>{reports.length}</span></h3>
          {#if reports.length === 0}
            <p class="muted small">No run report files found.</p>
          {:else}
            {#each reports as file}
              <button type="button" class:selected={selected?.path === file.path} on:click={() => selectFile(file)}>
                <span class="name">{file.name}</span>
                <span class="meta">{fmtBytes(file.size)}</span>
              </button>
            {/each}
          {/if}
        </div>

        <div class="bucket">
          <h3>Charts <span>{charts.length}</span></h3>
          {#if charts.length === 0}
            <p class="muted small">No chart image files found.</p>
          {:else}
            {#each charts as file}
              <button type="button" class:selected={selected?.path === file.path} on:click={() => selectFile(file)}>
                <span class="name">{file.name}</span>
                <span class="meta">{fmtBytes(file.size)}</span>
              </button>
            {/each}
          {/if}
        </div>

        <div class="bucket">
          <h3>Other Artifacts <span>{artifacts.length}</span></h3>
          {#if artifacts.length === 0}
            <p class="muted small">No additional files found.</p>
          {:else}
            {#each artifacts as file}
              <button type="button" class:selected={selected?.path === file.path} on:click={() => selectFile(file)}>
                <span class="name">{file.name}</span>
                <span class="meta">{fmtBytes(file.size)}</span>
              </button>
            {/each}
          {/if}
        </div>
      </aside>

      <main class="preview">
        {#if !selected}
          <p>Select a file to preview.</p>
        {:else}
          <div class="preview-head">
            <div>
              <h3>{selected.name}</h3>
              <p class="muted mono">{selected.path}</p>
              <p class="muted small">
                {bucketFor(selected)} · {selected.mime} · {fmtBytes(selected.size)} · {fmtWhen(selected.mtime)}
              </p>
            </div>
            <div class="actions">
              <a href={fileUrl(selected)} target="_blank" rel="noreferrer">Open</a>
              <a href={fileUrl(selected, true)}>Download</a>
            </div>
          </div>

          {#if isImage(selected)}
            <div class="image-wrap">
              <img alt={selected.name} src={fileUrl(selected)} />
            </div>
          {:else if isText(selected)}
            {#if previewLoading}
              <p>Loading preview…</p>
            {:else if previewError}
              <p class="error">{previewError}</p>
            {:else}
              <pre>{previewText}</pre>
            {/if}
          {:else}
            <p class="muted">This file type does not support inline preview.</p>
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
    margin: 0.2rem 0;
  }

  .back {
    font-size: 0.9rem;
    color: var(--accent);
  }

  .run-meta {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    padding: 0.9rem 1rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-alt);
  }

  .run-meta div {
    display: grid;
    gap: 0.2rem;
  }

  .run-meta span {
    font-size: 0.75rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .layout {
    display: grid;
    grid-template-columns: 340px 1fr;
    gap: 1rem;
    min-height: 60vh;
  }

  .files,
  .preview {
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
  }

  .files {
    display: grid;
    gap: 0.9rem;
    padding: 0.9rem;
    overflow: auto;
    align-content: start;
    max-height: 75vh;
  }

  .bucket h3 {
    display: flex;
    justify-content: space-between;
    margin: 0 0 0.5rem 0;
    font-size: 0.95rem;
  }

  .bucket button {
    width: 100%;
    text-align: left;
    display: grid;
    gap: 0.2rem;
    margin: 0 0 0.35rem 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    padding: 0.5rem 0.6rem;
    cursor: pointer;
  }

  .bucket button:hover {
    border-color: var(--accent);
  }

  .bucket button.selected {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }

  .name {
    font-size: 0.86rem;
    word-break: break-all;
  }

  .meta {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .preview {
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
  }

  .preview-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--border);
  }

  .preview-head h3 {
    margin: 0;
  }

  .actions {
    display: flex;
    gap: 0.6rem;
  }

  .actions a {
    font-size: 0.82rem;
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 0.35rem 0.6rem;
  }

  .actions a:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .preview pre {
    margin: 0;
    padding: 1rem;
    overflow: auto;
    font-size: 0.82rem;
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .image-wrap {
    overflow: auto;
    padding: 1rem;
    display: grid;
    place-items: center;
    background: var(--surface-alt);
  }

  .image-wrap img {
    max-width: 100%;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: #fff;
  }

  .dirs {
    margin: 0.5rem 0 0;
    padding-left: 1.2rem;
  }

  .mono {
    font-family: 'Space Mono', monospace;
  }

  .small {
    font-size: 0.8rem;
  }

  .muted {
    color: var(--muted);
  }

  .error {
    color: var(--danger, #d9534f);
  }

  @media (max-width: 980px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .files {
      max-height: none;
    }
  }
</style>

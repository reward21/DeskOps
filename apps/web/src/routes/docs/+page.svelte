<script>
  import { onMount, onDestroy } from 'svelte';
  import DocsTree from '$lib/components/DocsTree.svelte';

  let roots = [];
  let rootPath = '';
  let loading = true;
  let error = '';
  let selectedRoot = '';
  let selectedPath = '';
  let content = '';
  let contentHtml = '';
  let fileLoading = false;
  let fileError = '';
  let isMarkdown = false;
  let isPdf = false;
  let pdfSrc = '';
  let metaIndex = null;
  let metaError = '';
  let metaMap = new Map();
  let selectedMeta = null;
  let treeSearch = '';
  let treeFilter = 'all';
  let treeFocus = false;
  let treeEl;
  let viewerEl;
  let fileButtons = [];
  let selectedIndex = -1;

  const loadTree = async () => {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/docs/tree');
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Failed to load docs tree.');
      }
      roots = data.roots || [];
      rootPath = roots[0]?.rootPath || '';
    } catch (err) {
      error = err?.message || 'Failed to load docs tree.';
    } finally {
      loading = false;
    }
  };

  const normalizePath = (value) => (value || '').replace(/\\/g, '/').replace(/^\/+/, '');

  const getRootRel = (rootId) => roots.find((root) => root.id === rootId)?.rootRel || '';

  const getRootTitle = (root) => {
    if (!root) return '';
    if (root.name) return root.name;
    const rel = normalizePath(root?.rootRel || '');
    if (rel) return rel.split('/')[0];
    const abs = (root?.rootPath || '').replace(/\\/g, '/');
    const parts = abs.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : 'docs';
  };

  const getRootTitleById = (rootId) => getRootTitle(roots.find((root) => root.id === rootId));

  const getRootDisplayPath = (root) => {
    if (!root) return '';
    const base = root?.rootBaseName || '';
    const rel = normalizePath(root?.rootRel || '');
    if (!base) return rel || root?.rootPath || '';
    if (!rel) return `/${base}`;
    if (root?.name && root.name !== rel) return `/${base}/${root.name}`;
    return `/${base}/${rel}`;
  };

  const getFullPath = (rootId, relPath) => {
    const rootRel = getRootRel(rootId);
    const full = rootRel ? `${rootRel}/${relPath}` : relPath;
    return normalizePath(full);
  };

  const loadMetadata = async () => {
    metaError = '';
    metaIndex = null;
    metaMap = new Map();
    try {
      const res = await fetch('/api/metadata/docs');
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Failed to load docs metadata.');
      }
      metaIndex = data.index;
      const items = Array.isArray(metaIndex?.items) ? metaIndex.items : [];
      const map = new Map();
      for (const item of items) {
        if (!item?.source_path) continue;
        map.set(normalizePath(item.source_path), item);
      }
      metaMap = map;
    } catch (err) {
      metaError = err?.message || 'Failed to load docs metadata.';
    }
  };

  const getTitle = (rootId, node) => {
    if (!node || node.type !== 'file') return node?.name || '';
    const metaKey = getFullPath(rootId, node.path);
    const meta = metaMap.get(metaKey);
    return meta?.title || node.name;
  };

  const escapeHtml = (value) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const formatInline = (value) => {
    let out = value;
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    return out;
  };

  const parseTableRow = (line) => {
    const trimmed = (line || '').trim();
    if (!trimmed.includes('|')) return null;
    let inner = trimmed;
    if (inner.startsWith('|')) inner = inner.slice(1);
    if (inner.endsWith('|')) inner = inner.slice(0, -1);
    const cells = inner.split('|').map((c) => c.trim());
    if (cells.every((c) => c === '')) return null;
    return cells;
  };

  const isSeparatorRow = (cells) =>
    Array.isArray(cells) && cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.trim()));

  const alignFromSep = (cell) => {
    const c = (cell || '').trim();
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  };

  const renderTable = (headerCells, sepCells, bodyRows) => {
    const aligns = sepCells.map(alignFromSep);
    const ths = headerCells
      .map((cell, idx) => `<th style="text-align:${aligns[idx] || 'left'}">${formatInline(escapeHtml(cell))}</th>`)
      .join('');
    const trs = bodyRows
      .map((row) => {
        const tds = row
          .map((cell, idx) => `<td style="text-align:${aligns[idx] || 'left'}">${formatInline(escapeHtml(cell))}</td>`)
          .join('');
        return `<tr>${tds}</tr>`;
      })
      .join('');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  };

  const renderMarkdown = (raw) => {
    const lines = (raw || '').split('\n');
    let html = '';
    let inCode = false;
    let codeBuffer = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.trim().startsWith('```')) {
        if (inCode) {
          html += `<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`;
          codeBuffer = [];
          inCode = false;
        } else {
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        codeBuffer.push(line);
        continue;
      }
      if (line.trim() === '') {
        html += '<div class="md-spacer"></div>';
        continue;
      }
      const headerCells = parseTableRow(line);
      const sepCells = parseTableRow(lines[i + 1] || '');
      if (headerCells && sepCells && isSeparatorRow(sepCells)) {
        const bodyRows = [];
        i += 2;
        while (i < lines.length) {
          const rowCells = parseTableRow(lines[i]);
          if (!rowCells || lines[i].trim() === '') {
            i -= 1;
            break;
          }
          bodyRows.push(rowCells);
          i += 1;
        }
        html += renderTable(headerCells, sepCells, bodyRows);
        continue;
      }
      if (line.startsWith('### ')) {
        html += `<h3>${formatInline(escapeHtml(line.slice(4)))}</h3>`;
        continue;
      }
      if (line.startsWith('## ')) {
        html += `<h2>${formatInline(escapeHtml(line.slice(3)))}</h2>`;
        continue;
      }
      if (line.startsWith('# ')) {
        html += `<h1>${formatInline(escapeHtml(line.slice(2)))}</h1>`;
        continue;
      }
      html += `<p>${formatInline(escapeHtml(line))}</p>`;
    }
    if (inCode && codeBuffer.length) {
      html += `<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`;
    }
    return html;
  };

  const loadFile = async (rootId, path) => {
    selectedRoot = rootId;
    selectedPath = path;
    selectedMeta = null;
    fileLoading = true;
    fileError = '';
    isMarkdown = false;
    isPdf = false;
    pdfSrc = '';
    contentHtml = '';
    try {
      const lowerPath = String(path || '').toLowerCase();
      if (lowerPath.endsWith('.pdf')) {
        isPdf = true;
        const target = `/api/docs/file?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(path)}`;
        pdfSrc = `${target}#toolbar=1&navpanes=1&scrollbar=1`;
        const metaKey = getFullPath(rootId, path);
        selectedMeta = metaMap.get(metaKey) || null;
        content = '';
        return;
      }

      const res = await fetch(`/api/docs/file?root=${encodeURIComponent(rootId)}&path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Failed to load file.');
      }
      content = data.content || '';
      isMarkdown = path.toLowerCase().endsWith('.md');
      if (isMarkdown) {
        contentHtml = renderMarkdown(content);
      }
      const metaKey = getFullPath(rootId, path);
      selectedMeta = metaMap.get(metaKey) || null;
    } catch (err) {
      content = '';
      contentHtml = '';
      fileError = err?.message || 'Failed to load file.';
    } finally {
      fileLoading = false;
    }
  };

  const collectFileButtons = () => {
    if (!treeEl) return [];
    const nodes = Array.from(treeEl.querySelectorAll('[data-docs-path]'));
    fileButtons = nodes;
    selectedIndex = Math.max(
      0,
      fileButtons.findIndex((el) => el?.dataset?.docsPath === selectedPath),
    );
    return fileButtons;
  };

  const selectByIndex = (idx) => {
    if (!fileButtons.length) collectFileButtons();
    if (!fileButtons.length) return;
    const next = Math.max(0, Math.min(fileButtons.length - 1, idx));
    const el = fileButtons[next];
    const rootId = el?.dataset?.docsRoot || '';
    const path = el?.dataset?.docsPath || '';
    if (!path || !rootId) return;
    selectedIndex = next;
    loadFile(rootId, path);
    el?.scrollIntoView({ block: 'nearest' });
  };

  const stepSelection = (delta) => {
    if (!fileButtons.length) collectFileButtons();
    if (!fileButtons.length) return;
    if (selectedIndex < 0) selectedIndex = 0;
    selectByIndex(selectedIndex + delta);
  };

  const onTreeFocus = () => {
    treeFocus = true;
    collectFileButtons();
  };

  const onTreeBlur = () => {
    treeFocus = false;
  };

  $: if (selectedRoot && selectedPath) {
    const metaKey = getFullPath(selectedRoot, selectedPath);
    selectedMeta = metaMap.get(metaKey) || null;
  }

  $: if (!loading) {
    // keep button list fresh after filtering/search/tree load
    queueMicrotask(() => collectFileButtons());
  }

  const onKeyDown = (event) => {
    if (!treeEl) return;
    const active = document.activeElement;
    if (!treeEl.contains(active)) return;
    const tag = active?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      stepSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      stepSelection(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (selectedIndex >= 0) selectByIndex(selectedIndex);
    }
  };

  onMount(async () => {
    await Promise.all([loadTree(), loadMetadata()]);
    window.addEventListener('keydown', onKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', onKeyDown);
  });
</script>

<section class="page">
  <h2>Development / Docs</h2>
  {#if !roots.length}
    <p>File explorer for <code>{rootPath || '/gulfchain/docs'}</code>.</p>
  {/if}
  {#if metaError}
    <p class="error">{metaError}</p>
  {/if}

  {#if loading}
    <p>Loading docs…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <div class="layout">
      <aside
        class="tree"
        bind:this={treeEl}
        tabindex="0"
        on:focusin={onTreeFocus}
        on:focusout={onTreeBlur}
        aria-label="Docs file explorer"
      >
        <div class="tree-head">
          <h3>Docs Explorer</h3>
          <button on:click={loadTree}>Refresh</button>
        </div>
        <div class="tree-controls">
          <input type="search" placeholder="Search docs…" bind:value={treeSearch} />
          <select bind:value={treeFilter}>
            <option value="all">All files</option>
            <option value="md">Markdown</option>
            <option value="pdf">PDF</option>
            <option value="json">JSON</option>
            <option value="other">Other</option>
          </select>
        </div>
        {#each roots as group (group.id)}
          <div class="tree-group">
            <div class="tree-label">{getRootTitle(group)}</div>
            <DocsTree
              node={group.node}
              rootId={group.id}
              selectedPath={selectedPath}
              onSelect={loadFile}
              titleLookup={getTitle}
              search={treeSearch}
              filter={treeFilter}
            />
          </div>
        {/each}
      </aside>
      <div class="viewer" bind:this={viewerEl}>
        {#if fileLoading}
          <p>Loading file…</p>
        {:else if fileError}
          <p class="error">{fileError}</p>
        {:else if selectedPath}
          <div class="viewer-head">
            <span class="mono">
              {getRootTitleById(selectedRoot) ? `${getRootTitleById(selectedRoot)}/` : ''}{selectedPath}
            </span>
          </div>
          <div class="meta-card">
            <div class="meta-title">Metadata</div>
            {#if selectedMeta}
              <div class="meta-row">
                <span>Title</span>
                <span>{selectedMeta.title || selectedPath}</span>
              </div>
              {#if selectedMeta.summary}
                <div class="meta-row">
                  <span>Summary</span>
                  <span>{selectedMeta.summary}</span>
                </div>
              {/if}
              {#if selectedMeta.tags?.length}
                <div class="meta-row">
                  <span>Tags</span>
                  <span class="tag-list">
                    {#each selectedMeta.tags as tag}
                      <span class="tag-pill">{tag}</span>
                    {/each}
                  </span>
                </div>
              {/if}
              {#if selectedMeta.type}
                <div class="meta-row">
                  <span>Type</span>
                  <span>{selectedMeta.type}</span>
                </div>
              {/if}
              {#if selectedMeta.status}
                <div class="meta-row">
                  <span>Status</span>
                  <span>{selectedMeta.status}</span>
                </div>
              {/if}
              {#if selectedMeta.updated_at}
                <div class="meta-row">
                  <span>Updated</span>
                  <span>{selectedMeta.updated_at}</span>
                </div>
              {/if}
              <div class="meta-row">
                <span>Source</span>
                <span class="mono">{selectedMeta.source_path}</span>
              </div>
            {:else}
              <p class="muted">No metadata entry yet. Add one to <code>apps/metadata_indices/docs_index.json</code>.</p>
            {/if}
          </div>
          {#if isPdf}
            <div class="pdf-shell">
              <iframe class="pdf-viewer" src={pdfSrc} title={`PDF preview: ${selectedPath}`} />
            </div>
          {:else if isMarkdown}
            <div class="markdown content">{@html contentHtml}</div>
          {:else}
            <pre class="content">{content}</pre>
          {/if}
        {:else}
          <p>Select a file to view.</p>
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
  p { color: var(--text-muted); }
  .layout {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 1.5rem;
    margin-top: 1.5rem;
  }
  .tree {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
    max-height: 70vh;
    overflow-y: auto;
    overflow-x: auto;
    position: sticky;
    top: 90px;
    outline: none;
  }
  .tree:focus-within {
    border-color: rgba(0, 172, 172, 0.5);
    box-shadow: 0 0 0 2px rgba(0, 172, 172, 0.15);
  }
  .tree-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.4rem;
  }
  .tree-controls {
    display: grid;
    gap: 0.5rem;
    padding: 0.6rem;
    border: 1px solid var(--border);
    background: var(--surface-alt);
    border-radius: 10px;
    margin-bottom: 0.75rem;
  }
  .tree-controls input,
  .tree-controls select {
    width: 100%;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    border-radius: 8px;
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
  }
  .tree-head button {
    border: 1px solid var(--border);
    background: var(--surface-alt);
    color: var(--text);
    border-radius: 8px;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
  }
  .tree-group {
    margin-top: 0.75rem;
  }
  .tree-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 0.35rem;
  }
  .viewer {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
    min-height: 320px;
  }
  .viewer-head {
    margin-bottom: 0.75rem;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  .meta-card {
    border: 1px solid var(--border);
    background: var(--surface-alt);
    border-radius: 10px;
    padding: 0.75rem;
    margin-bottom: 1rem;
    display: grid;
    gap: 0.4rem;
    font-size: 0.9rem;
  }
  .meta-title {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.7rem;
    color: var(--text-muted);
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }
  .meta-row span:first-child {
    color: var(--text-muted);
    min-width: 80px;
  }
  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .tag-pill {
    border: 1px solid var(--border);
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    font-size: 0.75rem;
  }
  .mono {
    font-family: 'Space Mono', monospace;
  }
  .content {
    white-space: pre-wrap;
    font-size: 0.85rem;
  }
  .pdf-shell {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
  }
  .pdf-viewer {
    width: 100%;
    min-height: 75vh;
    border: none;
    display: block;
  }
  .markdown :global(h1) {
    font-size: 1.6rem;
    margin: 0.8rem 0;
  }
  .markdown :global(h2) {
    font-size: 1.3rem;
    margin: 0.8rem 0;
  }
  .markdown :global(h3) {
    font-size: 1.1rem;
    margin: 0.6rem 0;
  }
  .markdown :global(p) {
    margin: 0.35rem 0;
  }
  .markdown :global(.md-spacer) {
    height: 0.6rem;
  }
  .markdown :global(code) {
    font-family: 'Space Mono', monospace;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    padding: 0.1rem 0.35rem;
    border-radius: 6px;
  }
  .markdown :global(pre) {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    padding: 0.75rem;
    border-radius: 10px;
    overflow: auto;
  }
  .markdown :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.6rem 0;
    font-size: 0.85rem;
  }
  .markdown :global(th),
  .markdown :global(td) {
    border: 1px solid var(--border);
    padding: 0.4rem 0.55rem;
    vertical-align: top;
  }
  .markdown :global(th) {
    background: var(--surface-alt);
    font-weight: 600;
  }
  .markdown :global(tr:nth-child(even) td) {
    background: rgba(255, 255, 255, 0.02);
  }
  .markdown :global(a) {
    color: var(--accent);
  }
  .error {
    color: #ffb8b8;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .tree {
      position: static;
    }
  }
</style>

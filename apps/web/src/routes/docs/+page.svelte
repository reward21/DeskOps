<script>
  import { onMount } from 'svelte';
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
  let metaIndex = null;
  let metaError = '';
  let metaMap = new Map();
  let selectedMeta = null;

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

  const renderMarkdown = (raw) => {
    const lines = (raw || '').split('\n');
    let html = '';
    let inCode = false;
    let codeBuffer = [];
    for (const line of lines) {
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
    contentHtml = '';
    try {
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

  $: if (selectedRoot && selectedPath) {
    const metaKey = getFullPath(selectedRoot, selectedPath);
    selectedMeta = metaMap.get(metaKey) || null;
  }

  onMount(async () => {
    await Promise.all([loadTree(), loadMetadata()]);
  });
</script>

<section class="page">
  <h2>Development / Docs</h2>
  <p>File explorer for <code>{rootPath || '/gulfchain/docs'}</code>.</p>
  {#if metaError}
    <p class="error">{metaError}</p>
  {/if}

  {#if loading}
    <p>Loading docs…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <div class="layout">
      <aside class="tree">
        <div class="tree-head">
          <h3>Docs Explorer</h3>
          <button on:click={loadTree}>Refresh</button>
        </div>
        {#each roots as group (group.id)}
          <div class="tree-group">
            <div class="tree-label">{group.node.name}</div>
            <DocsTree
              node={group.node}
              rootId={group.id}
              selectedPath={selectedPath}
              onSelect={loadFile}
              titleLookup={getTitle}
            />
          </div>
        {/each}
      </aside>
      <div class="viewer">
        {#if fileLoading}
          <p>Loading file…</p>
        {:else if fileError}
          <p class="error">{fileError}</p>
        {:else if selectedPath}
          <div class="viewer-head">
            <span class="mono">{selectedRoot ? `${selectedRoot}/` : ''}{selectedPath}</span>
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
          {#if isMarkdown}
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
    height: fit-content;
    position: sticky;
    top: 90px;
  }
  .tree-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
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

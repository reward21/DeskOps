<script>
  import DocsTree from './DocsTree.svelte';

  export let node;
  export let rootId = '';
  export let selectedPath = '';
  export let onSelect = () => {};
  export let depth = 0;
  export let titleLookup = (rootIdValue, nodeValue) => nodeValue?.name || '';
  export let search = '';
  export let filter = 'all';

  let open = false;
  let filteredNode = node;

  const toggle = () => {
    open = !open;
  };

  const normalize = (value) => (value || '').toLowerCase();

  const matchesFilter = (n) => {
    if (!n) return false;
    if (filter === 'all') return true;
    if (n.type !== 'file') return true;
    const name = normalize(n.name);
    if (filter === 'md') return name.endsWith('.md');
    if (filter === 'pdf') return name.endsWith('.pdf');
    if (filter === 'json') return name.endsWith('.json');
    if (filter === 'other') return !name.endsWith('.md') && !name.endsWith('.json') && !name.endsWith('.pdf');
    return true;
  };

  const matchesSearch = (n) => {
    const term = normalize(search);
    if (!term) return true;
    const name = normalize(n?.name);
    const path = normalize(n?.path);
    return name.includes(term) || path.includes(term);
  };

  const filterTree = (n) => {
    if (!n) return null;
    if (n.type === 'file') {
      if (!matchesFilter(n)) return null;
      if (!matchesSearch(n)) return null;
      return n;
    }
    const children = (n.children || [])
      .map((child) => filterTree(child))
      .filter(Boolean);
    if (children.length === 0 && !matchesSearch(n)) return null;
    return { ...n, children };
  };

  $: filteredNode = filterTree(node);
  $: if (search && node?.type === 'dir') open = true;
</script>

{#if filteredNode}
  <div class="node" style={`--depth: ${Math.min(depth, 2)}`}>
    {#if filteredNode?.type === 'dir'}
      <button class="dir" on:click={toggle}>
        <span class="caret">{open ? '▾' : '▸'}</span>
        <span class="label">{filteredNode.name}</span>
      </button>
      {#if open}
        <div class="children">
          {#each filteredNode.children || [] as child (child.path)}
            <DocsTree
              node={child}
              rootId={rootId}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
              search={search}
              filter={filter}
              titleLookup={titleLookup}
            />
          {/each}
        </div>
      {/if}
    {:else}
      <button
        data-docs-root={rootId}
        data-docs-path={filteredNode.path}
        class:selected={selectedPath === filteredNode.path}
        class="file"
        on:click={() => onSelect(rootId, filteredNode.path)}
      >
        {titleLookup(rootId, filteredNode)}
      </button>
    {/if}
  </div>
{/if}

<style>
  .node {
    padding-left: calc(var(--depth) * 0.5rem);
    max-width: 100%;
  }
  .dir,
  .file {
    width: 100%;
    max-width: 100%;
    display: block;
    text-align: left;
    background: transparent;
    border: none;
    color: var(--text);
    padding: 0.25rem 0.35rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
    overflow-wrap: normal;
    word-break: normal;
  }
  .dir {
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .dir .label {
    flex: 1 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
    overflow-wrap: normal;
    word-break: normal;
  }
  .dir:hover,
  .file:hover {
    background: var(--surface-alt);
  }
  .file.selected {
    background: rgba(0, 172, 172, 0.18);
    color: var(--accent);
  }
  .caret {
    display: inline-block;
    width: 1rem;
    color: var(--text-muted);
  }
  .children {
    margin-left: 0.15rem;
  }
</style>

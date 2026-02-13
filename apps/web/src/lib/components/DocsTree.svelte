<script>
  import DocsTree from './DocsTree.svelte';

  export let node;
  export let rootId = '';
  export let selectedPath = '';
  export let onSelect = () => {};
  export let depth = 0;
  export let titleLookup = (rootIdValue, nodeValue) => nodeValue?.name || '';

  let open = node?.type === 'dir';

  const toggle = () => {
    open = !open;
  };
</script>

<div class="node" style={`--depth: ${depth}`}>
  {#if node?.type === 'dir'}
    <button class="dir" on:click={toggle}>
      <span class="caret">{open ? '▾' : '▸'}</span>
      <span class="label">{node.name}</span>
    </button>
    {#if open}
      <div class="children">
        {#each node.children || [] as child (child.path)}
          <DocsTree node={child} rootId={rootId} selectedPath={selectedPath} onSelect={onSelect} depth={depth + 1} />
        {/each}
      </div>
    {/if}
  {:else}
    <button class:selected={selectedPath === node.path} class="file" on:click={() => onSelect(rootId, node.path)}>
      {titleLookup(rootId, node)}
    </button>
  {/if}
</div>

<style>
  .node {
    padding-left: calc(var(--depth) * 0.75rem);
  }
  .dir,
  .file {
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: var(--text);
    padding: 0.25rem 0.35rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
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
    margin-left: 0.35rem;
  }
</style>

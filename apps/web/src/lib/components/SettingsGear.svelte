<script>
  export let theme = 'dark';
  export let onToggleTheme;
  export let llmRead = true;
  export let llmWrite = false;
</script>

<div class="gear">
  <button class="gear-btn" title="Settings">⚙</button>
  <div class="panel">
    <div class="row">
      <span>Theme</span>
      <button on:click={onToggleTheme}>{theme === 'dark' ? 'Dark' : 'Light'}</button>
    </div>
    <div class="row">
      <span>LLM Read</span>
      <input type="checkbox" bind:checked={llmRead} />
    </div>
    <div class="row">
      <span>LLM Write</span>
      <input type="checkbox" bind:checked={llmWrite} />
    </div>
  </div>
</div>

<style>
  .gear {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 20;
  }

  .gear-btn {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-size: 1.2rem;
    box-shadow: 0 12px 25px var(--shadow);
    cursor: pointer;
  }

  .panel {
    margin-top: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 12px 25px var(--shadow);
    display: grid;
    gap: 0.5rem;
    min-width: 220px;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
  }

  .row button {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    padding: 0.35rem 0.6rem;
    border-radius: 6px;
    cursor: pointer;
  }
</style>

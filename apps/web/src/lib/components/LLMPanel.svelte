<script>
  export let title = 'LLM Analyst';
</script>

<section class="panel">
  <h3>{title}</h3>
  <div class="messages">
    <div class="bubble">LLM chat placeholder. Hook to FastAPI later.</div>
  </div>
  <div class="input-row">
    <input placeholder="Ask DeskOps..." />
    <button>Send</button>
  </div>
</section>

<style>
  .panel {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 12px;
    padding: 1rem;
  }

  .messages {
    min-height: 120px;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.75rem;
    background: var(--surface-alt);
    margin-bottom: 0.75rem;
  }

  .bubble {
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .input-row {
    display: flex;
    gap: 0.5rem;
  }

  input {
    flex: 1;
    padding: 0.5rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface-alt);
    color: var(--text);
  }

  button {
    background: var(--accent);
    border: none;
    padding: 0.5rem 0.9rem;
    border-radius: 8px;
    color: #001414;
    font-weight: 600;
    cursor: pointer;
  }
</style>

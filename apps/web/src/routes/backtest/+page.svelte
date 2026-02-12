<script>
  import { onMount } from 'svelte';
  import LLMPanel from '$lib/components/LLMPanel.svelte';
  import { fetchRuns } from '$lib/api';

  let runs = [];
  let loading = true;
  let error = '';

  onMount(async () => {
    try {
      const data = await fetchRuns();
      runs = data.items || [];
    } catch (err) {
      error = err?.message || 'Failed to load runs.';
    } finally {
      loading = false;
    }
  });
</script>

<section class="page">
  <h2>Multigate Backtest</h2>
  <p>Read from SQLite or Postgres. Import pipeline is wired in FastAPI.</p>
  <div class="grid">
    <div class="card">
      <h3>Runs</h3>
      {#if loading}
        <p>Loading runs...</p>
      {:else if error}
        <p class="error">{error}</p>
      {:else if runs.length === 0}
        <p>No runs imported yet.</p>
      {:else}
        <ul>
          {#each runs as run}
            <li>{run.run_id}</li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="card">
      <h3>Signals & Trades</h3>
      <p>Gate decisions, trade paths, and metrics preview.</p>
    </div>
  </div>
  <LLMPanel title="Backtest LLM" />
</section>

<style>
  .page {
    max-width: 1100px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 3rem;
  }
  p { color: var(--text-muted); }
  .grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    margin: 1.5rem 0 2rem;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
  }
  .error {
    color: #ffb8b8;
  }
  ul {
    margin: 0.5rem 0 0;
    padding-left: 1rem;
  }
</style>

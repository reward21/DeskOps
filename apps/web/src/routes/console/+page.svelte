<script>
  import LLMPanel from '$lib/components/LLMPanel.svelte';
</script>

<section class="page">
  <div class="header">
    <h2>Console</h2>
    <p>Operational dashboard and quick actions.</p>
  </div>
  <div class="grid">
    <div class="card">
      <h3>Run Summary</h3>
      <p>Latest backtests, gate stats, and import status will appear here.</p>
    </div>
    <div class="card">
      <h3>Governance Queue</h3>
      <p>Pending GulfSync decisions and approvals.</p>
    </div>
    <div class="card">
      <h3>Data Pipelines</h3>
      <p>SQLite import status and API health.</p>
    </div>
  </div>
  <LLMPanel title="Console LLM" />
</section>

<style>
  .page {
    max-width: none;
    width: 100%;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 3rem;
  }
  .header p {
    color: var(--text-muted);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
    margin: 1.5rem 0 2rem;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
  }
</style>

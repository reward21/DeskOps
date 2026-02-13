<section class="page">
  <h2>GulfSync Governance</h2>
  <p>Coordination surface for consensus, approvals, and audit trail.</p>
  <div class="grid">
    <div class="card">
      <h3>Inbox/Outbox</h3>
      <p>Read/write permissions and routing status.</p>
    </div>
    <div class="card">
      <h3>Governance Contracts</h3>
      <p>Compact summaries and contract pointers.</p>
    </div>
  </div>
</section>

<style>
  .page {
    max-width: none;
    width: 100%;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 3rem;
  }
  p { color: var(--text-muted); }
  .grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    margin-top: 1.5rem;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1rem;
  }
</style>

<section class="hero">
  <div class="copy">
    <p class="eyebrow"><span class="drop">D</span>esk<span class="drop">O</span>ps</p>
    <h1>Unified command surface for GulfChain.</h1>
    <p class="lead">
      Console-first workflow for backtests, governance, and local AI. Built for precise control and
      fast iteration across your entire workspace.
    </p>
    <div class="cta">
      <a href="/console">Enter Console</a>
      <a class="ghost" href="/docs">Read Docs</a>
    </div>
  </div>
  <div class="panel-grid">
    <div class="panel">
      <h3>Backtest Intelligence</h3>
      <p>Import SQLite backtests and track runs without touching raw market files.</p>
    </div>
    <div class="panel">
      <h3>Governance Control</h3>
      <p>GulfSync coordination and decision surfaces mapped to your rules.</p>
    </div>
    <div class="panel">
      <h3>Local LLM Ops</h3>
      <p>Toggleable read/write chat agents that work across your workspace.</p>
    </div>
  </div>
</section>

<style>
  .hero {
    max-width: none;
    width: 100%;
    margin: 0 auto;
    padding: 4rem 1.5rem 3rem;
    display: grid;
    gap: 2rem;
  }

  .eyebrow {
    font-family: 'Space Mono', monospace;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--accent);
  }

  .drop {
    font-size: 1.25em;
  }

  h1 {
    font-size: clamp(2.4rem, 4vw, 3.6rem);
    margin: 0.25rem 0 1rem;
  }

  .lead {
    max-width: 700px;
    color: var(--text-muted);
    font-size: 1.1rem;
  }

  .cta {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .cta a {
    padding: 0.75rem 1.4rem;
    border-radius: 10px;
    background: var(--accent);
    color: #001414;
    font-weight: 600;
  }

  .cta a.ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
  }

  .panel-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .panel {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 14px;
    padding: 1rem;
    box-shadow: 0 20px 40px var(--shadow);
  }
</style>

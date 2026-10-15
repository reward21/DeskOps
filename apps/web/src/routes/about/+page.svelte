<section class="about">
  <div class="hero">
    <div class="hero-main">
      <div class="hero-copy">
        <p class="eyebrow">About GulfChain</p>
        <h1>A local-first research, governance, and operations workspace for systematic trading.</h1>
        <p class="lead">
          GulfChain is organized as a connected multi-repo system. <strong>multigate-backtest</strong> produces run evidence,
          <strong>gulf-sync</strong> routes governance workflows, and <strong>DeskOps</strong> exposes operator controls over
          both. The workspace is built around deterministic files, append-only history, and human-in-the-loop quality gates.
        </p>
      </div>
      <div class="hero-logo-wrap" aria-hidden="true">
        <img class="hero-logo hero-logo-dark" src="/gulfchain2.png" alt="GulfChain logo" />
        <img class="hero-logo hero-logo-light" src="/gulfchain1.png" alt="GulfChain logo" />
      </div>
    </div>
    <div class="pill-row">
      <span class="pill">Research First</span>
      <span class="pill">Quality + Risk Gates</span>
      <span class="pill">Append-Only Audit Trail</span>
      <span class="pill">Local LLM Assisted Ops</span>
    </div>
  </div>

  <div class="card flow">
    <h2>End-to-End Flow</h2>
    <ol>
      <li><strong>Backtest generation:</strong> <code>multigate-backtest/</code> runs strategy tests and writes SQLite + artifacts.</li>
      <li><strong>Contract import:</strong> <code>gulf-sync bridge</code> converts run outputs into compact governance contracts.</li>
      <li><strong>Queue routing:</strong> <code>gulf-sync</code> turns inbox changes into packet + thread outbox actions.</li>
      <li><strong>Handler loop:</strong> local models can respond via handler flows and write structured inbox follow-ups.</li>
      <li><strong>Operator oversight:</strong> <code>DeskOps</code> shows run feeds, GulfSync state, docs, and control surfaces.</li>
      <li><strong>Governance discipline:</strong> docs + canon files capture mission, risk policy, and decision standards.</li>
    </ol>
  </div>

  <div class="workspace">
    <h2>Workspace Map</h2>
    <div class="grid">
      <article class="card">
        <h3><code>DeskOps/</code></h3>
        <p>Operator control plane (Svelte web UI + Go API + FastAPI service) for console, backtest visibility, GulfSync views, and docs.</p>
      </article>
      <article class="card">
        <h3><code>multigate-backtest/</code></h3>
        <p>Backtesting engine and data pipeline. Runs produce SQLite evidence, gate decisions (G0-G5), and artifacts under <code>runs/</code>.</p>
      </article>
      <article class="card">
        <h3><code>gulf-sync/</code></h3>
        <p>Blackboard-style coordination layer. Routes <code>inbox -&gt; packet -&gt; outbox</code>, supports bridge/quant/handler loops, and keeps Git-auditable history.</p>
      </article>
      <article class="card">
        <h3><code>docs/</code></h3>
        <p>Canonical references, governance specs, roadmap/workflow analyses, and index history for project-level decisions.</p>
      </article>
      <article class="card">
        <h3><code>inbox/</code> + <code>gulf-sync/inbox/</code></h3>
        <p>Workspace intake and runtime message queues used for directives, packets, bridge events, and threaded responses.</p>
      </article>
      <article class="card">
        <h3><code>gulfsync_resources/</code> + scaffolds</h3>
        <p>Reference patches, protocol notes, bootstrap assets, and local scaffolding used to accelerate iteration and recovery.</p>
      </article>
    </div>
  </div>

  <div class="card governance">
    <h2>Operating Principles</h2>
    <ul>
      <li>Personal-first build order: research foundation before publication or automation.</li>
      <li>Hard quality discipline: signal selectivity plus risk survival constraints.</li>
      <li>Source-first execution: files and repos are the system of record, not ephemeral chat state.</li>
      <li>Deterministic operations: repeatable local runs, explicit routing, and inspectable artifacts.</li>
      <li>Progressive automation: assistive loops first, execution automation only after controls are proven.</li>
    </ul>
  </div>

  <div class="next">
    <h2>Explore In DeskOps</h2>
    <div class="actions">
      <a href="/console">Open Console</a>
      <a class="ghost" href="/backtest">Backtest Surface</a>
      <a class="ghost" href="/gulf-sync">GulfSync Live</a>
      <a class="ghost" href="/gulf-sync/control">GulfSync Control</a>
      <a class="ghost" href="/docs">Docs Explorer</a>
    </div>
  </div>
</section>

<style>
  .about {
    max-width: none;
    width: 100%;
    margin: 0 auto;
    padding: 3rem 1.5rem 3.25rem;
    display: grid;
    gap: 1rem;
  }

  .hero {
    border: 1px solid var(--border);
    background: linear-gradient(130deg, var(--surface) 8%, color-mix(in srgb, var(--accent) 15%, var(--surface)) 100%);
    border-radius: 18px;
    padding: 1.55rem;
    box-shadow: 0 20px 38px var(--shadow);
  }

  .hero-main {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .hero-copy {
    min-width: 0;
  }

  .hero-logo-wrap {
    width: 110px;
    height: 110px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 82%, var(--accent) 18%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 110px;
  }

  .hero-logo {
    width: 80%;
    height: 80%;
    object-fit: contain;
    display: block;
  }

  .hero-logo-light {
    display: none;
  }

  :global([data-theme='light']) .hero-logo-dark {
    display: none;
  }

  :global([data-theme='light']) .hero-logo-light {
    display: block;
  }

  .eyebrow {
    margin: 0;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-family: 'Space Mono', monospace;
    font-size: 0.8rem;
  }

  h1 {
    margin: 0.45rem 0 0.85rem;
    line-height: 1.15;
    font-size: clamp(1.8rem, 4.1vw, 2.8rem);
  }

  .lead {
    margin: 0;
    max-width: 85ch;
    color: var(--text-muted);
    line-height: 1.58;
  }

  .pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .pill {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.28rem 0.62rem;
    font-size: 0.78rem;
    font-family: 'Space Mono', monospace;
    color: var(--text);
    background: color-mix(in srgb, var(--surface) 70%, var(--accent) 30%);
  }

  .card {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 14px;
    padding: 1rem;
  }

  .flow ol {
    margin: 0.2rem 0 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.45rem;
    color: var(--text-muted);
    line-height: 1.45;
  }

  h2 {
    margin: 0 0 0.62rem;
    font-size: 1.08rem;
  }

  .workspace h2 {
    margin: 0 0 0.75rem;
  }

  .grid {
    display: grid;
    gap: 0.9rem;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  }

  .card h3 {
    margin: 0 0 0.55rem;
    font-size: 0.98rem;
    line-height: 1.3;
  }

  .card p {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .governance ul {
    margin: 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.45rem;
    color: var(--text-muted);
    line-height: 1.45;
  }

  .next {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 14px;
    padding: 1rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  .actions a {
    padding: 0.62rem 1rem;
    border-radius: 9px;
    background: var(--accent);
    color: #031616;
    font-weight: 600;
    border: 1px solid transparent;
  }

  .actions a.ghost {
    background: transparent;
    color: var(--text);
    border-color: var(--border);
    font-weight: 500;
  }

  @media (max-width: 700px) {
    .about {
      padding-top: 2rem;
    }

    .hero-main {
      grid-template-columns: 1fr;
    }

    .hero-logo-wrap {
      width: 88px;
      height: 88px;
      flex-basis: 88px;
    }

    .hero {
      padding: 1.2rem;
    }
  }
</style>

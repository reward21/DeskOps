<script>
  export let open = false;
  export let onToggle;
  export let theme = 'dark';
  export let logoDarkSrc = '';
  export let logoLightSrc = '';

  $: logoSrc = theme === 'dark' ? logoDarkSrc : logoLightSrc;
</script>

<nav class="nav">
  <div class="brand">
    {#if logoSrc}
      <img class="logo-img" src={logoSrc} alt="DeskOps logo" />
    {/if}
    <div class="logo">DeskOps</div>
    <div class="tag">Gulfchain Systems Engineering</div>
  </div>
  <button class="menu" on:click={onToggle} aria-label="Toggle menu">
    <span></span>
    <span></span>
    <span></span>
  </button>
  <div class:open class="links">
    <a href="/">Home</a>
    <a href="/console">Console</a>
    <a href="/backtest">Backtest</a>
    <a href="/gulf-sync">GulfSync</a>
    <a href="/charts">Charts</a>
    <a href="/communities">Communities</a>
    <a href="/docs">Docs</a>
  </div>
</nav>

<style>
  .nav {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    background: var(--surface);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
    color: var(--text);
  }

  .brand {
    display: grid;
    gap: 0.15rem;
    align-items: center;
  }

  .logo {
    font-family: 'Space Mono', monospace;
    font-size: 1.25rem;
    letter-spacing: 0.12em;
    color: var(--text);
  }

  .tag {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .logo-img {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    object-fit: contain;
    border: 1px solid var(--border);
    background: var(--surface-alt);
    padding: 4px;
  }

  .menu {
    display: none;
    gap: 4px;
    flex-direction: column;
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .menu span {
    width: 24px;
    height: 2px;
    background: var(--text);
    display: block;
  }

  .links {
    display: flex;
    gap: 1rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-family: 'Space Mono', monospace;
  }

  .links a {
    padding-bottom: 0.2rem;
    border-bottom: 1px solid transparent;
    color: var(--text);
  }

  .links a:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  @media (max-width: 900px) {
    .menu {
      display: flex;
    }

    .links {
      position: absolute;
      top: 64px;
      right: 1.5rem;
      flex-direction: column;
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 0.75rem 1rem;
      border-radius: 12px;
      box-shadow: 0 14px 30px var(--shadow);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-10px);
      transition: all 0.2s ease;
    }

    .links.open {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0);
    }
  }
</style>

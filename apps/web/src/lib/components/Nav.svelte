<script>
  export let open = false;
  export let onToggle;
  export let theme = 'dark';
  export let logoDarkSrc = '';
  export let logoLightSrc = '';
  let logoFailed = false;

  $: logoSrc = theme === 'dark' ? logoDarkSrc : logoLightSrc;
  $: logoFailed = false;

  const handleLogoError = () => {
    logoFailed = true;
  };
</script>

<nav class="nav">
  <div class="brand">
    <div class="brand-main">
      <div class="logo">DeskOps</div>
    {#if logoSrc && !logoFailed}
      <div class="logo-wrap">
        <img class="logo-img" src={logoSrc} alt="DeskOps logo" on:error={handleLogoError} />
      </div>
    {/if}
    </div>
    <div class="tag">Gulfchain Systems Engineering</div>
  </div>
  <div class="nav-actions">
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
    min-width: 0;
  }

  .brand-main {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .logo {
    font-family: 'Space Mono', monospace;
    font-size: 1.25rem;
    line-height: 1.1;
    letter-spacing: 0.12em;
    color: var(--nav-text);
  }

  .tag {
    font-size: 0.75rem;
    line-height: 1.2;
    color: var(--nav-muted);
  }

  .logo-wrap {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface-alt);
    box-sizing: border-box;
    flex: 0 0 36px;
  }

  .logo-img {
    width: 80%;
    height: 80%;
    object-fit: contain;
    display: block;
  }

  .nav-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
    position: relative;
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
      top: 54px;
      right: 0;
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

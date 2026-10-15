<script>
  import { page } from '$app/stores';
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
      <a class="icon-link" href="/quant" aria-current={$page.url.pathname === '/quant' ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 17l5-6 4 3 7-9M4 5v14h16" />
        </svg>
        <span>Quant</span>
      </a>
      <a class="icon-link" href="/walk-forward-visuals">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 19h18M5 16l4-4 3 2 5-6 2 1" />
          <circle cx="9" cy="12" r="1.2" />
          <circle cx="12" cy="14" r="1.2" />
          <circle cx="17" cy="8" r="1.2" />
        </svg>
        <span>WF Visuals</span>
      </a>
      <a href="/gulf-sync">GulfSync</a>
      <a href="/charts">Charts</a>
      <a class="icon-link" href="/mystic-pools">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 16c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5" />
          <path d="M5 11c1.8 0 1.8-1.25 3.6-1.25S10.4 11 12.2 11s1.8-1.25 3.6-1.25S17.6 11 19.4 11" />
          <path d="M7 6h10" />
        </svg>
        <span>Mystic</span>
      </a>
      <a href="/communities">Communities</a>
      <a href="/about">About</a>
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
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.85rem;
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

  .links a[aria-current='page'] {
    color: var(--accent);
    border-color: var(--accent);
  }

  .icon-link {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .icon-link svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
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

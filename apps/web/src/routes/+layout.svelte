<script>
  import '../app.css';
  import Nav from '$lib/components/Nav.svelte';
  import SettingsGear from '$lib/components/SettingsGear.svelte';
  import { onMount } from 'svelte';

  let menuOpen = false;
  let theme = 'dark';
  let llmRead = true;
  let llmWrite = false;
  const logoDarkSrc = '/gulfchain2.png';
  const logoLightSrc = '/gulfchain1.png';

  const THEME_KEY = 'deskops.ui.theme';

  const applyTheme = (next) => {
    theme = next === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (err) {
        // Ignore storage errors (private mode, quota, etc.).
      }
    }
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  };

  onMount(() => {
    let saved = '';
    if (typeof localStorage !== 'undefined') {
      try {
        saved = String(localStorage.getItem(THEME_KEY) || '').trim();
      } catch (err) {
        saved = '';
      }
    }
    applyTheme(saved || theme);
  });
</script>

<Nav
  open={menuOpen}
  onToggle={() => (menuOpen = !menuOpen)}
  {theme}
  {logoDarkSrc}
  {logoLightSrc}
/>
<slot />
<SettingsGear {theme} onToggleTheme={toggleTheme} bind:llmRead bind:llmWrite />

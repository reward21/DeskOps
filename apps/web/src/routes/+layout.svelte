<script>
  import '../app.css';
  import Nav from '$lib/components/Nav.svelte';
  import SettingsGear from '$lib/components/SettingsGear.svelte';
  import { onMount } from 'svelte';

  let menuOpen = false;
  let theme = 'dark';
  let llmRead = true;
  let llmWrite = false;
  const logoDarkSrc = '/logo-dark.png';
  const logoLightSrc = '/logo-light.png';

  const toggleTheme = () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  };

  onMount(() => {
    document.documentElement.setAttribute('data-theme', theme);
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

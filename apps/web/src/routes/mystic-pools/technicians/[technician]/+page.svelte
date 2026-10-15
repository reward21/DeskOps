<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  let data = null;
  let loading = true;
  let error = '';
  let search = '';
  let selectedDate = 'all';
  let selectedServiceId = '';

  const formatDate = (value) => {
    if (!value) return 'No date';
    const parts = String(value).split('-');
    if (parts.length !== 3) return value;
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
  };

  const weekdayLabel = (value) => {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
  };

  const technicianName = () => decodeURIComponent($page.params.technician || '');
  const customerHref = (name) => `/mystic-pools/customers/${encodeURIComponent(name)}`;
  const hasPhotos = (service) => (service?.photos?.length || 0) > 0;
  const preferredService = (services) => services.find(hasPhotos) || services[0] || null;

  const loadDashboard = async () => {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/mystic/dashboard', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload?.error || 'Failed to load technician pools.');
      data = payload;
      const services = (payload.services || [])
        .filter((service) => (service.assignedTo || 'Unassigned') === technicianName())
        .sort((a, b) => String(b.serviceDate).localeCompare(String(a.serviceDate)) || a.customer.localeCompare(b.customer));
      selectedServiceId = preferredService(services)?.id || '';
    } catch (err) {
      error = err?.message || 'Failed to load technician pools.';
    } finally {
      loading = false;
    }
  };

  onMount(loadDashboard);

  const matchesSearch = (service) => {
    const needle = search.trim().toLowerCase();
    return (
      !needle ||
      service.customer.toLowerCase().includes(needle) ||
      String(service.address || '').toLowerCase().includes(needle) ||
      service.type.toLowerCase().includes(needle) ||
      service.status.toLowerCase().includes(needle) ||
      service.flags.some((flag) => flag.label.toLowerCase().includes(needle))
    );
  };

  const chooseDate = (dateValue) => {
    selectedDate = dateValue;
    selectedServiceId =
      preferredService(filteredServices.filter((service) => dateValue === 'all' || service.serviceDate === dateValue))?.id ||
      preferredService(technicianServices.filter((service) => dateValue === 'all' || service.serviceDate === dateValue))?.id ||
      '';
  };

  $: techName = technicianName();
  $: technicianServices = (data?.services || [])
    .filter((service) => (service.assignedTo || 'Unassigned') === techName)
    .sort((a, b) => String(b.serviceDate).localeCompare(String(a.serviceDate)) || a.customer.localeCompare(b.customer));
  $: dayCounts = Object.values(
    technicianServices.reduce((acc, service) => {
      const date = service.serviceDate || 'No date';
      acc[date] ||= { date, count: 0, photos: 0, reviews: 0 };
      acc[date].count += 1;
      acc[date].photos += service.photos?.length || 0;
      if (service.flags?.some((flag) => flag.level === 'critical' || flag.level === 'warn')) acc[date].reviews += 1;
      return acc;
    }, {})
  ).sort((a, b) => a.date.localeCompare(b.date));
  $: recentDays = [...dayCounts].reverse();
  $: filteredServices = technicianServices.filter(
    (service) => (selectedDate === 'all' || service.serviceDate === selectedDate) && matchesSearch(service)
  );
  $: selectedService =
    filteredServices.find((service) => service.id === selectedServiceId) ||
    preferredService(filteredServices) ||
    technicianServices[0] ||
    null;
  $: photoCount = technicianServices.reduce((sum, service) => sum + (service.photos?.length || 0), 0);
  $: reviewCount = technicianServices.filter((service) =>
    service.flags?.some((flag) => flag.level === 'critical' || flag.level === 'warn')
  ).length;
  $: customerCount = new Set(technicianServices.map((service) => service.customer)).size;
  $: peakDailyCount = Math.max(...dayCounts.map((day) => day.count), 1);
</script>

<section class="tech-page">
  <header class="topbar">
    <div>
      <p class="eyebrow">Mystic Pools</p>
      <h1>{techName}</h1>
    </div>
    <div class="actions">
      <a class="secondary" href="/mystic-pools">All Mystic pools</a>
      <button class="secondary" type="button" on:click={loadDashboard}>Refresh</button>
    </div>
  </header>

  {#if loading}
    <div class="state">Loading technician pools...</div>
  {:else if error}
    <div class="state error">{error}</div>
  {:else if !technicianServices.length}
    <div class="state">No pools are assigned to {techName} in this export.</div>
  {:else}
    <section class="stats" aria-label="Technician service summary">
      <article><span>Services</span><strong>{technicianServices.length}</strong><small>{dayCounts.length} service days</small></article>
      <article><span>Customers</span><strong>{customerCount}</strong><small>assigned pools</small></article>
      <article><span>Photos</span><strong>{photoCount}</strong><small>uploaded visit images</small></article>
      <article class:attention={reviewCount > 0}><span>Needs review</span><strong>{reviewCount}</strong><small>flagged records</small></article>
    </section>

    <section class="workspace">
      <aside class="control-panel">
        <label class="field">
          <span>Search {techName}</span>
          <input bind:value={search} type="search" placeholder="Customer, service, flag..." />
        </label>

        <div class="date-picker">
          <div class="date-picker-head">
            <span>Service day</span>
            <select bind:value={selectedDate} on:change={() => chooseDate(selectedDate)}>
              <option value="all">All days</option>
              {#each recentDays as day}
                <option value={day.date}>{weekdayLabel(day.date)} {formatDate(day.date)} - {day.count} services</option>
              {/each}
            </select>
          </div>
          <div class="date-strip" aria-label="Technician service days">
            <button type="button" class:active={selectedDate === 'all'} on:click={() => chooseDate('all')}>
              <strong>All</strong><span>{technicianServices.length}</span>
            </button>
            {#each recentDays as day}
              <button type="button" class:active={selectedDate === day.date} on:click={() => chooseDate(day.date)}>
                <strong>{weekdayLabel(day.date)}</strong>
                <span>{formatDate(day.date)}</span>
                <em>{day.count}</em>
              </button>
            {/each}
          </div>
        </div>

        <div class="service-list" aria-label="Technician pool services">
          {#each filteredServices as service}
            <button
              type="button"
              class:selected={selectedService?.id === service.id}
              on:click={() => (selectedServiceId = service.id)}
            >
              <span class="service-title" title={service.customer}>{service.customer}</span>
              <span class="service-address" title={service.address || 'Address unavailable'}>
                <b>Address</b>
                {service.address || 'Address unavailable'}
              </span>
              <span class="service-meta">{formatDate(service.serviceDate)} | {service.type}</span>
              {#if service.photos?.length}<span class="photo-count">{service.photos.length} photos</span>{/if}
              {#if service.flags.length}
                <span class="flag-line">
                  {#each service.flags.slice(0, 3) as flag}
                    <em class={flag.level}>{flag.label}</em>
                  {/each}
                </span>
              {/if}
            </button>
          {:else}
            <div class="empty">No pools match the current filters.</div>
          {/each}
        </div>
      </aside>

      <main class="detail">
        {#if selectedService}
          <section class="panel hero-panel">
            <div>
              <span>Selected pool</span>
              <h2><a href={customerHref(selectedService.customer)}>{selectedService.customer}</a></h2>
              <small>{selectedService.address || 'Address unavailable'}</small>
            </div>
            <strong>{formatDate(selectedService.serviceDate)}</strong>
          </section>

          <section class="detail-grid">
            <article class="panel">
              <div class="panel-head"><h2>Service record</h2><span>{selectedService.status}</span></div>
              <div class="facts">
                <div><span>Completed</span><strong>{selectedService.completed || '-'}</strong></div>
                <div><span>Service address</span><strong>{selectedService.address || '-'}</strong></div>
                <div><span>Service</span><strong>{selectedService.type || '-'}</strong></div>
                <div><span>Repeat</span><strong>{selectedService.repeat || '-'}</strong></div>
                <div><span>Photos</span><strong>{selectedService.photos?.length || 0}</strong></div>
              </div>
              <div class="external-links">
                {#if selectedService.serviceUrl}<a href={selectedService.serviceUrl} target="_blank" rel="noreferrer">Open service</a>{/if}
                {#if selectedService.siteUrl}<a href={selectedService.siteUrl} target="_blank" rel="noreferrer">Open site</a>{/if}
              </div>
            </article>

            <article class="panel">
              <div class="panel-head"><h2>Review flags</h2><span>{selectedService.flags.length}</span></div>
              <div class="flag-stack">
                {#each selectedService.flags as flag}
                  <span class={flag.level}>{flag.label}</span>
                {:else}
                  <span class="good">No review flags</span>
                {/each}
              </div>
            </article>

            <article class="panel photo-panel">
              <div class="panel-head"><h2>Visit photos</h2><span>{selectedService.photos?.length || 0}</span></div>
              <div class="photo-gallery">
                {#each selectedService.photos || [] as photo, index}
                  <a href={photo.src} target="_blank" rel="noreferrer" class="photo-card">
                    {#if photo.localPath}
                      <img src={photo.thumbSrc || photo.src} alt={photo.label || `Visit photo ${index + 1}`} loading="lazy" />
                    {:else}
                      <div class="photo-empty">Open photo</div>
                    {/if}
                    <span>{photo.label || `Visit photo ${index + 1}`}</span>
                  </a>
                {:else}
                  <div class="photo-empty">No uploaded visit photos are attached to this service.</div>
                {/each}
              </div>
            </article>

            <article class="panel">
              <div class="panel-head"><h2>Daily workload</h2><span>{dayCounts.length} days</span></div>
              <div class="bars">
                {#each dayCounts as day}
                  <div class="bar-row">
                    <span>{formatDate(day.date)}</span>
                    <div><i style={`width: ${(day.count / peakDailyCount) * 100}%`}></i></div>
                    <strong>{day.count}</strong>
                  </div>
                {/each}
              </div>
            </article>
          </section>
        {/if}
      </main>
    </section>
  {/if}
</section>

<style>
  .tech-page {
    width: 100%;
    padding: 1.5rem;
  }

  .topbar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .eyebrow {
    margin: 0 0 0.35rem;
    color: var(--accent);
    font-family: 'Space Mono', monospace;
    font-size: 0.76rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1,
  h2 {
    margin: 0;
  }

  h1 {
    font-size: 2rem;
  }

  h2 {
    font-size: 1rem;
  }

  button,
  input,
  select {
    font: inherit;
  }

  .actions,
  .external-links,
  .flag-line,
  .flag-stack {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .secondary,
  .external-links a {
    min-height: 38px;
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.8rem;
    margin-bottom: 1rem;
  }

  .stats article,
  .panel,
  .control-panel {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }

  .stats article {
    display: grid;
    gap: 0.3rem;
    min-height: 104px;
    padding: 0.95rem;
  }

  .stats article.attention {
    border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
  }

  .stats span,
  .stats small,
  .field span,
  .date-picker-head span,
  .service-meta,
  .panel-head span,
  .facts span,
  .photo-card span {
    color: var(--text-muted);
  }

  .stats strong {
    font-size: 1.55rem;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }

  .control-panel,
  .detail {
    display: grid;
    gap: 0.9rem;
  }

  .control-panel {
    position: sticky;
    top: 96px;
    padding: 0.95rem;
  }

  .field,
  .date-picker,
  .date-picker-head {
    display: grid;
    gap: 0.4rem;
  }

  .field input,
  .date-picker-head select {
    width: 100%;
    min-height: 40px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    padding: 0 0.75rem;
  }

  .date-strip {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(86px, 1fr);
    gap: 0.45rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
    scroll-snap-type: x proximity;
  }

  .date-strip button,
  .service-list button {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-alt);
    color: var(--text);
    cursor: pointer;
  }

  .date-strip button {
    display: grid;
    align-content: center;
    gap: 0.12rem;
    min-height: 66px;
    min-width: 86px;
    padding: 0.55rem;
    text-align: left;
  }

  .date-strip button:hover,
  .date-strip button.active,
  .service-list button:hover,
  .service-list button.selected,
  .secondary:hover,
  .external-links a:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .date-strip strong,
  .date-strip span,
  .date-strip em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date-strip span {
    color: var(--text-muted);
    font-size: 0.72rem;
  }

  .date-strip em,
  .photo-count,
  .flag-stack span,
  .flag-line em {
    width: max-content;
    padding: 0.12rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-style: normal;
    font-size: 0.72rem;
  }

  .service-list {
    display: grid;
    gap: 0.55rem;
    max-height: 62vh;
    overflow: auto;
    padding-right: 0.2rem;
  }

  .service-list button {
    display: grid;
    gap: 0.4rem;
    width: 100%;
    min-height: 108px;
    height: auto;
    padding: 0.75rem;
    text-align: left;
  }

  .service-list button > * {
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .service-title {
    display: block;
    font-weight: 700;
    line-height: 1.2;
  }

  .service-meta {
    display: block;
    font-size: 0.78rem;
    line-height: 1.25;
  }

  .service-address {
    display: block;
    overflow: visible;
    color: var(--text-muted);
    font-size: 0.78rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
    white-space: normal;
    word-break: normal;
  }

  .service-address b {
    margin-right: 0.3rem;
    color: var(--accent);
    font-weight: 700;
  }

  .photo-count,
  .date-strip em {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    color: var(--accent);
  }

  .critical {
    color: #ffb6a3;
    border-color: #8f3b2e;
  }

  .warn {
    color: #ffd37a;
    border-color: #8b6a28;
  }

  .info,
  .good {
    color: #8ee7cc;
    border-color: #2d7f6b;
  }

  .panel {
    padding: 0.95rem;
  }

  .panel-head,
  .hero-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .hero-panel span {
    color: var(--text-muted);
  }

  .hero-panel h2 {
    margin-top: 0.2rem;
    font-size: 1.35rem;
    overflow-wrap: anywhere;
  }

  .hero-panel h2 a {
    color: inherit;
    text-decoration: none;
  }

  .hero-panel h2 a:hover {
    color: var(--accent);
  }

  .hero-panel small {
    display: block;
    margin-top: 0.25rem;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .facts div {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.7rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-alt);
  }

  .facts strong {
    overflow-wrap: anywhere;
  }

  .photo-panel {
    grid-row: span 2;
  }

  .photo-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.65rem;
  }

  .photo-card {
    display: grid;
    gap: 0.45rem;
    min-width: 0;
  }

  .photo-card img,
  .photo-empty {
    width: 100%;
    aspect-ratio: 4 / 3;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-alt);
  }

  .photo-card img {
    display: block;
    object-fit: cover;
  }

  .photo-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.8rem;
    color: var(--text-muted);
    text-align: center;
  }

  .photo-card span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.82rem;
  }

  .bars {
    display: grid;
    gap: 0.52rem;
  }

  .bar-row {
    display: grid;
    grid-template-columns: minmax(96px, 150px) minmax(0, 1fr) minmax(44px, auto);
    align-items: center;
    gap: 0.55rem;
  }

  .bar-row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-muted);
  }

  .bar-row div {
    height: 12px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-alt);
  }

  .bar-row i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
  }

  .state {
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }

  .state.error {
    color: #ffb6a3;
  }

  .empty {
    padding: 0.8rem;
    color: var(--text-muted);
  }

  @media (max-width: 1050px) {
    .workspace,
    .detail-grid {
      grid-template-columns: 1fr;
    }

    .control-panel {
      position: static;
    }
  }

  @media (max-width: 680px) {
    .tech-page {
      padding: 1rem;
    }

    .topbar,
    .actions {
      align-items: stretch;
      flex-direction: column;
    }

    .stats,
    .facts {
      grid-template-columns: 1fr;
    }

    .bar-row {
      grid-template-columns: 1fr;
    }
  }
</style>

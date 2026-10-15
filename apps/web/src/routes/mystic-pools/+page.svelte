<script>
  import { onMount } from 'svelte';

  let data = null;
  let loading = true;
  let error = '';
  let search = '';
  let view = 'review';
  let selectedDate = 'all';
  let selectedServiceId = '';

  const readingLabels = {
    pH: 'pH',
    freeChlorine: 'Free CL',
    totalChlorine: 'Total CL',
    alkalinity: 'Alkalinity',
    stabilizer: 'Stabilizer',
    temperature: 'Temp',
    phosphates: 'Phosphates'
  };

  const metricRanges = {
    pH: { min: 7.0, max: 8.2, goodMin: 7.2, goodMax: 7.8 },
    freeChlorine: { min: 0, max: 8, goodMin: 1, goodMax: 5 },
    alkalinity: { min: 40, max: 180, goodMin: 70, goodMax: 130 },
    stabilizer: { min: 0, max: 150, goodMin: 30, goodMax: 99 }
  };

  const loadDashboard = async () => {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/mystic/dashboard', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok || !payload.ok) throw new Error(payload?.error || 'Failed to load Mystic pool data.');
      data = payload;
      selectedServiceId = payload.reviewRecords?.[0]?.id || payload.services?.[0]?.id || '';
    } catch (err) {
      error = err?.message || 'Failed to load Mystic pool data.';
    } finally {
      loading = false;
    }
  };

  onMount(loadDashboard);

  const numberValue = (value) => {
    const parsed = Number(String(value || '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const pct = (key, value) => {
    const range = metricRanges[key];
    const parsed = numberValue(value);
    if (!range || parsed === null) return 0;
    const clamped = Math.max(range.min, Math.min(range.max, parsed));
    return Math.round(((clamped - range.min) / (range.max - range.min)) * 100);
  };

  const readingState = (key, value) => {
    const range = metricRanges[key];
    const parsed = numberValue(value);
    if (!range || parsed === null) return 'unknown';
    if (parsed >= range.goodMin && parsed <= range.goodMax) return 'good';
    if (parsed < range.goodMin) return 'low';
    return 'high';
  };

  const formatDate = (value) => {
    if (!value) return 'No date';
    const parts = String(value).split('-');
    if (parts.length !== 3) return value;
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
  };

  const formatDateTime = (value) => {
    if (!value) return 'No scrape yet';
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }).format(new Date(value));
    } catch {
      return value;
    }
  };

  const fileHref = (file) => `/api/mystic/file?path=${encodeURIComponent(file.path || file.name)}`;
  const technicianHref = (name) => `/mystic-pools/technicians/${encodeURIComponent(name)}`;
  const customerHref = (name) => `/mystic-pools/customers/${encodeURIComponent(name)}`;
  const hasPhotos = (service) => (service?.photos?.length || 0) > 0;
  const preferredService = (services) => services.find(hasPhotos) || services[0] || null;

  const weekdayLabel = (value) => {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
  };

  const matchesSearch = (service, needle) =>
    !needle ||
    service.customer.toLowerCase().includes(needle) ||
    String(service.address || '').toLowerCase().includes(needle) ||
    service.type.toLowerCase().includes(needle) ||
    service.repeat.toLowerCase().includes(needle) ||
    service.flags.some((flag) => flag.label.toLowerCase().includes(needle));

  const servicesMatching = (dateValue = selectedDate) => {
    const needle = search.trim().toLowerCase();
    const list = view === 'review' ? data?.reviewRecords || [] : data?.services || [];
    return list.filter((service) => {
      const matchesDate = dateValue === 'all' || service.serviceDate === dateValue;
      return matchesDate && matchesSearch(service, needle);
    });
  };

  const chooseServiceFromDate = (dateValue = selectedDate) => {
    const matches = servicesMatching(dateValue);
    const dateServices = data?.services?.filter((service) => dateValue === 'all' || service.serviceDate === dateValue) || [];
    const next = preferredService(matches) || preferredService(dateServices) || data?.services?.[0];
    selectedServiceId = next?.id || '';
  };

  const chooseDate = (dateValue) => {
    selectedDate = dateValue;
    chooseServiceFromDate(dateValue);
  };

  const moveDate = (direction) => {
    if (!dateOptions.length) return;
    if (selectedDate === 'all') {
      chooseDate(direction > 0 ? dateOptions[0].date : dateOptions.at(-1).date);
      return;
    }
    const index = dateOptions.findIndex((day) => day.date === selectedDate);
    if (index === -1) {
      chooseDate(dateOptions.at(-1).date);
      return;
    }
    const next = dateOptions[index + direction];
    if (next) chooseDate(next.date);
  };

  $: dateOptions = data?.daily || [];
  $: recentDateOptions = [...dateOptions].reverse();
  $: allServices = data?.services || [];
  $: sourceLabel = data?.meta?.source || '';
  $: technicians = Object.values(
    allServices.reduce((acc, service) => {
      const name = service.assignedTo || 'Unassigned';
      acc[name] ||= {
        name,
        serviceCount: 0,
        photoCount: 0,
        reviewCount: 0,
        dates: new Set(),
        latestServiceDate: ''
      };
      acc[name].serviceCount += 1;
      acc[name].photoCount += service.photos?.length || 0;
      if (service.flags?.some((flag) => flag.level === 'critical' || flag.level === 'warn')) acc[name].reviewCount += 1;
      if (service.serviceDate) {
        acc[name].dates.add(service.serviceDate);
        if (!acc[name].latestServiceDate || service.serviceDate > acc[name].latestServiceDate) {
          acc[name].latestServiceDate = service.serviceDate;
        }
      }
      return acc;
    }, {})
  )
    .map((tech) => ({ ...tech, dayCount: tech.dates.size }))
    .sort((a, b) => b.serviceCount - a.serviceCount || a.name.localeCompare(b.name));
  $: baseList = view === 'review' ? data?.reviewRecords || [] : allServices;
  $: filteredServices = baseList.filter((service) => {
    const needle = search.trim().toLowerCase();
    const matchesDate = selectedDate === 'all' || service.serviceDate === selectedDate;
    return matchesSearch(service, needle) && matchesDate;
  });
  $: currentDateIndex = dateOptions.findIndex((day) => day.date === selectedDate);
  $: selectedDateRecord = dateOptions.find((day) => day.date === selectedDate);
  $: selectedDateLabel = selectedDate === 'all' ? 'All service days' : `${weekdayLabel(selectedDate)} ${formatDate(selectedDate)}`;
  $: selectedDateCount = selectedDate === 'all' ? data?.summary?.serviceCount || 0 : selectedDateRecord?.count || 0;
  $: selectedService =
    filteredServices.find((service) => service.id === selectedServiceId) ||
    preferredService(filteredServices) ||
    preferredService(allServices) ||
    null;
  $: topChemicals = data?.chemicals || [];
  $: peakDailyCount = Math.max(...(data?.daily || []).map((day) => day.count), 1);
</script>

<section class="pool-app">
  <header class="topbar">
    <div>
      <p class="eyebrow">Mystic Pools</p>
      <h1>Pool operations</h1>
    </div>
    <div class="actions">
      <button class="secondary" type="button" on:click={loadDashboard}>Refresh</button>
      <a class="secondary" href="/api/mystic/workspace">Workspace</a>
    </div>
  </header>

  {#if loading}
    <div class="state">Loading pool data...</div>
  {:else if error}
    <div class="state error">{error}</div>
  {:else if data}
    <section class="stats" aria-label="Mystic pool data summary">
      <article>
        <span>Total services</span>
        <strong>{data.summary.serviceCount}</strong>
        <small>{data.summary.dayCount} service days</small>
      </article>
      <article>
        <span>Customers</span>
        <strong>{data.summary.customerCount}</strong>
        <small>{data.meta.user || 'Mystic route'}</small>
      </article>
      <article class:attention={data.summary.reviewCount > 0}>
        <span>Needs review</span>
        <strong>{data.summary.reviewCount}</strong>
        <small>{data.summary.criticalCount} priority flags</small>
      </article>
      <article>
        <span>Visit photos</span>
        <strong>{data.summary.photoCount || 0}</strong>
        <small>uploaded images saved locally</small>
      </article>
      <article>
        <span>Last scrape</span>
        <strong>{formatDateTime(data.meta.scrapedAt)}</strong>
        <small>{formatDate(data.meta.latestServiceDate)} latest service</small>
      </article>
    </section>

    <section class="tech-directory" aria-label="Technician pool views">
      <div class="panel-head">
        <h2>Technicians</h2>
        <span>{technicians.length}</span>
      </div>
      <div class="tech-grid">
        {#each technicians as technician}
          <a href={technicianHref(technician.name)}>
            <strong>{technician.name}</strong>
            <span>{technician.serviceCount} services | {technician.dayCount} days</span>
            <small>{technician.photoCount} photos | {technician.reviewCount} reviews</small>
          </a>
        {/each}
      </div>
    </section>

    <section class="workspace-grid">
      <aside class="control-panel">
        <div class="segmented" aria-label="Service view">
          <button type="button" class:active={view === 'review'} on:click={() => (view = 'review')}>
            Review
          </button>
          <button type="button" class:active={view === 'all'} on:click={() => (view = 'all')}>
            All Pools
          </button>
        </div>

        <label class="field">
          <span>Search</span>
          <input bind:value={search} type="search" placeholder="Customer, route note, flag..." />
        </label>

        <div class="date-picker">
          <div class="date-picker-head">
            <span>Service day</span>
            <select bind:value={selectedDate} on:change={() => chooseServiceFromDate(selectedDate)}>
              <option value="all">All days</option>
              {#each recentDateOptions as day}
                <option value={day.date}>{weekdayLabel(day.date)} {formatDate(day.date)} - {day.count} services</option>
              {/each}
            </select>
          </div>

          <div class="date-stepper" aria-label="Service day navigator">
            <button type="button" on:click={() => moveDate(-1)} disabled={selectedDate !== 'all' && currentDateIndex <= 0}>
              Previous
            </button>
            <div>
              <strong>{selectedDateLabel}</strong>
              <span>{selectedDateCount} services</span>
            </div>
            <button
              type="button"
              on:click={() => moveDate(1)}
              disabled={selectedDate !== 'all' && currentDateIndex >= dateOptions.length - 1}
            >
              Next
            </button>
          </div>

          <div class="date-strip" aria-label="Available service days">
            <button type="button" class:active={selectedDate === 'all'} on:click={() => chooseDate('all')}>
              <strong>All</strong>
              <span>{data.summary.serviceCount}</span>
            </button>
            {#each recentDateOptions as day}
              <button type="button" class:active={selectedDate === day.date} on:click={() => chooseDate(day.date)}>
                <strong>{weekdayLabel(day.date)}</strong>
                <span>{formatDate(day.date)}</span>
                <em>{day.count}</em>
              </button>
            {/each}
          </div>
        </div>

        <div class="service-list" aria-label="Pool services">
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
              {#if service.photos?.length}
                <span class="photo-count">{service.photos.length} photos</span>
              {/if}
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

      <main class="pool-detail">
        {#if selectedService}
          <section class="pool-visual" aria-label="Selected pool chemistry visualization">
            <div class="pool-water">
              <div class="ripple r1"></div>
              <div class="ripple r2"></div>
              <div class="pool-name">
                <span>Pool at hand</span>
                <strong><a href={customerHref(selectedService.customer)}>{selectedService.customer}</a></strong>
                <small>{selectedService.address || 'Address unavailable'}</small>
              </div>
            </div>
            <div class="chem-strip">
              {#each ['pH', 'freeChlorine', 'alkalinity', 'stabilizer'] as key}
                <div class="chem-meter {readingState(key, selectedService.readings[key])}">
                  <div>
                    <span>{readingLabels[key]}</span>
                    <strong>{selectedService.readings[key] || '-'}</strong>
                  </div>
                  <div class="track">
                    <i style={`width: ${pct(key, selectedService.readings[key])}%`}></i>
                  </div>
                </div>
              {/each}
            </div>
          </section>

          <section class="detail-grid">
            <article class="panel">
              <div class="panel-head">
                <h2>Service record</h2>
                <span>{selectedService.status}</span>
              </div>
              <div class="facts">
                <div><span>Date</span><strong>{formatDate(selectedService.serviceDate)}</strong></div>
                <div><span>Service address</span><strong>{selectedService.address || '-'}</strong></div>
                <div><span>Completed</span><strong>{selectedService.completed || '-'}</strong></div>
                <div><span>Repeat</span><strong>{selectedService.repeat || '-'}</strong></div>
                <div>
                  <span>Technician</span>
                  {#if selectedService.assignedTo}
                    <strong><a href={technicianHref(selectedService.assignedTo)}>{selectedService.assignedTo}</a></strong>
                  {:else}
                    <strong>-</strong>
                  {/if}
                </div>
              </div>
              <div class="external-links">
                {#if selectedService.serviceUrl}
                  <a href={selectedService.serviceUrl} target="_blank" rel="noreferrer">Open service</a>
                {/if}
                {#if selectedService.siteUrl}
                  <a href={selectedService.siteUrl} target="_blank" rel="noreferrer">Open site</a>
                {/if}
              </div>
            </article>

            <article class="panel photo-panel">
              <div class="panel-head">
                <h2>Visit photos</h2>
                <span>{selectedService.photos?.length || 0}</span>
              </div>
              <div class="photo-gallery">
                {#each selectedService.photos || [] as photo, index}
                  <a href={photo.src} target="_blank" rel="noreferrer" class="photo-card">
                    {#if photo.localPath}
                      <img src={photo.thumbSrc || photo.src} alt={photo.label || `Visit photo ${index + 1}`} loading="lazy" />
                    {:else}
                      <div class="photo-placeholder">Open photo</div>
                    {/if}
                    <span>{photo.label || `Visit photo ${index + 1}`}</span>
                  </a>
                {:else}
                  <div class="photo-empty">No uploaded visit photos are attached to this export yet.</div>
                {/each}
              </div>
            </article>

            <article class="panel">
              <div class="panel-head">
                <h2>Review flags</h2>
                <span>{selectedService.flags.length}</span>
              </div>
              <div class="flag-stack">
                {#each selectedService.flags as flag}
                  <span class={flag.level}>{flag.label}</span>
                {:else}
                  <span class="good">No review flags</span>
                {/each}
              </div>
            </article>

            <article class="panel">
              <div class="panel-head">
                <h2>Readings</h2>
                <span>{formatDate(selectedService.serviceDate)}</span>
              </div>
              <div class="reading-grid">
                {#each Object.entries(selectedService.readings) as [key, value]}
                  <div>
                    <span>{readingLabels[key]}</span>
                    <strong>{value || '-'}</strong>
                  </div>
                {/each}
              </div>
            </article>

            <article class="panel">
              <div class="panel-head">
                <h2>Chemicals added</h2>
                <span>{selectedService.additions.length}</span>
              </div>
              <div class="chemical-list">
                {#each selectedService.additions as addition}
                  <div>
                    <strong>{addition.chemical}</strong>
                    <span>{addition.amountLabel || addition.amount} {addition.unit}</span>
                  </div>
                {:else}
                  <div><strong>No chemicals logged</strong><span>-</span></div>
                {/each}
              </div>
            </article>
          </section>

          <section class="charts">
            <article class="panel">
              <div class="panel-head">
                <h2>Service volume</h2>
                <span>{data.summary.dayCount} days</span>
              </div>
              <div class="bars day-bars">
                {#each data.daily as day}
                  <div class="bar-row">
                    <span>{formatDate(day.date)}</span>
                    <div><i style={`width: ${(day.count / peakDailyCount) * 100}%`}></i></div>
                    <strong>{day.count}</strong>
                  </div>
                {/each}
              </div>
            </article>

            <article class="panel">
              <div class="panel-head">
                <h2>Chemical usage</h2>
                <span>{data.summary.chemicalTypes} types</span>
              </div>
              <div class="bars chemical-bars">
                {#each topChemicals as chemical}
                  <div class="bar-row">
                    <span>{chemical.chemical}</span>
                    <div><i style={`width: ${Math.min(100, chemical.uses * 8)}%`}></i></div>
                    <strong>{chemical.amount} {chemical.unit}</strong>
                  </div>
                {/each}
              </div>
            </article>
          </section>

          <section class="panel table-panel">
            <div class="panel-head">
              <h2>Export files</h2>
              <span>{data.files.length}</span>
            </div>
            <div class="file-grid">
              {#each data.files as file}
                <a href={fileHref(file)}>
                  <strong>{file.name}</strong>
                  <span>{file.sizeLabel} | {formatDateTime(file.modifiedAt)}</span>
                </a>
              {/each}
            </div>
          </section>
        {/if}
      </main>
    </section>
  {/if}
</section>

<style>
  .pool-app {
    width: 100%;
    max-width: none;
    padding: 1.5rem;
  }

  .topbar,
  .stats,
  .tech-directory,
  .workspace-grid,
  .detail-grid,
  .charts {
    width: 100%;
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

  .actions {
    display: flex;
    gap: 0.65rem;
    flex-wrap: wrap;
  }

  .secondary,
  .segmented button {
    min-height: 38px;
    padding: 0 0.8rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }

  .secondary:hover,
  .segmented button.active,
  .service-list button:hover,
  .service-list button.selected {
    border-color: var(--accent);
    color: var(--accent);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.8rem;
    margin-bottom: 1rem;
  }

  .stats article,
  .tech-directory,
  .panel,
  .control-panel,
  .pool-visual {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }

  .stats article {
    display: grid;
    gap: 0.3rem;
    padding: 0.95rem;
    min-height: 104px;
  }

  .stats article.attention {
    border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
  }

  .stats span,
  .stats small,
  .panel-head span,
  .field span,
  .service-meta,
  .reading-grid span,
  .facts span,
  .file-grid span {
    color: var(--text-muted);
  }

  .stats strong {
    font-size: 1.55rem;
  }

  .tech-directory {
    padding: 0.95rem;
    margin-bottom: 1rem;
  }

  .tech-grid {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(180px, 1fr);
    gap: 0.65rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
    scroll-snap-type: x proximity;
  }

  .tech-grid a {
    display: grid;
    gap: 0.22rem;
    min-height: 86px;
    min-width: 180px;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-alt);
    scroll-snap-align: start;
  }

  .tech-grid a:hover,
  .facts a:hover {
    border-color: var(--accent);
    color: var(--accent);
  }

  .tech-grid strong,
  .tech-grid span,
  .tech-grid small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tech-grid span,
  .tech-grid small {
    color: var(--text-muted);
  }

  .workspace-grid {
    display: grid;
    grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }

  .control-panel {
    position: sticky;
    top: 96px;
    display: grid;
    gap: 0.9rem;
    padding: 0.95rem;
  }

  .segmented {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }

  .field {
    display: grid;
    gap: 0.35rem;
  }

  .field input {
    width: 100%;
    min-height: 40px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    padding: 0 0.75rem;
  }

  .date-picker {
    display: grid;
    gap: 0.55rem;
  }

  .date-picker-head {
    display: grid;
    gap: 0.35rem;
  }

  .date-picker-head span {
    color: var(--text-muted);
  }

  .date-picker-head select {
    width: 100%;
    min-height: 40px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    padding: 0 0.75rem;
  }

  .date-stepper {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr) 76px;
    align-items: stretch;
    gap: 0.45rem;
  }

  .date-stepper button,
  .date-strip button {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-alt);
    color: var(--text);
    cursor: pointer;
  }

  .date-stepper button {
    min-height: 58px;
    padding: 0 0.45rem;
    font-size: 0.78rem;
  }

  .date-stepper button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .date-stepper > div {
    display: grid;
    align-content: center;
    gap: 0.15rem;
    min-width: 0;
    min-height: 58px;
    padding: 0.55rem 0.7rem;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
    border-radius: 8px;
    background: var(--bg);
  }

  .date-stepper strong,
  .date-stepper span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date-stepper span {
    color: var(--text-muted);
    font-size: 0.78rem;
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

  .date-strip button {
    display: grid;
    align-content: center;
    gap: 0.12rem;
    min-height: 66px;
    min-width: 86px;
    padding: 0.55rem;
    scroll-snap-align: start;
    text-align: left;
  }

  .date-strip button:hover,
  .date-strip button.active,
  .date-stepper button:not(:disabled):hover {
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

  .date-strip strong {
    font-size: 0.78rem;
  }

  .date-strip span {
    color: var(--text-muted);
    font-size: 0.72rem;
  }

  .date-strip em {
    width: max-content;
    padding: 0.08rem 0.36rem;
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    color: var(--accent);
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
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-alt);
    color: var(--text);
    text-align: left;
    cursor: pointer;
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

  .flag-line,
  .flag-stack {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  em,
  .flag-stack span,
  .output-pill {
    padding: 0.16rem 0.4rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    font-style: normal;
    font-size: 0.72rem;
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

  .pool-detail {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .pool-visual {
    overflow: hidden;
  }

  .pool-water {
    position: relative;
    min-height: 210px;
    background:
      linear-gradient(135deg, rgba(0, 172, 172, 0.28), rgba(25, 91, 164, 0.45)),
      repeating-linear-gradient(155deg, rgba(255, 255, 255, 0.15) 0 2px, transparent 2px 22px);
  }

  .ripple {
    position: absolute;
    inset: 28px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 45%;
  }

  .r2 {
    inset: 58px 92px;
    transform: rotate(-8deg);
  }

  .pool-name {
    position: absolute;
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    display: grid;
    gap: 0.25rem;
    padding: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.32);
  }

  .pool-name span {
    color: rgba(255, 255, 255, 0.78);
    font-family: 'Space Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .pool-name strong {
    color: white;
    font-size: 1.3rem;
    overflow-wrap: anywhere;
  }

  .pool-name a {
    color: inherit;
    text-decoration: none;
  }

  .pool-name a:hover {
    color: #8ee7cc;
  }

  .pool-name small {
    color: rgba(255, 255, 255, 0.78);
    overflow-wrap: anywhere;
  }

  .chem-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    padding: 0.9rem;
  }

  .chem-meter {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .chem-meter > div:first-child {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .chem-meter span {
    color: var(--text-muted);
  }

  .track {
    height: 9px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-alt);
  }

  .track i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
  }

  .chem-meter.low .track i,
  .chem-meter.high .track i {
    background: #ffd37a;
  }

  .detail-grid,
  .charts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .panel {
    padding: 0.95rem;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.8rem;
  }

  .facts,
  .reading-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .facts div,
  .reading-grid div,
  .chemical-list div {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
    padding: 0.7rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-alt);
  }

  .facts strong,
  .chemical-list strong {
    overflow-wrap: anywhere;
  }

  .external-links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.8rem;
  }

  .external-links a {
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .chemical-list {
    display: grid;
    gap: 0.5rem;
  }

  .photo-count {
    width: max-content;
    padding: 0.16rem 0.4rem;
    border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
    border-radius: 999px;
    color: var(--accent);
    font-size: 0.72rem;
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
  .photo-placeholder,
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

  .photo-placeholder,
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
    color: var(--text-muted);
    font-size: 0.82rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chemical-list span {
    color: var(--text-muted);
  }

  .bars {
    display: grid;
    gap: 0.52rem;
  }

  .bar-row {
    display: grid;
    grid-template-columns: minmax(96px, 160px) minmax(0, 1fr) minmax(54px, auto);
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

  .chemical-bars .bar-row i {
    background: #8ee7cc;
  }

  .table-panel {
    overflow: hidden;
  }

  .file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.65rem;
  }

  .file-grid a {
    display: grid;
    gap: 0.3rem;
    min-height: 82px;
    padding: 0.75rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface-alt);
  }

  .file-grid strong {
    overflow-wrap: anywhere;
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
    .stats,
    .tech-directory,
    .chem-strip,
    .detail-grid,
    .charts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .workspace-grid {
      grid-template-columns: 1fr;
    }

    .control-panel {
      position: static;
    }
  }

  @media (max-width: 680px) {
    .pool-app {
      padding: 1rem;
    }

    .topbar,
    .actions {
      align-items: stretch;
      flex-direction: column;
    }

    .stats,
    .chem-strip,
    .detail-grid,
    .charts,
    .facts,
    .reading-grid {
      grid-template-columns: 1fr;
    }

    .bar-row {
      grid-template-columns: 1fr;
    }
  }
</style>

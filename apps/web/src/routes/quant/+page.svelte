<script>
  import { onMount, tick } from 'svelte';
  import { createQuantRequestId } from '$lib/quantRequestId.js';

  let ready = false, error = '', notice = '', submitting = false, stopping = false;
  let connection = {}, sessions = [], experiments = [], session = null, messages = [], earlier = 0;
  let sessionId = '', experimentId = '', experiment = null, draft = '', chatLog;
  let pendingRequest = null, polling = false, refreshing = false;
  const storageKey = 'deskops.quant.session';
  const active = (status) => ['queued', 'running', 'starting'].includes(status);
  $: busy = submitting || active(session?.status);
  $: job = experiment?.research?.at(-1);
  $: runningResearch = (experiment?.research || []).some((item) => active(item.status));
  $: latestRun = experiment?.test_results?.at(-1);
  $: latestMetric = latestRun?.gate_metrics?.[0];

  async function api(payload = null, params = {}) {
    const url = '/api/quant' + (payload ? '' : '?' + new URLSearchParams(params));
    const res = await fetch(url, payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {});
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Could not connect to Quant');
    return data;
  }
  function remember(id) {
    try { localStorage.setItem(storageKey, id); } catch { /* Server history remains available. */ }
  }
  async function applySession(data) {
    const follow = !chatLog || chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 110;
    session = data.session; messages = data.messages; earlier = data.earlier_messages;
    await tick();
    if (follow && chatLog) chatLog.scrollTop = chatLog.scrollHeight;
  }
  async function loadSession(id) {
    error = ''; sessionId = id; pendingRequest = null;
    if (!id) { session = null; messages = []; return; }
    try {
      const data = await api(null, { view: 'session', session_id: id });
      if (sessionId !== id) return;
      await applySession(data); remember(id);
      let savedExperiment = data.session.experiment_id;
      try { savedExperiment = localStorage.getItem(`${storageKey}.experiment.${id}`) || savedExperiment; } catch { /* Optional preference. */ }
      if (savedExperiment && experiments.some((item) => item.experiment_id === savedExperiment)) await loadExperiment(savedExperiment);
    } catch (err) { error = err.message; }
  }
  async function newChat() {
    error = '';
    try {
      const data = await api({ operation: 'create_session' });
      sessionId = data.session.id; draft = ''; pendingRequest = null;
      await applySession(data); remember(sessionId);
      sessions = [data.session, ...sessions];
    } catch (err) { error = err.message; }
  }
  async function refreshOverview() {
    const data = await api();
    connection = data.connection; sessions = data.sessions; experiments = data.experiments;
  }
  async function loadExperiment(id = experimentId) {
    experimentId = id;
    if (!id) { experiment = null; return; }
    const data = await api(null, { view: 'experiment', experiment_id: id });
    if (experimentId === id) {
      experiment = data.experiment;
      if (sessionId) { try { localStorage.setItem(`${storageKey}.experiment.${sessionId}`, id); } catch { /* Optional preference. */ } }
    }
  }
  async function selectExperiment(event) {
    experiment = null; error = '';
    try { await loadExperiment(event.currentTarget.value); } catch (err) { error = err.message; }
  }
  async function refresh() {
    if (refreshing) return;
    refreshing = true; error = '';
    try { await refreshOverview(); await loadExperiment(); }
    catch (err) { error = err.message; }
    finally { refreshing = false; }
  }
  async function submit(kind = 'chat') {
    if (busy || (kind === 'chat' && !draft.trim())) return;
    error = ''; notice = ''; submitting = true;
    try {
      if (!sessionId) {
        const created = await api({ operation: 'create_session' });
        sessionId = created.session.id; remember(sessionId);
        await applySession(created);
      }
      const payload = { operation: 'submit', kind, session_id: sessionId, experiment_id: experimentId || null,
        message: kind === 'chat' ? draft.trim() : undefined, revision: experiment?.revision };
      const signature = JSON.stringify(payload);
      if (!pendingRequest || pendingRequest.signature !== signature) {
        pendingRequest = { signature, id: createQuantRequestId() };
      }
      payload.request_id = pendingRequest.id;
      // Keep this request ID after a connection error so retrying cannot repeat actions.
      const data = await api(payload);
      await applySession(data); pendingRequest = null;
      if (kind === 'chat') draft = '';
      await refreshOverview();
      if (!active(data.session.status)) await loadExperiment(data.session.experiment_id || experimentId);
    } catch (err) { error = err.message; }
    finally { submitting = false; }
  }
  async function stopResearch() {
    stopping = true; error = '';
    try {
      const data = await api({ operation: 'stop_research', experiment_id: experimentId });
      notice = data.jobs.length ? 'Stop requested. The current operation may take a moment to finish.' : 'There is no active research to stop.';
      await loadExperiment();
    } catch (err) { error = err.message; }
    finally { stopping = false; }
  }
  async function poll() {
    if (polling || !sessionId) return;
    polling = true;
    const id = sessionId;
    try {
      const data = await api(null, { view: 'session', session_id: id });
      if (id !== sessionId) return;
      const finished = active(session?.status) && !active(data.session.status);
      await applySession(data);
      if (finished) {
        await refreshOverview();
        const created = [...data.messages].reverse().find((m) => m.request_id === data.session.active_request && m.tool_name === 'create_experiment' && !toolResult(m).error);
        await loadExperiment(created ? toolResult(created).experiment_id : experimentId);
      }
    } catch (err) { error = err.message; }
    finally { polling = false; }
  }
  const pretty = (value) => JSON.stringify(value, null, 2);
  function toolResult(message) { try { return JSON.parse(message.content); } catch { return {}; } }
  const failedResult = (result) => !!result.error || ['failed', 'incomplete', 'timed_out', 'cancelled'].includes(result.status);
  const labels = { inspect_context: 'Read SPY inputs', list_templates: 'Listed templates', create_experiment: 'Create experiment',
    edit_experiment: 'Save configuration', generate_risk_matrix: 'Generated risk matrix', run_experiment: 'Backtest result',
    configure_research: 'Saved research settings', start_research: 'Research started', research_status: 'Research status',
    inspect_experiment: 'Read experiment', list_experiments: 'Listed experiments', stop_research: 'Stop requested' };
  const number = (v, digits = 2) => typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: digits }) : '—';
  const percent = (v) => typeof v === 'number' && Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : '—';
  const date = (value) => value ? new Date(value).toLocaleString() : '';

  onMount(() => {
    let disposed = false;
    (async () => {
      try {
        await refreshOverview();
        if (disposed) return;
        let saved = '';
        try { saved = localStorage.getItem(storageKey) || ''; } catch { /* Optional preference. */ }
        if (sessions.some((s) => s.id === saved)) await loadSession(saved);
        if (!experimentId && experiments.length) await loadExperiment(experiments[0].experiment_id);
      } catch (err) { error = err.message; }
      finally { ready = true; }
    })();
    const chatTimer = setInterval(poll, 2500);
    const researchTimer = setInterval(() => {
      if (runningResearch && experimentId) loadExperiment().catch((err) => error = err.message);
    }, 10000);
    return () => { disposed = true; clearInterval(chatTimer); clearInterval(researchTimer); };
  });
</script>

<svelte:head><title>Quant · DeskOps</title><meta name="description" content="Chat with your SPY research agent, run backtests and follow experiments." /></svelte:head>

<main class="quant-page">
  <header class="page-heading">
    <div><div class="eyebrow">MULTIGATE / RESEARCH AGENT</div><h1>Quant<span>.</span></h1><p>Your workspace for SPY research. Ask, test, refine.</p></div>
    <div class="connection"><span class:online={connection.online && connection.model_available} class="dot"></span>
      <div><strong>{connection.model || 'Connecting…'}</strong><small>{!ready ? 'Checking connection' : !connection.online ? 'Ollama offline' : !connection.model_available ? 'Model not installed' : 'Local model connected'}</small></div>
      <button class="icon-button" on:click={refresh} disabled={refreshing} aria-label="Refresh Quant" title="Refresh">↻</button>
    </div>
  </header>

  {#if error}<div class="banner error" role="alert">{error}</div>{/if}
  {#if notice}<div class="banner" role="status">{notice}</div>{/if}
  {#if ready && !connection.online}<div class="banner">Open Ollama on this Mac, then refresh. Saved conversations and experiment controls remain available.</div>{/if}

  <div class="workspace">
    <section class="chat-panel" aria-label="Quant chat">
      <div class="chat-toolbar">
        <div><span class="section-label">CONVERSATION</span><span class="scope">SPY underlying</span></div>
        <div class="chat-options">
          <select aria-label="Saved conversations" value={sessionId} on:change={(event) => loadSession(event.currentTarget.value)} disabled={submitting}>
            <option value="">Choose a conversation</option>
            {#each sessions as item}<option value={item.id}>{item.title}</option>{/each}
          </select>
          <button on:click={newChat} disabled={submitting}>＋ New chat</button>
        </div>
      </div>

      <div class="chat-log" bind:this={chatLog} role="log" aria-label="Conversation messages" aria-live="polite">
        {#if !ready}<div class="empty"><span class="loading-dot"></span><p>Opening your research workspace…</p></div>
        {:else if !messages.length}
          <div class="empty">
            <div class="quant-mark"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 44l13-17 10 9 17-24M12 12v40h40"/><circle cx="25" cy="27" r="3"/><circle cx="35" cy="36" r="3"/></svg></div>
            <div class="eyebrow">FROM A QUESTION TO AN EXPERIMENT</div>
            <h2>What would you like to test?</h2>
            <p>Ask about your data, build a strategy configuration,<br class="desktop-break"/> or continue refining an experiment.</p>
            <div class="suggestions">
              <button on:click={() => draft = 'What SPY data is available, and what can we test with it?'}><span>01</span> Explore SPY data <b>↗</b></button>
              <button on:click={() => draft = 'Create a new SPY experiment with strategy_id Strategy_002_ORB and gate_id GA1_RYANB for January 2025.'}><span>02</span> Create an experiment <b>↗</b></button>
              <button on:click={() => draft = 'Inspect the selected experiment and explain its latest results and what should be tested next.'}><span>03</span> Review recent results <b>↗</b></button>
            </div>
          </div>
        {:else}
          {#if earlier}<p class="history-note">Showing recent messages. Earlier history remains saved.</p>{/if}
          {#each messages as message, i}
            {#if message.role === 'tool'}
              {@const result = toolResult(message)}
              <details class="tool-card" class:tool-error={failedResult(result)}>
                <summary><span class="tool-symbol">{failedResult(result) ? '!' : '✓'}</span><strong>{labels[message.tool_name] || message.tool_name.replaceAll('_', ' ')}</strong><span>{result.error ? 'Needs attention' : result.status || (result.revision ? `Revision ${result.revision}` : 'Complete')}</span></summary>
                {#if result.error}<p>{result.error}</p>{/if}
                <pre>{pretty(result)}</pre>
              </details>
            {:else}
              <article class="message" class:user-message={message.role === 'user'}>
                <div class="message-author">{message.role === 'user' ? 'YOU' : 'QUANT'}<time>{date(message.at)}</time></div>
                <div class="message-content">{message.content}</div>
              </article>
            {/if}
          {/each}
        {/if}
        {#if busy}<div class="thinking" role="status"><span class="loading-dot"></span>Quant is working… <small>You can leave this page; progress is saved.</small></div>{/if}
        {#if session?.error}<div class="banner error" role="alert">{session.error}</div>{/if}
      </div>

      <form class="composer" on:submit|preventDefault={() => submit()}>
        <label class="sr-only" for="quant-message">Message Quant</label>
        <textarea id="quant-message" bind:value={draft} maxlength="4000" rows="3" placeholder="Ask Quant a question or describe an experiment…" disabled={!ready || busy}
          on:keydown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit(); } }}></textarea>
        <div class="composer-footer"><span>{experiment ? `Working with ${experiment.name}` : 'Select an experiment to give Quant context'}<small>Enter to send · Shift + Enter for a new line</small></span>
          <button class="primary send" type="submit" disabled={!ready || busy || !draft.trim()}>{busy ? 'Working…' : 'Send'} <span aria-hidden="true">↑</span></button></div>
      </form>
    </section>

    <aside class="research-panel" aria-label="Experiment controls">
      <div class="panel-heading"><span class="section-label">EXPERIMENT</span><button class="text-button" on:click={refresh} disabled={refreshing}>Refresh</button></div>
      <label class="sr-only" for="experiment">Selected experiment</label>
      <select id="experiment" value={experimentId} on:change={selectExperiment} disabled={submitting}>
        <option value="">Choose an experiment</option>
        {#each experiments as item}<option value={item.experiment_id}>{item.name} · r{item.revision}</option>{/each}
      </select>
      {#if experiment}
        <div class="experiment-title"><h2>{experiment.name}</h2><span class="revision">Revision {experiment.revision}</span></div>
        <dl class="settings-list"><div><dt>Strategy</dt><dd>{experiment.documents.strategy.name}</dd></div><div><dt>Risk gate</dt><dd>{experiment.gate_id}</dd></div><div><dt>Period</dt><dd>{experiment.documents.config.runtime.date_start}<br/>→ {experiment.documents.config.runtime.date_end}</dd></div></dl>
        <div class="experiment-actions">
          <button class="primary" on:click={() => submit('run_experiment')} disabled={busy || runningResearch}>Run backtest <span aria-hidden="true">↗</span></button>
          <button on:click={() => submit('start_research')} disabled={busy || runningResearch}>Start research</button>
          <button on:click={() => submit('generate_risk_matrix')} disabled={busy || runningResearch}>Generate matrix</button>
        </div>
        <section class="research-status">
          <div class="panel-heading"><span class="section-label">RESEARCH</span><span class="status-pill" class:live={runningResearch}>{job?.status || 'Not started'}</span></div>
          {#if job}
            <div class="research-numbers"><div><strong>{job.successful_evaluations ?? 0}</strong><span>Evaluations</span></div><div><strong>{job.failed_iterations ?? 0}</strong><span>Failures</span></div><div><strong>{job.target_met ? 'Met' : 'Not met'}</strong><span>Target</span></div></div>
            {#if runningResearch}<p class="muted">{(job.phase || 'starting').replaceAll('_', ' ')} · iteration {job.current_iteration || 0}{job.policy?.max_iterations ? ` of ${job.policy.max_iterations}` : ''}</p>{/if}
            {#if job.best_development || job.best_validation}
              <div class="returns"><div><span>Selected return</span><span>Development</span><span>Validation</span></div><div><strong>After costs</strong><strong>{percent(job.best_development?.strategy_return_pct)}</strong><strong>{percent(job.best_validation?.strategy_return_pct)}</strong></div></div>
            {/if}
            {#if job.stop_reason === 'requested'}<p class="muted">Stopped at your request. Any cancelled backtest remains in the history.</p>{/if}
            {#if job.last_error}<p class="failure-note">{typeof job.last_error === 'string' ? job.last_error : job.last_error.message || pretty(job.last_error)}</p>{/if}
            {#if runningResearch}<button class="stop" on:click={stopResearch} disabled={stopping}>{stopping ? 'Requesting stop…' : 'Stop research'}</button>{/if}
            <p class="footnote">Completion and target performance are tracked separately.</p>
          {:else}<p class="muted">Run a backtest or start a research cycle. Results will appear here.</p>{/if}
        </section>
        {#if latestRun}
          <section class="latest"><div class="panel-heading"><span class="section-label">LATEST BACKTEST</span><span class="muted">{latestRun.status}</span></div>
            {#if latestRun.window}<p class="muted">{latestRun.window[0]} → {latestRun.window[1]}</p>{/if}
            {#if latestMetric}<dl class="settings-list"><div><dt>Trades</dt><dd>{number(latestMetric.trade_count, 0)}</dd></div><div><dt>Win rate</dt><dd>{latestMetric.win_rate == null ? '—' : `${number(latestMetric.win_rate * 100)}%`}</dd></div><div><dt>Avg. holding time</dt><dd>{number(latestMetric.avg_hold)} min</dd></div><div><dt>Ending equity</dt><dd>${number(latestMetric.ending_equity)}</dd></div></dl>{/if}
          </section>
        {/if}
        <details class="config-details"><summary>View configuration</summary><p class="muted">Experiment {experiment.experiment_id}</p>
          {#each ['config', 'strategy', 'gate', 'matrix'] as document}<details><summary>{document === 'config' ? 'Backtest configuration' : document === 'gate' ? 'Risk gate' : document === 'matrix' ? 'Risk matrix' : 'Strategy'}</summary><pre>{pretty(experiment.documents[document])}</pre></details>{/each}
          <details><summary>Research limits & metrics</summary><pre>{pretty(experiment.research_settings)}</pre></details>
        </details>
      {:else}<div class="no-experiment"><p>Your research starts here.</p><span>Choose a saved experiment, or ask Quant to create one in chat.</span></div>{/if}
      <div class="scope-note"><span class="dot online"></span> SPY underlying research<span>Options execution is not connected.</span></div>
    </aside>
  </div>
</main>

<style>
.quant-page {
  max-width:1600px;
  margin:auto;
  padding:2rem 2rem 2.5rem
}
button,select,textarea {
  font:inherit;
  color:var(--text)
}
button,select {
  border:1px solid var(--border);
  border-radius:8px;
  background:var(--surface-alt);
  padding:.6rem .8rem
}
button {
  cursor:pointer;
  transition:border-color .15s,background .15s
}
button:hover:not(:disabled) {
  border-color:var(--accent)
}
button:disabled {
  opacity:.4;
  cursor:not-allowed
}
button:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible {
  outline:2px solid var(--accent);
  outline-offset:3px
}
select {
  max-width:100%;
  min-width:0
}
p {
  line-height:1.5
}
.page-heading {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:1rem;
  margin-bottom:1.7rem
}
.eyebrow,.section-label {
  font:10px 'Space Mono',monospace;
  letter-spacing:.14em;
  color:var(--text-muted)
}
h1 {
  font-size:2.8rem;
  letter-spacing:-.06em;
  margin:.3rem 0
}
.page-heading h1 span {
  color:var(--accent)
}
.page-heading p {
  color:var(--text-muted);
  margin:0;
  font-size:.93rem
}
.connection {
  display:flex;
  align-items:center;
  gap:.75rem;
  padding:.75rem 1rem;
  border:1px solid var(--border);
  border-radius:10px;
  background:var(--surface)
}
.connection strong {
  font-size:.83rem;
  font-weight:500
}
.connection small {
  display:block;
  font-size:.72rem;
  color:var(--text-muted);
  margin-top:.2rem
}
.dot {
  display:inline-block;
  width:7px;
  height:7px;
  border-radius:50%;
  background:var(--text-muted);
  flex-shrink:0
}
.dot.online {
  background:var(--accent);
  box-shadow:0 0 10px #00acac33
}
.icon-button {
  background:none;
  border:0;
  font-size:1.3rem;
  padding:.2rem .35rem
}
.workspace {
  display:grid;
  grid-template-columns:minmax(0,1fr) 340px;
  border:1px solid var(--border);
  border-radius:14px;
  overflow:hidden;
  background:var(--surface);
  box-shadow:0 12px 35px var(--shadow);
  height:calc(100dvh - 290px);
  min-height:610px;
  max-height:1000px
}
.chat-panel {
  display:flex;
  flex-direction:column;
  min-width:0;
  height:100%;
  min-height:0
}
.chat-toolbar {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:1rem;
  padding:1.05rem 1.3rem;
  border-bottom:1px solid var(--border);
  flex-wrap:wrap
}
.scope {
  font-size:.7rem;
  border-left:1px solid var(--border);
  margin-left:.7rem;
  padding-left:.7rem;
  color:var(--text-muted)
}
.chat-options {
  display:flex;
  gap:.5rem
}
.chat-options select {
  width:180px;
  font-size:.73rem;
  background:transparent
}
.chat-options button {
  font-size:.73rem;
  white-space:nowrap
}
.chat-log {
  flex:1;
  overflow:auto;
  overscroll-behavior:contain;
  padding:1.5rem;
  scroll-behavior:smooth
}
.empty {
  height:100%;
  min-height:370px;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  text-align:center
}
.quant-mark {
  width:70px;
  height:70px;
  padding:15px;
  border-radius:19px;
  background:var(--surface-alt);
  border:1px solid var(--border);
  margin-bottom:1.6rem;
  transform:rotate(-4deg)
}
.quant-mark svg {
  fill:none;
  stroke:var(--accent);
  stroke-width:2.2;
  stroke-linecap:round;
  stroke-linejoin:round
}
.empty h2 {
  font-size:1.75rem;
  letter-spacing:-.04em;
  margin:1rem 0 .3rem;
  font-weight:500
}
.empty p {
  font-size:.9rem;
  color:var(--text-muted);
  margin:.4rem 0 1.5rem
}
.suggestions {
  display:grid;
  gap:.5rem;
  width:min(370px,100%)
}
.suggestions button {
  display:flex;
  align-items:center;
  gap:1rem;
  text-align:left;
  background:transparent;
  padding:.9rem 1rem;
  font-size:.83rem
}
.suggestions span {
  font:10px 'Space Mono',monospace;
  color:var(--accent)
}
.suggestions b {
  margin-left:auto;
  font-weight:400;
  color:var(--text-muted)
}
.message {
  max-width:100%;
  padding:1rem 0 1.2rem
}
.message-author {
  font:10px 'Space Mono',monospace;
  color:var(--accent);
  letter-spacing:.12em;
  display:flex;
  gap:.75rem;
  align-items:center;
  margin-bottom:.6rem
}
.message-author time {
  font:10px 'Space Grotesk',sans-serif;
  letter-spacing:0;
  color:var(--text-muted)
}
.message-content {
  white-space:pre-wrap;
  overflow-wrap:anywhere;
  line-height:1.7;
  font-size:.9rem
}
.user-message {
  padding:1rem 1.2rem;
  background:var(--surface-alt);
  border:1px solid var(--border);
  border-radius:10px;
  margin:0 0 .8rem
}
.user-message .message-author {
  color:var(--text-muted)
}
.tool-card {
  border:1px solid var(--border);
  border-radius:8px;
  margin:.45rem 0;
  font-size:.78rem;
  background:var(--surface-alt)
}
summary {
  cursor:pointer
}
.tool-card summary {
  display:flex;
  gap:.6rem;
  align-items:center;
  padding:.75rem .9rem
}
.tool-card summary strong {
  font-weight:500
}
.tool-card summary>span:last-child {
  margin-left:auto;
  color:var(--text-muted);
  font-size:.68rem
}
.tool-symbol {
  color:var(--accent)
}
.tool-error .tool-symbol,.failure-note {
  color:#e59383
}
.tool-card p {
  padding:0 1rem
}
pre {
  font:11px/1.6 'Space Mono',monospace;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
  max-height:330px;
  overflow:auto;
  padding:1rem;
  border-top:1px solid var(--border);
  margin:0;
  color:var(--text-muted)
}
.thinking {
  display:flex;
  align-items:center;
  gap:.6rem;
  font-size:.85rem;
  padding:1rem 0;
  color:var(--accent);
  flex-wrap:wrap
}
.thinking small {
  color:var(--text-muted);
  font-size:.73rem
}
.loading-dot {
  display:inline-block;
  width:7px;
  height:7px;
  background:var(--accent);
  border-radius:50%;
  animation:pulse 1.4s infinite
}
@keyframes pulse {
  50% {
    opacity:.3
  }
}
.composer {
  margin:0 1.3rem 1.3rem;
  border:1px solid var(--border);
  border-radius:10px;
  background:var(--surface-alt);
  padding:.9rem 1rem
}
.composer:focus-within {
  border-color:var(--accent)
}
textarea {
  display:block;
  resize:vertical;
  min-height:68px;
  max-height:200px;
  width:100%;
  background:none;
  border:0;
  font-size:.9rem;
  line-height:1.5
}
textarea:focus-visible {
  outline:none
}
textarea::placeholder {
  color:var(--text-muted)
}
.composer-footer {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:1rem;
  margin-top:.6rem
}
.composer-footer>span {
  font-size:.69rem;
  color:var(--text-muted);
  overflow-wrap:anywhere
}
.composer-footer small {
  display:block;
  font-size:.63rem;
  opacity:.8;
  margin-top:.3rem
}
.primary {
  background:var(--accent);
  border-color:var(--accent);
  color:#001b1b;
  font-weight:600
}
.send {
  padding:.65rem 1rem;
  white-space:nowrap
}
.send span {
  margin-left:1rem;
  font-size:1.1rem
}
.research-panel {
  border-left:1px solid var(--border);
  padding:1.3rem;
  min-width:0;
  background:var(--bg);
  overflow-y:auto
}
.panel-heading {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:.5rem;
  margin-bottom:.8rem
}
.text-button {
  border:0;
  background:none;
  font-size:.7rem;
  color:var(--accent);
  padding:0
}
.research-panel>select {
  width:100%;
  font-size:.8rem
}
.experiment-title {
  margin:1.2rem 0
}
.experiment-title h2 {
  font-size:1.02rem;
  line-height:1.4;
  font-weight:500;
  margin:0 0 .6rem;
  overflow-wrap:anywhere
}
.revision {
  font-size:.65rem;
  border:1px solid var(--border);
  border-radius:4px;
  color:var(--text-muted);
  padding:.2rem .35rem
}
.settings-list {
  margin:0;
  font-size:.76rem
}
.settings-list>div {
  display:flex;
  justify-content:space-between;
  gap:1rem;
  padding:.5rem 0
}
.settings-list dt {
  color:var(--text-muted);
  flex-shrink:0
}
.settings-list dd {
  margin:0;
  text-align:right;
  overflow-wrap:anywhere;
  line-height:1.4
}
.experiment-actions {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:.5rem;
  margin:1.3rem 0
}
.experiment-actions button {
  font-size:.76rem
}
.experiment-actions .primary {
  grid-column:1/-1;
  text-align:left;
  display:flex;
  justify-content:space-between;
  padding:.85rem 1rem
}
.research-status,.latest,.config-details {
  border-top:1px solid var(--border);
  padding-top:1.1rem;
  margin-top:1.1rem
}
.status-pill {
  font-size:.66rem;
  text-transform:capitalize;
  color:var(--text-muted);
  padding:.25rem .4rem;
  border-radius:5px;
  background:var(--surface-alt)
}
.status-pill.live {
  color:var(--accent)
}
.research-numbers {
  display:grid;
  grid-template-columns:1fr 1fr 1fr;
  gap:.5rem
}
.research-numbers strong {
  display:block;
  font:500 1.05rem 'Space Grotesk',sans-serif
}
.research-numbers span {
  font-size:.63rem;
  color:var(--text-muted)
}
.returns {
  margin-top:1.1rem
}
.returns>div {
  display:grid;
  grid-template-columns:1fr 1fr 1fr;
  gap:.2rem;
  font-size:.58rem;
  color:var(--text-muted)
}
.returns>div+div {
  margin-top:.5rem;
  font-size:.7rem;
  color:var(--text)
}
.returns strong {
  font-weight:500
}
.muted,.footnote,.history-note {
  color:var(--text-muted);
  font-size:.73rem
}
.footnote {
  font-size:.66rem;
  line-height:1.5;
  margin-bottom:0
}
.stop {
  width:100%;
  margin-top:.7rem;
  font-size:.75rem;
  color:#e59383
}
.config-details>summary {
  font-size:.76rem;
  color:var(--text-muted)
}
.config-details details {
  margin:.8rem 0;
  border:1px solid var(--border);
  border-radius:5px
}
.config-details details summary {
  font-size:.7rem;
  padding:.6rem
}
.config-details .muted {
  overflow-wrap:anywhere;
  font-size:.65rem
}
.scope-note {
  border-top:1px solid var(--border);
  padding-top:1rem;
  margin-top:1.3rem;
  font-size:.7rem;
  color:var(--text-muted)
}
.scope-note>.dot {
  width:5px;
  height:5px;
  margin-right:.4rem
}
.scope-note>span:last-child {
  display:block;
  font-size:.65rem;
  margin:.4rem 0 0 .8rem
}
.no-experiment {
  padding:2rem .2rem;
  color:var(--text-muted);
  font-size:.85rem;
  line-height:1.5
}
.no-experiment span {
  font-size:.8rem
}
.banner {
  padding:.8rem 1rem;
  margin-bottom:.8rem;
  border:1px solid var(--border);
  border-radius:8px;
  background:var(--surface-alt);
  font-size:.8rem;
  line-height:1.5
}
.banner.error {
  color:#e59383;
  border-color:#71473f
}
.sr-only {
  position:absolute;
  width:1px;
  height:1px;
  overflow:hidden;
  clip:rect(0,0,0,0)
}
@media(max-width:1100px) {
  .quant-page {
    padding:1.5rem 1rem
  }
  .workspace {
    grid-template-columns:minmax(0,1fr) 300px
  }
  .chat-toolbar {
    align-items:flex-start
  }
  .chat-options {
    width:100%
  }
  .chat-options select {
    flex:1;
    width:auto
  }
}
@media(max-width:760px) {
  .page-heading {
    align-items:flex-start;
    flex-direction:column
  }
  .connection {
    width:100%
  }
  .connection .icon-button {
    margin-left:auto
  }
  .workspace {
    grid-template-columns:1fr;
    height:auto;
    max-height:none
  }
  .chat-panel {
    height:72vh;
    min-height:560px
  }
  .research-panel {
    border-left:0;
    border-top:1px solid var(--border)
  }
  .chat-log {
    padding:1rem
  }
  .empty h2 {
    font-size:1.5rem
  }
  .composer {
    margin:0 .8rem .8rem;
    padding:.8rem
  }
  .composer-footer small {
    display:none
  }
  .quant-page {
    padding:1.2rem .7rem
  }
  .empty {
    min-height:340px
  }
  .desktop-break {
    display:none
  }
}
@media(prefers-reduced-motion:reduce) {
  .loading-dot {
    animation:none
  }
  .chat-log {
    scroll-behavior:auto
  }
}
</style>

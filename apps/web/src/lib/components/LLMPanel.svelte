<script>
  import { onMount, afterUpdate, tick } from 'svelte';

  export let title = 'LLM Chat';
  export let runId = '';
  export let threadId = '';

  let models = [];
  let defaultModel = '';
  let selectedModel = '';
  let message = '';
  let messages = [];
  let meta = '';
  let error = '';
  let includeMemory = true;
  let memoryLimit = 8;
  let timeoutS = 300;
  let includeBacktestContext = true;
  let contextLimit = 50;
  let sessionIdInput = '';
  let sessionId = 'chat';
  let cacheEnabled = true;
  let cacheLoaded = false;
  let cacheMeta = '';
  let cacheTimer = null;
  let messagesEl = null;
  let lastMsgCount = 0;

  const API_BASE = '/api/fastapi/v1/ollama';
  const FS_BASE = '/api/fastapi/v1/fs';

  const cacheKey = (sid) => `deskops.llm.cache.${sid || 'chat'}`;

  const loadCache = () => {
    if (!cacheEnabled) {
      cacheLoaded = true;
      return;
    }
    if (typeof localStorage === 'undefined') {
      cacheLoaded = true;
      return;
    }
    const key = cacheKey(sessionId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        cacheMeta = 'cache miss';
        cacheLoaded = true;
        return;
      }
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.messages)) {
        cacheMeta = 'cache invalid';
        cacheLoaded = true;
        return;
      }
      messages = data.messages;
      if (data.selected_model) selectedModel = data.selected_model;
      if (typeof data.include_memory === 'boolean') includeMemory = data.include_memory;
      if (Number.isFinite(Number(data.memory_limit))) memoryLimit = Number(data.memory_limit);
      if (Number.isFinite(Number(data.timeout_s))) timeoutS = Number(data.timeout_s);
      if (typeof data.include_backtest_context === 'boolean') includeBacktestContext = data.include_backtest_context;
      if (Number.isFinite(Number(data.context_limit))) contextLimit = Number(data.context_limit);
      cacheMeta = `cache loaded${data.saved_at ? ` @ ${data.saved_at}` : ''}`;
    } catch (err) {
      cacheMeta = `cache load error: ${String(err)}`;
    } finally {
      cacheLoaded = true;
    }
  };

  const scheduleCacheSave = () => {
    if (!cacheEnabled || !cacheLoaded) return;
    if (typeof localStorage === 'undefined') return;
    if (cacheTimer) clearTimeout(cacheTimer);
    const key = cacheKey(sessionId);
    const payload = {
      v: 1,
      saved_at: new Date().toISOString(),
      session_id: sessionId,
      messages,
      selected_model: selectedModel,
      include_memory: includeMemory,
      include_backtest_context: includeBacktestContext,
      memory_limit: Number(memoryLimit) || 8,
      context_limit: Number(contextLimit) || 50,
      timeout_s: Number(timeoutS) || 300
    };
    cacheTimer = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(payload));
        cacheMeta = `cache saved${payload.saved_at ? ` @ ${payload.saved_at}` : ''}`;
      } catch (err) {
        cacheMeta = `cache save error: ${String(err)}`;
      }
    }, 150);
  };

  const clearCache = () => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(cacheKey(sessionId));
      cacheMeta = 'cache cleared';
    } catch (err) {
      cacheMeta = `cache clear error: ${String(err)}`;
    }
  };

  $: derivedId =
    String(runId || '').trim() ||
    String(threadId || '').trim() ||
    String(title || '').trim().toLowerCase().replace(/\s+/g, '-') ||
    'chat';
  $: if (!sessionIdInput) sessionIdInput = derivedId;
  $: if (!sessionId) sessionId = derivedId;
  $: sessionId = String(sessionIdInput || derivedId || 'chat').trim();

  const loadModels = async () => {
    error = '';
    try {
      const r = await fetch(`${API_BASE}/models`);
      const data = await r.json();
      if (!data.ok) {
        error = data.error || 'Failed to load models.';
        return;
      }
      models = Array.isArray(data.models) ? data.models : [];
      defaultModel = String(data.default_model || '').trim();
    } catch (err) {
      error = String(err);
    }
  };

  const loadMemory = async () => {
    error = '';
    try {
      const params = new URLSearchParams();
      params.set('run_id', sessionId);
      params.set('limit', '20');
      const r = await fetch(`${API_BASE}/memory?${params.toString()}`);
      const data = await r.json();
      if (!data.ok) {
        meta = `memory load error: ${data.error || 'unknown'}`;
        return;
      }
      const rows = Array.isArray(data.rows) ? data.rows : [];
      if (!rows.length) {
        meta = 'No saved chat history yet.';
        messages = [];
        return;
      }
      const next = [];
      for (const row of rows.slice().reverse()) {
        if (row.user_prompt) next.push({ role: 'user', text: row.user_prompt });
        if (row.response_markdown) next.push({ role: 'assistant', text: row.response_markdown });
      }
      messages = next;
      meta = `Loaded ${rows.length} messages from ${data.memory_db_path || 'memory db'}.`;
    } catch (err) {
      meta = `memory load error: ${String(err)}`;
    }
  };

  const sendMessage = async () => {
    error = '';
    const prompt = String(message || '').trim();
    if (!prompt) return;
    message = '';
    if (await tryRunLocalCommand(prompt)) {
      return;
    }
    messages = [...messages, { role: 'user', text: prompt }];
    meta = 'Sending...';
    try {
      const r = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: selectedModel,
          run_id: sessionId,
          include_memory: includeMemory,
          include_backtest_context: includeBacktestContext,
          memory_limit: Number(memoryLimit) || 8,
          context_limit: Number(contextLimit) || 50,
          timeout_s: Number(timeoutS) || 300
        })
      });
      const data = await r.json();
      if (!data.ok) {
        meta = `error: ${data.error || 'unknown'}`;
        return;
      }
      if (Array.isArray(data.fetched) && data.fetched.length) {
        const lines = data.fetched.map((f) =>
          f.error ? `fetch error: ${f.url} -> ${f.error}` : `fetched: ${f.url} (${f.status || ''})`
        );
        messages = [...messages, { role: 'assistant', text: lines.join('\n') }];
      }
      messages = [...messages, { role: 'assistant', text: data.answer || '' }];
      meta = `model=${data.model || selectedModel || defaultModel || 'unknown'} memory_id=${data.memory_id || 'n/a'}`;
    } catch (err) {
      meta = `error: ${String(err)}`;
    }
  };

  const tryRunLocalCommand = async (prompt) => {
    const raw = String(prompt || '').trim();
    if (!raw) return false;
    let cmdLine = raw;
    if (!cmdLine.startsWith('/')) {
      const lower = cmdLine.toLowerCase();
      if (lower.startsWith('ls ') || lower.startsWith('dir ') || lower.startsWith('list ')) {
        cmdLine = `/ls ${cmdLine.split(' ').slice(1).join(' ')}`;
      } else if (lower.startsWith('cat ') || lower.startsWith('read ') || lower.startsWith('open ')) {
        cmdLine = `/cat ${cmdLine.split(' ').slice(1).join(' ')}`;
      } else if (lower.includes('memory') || lower.includes('sqlite')) {
        cmdLine = '/mem';
      } else {
        return false;
      }
    }
    const [cmd, ...rest] = cmdLine.split(' ');
    const arg = rest.join(' ').trim();
    if (!cmd) return false;

    messages = [...messages, { role: 'user', text: raw }];
    if (cmd === '/root') {
      const r = await fetch(`${FS_BASE}/root`);
      const data = await r.json();
      if (!data.ok) {
        messages = [...messages, { role: 'assistant', text: `error: ${data.error || 'unknown'}` }];
        return true;
      }
      messages = [...messages, { role: 'assistant', text: data.root || '' }];
      return true;
    }
    if (cmd === '/ls') {
      const target = arg || '.';
      const r = await fetch(`${FS_BASE}/list?path=${encodeURIComponent(target)}`);
      const data = await r.json();
      if (!data.ok) {
        messages = [...messages, { role: 'assistant', text: `error: ${data.error || 'unknown'}` }];
        return true;
      }
      const items = Array.isArray(data.items) ? data.items : [];
      const lines = items.map((it) => `${it.type === 'dir' ? 'dir ' : 'file'} ${it.path}`);
      messages = [
        ...messages,
        {
          role: 'assistant',
          text: `root: ${data.root}\npath: ${data.path}\n${lines.join('\n')}${data.truncated ? '\n...truncated' : ''}`
        }
      ];
      return true;
    }
    if (cmd === '/cat') {
      if (!arg) {
        messages = [...messages, { role: 'assistant', text: 'usage: /cat <path>' }];
        return true;
      }
      const r = await fetch(`${FS_BASE}/read?path=${encodeURIComponent(arg)}`);
      const data = await r.json();
      if (!data.ok) {
        messages = [...messages, { role: 'assistant', text: `error: ${data.error || 'unknown'}` }];
        return true;
      }
      messages = [
        ...messages,
        {
          role: 'assistant',
          text: `# ${data.path} (${data.size} bytes)\n${data.content || ''}`
        }
      ];
      return true;
    }
    if (cmd === '/mem') {
      const limit = Number(arg || 12);
      const r = await fetch(
        `${API_BASE}/memory?run_id=${encodeURIComponent(sessionId)}&limit=${encodeURIComponent(
          Number.isFinite(limit) ? String(limit) : '12'
        )}`
      );
      const data = await r.json();
      if (!data.ok) {
        messages = [...messages, { role: 'assistant', text: `error: ${data.error || 'unknown'}` }];
        return true;
      }
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const items = rows.map((row) => {
        const stamp = row.created_at_utc || '';
        const mode = row.analysis_mode || '';
        const model = row.model || '';
        const err = row.error_text ? ` error=${row.error_text}` : '';
        return `- [${stamp}] ${mode} ${model}${err}`;
      });
      messages = [
        ...messages,
        {
          role: 'assistant',
          text: `memory_db=${data.memory_db_path || ''}\n${items.join('\n')}`
        }
      ];
      return true;
    }
    messages = [...messages, { role: 'assistant', text: `unknown command: ${cmd}` }];
    return true;
  };

  const handleKeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  onMount(async () => {
    await loadModels();
    loadCache();
    await loadMemory();
  });

  const scrollToBottom = async () => {
    if (!messagesEl) return;
    await tick();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  afterUpdate(() => {
    if (!messagesEl) return;
    if (messages.length !== lastMsgCount) {
      lastMsgCount = messages.length;
      scrollToBottom();
    }
  });

  $: if (cacheEnabled && cacheLoaded) {
    messages;
    selectedModel;
    includeMemory;
    memoryLimit;
    timeoutS;
    includeBacktestContext;
    contextLimit;
    scheduleCacheSave();
  }
</script>

<section class="panel">
  <div class="head">
    <h3>{title}</h3>
    <span class="muted">{defaultModel ? `default=${defaultModel}` : ''}</span>
  </div>
  {#if error}
    <div class="error">{error}</div>
  {/if}

  <div class="controls">
        <label>
          Model
          <select bind:value={selectedModel}>
            <option value="">Default{defaultModel ? ` (${defaultModel})` : ''}</option>
            {#each models as m}
              <option value={m}>{m}</option>
            {/each}
          </select>
        </label>
        <button class="ghost" on:click={loadModels}>Refresh Models</button>
        <label>
          Thread
          <input type="text" bind:value={sessionIdInput} />
        </label>
        <label class="check">
          <input type="checkbox" bind:checked={includeMemory} />
          include memory
        </label>
        <label class="check">
          <input type="checkbox" bind:checked={includeBacktestContext} />
          include backtest context
        </label>
        <label class="check">
          <input type="checkbox" bind:checked={cacheEnabled} />
          cache ui state
        </label>
        <label>
          Memory Limit
          <input type="number" min="1" max="50" bind:value={memoryLimit} />
        </label>
        <label>
          Context Limit
          <input type="number" min="10" max="500" bind:value={contextLimit} />
        </label>
        <label>
          Timeout(s)
          <input type="number" min="10" max="7200" bind:value={timeoutS} />
        </label>
        <button class="ghost" on:click={loadMemory}>Load Memory</button>
        <button class="ghost" on:click={clearCache}>Clear Cache</button>
      </div>

      <div class="messages" bind:this={messagesEl}>
        {#if messages.length === 0}
          <div class="muted">No messages yet.</div>
        {:else}
          {#each messages as m}
            <div class="msg {m.role}">
              <div class="role">{m.role}</div>
              <div class="text">{m.text}</div>
            </div>
          {/each}
        {/if}
      </div>

      <div class="input-row">
        <textarea
          rows="3"
          bind:value={message}
          placeholder="Type a message..."
          on:keydown={handleKeydown}
        ></textarea>
        <button class="primary" on:click={sendMessage}>Send</button>
      </div>

      <div class="meta">{meta}</div>
      {#if cacheMeta}
        <div class="meta">{cacheMeta}</div>
      {/if}
  <div class="meta">Commands: <code>/root</code> <code>/ls path</code> <code>/cat path</code> <code>/mem</code></div>
</section>

<style>
  .panel {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 12px;
    padding: 1rem;
    display: grid;
    gap: 0.75rem;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
  }

  label {
    display: grid;
    gap: 0.25rem;
    font-size: 0.85rem;
  }

  label.check {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding-top: 1.1rem;
  }

  input,
  select,
  textarea {
    font: inherit;
    border: 1px solid var(--border);
    background: var(--surface-alt);
    color: var(--text);
    border-radius: 8px;
    padding: 0.4rem 0.55rem;
  }

  select {
    min-width: 200px;
  }

  .messages {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-alt);
    padding: 0.6rem;
    max-height: 320px;
    overflow: auto;
    display: grid;
    gap: 0.6rem;
  }

  .msg {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.5rem 0.6rem;
    background: var(--surface);
  }

  .msg.user {
    border-color: var(--accent);
  }

  .role {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 0.35rem;
  }

  .text {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .input-row {
    display: flex;
    gap: 0.6rem;
    align-items: stretch;
  }

  textarea {
    flex: 1;
    min-height: 70px;
    resize: vertical;
  }

  button {
    border: none;
    border-radius: 8px;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    font-weight: 600;
  }

  button.primary {
    background: var(--accent);
    color: #001414;
  }

  button.ghost {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
  }

  .meta {
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .error {
    color: #ffb4b4;
  }
</style>

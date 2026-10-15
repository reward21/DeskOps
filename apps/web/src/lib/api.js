async function readJsonOrThrow(res) {
  const contentType = res.headers.get('content-type') || '';
  let payload = null;
  try {
    payload = contentType.includes('application/json') ? await res.json() : await res.text();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const message =
      (payload && typeof payload === 'object' && (payload.error || payload.message)) ||
      (typeof payload === 'string' && payload) ||
      `API error: ${res.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function fetchRuns(options = {}) {
  const params = new URLSearchParams();
  if (options.limit !== undefined && options.limit !== null && options.limit !== '') {
    params.set('limit', String(options.limit));
  }
  if (options.include_artifacts !== undefined && options.include_artifacts !== null) {
    params.set('include_artifacts', options.include_artifacts ? '1' : '0');
  }
  const qs = params.toString();
  const res = await fetch(`/api/backtests/runs${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  return readJsonOrThrow(res);
}

export async function fetchRunDetail(runId) {
  const res = await fetch(`/api/backtests/run?run_id=${encodeURIComponent(runId)}`);
  return readJsonOrThrow(res);
}

export async function runBacktestQuery(sql, limit = 200) {
  const res = await fetch(`/api/backtests/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, limit })
  });
  return readJsonOrThrow(res);
}

export async function fetchSchema(table) {
  const res = await fetch(`/api/backtests/schema?table=${encodeURIComponent(table)}`);
  return readJsonOrThrow(res);
}

export async function fetchSchemaProfile(limit = 200) {
  const res = await fetch(`/api/backtests/schema-profile?limit=${encodeURIComponent(limit)}`);
  return readJsonOrThrow(res);
}

export async function fetchWalkForwardVisuals() {
  const res = await fetch('/api/backtests/walk-forward-visuals', { cache: 'no-store' });
  return readJsonOrThrow(res);
}

export async function generateWalkForwardVisual(batchId) {
  const res = await fetch('/api/backtests/walk-forward-visuals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch_id: batchId })
  });
  return readJsonOrThrow(res);
}

export async function fetchGulfSyncLive(options = {}) {
  const params = new URLSearchParams();
  if (options.preview_chars !== undefined && options.preview_chars !== null && options.preview_chars !== '') {
    params.set('preview_chars', String(options.preview_chars));
  }
  if (options.recent_limit !== undefined && options.recent_limit !== null && options.recent_limit !== '') {
    params.set('recent_limit', String(options.recent_limit));
  }
  const qs = params.toString();
  const res = await fetch(`/api/gulf-sync/live${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  return readJsonOrThrow(res);
}

export async function listGulfSyncActionOptions() {
  const res = await fetch('/api/gulf-sync/action', { cache: 'no-store' });
  return readJsonOrThrow(res);
}

export async function runGulfSyncAction(action, payload = {}) {
  const res = await fetch('/api/gulf-sync/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  });
  return readJsonOrThrow(res);
}

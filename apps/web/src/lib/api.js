export async function fetchRuns() {
  const res = await fetch(`/api/backtests/runs`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export async function fetchRunDetail(runId) {
  const res = await fetch(`/api/backtests/run?run_id=${encodeURIComponent(runId)}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export async function runBacktestQuery(sql, limit = 200) {
  const res = await fetch(`/api/backtests/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, limit })
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:9090';

export async function fetchRuns() {
  const res = await fetch(`${API_BASE}/v1/backtests/runs`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

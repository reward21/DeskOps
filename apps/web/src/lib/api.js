export async function fetchRuns() {
  const res = await fetch(`/api/backtests/runs`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

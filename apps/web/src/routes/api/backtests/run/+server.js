import { env } from '$env/dynamic/private';

const API_BASE = env.API_BASE_URL || 'http://127.0.0.1:9090';

export async function GET({ url, fetch }) {
  const runId = url.searchParams.get('run_id');
  const target = new URL(`${API_BASE}/v1/backtests/run`);
  if (runId) {
    target.searchParams.set('run_id', runId);
  }
  const upstream = await fetch(target.toString());
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json'
    }
  });
}

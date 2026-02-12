import { env } from '$env/dynamic/private';

const API_BASE = env.API_BASE_URL || 'http://127.0.0.1:9090';

export async function GET({ fetch }) {
  const upstream = await fetch(`${API_BASE}/v1/backtests/runs`);
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json'
    }
  });
}

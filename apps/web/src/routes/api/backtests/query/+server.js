import { env } from '$env/dynamic/private';

const API_BASE = env.API_BASE_URL || 'http://127.0.0.1:9090';

export async function POST({ request, fetch }) {
  const body = await request.text();
  const upstream = await fetch(`${API_BASE}/v1/backtests/query`, {
    method: 'POST',
    headers: {
      'Content-Type': request.headers.get('content-type') || 'application/json'
    },
    body
  });
  const responseBody = await upstream.text();
  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json'
    }
  });
}

import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const API_BASE = env.API_BASE_URL || 'http://127.0.0.1:9090';

export async function POST({ request, fetch }) {
  const body = await request.text();
  let upstream;
  try {
    upstream = await fetch(`${API_BASE}/v1/backtests/query`, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/json'
      },
      body
    });
  } catch (err) {
    return json(
      {
        error: `DeskOps API unavailable at ${API_BASE}: ${err?.message || 'request failed'}`
      },
      { status: 503 }
    );
  }
  const responseBody = await upstream.text();
  return new Response(responseBody, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json'
    }
  });
}

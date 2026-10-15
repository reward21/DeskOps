import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

const API_BASE = env.API_BASE_URL || 'http://127.0.0.1:9090';

export async function GET({ url, fetch }) {
  const target = new URL(`${API_BASE}/v1/backtests/schema`);
  const table = url.searchParams.get('table');
  if (table) {
    target.searchParams.set('table', table);
  }
  let upstream;
  try {
    upstream = await fetch(target.toString());
  } catch (err) {
    return json(
      {
        error: `DeskOps API unavailable at ${API_BASE}: ${err?.message || 'request failed'}`
      },
      { status: 503 }
    );
  }
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json'
    }
  });
}

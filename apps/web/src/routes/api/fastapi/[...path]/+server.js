import { env } from '$env/dynamic/private';

const FASTAPI_BASE = env.FASTAPI_BASE_URL || 'http://127.0.0.1:8090';

export async function GET({ fetch, params, url }) {
  const upstream = await fetch(`${FASTAPI_BASE}/${params.path}${url.search}`);
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json'
    }
  });
}

export async function POST({ fetch, params, url, request }) {
  const upstream = await fetch(`${FASTAPI_BASE}/${params.path}${url.search}`, {
    method: 'POST',
    headers: { 'Content-Type': request.headers.get('content-type') || 'application/json' },
    body: await request.text()
  });
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json'
    }
  });
}

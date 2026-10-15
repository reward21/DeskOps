import { json } from '@sveltejs/kit';
import { quantRequest } from '$lib/server/quant.js';

const response = (body, status = 200) => json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function call(payload) {
  try {
    const result = await quantRequest(payload);
    return response(result, result.ok ? 200 : result.status || 400);
  } catch (error) {
    return response({ ok: false, error: error.message }, 503);
  }
}

export function GET({ url }) {
  const operation = url.searchParams.get('view') || 'overview';
  if (!['overview', 'session', 'experiment'].includes(operation)) {
    return response({ ok: false, error: 'Unknown view' }, 400);
  }
  return call({ operation, session_id: url.searchParams.get('session_id'), experiment_id: url.searchParams.get('experiment_id') });
}

export async function POST({ request, url }) {
  const origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return response({ ok: false, error: 'Open Quant directly in DeskOps to send a request.' }, 403);
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return response({ ok: false, error: 'Expected JSON' }, 415);
  }
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 32768) return response({ ok: false, error: 'Request is too large' }, 413);
    const payload = JSON.parse(raw);
    if (!['create_session', 'submit', 'stop_research'].includes(payload?.operation)) {
      return response({ ok: false, error: 'Unknown action' }, 400);
    }
    return call(payload);
  } catch {
    return response({ ok: false, error: 'Invalid JSON request' }, 400);
  }
}

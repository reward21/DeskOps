import { json } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';

const MAX_BYTES = 1024 * 1024 * 25;

const mimeForPath = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.md' || ext === '.markdown') return 'text/markdown; charset=utf-8';
  if (ext === '.txt' || ext === '.log') return 'text/plain; charset=utf-8';
  if (ext === '.csv') return 'text/csv; charset=utf-8';
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
};

const isWithin = (parent, target) => {
  const rel = path.relative(parent, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

export async function GET({ url }) {
  const rel = String(url.searchParams.get('path') || '').trim();
  if (!rel) {
    return json({ ok: false, error: 'path is required' }, { status: 400 });
  }

  const gulfchainRoot = resolveGulfchainRoot();
  if (!gulfchainRoot) {
    return json({ ok: false, error: 'Gulfchain root not found' }, { status: 500 });
  }

  const artifactsRoot = path.resolve(gulfchainRoot, 'multigate-backtest', 'runs', 'artifacts');
  const target = path.resolve(gulfchainRoot, rel);
  if (!isWithin(artifactsRoot, target)) {
    return json({ ok: false, error: 'invalid artifact path' }, { status: 400 });
  }

  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return json({ ok: false, error: 'file not found' }, { status: 404 });
  }
  if (!stat.isFile()) {
    return json({ ok: false, error: 'path is not a file' }, { status: 400 });
  }
  if (stat.size > MAX_BYTES) {
    return json({ ok: false, error: 'artifact file too large to preview' }, { status: 413 });
  }

  let body;
  try {
    body = await fs.readFile(target);
  } catch {
    return json({ ok: false, error: 'failed to read artifact file' }, { status: 500 });
  }

  const mime = mimeForPath(target);
  const headers = new Headers({
    'Content-Type': mime,
    'Cache-Control': 'no-store',
    'Content-Length': String(body.length)
  });
  if (url.searchParams.get('download') === '1') {
    headers.set('Content-Disposition', `attachment; filename="${path.basename(target)}"`);
  }

  return new Response(body, { status: 200, headers });
}

import { json } from '@sveltejs/kit';
import path from 'node:path';
import fs from 'node:fs/promises';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';

const MAX_TEXT_BYTES = 1024 * 1024 * 2;
const MAX_PDF_BYTES = 1024 * 1024 * 25;

const getRoots = () => {
  const root = resolveGulfchainRoot();
  if (!root) return {};
  return {
    'gulfchain-root': root
  };
};

export async function GET({ url }) {
  const roots = getRoots();
  const rootKey = url.searchParams.get('root') || 'gulfchain-root';
  const root = roots[rootKey];
  if (!root) {
    return json({ ok: false, error: 'Gulfchain root not found. Set GULFCHAIN_ROOT or run from the DeskOps workspace.' }, { status: 500 });
  }
  const rel = url.searchParams.get('path');
  if (!rel) {
    return json({ ok: false, error: 'path is required' }, { status: 400 });
  }
  const target = path.resolve(root, rel);
  const relToRoot = path.relative(root, target);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    return json({ ok: false, error: 'invalid path' }, { status: 400 });
  }
  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return json({ ok: false, error: 'file not found' }, { status: 404 });
  }
  if (stat.isDirectory()) {
    return json({ ok: false, error: 'path is a directory' }, { status: 400 });
  }

  const isPdf = target.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    if (stat.size > MAX_PDF_BYTES) {
      return json({ ok: false, error: 'PDF file too large to preview' }, { status: 413 });
    }
    let body;
    try {
      body = await fs.readFile(target);
    } catch {
      return json({ ok: false, error: 'failed to read file' }, { status: 500 });
    }
    const fileName = path.basename(target).replace(/"/g, '');
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(body.length),
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Cache-Control': 'no-store'
      }
    });
  }

  if (stat.size > MAX_TEXT_BYTES) {
    return json({ ok: false, error: 'file too large to preview' }, { status: 413 });
  }
  let content = '';
  try {
    content = await fs.readFile(target, 'utf-8');
  } catch {
    return json({ ok: false, error: 'failed to read file' }, { status: 500 });
  }
  return json({ ok: true, path: rel, content });
}

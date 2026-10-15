import { json } from '@sveltejs/kit';
import path from 'node:path';
import fs from 'node:fs/promises';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';

export async function GET({ params }) {
  const root = resolveGulfchainRoot();
  if (!root) {
    return json({ ok: false, error: 'Gulfchain root not found. Set GULFCHAIN_ROOT or run from the DeskOps workspace.' }, { status: 500 });
  }
  const page = params.page || '';
  const file = `${page}_index.json`;
  const target = path.join(root, 'DeskOps', 'apps', 'metadata_indices', file);
  let content = '';
  try {
    content = await fs.readFile(target, 'utf-8');
  } catch {
    return json({ ok: false, error: `metadata index not found: ${file}` }, { status: 404 });
  }
  try {
    const data = JSON.parse(content);
    return json({ ok: true, index: data });
  } catch {
    return json({ ok: false, error: 'metadata index is invalid JSON' }, { status: 500 });
  }
}

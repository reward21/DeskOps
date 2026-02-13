import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import path from 'node:path';
import fs from 'node:fs/promises';

const MAX_BYTES = 1024 * 1024 * 2;

const getRoots = () => {
  const root = env.GULFCHAIN_ROOT;
  if (!root) return {};
  return {
    'gulfchain-docs': path.join(root, 'docs'),
    'backtest-reports': path.join(root, 'multigate-backtest', 'runs', 'artifacts', 'reports'),
    'backtest-docs': path.join(root, 'multigate-backtest', 'docs')
  };
};

export async function GET({ url }) {
  const roots = getRoots();
  const rootKey = url.searchParams.get('root') || 'gulfchain-docs';
  const root = roots[rootKey];
  if (!root) {
    return json({ ok: false, error: 'GULFCHAIN_ROOT is not set.' }, { status: 500 });
  }
  const rel = url.searchParams.get('path');
  if (!rel) {
    return json({ ok: false, error: 'path is required' }, { status: 400 });
  }
  const target = path.resolve(root, rel);
  if (!target.startsWith(root)) {
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
  if (stat.size > MAX_BYTES) {
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

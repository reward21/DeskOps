import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import path from 'node:path';
import fs from 'node:fs/promises';

const MAX_DEPTH = 6;

const getRoots = () => {
  const root = env.GULFCHAIN_ROOT;
  if (!root) return [];
  return [
    {
      id: 'gulfchain-docs',
      name: 'Gulfchain Docs',
      path: path.join(root, 'docs'),
      rootBase: root
    },
    {
      id: 'backtest-reports',
      name: 'Backtest Reports',
      path: path.join(root, 'multigate-backtest', 'runs', 'artifacts', 'reports'),
      rootBase: root
    },
    {
      id: 'backtest-docs',
      name: 'Backtest Docs',
      path: path.join(root, 'multigate-backtest', 'docs'),
      rootBase: root
    }
  ];
};

const isHidden = (name) => name.startsWith('.');
const isAllowedFile = (name) => {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.txt');
};

async function buildTree(dir, root, depth = 0) {
  if (depth > MAX_DEPTH) return [];
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirs = [];
  const files = [];
  for (const entry of entries) {
    if (isHidden(entry.name)) continue;
    if (entry.isDirectory()) dirs.push(entry);
    else if (isAllowedFile(entry.name)) files.push(entry);
  }
  const items = [];
  for (const entry of dirs.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    items.push({
      type: 'dir',
      name: entry.name,
      path: rel,
      children: await buildTree(full, root, depth + 1)
    });
  }
  for (const entry of files.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    items.push({
      type: 'file',
      name: entry.name,
      path: rel
    });
  }
  return items;
}

export async function GET() {
  const roots = getRoots();
  if (!roots.length) {
    return json({ ok: false, error: 'GULFCHAIN_ROOT is not set.' }, { status: 500 });
  }
  const payload = [];
  for (const root of roots) {
    const tree = await buildTree(root.path, root.path);
    const rel = path.relative(root.rootBase, root.path).replace(/\\/g, '/');
    payload.push({
      id: root.id,
      rootPath: root.path,
      rootRel: rel,
      node: {
        type: 'dir',
        name: root.name,
        path: '',
        children: tree
      }
    });
  }
  return json({ ok: true, roots: payload });
}

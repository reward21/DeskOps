import { json } from '@sveltejs/kit';
import path from 'node:path';
import fs from 'node:fs/promises';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';

const MAX_DEPTH = 6;

const getRoots = () => {
  const root = resolveGulfchainRoot();
  if (!root) return [];
  return [
    {
      id: 'gulfchain-root',
      name: 'gulfchain',
      path: root,
      rootBase: root
    }
  ];
};

const isHidden = (name) => name.startsWith('.');
const isAllowedFile = (name) => {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.pdf');
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
    return json({ ok: false, error: 'Gulfchain root not found. Set GULFCHAIN_ROOT or run from the DeskOps workspace.' }, { status: 500 });
  }
  const payload = [];
  for (const root of roots) {
    const tree = await buildTree(root.path, root.path);
    const rel = path.relative(root.rootBase, root.path).replace(/\\/g, '/');
    payload.push({
      id: root.id,
      name: root.name,
      rootPath: root.path,
      rootRel: rel,
      rootBaseName: path.basename(root.rootBase),
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

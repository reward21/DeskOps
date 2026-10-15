import { env } from '$env/dynamic/private';
import fs from 'node:fs';
import path from 'node:path';

const MAX_ASCENT = 12;

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function looksLikeGulfchainRoot(root) {
  if (!root) return false;
  const deskOps = path.join(root, 'DeskOps');
  if (!isDir(deskOps)) return false;
  return isDir(path.join(root, 'multigate-backtest')) || isDir(path.join(root, 'gulf-sync'));
}

function resolveFromCwd() {
  let probe = path.resolve(process.cwd());
  for (let i = 0; i < MAX_ASCENT; i += 1) {
    if (looksLikeGulfchainRoot(probe)) return probe;
    if (path.basename(probe) === 'DeskOps') {
      const parent = path.dirname(probe);
      if (looksLikeGulfchainRoot(parent)) return parent;
    }
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  return '';
}

export function resolveGulfchainRoot() {
  const configured = (env.GULFCHAIN_ROOT || '').trim();
  if (configured) {
    const resolved = path.resolve(configured);
    if (looksLikeGulfchainRoot(resolved)) return resolved;
  }
  return resolveFromCwd();
}

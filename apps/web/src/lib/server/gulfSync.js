import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';

export const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/');

export function resolveGulfSyncRoot() {
  const gulfchainRoot = resolveGulfchainRoot();
  if (!gulfchainRoot) {
    return {
      ok: false,
      gulfchainRoot: '',
      gulfSyncRoot: '',
      error: 'Gulfchain root not found. Set GULFCHAIN_ROOT or run from the DeskOps workspace.'
    };
  }
  const gulfSyncRoot = path.resolve(gulfchainRoot, 'gulf-sync');
  return { ok: true, gulfchainRoot, gulfSyncRoot, error: '' };
}

export function resolveInside(rootDir, relPath = '') {
  const target = path.resolve(rootDir, relPath);
  const rel = path.relative(rootDir, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('invalid path');
  }
  return target;
}

export async function statOrNull(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

export async function readTextIfExists(targetPath) {
  try {
    return await fs.readFile(targetPath, 'utf-8');
  } catch {
    return '';
  }
}

export async function readJsonIfExists(targetPath) {
  try {
    const raw = await fs.readFile(targetPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listDirSafe(targetPath) {
  try {
    return await fs.readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function relFrom(baseDir, absPath) {
  return normalizeSlashes(path.relative(baseDir, absPath));
}

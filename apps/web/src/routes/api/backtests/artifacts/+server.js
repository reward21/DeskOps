import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';

const API_BASE = env.API_BASE_URL || 'http://127.0.0.1:9090';
const MAX_SCAN_DIRS = 4000;
const MAX_FILES_PER_BUCKET = 300;
const MAX_TOTAL_FILES = 900;

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const TEXT_EXTS = new Set(['.md', '.markdown', '.txt', '.json', '.csv', '.log', '.yaml', '.yml', '.html']);

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/');

const toRel = (root, abs) => normalizeSlashes(path.relative(root, abs));

const isWithin = (parent, target) => {
  const rel = path.relative(parent, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

const mimeForPath = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'application/json';
  if (ext === '.md' || ext === '.markdown') return 'text/markdown';
  if (ext === '.txt' || ext === '.log') return 'text/plain';
  if (ext === '.csv') return 'text/csv';
  if (ext === '.html') return 'text/html';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
};

const classifyPath = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'chart';
  if (filePath.includes('/reports/')) return 'report';
  return 'artifact';
};

const normalizeLegacyPath = (rawPath, gulfchainRoot) => {
  const raw = String(rawPath || '').trim();
  if (!raw) return '';
  if (!path.isAbsolute(raw)) return path.resolve(gulfchainRoot, raw);

  const rawNorm = normalizeSlashes(raw);
  const rootNorm = normalizeSlashes(gulfchainRoot).replace(/\/+$/, '');
  if (rawNorm === rootNorm || rawNorm.startsWith(`${rootNorm}/`)) {
    const rel = rawNorm.slice(rootNorm.length).replace(/^\/+/, '');
    return path.resolve(gulfchainRoot, rel);
  }

  const gulfchainMarker = '/gulfchain/';
  const gulfchainIdx = rawNorm.indexOf(gulfchainMarker);
  if (gulfchainIdx >= 0) {
    const rel = rawNorm.slice(gulfchainIdx + gulfchainMarker.length).replace(/^\/+/, '');
    return path.resolve(gulfchainRoot, rel);
  }

  const marker = '/multigate-backtest/';
  const idx = rawNorm.indexOf(marker);
  if (idx >= 0) {
    const tail = rawNorm.slice(idx + marker.length).replace(/^\/+/, '');
    return path.resolve(gulfchainRoot, 'multigate-backtest', tail);
  }
  return path.resolve(raw);
};

const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const getRunDetail = async (runId) => {
  const target = new URL(`${API_BASE}/v1/backtests/run`);
  target.searchParams.set('run_id', runId);
  try {
    const res = await fetch(target.toString());
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

const listFiles = async (dirPath, predicate, limit) => {
  let entries = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) continue;
    if (!predicate(entry.name)) continue;
    const abs = path.join(dirPath, entry.name);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }
    out.push({
      abs,
      name: entry.name,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      mime: mimeForPath(abs),
      type: classifyPath(normalizeSlashes(abs))
    });
    if (out.length >= limit) break;
  }
  return out;
};

const hasRunReport = async (reportsDir, runId) => {
  let entries = [];
  try {
    entries = await fs.readdir(reportsDir, { withFileTypes: true });
  } catch {
    return false;
  }
  return entries.some((entry) => entry.isFile() && entry.name.includes(runId));
};

const discoverRunDirs = async (artifactsRoot, runId) => {
  const dateKey = runId.slice(0, 8);
  const dirs = new Set();

  let top = [];
  try {
    top = await fs.readdir(artifactsRoot, { withFileTypes: true });
  } catch {
    return dirs;
  }

  let scanned = 0;
  for (const entry of top) {
    if (!entry.isDirectory()) continue;
    const topDir = path.join(artifactsRoot, entry.name);

    const rootReportsDir = path.join(topDir, 'reports');
    if (await hasRunReport(rootReportsDir, runId)) {
      dirs.add(topDir);
    }

    let children = [];
    try {
      children = await fs.readdir(topDir, { withFileTypes: true });
    } catch {
      children = [];
    }

    const prioritized = children
      .filter((child) => child.isDirectory() && child.name.includes(dateKey))
      .concat(children.filter((child) => child.isDirectory() && !child.name.includes(dateKey)));

    for (const child of prioritized) {
      if (!child.isDirectory()) continue;
      const runDir = path.join(topDir, child.name);
      const reportsDir = path.join(runDir, 'reports');
      if (await hasRunReport(reportsDir, runId)) {
        dirs.add(runDir);
      }
      scanned += 1;
      if (scanned >= MAX_SCAN_DIRS) return dirs;
    }
  }
  return dirs;
};

const dedupeByAbs = (items) => {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item.abs)) continue;
    seen.add(item.abs);
    out.push(item);
  }
  return out;
};

export async function GET({ url }) {
  const runId = String(url.searchParams.get('run_id') || '').trim();
  if (!runId) {
    return json({ ok: false, error: 'run_id is required' }, { status: 400 });
  }

  const gulfchainRoot = resolveGulfchainRoot();
  if (!gulfchainRoot) {
    return json({ ok: false, error: 'Gulfchain root not found' }, { status: 500 });
  }

  const artifactsRoot = path.resolve(gulfchainRoot, 'multigate-backtest', 'runs', 'artifacts');
  if (!(await pathExists(artifactsRoot))) {
    return json({ ok: false, error: 'Artifacts root not found' }, { status: 404 });
  }

  const run = await getRunDetail(runId);
  const runDirs = await discoverRunDirs(artifactsRoot, runId);

  const directCandidates = [];
  if (run && typeof run === 'object') {
    for (const key of ['report_path', 'equity_curve_path', 'pnl_hist_path']) {
      const abs = normalizeLegacyPath(run[key], gulfchainRoot);
      if (!abs) continue;
      if (!isWithin(artifactsRoot, abs)) continue;
      if (!(await pathExists(abs))) continue;
      directCandidates.push(abs);
      const parent = path.dirname(abs);
      if (path.basename(parent) === 'reports' || path.basename(parent) === 'charts') {
        runDirs.add(path.dirname(parent));
      } else {
        runDirs.add(parent);
      }
    }
  }

  let reports = [];
  let charts = [];
  let artifacts = [];

  for (const runDir of runDirs) {
    const reportsDir = path.join(runDir, 'reports');
    const chartsDir = path.join(runDir, 'charts');

    const reportFiles = await listFiles(
      reportsDir,
      (name) => name.includes(runId) && (name.endsWith('.md') || name.endsWith('.json') || name.endsWith('.txt')),
      MAX_FILES_PER_BUCKET
    );
    reports = reports.concat(reportFiles);

    const chartFiles = await listFiles(
      chartsDir,
      (name) => IMAGE_EXTS.has(path.extname(name).toLowerCase()),
      MAX_FILES_PER_BUCKET
    );
    charts = charts.concat(chartFiles);

    const otherFiles = await listFiles(
      runDir,
      (name) => TEXT_EXTS.has(path.extname(name).toLowerCase()) || IMAGE_EXTS.has(path.extname(name).toLowerCase()),
      MAX_FILES_PER_BUCKET
    );
    artifacts = artifacts.concat(otherFiles);
  }

  for (const direct of directCandidates) {
    try {
      const stat = await fs.stat(direct);
      if (!stat.isFile()) continue;
      artifacts.push({
        abs: direct,
        name: path.basename(direct),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        mime: mimeForPath(direct),
        type: classifyPath(normalizeSlashes(direct))
      });
    } catch {
      // Ignore stale files.
    }
  }

  reports = dedupeByAbs(reports).slice(0, MAX_TOTAL_FILES);
  charts = dedupeByAbs(charts).slice(0, MAX_TOTAL_FILES);
  artifacts = dedupeByAbs(artifacts)
    .filter((item) => !reports.some((r) => r.abs === item.abs) && !charts.some((c) => c.abs === item.abs))
    .slice(0, MAX_TOTAL_FILES);

  const mapForClient = (items) =>
    items.map((item) => ({
      name: item.name,
      path: toRel(gulfchainRoot, item.abs),
      size: item.size,
      mtime: item.mtime,
      mime: item.mime,
      type: item.type
    }));

  return json({
    ok: true,
    run_id: runId,
    run: run || null,
    artifacts_root: toRel(gulfchainRoot, artifactsRoot),
    run_dirs: Array.from(runDirs).map((dir) => toRel(gulfchainRoot, dir)),
    reports: mapForClient(reports),
    charts: mapForClient(charts),
    artifacts: mapForClient(artifacts)
  });
}

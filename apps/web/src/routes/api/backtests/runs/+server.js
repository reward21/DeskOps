import { env } from '$env/dynamic/private';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';

const API_BASE = env.API_BASE_URL || 'http://127.0.0.1:9090';
const DEFAULT_LIMIT = 600;
const MAX_LIMIT = 3000;
const MAX_SCAN_FILES = 25000;
const MAX_SCAN_DIRS_PER_KIND = 3000;
const MAX_REPORTS_PER_DIR = 200;
const RUN_ID_RE = /(\d{8}_\d{6}_[A-Za-z0-9]{6,})/;

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/');

const parseLimit = (raw) => {
  const parsed = Number.parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
};

const toIsoFromRunId = (runId) => {
  const m = String(runId || '').match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_/);
  if (!m) return '';
  const [, yy, mm, dd, hh, mi, ss] = m;
  return `${yy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`;
};

const toEpochMs = (item) => {
  const created = Date.parse(String(item?.created_at_utc || '').trim());
  if (Number.isFinite(created)) return created;
  const fallback = Date.parse(toIsoFromRunId(item?.run_id));
  return Number.isFinite(fallback) ? fallback : 0;
};

const inferRunType = (candidatePath, batchId = '') => {
  const p = normalizeSlashes(candidatePath);
  if (p.includes('/regime_switch/')) return 'regime_switch';
  if (p.includes('/walk_forward/')) return 'walk_forward';
  if (p.includes('/batches/') || String(batchId || '').trim()) return 'batch';
  if (p.includes('/reports/')) return 'single';
  return 'unknown';
};

const parseRunIdFromFile = (name) => {
  const m = String(name || '').match(RUN_ID_RE);
  return m ? m[1] : '';
};

const safeReadDir = async (dirPath) => {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
};

const listSubdirsDesc = async (dirPath, maxDirs = MAX_SCAN_DIRS_PER_KIND) => {
  const entries = await safeReadDir(dirPath);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, maxDirs);
};

const listReportNamesDesc = async (reportsDir, maxFiles = MAX_REPORTS_PER_DIR) => {
  const entries = await safeReadDir(reportsDir);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.includes('_multigate_report.') || name.endsWith('_report_contract.json'))
    .sort((a, b) => b.localeCompare(a))
    .slice(0, maxFiles);
};

const sourceLabel = (sources) => {
  if (sources.has('db') && sources.has('artifacts')) return 'merged';
  if (sources.has('db')) return 'db';
  return 'artifacts';
};

const ensureNoStore = (payload) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });

async function fetchUpstreamRuns(fetchImpl) {
  let upstream = null;
  try {
    upstream = await fetchImpl(`${API_BASE}/v1/backtests/runs`, { cache: 'no-store' });
  } catch (err) {
    return { items: [], warning: `DeskOps API unavailable at ${API_BASE}: ${err?.message || 'request failed'}` };
  }
  const body = await upstream.text();
  if (!upstream.ok) {
    return {
      items: [],
      warning: `DeskOps API returned ${upstream.status}${body ? `: ${body.slice(0, 160)}` : ''}`
    };
  }
  try {
    const parsed = JSON.parse(body);
    return { items: Array.isArray(parsed?.items) ? parsed.items : [], warning: '' };
  } catch {
    return { items: [], warning: 'DeskOps API returned invalid JSON for runs' };
  }
}

async function scanArtifactRuns(gulfchainRoot, limit) {
  const artifactsRoot = path.resolve(gulfchainRoot, 'multigate-backtest', 'runs', 'artifacts');
  const reportIndex = new Map();
  let scanned = 0;

  const addArtifact = (absReportPath, batchId = '') => {
    if (scanned >= MAX_SCAN_FILES) return;
    const runId = parseRunIdFromFile(path.basename(absReportPath));
    if (!runId) return;
    scanned += 1;

    const existing = reportIndex.get(runId);
    const relPath = normalizeSlashes(path.relative(gulfchainRoot, absReportPath));
    const nextType = inferRunType(absReportPath, batchId);
    const next = {
      run_id: runId,
      created_at_utc: toIsoFromRunId(runId),
      date_start_et: existing?.date_start_et || '',
      date_end_et: existing?.date_end_et || '',
      run_type: nextType,
      batch_id: batchId || existing?.batch_id || '',
      report_path: absReportPath,
      artifact_report_path: relPath,
      source: 'artifacts',
      sources: new Set(['artifacts'])
    };
    if (!existing) {
      reportIndex.set(runId, next);
      return;
    }
    const mergedType =
      existing.run_type === 'unknown' || existing.run_type === 'single' ? nextType : existing.run_type;
    reportIndex.set(runId, {
      ...existing,
      ...next,
      run_type: mergedType || existing.run_type,
      report_path: existing.report_path || next.report_path,
      artifact_report_path: existing.artifact_report_path || next.artifact_report_path,
      sources: new Set([...(existing.sources || []), 'artifacts'])
    });
  };

  const singleReportsDir = path.join(artifactsRoot, 'reports');
  for (const name of await listReportNamesDesc(singleReportsDir, Math.max(limit, 800))) {
    addArtifact(path.join(singleReportsDir, name));
    if (scanned >= MAX_SCAN_FILES) break;
  }

  const nestedKinds = [
    { kind: 'regime_switch', dir: path.join(artifactsRoot, 'regime_switch') },
    { kind: 'walk_forward', dir: path.join(artifactsRoot, 'walk_forward') },
    { kind: 'batch', dir: path.join(artifactsRoot, 'batches') }
  ];
  for (const group of nestedKinds) {
    if (scanned >= MAX_SCAN_FILES) break;
    const runDirs = await listSubdirsDesc(group.dir);
    for (const runDirName of runDirs) {
      const reportsDir = path.join(group.dir, runDirName, 'reports');
      const reportNames = await listReportNamesDesc(reportsDir);
      for (const reportName of reportNames) {
        const batchId = group.kind === 'batch' || group.kind === 'walk_forward' ? runDirName : '';
        addArtifact(path.join(reportsDir, reportName), batchId);
        if (scanned >= MAX_SCAN_FILES) break;
      }
      if (scanned >= MAX_SCAN_FILES) break;
    }
  }

  return Array.from(reportIndex.values());
}

export async function GET({ fetch, url }) {
  const limit = parseLimit(url.searchParams.get('limit'));
  const includeArtifacts = String(url.searchParams.get('include_artifacts') || '1') !== '0';
  const upstream = await fetchUpstreamRuns(fetch);

  const merged = new Map();
  for (const raw of upstream.items) {
    const runId = String(raw?.run_id || '').trim();
    if (!runId) continue;
    const next = {
      run_id: runId,
      created_at_utc: String(raw?.created_at_utc || '').trim() || toIsoFromRunId(runId),
      date_start_et: String(raw?.date_start_et || ''),
      date_end_et: String(raw?.date_end_et || ''),
      run_type: inferRunType(raw?.report_path || raw?.equity_curve_path || raw?.pnl_hist_path || '', raw?.batch_id),
      batch_id: String(raw?.batch_id || ''),
      report_path: String(raw?.report_path || ''),
      artifact_report_path: '',
      source: 'db',
      sources: new Set(['db'])
    };
    merged.set(runId, next);
  }

  let artifactWarning = '';
  if (includeArtifacts) {
    const gulfchainRoot = resolveGulfchainRoot();
    if (!gulfchainRoot) {
      artifactWarning = 'Gulfchain root not found; skipping artifact run discovery';
    } else {
      try {
        const artifactItems = await scanArtifactRuns(gulfchainRoot, limit);
        for (const item of artifactItems) {
          const existing = merged.get(item.run_id);
          if (!existing) {
            merged.set(item.run_id, item);
            continue;
          }
          const runType =
            existing.run_type === 'unknown' || existing.run_type === 'single'
              ? item.run_type || existing.run_type
              : existing.run_type;
          merged.set(item.run_id, {
            ...existing,
            run_type: runType,
            batch_id: existing.batch_id || item.batch_id || '',
            report_path: existing.report_path || item.report_path || '',
            artifact_report_path: existing.artifact_report_path || item.artifact_report_path || '',
            created_at_utc: existing.created_at_utc || item.created_at_utc || '',
            sources: new Set([...(existing.sources || []), 'artifacts'])
          });
        }
      } catch (err) {
        artifactWarning = `artifact discovery failed: ${err?.message || 'unknown error'}`;
      }
    }
  }

  const allItems = Array.from(merged.values())
    .map((item) => {
      const sources = item.sources instanceof Set ? item.sources : new Set(item.sources || []);
      return {
        ...item,
        run_type: item.run_type || 'unknown',
        source: sourceLabel(sources),
        sources: Array.from(sources).sort()
      };
    })
    .sort((a, b) => {
      const diff = toEpochMs(b) - toEpochMs(a);
      if (diff !== 0) return diff;
      return String(b.run_id || '').localeCompare(String(a.run_id || ''));
    });

  const items = allItems.slice(0, limit);
  const byType = {};
  const bySource = {};
  for (const item of allItems) {
    byType[item.run_type] = (byType[item.run_type] || 0) + 1;
    bySource[item.source] = (bySource[item.source] || 0) + 1;
  }

  return ensureNoStore({
    items,
    count: items.length,
    total_available: allItems.length,
    by_type: byType,
    by_source: bySource,
    warnings: [upstream.warning, artifactWarning].filter(Boolean)
  });
}

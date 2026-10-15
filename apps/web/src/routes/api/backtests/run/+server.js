import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';

const API_BASE = env.API_BASE_URL || 'http://127.0.0.1:9090';
const MAX_SCAN_DIRS_PER_KIND = 3000;

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/');

const toIsoFromRunId = (runId) => {
  const m = String(runId || '').match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_/);
  if (!m) return '';
  const [, yy, mm, dd, hh, mi, ss] = m;
  return `${yy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`;
};

const inferRunType = (candidatePath, batchId = '') => {
  const p = normalizeSlashes(candidatePath);
  if (p.includes('/regime_switch/')) return 'regime_switch';
  if (p.includes('/walk_forward/')) return 'walk_forward';
  if (p.includes('/batches/') || String(batchId || '').trim()) return 'batch';
  if (p.includes('/reports/')) return 'single';
  return 'unknown';
};

const isBlank = (value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

const parseObj = (value) => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const safeJson = (value) => {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
};

const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const listSubdirsDesc = async (dirPath, maxDirs = MAX_SCAN_DIRS_PER_KIND) => {
  let entries = [];
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, maxDirs);
};

const reportPathCandidates = (reportsDir, runId) => [
  path.join(reportsDir, `${runId}_multigate_report.json`),
  path.join(reportsDir, `${runId}_report_contract.json`)
];

const findArtifactReport = async (gulfchainRoot, runIdRaw) => {
  const artifactsRoot = path.resolve(gulfchainRoot, 'multigate-backtest', 'runs', 'artifacts');
  const runId = String(runIdRaw || '').trim();
  if (!runId) return null;
  const variants = Array.from(new Set([runId, runId.toLowerCase(), runId.toUpperCase()]));

  const rootReports = path.join(artifactsRoot, 'reports');
  for (const id of variants) {
    for (const candidate of reportPathCandidates(rootReports, id)) {
      if (await pathExists(candidate)) return { reportJsonPath: candidate, batchId: '' };
    }
  }

  const dateKey = runId.slice(0, 8);
  const groups = ['batches', 'walk_forward', 'regime_switch'];
  for (const groupName of groups) {
    const groupDir = path.join(artifactsRoot, groupName);
    const dirs = await listSubdirsDesc(groupDir);
    const prioritized = dirs
      .filter((name) => name.includes(dateKey))
      .concat(dirs.filter((name) => !name.includes(dateKey)));
    for (const dirName of prioritized) {
      const reportsDir = path.join(groupDir, dirName, 'reports');
      for (const id of variants) {
        for (const candidate of reportPathCandidates(reportsDir, id)) {
          if (await pathExists(candidate)) {
            const batchId = groupName === 'batches' || groupName === 'walk_forward' ? dirName : '';
            return { reportJsonPath: candidate, batchId };
          }
        }
      }
    }
  }

  return null;
};

const loadArtifactRunDetail = async (runIdRaw) => {
  const gulfchainRoot = resolveGulfchainRoot();
  if (!gulfchainRoot) return null;
  const found = await findArtifactReport(gulfchainRoot, runIdRaw);
  if (!found) return null;

  let report;
  try {
    report = JSON.parse(await fs.readFile(found.reportJsonPath, 'utf8'));
  } catch {
    return null;
  }

  const runInfo = parseObj(report?.run);
  const runContext = parseObj(report?.run_context);
  const context = parseObj(report?.context);
  const payloadParamsObj = parseObj(report?.params);
  const runParams = parseObj(runInfo?.params);
  const payloadParams = parseObj(report?.params_json);
  const runInfoParamsJson = parseObj(runInfo?.params_json);
  const summary = parseObj(report?.summary);
  const payloadMetricsObj = parseObj(report?.metrics);
  const payloadMetrics = parseObj(report?.metrics_json);
  const mergedParams = {
    ...runContext,
    ...context,
    ...payloadParamsObj,
    ...payloadParams,
    ...runInfoParamsJson,
    ...runParams
  };
  if (isBlank(mergedParams.batch_id) && !isBlank(found.batchId)) {
    mergedParams.batch_id = found.batchId;
  }
  const mergedMetrics = { ...summary, ...payloadMetricsObj, ...payloadMetrics };

  const runId = String(runInfo?.run_id || runIdRaw || '').trim();
  const reportPath = String(runInfo?.report_path || '').trim();
  const fallbackMd = found.reportJsonPath.endsWith('.json')
    ? found.reportJsonPath.replace(/\.json$/i, '.md')
    : '';

  return {
    run_id: runId,
    created_at_utc: String(runInfo?.created_at_utc || '').trim() || toIsoFromRunId(runId),
    date_start_et: String(runInfo?.date_start_et || '').trim(),
    date_end_et: String(runInfo?.date_end_et || '').trim(),
    report_path: reportPath || ((await pathExists(fallbackMd)) ? fallbackMd : ''),
    equity_curve_path: String(runInfo?.equity_curve_path || '').trim(),
    pnl_hist_path: String(runInfo?.pnl_hist_path || '').trim(),
    params: mergedParams,
    params_json: safeJson(mergedParams),
    metrics: mergedMetrics,
    metrics_json: safeJson(mergedMetrics),
    run_type: inferRunType(found.reportJsonPath, mergedParams.batch_id || found.batchId || ''),
    batch_id: String(mergedParams.batch_id || found.batchId || '').trim(),
    source: 'artifacts',
    artifact_report_path: normalizeSlashes(path.relative(gulfchainRoot, found.reportJsonPath))
  };
};

const needsArtifactEnrichment = (detail) =>
  !detail ||
  (isBlank(detail.params_json) && isBlank(detail.params)) ||
  (isBlank(detail.date_start_et) && isBlank(detail.date_end_et)) ||
  isBlank(detail.report_path);

const mergeRunDetail = (baseDetail, artifactDetail) => {
  if (!baseDetail) return artifactDetail;
  if (!artifactDetail) return baseDetail;
  const out = { ...artifactDetail, ...baseDetail };
  const keys = new Set([...Object.keys(artifactDetail), ...Object.keys(baseDetail)]);
  for (const key of keys) {
    if (isBlank(baseDetail[key]) && !isBlank(artifactDetail[key])) {
      out[key] = artifactDetail[key];
    }
  }
  const mergedParams = {
    ...parseObj(artifactDetail.params || artifactDetail.params_json),
    ...parseObj(baseDetail.params || baseDetail.params_json)
  };
  const mergedMetrics = {
    ...parseObj(artifactDetail.metrics || artifactDetail.metrics_json),
    ...parseObj(baseDetail.metrics || baseDetail.metrics_json)
  };
  if (Object.keys(mergedParams).length) {
    out.params = mergedParams;
    out.params_json = safeJson(mergedParams);
  }
  if (Object.keys(mergedMetrics).length) {
    out.metrics = mergedMetrics;
    out.metrics_json = safeJson(mergedMetrics);
  }
  return out;
};

export async function GET({ url, fetch }) {
  const runId = String(url.searchParams.get('run_id') || '').trim();
  if (!runId) {
    return json({ error: 'run_id is required' }, { status: 400 });
  }

  const target = new URL(`${API_BASE}/v1/backtests/run`);
  target.searchParams.set('run_id', runId);

  let upstream;
  let upstreamErr = null;
  try {
    upstream = await fetch(target.toString());
  } catch (err) {
    upstreamErr = err;
  }

  let upstreamBody = '';
  let upstreamPayload = null;
  if (upstream) {
    upstreamBody = await upstream.text();
    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        upstreamPayload = JSON.parse(upstreamBody);
      } catch {
        upstreamPayload = null;
      }
    }
  }

  const shouldTryArtifact = !upstream || !upstream.ok || needsArtifactEnrichment(upstreamPayload);
  if (shouldTryArtifact) {
    const artifactDetail = await loadArtifactRunDetail(runId);
    if (artifactDetail) {
      const merged = mergeRunDetail(upstream?.ok ? upstreamPayload : null, artifactDetail);
      return new Response(JSON.stringify(merged), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
  }

  if (upstream) {
    return new Response(upstreamBody, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json'
      }
    });
  }

  return json(
    {
      error: `DeskOps API unavailable at ${API_BASE}: ${upstreamErr?.message || 'request failed'}`
    },
    { status: 503 }
  );
}

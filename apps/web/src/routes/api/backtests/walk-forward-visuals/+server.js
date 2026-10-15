import { json } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';

const MAX_STDIO_BYTES = 1024 * 1024 * 8;
const RUN_TIMEOUT_MS = 300_000;

const noStore = (payload, status = 200) =>
  json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/');

const isWithin = (parent, target) => {
  const rel = path.relative(parent, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const relFromRoot = (root, abs) => normalizeSlashes(path.relative(root, abs));

const runCommand = async (bin, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs || RUN_TIMEOUT_MS,
        maxBuffer: options.maxBuffer || MAX_STDIO_BYTES,
        env: options.env || process.env
      },
      (err, stdout, stderr) => {
        if (err) {
          resolve({
            ok: false,
            exit_code: typeof err.code === 'number' ? err.code : 1,
            signal: err.signal || '',
            stdout: String(stdout || ''),
            stderr: String(stderr || ''),
            timed_out: Boolean(err.killed && err.signal === 'SIGTERM')
          });
          return;
        }
        resolve({
          ok: true,
          exit_code: 0,
          signal: '',
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          timed_out: false
        });
      }
    ).on('error', reject);
  });

const readResultsSummary = async (resultsJsonPath) => {
  try {
    const payload = JSON.parse(await fs.readFile(resultsJsonPath, 'utf8'));
    const rows = Array.isArray(payload.results) ? payload.results : [];
    const fallback = rows.filter((r) => r?.selection_mode === 'below_min_trades_fallback').length;
    const noCandidate = rows.filter((r) => r?.status === 'no_candidate').length;
    const selected = rows.length - noCandidate;
    return {
      ok: true,
      generated_at_utc: String(payload.generated_at_utc || ''),
      gate_id: String(payload.gate_id || ''),
      strategy_id: String(payload.strategy_id || ''),
      score_metric: String(payload.score_metric || ''),
      windows: rows.length,
      selected,
      fallback,
      no_candidate: noCandidate
    };
  } catch {
    return { ok: false };
  }
};

const listWalkForwardBatches = async (gulfchainRoot) => {
  const wfRoot = path.resolve(gulfchainRoot, 'multigate-backtest', 'runs', 'artifacts', 'walk_forward');
  if (!(await pathExists(wfRoot))) {
    return { wfRoot, batches: [] };
  }

  let entries = [];
  try {
    entries = await fs.readdir(wfRoot, { withFileTypes: true });
  } catch {
    entries = [];
  }

  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort((a, b) => b.localeCompare(a));
  const batches = [];
  for (const batchId of dirs) {
    const batchDir = path.join(wfRoot, batchId);
    const resultsJsonPath = path.join(batchDir, 'walk_forward_results.json');
    if (!(await pathExists(resultsJsonPath))) continue;

    const chartsDir = path.join(batchDir, 'charts');
    const dashboardName = `walk_forward_dashboard_${batchId}.png`;
    const dashboardPath = path.join(chartsDir, dashboardName);
    const summary = await readResultsSummary(resultsJsonPath);
    const dashboardExists = await pathExists(dashboardPath);

    let mtime = '';
    try {
      const st = await fs.stat(resultsJsonPath);
      mtime = st.mtime.toISOString();
    } catch {
      mtime = '';
    }

    batches.push({
      batch_id: batchId,
      batch_dir: relFromRoot(gulfchainRoot, batchDir),
      results_json_path: relFromRoot(gulfchainRoot, resultsJsonPath),
      results_mtime_utc: mtime,
      dashboard_exists: dashboardExists,
      dashboard_path: dashboardExists ? relFromRoot(gulfchainRoot, dashboardPath) : '',
      ...summary
    });
  }

  return { wfRoot, batches };
};

const resolvePython = async (repoRoot) => {
  const candidates = [
    path.join(repoRoot, '.venv', 'bin', 'python'),
    path.join(repoRoot, '.venv', 'bin', 'python3'),
    'python3',
    'python'
  ];
  for (const cand of candidates) {
    if (cand === 'python3' || cand === 'python') return cand;
    if (await pathExists(cand)) return cand;
  }
  return 'python3';
};

export async function GET() {
  const gulfchainRoot = resolveGulfchainRoot();
  if (!gulfchainRoot) {
    return noStore({ ok: false, error: 'Gulfchain root not found' }, 500);
  }
  const { wfRoot, batches } = await listWalkForwardBatches(gulfchainRoot);
  return noStore({
    ok: true,
    walk_forward_root: relFromRoot(gulfchainRoot, wfRoot),
    count: batches.length,
    batches
  });
}

export async function POST({ request }) {
  const gulfchainRoot = resolveGulfchainRoot();
  if (!gulfchainRoot) {
    return noStore({ ok: false, error: 'Gulfchain root not found' }, 500);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const batchId = String(body?.batch_id || '').trim();
  if (!batchId) {
    return noStore({ ok: false, error: 'batch_id is required' }, 400);
  }

  const repoRoot = path.resolve(gulfchainRoot, 'multigate-backtest');
  const wfRoot = path.resolve(repoRoot, 'runs', 'artifacts', 'walk_forward');
  const batchDir = path.resolve(wfRoot, batchId);
  if (!isWithin(wfRoot, batchDir) || !(await pathExists(batchDir))) {
    return noStore({ ok: false, error: `Unknown walk-forward batch: ${batchId}` }, 404);
  }

  const resultsJsonPath = path.join(batchDir, 'walk_forward_results.json');
  if (!(await pathExists(resultsJsonPath))) {
    return noStore({ ok: false, error: `Missing walk_forward_results.json for batch ${batchId}` }, 404);
  }

  const outPath = path.join(batchDir, 'charts', `walk_forward_dashboard_${batchId}.png`);
  const scriptPath = path.join(repoRoot, 'scripts', 'generate_walk_forward_dashboard.py');
  if (!(await pathExists(scriptPath))) {
    return noStore({ ok: false, error: 'Dashboard generator script is missing' }, 500);
  }

  const pyBin = await resolvePython(repoRoot);
  const result = await runCommand(
    pyBin,
    [scriptPath, '--results-json', resultsJsonPath, '--output', outPath],
    {
      cwd: repoRoot,
      env: { ...process.env, MPLCONFIGDIR: process.env.MPLCONFIGDIR || '/tmp' }
    }
  );
  if (!result.ok) {
    return noStore(
      {
        ok: false,
        error: 'Failed to generate dashboard',
        command: `${pyBin} ${scriptPath} --results-json ... --output ...`,
        exit_code: result.exit_code,
        stderr: result.stderr,
        stdout: result.stdout
      },
      500
    );
  }

  if (!(await pathExists(outPath))) {
    return noStore({ ok: false, error: 'Dashboard generation finished but output file was not found' }, 500);
  }

  return noStore({
    ok: true,
    batch_id: batchId,
    output_path: relFromRoot(gulfchainRoot, outPath),
    stdout: result.stdout.trim()
  });
}

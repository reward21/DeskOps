import { json } from '@sveltejs/kit';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { listDirSafe, resolveGulfSyncRoot, statOrNull } from '$lib/server/gulfSync.js';

const MAX_STDIO_BYTES = 1024 * 1024 * 2;
const DEFAULT_INTERVAL = 15;
const MIN_INTERVAL = 1;
const MAX_INTERVAL = 600;
const THREAD_RE = /^[A-Za-z0-9_-]{1,80}$/;

const noStore = (payload, status = 200) =>
  json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });

const parseInterval = (value) => {
  const n = Number.parseFloat(String(value || '').trim());
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL;
  return Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, n));
};

const runCommand = async (bin, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        cwd: options.cwd,
        timeout: options.timeoutMs || 180_000,
        maxBuffer: MAX_STDIO_BYTES
      },
      (err, stdout, stderr) => {
        const payload = {
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          exit_code: typeof err?.code === 'number' ? err.code : 0,
          signal: err?.signal || ''
        };
        if (err) {
          resolve({
            ok: false,
            timed_out: Boolean(err?.killed && err?.signal === 'SIGTERM'),
            ...payload
          });
          return;
        }
        resolve({ ok: true, timed_out: false, ...payload });
      }
    ).on('error', reject);
  });

export async function POST({ request }) {
  const rootInfo = resolveGulfSyncRoot();
  if (!rootInfo.ok) return noStore({ ok: false, error: rootInfo.error }, 500);

  const { gulfSyncRoot } = rootInfo;
  const rootStat = await statOrNull(gulfSyncRoot);
  if (!rootStat?.isDirectory()) {
    return noStore({ ok: false, error: `GulfSync root not found at ${gulfSyncRoot}` }, 404);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return noStore({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const action = String(body?.action || '').trim();
  if (!action) return noStore({ ok: false, error: 'action is required' }, 400);

  const gsPath = path.join(gulfSyncRoot, 'gs');
  const gsStat = await statOrNull(gsPath);
  if (!gsStat?.isFile()) {
    return noStore({ ok: false, error: `Missing runner at ${gsPath}` }, 500);
  }

  const startedAt = Date.now();
  let args = [];
  let timeoutMs = 180_000;

  if (action === 'agent_run') {
    args = ['agent', 'run'];
    timeoutMs = 240_000;
  } else if (action === 'bridge_pull') {
    args = ['bridge', 'pull'];
    timeoutMs = 240_000;
  } else if (action === 'quant_run') {
    args = ['quant', 'run'];
    timeoutMs = 240_000;
  } else if (action === 'agent_stop') {
    args = ['agent', 'stop'];
    timeoutMs = 60_000;
  } else if (action === 'start_agents') {
    const interval = parseInterval(body?.interval);
    args = ['start', 'agents', '--interval', String(interval)];
    timeoutMs = 120_000;
  } else if (action === 'handle_thread') {
    const thread = String(body?.thread || '').trim();
    if (!THREAD_RE.test(thread)) {
      return noStore({ ok: false, error: 'Invalid thread value' }, 400);
    }
    const outboxThreadDir = path.join(gulfSyncRoot, 'sync', 'outbox', thread);
    const outboxThreadStat = await statOrNull(outboxThreadDir);
    if (!outboxThreadStat?.isDirectory()) {
      return noStore({ ok: false, error: `Thread not found in sync/outbox: ${thread}` }, 404);
    }
    args = ['agent', 'handle', '--thread', thread];
    timeoutMs = 240_000;
  } else if (action === 'refresh_state') {
    args = ['agent', 'status'];
    timeoutMs = 60_000;
  } else {
    return noStore(
      {
        ok: false,
        error: 'Unknown action',
        allowed_actions: ['agent_run', 'bridge_pull', 'quant_run', 'agent_stop', 'start_agents', 'handle_thread', 'refresh_state']
      },
      400
    );
  }

  try {
    const result = await runCommand(gsPath, args, { cwd: gulfSyncRoot, timeoutMs });
    const endedAt = Date.now();
    return noStore({
      ok: result.ok,
      action,
      command: ['./gs', ...args].join(' '),
      started_at_utc: new Date(startedAt).toISOString(),
      ended_at_utc: new Date(endedAt).toISOString(),
      duration_ms: Math.max(0, endedAt - startedAt),
      exit_code: result.exit_code,
      signal: result.signal,
      timed_out: result.timed_out,
      stdout: result.stdout,
      stderr: result.stderr
    });
  } catch (err) {
    return noStore({ ok: false, error: `Failed to run action: ${err?.message || 'unknown error'}` }, 500);
  }
}

export async function GET() {
  const rootInfo = resolveGulfSyncRoot();
  if (!rootInfo.ok) return noStore({ ok: false, error: rootInfo.error }, 500);
  const outboxDir = path.join(rootInfo.gulfSyncRoot, 'sync', 'outbox');
  const entries = await listDirSafe(outboxDir);
  const threads = entries
    .filter((entry) => entry.isDirectory() && THREAD_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
  return noStore({
    ok: true,
    allowed_actions: ['agent_run', 'bridge_pull', 'quant_run', 'agent_stop', 'start_agents', 'handle_thread', 'refresh_state'],
    threads
  });
}

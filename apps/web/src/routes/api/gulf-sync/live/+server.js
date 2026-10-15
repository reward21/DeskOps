import { json } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  listDirSafe,
  readJsonIfExists,
  readTextIfExists,
  relFrom,
  resolveGulfSyncRoot,
  statOrNull
} from '$lib/server/gulfSync.js';

const MAX_QUEUE_READ_BYTES = 4 * 1024 * 1024;
const DEFAULT_PREVIEW_CHARS = 260;
const MAX_PREVIEW_CHARS = 1200;
const DEFAULT_RECENT_LIMIT = 8;
const MAX_RECENT_LIMIT = 30;
const CONTRACT_SCAN_MAX_DIRS = 2500;
const CONTRACT_SCAN_MAX_FILES = 25000;

const noStore = (payload, status = 200) =>
  json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });

const parseBoundedInt = (value, fallback, min, max) => {
  const n = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const toIsoIfValid = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
};

const pushTopLex = (arr, item, key, limit) => {
  const sortKey = String(item?.[key] || '');
  if (!sortKey) return;
  arr.push(item);
  arr.sort((a, b) => String(b?.[key] || '').localeCompare(String(a?.[key] || '')));
  if (arr.length > limit) arr.length = limit;
};

const summarizeText = (value, maxChars) => {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1)}…`;
};

async function readTailUtf8(filePath, maxBytes) {
  const stat = await statOrNull(filePath);
  if (!stat?.isFile()) return { text: '', truncated: false, size: 0 };
  const size = Number(stat.size || 0);
  if (size <= 0) return { text: '', truncated: false, size };

  const readBytes = Math.min(size, maxBytes);
  const start = Math.max(0, size - readBytes);
  const handle = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(readBytes);
    await handle.read(buf, 0, readBytes, start);
    let text = buf.toString('utf-8');
    const truncated = start > 0;
    if (truncated) {
      const firstNl = text.indexOf('\n');
      if (firstNl >= 0) text = text.slice(firstNl + 1);
    }
    return { text, truncated, size };
  } finally {
    await handle.close();
  }
}

function parseJsonl(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // ignore malformed lines
    }
  }
  return out;
}

function mergeThreadStats(base, updates) {
  const next = {
    queued: Number(base?.queued || 0),
    done: Number(base?.done || 0),
    skipped: Number(base?.skipped || 0),
    last_queued_at_utc: String(base?.last_queued_at_utc || ''),
    last_done_at_utc: String(base?.last_done_at_utc || ''),
    last_done_status: String(base?.last_done_status || ''),
    last_done_note: String(base?.last_done_note || '')
  };
  Object.assign(next, updates || {});
  return next;
}

async function summarizeQueue(statusDir, warnings) {
  const queuePath = path.join(statusDir, 'queue.jsonl');
  const donePath = path.join(statusDir, 'queue_done.jsonl');
  const [queueTail, doneTail] = await Promise.all([
    readTailUtf8(queuePath, MAX_QUEUE_READ_BYTES),
    readTailUtf8(donePath, MAX_QUEUE_READ_BYTES)
  ]);

  const queueEntries = parseJsonl(queueTail.text);
  const doneEntries = parseJsonl(doneTail.text);
  const queueTruncated = queueTail.truncated;
  const doneTruncated = doneTail.truncated;
  if (queueTruncated || doneTruncated) {
    warnings.push('Queue history was truncated for live parsing; pending counts are estimated from recent records.');
  }

  const doneById = new Set();
  const threadMap = new Map();
  let latestQueuedAt = '';
  let latestDoneAt = '';

  for (const row of doneEntries) {
    const id = String(row?.id || '').trim();
    if (id) doneById.add(id);
    const thread = String(row?.thread || '').trim();
    if (!thread) continue;
    const ts = toIsoIfValid(row?.ts);
    if (ts && (!latestDoneAt || ts > latestDoneAt)) latestDoneAt = ts;
    const status = String(row?.status || '').trim().toLowerCase();
    const prev = threadMap.get(thread);
    const patch = {
      done: Number(prev?.done || 0) + 1,
      skipped: Number(prev?.skipped || 0) + (status === 'skipped' ? 1 : 0),
      last_done_at_utc: ts || prev?.last_done_at_utc || '',
      last_done_status: status || prev?.last_done_status || '',
      last_done_note: String(row?.note || '').trim() || prev?.last_done_note || ''
    };
    threadMap.set(thread, mergeThreadStats(prev, patch));
  }

  let pendingEstimate = 0;
  for (const row of queueEntries) {
    const id = String(row?.id || '').trim();
    if (id && !doneById.has(id)) pendingEstimate += 1;
    const thread = String(row?.thread || '').trim();
    if (!thread) continue;
    const ts = toIsoIfValid(row?.ts);
    if (ts && (!latestQueuedAt || ts > latestQueuedAt)) latestQueuedAt = ts;
    const prev = threadMap.get(thread);
    const patch = {
      queued: Number(prev?.queued || 0) + 1,
      last_queued_at_utc: ts || prev?.last_queued_at_utc || ''
    };
    threadMap.set(thread, mergeThreadStats(prev, patch));
  }

  return {
    queued_total: queueEntries.length,
    done_total: doneEntries.length,
    pending_estimate: Math.max(0, pendingEstimate),
    latest_queued_at_utc: latestQueuedAt,
    latest_done_at_utc: latestDoneAt,
    truncated: queueTruncated || doneTruncated,
    by_thread: threadMap
  };
}

async function summarizeDirectory(dirPath, options = {}) {
  const { recentLimit = DEFAULT_RECENT_LIMIT, acceptName = () => true, lexicographic = true } = options;
  const entries = await listDirSafe(dirPath);
  let count = 0;
  const chosen = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!acceptName(entry.name)) continue;
    count += 1;
    if (lexicographic) {
      pushTopLex(chosen, { name: entry.name, absPath: path.join(dirPath, entry.name), sort_key: entry.name }, 'sort_key', recentLimit);
    }
  }

  const recent = [];
  for (const item of chosen) {
    const stat = await statOrNull(item.absPath);
    if (!stat?.isFile()) continue;
    recent.push({
      name: item.name,
      abs_path: item.absPath,
      size_bytes: Number(stat.size || 0),
      mtime_utc: stat.mtime?.toISOString?.() || ''
    });
  }

  return { count, recent };
}

function classifyContract(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.includes('_batch_contract.json')) return 'batch';
  if (lower.includes('_pass_contract.json')) return 'pass';
  if (lower.includes('_governance_contract.json')) return 'governance';
  if (lower.includes('_report_contract.json')) return 'report';
  return 'contract';
}

async function scanRecentContracts(contractsRoot, recentLimit, gulfchainRoot, warnings) {
  const stack = [contractsRoot];
  const recent = [];
  let scannedDirs = 0;
  let scannedFiles = 0;
  let totalContracts = 0;

  while (stack.length > 0 && scannedDirs < CONTRACT_SCAN_MAX_DIRS && scannedFiles < CONTRACT_SCAN_MAX_FILES) {
    const dir = stack.pop();
    if (!dir) continue;
    scannedDirs += 1;
    const entries = await listDirSafe(dir);
    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(absPath);
        continue;
      }
      if (!entry.isFile()) continue;
      scannedFiles += 1;
      if (!entry.name.endsWith('_contract.json')) continue;
      totalContracts += 1;
      pushTopLex(
        recent,
        {
          name: entry.name,
          sort_key: entry.name,
          abs_path: absPath
        },
        'sort_key',
        recentLimit
      );
      if (scannedFiles >= CONTRACT_SCAN_MAX_FILES) break;
    }
  }

  if (scannedDirs >= CONTRACT_SCAN_MAX_DIRS || scannedFiles >= CONTRACT_SCAN_MAX_FILES) {
    warnings.push('Contract scan was capped for performance; counts may be incomplete.');
  }

  const enriched = [];
  for (const item of recent) {
    const stat = await statOrNull(item.abs_path);
    if (!stat?.isFile()) continue;
    enriched.push({
      name: item.name,
      type: classifyContract(item.name),
      rel_path: relFrom(gulfchainRoot, item.abs_path),
      size_bytes: Number(stat.size || 0),
      mtime_utc: stat.mtime?.toISOString?.() || ''
    });
  }

  return {
    count: totalContracts,
    recent: enriched
  };
}

async function readLogSummary(logPath, gulfchainRoot) {
  const stat = await statOrNull(logPath);
  if (!stat?.isFile()) return null;
  const tail = await readTailUtf8(logPath, 12 * 1024);
  const lines = String(tail.text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lastLine = lines.length ? lines[lines.length - 1] : '';
  return {
    name: path.basename(logPath),
    rel_path: relFrom(gulfchainRoot, logPath),
    size_bytes: Number(stat.size || 0),
    mtime_utc: stat.mtime?.toISOString?.() || '',
    last_line: summarizeText(lastLine, 320)
  };
}

export async function GET({ url }) {
  const previewChars = parseBoundedInt(url.searchParams.get('preview_chars'), DEFAULT_PREVIEW_CHARS, 60, MAX_PREVIEW_CHARS);
  const recentLimit = parseBoundedInt(url.searchParams.get('recent_limit'), DEFAULT_RECENT_LIMIT, 3, MAX_RECENT_LIMIT);
  const rootInfo = resolveGulfSyncRoot();
  if (!rootInfo.ok) {
    return noStore({ ok: false, error: rootInfo.error }, 500);
  }

  const { gulfchainRoot, gulfSyncRoot } = rootInfo;
  const rootStat = await statOrNull(gulfSyncRoot);
  if (!rootStat?.isDirectory()) {
    return noStore({ ok: false, error: `GulfSync root not found at ${gulfSyncRoot}` }, 404);
  }

  const warnings = [];
  const statusDir = path.join(gulfSyncRoot, 'status');
  const outboxDir = path.join(gulfSyncRoot, 'sync', 'outbox');
  const inboxDir = path.join(gulfSyncRoot, 'inbox');
  const packetsDir = path.join(gulfSyncRoot, 'sync', 'packets');
  const contractsDir = path.join(gulfSyncRoot, 'sync', 'contracts', 'backtest');

  const [state, cursor, latestContractIndex, lastRunIdRaw, queueSummary] = await Promise.all([
    readJsonIfExists(path.join(statusDir, 'state.json')),
    readJsonIfExists(path.join(statusDir, 'inbox_cursor.json')),
    readJsonIfExists(path.join(contractsDir, 'latest.json')),
    readTextIfExists(path.join(statusDir, 'last_backtest_run_id.txt')),
    summarizeQueue(statusDir, warnings)
  ]);

  const [inboxSummary, packetSummary, contractSummary] = await Promise.all([
    summarizeDirectory(inboxDir, { recentLimit, acceptName: (name) => name.endsWith('.md') }),
    summarizeDirectory(packetsDir, { recentLimit, acceptName: (name) => name.endsWith('_sync_packet.md') || name === 'latest.md' }),
    scanRecentContracts(contractsDir, recentLimit, gulfchainRoot, warnings)
  ]);

  const outboxEntries = await listDirSafe(outboxDir);
  const threadNames = outboxEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const threads = [];
  for (const thread of threadNames) {
    const nextPath = path.join(outboxDir, thread, 'next.md');
    const nextStat = await statOrNull(nextPath);
    const rawText = nextStat?.isFile() ? await readTextIfExists(nextPath) : '';
    const lastSig = await readTextIfExists(path.join(statusDir, 'outbox', `last_outbox_sig_${thread}.txt`));
    const queueStats = queueSummary.by_thread.get(thread) || mergeThreadStats({}, {});
    threads.push({
      thread,
      rel_path: relFrom(gulfchainRoot, nextPath),
      has_prompt: Boolean(nextStat?.isFile()),
      next_size_bytes: Number(nextStat?.size || 0),
      next_mtime_utc: nextStat?.mtime?.toISOString?.() || '',
      preview: summarizeText(rawText, previewChars),
      last_outbox_sig: String(lastSig || '').trim(),
      queue: queueStats
    });
  }

  const logNames = ['bridge_loop.log', 'quant_loop.log', 'agent_loop.log', 'handler_loop.log'];
  const logs = (
    await Promise.all(logNames.map((name) => readLogSummary(path.join(statusDir, 'logs', name), gulfchainRoot)))
  ).filter(Boolean);

  const latestContractMeta = latestContractIndex
    ? {
        run_id: String(latestContractIndex?.run?.run_id || latestContractIndex?.report?.run?.run_id || '').trim(),
        generated_at_utc: toIsoIfValid(latestContractIndex?.generated_at_utc),
        trade_mode: String(latestContractIndex?.trade_mode || '').trim(),
        window_start_et: String(latestContractIndex?.data_window_et?.start || '').trim(),
        window_end_et: String(latestContractIndex?.data_window_et?.end || '').trim(),
        source_report_path: String(latestContractIndex?.source?.report_path || '').trim()
      }
    : null;

  const lastRunId = String(lastRunIdRaw || '').trim();
  const statePayload = {
    status: String(state?.status || 'UNKNOWN').trim() || 'UNKNOWN',
    step: String(state?.step || '').trim(),
    detail: String(state?.detail || '').trim(),
    ts: String(state?.ts || '').trim(),
    pid: Number(state?.pid || 0) || 0
  };

  return noStore({
    ok: true,
    now_utc: new Date().toISOString(),
    roots: {
      gulfchain: gulfchainRoot,
      gulf_sync: gulfSyncRoot
    },
    state: statePayload,
    queue: {
      queued_total: queueSummary.queued_total,
      done_total: queueSummary.done_total,
      pending_estimate: queueSummary.pending_estimate,
      latest_queued_at_utc: queueSummary.latest_queued_at_utc,
      latest_done_at_utc: queueSummary.latest_done_at_utc,
      truncated: queueSummary.truncated
    },
    counts: {
      inbox_files: inboxSummary.count,
      packet_files: packetSummary.count,
      outbox_threads: threadNames.length,
      contracts: contractSummary.count
    },
    latest: {
      last_backtest_run_id: lastRunId,
      contract_index: latestContractMeta
    },
    cursor: cursor || {},
    threads,
    logs,
    recent: {
      inbox: inboxSummary.recent.map((row) => ({
        name: row.name,
        size_bytes: row.size_bytes,
        mtime_utc: row.mtime_utc,
        rel_path: relFrom(gulfchainRoot, row.abs_path)
      })),
      packets: packetSummary.recent.map((row) => ({
        name: row.name,
        size_bytes: row.size_bytes,
        mtime_utc: row.mtime_utc,
        rel_path: relFrom(gulfchainRoot, row.abs_path)
      })),
      contracts: contractSummary.recent
    },
    warnings
  });
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { json } from '@sveltejs/kit';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';
import { resolveMysticPaths } from '$lib/server/mysticPaths.js';

const contentTypeFor = (name) => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.csv')) return 'text/csv; charset=utf-8';
  if (lower.endsWith('.ndjson')) return 'application/x-ndjson; charset=utf-8';
  if (lower.endsWith('.sqlite') || lower.endsWith('.sqlite3') || lower.endsWith('.db')) return 'application/vnd.sqlite3';
  return 'application/octet-stream';
};

export async function GET({ url }) {
  const gulfchainRoot = resolveGulfchainRoot();
  if (!gulfchainRoot) {
    return json({ ok: false, error: 'Gulfchain root not found.' }, { status: 500 });
  }

  const requestedPath = String(url.searchParams.get('path') || url.searchParams.get('name') || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!requestedPath) {
    return json({ ok: false, error: 'path is required' }, { status: 400 });
  }

  const mysticPaths = resolveMysticPaths(gulfchainRoot);
  const roots = [
    {
      dir: mysticPaths.outputsDir,
      pathPrefix: 'Mystic/poolcare_scraper/outputs/'
    },
    {
      dir: mysticPaths.storageDir,
      pathPrefix: 'Mystic/storage/'
    }
  ];

  let target = null;
  for (const root of roots) {
    const cleanPath = requestedPath.startsWith(root.pathPrefix)
      ? requestedPath.slice(root.pathPrefix.length)
      : requestedPath;
    const candidate = path.resolve(root.dir, cleanPath);
    const rel = path.relative(root.dir, candidate);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      target = candidate;
      break;
    }
  }

  if (!target) {
    return json({ ok: false, error: 'invalid file' }, { status: 400 });
  }
  const fileName = path.basename(target);

  try {
    const body = await fs.readFile(target);
    return new Response(body, {
      headers: {
        'content-type': contentTypeFor(fileName),
        'content-disposition': `attachment; filename="${fileName.replace(/"/g, '')}"`,
        'cache-control': 'no-store'
      }
    });
  } catch {
    return json({ ok: false, error: 'file not found' }, { status: 404 });
  }
}

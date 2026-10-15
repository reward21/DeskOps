import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { json } from '@sveltejs/kit';
import sharp from 'sharp';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';
import { resolveMysticPaths } from '$lib/server/mysticPaths.js';

const execFileAsync = promisify(execFile);

const contentTypeFor = (name) => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
};

const requestedWidth = (url) => {
  const parsed = Number(url.searchParams.get('w') || url.searchParams.get('width') || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(96, Math.min(1800, Math.round(parsed)));
};

const cleanPhotoPath = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^Mystic\/poolcare_scraper\/outputs\/all_users\//, '')
    .replace(/^Mystic\/poolcare_scraper\/outputs\//, '')
    .replace(/^poolcare_scraper\/outputs\/all_users\//, '')
    .replace(/^poolcare_scraper\/outputs\//, '')
    .replace(/^outputs\/all_users\//, '')
    .replace(/^outputs\//, '')
    .replace(/^all_users\//, '');

async function convertHeicWithSips(target, cacheRoot, width) {
  const stat = await fs.stat(target);
  const hash = crypto
    .createHash('sha256')
    .update(target)
    .update(String(stat.mtimeMs))
    .update(String(stat.size))
    .update(String(width || 'full'))
    .digest('hex')
    .slice(0, 28);
  const output = path.join(cacheRoot, `${hash}.jpg`);

  try {
    return await fs.readFile(output);
  } catch {
    // Cache miss; create the browser-friendly copy below.
  }

  await fs.mkdir(cacheRoot, { recursive: true });
  const args = ['-s', 'format', 'jpeg'];
  if (width) args.push('-Z', String(width));
  args.push(target, '--out', output);
  await execFileAsync('sips', args, { timeout: 30000 });
  return fs.readFile(output);
}

export async function GET({ url }) {
  const gulfchainRoot = resolveGulfchainRoot();
  if (!gulfchainRoot) {
    return json({ ok: false, error: 'Gulfchain root not found.' }, { status: 500 });
  }

  const relPath = cleanPhotoPath(url.searchParams.get('path') || '');
  const width = requestedWidth(url);
  if (!relPath) {
    return json({ ok: false, error: 'path is required' }, { status: 400 });
  }

  const mysticPaths = resolveMysticPaths(gulfchainRoot);
  const outputsRoot = mysticPaths.outputsDir;
  const photoRoots = [path.join(outputsRoot, 'all_users'), outputsRoot];

  for (const root of photoRoots) {
    const target = path.resolve(root, relPath);
    const rel = path.relative(root, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      continue;
    }

    try {
      const lower = target.toLowerCase();
      if (width || lower.endsWith('.heic')) {
        let body;
        try {
          const image = sharp(target).rotate();
          if (width) image.resize({ width, withoutEnlargement: true });
          body = await image.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
        } catch (error) {
          if (!lower.endsWith('.heic')) throw error;
          body = await convertHeicWithSips(target, path.join(mysticPaths.storageDir, 'photo-cache'), width);
        }
        return new Response(body, {
          headers: {
            'content-type': 'image/jpeg',
            'cache-control': 'public, max-age=86400'
          }
        });
      }

      const body = await fs.readFile(target);
      return new Response(body, {
        headers: {
          'content-type': contentTypeFor(target),
          'cache-control': 'public, max-age=86400'
        }
      });
    } catch {
      // Try the next known photo root.
    }
  }

  return json({ ok: false, error: 'photo not found' }, { status: 404 });
}

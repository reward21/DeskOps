import fs from 'node:fs/promises';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';
import { resolveMysticPaths } from '$lib/server/mysticPaths.js';

export async function GET() {
  const gulfchainRoot = resolveGulfchainRoot();
  if (!gulfchainRoot) {
    return new Response('Gulfchain root not found.', { status: 404 });
  }

  const workspacePath = resolveMysticPaths(gulfchainRoot).workspacePath;
  try {
    const body = await fs.readFile(workspacePath, 'utf-8');
    return new Response(body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': 'inline; filename="Mystic.code-workspace"'
      }
    });
  } catch {
    return new Response('Mystic workspace file not found.', { status: 404 });
  }
}

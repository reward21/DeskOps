import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveGulfchainRoot } from '$lib/server/gulfchainRoot.js';

// Fixed executable and module; request text is JSON on stdin, never shell code.
export function quantRequest(payload) {
  const root = resolveGulfchainRoot();
  if (!root) throw new Error('Gulfchain workspace could not be found.');
  const repo = path.join(root, 'multigate-backtest');
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(repo, '.venv/bin/python'), ['-B', '-m', 'src.quant_web'], {
      cwd: repo,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let output = '';
    let bytes = 0;
    let finished = false;
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(new Error('Quant took too long to respond. Refresh to recover any accepted request.'));
    }, 30_000);
    child.on('error', () => finish(new Error('Could not launch Quant. Check the multigate-backtest Python environment.')));
    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) {
        child.kill('SIGTERM');
        finish(new Error('Quant returned too much data. Start a new conversation.'));
      } else output += chunk.toString();
    });
    // Consume diagnostics without exposing process environment/tracebacks to the browser.
    child.stderr.resume();
    child.on('close', (code) => {
      if (code !== 0) return finish(new Error('The Quant connection stopped. Refresh and check its recorded status.'));
      try { finish(null, JSON.parse(output)); }
      catch { finish(new Error('Quant returned an unreadable response.')); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

import { spawn } from 'node:child_process';

/* The detached :8811 server gets reaped between tool invocations; every GPU
   tool guards itself — probe, spawn its own server if dark, wait for it. */
export async function ensureServer(root = '/Users/mohammedhossam/blackhole'){
  for(let i = 0; i < 3; i++){
    try {
      const r = await fetch('http://127.0.0.1:8811/index.html', { method: 'HEAD' });
      if(r.ok) return;
    } catch { /* dark — fall through and spawn */ }
    const child = spawn(process.execPath, ['tools/serve.mjs'], {
      cwd: root, detached: true, stdio: 'ignore'
    });
    child.unref();
    await new Promise(r => setTimeout(r, 1200));
  }
  throw new Error('server on :8811 unreachable after 3 spawn attempts');
}

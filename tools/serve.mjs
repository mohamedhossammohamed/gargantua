import { spawn } from 'node:child_process';
import http from 'node:http';

/* Detached server launcher: spawns python http.server in its own process
   group (detached + unref) so it outlives this invocation indefinitely. */
const child = spawn('python3',
  ['-m', 'http.server', '8811', '--bind', '127.0.0.1', '--directory', '/Users/mohammedhossam/blackhole'],
  { detached: true, stdio: 'ignore' });
child.unref();
console.log('server PID:', child.pid);

/* self-verify: give it a beat, then request the page */
await new Promise(r => setTimeout(r, 900));
http.get('http://127.0.0.1:8811/index.html', res => {
  let n = 0;
  const chunks = [];
  res.on('data', c => { if(n++ < 2) chunks.push(c); });
  res.on('end', () => {
    console.log('HTTP', res.statusCode, '| content-length:', res.headers['content-length']);
    console.log('first bytes:', Buffer.concat(chunks).subarray(0, 60).toString());
    console.log('URL -> http://localhost:8811');
  });
}).on('error', e => { console.error('VERIFY FAILED:', e.message); process.exit(1); });

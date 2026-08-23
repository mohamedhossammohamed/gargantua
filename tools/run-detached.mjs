import { spawn } from 'node:child_process';
import fs from 'node:fs';

/* Usage: node tools/run-detached.mjs <script-path> <log-path> [args...] */
const [, , script, log, ...args] = process.argv;
const fd = fs.openSync(log, 'w');
const child = spawn('node', [script, ...args],
  { cwd: '/Users/mohammedhossam/blackhole', detached: true, stdio: ['ignore', fd, fd] });
child.unref();
console.log('detached PID', child.pid, '->', log);

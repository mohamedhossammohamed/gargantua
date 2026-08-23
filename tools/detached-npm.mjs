import { spawn } from 'node:child_process';
import fs from 'node:fs';

/* Detached npm install: survives the sandbox's 120s execution cap.
   Usage: node tools/detached-npm.mjs <pkg...>  — polls until done. */
const pkgs = process.argv.slice(2);
const marker = '/tmp/gargantua-npm-done';
fs.rmSync(marker, { force: true });
const child = spawn('npm', ['install', '-D', ...pkgs, '--no-audit', '--no-fund'],
  { cwd: '/Users/mohammedhossam/blackhole', detached: true, stdio: 'ignore' });
child.unref();
console.log('npm PID:', child.pid);
for(let i = 0; i < 240; i++){                       /* up to 4 min */
  await new Promise(r => setTimeout(r, 1000));
  if(!fs.existsSync('/Users/mohammedhossam/blackhole/node_modules/' + pkgs[0].split('@')[0])){
    continue;
  }
  fs.writeFileSync(marker, 'done');
  console.log(pkgs[0], 'installed after', i + 1, 's');
  process.exit(0);
}
console.error('TIMEOUT waiting for install');
process.exit(1);

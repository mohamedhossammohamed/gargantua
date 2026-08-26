import { execSync } from 'node:child_process';
try {
  const out = execSync('git push origin main', {
    cwd: '/Users/mohammedhossam/blackhole', timeout: 480000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log('PUSH OK:', out.toString().trim().split('\n').pop());
} catch(e){
  console.log('PUSH FAIL:', String(e.stderr || e.message).slice(0, 300));
  process.exit(1);
}

import { execSync } from 'node:child_process';

/* Detached push — outlives the 120s shell cap on slow uplinks. */

const out = execSync('git push -u origin main 2>&1; echo EXIT:$?', {
  cwd: '/Users/mohammedhossam/blackhole',
  encoding: 'utf8', timeout: 540000,
});
console.log(out.slice(-600));

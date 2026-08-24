import fs from 'fs';
const J = '/Users/mohammedhossam/.claude/projects/-Users-mohammedhossam/de6ae506-a90e-4bea-95a6-6770df51c432/subagents/workflows/wf_b32ba151-f6f/journal.jsonl';
for(const line of fs.readFileSync(J,'utf8').split('\n')){
  if(!line.trim()) continue;
  let r; try{ r = JSON.parse(line); }catch{ continue; }
  if(r.type !== 'result') continue;
  const v = r.value;
  if(v && typeof v === 'object') continue;          // structured results already processed
  if(typeof v === 'string' && v.length > 200){      // unstructured finals from schema-failures
    console.log('=== ' + (r.label || r.agentLabel || '?') + ' ===');
    console.log(v.slice(0, 900).replace(/\n+/g, ' '));
    console.log();
  }
}

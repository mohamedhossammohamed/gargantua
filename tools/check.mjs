import fs from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
let failures = 0;
const fail = m => { console.error('FAIL:', m); failures++; };
const ok = m => console.log('ok:', m);

/* ---- 1. GLSL sources: structure + ESSL conformance ---- */
/* NOTE: shader strings carry NO #version line — three r185 injects its own
   (via glslVersion: GLSL3) ahead of its SHADER_TYPE/NAME defines, and a
   second #version would be illegal. The gate enforces that invariant. */
const shadersSrc = fs.readFileSync(root + 'src/shaders.js', 'utf8');
const shaders = [...shadersSrc.matchAll(/export const \w+ = `([\s\S]*?)`;$/gm)].map(m => m[1]);
if(shaders.length !== 8) fail(`expected 8 shaders, found ${shaders.length}`);
/* the shader regex survives a stray backtick (non-greedy match resumes at the
   real closer) but esbuild does not — count them: 8 literals x 2 */
if((shadersSrc.match(/`/g) || []).length !== 16) fail('stray backtick in shaders.js — a GLSL comment ate the template literal');
const declared = new Set();
if(/`#version/.test(shadersSrc)) fail('shader string embeds #version (three injects its own)');
for(const src of shaders){
  const tag = src.includes('uCamPos') ? 'scene'
            : src.includes('uB4')     ? 'composite'
            : src.includes('uDir')    ? 'blur'
            : src.includes('uKnee')   ? 'bright'
            : src.includes('wsum')    ? 'streak' : 'down';
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  let braces = 0, parens = 0;
  for(const ch of stripped){
    if(ch === '{') braces++;
    else if(ch === '}') braces--;
    else if(ch === '(') parens++;
    else if(ch === ')') parens--;
  }
  if(braces !== 0) fail(`${tag}: brace imbalance ${braces}`);
  if(parens !== 0) fail(`${tag}: paren imbalance ${parens}`);
  if(/\d[fF]\b/.test(stripped)) fail(`${tag}: float suffix present (ESSL forbids)`);
  if(/smoothstep\(\s*[\d.]+\s*,\s*[\d.]+/.test(stripped)){
    /* ascending-edge sanity only where both edges are literals */
    for(const m of stripped.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/g)){
      if(parseFloat(m[1]) >= parseFloat(m[2])) fail(`${tag}: smoothstep edge0>=edge1`);
    }
  }
  for(const m of stripped.matchAll(/uniform\s+(?:highp\s+)?(?:float|int|vec[234]|mat3|mat4|sampler2D)\s+(\w+)\s*;/g))
    declared.add(m[1]);
  ok(`${tag}: balanced, ESSL-clean`);
}

/* ---- 2. main.js: every uniform referenced must be declared ---- */
const main = fs.readFileSync(root + 'src/main.js', 'utf8');
try { new Function(main.replace(/^import[\s\S]*?from\s+'three';/m, '').replace(/^import[\s\S]*?from\s+'\.\/shaders\.js';/m, '')); ok('main.js parses'); }
catch(e){ fail('main.js syntax: ' + e.message); }
const refs = new Set();
for(const m of main.matchAll(/'(u[A-Z]\w*)'/g)) refs.add(m[1]);       /* quoted */
for(const m of main.matchAll(/\.(u[A-Z]\w*)[\s.={[]/g)) refs.add(m[1]); /* property access */
refs.delete('uB');   /* dynamic: 'uB'+i -> uB0..uB4 */
for(const name of refs){
  if(!declared.has(name)) fail(`main.js references "${name}" but no shader declares it`);
}
for(const dyn of ['uB0','uB1','uB2','uB3','uB4']){
  if(!declared.has(dyn)) fail(`dynamic sampler ${dyn} not declared`);
}
ok(`uniform contract: ${refs.size} referenced, ${declared.size} declared`);

/* ---- 2b. accessor contract: every uX.value written in main.js must exist
   as a key in some makeMaterial uniforms object ---- */
const declaredObjs = new Set();
for(const m of main.matchAll(/(u[A-Z]\w+)\s*:\s*\{\s*value/g)) declaredObjs.add(m[1]);
const writes = new Set();
for(const m of main.matchAll(/\bu\.(u[A-Z]\w+)\.value/g)) writes.add(m[1]);
for(const m of main.matchAll(/\bu[bc]\.(u[A-Z]\w+)\.value/g)) writes.add(m[1]);
for(const m of main.matchAll(/uc\['uB'\s*\+\s*i\]/g)){ /* dynamic ok */ }
for(const name of writes){
  if(!declaredObjs.has(name)) fail(`main.js writes "${name}.value" but no uniforms object declares it`);
}
ok(`accessor contract: ${writes.size} written, ${declaredObjs.size} declared-in-JS`);

/* ---- 3. built artifact ---- */
const distPath = root + 'dist/index.html';
if(!fs.existsSync(distPath)){ fail('dist/index.html missing'); }
else {
  const html = fs.readFileSync(distPath, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if(scripts.length !== 1) fail(`dist: expected 1 inline script, got ${scripts.length}`);
  if(/<script[^>]*src=/.test(html)) fail('dist contains external script reference');
  if(/(href|src)=["']https?:/.test(html)) fail('dist contains external resource link');
  try { new Function(scripts[0][1]); ok(`dist inline bundle parses (${(scripts[0][1].length/1024).toFixed(0)} KB)`); }
  catch(e){ fail('dist bundle syntax: ' + e.message); }
  if(!scripts[0][1].includes('WebGLRenderer')) fail('bundle lacks THREE.WebGLRenderer');
}
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

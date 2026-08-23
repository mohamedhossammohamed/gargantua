'use strict';
/* ============================================================
   GARGANTUA — real-time Schwarzschild ray tracer (Three.js harness)
   Pipeline: geodesic-march scene (HDR, internal-res) ->
   bright-pass -> 5-level blur pyramid -> anamorphic streak ->
   composite (CA, ACES, grade, vignette, grain).
   Rendering/resources: THREE. Physics & post: raw GLSL in shaders.js.
   ============================================================ */

import * as THREE from 'three';
import {
  VS, FS_SCENE, FS_BRIGHT, FS_DOWN, FS_BLUR, FS_STREAK, FS_COMPOSITE
} from './shaders.js';

const canvas = document.getElementById('view');
const veil = document.getElementById('veil');
const hudEl = document.getElementById('hud');
const introEl = document.getElementById('intro');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false
  });
} catch(err) { failBoot('WebGL2 unavailable', String(err.message || err)); throw err; }
if(!renderer.capabilities.isWebGL2) failBoot('WebGL2 unavailable', 'This scene requires WebGL2.');

function failBoot(headline, detail){
  veil.classList.add('fail');
  veil.querySelector('.msg-boot').style.display = 'none';
  veil.querySelector('.msg-fail .headline').textContent = headline;
  veil.querySelector('.msg-fail p').textContent = detail || '';
}

/* ---------- capability probing ---------- */
const gl = renderer.getContext();
const extCF  = gl.getExtension('EXT_color_buffer_float');
const extCFH = gl.getExtension('EXT_color_buffer_half_float');
let HDR_TYPE   = THREE.HalfFloatType;
let BLOOM_THRESHOLD = 1.0;
if(!extCF && !extCFH){
  HDR_TYPE = THREE.UnsignedByteType;      /* LDR fallback */
  BLOOM_THRESHOLD = 0.55;                 /* scene clamps at 1.0 — lower the knee */
}

/* ============================================================
   Pass infrastructure
   ============================================================ */
function makeMaterial(fs, uniforms){
  /* r185 prepends '#define SHADER_TYPE/NAME' even to raw materials, so the
     GLSL strings carry NO #version of their own — glslVersion makes three emit
     exactly one legal version line ahead of those defines */
  return new THREE.RawShaderMaterial({
    vertexShader: VS, fragmentShader: fs, glslVersion: THREE.GLSL3,
    uniforms, depthTest: false, depthWrite: false,
    blending: THREE.NoBlending
  });
}

const passScene = new THREE.Scene();
const passCam = new THREE.Camera();
const triGeo = new THREE.BufferGeometry();
triGeo.setAttribute('position', new THREE.BufferAttribute(
  new Float32Array([-1,-1,0,  3,-1,0,  -1,3,0]), 3));
const tri = new THREE.Mesh(triGeo, null);
tri.frustumCulled = false;
passScene.add(tri);

function drawPass(mat, target){
  tri.material = mat;
  renderer.setRenderTarget(target);
  renderer.render(passScene, passCam);
}

function makeTarget(w, h){
  return new THREE.WebGLRenderTarget(w, h, {
    type: HDR_TYPE, depthBuffer: false, stencilBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping
  });
}
function freeTarget(t){ if(t) t.dispose(); }

/* ---------- materials ---------- */
const mScene = makeMaterial(FS_SCENE, {
  uTime:{value:0}, uCamPos:{value:new THREE.Vector3()}, uBasis:{value:new THREE.Matrix3()},
  uTanF:{value:1}, uAspect:{value:1}, uSteps:{value:290}, uDtScale:{value:0.75},
  uLensing:{value:1}, uDoppler:{value:1}, uBeamExp:{value:3},
  uGain:{value:1.18}, uOpacity:{value:0.85},
  uFlow:{value:0.55}, uTwinkle:{value:0.6}, uTint:{value:new THREE.Vector3(1.06,0.97,0.88)},
});
const mBright = makeMaterial(FS_BRIGHT, {
  uSrc:{value:null}, uTexel:{value:new THREE.Vector2()},
  uThreshold:{value:BLOOM_THRESHOLD}, uKnee:{value:0.55},
});
const mDown = makeMaterial(FS_DOWN, { uSrc:{value:null}, uTexel:{value:new THREE.Vector2()} });
const mBlur = makeMaterial(FS_BLUR,  { uSrc:{value:null}, uTexel:{value:new THREE.Vector2()}, uDir:{value:new THREE.Vector2(1,0)} });
const mStreak = makeMaterial(FS_STREAK, { uSrc:{value:null}, uTexel:{value:new THREE.Vector2()} });
const mComp = makeMaterial(FS_COMPOSITE, {
  uScene:{value:null}, uB0:{value:null}, uB1:{value:null}, uB2:{value:null},
  uB3:{value:null}, uB4:{value:null}, uStreak:{value:null},
  uTime:{value:0}, uBloomStr:{value:0.95}, uStreakStr:{value:0.34},
  uExposure:{value:1.05}, uSaturation:{value:1.14}, uHasGlow:{value:1},
  uGrainAmt:{value:0.03}, uOutTexel:{value:new THREE.Vector2(1,1)},
});

/* ============================================================
   State
   ============================================================ */
const QUALITY = {
  low:    { steps: 500, dt: 1.30 },
  medium: { steps: 800, dt: 1.00 },
  high:   { steps: 1100, dt: 0.85 },
  ultra:  { steps: 1500, dt: 0.70 },
};
const QORDER = ['low','medium','high','ultra'];
/* discrete internal-resolution tiers — no arbitrary values, no realloc churn */
const TIERS = [0.5, 0.6, 0.7, 0.85, 1.0];
const PALETTES = {
  ember: { gain: 1.18, doppler: 1.00, sat: 1.14, tint: [1.06,0.97,0.88], bloomStr: 0.95, streakStr: 0.34 },
  film:  { gain: 0.96, doppler: 0.32, sat: 0.80, tint: [1.05,1.00,0.94], bloomStr: 1.10, streakStr: 0.22 },
};
const VIEWS = {
  orbit:    { el: 0.155, dist: 13.5 },
  graze:    { el: 0.030, dist: 10.5 },
  overhead: { el: 0.95,  dist: 17.0 },
};

const state = {
  quality: 'auto',
  qKey: 'medium',
  resScale: 1.0,
  tierIdx: TIERS.length-1,
  paused: false,
  lensing: true,
  doppler: true,
  bloom: true,
  palette: 'ember',
  scienceMode: false,
  hudHidden: false,
};

const cam = {
  az: 0.6, el: 0.55, dist: 26.0,           /* intro start */
  tAz: 0.6, tEl: VIEWS.orbit.el, tDist: VIEWS.orbit.dist,
  autoBlend: 1.0, idleTimer: 0,
};
const camera = new THREE.PerspectiveCamera(63, 1, 0.1, 200);

const palCur = Object.assign({}, PALETTES.ember, { tint: PALETTES.ember.tint.slice() });
const palTgt = { gain: 0, doppler: 0, sat: 0, tint: [0,0,0], bloomStr: 0, streakStr: 0 };

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
if(reducedMotion){
  cam.autoBlend = 0.0;
  state.quality = 'medium';
  state.qKey = 'medium';
  cam.dist = VIEWS.orbit.dist;
}

/* intro choreography */
let introT = 0;
const INTRO_LEN = 9.0;
if(reducedMotion) introT = INTRO_LEN;

/* ---------- sizing / render targets ---------- */
const bufSize = new THREE.Vector2();
let rtScene = null, rtBright = null, rtStreak = null;
let pyramid = [];   /* {a,b} per level */

function buildAll(iw, ih){
  rtScene  = makeTarget(iw, ih);
  rtBright = makeTarget(iw>>1, ih>>1);
  rtStreak = makeTarget(iw>>1, ih>>1);
  pyramid = [];
  let lw = rtBright.width, lh = rtBright.height;
  for(let i=0;i<5;i++){
    lw = Math.max(4, lw>>1); lh = Math.max(4, lh>>1);
    pyramid.push({ a: makeTarget(lw,lh), b: makeTarget(lw,lh) });
  }
}
let bootFailed = false;
function allocTargets(force){
  const iw = Math.max(8, Math.floor(bufSize.x*state.resScale));
  const ih = Math.max(8, Math.floor(bufSize.y*state.resScale));
  if(!force && rtScene && rtScene.width === iw && rtScene.height === ih) return;
  freeAll();
  try {
    buildAll(iw, ih);
  } catch(err) {
    /* graceful degradation: retry once in LDR before surfacing failure.
       (Real VRAM exhaustion usually surfaces as context loss instead — the
       reload handler covers that.) */
    freeAll();
    if(HDR_TYPE !== THREE.UnsignedByteType){
      console.warn('Gargantua: HDR targets unavailable, falling back to LDR —', err.message);
      HDR_TYPE = THREE.UnsignedByteType; BLOOM_THRESHOLD = 0.55;
      mBright.uniforms.uThreshold.value = BLOOM_THRESHOLD;
      try { buildAll(iw, ih); return; } catch(_){ /* surface below */ }
    }
    bootFailed = true;                     /* stop the rAF exception loop */
    console.error('Gargantua:', err.message || err);
    failBoot('GPU memory allocation failed',
      'The renderer could not allocate frame buffers at this resolution. Try a smaller window or a device with more GPU memory.');
  }
}
function freeAll(){
  freeTarget(rtScene); freeTarget(rtBright); freeTarget(rtStreak);
  for(const lvl of pyramid){ freeTarget(lvl.a); freeTarget(lvl.b); }
}
function syncCanvasSize(){
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, DPR_CAP));
  renderer.setSize(canvas.clientWidth || 2, canvas.clientHeight || 2, false);
  renderer.getDrawingBufferSize(bufSize);
  camera.aspect = bufSize.x/Math.max(1, bufSize.y);
  camera.updateProjectionMatrix();
}
/* size changes are debounced: window-drag and iOS chrome collapse would
   otherwise trigger a full target realloc per changed-size frame */
let rsTimer = null;
let lastClientW = 0, lastClientH = 0;   /* setSize resets the bitmap even when
  dimensions are unchanged — only call it on real CSS-size changes */
function queueResize(){
  if(rsTimer !== null) return;
  rsTimer = setTimeout(() => {
    rsTimer = null;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const bx = bufSize.x, by = bufSize.y;
    if(cw !== lastClientW || ch !== lastClientH){
      syncCanvasSize();
      lastClientW = cw; lastClientH = ch;
    }
    if(bufSize.x !== bx || bufSize.y !== by) allocTargets(false);
  }, 180);
}
new ResizeObserver(queueResize).observe(canvas);

const DPR_CAP = 1.75;

/* DPR changes with unchanged CSS size (display moves, OS scaling) never fire
   ResizeObserver — re-arm a resolution query after every actual change */
function watchDPR(){
  const dpr = Math.min(devicePixelRatio || 1, DPR_CAP);
  const mq = matchMedia(`(resolution: ${dpr}dppx)`);
  mq.addEventListener('change', () => {
    syncCanvasSize();
    lastClientW = canvas.clientWidth; lastClientH = canvas.clientHeight;
    allocTargets(false);
    watchDPR();
  }, { once: true });
}
watchDPR();

/* kiosk mode (?kiosk=1): ambient displays outrun float32 noise precision
   after ~4h — reload on schedule instead of degrading */
const kioskHrs = parseFloat(new URLSearchParams(location.search).get('kiosk') || '0');
if(kioskHrs > 0) setTimeout(() => location.reload(), kioskHrs*3600e3);
const URL_NOGRAIN = new URLSearchParams(location.search).has('nograin');   /* metrology flag */

/* ============================================================
   Input
   ============================================================ */
const pointers = new Map();
let pinchDist = 0;
function wake(){ cam.idleTimer = 0; }
function markInteracted(){ if(introT < INTRO_LEN){ introT = INTRO_LEN; finishIntro(); } }
function clamp(x, a, b){ return Math.min(b, Math.max(a, x)); }

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if(pointers.size === 2){
    const p = [...pointers.values()];
    pinchDist = Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y);
  }
  canvas.classList.add('dragging');
  wake(); markInteracted();
});
canvas.addEventListener('pointermove', e => {
  if(!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const dx = e.clientX-prev.x, dy = e.clientY-prev.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if(pointers.size === 1){
    cam.tAz -= dx*0.0042;
    cam.tEl = clamp(cam.tEl + dy*0.0032, -1.35, 1.35);
    wake();
  } else if(pointers.size === 2){
    const p = [...pointers.values()];
    const d = Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y);
    if(pinchDist > 0 && d > 0.5) cam.tDist = clamp(cam.tDist*(pinchDist/d), 7.5, 30.0);
    pinchDist = d;
    wake();
  }
});
function releasePointer(e){
  pointers.delete(e.pointerId);
  if(pointers.size === 0) canvas.classList.remove('dragging');
}
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  cam.tDist = clamp(cam.tDist*Math.exp(e.deltaY*0.0011), 7.5, 30.0);
  wake(); markInteracted();
}, { passive: false });

/* ---------- controls wiring ---------- */
function setGroup(selector, attr, val){
  document.querySelectorAll(selector).forEach(b => {
    const on = b.dataset[attr] === val;
    b.classList.toggle('on', on);
    if(attr === 'pal' || attr === 'view' || attr === 'q') b.setAttribute('aria-pressed', on);
  });
}
document.querySelectorAll('.chip.view').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
document.querySelectorAll('.chip.qual').forEach(b => b.addEventListener('click', () => setQuality(b.dataset.q)));
document.querySelectorAll('.chip.pal').forEach(b => b.addEventListener('click', () => setPalette(b.dataset.pal)));
document.querySelectorAll('.chip.tog').forEach(b => b.addEventListener('click', () => {
  const id = b.id;
  if(id === 'btnLens') setLensing(!state.lensing);
  if(id === 'btnDopp') setDoppler(!state.doppler);
  if(id === 'btnBloom') setBloom(!state.bloom);
}));
document.getElementById('btnPause').addEventListener('click', togglePause);
document.getElementById('btnHelp').addEventListener('click', toggleHelp);

function setView(v){
  cam.tEl = VIEWS[v].el; cam.tDist = VIEWS[v].dist;
  setGroup('.chip.view', 'view', v);
  wake();
}
function setQuality(q){
  if(state.quality === q) return;
  state.quality = q;
  /* auto seeds conservatively; the controller climbs when headroom allows */
  state.qKey = q === 'auto' ? 'medium' : q;
  state.tierIdx = TIERS.length-1;
  state.resScale = TIERS[state.tierIdx];
  setGroup('.chip.qual', 'q', q);
  allocTargets(false);
}
function cycleQuality(){
  const CYCLE = ['auto', ...QORDER];
  const next = CYCLE[(CYCLE.indexOf(state.quality)+1)%CYCLE.length];
  setQuality(next);
}
function setPalette(p){
  state.palette = p;
  const t = PALETTES[p];
  palTgt.gain = t.gain; palTgt.doppler = t.doppler; palTgt.sat = t.sat;
  palTgt.bloomStr = t.bloomStr; palTgt.streakStr = t.streakStr;
  for(let i=0;i<3;i++) palTgt.tint[i] = t.tint[i];
  document.getElementById('tPreset').textContent = p.toUpperCase();
  setGroup('.chip.pal', 'pal', p);
}
function setLensing(v){ state.lensing = v; const b=document.getElementById('btnLens'); b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v)); }
function setDoppler(v){ state.doppler = v; const b=document.getElementById('btnDopp'); b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v)); }
function setBloom(v){ state.bloom = v; const b=document.getElementById('btnBloom'); b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v)); }
function togglePause(){
  state.paused = !state.paused;
  document.getElementById('btnPause').textContent = state.paused ? 'Resume' : 'Pause';
}
function setHelpOpen(open){
  document.getElementById('helpcard').classList.toggle('open', open);
  document.getElementById('btnHelp').setAttribute('aria-expanded', String(open));
}
function toggleHelp(){
  const c = document.getElementById('helpcard');
  setHelpOpen(!c.classList.contains('open'));
}
function toggleHud(){
  state.hudHidden = !state.hudHidden;
  hudEl.classList.toggle('hidden', state.hudHidden);
  /* intro dismissal is one-way: it must never resurrect after finishing */
  if(state.hudHidden) introEl.classList.add('gone');
}

addEventListener('keydown', e => {
  if(e.repeat) return;
  /* a focused chip keeps native Space/Enter activation */
  if((e.key === ' ' || e.key === 'Enter') && e.target instanceof HTMLButtonElement) return;
  switch(e.key){
    case ' ': e.preventDefault(); togglePause(); break;
    case '1': setView('orbit'); markInteracted(); break;
    case '2': setView('graze'); markInteracted(); break;
    case '3': setView('overhead'); markInteracted(); break;
    case 'l': case 'L': setLensing(!state.lensing); break;
    case 'd': case 'D': setDoppler(!state.doppler); break;
    case 'b': case 'B': setBloom(!state.bloom); break;
    case 'p': case 'P': setPalette(state.palette === 'ember' ? 'film' : 'ember'); break;
    case 'q': case 'Q': cycleQuality(); break;
    case 'h': case 'H': toggleHud(); break;
    case '?': toggleHelp(); break;
    case 'Escape': setHelpOpen(false); break;
  }
});

/* double-click cinema mode is mouse-only: touch has no H key to come back */
if(!matchMedia('(pointer: coarse)').matches){
  canvas.addEventListener('dblclick', toggleHud);
}

/* context loss — announce, then re-init cleanly via reload on restore */
renderer.domElement.addEventListener('webglcontextlost', () => {
  veil.classList.remove('off');
  veil.querySelector('.msg-boot').innerHTML = '<span class="label" style="color:var(--danger)">GPU context lost &mdash; recovering&hellip;</span>';
});
renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());

/* ---------- intro helpers ---------- */
function finishIntro(){ introEl.classList.add('gone'); }
setTimeout(finishIntro, (INTRO_LEN+1.6)*1000);

/* ============================================================
   Frame loop
   ============================================================ */
let prevTs = performance.now();
let simTime = 0;
let emaMs = 16, frameCount = 0, adaptClock = 0;
let winMin = Infinity;          /* best frame time this evaluation window */
let minMs = Infinity;           /* rolling achievable frame time (vsync-aware) */
let adaptDir = 0, adaptStreak = 0;
let fpsFrames = 0, fpsClock = 0;
const tFps = document.getElementById('tFps');
const tRes = document.getElementById('tRes');
const tSteps = document.getElementById('tSteps');

function easeInOutQuint(x){ return x < 0.5 ? 16*x*x*x*x*x : 1-Math.pow(-2*x+2,5)/2; }

function updateCamera(dt){
  /* idle -> resume auto orbit */
  cam.idleTimer += dt;
  const wantAuto = reducedMotion ? 0 : 1;
  const goal = (!state.paused && cam.idleTimer > 6) ? wantAuto : 0;
  cam.autoBlend += (goal-cam.autoBlend)*(1-Math.exp(-dt*1.4));

  if(cam.autoBlend > 0.001 && !state.paused) cam.tAz += 0.052*dt*cam.autoBlend;

  /* intro dolly */
  let dist = cam.tDist, el = cam.tEl;
  if(introT < INTRO_LEN){
    introT += dt;
    const k = easeInOutQuint(clamp(introT/INTRO_LEN, 0, 1));
    dist = 26.0+(cam.tDist-26.0)*k;
    el = 0.55+(cam.tEl-0.55)*k;
  }

  const lam = 1-Math.exp(-dt*6.5);
  cam.az += (cam.tAz-cam.az)*lam;
  cam.el += (el-cam.el)*lam;
  cam.dist += (dist-cam.dist)*lam;

  /* gentle breathing + vertical bob while auto-orbiting */
  const breathe = 1.0+(reducedMotion ? 0 : 0.045*Math.sin(simTime*0.043));
  const bob = 0.028*Math.sin(simTime*0.11)*cam.autoBlend*(state.paused ? 0 : 1);
  const elR = clamp(cam.el+bob, -1.35, 1.35);
  const ce = Math.cos(elR), se = Math.sin(elR);
  const d = cam.dist*breathe;
  camera.position.set(d*ce*Math.sin(cam.az), d*se, d*ce*Math.cos(cam.az));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
}

const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(),
      _upv = new THREE.Vector3(), _worldUp = new THREE.Vector3(0,1,0);

function updateSceneUniforms(){
  const q = QUALITY[state.qKey];
  const u = mScene.uniforms;
  u.uTime.value = simTime;
  u.uCamPos.value.copy(camera.position);
  window.__gargantua = { camDist: Math.hypot(camera.position.x, camera.position.y, camera.position.z),
                         steps: q.steps, tier: state.qKey };
  /* basis columns: right, up, forward */
  camera.getWorldDirection(_fwd);
  _right.crossVectors(_fwd, _worldUp).normalize();
  _upv.crossVectors(_right, _fwd);
  u.uBasis.value.set(
    _right.x, _upv.x, _fwd.x,
    _right.y, _upv.y, _fwd.y,
    _right.z, _upv.z, _fwd.z
  );
  u.uTanF.value = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  u.uAspect.value = camera.aspect;
  u.uSteps.value = q.steps;
  u.uDtScale.value = q.dt;
  u.uLensing.value = state.lensing ? 1 : 0;
  u.uDoppler.value = state.doppler ? palCur.doppler : 0;
  u.uBeamExp.value = state.scienceMode ? 4 : 3;
  u.uGain.value = palCur.gain;
  u.uOpacity.value = 0.85;
  u.uFlow.value = 0.55;
  u.uTwinkle.value = reducedMotion ? 0.15 : 0.6;
  u.uTint.value.set(palCur.tint[0], palCur.tint[1], palCur.tint[2]);
}

function tweenPalette(dt){
  const k = 1-Math.exp(-dt*2.4);
  palCur.gain += (palTgt.gain-palCur.gain)*k;
  palCur.doppler += (palTgt.doppler-palCur.doppler)*k;
  palCur.sat += (palTgt.sat-palCur.sat)*k;
  palCur.bloomStr += (palTgt.bloomStr-palCur.bloomStr)*k;
  palCur.streakStr += (palTgt.streakStr-palCur.streakStr)*k;
  for(let i=0;i<3;i++) palCur.tint[i] += (palTgt.tint[i]-palCur.tint[i])*k;
}

function render(now){
  if(bootFailed) return;                 /* terminal failure: stop scheduling */
  requestAnimationFrame(render);
  let dt = (now-prevTs)/1000;
  prevTs = now;
  if(dt > 0.05) dt = 0.05;
  if(!(dt > 0)) return;

  if(!state.paused) simTime += dt;
  queueResize();

  updateCamera(dt);
  tweenPalette(dt);
  updateSceneUniforms();

  /* --- scene pass --- */
  drawPass(mScene, rtScene);

  if(state.bloom){
    /* bright pass at half internal res */
    const ub = mBright.uniforms;
    ub.uSrc.value = rtScene.texture;
    ub.uTexel.value.set(1/rtScene.width, 1/rtScene.height);
    drawPass(mBright, rtBright);

    /* downsample pyramid */
    let src = rtBright;
    for(const lvl of pyramid){
      mDown.uniforms.uSrc.value = src.texture;
      mDown.uniforms.uTexel.value.set(1/src.width, 1/src.height);
      drawPass(mDown, lvl.a);
      src = lvl.a;
    }
    /* separable blur each level */
    for(const lvl of pyramid){
      mBlur.uniforms.uSrc.value = lvl.a.texture;
      mBlur.uniforms.uTexel.value.set(1/lvl.a.width, 1/lvl.a.height);
      mBlur.uniforms.uDir.value.set(1, 0);
      drawPass(mBlur, lvl.b);
      mBlur.uniforms.uSrc.value = lvl.b.texture;
      mBlur.uniforms.uTexel.value.set(1/lvl.b.width, 1/lvl.b.height);
      mBlur.uniforms.uDir.value.set(0, 1);
      drawPass(mBlur, lvl.a);
    }
    /* anamorphic streak from first level */
    mStreak.uniforms.uSrc.value = pyramid[0].a.texture;
    mStreak.uniforms.uTexel.value.set(1/pyramid[0].a.width, 1/pyramid[0].a.height);
    drawPass(mStreak, rtStreak);
  }

  /* --- composite --- */
  const uc = mComp.uniforms;
  uc.uScene.value = rtScene.texture;
  for(let i=0;i<5;i++) uc['uB'+i].value = state.bloom ? pyramid[i].a.texture : rtScene.texture;
  uc.uStreak.value = state.bloom ? rtStreak.texture : rtScene.texture;
  uc.uTime.value = simTime;
  uc.uBloomStr.value = palCur.bloomStr;
  uc.uStreakStr.value = palCur.streakStr;
  uc.uExposure.value = 1.05;
  uc.uSaturation.value = palCur.sat;
  uc.uHasGlow.value = state.bloom ? 1 : 0;
  uc.uGrainAmt.value = (URL_NOGRAIN || reducedMotion) ? 0.0 : 0.030;
  uc.uOutTexel.value.copy(bufSize);
  drawPass(mComp, null);

  /* --- telemetry + adaptive resolution --- */
  const ms = dt*1000;
  if(frameCount > 20) emaMs += (ms-emaMs)*0.08;
  winMin = Math.min(winMin, ms);
  frameCount++;

  fpsFrames++; fpsClock += dt;
  if(fpsClock >= 0.5){
    tFps.textContent = Math.round(fpsFrames/fpsClock)+' fps';
    fpsFrames = 0; fpsClock = 0;
    tRes.textContent = Math.round(state.resScale*100)+'%';
    tSteps.textContent = QUALITY[state.qKey].steps+' steps';
  }
  if(state.quality === 'auto'){
    adaptClock += dt;
    if(adaptClock >= 0.8 && frameCount > 40){
      adaptClock = 0;
      /* vsync pins frame time at the refresh interval regardless of load,
         so thresholds derive from the observed best, not absolute constants */
      minMs = Math.min(minMs*1.005, winMin);   /* gentle relax keeps recovery possible */
      if(!(minMs > 0)) minMs = winMin;
      winMin = Infinity;
      const slow = emaMs > Math.max(23, minMs*1.55);
      const fast = emaMs <= minMs*1.20+0.4;
      const dir = slow ? -1 : (fast ? 1 : 0);
      adaptStreak = (dir !== 0 && dir === adaptDir) ? adaptStreak+1 : 1;
      adaptDir = dir;
      if(adaptStreak >= 2){
        adaptStreak = 1;
        const qi = QORDER.indexOf(state.qKey);
        let dirty = false;
        if(dir < 0){
          if(state.tierIdx > 0){ state.tierIdx--; dirty = true; }
          else if(qi > 0){                     /* resolution floor reached: shed steps */
            state.qKey = QORDER[qi-1];
            state.tierIdx = TIERS.length-2;
            dirty = true;
          }
        } else if(dir > 0){
          if(state.tierIdx < TIERS.length-1){ state.tierIdx++; dirty = true; }
          else if(qi >= 0 && qi < QORDER.indexOf('high')){   /* auto caps at high */
            state.qKey = QORDER[qi+1];
            dirty = true;
          }
        }
        if(dirty){
          state.resScale = TIERS[state.tierIdx];
          allocTargets(false);
        }
      }
    }
  }
}

/* ============================================================
   Boot
   ============================================================ */
setPalette('ember');
setGroup('.chip.qual', 'q', state.quality);
syncCanvasSize();
allocTargets(true);
veil.classList.add('off');
requestAnimationFrame(render);

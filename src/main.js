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
  VS, FS_SCENE, FS_BLEND, FS_BRIGHT, FS_DOWN, FS_BLUR, FS_STREAK, FS_COMPOSITE
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
/* event stream locus: polar density texture rasterized CPU-side each frame
   (phi x log r), sampled by the shader at disk-plane crossings */
const streamTex = new THREE.DataTexture(
  new Float32Array(STREAM_TEX_W*STREAM_TEX_H*4), STREAM_TEX_W, STREAM_TEX_H,
  THREE.RGBAFormat, THREE.FloatType);
streamTex.minFilter = THREE.LinearFilter;
streamTex.magFilter = THREE.LinearFilter;
streamTex.needsUpdate = true;

const mScene = makeMaterial(FS_SCENE, {
  uTime:{value:0}, uCamPos:{value:new THREE.Vector3()}, uBasis:{value:new THREE.Matrix3()},
  uTanF:{value:1}, uAspect:{value:1}, uSteps:{value:800}, uDtScale:{value:1.0},
  uLensing:{value:1}, uDoppler:{value:1}, uBeamExp:{value:3},
  uScience:{value:0}, uDiskIn:{value:2.6}, uTNorm:{value:0.354},
  uGain:{value:1.18}, uOpacity:{value:0.85},
  uFlow:{value:0.70711}, uTwinkle:{value:0.6}, uTint:{value:new THREE.Vector3(1.06,0.97,0.88)},  /* exact Omega_K = sqrt(M/r^3), M=1/2 */
  uJitter:{value:new THREE.Vector2(0,0)},
  uStars:{value:1},
  uStream:{value:streamTex},
  uStreamOn:{value:0},
  uJets:{value:0},
  uBinOn:{value:0},
  uBinP:{value:new THREE.Vector4()},
  uBinR:{value:new THREE.Vector4()},
});
const mBlend = makeMaterial(FS_BLEND, {
  uCur:{value:null}, uPrev:{value:null}, uMix:{value:1.0},
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
  uGrainAmt:{value:0.03}, uPinch:{value:0.045}, uOutTexel:{value:new THREE.Vector2(1,1)},
});

/* ============================================================
   State
   ============================================================ */
const QUALITY = {
  low:    { steps: 500, dt: 1.00 },   /* dt 1.30 quantized the lensed sky into
    visible dark rings on low-orbit shots (round-4); LOW stays cheapest on
    step count alone */
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
/* H3 — physical mass presets. rs = 2.953 km x (M/Msun);
   T_max = 6.3e7 K x (10 Msun / M)^{1/4} at Eddington-ish accretion */
const MASSES = [
  { label: 'STELLAR 10 M',  msun: 10 },
  { label: 'SGR A* 4.3e6',  msun: 4.3e6 },
  { label: 'GARGANTUA 1e8', msun: 1e8 },
];
const RS_KM_PER_MSUN = 2.953;
const AU_KM = 1.496e8;
function massPhysics(msun){
  const rsKm = RS_KM_PER_MSUN*msun;
  /* T_max = 0.4879 * [3 G M Mdot / (8 pi sigma r_in^3)]^{1/4}, Mdot = L_Edd/(eta c^2),
     eta = 1-sqrt(8/9) (Schwarzschild), r_in = 6GM/c^2  ->  8.6e6 K at 10 Msun.
     (Round-2 audit: the earlier 6.3e7 constant was ~7x super-Eddington.) */
  return { rsKm, tMaxK: 8.6e6*Math.pow(10/msun, 0.25) };
}

/* ============================================================
   EVENTS (round-20): triggerable physics, rendered through the
   same Schwarzschild tracer. Design + approximations:
   research/events.md. All particle dynamics are TIMELIKE
   geodesics integrated RK4 in the timelike Binet form
       u'' = M/L^2 + 3Mu^2 - u
   (perihelion precession is therefore exact, not faked).
   ============================================================ */
const GEO_M = 0.5;                       /* geometric M in rs=1 units */
const STREAM_TEX_W = 512, STREAM_TEX_H = 64;
const STREAM_RMIN = 1.15, STREAM_RMAX = 40;
let plotStream = null;                                     /* set per-frame by tickTDE */

const events = {
  tde: { on: false, t: 0, star: null, debris: [], spawnedMassIdx: -1 },
  infall: { on: false, particles: [] },
  binary: { on: false, t: 0, a: 0, merged: false },
};

/* timelike Binet acceleration: u'' = M/L^2 + 3Mu^2 - u */
function timelikeAccel(u, L){
  return GEO_M/(L*L) + 3*GEO_M*u*u*u - u;
}
function timelikeStep(p, dt){
  /* p = {u, phi, w, L}; RK4 on (u,w), phi advances dt */
  const a1 = timelikeAccel(p.u, p.L);
  const u2 = p.u + 0.5*dt*p.w,           w2 = p.w + 0.5*dt*a1;
  const a2 = timelikeAccel(u2, p.L);
  const u3 = p.u + 0.5*dt*w2,            w3 = p.w + 0.5*dt*a2;
  const a3 = timelikeAccel(u3, p.L);
  const u4 = p.u + dt*w3,                w4 = p.w + dt*a3;
  const a4 = timelikeAccel(u4, p.L);
  return {
    u:   p.u + (dt/6)*(p.w + 2*w2 + 2*w3 + w4),
    w:   p.w + (dt/6)*(a1 + 2*a2 + 2*a3 + a4),
    phi: p.phi + dt,
    L:   p.L,
  };
}

/* spawn a TDE: Sgr A*-mass hole (auto-switched), sun-like star on a
   near-parabolic orbit with periapsis 0.75*r_t — a penetrating encounter.
   r_t = R*(M/M*)^(1/3) ~ 8.9 rs for (4.3e6, 1 Msun): disruption INSIDE the
   frame, just outside the ISCO. */
function spawnTDE(){
  setMassIdx(1);                                          /* SGR A* 4.3e6 */
  const ev = events.tde;
  ev.on = true; ev.t = 0; ev.debris = [];
  /* near-parabolic: E = 0.98 (slightly bound — debris returns over time);
     periapsis target rp = 6.7 rs. Newton-solve L from the periapsis condition
     w(rp)=0: E^2 = (1-2M/rp)(1 + L^2/rp^2) */
  const E = 0.98, rp = 6.7;
  const L = Math.sqrt(rp*rp*((E*E)/(1 - 2*GEO_M/rp) - 1));
  /* start the star far out on the inbound leg */
  ev.star = { u: 1/38, phi: -2.6, w: Math.sqrt(Math.max(
      (E*E - (1 - 2*GEO_M*38)*(1 + L*L/1444))/ (L*L), 1e-8)), L, E };
  /* debris constants (Stone et al.): dE = M-star over R-star;
     time-compressed x20 for visibility (documented: return-time
     distribution compressed) */
  ev.dE = (GEO_M/4.3e6) / 0.0548 * 20;                    /* M*_geo over R*_geo, x20 */
  ev.rT = 0.0548*Math.cbrt(4.3e6);                        /* ~8.9 rs */
  ev.disrupted = false;
  cam.tDist = 26;                                         /* frame the show */
}

function tickTDE(dt){
  const ev = events.tde;
  if(!ev.on) return;
  ev.t += dt;
  const step = Math.min(dt, 0.05)*1.0;
  /* star: integrate + disrupt at r_t */
  if(!ev.disrupted){
    ev.star = timelikeStep(ev.star, step*2.0);
    const rStar = 1/ev.star.u;
    if(rStar < ev.rT){
      ev.disrupted = true;
      /* debris: energy spread around the star's E, L spread keeps the stream
         coherent; half bound / half unbound by dE sign */
      for(let i = 0; i < 600; i++){
        const f = i/600 - 0.5;                            /* [-0.5, 0.5] */
        const Ei = ev.star.E + f*2*ev.dE;
        /* L spread: small, keeps the stream ribbon-like */
        const Li = ev.star.L*(1 + f*0.06);
        /* seed debris at the disruption point, spread along the tangent */
        ev.debris.push({ u: ev.star.u, phi: ev.star.phi + f*0.35,
          w: ev.star.w + f*ev.dE*40, L: Li, E: Ei, temp: 0.4 + Math.abs(f)*1.2 });
      }
    }
  } else {
    /* debris: integrate, kill inside horizon / far escape */
    for(const p of ev.debris){
      if(p.dead) continue;
      const np = timelikeStep(p, step*2.0);
      p.u = np.u; p.w = np.w; p.phi = np.phi;
      const r = 1/p.u;
      if(r < 1.05 || r > STREAM_RMAX*1.3) p.dead = true;
      /* compression heating proxy: temperature rises near periapsis */
      p.temp = Math.min(2.0, p.temp + step*Math.abs(p.w)*0.02);
    }
  }
  /* rasterize the locus into the polar density texture */
  const data = streamTex.image.data;
  data.fill(0);
  plotStream = (r, phi, dens, temp) => {
    if(r < STREAM_RMIN || r > STREAM_RMAX) return;
    const x = Math.floor(((phi % (2*Math.PI) + 2*Math.PI) % (2*Math.PI))/(2*Math.PI)*STREAM_TEX_W) % STREAM_TEX_W;
    const y = Math.floor(Math.log(r/STREAM_RMIN)/Math.log(STREAM_RMAX/STREAM_RMIN)*(STREAM_TEX_H-1));
    const o = (y*STREAM_TEX_W + x)*4;
    data[o]   = Math.min(1, data[o]   + dens);
    data[o+1] = Math.min(1, data[o+1] + temp*dens);
    data[o+3] = 255;
  };
  if(!ev.disrupted){
    const rS = 1/ev.star.u;
    for(let k = -2; k <= 2; k++) plotStream(rS + k*0.02, ev.star.phi, 1.0, 0.35);  /* the star: bright spot */
  } else {
    for(const p of ev.debris){
      if(p.dead) continue;
      plotStream(1/p.u, p.phi, 0.5, p.temp);
    }
  }
  tickInfallRaster();
  streamTex.needsUpdate = true;
}

/* E2: gas infall — particles launched at r~20rs with sub-circular L; each
   loses angular momentum parametrically (dL/dt = -k*L, a viscosity proxy —
   NOT MHD, documented); otherwise exact timelike geodesics. */
const infall = { on: false, particles: [] };
function spawnInfall(){
  infall.on = true;
  if(infall.particles.length) return;
  for(let i = 0; i < 400; i++){
    const r = 16 + Math.random()*10, phi = Math.random()*2*Math.PI;
    const Lc = Math.sqrt(GEO_M*r*r/(r - 3*GEO_M));         /* circular-orbit L */
    const L = Lc*(0.80 + 0.15*Math.random());
    const E = Math.sqrt((1 - 2*GEO_M/r)*(1 + L*L/(r*r)));
    infall.particles.push({ u: 1/r, phi, w: 0, L, E, temp: 0.6 + Math.random()*0.8, dead: false });
  }
}
function tickInfall(dt){
  if(!infall.on) return;
  const step = Math.min(dt, 0.05)*2.0;
  for(const p of infall.particles){
    if(p.dead) continue;
    p.L *= (1 - 0.015*step);                               /* viscosity proxy */
    const np = timelikeStep(p, step);
    p.u = np.u; p.w = np.w; p.phi = np.phi;
    const r = 1/p.u;
    if(r < 1.05 || r > STREAM_RMAX*1.5) p.dead = true;
  }
}
function tickInfallRaster(){
  if(!infall.on) return;
  for(const p of infall.particles){
    if(p.dead) continue;
    plotStream(1/p.u, p.phi, 0.45, p.temp);
  }
}

/* E3: relativistic jets — bipolar collimated outflows along +/-y (the disk
   normal). Kinematics parametric (cone + bulk beta); the BEAMING is exact SR:
   delta = 1/[Gamma(1 - beta*cos)], I = delta^3 I' per-frequency. Blandford-
   Znajek launching is NOT modeled (our tracer is a=0) — documented. */
const jets = { on: false };
function spawnJets(){ jets.on = !jets.on; }

/* E4: binary black hole merger — Peters (1964) inspiral, circular:
   da/dt = -(64/5) m1 m2 (m1+m2) / a^3 (geometric units). Bodies render as
   occluding horizon silhouettes (two-center lensing approximated —
   documented). Merger: M_f = (m1+m2)(1-0.05), the NR equal-mass efficiency. */
const binary = { on: false, t: 0, a: 0, phase: 0, merged: false,
  m1: 0.35, m2: 0.25, x1: 0, z1: 0, x2: 0, z2: 0 };
const GW_COMPRESS = 500;   /* Peters decay time-compressed x500: at true rates
   the merger takes ~hours of wall time — invisible. The COMPRESSED evolution
   still follows the exact a^4 law (documented visualization compression). */
function spawnBinary(){
  binary.on = true; binary.t = 0; binary.merged = false;
  binary.a = 18; binary.phase = 0;
}
function tickBinary(dt){
  if(!binary.on || binary.merged) return;
  const mt = binary.m1 + binary.m2;
  /* Peters: da/dt = -(64/5) m1 m2 mt / a^3 — semi-implicit to stay stable
     as the decay accelerates */
  binary.a += (-64/5*binary.m1*binary.m2*mt*GW_COMPRESS/(binary.a**3))*dt;
  binary.phase += Math.sqrt(mt/(binary.a**3))*dt;
  const f1 = binary.m2/mt, f2 = binary.m1/mt;
  binary.x1 =  binary.a*f1*Math.cos(binary.phase);
  binary.z1 =  binary.a*f1*Math.sin(binary.phase);
  binary.x2 = -binary.a*f2*Math.cos(binary.phase);
  binary.z2 = -binary.a*f2*Math.sin(binary.phase);
  if(binary.a < 5*mt){
    binary.merged = true;
    binary.Mf = mt*0.95;                                   /* NR equal-mass efficiency */
    binary.x1 = binary.z1 = binary.x2 = binary.z2 = 0;
    binary.rOcc = 2*binary.Mf;                             /* final horizon */
  }
  binary.rOcc = binary.merged ? 2*binary.Mf : 0;
  binary.r1 = 2*binary.m1; binary.r2 = 2*binary.m2;
}

function setMassIdx(idx){
  state.massIdx = idx % MASSES.length;
  document.getElementById('btnMass').textContent = MASSES[state.massIdx].label;
  updateScienceHud();
}

const state = {
  quality: 'ultra',   /* ULTRA is the default experience (Lead Engineer's call):
     full 1500-step integration without the adapter trading it away; AUTO
     remains one click for weaker GPUs */
  qKey: 'ultra',
  resScale: 1.0,
  tierIdx: TIERS.length-1,
  paused: false,
  lensing: true,
  doppler: true,
  bloom: true,
  palette: 'ember',
  scienceMode: false,
  massIdx: 0,
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
let rtAccA = null, rtAccB = null;
let accCur = null, accNext = null, accReset = true;
let pyramid = [];   /* {a,b} per level */

function buildAll(iw, ih){
  rtScene  = makeTarget(iw, ih);
  rtAccA   = makeTarget(iw, ih);
  rtAccB   = makeTarget(iw, ih);
  accCur = rtAccA; accNext = rtAccB; accReset = true;
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
  freeTarget(rtAccA); freeTarget(rtAccB);
  accCur = accNext = null;
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
const URL_NOSTARS = new URLSearchParams(location.search).has('nostars');   /* lensed-star vs renderer bead disambiguation */
const URL_CLEAN = new URLSearchParams(location.search).has('clean');       /* poster mode: HUD hidden */
if(URL_CLEAN) hudEl.classList.add('hidden');
const URL_METRO = new URLSearchParams(location.search).has('metro');       /* raw-tracer metrology: no jitter, no accumulation, no grain,
   no pincushion — the shadow criterion measures the capture boundary physics,
   not the AA filter or the presentation warp */

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
document.getElementById('btnSci').addEventListener('click', () => setScience(!state.scienceMode));
document.getElementById('btnMass').addEventListener('click', cycleMass);

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
function setScience(v){
  state.scienceMode = v;
  const b = document.getElementById('btnSci');
  b.classList.toggle('on', v); b.setAttribute('aria-pressed', String(v));
  updateScienceHud();
}
function cycleMass(){
  state.massIdx = (state.massIdx+1)%MASSES.length;
  document.getElementById('btnMass').textContent = MASSES[state.massIdx].label;
  updateScienceHud();
}
document.getElementById('btnTDE').addEventListener('click', () => {
  spawnTDE();
  document.getElementById('btnTDE').classList.add('on');
});
document.getElementById('btnInfall').addEventListener('click', () => {
  spawnInfall();
  document.getElementById('btnInfall').classList.toggle('on');
});
document.getElementById('btnJets').addEventListener('click', () => {
  spawnJets();
  document.getElementById('btnJets').classList.toggle('on');
});
document.getElementById('btnBinary').addEventListener('click', () => {
  spawnBinary();
  document.getElementById('btnBinary').classList.add('on');
});
const tRs = document.getElementById('tRs'), tCam = document.getElementById('tCam'),
      tTmax = document.getElementById('tTmax');
function updateScienceHud(){
  const { rsKm, tMaxK } = massPhysics(MASSES[state.massIdx].msun);
  const au = rsKm/AU_KM;
  tRs.textContent = rsKm >= 0.01*AU_KM
    ? (rsKm/AU_KM).toFixed(2)+' AU ('+eng(rsKm)+'km)'
    : eng(rsKm)+'km';
  tTmax.textContent = eng(tMaxK)+'K';
}
function eng(x){
  if(x >= 1e6) return (x/1e6).toFixed(2)+'e6 ';
  if(x >= 1e3) return (x/1e3).toFixed(1)+'e3 ';
  return x.toPrecision(3)+' ';
}
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
  wake();
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
    case 'y': case 'Y': setScience(!state.scienceMode); break;
    case 'm': case 'M': cycleMass(); break;
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
                         steps: q.steps, tier: state.qKey, bloom: state.bloom,
                         hdr: HDR_TYPE !== THREE.UnsignedByteType };
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
  /* science: the PHYSICAL g-factor, always — the film palette's doppler 0.32
     silently replaced it and gutted the beaming (round-11 hostile, HIGH) */
  u.uDoppler.value = state.scienceMode ? 1.0 : (state.doppler ? palCur.doppler : 0);
  u.uBeamExp.value = state.scienceMode ? 4 : 3;
  u.uScience.value = state.scienceMode ? 1 : 0;
  u.uDiskIn.value = state.scienceMode ? 3.0 : 2.6;
  u.uTNorm.value = massPhysics(MASSES[state.massIdx].msun).tMaxK/1e7;
  /* science: unity gain — the palette's 1.18/0.96 swing leaked a 23%
     amplitude modulation into the claimed-physical path (round-14 hostile) */
  u.uGain.value = state.scienceMode ? 1.0 : palCur.gain;
  u.uOpacity.value = 0.85;
  u.uFlow.value = 0.70711;   /* exact Keplerian Omega_K = sqrt(M/r^3), M = 1/2
    (round-2 fix was silently overwritten here each frame until round-3 caught it) */
  u.uStars.value = URL_NOSTARS ? 0.0 : 1.0;
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
  tickTDE(dt);
  tickInfall(dt);
  tickBinary(dt);
  const uEv = mScene.uniforms;
  uEv.uStreamOn.value = (events.tde.on || infall.on) ? 1.0 : 0.0;
  uEv.uJets.value = jets.on ? 1.0 : 0.0;
  uEv.uBinOn.value = binary.on ? 1.0 : 0.0;
  uEv.uBinP.value.set(binary.x1, binary.z1, binary.x2, binary.z2);
  uEv.uBinR.value.set(binary.r1 || 0, binary.r2 || 0, binary.rOcc || 0, 0);
  hudEl.classList.toggle('dim', cam.idleTimer > 8 && introT >= INTRO_LEN);

  /* --- scene pass with temporal accumulation: subpixel jitter + EMA blend
     converges static frames to a true supersample — the high-order photon-ring
     images are exponentially thin and bead at one ray per pixel (round-3) --- */
  if(URL_METRO){
    mScene.uniforms.uJitter.value.set(0, 0);
  } else {
    /* 32-tap two-ring jitter to ±0.75 texel: the high-order photon ring is a
       sub-texel caustic — beads along its arc survive kernels narrower than
       the line itself (round-4 sea). Extra phases cost nothing at static
       convergence; the EMA just needs more frames to visit them all. */
    const JP = [];
    for(let i = 0; i < 16; i++){
      const a = (i+0.5)*(Math.PI/8);
      JP.push([Math.cos(a)*0.375, Math.sin(a)*0.375]);
      const b = a + 0.11;
      JP.push([Math.cos(b)*1.5, Math.sin(b)*1.5]);
    }
    const jf = JP[frameCount % 32];
    mScene.uniforms.uJitter.value.set(jf[0]/rtScene.width, jf[1]/rtScene.height);
  }
  drawPass(mScene, rtScene);

  const camMoving = Math.abs(cam.az-cam.tAz)+Math.abs(cam.el-cam.tEl)+Math.abs(cam.dist-cam.tDist) > 1e-4;
  const palMoving = Math.abs(palCur.gain-palTgt.gain)+Math.abs(palCur.sat-palTgt.sat)
                  + Math.abs(palCur.streakStr-palTgt.streakStr)+Math.abs(palCur.doppler-palTgt.doppler) > 2e-3;
  mBlend.uniforms.uCur.value = rtScene.texture;
  mBlend.uniforms.uPrev.value = accCur.texture;
  mBlend.uniforms.uMix.value = (accReset || URL_METRO) ? 1.0 : ((!state.paused || camMoving || palMoving) ? 0.5 : 0.12);
  drawPass(mBlend, accNext);
  const accT = accCur; accCur = accNext; accNext = accT;
  accReset = false;

  if(state.bloom){
    /* bright pass at half internal res */
    const ub = mBright.uniforms;
    ub.uSrc.value = accCur.texture;
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
  uc.uScene.value = accCur.texture;
  for(let i=0;i<5;i++) uc['uB'+i].value = state.bloom ? pyramid[i].a.texture : accCur.texture;
  uc.uStreak.value = state.bloom ? rtStreak.texture : accCur.texture;
  uc.uTime.value = simTime;
  uc.uBloomStr.value = palCur.bloomStr;
  uc.uStreakStr.value = palCur.streakStr;
  uc.uExposure.value = 1.05;
  uc.uSaturation.value = state.scienceMode ? 1.0 : palCur.sat;   /* science chroma
     stays on the Planck locus — ember's 1.14 pushed it off (round-11 hostile, HIGH) */
  uc.uHasGlow.value = state.bloom ? 1 : 0;
  uc.uGrainAmt.value = (URL_NOGRAIN || URL_METRO || reducedMotion) ? 0.0 : 0.030;
  uc.uPinch.value = URL_METRO ? 0.0 : 0.045;   /* metro measures scene geometry natively */
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
    /* live scale readout */
    const { rsKm } = massPhysics(MASSES[state.massIdx].msun);
    const dRs = cam.dist;
    const dKm = dRs*rsKm;
    tCam.textContent = dRs.toFixed(1)+' rs = '+(dKm >= 0.05*AU_KM ? (dKm/AU_KM).toFixed(2)+' AU' : eng(dKm)+'km');
  }
  if(state.quality === 'auto' && !URL_METRO){
    /* metro pins the grid: a downres tier would soften the raw edge through
       the composite's LinearFilter upsample (round-10 gauge audit) */
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
document.getElementById('btnMass').textContent = 'M '+MASSES[state.massIdx].label;
setScience(state.scienceMode);
updateScienceHud();
syncCanvasSize();
allocTargets(true);
veil.classList.add('off');
requestAnimationFrame(render);

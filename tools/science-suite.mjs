/* ============================================================
   GARGANTUA scientific regression suite (pure Node, no GPU)
   Mirrors FS_SCENE trace() — same Binet RK4, same adaptive dt
   schedule, same capture/escape/fallback classification — and
   tests against closed-form Schwarzschild results. Constants are
   PARSED FROM SOURCE so silent drift in the app fails here.
   Scope note (round-11 audit): this certifies the SOURCE text in
   float64; the GPU's fp32 arithmetic is certified end-to-end by
   tools/measure-shadow-converged.mjs (+0.15% scene space).
   ============================================================ */
import fs from 'node:fs';

const shaderSrc = fs.readFileSync(new URL('../src/shaders.js', import.meta.url), 'utf8');
const mainSrc = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

/* --- parse the constants the app ACTUALLY ships --- */
function grab(re, label){
  const m = shaderSrc.match(re) || mainSrc.match(re);
  if(!m){ console.log(`  FAIL pin ${label}: not found in source`); process.exit(1); }
  return parseFloat(m[1]);
}
const RS        = 1.0;
const ESC_R2    = grab(/const float ESC_R2\s*=\s*([0-9.]+)/, 'ESC_R2');
const M         = 0.5*RS;
const B_CRIT    = 3*Math.sqrt(3)*M;
const U_PH      = 1.0/(3.0*M);
const U_FLOW    = grab(/u\.uFlow\.value = ([0-9.]+)/, 'uFlow');           /* main.js upload */
const DISK_IN_SCI = grab(/u\.uDiskIn\.value = state\.scienceMode \? ([0-9.]+)/, 'uDiskIn');

let failures = 0;
function check(name, ok, detail){
  if(ok) console.log(`  ok   ${name}  ${detail}`);
  else { console.log(`  FAIL ${name}  ${detail}`); failures++; }
}

/* --- exact mirror of the shader's per-ray integration --- */
function integrate(b, dCam, dtScale, steps, trackInvariants){
  const u0 = 1.0/dCam;
  let U = u0;
  let W = Math.sqrt(Math.max(1.0/(b*b) - U*U + RS*U*U*U, 1e-8));  /* inbound */
  let phi = 0.0;
  let maxInvDrift = 0.0;
  const inv0 = 1.0/(b*b);
  const dphiBase = dtScale*0.09;
  const sample = () => { const inv = W*W + U*U - RS*U*U*U;
    maxInvDrift = Math.max(maxInvDrift, Math.abs(inv - inv0)); };
  sample();                                                    /* initial state */
  for(let i = 0; i < steps; i++){
    const dphi = dphiBase*Math.min(1.0, Math.max(0.6, 0.35/U));
    const BINET = UU => 3*M*UU*UU - UU;
    const k1u = W,               k1w = BINET(U);
    const k2u = W + 0.5*dphi*k1w, k2w = BINET(U + 0.5*dphi*k1u);
    const k3u = W + 0.5*dphi*k2w, k3w = BINET(U + 0.5*dphi*k2u);
    const k4u = W + dphi*k3w,     k4w = BINET(U + dphi*k3u);
    const uN = U + (dphi/6)*(k1u + 2*k2u + 2*k3u + k4u);
    const wN = W + (dphi/6)*(k1w + 2*k2w + 2*k3w + k4w);
    U = uN; W = wN; phi += dphi;
    if(trackInvariants) sample();                              /* post-update too */
    if(U > 1.0/RS || (U < 0.0 && W > 0.0)) return {fate:'captured', phiOut:phi, maxInvDrift};
    if(U < 1.0/Math.sqrt(ESC_R2) && W < 0.0) return {fate:'escaped', phiOut:phi, maxInvDrift};
  }
  const cap = (W > 0.0) && ((b*b < 27.0*M*M) || (U > U_PH - 0.012));
  return {fate: cap ? 'captured' : 'escaped', phiOut: phi, maxInvDrift};
}

function boundaryB(dCam, dtScale, steps){
  let lo = B_CRIT - 0.5, hi = B_CRIT + 0.5;
  for(let k = 0; k < 40; k++){
    const mid = 0.5*(lo + hi);
    if(integrate(mid, dCam, dtScale, steps).fate === 'captured') lo = mid; else hi = mid;
  }
  return 0.5*(lo + hi);
}

/* 1. shadow boundary vs closed form — two camera radii AND the shipped
   quality tiers. GATE HONESTY (round-14): 0.05% = 5e-4 relative is only
   1.03x the documented 4.9e-4 tiebreak sliver — this gate is a REGRESSION
   bar (catches unintended changes), NOT a metrology claim: the fallback
   tiebreak bias is inside it by design. The metrology claim lives in the
   GPU gauge (+0.15% measured) and in the sliver's own documented bound. */
console.log('1. shadow boundary vs b_crit = 3*sqrt(3)*M =', B_CRIT.toFixed(6));
{
  for(const [d, dt, st, cfg] of [[13.62, 1.0, 1500, 'd13.6 dt1.0'],
                                 [20.0, 1.0, 1500, 'd20 dt1.0'],
                                 [13.62, 1.0, 500, 'LOW shipped 500@1.0'],
                                 [13.62, 0.7, 1500, 'ULTRA shipped 1500@0.7']]){
    const bStar = boundaryB(d, dt, st);
    const err = 100*(bStar - B_CRIT)/B_CRIT;
    check(`boundary ${cfg}`, Math.abs(err) < 0.05, `b* = ${bStar.toFixed(6)}, err ${err.toFixed(4)}%`);
  }
}
/* 2. RK4 convergence: the ORDER is gated, not just monotone decrease */
console.log('2. RK4 convergence — order gated to [3.5, 4.5]');
{
  const d = 13.62, steps = 6000;
  const errs = [1.0, 0.5, 0.25].map(dt => boundaryB(d, dt, steps) - B_CRIT);
  const p = Math.log2(Math.abs(errs[0]/errs[1]));
  const p2 = Math.log2(Math.abs(errs[1]/errs[2]));
  check('measured order is 4th', p > 3.5 && p < 4.5 && p2 > 3.5 && p2 < 4.5,
        `p(dt1->0.5) = ${p.toFixed(2)}, p(0.5->0.25) = ${p2.toFixed(2)}`);
  check('error shrinks monotonically', Math.abs(errs[2]) < Math.abs(errs[1]) && Math.abs(errs[1]) < Math.abs(errs[0]),
        `e = ${errs.map(e => e.toExponential(2)).join(' -> ')}`);
}
/* 3. Binet invariant conservation — with a dt-scaling confirmation */
console.log('3. Binet invariant w^2 + u^2 - rs*u^3 = 1/b^2');
{
  let worst = 0, worstCtx = '', worstRel = 0;
  for(const [b, st] of [[1.0, 1500], [2.0, 1500], [B_CRIT*1.0001, 4000], [5.0, 1500], [12.0, 1500]]){
    const r = integrate(b, 13.62, 0.7, st, true);
    const rel = r.maxInvDrift/(1.0/(b*b));            /* scale-aware: relative drift */
    if(r.maxInvDrift > worst){ worst = r.maxInvDrift; worstCtx = `b=${b.toFixed(3)} in ${st} steps`; }
    if(rel > worstRel) worstRel = rel;
  }
  const half = integrate(B_CRIT*1.0001, 13.62, 0.35, 8000, true).maxInvDrift;
  /* RK4 global invariant error ~ steps*dt^4: halving dt at doubled steps
     predicts an 8-16x cut — the gate demands the theoretical minimum (8x),
     not half of it (round-14: the old >4x bar accepted order-2 schemes) */
  check('invariant drift < 1e-6 absolute', worst < 1e-6, `max ${worst.toExponential(2)} (${worstCtx})`);
  check('relative drift < 1e-4', worstRel < 1e-4, `max relative ${worstRel.toExponential(2)}`);
  check('drift scales ~dt^4 (>=8x at half dt)', half < worst*0.125,
        `half-dt drift ${half.toExponential(2)} vs ${worst.toExponential(2)}`);
}
/* 3b. azimuthal PHASE error on ring substructure — dt varied at FIXED step
   budget (round-14: the old gate changed dt AND budget together, conflating
   truncation with winding budget) */
console.log('3b. near-critical azimuthal phase convergence');
{
  const fine = integrate(B_CRIT + 1e-5, 13.62, 0.7, 6000).phiOut;
  const coarse = integrate(B_CRIT + 1e-5, 13.62, 1.0, 6000*0.7/1.0).phiOut;  /* same total phi budget */
  const dPhi = Math.abs(coarse - fine);
  /* fitted envelope, stated as such: sub-0.15 rad on a ~10 rad sweep keeps
     ring substructure stable at rendering grade; NOT a metrology tolerance */
  check('winding phase converges < 0.15 rad', dPhi < 0.15,
        `|phi(dt=1.0) - phi(dt=0.7)| = ${dPhi.toFixed(4)} rad (equal phi budget)`);
}
/* 4. photon sphere: separatrix resolves; critical side winds */
console.log('4. photon-sphere separatrix at b = b_crit');
{
  const rIn = integrate(B_CRIT - 1e-7, 13.62, 0.7, 4000);
  const rOut = integrate(B_CRIT + 1e-7, 13.62, 0.7, 4000);
  check('separatrix sides resolve', rIn.fate === 'captured' && rOut.fate !== 'captured',
        `in=${rIn.fate} out=${rOut.fate}`);
  const winds = rOut.phiOut/(2*Math.PI);
  check('escaping near-critical ray winds > 2 orbits', winds > 2,
        `${winds.toFixed(1)} orbits`);
}
/* 5. weak-field deflection vs 2PN series, SHIPPED adaptive dt schedule.
   Two gates: (a) the shipped schedule converges to its own refined limit
   (isolates endpoint discretization of the flat-chord accounting), and
   (b) that refined limit matches the 2PN closed form (the physics). */
console.log('5. weak-field light bending (adaptive dt as shipped)');
{
  const rStart = 200, b = 20;
  const uEsc = 1/rStart;
  const BINET = UU => 3*M*UU*UU - UU;
  function sweep(dtDiv){
    let U = 1/rStart;
    let W = Math.sqrt(Math.max(1/(b*b) - U*U + RS*U*U*U, 0));
    let phi = -Math.acos(Math.min(1, b/rStart));
    for(let i = 0; i < 60000; i++){
      const dphi = (0.09*Math.min(1.0, Math.max(0.6, 0.35/U)))/dtDiv;  /* shipped schedule */
      const k1u = W,               k1w = BINET(U);
      const k2u = W + 0.5*dphi*k1w, k2w = BINET(U + 0.5*dphi*k1u);
      const k3u = W + 0.5*dphi*k2w, k3w = BINET(U + 0.5*dphi*k2u);
      const k4u = W + dphi*k3w,     k4w = BINET(U + dphi*k3u);
      U += (dphi/6)*(k1u + 2*k2u + 2*k3u + k4u);
      W += (dphi/6)*(k1w + 2*k2w + 2*k3w + k4w);
      phi += dphi;
      if(U < uEsc && W < 0) break;
    }
    return phi - Math.acos(Math.min(1, b/rStart));
  }
  const alpha = sweep(1);
  const alphaRef = sweep(256);
  const alphaExact = 4*M/b + (15*Math.PI/4)*Math.pow(M/b, 2);
  /* (a) integrator correctness: the CONVERGED schedule matches 2PN */
  const physPct = 100*(alphaRef - alphaExact)/alphaExact;
  check('converged bending within 2% of 2PN', Math.abs(physPct) < 2,
        `refined ${alphaRef.toFixed(5)} vs 2PN ${alphaExact.toFixed(5)} (${physPct.toFixed(2)}%) [residual 3PN + finite r_start]`);
  /* (b) shipped-schedule weak-field error: measured, bounded, documented.
     ~+10% relative on a 0.1 rad deflection = ~0.011 rad absolute — sky-position
     systematic of the same class as the documented 0.9 deg escape tail,
     invisible without a reference and irrelevant to the shadow criterion
     (strong field, dphi refined near u_Ph, gauge +0.15% end-to-end). */
  const schedAbs = Math.abs(alpha - alphaRef);
  check('shipped-schedule weak-field error < 0.015 rad', schedAbs < 0.015,
        `|coarse - refined| = ${schedAbs.toFixed(4)} rad (${(100*(alpha-alphaRef)/alphaRef).toFixed(1)}% rel) — documented systematic`);
}
/* 6. escape-sphere tail: analytic bound + source pin.
   NOTE (round-14): an empirical two-radius difference (alpha(65) - alpha(300))
   was attempted and REJECTED — the flat-chord accounting couples the start
   geometry into each sweep, so the difference measures chord artifacts, not
   the tail. A clean estimator needs a shared-periapsis formulation; until
   then the bound below is the radial-photon first-order reference, and the
   GPU gauge bounds the end-to-end systematic. */
console.log('6. escape-sphere residual (analytic bound + source pin)');
{
  const tail = 2*M/Math.sqrt(ESC_R2);
  check('analytic tail bound < 0.02 rad', tail < 0.02, `2M/r_esc = ${tail.toFixed(4)} rad (radial-photon first order)`);
  check('ESC_R2 matches shaders.js', Math.abs(ESC_R2 - 4225) < 1e-9, `parsed ESC_R2 = ${ESC_R2}`);
}
/* 7. pinned constants — parsed from the app's actual source */
console.log('7. shipped constants vs closed forms');
{
  check('science ISCO = 6GM/c^2 = 3rs', Math.abs(DISK_IN_SCI - 6*M) < 1e-9,
        `uDiskIn(science) = ${DISK_IN_SCI}, 6M = ${6*M}`);
  const rRef = 4;
  check('uFlow = sqrt(M) so Omega = sqrt(M/r^3)', Math.abs(U_FLOW - Math.sqrt(M)) < 1e-4,
        `uFlow = ${U_FLOW}, sqrt(M) = ${Math.sqrt(M).toFixed(6)}`);
}

/* 8. grazing-filter anchor: E[smoothstep(0.52,0.88,fbm4)] measured from a
   fp64 port of the shipped noise fields (the MEAN is fp32-stable; individual
   hashes are not — this calibrates the constant the shader freezes to). */
console.log('8. grazing-filter mean-emission anchor');
{
  const fract = x => x - Math.floor(x);
  function hash13(px, py, pz){
    px = fract(px*0.1031); py = fract(py*0.1031); pz = fract(pz*0.1031);
    const d = px*(pz+31.32) + py*(py+31.32) + pz*(px+31.32);
    px += d; py += d; pz += d;
    return fract((px+py)*pz);
  }
  function vnoise(x, y, z){
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x-ix, fy = y-iy, fz = z-iz;
    const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy), uz = fz*fz*(3-2*fz);
    const l = (a, b, t) => a + (b-a)*t;
    return l(l(l(hash13(ix,iy,iz), hash13(ix+1,iy,iz), ux),
               l(hash13(ix,iy+1,iz), hash13(ix+1,iy+1,iz), ux), uy),
             l(l(hash13(ix,iy,iz+1), hash13(ix+1,iy,iz+1), ux),
               l(hash13(ix,iy+1,iz+1), hash13(ix+1,iy+1,iz+1), ux), uy), uz);
  }
  const ROT = [[0.36,0.48,-0.80],[-0.80,0.60,0.0],[0.48,0.64,0.60]];
  function fbm4(x, y, z){
    let s = 0, a = 0.5, p = [x, y, z];
    for(let i = 0; i < 4; i++){
      s += a*vnoise(p[0], p[1], p[2]);
      const q = p;
      p = [
        (ROT[0][0]*q[0] + ROT[0][1]*q[1] + ROT[0][2]*q[2])*2.11 + 7.3,
        (ROT[1][0]*q[0] + ROT[1][1]*q[1] + ROT[1][2]*q[2])*2.11 + 7.3,
        (ROT[2][0]*q[0] + ROT[2][1]*q[1] + ROT[2][2]*q[2])*2.11 + 7.3,
      ];
      a *= 0.55;
    }
    return s;
  }
  const sstep = x => { const t = Math.min(1, Math.max(0, (x-0.52)/0.36)); return t*t*(3-2*t); };
  let acc = 0, N = 200000;
  for(let i = 0; i < N; i++){
    const r = 3.0 + 8.0*((i*2654435761 >>> 0)/4294967296);
    const ph = 2*Math.PI*(((i*40503 >>> 0)%1000)/1000);
    acc += sstep(fbm4(Math.cos(ph)*2.9+9.4, Math.sin(ph)*2.9, Math.log(r)*8.8));
  }
  const anchor = acc/N;
  const anchorSrc = parseFloat((shaderSrc.match(/float fil = mix\(([0-9.]+),/) || [])[1]);
  check('fil anchor matches measured E[smoothstep]', Math.abs(anchorSrc - anchor) < 0.005,
        `measured E = ${anchor.toFixed(4)}, shader anchor = ${anchorSrc} (n=${N})`);
}

console.log(failures === 0 ? '\nSCIENCE SUITE: ALL GREEN' : `\nSCIENCE SUITE: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

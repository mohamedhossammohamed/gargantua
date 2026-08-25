import puppeteer from 'puppeteer-core';
import { ensureServer } from './server-guard.mjs';
await ensureServer();

/* H6 gauge v7 — first-light from the black interior.
   Bloom OFF guarantees a truly black moat; walk OUTWARD from screen center
   along upper-sector rays; the FIRST super-threshold sample is the shadow
   edge (inner wall of whatever structure bounds it — photon ring / far-side
   arc — both sit immediately outside the capture boundary). Subpixel lerp.
   Also reports interior purity (max lum inside 0.8R). */

const exe = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const T = 0.6121;
const BC = 3 * Math.sqrt(3) * 0.5;

const browser = await puppeteer.launch({
  executablePath: exe, headless: true,
  args: ['--window-size=1280,800', '--use-angle=metal', '--enable-gpu'],
  protocolTimeout: 25000,
});
const page = await browser.newPage();
page.setDefaultTimeout(15000);
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });   /* 2560x1600: halves threshold-placement error */
setTimeout(() => { console.error('GAUGE GLOBAL TIMEOUT'); process.exit(3); }, 170000).unref();

async function measure(presses, label, lensOff){
  await page.goto('http://127.0.0.1:8811/index.html?metro=1', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));
  await page.mouse.wheel({ deltaY: 10 });
  await page.keyboard.press('b');
  await new Promise(r => setTimeout(r, 150));
  if(await page.evaluate(() => window.__gargantua?.bloom) !== false){
    console.error('GAUGE: bloom failed to disable — aborting (a flooded moat fabricates interior glow)');
    process.exit(4);
  }
  const pre = await page.evaluate(() => ({ tier: window.__gargantua?.tier, hdr: window.__gargantua?.hdr }));
  if(pre.tier !== 'ultra' || !pre.hdr){
    console.error('GAUGE: metro preconditions unmet:', JSON.stringify(pre));
    process.exit(5);
  }
  if(lensOff) await page.keyboard.press('l');
  for(let i = 0; i < presses; i++){ await page.keyboard.press('q'); await new Promise(r => setTimeout(r, 100)); }
  await new Promise(r => setTimeout(r, 700));
  await page.keyboard.press(' ');
  await new Promise(r => setTimeout(r, 400));
  const res = await page.evaluate(lensOff => new Promise(resolve => {
    const gl = document.getElementById('view').getContext('webgl2');
    let done = false;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => orig(ts => {
      cb(ts);
      if(done) return; done = true;
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w*h*4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const lum = new Float32Array(w*h);
      for(let i = 0; i < w*h; i++){
        const o = i*4;
        lum[i] = 0.2126*px[o] + 0.7152*px[o+1] + 0.0722*px[o+2];
      }
      const cx = w>>1, cy = h>>1;
      const L = (x,y) => {
        const xi = Math.floor(x), yi = Math.floor(y);
        if(xi<1||yi<1||xi>=w-2||yi>=h-2) return -1;
        const fx = x-xi, fy = y-yi;
        return lum[yi*w+xi]*(1-fx)*(1-fy)+lum[yi*w+xi+1]*fx*(1-fy)
             + lum[(yi+1)*w+xi]*(1-fx)*fy+lum[(yi+1)*w+xi+1]*fx*fy;
      };
      const N = 48, hits = [];
      let interiorMax = 0;
      for(let k = 0; k < N; k++){
        const ang = (55 + (k/(N-1))*70) * Math.PI/180;
        const dxr = Math.cos(ang), dyr = Math.sin(ang);
        const samp = r => L(cx + dxr*r, cy + dyr*r);
        const THR = 12;   /* nograin channel: true-black floor ~2-3 levels */
        let edge = -1;
        for(let r = 4; r <= 300; r += 0.25){
          const v = samp(r);
          if(v < 0) break;
          if(r < 160) interiorMax = Math.max(interiorMax, v);
          if(v >= THR){ edge = r; break; }
        }
        if(edge < 0) continue;
        /* 50%-of-plateau crossing: the accumulated edge is a box-filtered
           ramp; an absolute near-floor threshold lands ~0.4 texel inside the
           true edge once TAA is on (round-4). Plateau = median ring brightness
           just outside, then bisect the half-max crossing — unbiased for both
           the old aliased step and the new ramp. */
        const ps = [];
        for(let rr2 = edge+1.5; rr2 <= edge+3.5; rr2 += 0.5){
          const v = samp(rr2); if(v >= 0) ps.push(v);
        }
        ps.sort((a,b)=>a-b);
        const B = ps.length ? ps[ps.length>>1] : 0;
        const THR2 = Math.max(THR, 0.5*B);
        let lo = Math.max(4, edge-2), hi2 = edge;
        /* the invariant samp(hi2)>=THR2 fails at the raw edge when the plateau
           is bright — extend forward or the bisection silently degenerates to
           the absolute-THR estimator (round-4 diagnostician, numerically
           verified: hard step -0.264 -> -0.014 texel) */
        while(samp(hi2) < THR2 && hi2 < edge+6) hi2 += 0.25;
        for(let it = 0; it < 8; it++){
          const mid = (lo+hi2)/2;
          if(samp(mid) >= THR2) hi2 = mid; else lo = mid;
        }
        hits.push((lo+hi2)/2);
      }
      hits.sort((a,b)=>a-b);
      resolve({ w, h, camDist: window.__gargantua?.camDist ?? 0,
                n: hits.length, med: hits.length ? hits[hits.length>>1] : 0,
                min: hits.length ? hits[0] : 0, max: hits.length ? hits.at(-1) : 0,
                interiorMax });
    });
  }), lensOff);
  const d = res.camDist;
  const sinT = lensOff ? (1/d) : (BC*Math.sqrt(Math.max(0,1-1/d))/d);
  const predR = Math.tan(Math.asin(sinT))/T * (res.h/2);
  console.log(`${label}: R=${res.med.toFixed(1)}px pred=${predR.toFixed(1)} err=${(100*(res.med-predR)/predR).toFixed(2)}%  n=${res.n}/48 range=[${res.min.toFixed(1)},${res.max.toFixed(1)}] interiorMax=${res.interiorMax.toFixed(0)} d=${d.toFixed(2)}`);
  return { label, ...res, predR };
}

await measure(0, 'ultra lensed  ', false);   /* 0 presses: ULTRA is the boot default */
await measure(0, 'ultra straight', true);
await browser.close();

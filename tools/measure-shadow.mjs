import puppeteer from 'puppeteer-core';

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
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
setTimeout(() => { console.error('GAUGE GLOBAL TIMEOUT'); process.exit(3); }, 170000).unref();

async function measure(presses, label, lensOff){
  await page.goto('http://127.0.0.1:8811/index.html?nograin=1', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 600));
  await page.mouse.wheel({ deltaY: 10 });
  await page.keyboard.press('b');
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
      const N = 24, hits = [];
      let interiorMax = 0;
      for(let k = 0; k < N; k++){
        const ang = (60 + (k/(N-1))*60) * Math.PI/180;
        const dxr = Math.cos(ang), dyr = Math.sin(ang);
        const samp = r => L(cx + dxr*r, cy + dyr*r);
        const THR = 12;   /* nograin channel: true-black floor ~2-3 levels */
        let edge = -1;
        for(let r = 4; r <= 200; r += 0.5){
          const v = samp(r);
          if(v < 0) break;
          if(r < 90) interiorMax = Math.max(interiorMax, v);
          if(v >= THR){ edge = r; break; }
        }
        if(edge < 0) continue;
        /* subpixel: crossing between edge-0.5 and edge */
        const a = samp(edge-0.5), b = samp(edge);
        const frac = (b-a) > 0 ? Math.min(1, Math.max(0, (THR-a)/(b-a))) : 0;
        hits.push(edge - 0.5 + frac);
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
  console.log(`${label}: R=${res.med.toFixed(1)}px pred=${predR.toFixed(1)} err=${(100*(res.med-predR)/predR).toFixed(2)}%  n=${res.n}/24 range=[${res.min.toFixed(1)},${res.max.toFixed(1)}] interiorMax=${res.interiorMax.toFixed(0)} d=${d.toFixed(2)}`);
  return { label, ...res, predR };
}

await measure(4, 'ultra lensed  ', false);
await measure(4, 'ultra straight', true);
await browser.close();

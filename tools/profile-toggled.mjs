import puppeteer from 'puppeteer-core';

/* Discriminating experiment: radial profile with a toggle pressed.
   TOGGLE=b  -> bloom off : tests post-chain contamination of the shadow moat
   TOGGLE=l  -> lensing off: analytic straight-ray silhouette r≈37.2px at d=17
   Usage: TOGGLE=b node tools/profile-toggled.mjs */
const TOGGLE = process.env.TOGGLE || 'b';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, protocolTimeout: 25000,
  args: ['--window-size=1280,800', '--use-angle=metal', '--enable-gpu']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8811/index.html', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 600));
await page.mouse.wheel({ deltaY: 10 });
await page.keyboard.press('3');
await page.keyboard.press(TOGGLE);
for(let i = 0; i < 4; i++){ await page.keyboard.press('q'); await new Promise(r => setTimeout(r, 90)); }
await new Promise(r => setTimeout(r, 700));
await page.keyboard.press(' ');
await new Promise(r => setTimeout(r, 400));
const prof = await page.evaluate(() => new Promise(resolve => {
  const gl = document.getElementById('view').getContext('webgl2');
  let done = false;
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => orig(ts => {
    cb(ts);
    if(done) return; done = true;
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w*h*4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const S = 2, lw = w/S;
    const lum = new Float32Array(lw*(h/S));
    for(let y = 0; y < h/S; y++) for(let x = 0; x < lw; x++){
      let s = 0;
      for(let j = 0; j < S; j++) for(let i = 0; i < S; i++){
        const o = ((y*S+j)*w + x*S+i)*4;
        s += 0.2126*px[o] + 0.7152*px[o+1] + 0.0722*px[o+2];
      }
      lum[y*lw+x] = s/(S*S);
    }
    const cx = lw>>1, cy = (h/S)>>1;
    const vals = [];
    for(let r = 2; r <= 170; r += 2) vals.push(Math.round(lum[cy*lw + cx + r]));
    resolve({ d: window.__gargantua?.camDist, vals });
  });
}));
console.log(`TOGGLE=${TOGGLE} camDist:`, prof.d?.toFixed(2));
console.log('r(px):  ', prof.vals.map((_, i) => (i*2+2)).join(','));
console.log('lum:    ', prof.vals.join(','));
await browser.close();

import puppeteer from 'puppeteer-core';

const exe = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  args: ['--window-size=1280,800', '--use-angle=metal', '--enable-gpu']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

const logs = [];
page.on('console', m => { const t = m.type(); if(t === 'error' || t === 'warning') logs.push(t.toUpperCase() + ': ' + m.text()); });
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));

await page.goto('http://127.0.0.1:8811/index.html', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 4500));

/* sample one scanline through the hole's mid-plane, hooked to a frame */
const stats = await page.evaluate(() => new Promise(resolve => {
  const canvas = document.getElementById('view');
  const gl = canvas.getContext('webgl2');
  const veilClass = document.getElementById('veil').className;
  if(!gl){ resolve({ error: 'no webgl2 context', veilClass }); return; }
  let done = false;
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => orig(ts => {
    cb(ts);
    if(done) return;
    done = true;
    const h = gl.drawingBufferHeight, w = gl.drawingBufferWidth;
    const y = Math.floor(h/2);
    const buf = new Uint8Array(w*4);
    gl.readPixels(0, y, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let nz = 0, mx = 0, sum = 0;
    for(let i = 0; i < w; i++){
      const v = Math.max(buf[i*4], buf[i*4+1], buf[i*4+2]);
      if(v > 8) nz++;
      if(v > mx) mx = v;
      sum += v;
    }
    resolve({ w, h, nonzeroFrac: +(nz/w).toFixed(3), maxChannel: mx, meanChannel: Math.round(sum/w), veilClass });
  });
}));

console.log('PIXELS:', JSON.stringify(stats));
console.log('CONSOLE ISSUES:', logs.length);
logs.slice(0, 8).forEach(l => console.log('  ', l.slice(0, 220)));
await page.screenshot({ path: '/tmp/gargantua-shot.png' });
await browser.close();

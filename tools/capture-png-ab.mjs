import puppeteer from 'puppeteer-core';
import { ensureServer } from './server-guard.mjs';
await ensureServer();

/* Lattice A/B: identical S1 frame as lossless PNG vs the shipped JPEG q92.
   If the straight-line lattice survives in the PNG it is the renderer; if it
   vanishes it was DCT block artifacting on grainy near-black. */
const exe = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = '/Users/mohammedhossam/blackhole/data/shots';
const browser = await puppeteer.launch({
  executablePath: exe, headless: true,
  args: ['--window-size=1280,800', '--use-angle=metal', '--enable-gpu']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

for(const [name, type, opts] of [
  ['A1-orbit-png', 'png', {}],
  ['A2-orbit-jpg-q98', 'jpeg', { quality: 98 }],
]){
  await page.goto('http://127.0.0.1:8811/index.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 700));
  await page.mouse.wheel({ deltaY: 10 });
  await new Promise(r => setTimeout(r, 3200));   /* camera settle + EMA convergence */
  await page.keyboard.press(' ');                 /* pause: fully static */
  await new Promise(r => setTimeout(r, 2500));    /* converge hard */
  await page.screenshot({ path: `${outDir}/${name}.${type === 'png' ? 'png' : 'jpg'}`, type, ...opts });
  console.log('shot:', name);
}
console.log('PAGE ERRORS:', errors.length);
await browser.close();

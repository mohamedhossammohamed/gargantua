import puppeteer from 'puppeteer-core';
import { ensureServer } from './server-guard.mjs';
await ensureServer();

/* TDE sequence capture: spawn, dive, disruption, stream wrap, accretion. */
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

await page.goto('http://127.0.0.1:8811/index.html', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 700));
await page.mouse.wheel({ deltaY: 10 });
await page.click('#btnTDE');
const phases = [[4, 'T1-dive'], [9, 'T2-disrupt'], [15, 'T3-stream'], [24, 'T4-wrap'], [40, 'T5-accrete']];
let prev = 0;
for(const [t, name] of phases){
  await new Promise(r => setTimeout(r, (t - prev)*1000));
  prev = t;
  await page.screenshot({ path: `${outDir}/${name}.png`, type: 'png' });
  console.log('shot:', name, 'at t+', t, 's');
}
console.log('PAGE ERRORS:', errors.length);
errors.slice(0, 3).forEach(e => console.log('  ', e.slice(0, 140)));
await browser.close();

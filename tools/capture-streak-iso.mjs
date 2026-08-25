import puppeteer from 'puppeteer-core';
import { ensureServer } from './server-guard.mjs';
await ensureServer();

/* Streak isolation matrix: the S1 frame with each pipeline stage toggled off.
   Whichever toggle kills the straight radial streaks owns the mechanism. */
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

async function shot(name, keys = []){
  await page.goto('http://127.0.0.1:8811/index.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 700));
  await page.mouse.wheel({ deltaY: 10 });
  for(const k of keys){ await page.keyboard.press(k); await new Promise(r => setTimeout(r, 150)); }
  await new Promise(r => setTimeout(r, 3200));
  await page.keyboard.press(' ');
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: `${outDir}/${name}.png`, type: 'png' });
  console.log('shot:', name);
}

await shot('B0-normal');        await shot('B1-nobloom',  ['b']);
await shot('B2-nodoppler', ['d']); await shot('B3-nolensing', ['l']);
console.log('PAGE ERRORS:', errors.length);
await browser.close();

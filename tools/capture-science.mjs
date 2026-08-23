import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

/* Science-mode capture: cinema vs science, mass presets, ISCO moat. */
const exe = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = '/Users/mohammedhossam/blackhole/data/shots';
fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: exe, headless: true,
  args: ['--window-size=1280,800', '--use-angle=metal', '--enable-gpu']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
async function shot(name, keys = [], settle = 1000){
  await page.goto('http://127.0.0.1:8811/index.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 700));
  await page.mouse.wheel({ deltaY: 10 });
  for(const k of keys){ await page.keyboard.press(k); await new Promise(r => setTimeout(r, 140)); }
  await new Promise(r => setTimeout(r, settle));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('shot:', name);
}
await shot('S1-orbit-cinema');
await shot('S2-orbit-science',        ['y']);
await shot('S3-graze-science',        ['y', '2']);
await shot('S4-science-gargantua',    ['y', 'm', 'm', 'm']);
await shot('S5-science-nolensing',    ['y', 'l']);
console.log('PAGE ERRORS:', errors.length); errors.slice(0,4).forEach(e => console.log(' ', e.slice(0,140)));
await browser.close();

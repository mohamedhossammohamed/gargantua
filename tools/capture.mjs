import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

/* Screenshot-matrix battery: drives the live renderer through views,
   palettes, toggles and quality tiers; saves PNGs to data/shots/. */

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
page.on('console', m => { if(m.type() === 'error') errors.push(m.text()); });

async function shot(name, keys = [], wheel = 0, settle = 900){
  await page.goto('http://127.0.0.1:8811/index.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 700));
  await page.mouse.wheel({ deltaY: 10 });          /* skip intro */
  for(const k of keys){ await page.keyboard.press(k); await new Promise(r => setTimeout(r, 120)); }
  if(wheel) for(let i = 0; i < wheel; i++){ await page.mouse.wheel({ deltaY: -120 }); await new Promise(r => setTimeout(r, 40)); }
  await new Promise(r => setTimeout(r, settle));   /* camera damping settles */
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('shot:', name);
}

await shot('01-orbit-default');
await shot('02-graze',            ['2']);
await shot('03-overhead',         ['3']);
await shot('04-orbit-film',       ['p']);
await shot('05-graze-film',       ['2', 'p']);
await shot('06-nolensing-orbit',  ['l']);
await shot('07-nodoppler-orbit',  ['d']);
await shot('08-nobloom-orbit',    ['b']);
await shot('09-ultra-graze',      ['q', 'q', 'q', 'q', '2'], 0, 1400);
await shot('10-low-orbit',        ['q']);
await shot('11-closeup-paused',   ['3'], 14);
await page.keyboard.press(' ');
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: `${outDir}/12-closeup-frozen.png` });
console.log('shot: 12-closeup-frozen');

console.log('PAGE ERRORS:', errors.length);
errors.slice(0, 5).forEach(e => console.log('  ', e.slice(0, 160)));
await browser.close();

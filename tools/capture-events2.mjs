import puppeteer from 'puppeteer-core';
import { ensureServer } from './server-guard.mjs';
await ensureServer();

/* Event captures: infall, jets, binary (spawn -> evolve -> shoot). */
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

async function fresh(){ await page.goto('http://127.0.0.1:8811/index.html', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 700)); await page.mouse.wheel({ deltaY: 10 }); }

/* infall */
await fresh(); await page.click('#btnInfall');
await new Promise(r => setTimeout(r, 12000));
await page.screenshot({ path: `${outDir}/E2-infall.png`, type: 'png' });
console.log('shot: E2-infall');

/* jets (graze-ish view to see both beams) */
await fresh(); await page.click('#btnJets');
await page.keyboard.press('2');
await new Promise(r => setTimeout(r, 5000));
await page.screenshot({ path: `${outDir}/E3-jets.png`, type: 'png' });
console.log('shot: E3-jets');

/* binary: spawn and watch the inspiral decay (Peters is slow at a=24 —
   speed past the early phase by waiting through the acceleration) */
await fresh(); await page.click('#btnBinary');
const phases = [[6, 'E4-binary-wide'], [20, 'E5-binary-inspiral'], [34, 'E6-binary-late']];
let prev = 0;
for(const [t, name] of phases){
  await new Promise(r => setTimeout(r, (t - prev)*1000)); prev = t;
  await page.screenshot({ path: `${outDir}/${name}.png`, type: 'png' });
  console.log('shot:', name);
}

console.log('PAGE ERRORS:', errors.length);
errors.slice(0, 3).forEach(e => console.log('  ', e.slice(0, 140)));
await browser.close();

import puppeteer from 'puppeteer-core';
import { ensureServer } from './server-guard.mjs';
await ensureServer();
const exe = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = '/Users/mohammedhossam/blackhole/data/shots';
const browser = await puppeteer.launch({
  executablePath: exe, headless: true,
  args: ['--window-size=1280,800', '--use-angle=metal', '--enable-gpu']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8811/index.html', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 700));
await page.mouse.wheel({ deltaY: 10 });
await page.click('#btnJets');
await page.keyboard.press('3');           /* overhead: looking down the jet axis */
await new Promise(r => setTimeout(r, 6000));
await page.screenshot({ path: `${outDir}/E3-jets-overhead.png`, type: 'png' });
console.log('shot: E3-jets-overhead');
await browser.close();

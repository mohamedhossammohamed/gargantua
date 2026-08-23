import puppeteer from 'puppeteer-core';

/* Minimal liveness probe: load, screenshot, trivial evaluate. No hooks.
   Usage: node tools/probe.mjs [--sw]   (--sw = --disable-gpu / SwiftShader) */
const sw = process.argv.includes('--sw');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  protocolTimeout: 15000,
  args: sw ? ['--disable-gpu'] : ['--use-angle=metal', '--enable-gpu']
});
const page = await browser.newPage();
page.setDefaultTimeout(12000);
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text().slice(0, 120)));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message.slice(0, 160)));
try {
  await page.goto('http://127.0.0.1:8811/index.html', { waitUntil: 'load', timeout: 15000 });
  console.log('goto OK');
  await new Promise(r => setTimeout(r, 2500));
  const one = await page.evaluate(() => 1 + 1);
  console.log('evaluate OK:', one);
  const state = await page.evaluate(() => ({
    veil: document.getElementById('veil').className,
    fps: document.getElementById('tFps').textContent,
    res: document.getElementById('tRes').textContent,
  }));
  console.log('HUD:', JSON.stringify(state));
  await page.screenshot({ path: '/tmp/gargantua-probe.png' });
  console.log('screenshot OK');
} catch(e){
  console.log('PROBE FAIL:', e.message.slice(0, 160));
}
logs.slice(0, 8).forEach(l => console.log(' ', l));
await browser.close();

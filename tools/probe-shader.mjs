import puppeteer from 'puppeteer-core';

/* Full-text shader-error probe: no console truncation — prints the complete
   THREE shader info log so GLSL compile errors are actually readable. */
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  protocolTimeout: 15000,
  args: ['--use-angle=metal', '--enable-gpu']
});
const page = await browser.newPage();
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto('http://127.0.0.1:8811/index.html', { waitUntil: 'load', timeout: 15000 });
await new Promise(r => setTimeout(r, 2500));
for(const l of logs){
  if(/shader|error|invalid/i.test(l)) console.log(l.slice(0, 3000));
}
await browser.close();

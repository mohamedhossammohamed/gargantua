import puppeteer from 'puppeteer-core';

/* Bead-disambiguation pair: the identical closeup framing with and without
   the starfield. If the ring beads vanish without stars they are lensed star
   images (physics); if they persist, the renderer owns them. */

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

async function shot(name, query){
  await page.goto(`http://127.0.0.1:8811/index.html${query}`, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 700));
  await page.mouse.wheel({ deltaY: 10 });
  await page.keyboard.press('3');
  for(let i = 0; i < 14; i++){ await page.mouse.wheel({ deltaY: -120 }); await new Promise(r => setTimeout(r, 40)); }
  await new Promise(r => setTimeout(r, 2500));   /* camera settles + accumulator converges */
  await page.keyboard.press(' ');
  await new Promise(r => setTimeout(r, 1800));   /* EMA convergence at uMix 0.12 */
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('shot:', name);
}

await shot('13-closeup-stars',   '');
await shot('14-closeup-nostars', '?nostars=1');

console.log('PAGE ERRORS:', errors.length);
await browser.close();

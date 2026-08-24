import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

/* Recompress data/shots/*.png to .jpg (q88) via headless Chrome canvas —
   the PNG library is ~30 MB of photographic noise and strangles slow
   uplinks; JPEG is ~10x lighter at visual parity for these frames. */

const exe = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dir = '/Users/mohammedhossam/blackhole/data/shots';

const browser = await puppeteer.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();

const pngs = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
for(const f of pngs){
  const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
  const jpg = await page.evaluate(async (b) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.88).split(',')[1];
  }, b64);
  fs.writeFileSync(path.join(dir, f.replace(/\.png$/, '.jpg')), Buffer.from(jpg, 'base64'));
  console.log('jpg:', f.replace('.png', '.jpg'));
}
await browser.close();
console.log('done:', pngs.length, 'files');

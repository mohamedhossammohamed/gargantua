import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('.', import.meta.url).pathname;

/* bundle app + three into one IIFE */
await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true, minify: true, format: 'iife',
  target: ['es2019'], logLevel: 'info',
  outfile: path.join(root, 'dist/bundle.js'),
});

/* stitch into the single self-contained deliverable */
const bundle = fs.readFileSync(path.join(root, 'dist/bundle.js'), 'utf8');
let html = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8');
if(!html.includes('<!--BUNDLE-->')) throw new Error('template missing BUNDLE marker');
html = html.replace('<!--BUNDLE-->', () => '<script>\n' + bundle + '\n</script>');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
fs.writeFileSync(path.join(root, 'index.html'), html);   /* root = primary deliverable */

console.log(`dist/index.html: ${(html.length/1024).toFixed(0)} KB (bundle ${(bundle.length/1024).toFixed(0)} KB)`);

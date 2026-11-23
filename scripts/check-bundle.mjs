// Fails when the entry chunk (dist/assets/index-*.js) is missing, larger than 400 000 bytes, or contains the PDF libraries.
import { readdirSync, readFileSync, statSync } from 'node:fs';

const LIMIT = 400_000;
// Strings that survive minification: jsPDF's error texts and property names, and svg2pdf.js's error text. The built PDF chunk holds all of them.
const PDF_MARKERS = ['jsPDF', 'svg2pdf', 'Unsupported image URL'];
const dir = 'dist/assets';
let sizes = [];
try {
  sizes = readdirSync(dir)
    .filter(f => /^index-.*\.js$/.test(f))
    .map(f => ({ f, bytes: statSync(`${dir}/${f}`).size }));
} catch { /* no dist directory */ }

if (sizes.length === 0) {
  console.error('check:bundle: no dist/assets/index-*.js found. Run npm run build first.');
  process.exit(1);
}
const { f, bytes } = sizes.reduce((a, b) => (b.bytes > a.bytes ? b : a));
if (bytes > LIMIT) {
  console.error(`check:bundle: ${f} is ${bytes} bytes, over the ${LIMIT} byte limit.`);
  process.exit(1);
}
const source = readFileSync(`${dir}/${f}`, 'utf8');
const found = PDF_MARKERS.filter(m => source.includes(m));
if (found.length > 0) {
  console.error(`check:bundle: ${f} contains the PDF library (found ${found.map(m => `"${m}"`).join(', ')}). Load it with import() only.`);
  process.exit(1);
}
console.log(`check:bundle: ${f} is ${bytes} bytes (limit ${LIMIT}).`);

// Fails when the code that loads at start is over 400 000 bytes or contains the PDF libraries.
// The start set: the module script and the modulepreload links of dist/index.html, plus the files they import statically
// (`from"./x.js"`, `import"./x.js"`; a dynamic `import(...)` loads later and does not count).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const LIMIT = 400_000;
// Strings that survive minification: jsPDF's error texts and property names, and svg2pdf.js's error text. The built PDF chunk holds all of them.
const PDF_MARKERS = ['jsPDF', 'svg2pdf', 'Unsupported image URL'];
// jsPDF imports html2canvas, dompurify and canvg only for doc.html() and addSvgAsImage, which the app never calls.
// vite.config.ts stubs them. A marker is a string from the library's own code that jsPDF's chunk does not hold
// (jsPDF's error texts name the libraries, so a library name alone is no marker).
const UNUSED_LIBRARIES = [
  { name: 'html2canvas', marker: 'Unable to find element in cloned iframe' },
  { name: 'dompurify', marker: 'ALLOWED_URI_REGEXP' },
  { name: 'canvg', marker: 'core-js_shared__' },
];
const dist = 'dist';

let html;
try {
  html = readFileSync(join(dist, 'index.html'), 'utf8');
} catch {
  console.error('check:bundle: no dist/index.html found. Run npm run build first.');
  process.exit(1);
}

const local = href => join(dist, href);
const roots = [
  ...[...html.matchAll(/<script[^>]*type="module"[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]),
  ...[...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*\shref="([^"]+)"/g)].map(m => m[1]),
].map(local);
if (roots.length === 0 || !roots.some(f => /index-.*\.js$/.test(f))) {
  console.error('check:bundle: dist/index.html names no entry script.');
  process.exit(1);
}

const files = new Set();
const queue = [...roots];
while (queue.length > 0) {
  const file = normalize(queue.shift());
  if (files.has(file)) continue;
  files.add(file);
  let source;
  try { source = readFileSync(file, 'utf8'); } catch {
    console.error(`check:bundle: ${file} is named by the start set but missing.`);
    process.exit(1);
  }
  for (const m of source.matchAll(/(?:\bfrom|\bimport)\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) queue.push(join(dirname(file), m[1]));
}

const set = [...files].map(f => ({ f, bytes: statSync(f).size })).sort((a, b) => b.bytes - a.bytes);
const sum = set.reduce((n, x) => n + x.bytes, 0);
for (const { f, bytes } of set) console.log(`  ${f}  ${bytes}`);
console.log(`check:bundle: start set of ${set.length} files, ${sum} bytes (limit ${LIMIT}).`);

let failed = false;
if (sum > LIMIT) {
  console.error(`check:bundle: the start set is ${sum} bytes, over the ${LIMIT} byte limit.`);
  failed = true;
}
for (const { f } of set) {
  const source = readFileSync(f, 'utf8');
  const found = PDF_MARKERS.filter(m => source.includes(m));
  if (found.length > 0) {
    console.error(`check:bundle: ${f} contains the PDF library (found ${found.map(m => `"${m}"`).join(', ')}). Load it with import() only.`);
    failed = true;
  }
}

// Every script in dist/assets, not only the start set.
for (const name of readdirSync(join(dist, 'assets')).filter(n => n.endsWith('.js'))) {
  const source = readFileSync(join(dist, 'assets', name), 'utf8');
  for (const { name: lib, marker } of UNUSED_LIBRARIES) {
    if (source.includes(marker)) {
      console.error(`check:bundle: dist/assets/${name} contains ${lib} (found "${marker}"). The build must stub it.`);
      failed = true;
    }
  }
}
process.exit(failed ? 1 : 0);

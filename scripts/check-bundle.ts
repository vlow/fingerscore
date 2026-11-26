// Checks the build against bundle-budget.json: the brotli size of the shell, of each route and of each lazy feature
// (scripts/bundle-layers/budget.ts), and that the shell holds only shell code. Also fails when the shell or a route holds
// the PDF library, or any file holds a library the build must stub. Run after `npm run build`.
// With --propose it prints limits from the measured sizes (shell plus 10 %, the rest plus 25 %) and checks nothing.
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { evaluate, propose, type Budget } from './bundle-layers/budget';
import type { LayerReport } from './bundle-layers/layers';

const DIST = 'dist';
const REPORT = join('build-report', 'layers.json');
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

let report: LayerReport;
try {
  report = JSON.parse(readFileSync(REPORT, 'utf8')) as LayerReport;
} catch {
  console.error(`check:bundle: no ${REPORT} found. Run npm run build first.`);
  process.exit(1);
}
const budget = JSON.parse(readFileSync('bundle-budget.json', 'utf8')) as Budget;

const all = new Set([...report.shell.files, ...Object.values(report.routes).flatMap(r => r.files), ...Object.values(report.features).flatMap(f => f.files)]);
const sizes: Record<string, { raw: number; brotli: number }> = {};
for (const f of all) {
  const bytes = readFileSync(join(DIST, f));
  sizes[f] = { raw: bytes.length, brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length };
}

const { rows, failures } = evaluate(report, sizes, budget);

if (process.argv.includes('--propose')) {
  console.log(JSON.stringify(propose(rows), null, 2));
  process.exit(0);
}

const header = ['layer', 'files', 'raw', 'brotli', 'limit', 'headroom'];
const cells = rows.map(r => [r.layer, String(r.files), String(r.raw), String(r.brotli), String(r.limit), String(r.limit - r.brotli)]);
const widths = header.map((h, i) => Math.max(h.length, ...cells.map(c => c[i].length)));
const line = (c: string[]) => c.map((x, i) => (i === 0 ? x.padEnd(widths[i]) : x.padStart(widths[i]))).join('  ');
console.log(line(header));
for (const c of cells) console.log(line(c));
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [`| ${header.join(' | ')} |`, `|${header.map((_, i) => (i === 0 ? ' --- ' : ' ---: ')).join('|')}|`, ...cells.map(c => `| ${c.join(' | ')} |`)];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Bundle budget (brotli bytes)\n\n${md.join('\n')}\n`);
}

for (const f of [...report.shell.files, ...Object.values(report.routes).flatMap(r => r.files)].filter(f => f.endsWith('.js'))) {
  const source = readFileSync(join(DIST, f), 'utf8');
  // All three: the About page names jsPDF and svg2pdf.js in its credits.
  if (PDF_MARKERS.every(m => source.includes(m))) failures.push(`${DIST}/${f} contains the PDF library (found ${PDF_MARKERS.map(m => `"${m}"`).join(', ')}). Load it with import() only.`);
}
// Every script in dist/assets, not only the layers.
for (const name of readdirSync(join(DIST, 'assets')).filter(n => n.endsWith('.js'))) {
  const source = readFileSync(join(DIST, 'assets', name), 'utf8');
  for (const { name: lib, marker } of UNUSED_LIBRARIES) {
    if (source.includes(marker)) failures.push(`${DIST}/assets/${name} contains ${lib} (found "${marker}"). The build must stub it.`);
  }
}

for (const f of failures) console.error(`check:bundle: ${f}`);
console.log(`check:bundle: ${rows.length} layers, ${failures.length === 0 ? 'all within budget' : `${failures.length} failure(s)`}.`);
process.exit(failures.length === 0 ? 0 : 1);

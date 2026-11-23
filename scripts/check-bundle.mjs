// Fails when the entry chunk (dist/assets/index-*.js) is missing or larger than 400 000 bytes.
import { readdirSync, statSync } from 'node:fs';

const LIMIT = 400_000;
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
console.log(`check:bundle: ${f} is ${bytes} bytes (limit ${LIMIT}).`);

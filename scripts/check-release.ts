/**
 * Fails while the owner's details hold a placeholder. Run by `npm run check:release`.
 * Takes an optional path to a details module (default src/content/operator.ts) that exports `operator`.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { placeholders, type Operator } from '../src/content/operator';

const file = resolve(process.argv[2] ?? 'src/content/operator.ts');
const mod = (await import(pathToFileURL(file).href)) as { operator: Operator };
const open = placeholders(mod.operator);

if (open.length === 0) {
  console.log("check:release: the owner's details are filled in.");
} else {
  for (const field of open) console.log(`check:release: still a placeholder: ${field}`);
  process.exitCode = 1;
}

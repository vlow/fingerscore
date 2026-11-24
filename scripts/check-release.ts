/**
 * Fails while the owner's details are incomplete. Run by `npm run check:release`.
 * Takes an optional path to a details module (default src/content/operator.ts) that exports `operator`.
 * Reports, one line per field: a placeholder, a missing or empty required value, or a value of the wrong type.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FIELDS, OPTIONAL, isPlaceholder } from '../src/content/operator';

const file = resolve(process.argv[2] ?? 'src/content/operator.ts');
const mod = (await import(pathToFileURL(file).href)) as { operator?: unknown };
const lines: string[] = [];

if (typeof mod.operator !== 'object' || mod.operator === null) {
  lines.push(`check:release: ${file} exports no operator.`);
} else {
  const operator = mod.operator as Record<string, unknown>;
  for (const [field, kind] of Object.entries(FIELDS)) {
    const value = operator[field];
    const entries = kind === 'lines' ? value : [value];
    if (value === undefined) lines.push(`check:release: missing or empty: ${field}`);
    else if (!Array.isArray(entries) || entries.some((e) => typeof e !== 'string') || (kind === 'text' && Array.isArray(value))) {
      lines.push(`check:release: wrong type: ${field}`);
    } else if (!OPTIONAL.has(field) && (entries.length === 0 || entries.some((e: string) => e.trim() === ''))) {
      lines.push(`check:release: missing or empty: ${field}`);
    } else if (entries.some((e: string) => isPlaceholder(e))) {
      lines.push(`check:release: still a placeholder: ${field}`);
    }
  }
}

if (lines.length === 0) {
  console.log("check:release: the owner's details are filled in.");
} else {
  for (const line of lines) console.log(line);
  process.exitCode = 1;
}

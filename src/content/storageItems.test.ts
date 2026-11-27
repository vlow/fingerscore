import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STORAGE_ITEMS } from './storageItems';

const SRC = join(__dirname, '..');
const KEY_PATTERN = /^fingerscore\.[A-Za-z0-9.]+$/;
const QUOTED = /(['"])(fingerscore\.[A-Za-z0-9.]+)\1/g;

// Literals that match the pattern and are not storage keys.
const NOT_KEYS: Record<string, string> = {
  'fingerscore.library.probe': 'a probe value written and removed at once; it holds no user data',
  'fingerscore.eu': 'the site address printed on the PDF (SITE in src/pdf/engine.ts), not a storage key',
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    // storageItems.ts is the list under test, not a place that stores anything.
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && e.name !== 'storageItems.ts' ? [p] : [];
  });
}

const found = new Map<string, string[]>(); // literal -> files that hold it
for (const file of sourceFiles(SRC)) {
  for (const m of readFileSync(file, 'utf8').matchAll(QUOTED)) {
    if (!KEY_PATTERN.test(m[2])) continue;
    found.set(m[2], [...(found.get(m[2]) ?? []), file]);
  }
}

/** The storage areas the code uses for a key: through its constant, or through the literal itself. */
function areasOf(key: string, file: string): Set<string> {
  const text = readFileSync(file, 'utf8');
  const names = [...text.matchAll(new RegExp(`const (\\w+) = '${key.replace(/\./g, '\\.')}'`, 'g'))].map(m => m[1]);
  const areas = new Set<string>();
  for (const ref of [`'${key}'`, ...names]) {
    const call = new RegExp(`(?:readJSON|writeJSON|readText|writeText|remove|probe)\\w*(?:<[^()]*>)?\\('(local|session)', ${ref.replace(/[.]/g, '\\.')}\\b`, 'g');
    for (const m of text.matchAll(call)) areas.add(m[1]);
  }
  return areas;
}

describe('STORAGE_ITEMS', () => {
  it('lists exactly the keys the code stores', () => {
    const keys = [...found.keys()].filter(k => !(k in NOT_KEYS));
    expect(keys.sort()).toEqual(STORAGE_ITEMS.map(i => i.key).sort());
  });

  it('excludes only literals that exist in the code', () => {
    for (const k of Object.keys(NOT_KEYS)) expect(found.has(k)).toBe(true);
  });

  it.each(STORAGE_ITEMS.map(i => [i.key, i] as const))('%s uses the storage it names', (key, item) => {
    const files = found.get(key) ?? [];
    expect(files).toHaveLength(1);
    expect([...areasOf(key, files[0])]).toEqual([item.where]);
  });

  it('gives every item a plain-words label', () => {
    for (const i of STORAGE_ITEMS) expect(i.label).toMatch(/^[a-z]/);
  });
});

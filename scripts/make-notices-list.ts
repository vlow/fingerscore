/**
 * Writes third-party-packages.json: every package whose code is in the production build, direct or indirect.
 * Run with `npm run notices`. `npm run notices -- --check` writes nothing and exits 1 when the committed file differs.
 *
 * The script runs Vite's build in memory (nothing reaches dist/) with one extra plugin. The plugin reads which modules
 * each chunk holds, maps every module under node_modules to its package and reads name, version and licence from
 * that package's package.json. The two fonts are assets, not code, so they come from a fixed list.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { build, type Plugin } from 'vite';

interface Entry { name: string; version: string; license: string }

const LIST_FILE = 'third-party-packages.json';
const FONT_PACKAGES = ['@fontsource/atkinson-hyperlegible', '@fontsource/bravura'];

/** The package directory of a module id under node_modules, or null (own code, virtual modules). */
function packageDir(id: string): string | null {
  const path = id.split('?')[0]!;
  const marker = '/node_modules/';
  const at = path.lastIndexOf(marker);
  if (at < 0 || path.startsWith('\0')) return null;
  const parts = path.slice(at + marker.length).split('/');
  const length = parts[0]!.startsWith('@') ? 2 : 1;
  return path.slice(0, at + marker.length) + parts.slice(0, length).join('/');
}

function readEntry(dir: string): Entry {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    license?: string | { type?: string };
    licenses?: { type?: string }[];
  };
  const license =
    typeof pkg.license === 'string' ? pkg.license
    : pkg.license?.type ?? pkg.licenses?.map(l => l.type).filter(Boolean).join(' OR ') ?? '';
  if (!license) throw new Error(`${pkg.name} ${pkg.version} names no licence in package.json`);
  return { name: pkg.name, version: pkg.version, license };
}

async function packagesInBuild(): Promise<Entry[]> {
  const dirs = new Set<string>(FONT_PACKAGES.map(name => join(process.cwd(), 'node_modules', name)));
  const collect: Plugin = {
    name: 'collect-packages',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;
        for (const [id, mod] of Object.entries(file.modules)) {
          const dir = mod.renderedLength > 0 ? packageDir(id) : null; // a module that tree-shaking removed leaves no code
          if (dir) dirs.add(dir);
        }
      }
    },
  };
  await build({ logLevel: 'warn', plugins: [collect], build: { write: false } });
  const byKey = new Map<string, Entry>();
  for (const dir of dirs) {
    if (!existsSync(join(dir, 'package.json'))) throw new Error(`no package.json in ${dir}`);
    const entry = readEntry(dir);
    byKey.set(`${entry.name}@${entry.version}`, entry);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'));
}

function describe(entries: Entry[]): Set<string> {
  return new Set(entries.map(e => `${e.name} ${e.version} (${e.license})`));
}

const check = process.argv.includes('--check');
const fresh = await packagesInBuild();
const text = `${JSON.stringify(fresh, null, 2)}\n`;

if (!check) {
  writeFileSync(LIST_FILE, text);
  console.log(`notices: wrote ${fresh.length} packages to ${LIST_FILE}.`);
} else {
  const committed = existsSync(LIST_FILE) ? readFileSync(LIST_FILE, 'utf8') : '';
  if (committed === text) {
    console.log(`notices: ${LIST_FILE} matches the build (${fresh.length} packages).`);
  } else {
    let old: Entry[] = [];
    try { old = JSON.parse(committed) as Entry[]; } catch { /* no usable committed file: everything is new */ }
    const was = describe(old);
    const now = describe(fresh);
    console.error(`notices: ${LIST_FILE} differs from the packages in the build. Run npm run notices and update THIRD-PARTY-NOTICES.md.`);
    for (const line of now) if (!was.has(line)) console.error(`  + ${line}`);
    for (const line of was) if (!now.has(line)) console.error(`  - ${line}`);
    process.exit(1);
  }
}

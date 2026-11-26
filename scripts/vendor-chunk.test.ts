// @vitest-environment node
import react from '@vitejs/plugin-react';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, type Plugin } from 'vite';
import { vendorChunking } from './vendor-chunk';

const [group] = vendorChunking.groups;

it('the group matches the shell packages and nothing else', () => {
  for (const id of ['/x/node_modules/react-dom/cjs/react-dom.production.js', '/x/node_modules/@remix-run/router/dist/router.js', '/x/node_modules/scheduler/index.js']) {
    expect(group.test.test(id), id).toBe(true);
  }
  for (const id of ['/x/node_modules/react-router-dom-extra/index.js', '/x/node_modules/jspdf/dist/jspdf.es.min.js', '/x/node_modules/zustand/esm/index.mjs', '/x/src/shell/App.tsx']) {
    expect(group.test.test(id), id).toBe(false);
  }
});

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** Builds the app into a fresh folder and returns the file names in its assets/. */
async function assets(extra: Plugin[] = []): Promise<string[]> {
  const outDir = mkdtempSync(join(tmpdir(), 'vendor-chunk-'));
  dirs.push(outDir);
  await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [react(), ...extra],
    build: { outDir, write: true, rolldownOptions: { output: { codeSplitting: vendorChunking } } },
  });
  return readdirSync(join(outDir, 'assets'));
}

it('an app change keeps the vendor file name', async () => {
  const before = await assets();
  const after = await assets([{
    name: 'change-the-footer',
    transform: (code, id) => (id.endsWith('src/shell/Footer.tsx') ? code.replace('© 2026', '© 2027') : null),
  }]);
  const named = (files: string[], prefix: string) => files.filter(f => f.startsWith(prefix) && f.endsWith('.js'));
  expect(named(before, 'vendor-')).toHaveLength(1);
  expect(named(after, 'vendor-')).toEqual(named(before, 'vendor-'));
  expect(named(after, 'index-')).not.toEqual(named(before, 'index-'));
}, 120_000);

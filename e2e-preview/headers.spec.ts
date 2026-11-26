import { readFileSync, existsSync, statSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ON_NGINX } from './base';

// The headers deploy/nginx/fingerscore-locations.conf sets. vite preview sets none of them, so these run on nginx only.
test.skip(!ON_NGINX, 'nginx only: set E2E_BASE_URL (CI job nginx, or README "Hosting")');

const layers = JSON.parse(readFileSync('build-report/layers.json', 'utf8')) as { shell: { files: string[] } };
const vendor = layers.shell.files.find(f => /^assets\/vendor-.*\.js$/.test(f))!;
const IMMUTABLE = 'public, max-age=31536000, immutable';

test('a hashed file with br', async ({ request }) => {
  const r = await request.get(`/${vendor}`, { headers: { 'Accept-Encoding': 'br' } });
  expect(r.status()).toBe(200);
  expect(r.headers()['content-encoding']).toBe('br');
  expect(r.headers()['vary']).toMatch(/Accept-Encoding/i);
  expect(r.headers()['cache-control']).toBe(IMMUTABLE);
  expect(r.headers()['content-type']).toMatch(/^(application|text)\/javascript/);
});

test('a hashed file with gzip', async ({ request }) => {
  const r = await request.get(`/${vendor}`, { headers: { 'Accept-Encoding': 'gzip' } });
  expect(r.headers()['content-encoding']).toBe('gzip');
  expect(r.headers()['cache-control']).toBe(IMMUTABLE);
});

test('br;q=0 gets gzip', async ({ request }) => {
  const r = await request.get(`/${vendor}`, { headers: { 'Accept-Encoding': 'gzip, br;q=0' } });
  expect(r.headers()['content-encoding']).toBe('gzip');
});

test('no Accept-Encoding gets the plain file', async ({ request }) => {
  const r = await request.get(`/${vendor}`, { headers: { 'Accept-Encoding': 'identity' } });
  expect(r.headers()['content-encoding']).toBeUndefined();
  expect((await r.body()).length).toBe(statSync(`dist/${vendor}`).size);
});

test('the app routes are index.html, no-cache, and 304 on revalidation', async ({ request }) => {
  for (const path of ['/', '/sheet']) {
    const r = await request.get(path);
    expect(r.status(), path).toBe(200);
    expect(r.headers()['content-type'], path).toMatch(/^text\/html/);
    expect(r.headers()['cache-control'], path).toBe('no-cache');
    const again = await request.get(path, { headers: { 'If-None-Match': r.headers()['etag'] } });
    expect(again.status(), path).toBe(304);
  }
});

test('index.html by name is no-cache', async ({ request }) => {
  expect((await request.get('/index.html')).headers()['cache-control']).toBe('no-cache');
});

test('a route with a trailing slash is the app', async ({ request }) => {
  const r = await request.get('/sheet/');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toMatch(/^text\/html/);
  expect(r.headers()['cache-control']).toBe('no-cache');
});

test('a missing chunk is a 404', async ({ request }) => {
  const r = await request.get('/assets/missing-abc123.js');
  expect(r.status()).toBe(404);
  expect(r.headers()['content-type'] ?? '').not.toMatch(/^text\/html/);
});

test('an unhashed file is cached for a day', async ({ request }) => {
  expect((await request.get('/favicon.svg')).headers()['cache-control']).toBe('public, max-age=86400');
});

test('the manifest keeps its type when compressed', async ({ request }) => {
  const r = await request.get('/manifest.webmanifest', { headers: { 'Accept-Encoding': 'br' } });
  expect(r.headers()['content-type']).toMatch(/^application\/manifest\+json/);
  if (existsSync('dist/manifest.webmanifest.br')) expect(r.headers()['content-encoding']).toBe('br');
});

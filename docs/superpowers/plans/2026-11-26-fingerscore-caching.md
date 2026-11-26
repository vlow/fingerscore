# Caching and Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Returning visitors download only what a deploy changed, every text file goes out precompressed, and one tested nginx configuration in the repository serves the app.

**Architecture:** A Rolldown code-splitting group puts React, React DOM and the router into a `vendor` chunk whose name changes only with those packages. A build plugin writes `.br` and `.gz` copies of every text file and a list of the release's asset files. `deploy/nginx/` holds the location rules, included by the production server block and by a CI server block. A new CI job runs the production end-to-end suite and a header test against nginx. A prune script removes old assets that no release of the last 30 days names.

**Tech Stack:** Vite 8 (Rolldown), `node:zlib`, nginx with `ngx_brotli` (`libnginx-mod-http-brotli-static`), bash, Playwright, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-26-fingerscore-caching-design.md`

## Global Constraints

- No new npm dependency. Compression uses `node:zlib`: brotli `BROTLI_PARAM_QUALITY: 11`, gzip `level: 9`.
- Compressed extensions: `.js`, `.css`, `.html`, `.svg`, `.json`, `.txt`, `.webmanifest`, `.mid`, `.ttf`. A compressed copy is written only when it is at most 95 % of the original's size.
- Vendor group packages, exactly: `react`, `react-dom`, `scheduler`, `react-router`, `react-router-dom`, `@remix-run/router`.
- `Cache-Control` values, verbatim: `/assets/` → `public, max-age=31536000, immutable`; `index.html` and the history fallback → `no-cache`; other files → `public, max-age=86400`.
- A missing file under `/assets/` answers 404, never `index.html`.
- Old asset files stay on the server for 30 days after the last release that named them.
- nginx packages come from Ubuntu's own archive; no third-party image or PPA.
- Prose in README and docs follows the owner's writing standards: short sentences, numbers over vague words.
- Zero open SonarCloud issues before the branch is called ready (`CLAUDE.md`).

## Review Focus

1. `Accept-Encoding: gzip, br;q=0` must not get brotli. → Task 3, header test `br;q=0 gets gzip`.
2. `/sheet/` (trailing slash) returns `index.html` with `no-cache`, not a 403 or a directory listing. → Task 3, header test `a route with a trailing slash is the app`.
3. `/index.html` requested directly has `no-cache`, like `/`. → Task 3, header test `index.html by name is no-cache`.
4. The manifest goes out as `application/manifest+json`, also when served from its `.br` copy. → Task 3, header test `the manifest keeps its type when compressed`.
5. A file the current release still uses is never pruned, however old it is (the vendor chunk can stay unchanged for months). → Task 4, test `keeps an old file the newest release names`.

---

### Task 1: The vendor chunk

**Files:**
- Create: `scripts/vendor-chunk.ts`, `scripts/vendor-chunk.test.ts`
- Modify: `vite.config.ts` (`build.rolldownOptions.output.codeSplitting`)

**Interfaces:**
- Produces: `export const VENDOR_PACKAGES: readonly string[]` (the six packages) and `export const vendorChunking: { groups: { name: 'vendor'; test: RegExp }[] }`. The `RegExp` matches a module ID whose last `node_modules/` segment is one of `VENDOR_PACKAGES` (scoped names included) and nothing else.

- [ ] **Step 1: Write the failing tests** in `scripts/vendor-chunk.test.ts` (`// @vitest-environment node`):
  - `the group matches the shell packages and nothing else`: `test` matches `/x/node_modules/react-dom/cjs/react-dom.production.js`, `/x/node_modules/@remix-run/router/dist/router.js` and `/x/node_modules/scheduler/index.js`. It does not match `/x/node_modules/react-router-dom-extra/index.js`, `/x/node_modules/jspdf/dist/jspdf.es.min.js`, `/x/node_modules/zustand/esm/index.mjs` or `/x/src/shell/App.tsx`.
  - `an app change keeps the vendor file name` (timeout 120 s): run `build()` from `vite` twice with `configFile: false`, `logLevel: 'silent'`, `build.write: true`, `build.outDir` a fresh temp folder each time, `plugins: [react()]` and `build.rolldownOptions.output.codeSplitting: vendorChunking`. The second build adds a plugin whose `transform` replaces `© 2026` with `© 2027` in `src/shell/Footer.tsx`. Expect one `vendor-*.js` in each `assets/`, with the same name. Expect the `index-*.js` names to differ.
- [ ] **Step 2: Run** `npx vitest run scripts/vendor-chunk.test.ts`. Expected: FAIL, `Cannot find module './vendor-chunk'`.
- [ ] **Step 3: Implement** `scripts/vendor-chunk.ts`. Then set `build.rolldownOptions.output.codeSplitting = vendorChunking` in `vite.config.ts`.
- [ ] **Step 4: Run** `npx vitest run scripts/vendor-chunk.test.ts`. Expected: PASS.
- [ ] **Step 5: Run** `npm run build && npm run check:bundle`. Expected:
  - `build-report/layers.json` lists `assets/vendor-*.js` in `shell.files`;
  - `shell.outside` is `[]`;
  - the shell row stays within ±1 % of 55,230 bytes brotli, within its 61,440 limit.

  Record the new vendor and index sizes in the task report.
- [ ] **Step 6: Run** `npm test && npm run test:e2e:preview`. Expected: PASS.
- [ ] **Step 7: Commit** `feat: React, React DOM and the router in a vendor chunk whose name only their versions change`.

### Task 2: Precompressed files and the release list

**Files:**
- Create: `scripts/precompress/precompress.ts`, `scripts/precompress/precompress.test.ts`
- Modify: `vite.config.ts` (add the plugin after `bundleLayers()`), `.gitignore` (nothing new; `build-report/` is already ignored)

**Interfaces:**
- Produces, from `scripts/precompress/precompress.ts`:
  - `export const COMPRESSED_EXTENSIONS: readonly string[]` (Global Constraints list)
  - `export function shouldCompress(path: string): boolean`: by extension, case-sensitive, and never for a path ending in `.br` or `.gz`.
  - `export function compressedCopies(bytes: Uint8Array): { br: Buffer | null; gz: Buffer | null }`: each `null` when it would be more than 95 % of `bytes.length`.
  - `export function precompress(): Plugin` (`apply: 'build'`). In `closeBundle`, when `config.build.write` is not `false`, it walks `config.build.outDir` and writes `<file>.br` and `<file>.gz` beside each file that `shouldCompress` accepts. Then it writes `build-report/release-files.txt`: one path per line, relative to `outDir`, every file under `assets/` (compressed copies included), sorted with `localeCompare`.
  - The guard matters: `scripts/make-notices-list.ts` runs Vite's build in memory (`write: false`), and the plugin must not touch `dist/` then.

- [ ] **Step 1: Write the failing tests** in `scripts/precompress/precompress.test.ts` (`// @vitest-environment node`):
  - `shouldCompress`: `true` for `assets/index-x.js`, `index.html`, `manifest.webmanifest`, `demo/Auld_Lang_Syne.mid`, `assets/a.ttf`. `false` for `assets/a.woff2`, `icon-192.png`, `favicon.ico`, `assets/index-x.js.br`, `assets/index-x.js.gz`.
  - `compressedCopies round-trips`: 20,000 bytes of repeated text give a `br` that `brotliDecompressSync` turns back into the input, and a `gz` that `gunzipSync` turns back into it.
  - `compressedCopies skips what does not shrink by 5 %`: 4,096 random bytes from `crypto.randomBytes` give `{ br: null, gz: null }`.
  - `the plugin writes copies and the release list`: create a temp `outDir` with `assets/a.js` (text, 10 KB), `assets/b.woff2` (random, 2 KB) and `index.html`. Call the plugin's `configResolved` with `{ build: { outDir, write: true }, root: tempRoot }`, then `closeBundle`. Expect:
    - `assets/a.js.br`, `assets/a.js.gz`, `index.html.br` exist, and `assets/b.woff2.br` does not;
    - `tempRoot/build-report/release-files.txt` equals `assets/a.js\nassets/a.js.br\nassets/a.js.gz\nassets/b.woff2\n`.
  - `the plugin does nothing for an in-memory build`: the same with `write: false` creates no file.
- [ ] **Step 2: Run** `npx vitest run scripts/precompress`. Expected: FAIL, missing module.
- [ ] **Step 3: Implement** `precompress.ts` and register `precompress()` in `vite.config.ts`.
- [ ] **Step 4: Run** `npx vitest run scripts/precompress`. Expected: PASS.
- [ ] **Step 5: Run** `npm run build`. Expected: `dist/assets/` holds a `.br` and a `.gz` for each `.js` and `.css` file. `ls dist/assets/*.woff2.*` finds nothing. `build-report/release-files.txt` exists. Then `npm run check:bundle && npm run notices -- --check`. Expected: PASS; the notices run leaves `dist/` unchanged (compare `ls -R dist | md5` before and after).
- [ ] **Step 6: Commit** `feat: the build writes brotli and gzip copies of every text file and lists the release's assets`.

### Task 3: nginx configuration, tested against the production suite

**Files:**
- Create: `deploy/nginx/fingerscore-locations.conf`, `deploy/nginx/fingerscore.conf`, `deploy/nginx/ci.conf`, `e2e-preview/headers.spec.ts`
- Modify: `playwright.preview.config.ts`, `e2e-preview/pdf-preview.spec.ts:16`, `.github/workflows/ci.yml` (upload `dist` and `build-report` from `build`; new job `nginx`; `trivy` then needs `[build, nginx]`)

**Interfaces:**
- `fingerscore-locations.conf`: location blocks only, no `server`, no `root`, so both server blocks include it. It holds:
  - the three `Cache-Control` rules (Global Constraints);
  - `brotli_static on; gzip_static on; gzip_vary on;`;
  - `try_files $uri =404` under `/assets/`, and `try_files $uri $uri/ /index.html` elsewhere;
  - a `types` addition for `application/manifest+json webmanifest`.

  `add_header` inside a location replaces inherited ones, so each location sets its own `Cache-Control`.
- `fingerscore.conf`: `server` on 443 with TLS, `server_name`, `root` and certificate paths as `# TODO:` placeholders. It includes the locations file. A comment names the `brotli_static` line to drop on a server without `ngx_brotli`.
- `ci.conf`: `server` on `127.0.0.1:8080`, `root` from an `envsubst` placeholder `${DIST}`, including the same locations file.
- `playwright.preview.config.ts`: `baseURL` is `process.env.E2E_BASE_URL ?? 'http://localhost:4179'`. When `E2E_BASE_URL` is set, there is no `webServer`. `pdf-preview.spec.ts:16` compares against that same base URL, not a literal.
- `e2e-preview/headers.spec.ts` runs only when `E2E_BASE_URL` is set (`test.skip(!process.env.E2E_BASE_URL, 'nginx only')`). It reads the shell's JS file name from `build-report/layers.json`.

- [ ] **Step 1: Write `e2e-preview/headers.spec.ts`**, using `request.get` with explicit headers:
  - `a hashed file with br`: `Accept-Encoding: br` → status 200, `content-encoding: br`, `vary` contains `Accept-Encoding`, `cache-control` = `public, max-age=31536000, immutable`, `content-type` starts with `application/javascript` or `text/javascript`.
  - `a hashed file with gzip`: `Accept-Encoding: gzip` → `content-encoding: gzip`.
  - `br;q=0 gets gzip`: `Accept-Encoding: gzip, br;q=0` → `content-encoding: gzip`.
  - `no Accept-Encoding gets the plain file`: `Accept-Encoding: identity` → no `content-encoding`; the body length equals the file in `dist/`.
  - `the app routes are index.html, no-cache, and 304 on revalidation`: for `/` and `/sheet`, status 200, `content-type` `text/html`, `cache-control` `no-cache`. A second request with `If-None-Match` set to the first `etag` → 304.
  - `index.html by name is no-cache`: `/index.html` → `cache-control` `no-cache`.
  - `a route with a trailing slash is the app`: `/sheet/` → 200, `text/html`.
  - `a missing chunk is a 404`: `/assets/missing-abc123.js` → 404, `content-type` not `text/html`.
  - `an unhashed file is cached for a day`: `/favicon.svg` → `cache-control` `public, max-age=86400`.
  - `the manifest keeps its type when compressed`: `/manifest.webmanifest` with `Accept-Encoding: br` → `content-type` starts with `application/manifest+json`. `content-encoding` is `br` if `dist/manifest.webmanifest.br` exists (the 5 % rule may skip it).
- [ ] **Step 2: Run** `npm run build && npm run test:e2e:preview`. Expected: the header tests are skipped (no `E2E_BASE_URL`); the 6 existing tests pass.
- [ ] **Step 3: Write the three config files.** `ci.conf` has three `envsubst` placeholders: `${LISTEN}` (the `listen` address), `${DIST}` (the `root`) and `${REPO}` (the repository path, for `include ${REPO}/deploy/nginx/fingerscore-locations.conf`). Run nginx locally in Docker with the packages CI installs:

  ```
  docker run --rm -d --name fs-nginx -p 8080:8080 -v "$PWD:/repo:ro" ubuntu:24.04 bash -c "apt-get update -qq && apt-get install -y -qq nginx libnginx-mod-http-brotli-static gettext-base >/dev/null && LISTEN=0.0.0.0:8080 DIST=/repo/dist REPO=/repo envsubst '\$LISTEN \$DIST \$REPO' < /repo/deploy/nginx/ci.conf > /etc/nginx/sites-enabled/default && nginx -t && nginx -g 'daemon off;'"
  ```

  Expected: `docker logs fs-nginx` ends with `test is successful`, and `curl -sI localhost:8080/` returns 200.
- [ ] **Step 4: Run** `E2E_BASE_URL=http://localhost:8080 npm run test:e2e:preview`. Expected: all header tests and the 6 production tests PASS against nginx. If `libnginx-mod-http-brotli-static` is missing from Ubuntu 24.04's archive, stop. Record a ruling and ask; do not add a PPA.
- [ ] **Step 5: Add the CI job** `nginx`, `needs: build`:
  - checkout and `npm ci --ignore-scripts`;
  - download the `dist` and `build-report` artifacts, which the `build` job uploads with `retention-days: 1`;
  - `sudo apt-get install -y nginx libnginx-mod-http-brotli-static gettext-base`;
  - render `ci.conf` with `LISTEN=127.0.0.1:8080`, `DIST=$PWD/dist` and `REPO=$PWD` into `/etc/nginx/sites-enabled/default`, then `sudo nginx -t` and `sudo systemctl restart nginx`;
  - install Playwright's Chromium;
  - `E2E_BASE_URL=http://127.0.0.1:8080 npm run test:e2e:preview`.

  Pin every action to the commit the other jobs use.
- [ ] **Step 6: Stop the container** (`docker stop fs-nginx`) and **commit** `feat: nginx configuration in deploy/nginx, tested in CI with the production end-to-end suite and a header test`.

### Task 4: Pruning old assets

**Files:**
- Create: `deploy/prune-assets.sh`, `scripts/prune-assets.test.ts`

**Interfaces:**
- Usage: `deploy/prune-assets.sh <site-root> <releases-dir> [days=30]`.
- `<releases-dir>` holds one `release-files.txt` copy per deploy, named `<UTC timestamp>.txt`, as in Task 5's README steps.
- The script deletes each file under `<site-root>/assets/` that no release list of the last `days` days names, and never one the newest list names. Then it deletes release lists older than `days`, except the newest. It prints each deleted path. With `--dry-run` as the first argument, it prints them and deletes nothing.
- Age is the release list's file modification time. Asset files' own times are never used: an unchanged vendor file keeps its first upload time for months.

- [ ] **Step 1: Write the failing tests** in `scripts/prune-assets.test.ts` (`// @vitest-environment node`). Each test builds a temp site and releases folder, sets list ages with `utimesSync`, and runs the script with `spawnSync('bash', [...])`.
  - `deletes a file only an old release names`: list 40 days old names `assets/old.js`; newest list names `assets/new.js`; both files exist. `old.js` is gone, `new.js` stays, and the old list is gone.
  - `keeps an old file the newest release names`: `assets/vendor-x.js` with an mtime 200 days ago, named by the newest list → stays.
  - `keeps a file a release of the last 30 days names`: list 10 days old names `assets/mid.js` → stays.
  - `keeps the newest list even when it is old`: the only list is 90 days old → it and its files stay.
  - `--dry-run deletes nothing`: the first case with `--dry-run` prints `assets/old.js` and leaves both files.
  - `refuses a site root without assets/`: exit status 2, nothing deleted.
- [ ] **Step 2: Run** `npx vitest run scripts/prune-assets.test.ts`. Expected: FAIL (script missing, exit 127).
- [ ] **Step 3: Implement** `deploy/prune-assets.sh` (`set -euo pipefail`; POSIX `find`, `sort`, `comm`; no GNU-only flags, so it also runs on macOS for the test).
- [ ] **Step 4: Run** `npx vitest run scripts/prune-assets.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: deploy/prune-assets.sh removes assets no release of the last 30 days names`.

### Task 5: Docs and the spec's correction

**Files:**
- Modify: `README.md` ("Hosting" and "Server rule for history routing"), `docs/superpowers/specs/2026-11-26-fingerscore-caching-design.md` (5.4)

- [ ] **Step 1: Rewrite the README's server sections** as one "Hosting" section:
  - **Install:** `apt install nginx libnginx-mod-http-brotli-static`, and the line to drop without the module.
  - **Configure:** copy `deploy/nginx/fingerscore.conf`, fill the `TODO:` placeholders, include the locations file.
  - **Deploy, three commands, each in its own `bash` block:**
    1. `rsync -r --checksum dist/ <host>:<site-root>/`, without `--delete`;
    2. copy `build-report/release-files.txt` to `<releases-dir>/$(date -u +%Y%m%dT%H%M%SZ).txt`;
    3. run `deploy/prune-assets.sh <site-root> <releases-dir>`.
  - **Cloudflare (optional):** leave Browser Cache TTL at "Respect Existing Headers". Then the live checklist:
    - `curl -sI -H 'Accept-Encoding: br' https://<domain>/assets/<vendor file>` shows `cf-cache-status: HIT` on the second request, `content-encoding: br` and the `immutable` header;
    - `/` shows `cf-cache-status: DYNAMIC` or `BYPASS`;
    - read the free plan's current bandwidth terms.

  Remove the old `try_files $uri /index.html;` advice: the config replaces it.
- [ ] **Step 2: Correct the spec's 5.4.** Pruning by file age would delete a vendor file that stayed unchanged for 30 days; the prune works from the release lists instead (Task 4).
- [ ] **Step 3: Run the full chain:** `npm run build && npm run check:bundle && npm run notices -- --check && npm test && npm run test:e2e && npm run test:e2e:preview`. Expected: all PASS.
- [ ] **Step 4: Commit** `docs: hosting with nginx, the deploy and prune steps, and an optional Cloudflare checklist`.
- [ ] **Step 5: Push, then run the Sonar loop of `CLAUDE.md`** until `SONAR_BRANCH=<branch> node scripts/check-sonar.mjs` prints `no open issues`.

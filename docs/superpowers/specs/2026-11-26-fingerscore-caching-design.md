# Caching and delivery: design

**Purpose.** A visitor downloads the app once and then only what a deploy changed. The server sends every file in its smallest form and never sends a file the browser already has. This note is for the owner, whose decisions are in section 7, and for the builder. It follows the bundle layers (`2026-11-25-fingerscore-bundle-layers-design.md`), which cut the first download to 55 KB brotli.

## 1. Goals

- A returning visitor after an unchanged deploy downloads `index.html` at most (a 304 when it is unchanged).
- A deploy that changes only app code leaves React, React DOM and the router at the same file name, so returning visitors keep them. A dependency change can still rename it (5.1).
- Every text file goes out precompressed: brotli at quality 11 when the browser accepts it, else gzip at level 9. The server compresses nothing at request time.
- One nginx configuration in the repository serves the app: cache headers, precompressed files, the history fallback. CI tests that configuration, not a stand-in.
- The same setup works unchanged behind Cloudflare's free plan, and without it.
- A tab opened before a deploy can still load the chunks it asks for afterwards.

## 2. Non-goals

- Service worker and offline use (proposal step 5).
- Per-instrument fingering data (step 3). Prerendered HTML (step 6).
- TLS, the domain, security headers (CSP, HSTS). They belong to the server's own configuration, not to this app's.
- A deploy pipeline. CI still publishes nothing; the README describes the copy step.

## 3. Today

Measured on 26 Nov 2026 after `vite build`:

| What | Raw | Brotli 11 | gzip -9 | gzip -1 (nginx default) |
|---|---|---|---|---|
| Shell JS, `index-*.js` (app shell, React DOM, router) | 170,017 | 48,943 | 55,772 | 65,156 |
| All JS and CSS in `dist/assets` | | 391,200 | | |
| Fonts for the page, 8 `woff2` files | 109,980 | already compressed | | |
| Fonts for the PDF, `ttf` (example: Regular latin) | 23,964 | 12,903 | | |

Brotli 11 sends the shell 25 % smaller than nginx's default gzip.

- **Shell file name:** React DOM lives inside the shell's `index-*.js`. Any change to `src/shell/` gives that file a new name, so returning visitors download React again: about 37 KB brotli each time.
- **Compression and headers:** the repository has no server configuration. The README asks only for the history fallback (`try_files $uri /index.html`). Stock nginx sends no cache headers and compresses with gzip at level 1 by default, and only `text/html` unless `gzip_types` says more.

## 4. Approaches

1. **Precompressed files and nginx's static modules (chosen).** The build writes `x.js.br` and `x.js.gz` next to each text file. nginx sends them with `brotli_static` (module `ngx_brotli`) and `gzip_static` (built in). Cost: one nginx module, packaged by Debian and Ubuntu as `libnginx-mod-http-brotli-static`.
2. **Compression at request time in nginx.** No build step. Rejected: it costs CPU on every request, and quality 11 is too slow to run per request. At nginx's default gzip level the shell goes out at 65,156 bytes instead of 48,943.
3. **Leave compression to Cloudflare.** Rejected as the only answer: the owner's nginx must work alone, and Cloudflare's edge compresses on its own terms.

## 5. Design

### 5.1 A stable vendor file

`vite.config.ts` sets `build.rolldownOptions.output.codeSplitting.groups` with one group, `vendor`. It matches the shell's packages only: `react`, `react-dom`, `scheduler`, `react-router`, `react-router-dom`, `@remix-run/router`. A group that matched all of `node_modules` would pull jsPDF and the file readers into the shell.

The vendor chunk imports no app code, so a change to the app's own code leaves its name as it is. It does import Rolldown's runtime chunk, which holds the helpers the whole build uses, so its name also changes when another dependency brings or drops a helper (adding or removing jszip, a MIDI library) and with an upgrade of Rolldown, Vite or the React plugin. Those changes are rare; a full fix is outside what code-splitting groups allow. `vendor-*.js` joins the shell layer of `bundle-layers`; the shell budget is unchanged, because the bytes only move between files.

A test builds twice, with a one-line change in `src/shell/Footer.tsx` in between, and checks that `vendor-*.js` keeps its name and `index-*.js` changes.

### 5.2 Precompressed files

A build plugin, `precompress` in `scripts/precompress/`, runs in `writeBundle`. It uses no new dependency, only `node:zlib`. For every file in `dist/` ending in `.js`, `.css`, `.html`, `.svg`, `.json`, `.txt`, `.webmanifest`, `.mid` or `.ttf`, it writes:

- `<file>.br`: brotli, quality 11;
- `<file>.gz`: gzip, level 9.

It skips a file when its compressed form would save less than 5 %. `woff2`, `png` and `ico` are already compressed and get no copy.

`check:bundle` keeps measuring brotli quality 11, which now matches the bytes actually served.

### 5.3 nginx

`deploy/nginx/fingerscore.conf` is a `server` block for the owner's site, with the domain, certificates and `root` as placeholders. It contains:

| Location | `Cache-Control` | Notes |
|---|---|---|
| `/assets/` | `public, max-age=31536000, immutable` | Hashed names; a changed file has a new name. `try_files $uri =404`: a missing chunk is a 404, never `index.html`. |
| `/index.html` and the history fallback | `no-cache` | The browser revalidates each visit; an unchanged file costs a 304. |
| Other files in `public/` (icons, manifest, the demo MIDI, the notices) | `public, max-age=86400` | Not hashed: a changed icon shows within a day. |

For every location: `brotli_static on; gzip_static on; gzip_vary on;` (`Vary: Accept-Encoding`, so caches keep the forms apart). `etag on` (the default) for the 304s. The history fallback: `try_files $uri /index.html`. No `$uri/`: a folder such as `/demo/` would answer 403 instead of the app.

For a server without `ngx_brotli`, the file names the one line to drop. nginx then sends gzip only.

### 5.4 Tabs open across a deploy

A tab loaded before a deploy still runs the old `index.html` and asks for the old chunk names. If the deploy deleted them, the tab shows the reload notice. The README's copy step keeps old hashed files: `rsync` without `--delete`, then `deploy/prune-assets.sh`. The build lists each release's files (`build-report/release-files.txt`), and each deploy keeps that list. The prune deletes a file only when no list of the last 30 days names it, and never one the newest list names. Pruning by the files' own age would delete a vendor file that stayed unchanged for 30 days while every page still needs it. Old files cost disk space only. Nobody downloads them except a tab that needs them.

### 5.5 Behind Cloudflare's free plan

Nothing in the repository changes. From Cloudflare's documentation (26 Nov 2026):

- **Caching:** the free plan caches by file extension, including `.js`, `.css` and the fonts. It does not cache HTML unless a rule says so. It honours the origin's `Cache-Control` by default. So `/assets/` stays at Cloudflare's edge for a year, and `index.html` goes to nginx, which answers 304.
- **Terms:** Cloudflare's CDN terms restrict video and other large files, not a website's scripts, styles and fonts.

The README's Hosting section gets the settings to leave as they are (Browser Cache TTL: "Respect Existing Headers") and one caution. With Cloudflare in front, origin egress drops to `index.html` revalidations and each new file's first request per Cloudflare location.

Not confirmed from the documentation: whether Cloudflare passes nginx's quality-11 brotli through or recompresses at its edge, and the free plan's bandwidth terms. Both are checked in a live test once the domain exists (section 7).

### 5.6 Tests

- **Unit, `scripts/precompress/`:** the file selection (which extensions; the 5 % rule), and that a written `.br` and `.gz` decompress to the original.
- **Build:** the vendor-name test of 5.1.
- **CI, a new job `nginx`** after `build`:
  - it installs `nginx` and `libnginx-mod-http-brotli-static` from Ubuntu's packages;
  - it serves the build's `dist/` with `deploy/nginx/fingerscore.conf` (placeholders filled for localhost, no TLS);
  - it runs the production end-to-end suite (`e2e-preview/`) against it instead of `vite preview`, plus `e2e-preview/headers.spec.ts`.
- **`headers.spec.ts`:**
  - a hashed JS file with `Accept-Encoding: br` comes back with `Content-Encoding: br`, `Vary: Accept-Encoding` and the year-long `immutable` header;
  - with `Accept-Encoding: gzip` it comes back as `gzip`; without either, uncompressed;
  - `/` and `/sheet` return `index.html` with `no-cache`; a second request with `If-None-Match` gets a 304;
  - `/assets/missing.js` is a 404, not `index.html`;
  - `/favicon.svg` has `max-age=86400`.

## 6. Builder's calls

- **Vendor group:** the same package list as the shell allowlist of `bundle-layers`, minus `zustand` (about 1 KB, and the theme store needs it in the shell anyway) and the font package (CSS only).
- **Precompression level:** brotli 11 and gzip 9: the build pays once, every visitor saves.
- **The 5 % rule:** keeps near-incompressible files from doubling on disk for no gain.
- **Missing chunks:** `/assets/` answers a missing file with 404, not with the history fallback. Today's README rule (`try_files $uri /index.html` everywhere) sends HTML for a missing chunk. The browser then reports a MIME error instead of a failed load, and the reload notice still shows, but the error in the log is misleading.
- **CI test target:** the nginx job reuses the production suite. Every page that test visits then goes through the real headers.

## 7. Owner's decisions (26 Nov 2026)

1. **Unhashed files in `public/`:** `max-age=86400` (one day). Rejected alternative: `no-cache`, always fresh at one 304 per file and visit.
2. **Keeping old chunks:** 30 days after the deploy that replaced them. A tab left open longer gets the reload notice.
3. **Cloudflare:** optional and not part of this change. If it is added, a live check confirms the two unknowns in 5.5. That check is a README checklist, not code.

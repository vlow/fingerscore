# Bundle layers: design

**Purpose.** The bundle budget allows 410,000 raw bytes for everything that loads at start. The build uses 409,079. Each new feature on the start or sheet page breaks the budget, and the fix so far has been to carve one feature into its own chunk. This note replaces that cycle with a structure: a small shell that every visitor downloads, one chunk per route, lazy features inside a route, and a budget for each layer measured in compressed bytes. It is written for the owner, whose decisions are in section 7, and for the builder.

## 1. Goals

- New code lands in a lazy chunk unless someone deliberately puts it in the shell.
- A static import that drags route or feature code into the shell fails CI and names the import chain.
- The budget measures brotli bytes, per layer: shell, each route, each lazy feature.
- A cold load of any URL downloads the shell and that route's chunks in parallel, with no blank frame between header and content.
- Splitting a feature into its own chunk takes one declaration.

## 2. Non-goals

- Fingering and glyph data as fetched JSON (proposal step 3).
- Cache headers, precompression, CDN, vendor chunk (step 4).
- Service worker (step 5). Prerendered HTML (step 6).
- Replacing React or the router.
- Size deltas against `main` in CI. CI runs on push, not on pull requests, and has no baseline build to compare with.

## 3. Today

Measured on 25 Nov 2026, `vite build`, brotli quality 11:

| Start-set chunk | Raw | Brotli | Holds |
|---|---|---|---|
| `index` | 204 KB | 63 KB | Shell, start page, sheet page, store, router, glyphs |
| `react-dom` | 133 KB | 37 KB | |
| `fingerings` | 55 KB | 8 KB | All instruments' tables |
| five small chunks | 17 KB | 7 KB | |
| `index.css` | 49 KB | 8 KB | Global styles and the CSS modules of both pages |
| **Total** | **458 KB** | **124 KB** | |

`check:bundle` counts the JS only: 409 KB raw.

Two static paths pull page code into the start set:

- `App.tsx` imports `Start` and `SheetPage` directly.
- `main.tsx` calls `hydrate()` from `state/store.ts`. The store imports `domain/persistence.ts`, which imports `domain/fingerings.ts` and with it every fingering table. No shell component reads the store; only pages do.

## 4. Approaches

1. **Folder layers with a build-output check (chosen).** Shell code lives in `src/shell/`. A Vite plugin records which modules end up in which layer. `check:bundle` fails when the shell holds a module outside `src/shell/` and an allowlist of packages and three files. The rule holds for any import, however indirect, because it checks the build output.
2. **Lint rule on import paths.** Catches a direct import from the shell into `src/pages/`, but misses an indirect one (shell → helper → store → fingerings). The repository has no ESLint today. Rejected.
3. **Keep one start-set budget and raise it.** No structural change; the cycle continues. Rejected.

## 5. Design

### 5.1 Shell

`src/shell/` holds what every page shows or needs before the first render:

- `main.tsx`, `App.tsx`, `routes.tsx`, `routePages.ts`, `lazy.ts` (5.3)
- Header, Footer, ThemeMenu, RadioMenu, icons, Toast, LoadBoundary, `loadFailed.ts`
- `theme.ts`, `storage.ts`

Three shell files stay where they are and are allowlisted by path: `src/styles/global.css` and `src/styles/tokens.css` (tests and comments name them), and `src/content/repository.ts` (the README tells the owner to edit it there).

Packages allowed in the shell: `react`, `react-dom`, `scheduler`, `react-router`, `react-router-dom`, `@remix-run/router`, `zustand`, `@fontsource/atkinson-hyperlegible` (CSS only).

Code outside the shell may import from it. The shell may import from outside only through `import()`.

Estimated shell from today's source maps: about 175 KB raw, 55 KB brotli, plus its CSS. The final number is measured after the change.

### 5.2 Routes

`src/shell/routePages.ts` is plain data, read by both the app and `vite.config.ts`:

```ts
export const ROUTE_PAGES = {
  '/': 'Start', '/sheet': 'SheetPage', '/tracks': 'Tracks', '/scales': 'Scales',
  '/terms': 'Terms', '/imprint': 'Imprint', '/privacy': 'Privacy', '/about': 'About',
} as const;
```

`src/shell/routes.tsx` maps each page name to its loader: `Record<PageName, () => Promise<…>>`. TypeScript then rejects a page without a loader and a loader without a page. Every route, `/` and `/sheet` included, loads through `import()`.

Pages that use the store load it with them. One shared `loadStore()` imports `state/store.ts` and calls `hydrate()` once; a route's loader awaits the page and `loadStore()` together. `hydrate()` keeps its current behaviour and leaves `main.tsx`. Unit tests that render a page directly and set the store themselves stay as they are.

**No waterfall on a cold load.** A plugin, `bundleLayers` in `vite.config.ts`, runs in `transformIndexHtml` (order `post`) with the output bundle. For each entry of `ROUTE_PAGES` it finds the chunk of `src/pages/<Name>.tsx` and collects the chunk's static imports and CSS, minus the shell's. It inlines a script in `<head>` before the entry:

```html
<script>(function(m){var p=m[location.pathname]||m["/"];…})({"/":[…],"/sheet":[…]})</script>
```

The script adds a `modulepreload` link per JS file and a `stylesheet` link per CSS file of the current route, each with `crossorigin` as Vite's own links have; without it the browser cannot reuse the preloaded response for the import. An unknown path preloads `/`, where the router sends it. Vite's preload helper skips any link whose `href` is already in the document, so no file loads twice.

**No blank frame.** `main.tsx` awaits the current route's loader before `createRoot().render()`. The files are already downloading, so the wait is their evaluation. `lazy.ts` (5.3) renders an already loaded module without suspending, so the first render shows the page at once. Later navigation suspends as the secondary pages do today, inside a `LoadBoundary`.

In development the plugin injects nothing; Vite serves modules on request.

### 5.3 Lazy modules and features

`src/shell/lazy.ts` replaces `chunkLoader`, the `lazy()` calls in `App.tsx`, `SheetPage.tsx` and `useEditPanelSlot.tsx`, and the ad hoc loaders in `pdf/request.ts` and `import/index.ts`:

```ts
interface LazyModule<V> {
  load(): Promise<V>;      // one request; a failure clears the cache, so the next load retries
  peek(): V | null;        // the value once loaded
  prefetch(): void;        // load and ignore a failure
}
function lazyModule<V>(load: () => Promise<V>): LazyModule<V>;
function useLazy<V>(m: LazyModule<V>, onReady?: () => void): { value: V | null; failed: boolean; request(): void };
function lazyView<P>(m: LazyModule<ComponentType<P>>, opts?: { compact?: boolean }): ComponentType<P>;
function intentProps(...ms: LazyModule<unknown>[]): { onPointerEnter(): void; onFocus(): void };
```

- `useLazy` keeps the contract of today's `chunkLoader`: `request`, `onReady`, `failed`.
- `lazyView` renders `peek()` directly when loaded. Otherwise it renders inside `Suspense` and `LoadBoundary`, `compact` for a part of a page.
- `intentProps` prefetches on pointer or keyboard focus.

Splitting a new feature then takes one line: `const Panel = lazyView(lazyModule(() => import('./Panel')))`.

**Prefetch policy.** Default: on intent, no idle prefetch. A prefetch on idle downloads code for every visitor whether they use it or not, which costs egress. First assignments:

| Module | Prefetch on |
|---|---|
| Route chunks | Pointer or focus on a link to the route (Header nav, Footer, gallery cards) |
| Edit panels | Focus on the mode switch (today: the mode change itself) |
| Play mode | Play-mode control focus |
| PDF engine | Focus on a PDF button |
| Parsers | None; the file type is unknown until a file is chosen |

### 5.4 Budget and check

`bundleLayers` also writes `build-report/layers.json` (outside `dist/`, git-ignored) in `generateBundle`:

- `shell`: the entry chunk and its static imports, with every module ID in them.
- `routes[path]`: the route page's chunk and its static imports, minus the shell.
- `features[name]`: each other dynamic entry and its static imports, minus the shell and minus the chunks of every route that imports it.
- For each shell module outside the allowlist: one import chain from the entry, built from `getModuleInfo().importers`.

`scripts/check-bundle.ts` (now run with `tsx`, like the other scripts) reads the report and the files in `dist/`. It compresses each with brotli quality 11 and sums JS and CSS per layer. It compares the sums with `bundle-budget.json`:

```json
{ "shell": 0, "routeDefault": 0, "featureDefault": 0, "routes": {}, "features": {} }
```

Zeros are placeholders until the measurement in section 7. `routes` and `features` hold named exceptions to the defaults (the PDF engine, the ABC and MuseScore parsers).

It fails when:

- a layer is over its limit;
- the shell holds a module outside `src/shell/` and the allowlist (the chain is printed);
- the shell or a route holds the PDF library (today's markers);
- any chunk holds html2canvas, dompurify or canvg (unchanged).

It prints one table: layer, files, raw, brotli, limit, headroom. In CI the same table goes to `$GITHUB_STEP_SUMMARY`.

### 5.5 Tests

- **Unit:** `lazy.ts`: one request per module, retry after a failure, `peek` after load, `prefetch` swallows a failure. The layer computation in `check-bundle.ts` against a hand-made graph, including a chain report.
- **Unit, changed:** App routing tests wait for the page (`findBy…`), since `/` and `/sheet` now load lazily.
- **End-to-end on the production build (`e2e-preview/`):**
  - A cold load of `/` requests no chunk that only `/sheet` uses.
  - A cold load of `/sheet` has the route's `modulepreload` links in `<head>` before the entry script.
  - A cold load of `/sheet` never renders the empty route fallback (an init script watches `main` with a `MutationObserver`).
  - A route chunk that fails to load shows the reload notice; Header and Footer stay.
- All existing tests pass unchanged apart from moved import paths.

## 6. Builder's calls

- Pages stay in `src/pages/`; features stay where they are. Only shell files move. Moving everything into `routes/` and `features/` folders would churn every import for no gain the check does not already give.
- The layer report lives outside `dist/`, so it is never deployed. Vite's `build.manifest` would write into `dist/.vite/` and be served publicly.
- `check:bundle` becomes a TypeScript script run by `tsx`, so it can share the route table and get a unit test.
- The current route is awaited before the first render, not suspended, so a direct visit to `/sheet` never shows header-then-content.
- `hydrate()` runs when a page that needs the store loads, not at start. Header, Footer and theme never read the store.

## 7. Owner's decisions (25 Nov 2026)

1. **Limits.** After the change, measure each layer and set its limit at the measured size plus 10 % for the shell and plus 25 % for routes and features, rounded up to the next KB. The shell then has room for small changes, and a route absorbs several features before one has to move into its own chunk.
2. **Idle prefetch.** None, to save egress. Rejected alternative: prefetch the `/sheet` chunks on idle from `/`, which costs one route's download for every visitor who never opens a sheet.
3. **CSS in the shell budget.** Yes. It blocks the first paint, as the JS does.

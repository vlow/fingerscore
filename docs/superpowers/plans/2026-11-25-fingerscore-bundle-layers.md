# Bundle Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the app into a small shell, one lazy chunk per route and lazy features, and replace the raw-byte start budget with brotli budgets per layer that CI enforces.

**Architecture:** Shell code moves to `src/shell/`. Every route loads through `import()`; a Vite plugin inlines a script that preloads the current URL's route chunks, and `main.tsx` waits for that route before the first render. One primitive, `src/shell/lazy.ts`, replaces every ad hoc loader. The same plugin writes `build-report/layers.json`; `scripts/check-bundle.ts` compresses each layer with brotli, compares it with `bundle-budget.json` and fails when the shell holds a module from outside the shell.

**Tech Stack:** React 18, React Router 6, Vite 8 (Rolldown), TypeScript, Vitest + Testing Library, Playwright, `tsx`, `node:zlib`.

**Spec:** `docs/superpowers/specs/2026-11-25-fingerscore-bundle-layers-design.md`

## Global Constraints

- No new dependency.
- Shell allowlist, as module paths relative to the repository: `src/shell/`, `src/styles/global.css`, `src/styles/tokens.css`, `src/content/repository.ts`, and `node_modules/` packages `react`, `react-dom`, `scheduler`, `react-router`, `react-router-dom`, `@remix-run/router`, `zustand`, `@fontsource/atkinson-hyperlegible`. Module IDs that start with `\0` (bundler virtual modules) are ignored.
- Sizes are brotli quality 11 (`zlib.constants.BROTLI_PARAM_QUALITY: 11`), JS and CSS summed per layer.
- Limits: shell = measured × 1.10; each route and feature = measured × 1.25; each rounded up to the next multiple of 1024 bytes.
- No idle prefetch anywhere. Prefetch only on pointer enter or focus.
- The route fallback stays `<div aria-busy="true" />`. The load-failure text stays `LOAD_FAILED` from `loadFailed.ts`.
- The PDF markers (`jsPDF`, `svg2pdf`, `Unsupported image URL`) and the unused-library markers of today's `scripts/check-bundle.mjs` are kept verbatim.
- `build-report/` is git-ignored and never written into `dist/`.
- Prose in README and docs follows the owner's writing standards: short sentences, numbers over vague words.

## Review Focus

1. A cold load of `/sheet` with a sheet in session storage shows the sheet. It must not bounce to `/`, which would happen if `hydrate()` ran after the first render. → Task 3, test `a cold /sheet with a stored sheet renders the sheet`.
2. `/sheet/` (trailing slash) and `/sheet?play=1` preload the `/sheet` chunks, not `/`'s. → Task 5, test `preloadScript normalises a trailing slash and ignores the query`.
3. An unknown path such as `/nope` preloads `/`'s chunks and renders the start page. → Task 5, test `preloadScript falls back to /`.
4. A route chunk that fails on a cold load shows the reload notice in `main`, and Header and Footer stay. → Task 5, e2e `a failed route chunk shows the reload notice`.
5. A failed prefetch does not mark the feature failed, and the next real load retries the request. → Task 1, test `prefetch swallows a failure and load retries`.

---

### Task 1: The lazy-module primitive

**Files:**
- Create: `src/shell/lazy.ts`, `src/shell/lazy.test.tsx`

**Interfaces:**
- Produces:
  - `interface LazyModule<V> { load(): Promise<V>; peek(): V | null; prefetch(): void }`
  - `function lazyModule<V>(load: () => Promise<V>): LazyModule<V>`
  - `function useLazy<V>(m: LazyModule<V>, onReady?: () => void): { value: V | null; failed: boolean; request(): void }`, with the same contract as today's `chunkLoader` hook: `request` loads, or calls `onReady` at once when loaded; `failed` is true after a failed request until the next request; no state update after unmount.
  - `function lazyView<P extends object>(m: LazyModule<ComponentType<P>>, opts?: { compact?: boolean; fallback?: ReactNode }): ComponentType<P>`. It renders `peek()` directly when loaded. Otherwise it renders `React.lazy` inside `Suspense` (fallback `opts.fallback ?? null`) inside `LoadBoundary` (`compact` passed through).
  - `type IntentProps = { onPointerEnter(): void; onFocus(): void }`
  - `function intentProps(...ms: LazyModule<unknown>[]): IntentProps`: each handler calls `prefetch()` on every module.

- [ ] **Step 1: Write the failing tests** in `src/shell/lazy.test.tsx`:
  - `load requests once`: a loader `vi.fn` resolving `42`; two parallel `load()` calls → loader called once, both resolve `42`; `peek()` is `42` afterwards and `null` before.
  - `a failed load clears the cache`: the loader rejects once and then resolves; first `load()` rejects, second resolves; loader called twice.
  - `prefetch swallows a failure and load retries`: the loader rejects once; `prefetch()` causes no unhandled rejection (use `vi.fn` on `process.on('unhandledRejection')`, or await a tick and assert no error); then `load()` resolves; a `useLazy` consumer rendered after the prefetch shows `failed === false`.
  - `useLazy: request then onReady`: render a component that calls `request()` on click; after the click, `onReady` is called once and `value` is set. A second click calls `onReady` again without calling the loader.
  - `useLazy: failed until the next request`: the loader rejects; after the click `failed` is true; the next click sets it false before the load settles.
  - `lazyView renders a loaded module without suspending`: `await m.load()`, then render `lazyView(m, { fallback: <p>busy</p> })`; the first synchronous render already shows the component, and `busy` never appears.
  - `lazyView shows the reload notice when the chunk fails`: the loader rejects; `findByRole('alert')` has `LOAD_FAILED`. Silence the expected console error the way `src/pages/SheetPage.lazy.test.tsx` does (`quietErrors`).
  - `intentProps prefetches every module`: call `onFocus()`; both loaders were called once.
- [ ] **Step 2: Run** `npx vitest run src/shell/lazy.test.tsx`. Expected: FAIL, `Cannot find module './lazy'`.
- [ ] **Step 3: Implement `src/shell/lazy.ts`.** `LoadBoundary` is imported from `../ui/LoadBoundary` for now (Task 2 moves it). Keep one in-flight promise per module, and set it back to `null` when the promise rejects.
- [ ] **Step 4: Run** `npx vitest run src/shell/lazy.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: lazyModule, useLazy, lazyView and intentProps in src/shell/lazy.ts`.

### Task 2: Move the shell into `src/shell/`

**Files:**
- Move with `git mv` into `src/shell/`: `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`, `src/App.boundary.test.tsx`, `src/loadFailed.ts`; from `src/ui/`: `Header.tsx`, `Footer.tsx`, `Footer.test.tsx`, `ThemeMenu.tsx`, `ThemeMenu.module.css`, `ThemeMenu.test.tsx`, `RadioMenu.tsx`, `RadioMenu.module.css`, `icons.tsx`, `Toast.tsx`, `Toast.module.css`, `Toast.test.tsx`, `LoadBoundary.tsx`, `LoadBoundary.module.css`, `LoadBoundary.test.tsx`; from `src/state/`: `theme.ts`, `theme.test.ts`, `storage.ts`.
- Stay where they are (allowlisted): `src/styles/global.css`, `src/styles/tokens.css`, `src/content/repository.ts`. README and `src/content/operator.ts` name `repository.ts` by path.
- Modify: every importer of a moved file (about 45 import lines, among them `vi.mock` paths), `index.html` (`/src/shell/main.tsx`), `src/shell/lazy.ts` (`./LoadBoundary`).

**Interfaces:**
- Produces: the same exports under `src/shell/<file>`. No behaviour change.

- [ ] **Step 1: Move the files** with `git mv`.
- [ ] **Step 2: Fix the imports.** Run `npx tsc -b` until it is clean. Then search for `vi.mock(` paths and `readFileSync('src/` paths that name a moved file; TypeScript does not check those.
- [ ] **Step 3: Run** `npm test`. Expected: PASS, the same count as before the move.
- [ ] **Step 4: Run** `npm run build && node scripts/check-bundle.mjs`. Expected: the build succeeds and the start set is within ±200 bytes of 409,079.
- [ ] **Step 5: Commit** `refactor: shell files move to src/shell`.

### Task 3: Every route lazy, the store hydrated with its pages

**Files:**
- Create: `src/shell/routePages.ts`, `src/shell/routes.tsx`, `src/shell/routes.test.tsx`, `src/shell/routes.store.test.tsx` (its own file: it mocks the store, which `routes.test.tsx` needs real)
- Modify: `src/shell/App.tsx`, `src/shell/main.tsx`, `src/shell/App.test.tsx`, `src/shell/App.boundary.test.tsx`, `src/shell/Header.tsx`, `src/shell/Footer.tsx`, `src/ui/Gallery.tsx`, `src/pages/Start.tsx`

**Interfaces:**
- Consumes: Task 1's `lazyModule`, `lazyView`, `intentProps`, `IntentProps`.
- Produces:
  - `src/shell/routePages.ts`: `export const ROUTE_PAGES = { '/': 'Start', '/sheet': 'SheetPage', '/tracks': 'Tracks', '/scales': 'Scales', '/terms': 'Terms', '/imprint': 'Imprint', '/privacy': 'Privacy', '/about': 'About' } as const;`, `export type RoutePath = keyof typeof ROUTE_PAGES;`, `export type PageName = (typeof ROUTE_PAGES)[RoutePath];`. This file imports nothing; `vite.config.ts` reads it.
  - `src/shell/routes.tsx`:
    - `export const storeReady: LazyModule<void>`: imports `../state/store` and calls `hydrate()` once.
    - `export function routePath(pathname: string): RoutePath`: strips one trailing slash (except on `/`) and returns the matching key, else `'/'`.
    - `export function routeModule(pathname: string): LazyModule<ComponentType>`: the module for `routePath(pathname)`. Loaders are a `Record<PageName, () => Promise<ComponentType>>`. `Start`, `SheetPage`, `Tracks` and `Scales` await `storeReady.load()` together with the page (`Promise.all`).
    - `export function routeIntent(pathname: string): IntentProps`
    - `export const ROUTE_VIEWS: Record<RoutePath, ComponentType>`: `lazyView(routeModule(path), { fallback: <div aria-busy="true" /> })` per path.

- [ ] **Step 1: Write the failing tests** in `src/shell/routes.test.tsx`:
  - `routePath`: `'/sheet/'` → `'/sheet'`, `'/'` → `'/'`, `'/nope'` → `'/'`, `'/about'` → `'/about'`.
  - `a cold /sheet with a stored sheet renders the sheet`: write a valid doc (from `sampleDoc('asax')` in `src/domain/fixture.ts`) to `sessionStorage` under `fingerscore.doc`, `await routeModule('/sheet').load()`, render `<MemoryRouter initialEntries={['/sheet']}><App /></MemoryRouter>`; `screen.getByTestId('paper')` exists in the first synchronous render, with no `findBy`.
  - In `routes.store.test.tsx`, `a page without the store does not load it`: `vi.mock('../state/store', …)` with a `hydrate` spy; `await routeModule('/about').load()` → the spy is not called; `await routeModule('/').load()` → called once; a second load of `/scales` → still once.
- [ ] **Step 2: Run** `npx vitest run src/shell/routes`. Expected: FAIL, missing module.
- [ ] **Step 3: Implement** `routePages.ts` and `routes.tsx`. In `App.tsx`, render `ROUTE_VIEWS[path]` for each path, each inside its own `<Route>`. Keep the `*` → `/` redirect and the dev-only `/dev/sheet` route, the latter through `lazyView`. Remove the static `Start` and `SheetPage` imports.
- [ ] **Step 4: Change `main.tsx`.** Remove `hydrate()`. Call `initTheme()`. Then `routeModule(location.pathname).load().catch(() => {}).finally(render)`, where `render` is today's `createRoot(…).render(…)`. A failed load still renders; the route's `lazyView` then shows the notice.
- [ ] **Step 5: Add intent prefetch to links:** Header (`/`, `/scales`), Footer (each link's `to`), Gallery's open and play links (`/sheet`), and Start's "Make the sheet from …" button (`/sheet`): spread `routeIntent(path)` on the element.
- [ ] **Step 6: Update the App tests.** Assertions on page content become `await screen.findBy…`. Header and Footer assertions stay synchronous: they render before any route arrives.
- [ ] **Step 7: Run** `npm test`. Expected: PASS.
- [ ] **Step 8: Run** `npm run build && node scripts/check-bundle.mjs`. Expected: the start set falls well below 409,079 bytes. Record the number in the task report.
- [ ] **Step 9: Run** `npm run test:e2e`. Expected: PASS. The dev server gets no preload script; routes load on request.
- [ ] **Step 10: Commit** `feat: every route loads on demand; pages that use the store hydrate it as they load`.

### Task 4: Features on `lazy.ts`

**Files:**
- Delete: `src/pages/sheet/chunkLoader.ts`
- Modify: `src/pages/sheet/useAltPopoverLoad.ts`, `src/pages/sheet/usePlayModeLoad.ts`, `src/pages/sheet/useAltFingering.tsx`, `src/pages/sheet/useEditPanelSlot.tsx`, `src/pages/SheetPage.tsx`, `src/pdf/request.ts`, `src/import/index.ts`, `src/ui/Transport.tsx`, `src/ui/ModeSwitch.tsx`, `src/ui/FileMenu.tsx`, `src/pages/Scales.tsx`, and the tests that use `View` from the old hook.

**Interfaces:**
- Consumes: Task 1's whole interface.
- Produces:
  - `useAltPopoverLoad` and `usePlayModeLoad` become `useLazy` calls over module-level `lazyModule`s. Exported names, `ALT_LOAD_FAILED` and `PLAY_MODE_LOAD_FAILED` stay. Callers read `value` instead of `View`.
  - `useEditPanelSlot.tsx`: `panelModules: Record<Exclude<Mode, 'view'>, LazyModule<ComponentType<…>>>`; `preloadPanel(mode)` calls `panelModules[mode].prefetch()`.
  - `SheetPage.tsx`: `BulkCard` via `lazyView(…, { compact: true })`.
  - `src/pdf/request.ts`: `export const sheetPdfModule`, `export const scalePdfModule` (each `LazyModule` of the engine module); `load()` keeps mapping a failure to `PdfError(LOAD_FAILED)`.
  - `src/import/index.ts`: `Format.load` stays `() => Promise<Parser>`, now backed by one `lazyModule` per format.
  - `Transport` prop `playModeIntent?: IntentProps`; `ModeSwitch` prop `onIntent?(mode: Mode): void`, fired on pointer enter and focus of each option; `FileMenu` prop `pdfIntent?: IntentProps` on the Download PDF item.

- [ ] **Step 1: Write the failing tests:**
  - `src/ui/Transport.test.tsx`: `focusing Play mode calls playModeIntent.onFocus`.
  - `src/ui/ModeSwitch` test (create `src/ui/ModeSwitch.test.tsx` if none exists): `pointer enter on Lyrics calls onIntent('lyrics')`.
  - `src/pages/SheetPage.test.tsx`, in the existing `Download PDF` block: `focusing Download PDF prefetches the engine once` (spy on `sheetPdfModule.prefetch`).
  - `src/pages/Scales.test.tsx`, in its `Download PDF` block: the same for `scalePdfModule`.
- [ ] **Step 2: Run** those four files. Expected: FAIL.
- [ ] **Step 3: Migrate** each loader in the Files list. Wire the intents: `SheetPage` passes `intentProps(playModeModule)` to Transport, `preloadPanel` to `ModeSwitch.onIntent`, and `intentProps(sheetPdfModule)` to FileMenu; `Scales` spreads `intentProps(scalePdfModule)` on its PDF button. Delete `chunkLoader.ts`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, including `SheetPage.lazy`, `SheetPage.altLoad`, `SheetPage.playModeLoad` and `SheetPage.playModeArrival` unchanged apart from `View` → `value`.
- [ ] **Step 5: Run** `npm run test:e2e`. Expected: PASS (`parser-load`, `play-mode` and `pdf` cover the loaders).
- [ ] **Step 6: Commit** `refactor: every lazy feature loads through src/shell/lazy.ts; play mode, panels and PDF prefetch on intent`.

### Task 5: The `bundleLayers` plugin: layer report and route preload

**Files:**
- Create: `scripts/bundle-layers/layers.ts`, `scripts/bundle-layers/layers.test.ts`, `scripts/bundle-layers/plugin.ts`, `e2e-preview/route-loading.spec.ts`
- Modify: `vite.config.ts` (add the plugin after `react()`; add `'scripts/**/*.test.ts'` to `test.include`), `.gitignore` (`build-report/`)

**Interfaces:**
- Consumes: `ROUTE_PAGES` from `src/shell/routePages.ts`.
- Produces, from `layers.ts` (pure, no Vite import):
  - `interface ChunkNode { file: string; isEntry: boolean; facadeModuleId: string | null; imports: string[]; dynamicImports: string[]; css: string[]; moduleIds: string[] }`. Paths: `file` as in the bundle (`assets/x.js`); module IDs relative to the repository root.
  - `interface LayerFiles { entry: string; files: string[] }`
  - `interface LayerReport { shell: { files: string[]; outside: { module: string; chain: string[] }[] }; routes: Record<string, LayerFiles>; features: Record<string, LayerFiles> }`. Feature keys are the facade module path, for example `src/pdf/sheetPdf.ts`.
  - `function computeLayers(chunks: ChunkNode[], routeModules: Record<string, string>, importersOf: (id: string) => string[]): LayerReport`
    - shell = the entry chunk and its static `imports`, transitively, with their `css`.
    - route = the chunk whose `facadeModuleId` is the route's module, plus its static imports, transitively, minus shell files.
    - feature = every other chunk that some chunk lists in `dynamicImports`, plus its static imports, minus shell files, minus the files of each route whose files include a chunk that lists it in `dynamicImports`.
    - `outside` = each module ID of a shell chunk that fails the Global Constraints allowlist. `chain` runs from `src/shell/main.tsx` to the module, found by a breadth-first search over `importersOf`.
  - `function preloadMap(report: LayerReport): Record<string, string[]>`: route path → `'/' + file` for each file of that route (JS and CSS).
  - `function preloadScript(map: Record<string, string[]>): string`: a self-contained script. It normalises `location.pathname` as `routePath` does (Task 3), falls back to `'/'`, and appends to `document.head` one `<link rel="modulepreload" crossorigin href>` per `.js` file and one `<link rel="stylesheet" crossorigin href>` per `.css` file.
- Produces, from `plugin.ts`: `export function bundleLayers(): Plugin`, active only in `vite build`.
  - `generateBundle`: builds `ChunkNode[]` from the output chunks (`viteMetadata.importedCss` for `css`) and writes `build-report/layers.json`.
  - `transformIndexHtml` with `order: 'post'`: injects `preloadScript(preloadMap(report))` as an inline `<script>` in `<head>` before the entry module script.

- [ ] **Step 1: Write the failing unit tests** in `scripts/bundle-layers/layers.test.ts`. They run in Vitest's default jsdom environment; the script tests set the URL with `history.replaceState`, run the script with `new Function(script)()`, and read `document.head`. Use a hand-made graph: entry `assets/index.js` (modules `src/shell/main.tsx`, `node_modules/react/index.js`) importing `assets/react.js`; route chunks for `/` and `/sheet` sharing `assets/store.js`; a feature `assets/pdf.js` that `/sheet` imports dynamically and that imports `assets/store.js` statically.
  - `computeLayers splits shell, routes and features`: shell files `['assets/index.js', 'assets/react.js', <entry css>]`; `/sheet` files hold `assets/store.js`; the feature's files exclude `assets/store.js`.
  - `computeLayers reports a module outside the shell with its chain`: add `src/state/store.ts` to the entry chunk's `moduleIds`, with `importersOf` giving `store.ts ← src/shell/App.tsx ← src/shell/main.tsx`; `outside` equals `[{ module: 'src/state/store.ts', chain: ['src/shell/main.tsx', 'src/shell/App.tsx', 'src/state/store.ts'] }]`.
  - `computeLayers allows the listed packages and files`: `node_modules/react-router/dist/index.js`, `src/styles/global.css`, `src/content/repository.ts` and `\0vite/preload-helper.js` in the shell give no `outside` entry.
  - `preloadScript falls back to /`: with `location.pathname = '/nope'` the head gets the links of `/`.
  - `preloadScript normalises a trailing slash and ignores the query`: `/sheet/` (with `location.search = '?play=1'`) gets the links of `/sheet`.
  - `preloadScript sets crossorigin and the rel by extension`.
- [ ] **Step 2: Run** `npx vitest run scripts/bundle-layers`. Expected: FAIL, missing module.
- [ ] **Step 3: Implement** `layers.ts` and `plugin.ts`, then register the plugin in `vite.config.ts`.
- [ ] **Step 4: Run** `npx vitest run scripts/bundle-layers`. Expected: PASS.
- [ ] **Step 5: Run** `npm run build`. Expected: `build-report/layers.json` exists, `shell.outside` is `[]`, and `dist/index.html` holds the inline preload script before `<script type="module">`.
- [ ] **Step 6: Write** `e2e-preview/route-loading.spec.ts`. Read `build-report/layers.json` in the test.
  - `a cold / requests no chunk that only /sheet uses`: go to `/`, wait for `networkidle`; no request URL ends with a file in `routes['/sheet'].files` that is not in `routes['/'].files`.
  - `a cold /sheet preloads its route`: make a sheet ("Try a sample", then "Make the sheet from …"), reload; each `.js` file of `routes['/sheet']` has a `link[rel=modulepreload]` in `<head>`.
  - `a cold /sheet never shows the route fallback`: the same setup. Use `page.addInitScript` to install a `MutationObserver` that sets `window.__busySeen = true` when `main [aria-busy="true"]` appears. Reload; `getByTestId('paper')` is visible; `__busySeen` is falsy.
  - `a failed route chunk shows the reload notice`: `page.route('**/' + routes['/about'].entry, r => r.abort())`, go to `/about`; `getByRole('alert')` has `LOAD_FAILED`'s text; the `Songs` link and the footer's `Imprint` link are visible.
- [ ] **Step 7: Run** `npm run build && npm run test:e2e:preview`. Expected: PASS, both the existing `pdf-preview` test and the four new ones.
- [ ] **Step 8: Commit** `feat: bundleLayers plugin writes the layer report and preloads the current route`.

### Task 6: `check:bundle` on brotli budgets

**Files:**
- Create: `scripts/check-bundle.ts`, `scripts/bundle-layers/budget.ts`, `scripts/bundle-layers/budget.test.ts`, `bundle-budget.json`
- Delete: `scripts/check-bundle.mjs`
- Modify: `package.json` (`"check:bundle": "tsx scripts/check-bundle.ts"`)

**Interfaces:**
- Consumes: `LayerReport` from Task 5.
- Produces, from `budget.ts`:
  - `interface Budget { shell: number; routeDefault: number; featureDefault: number; routes: Record<string, number>; features: Record<string, number> }`
  - `interface Row { layer: string; files: number; raw: number; brotli: number; limit: number }`
  - `function evaluate(report: LayerReport, sizes: Record<string, { raw: number; brotli: number }>, budget: Budget): { rows: Row[]; failures: string[] }`. A layer's limit is its named entry, else the matching default. Failures: each layer over its limit (`<layer> is <n> bytes brotli, over its <limit> byte limit`), and each `shell.outside` entry (`the shell holds <module>, imported via <chain joined with ' → '>`).
  - `const LIBRARY_FEATURES = ['src/pdf/sheetPdf.ts', 'src/pdf/scalePdf.ts', 'src/import/abc.ts', 'src/import/mscz.ts', 'src/import/midi.ts']`
  - `function propose(rows: Row[]): Budget`: shell ×1.10; each route and feature ×1.25; each rounded up to a multiple of 1024. `routeDefault` = the largest route limit. `featureDefault` = the largest feature limit outside `LIBRARY_FEATURES`.
- `scripts/check-bundle.ts`: reads `build-report/layers.json` (missing → `check:bundle: no build-report/layers.json found. Run npm run build first.`, exit 1) and `bundle-budget.json`. It sizes each file in `dist/`, prints the table (`layer`, `files`, `raw`, `brotli`, `limit`, `headroom`) and runs today's PDF-marker check over shell and route files and today's unused-library check over every `dist/assets/*.js`. If `GITHUB_STEP_SUMMARY` is set, it appends the table there as Markdown. With `--propose`, it prints `propose(rows)` as JSON and exits 0 without checking.

- [ ] **Step 1: Write the failing tests** in `scripts/bundle-layers/budget.test.ts` (`// @vitest-environment node`):
  - `evaluate passes within limits` and `evaluate fails a layer over its limit` with the exact message.
  - `evaluate falls back to routeDefault and featureDefault for unnamed layers`.
  - `evaluate fails on a shell module outside the allowlist` with the message `the shell holds src/state/store.ts, imported via src/shell/main.tsx → src/shell/App.tsx → src/state/store.ts`.
  - `propose rounds up`: a shell of 50,000 → 55,296 (50,000 × 1.10 = 55,000 → next multiple of 1024); a route of 10,000 → 13,312 (10,000 × 1.25 = 12,500 → next multiple of 1024).
  - `propose leaves library features out of featureDefault`.
- [ ] **Step 2: Run** `npx vitest run scripts/bundle-layers/budget.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `budget.ts` and `check-bundle.ts`, and write a provisional `bundle-budget.json` with every limit set to `10000000`. Task 7 sets the real values.
- [ ] **Step 4: Run** `npx vitest run scripts/bundle-layers` and `npm run build && npm run check:bundle`. Expected: PASS; the table lists the shell, eight routes and every feature.
- [ ] **Step 5: Prove the shell rule.** Temporarily add `import '../state/store';` to `src/shell/Header.tsx`, then build and check. Expected: exit 1 and `the shell holds src/state/store.ts, imported via src/shell/main.tsx → src/shell/App.tsx → src/shell/Header.tsx → src/state/store.ts`. Revert the line.
- [ ] **Step 6: Commit** `feat: check:bundle measures brotli bytes per layer and rejects foreign modules in the shell`.

### Task 7: Real limits, CI summary and docs

**Files:**
- Modify: `bundle-budget.json`, `README.md` (lines on loading and `check:bundle`, today about 176, 183 and 282), `docs/open-points.md` (row 32)

- [ ] **Step 1: Run** `npm run build && npm run check:bundle -- --propose > build-report/budget-proposal.json`, review the numbers, and copy them into `bundle-budget.json`.
- [ ] **Step 2: Run** `npm run check:bundle`. Expected: PASS. Every headroom is about 10 % for the shell and about 25 % for the other layers.
- [ ] **Step 3: Update README.** Replace each mention of 410,000 bytes with the layer budgets: the brotli size of the shell, the per-layer limits in `bundle-budget.json`, and the shell rule. Add a short "Adding a feature" paragraph: a feature outside the shell loads through `lazyView(lazyModule(() => import('./X')))`; code in `src/shell/` ships to every visitor; `npm run check:bundle -- --propose` prints new limits for an owner's decision.
- [ ] **Step 4: Remove row 32 from `docs/open-points.md`**; renumber only if the file's other rows are numbered consecutively.
- [ ] **Step 5: Run the full suite:** `npm run build && npm run check:bundle && npm run notices -- --check && npm test && npm run test:e2e && npm run test:e2e:preview`. Expected: all PASS.
- [ ] **Step 6: Commit** `docs: per-layer bundle budgets in README; start budget item closed`.

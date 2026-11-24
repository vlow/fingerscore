# Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give fingerscore a dark theme with a System / Light / Dark switch, three sheet paper themes in dark, and light print and PDF.

**Architecture:** All colours come from `--c-*` custom properties in `src/styles/tokens.css`; `data-theme` on `<html>` selects the set. The SVG renderer reads colours from a `Palette` in React context: CSS variable references on screen, light hex literals in the PDF's offscreen render. Theme and paper choice live in one small zustand store backed by `localStorage`, outside the document store.

**Tech Stack:** React 18, TypeScript, CSS modules, zustand, Vitest + Testing Library, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-11-24-fingerscore-dark-mode-design.md`. Handoff: `handoffs/fingerscore-darkmode-2026-11-24.zip` in the main checkout (`DARKMODE.md`, `tokens.css`, `tokens.json`); unpack it outside the repo.

## Global Constraints

- No new dependency. No change to a stored document format.
- No colour literal under `src` outside `src/styles/tokens.css`, `src/render/palette.ts` and `src/pdf/devHook.ts`.
- No new colour token. A literal without a fitting token takes the nearest by role and is listed in the task report.
- Theme values: `system` (default), `light`, `dark`. Storage keys: `fingerscore.theme`, `fingerscore.paper`, both raw strings in `localStorage`.
- Paper values: `night` (default), `dimmed`, `sepia`.
- The PDF's colours do not change. Staff lines stay `#2A2D33` there.
- Layout, spacing, radii, typography and chart geometry do not change.
- Prose in docs and README follows the owner's writing standards: short sentences, numbers over vague words.

## Review Focus

1. Storage blocked (private window): choosing a theme or paper still applies for the session and throws nothing. → Task 2.
2. A stored value that is neither `light` nor `dark` (also `"dark"` with JSON quotes): the theme is System. → Task 2.
3. The operating system switches scheme while Light or Dark is chosen: nothing changes. → Task 2 (unit), Task 7 (D02).
4. Print from System on a dark operating system: white paper. → Task 7 (D05).
5. System on a light operating system: the sheet is white although `data-paper="night"` is set. → Task 7 (D01).

---

### Task 1: Tokens and the rename

**Files:**
- Replace: `src/styles/tokens.css`
- Modify: every `*.css` under `src` (40 files use `var(--…)`; 22 hold literals), `src/styles/print.css`
- Create: `src/colourLiterals.test.ts`

**Interfaces:**
- Produces: the custom properties `--c-<token>` for the 31 tokens of `tokens.json`, plus `--radius`, `--radius-card`, `--page-padding` unchanged.

- [ ] **Step 1: Write `src/colourLiterals.test.ts`.** It walks `src`, reads every `.css`, `.ts` and `.tsx` that is not a `.test.` file, and expects no match of `/#[0-9a-fA-F]{3,8}\b|\brgba?\(/` outside `const ALLOWED = ['styles/tokens.css', 'render/palette.ts', 'pdf/devHook.ts']`. A second test expects no `var(--` followed by one of the 20 old names (`ink`, `text`, `muted`, `muted-2`, `border`, `border-2`, `page`, `pagebar`, `card`, `teal`, `teal-hover`, `teal-tint`, `teal-light`, `teal-border`, `amber`, `amber-bg`, `red`, `red-bg`, `ghost`) and a closing parenthesis or comma. Mark the `.ts`/`.tsx` half with `it.fails` until Task 4 removes it; the CSS half must pass at the end of this task.
- [ ] **Step 2: Run `npx vitest run src/colourLiterals.test.ts`.** Expected: the CSS test fails with the list of files.
- [ ] **Step 3: Replace `src/styles/tokens.css`** with the handoff's file, then apply the spec's three corrections (4.1): move each `:root:not([data-theme="light"]) [data-paper="…"]` selector into `@media (prefers-color-scheme: dark)`, keeping the `:root[data-theme="dark"] [data-paper="…"]` selector outside; add `:root:not([data-theme="light"])` and `[data-paper]` to the print block's selector list (the `[data-paper]` rule restates the seven paper tokens with light values); extend both Dimmed rules with the light value of every token the handoff's Dimmed rule does not set. Append the three non-colour tokens.
- [ ] **Step 4: Rename** with the table in spec 4.1. Then walk the 22 files with literals and replace each by a token per handoff §3 "Component mapping". Filled primary buttons: `primary-bg` + `on-accent`. Selected segments and chips: `selected-bg` + `selected-fg`. Destructive buttons: `danger-bg` + `on-accent`. Shadows: keep the offsets, use `var(--c-shadow)`. Play-mode toolbar: bar `surface` + `border`, buttons `raised` + `text`, active auto-scroll `primary-bg` + `on-accent`, backdrop `playmode-bg`. `print.css`: `#ffffff` → `var(--c-paper)`.
- [ ] **Step 5: Run `npx vitest run`.** Expected: the CSS half of the new test passes; the rest of the suite is as before.
- [ ] **Step 6: Commit** `feat: colour tokens from the dark mode handoff, every stylesheet on --c-* variables`.

### Task 2: Theme state

**Files:**
- Modify: `src/state/storage.ts`, `src/content/storageItems.ts`, `src/content/storageItems.test.ts`, `index.html`, `src/main.tsx`
- Create: `src/state/theme.ts`, `src/state/theme.test.ts`

**Interfaces:**
- Produces, from `src/state/storage.ts`: `readText(a: Area, key: string): string | null`, `writeText(a: Area, key: string, value: string): boolean`.
- Produces, from `src/state/theme.ts`:
  - `type Theme = 'system' | 'light' | 'dark'`, `type Effective = 'light' | 'dark'`, `type PaperTheme = 'night' | 'dimmed' | 'sepia'`
  - `useTheme(): { theme: Theme; effective: Effective; setTheme(t: Theme): void }`
  - `usePaper(): { paper: PaperTheme; setPaper(p: PaperTheme): void }`
  - `initTheme(): void`, called once from `main.tsx` before render: reads both keys, applies `data-theme`, subscribes to `matchMedia('(prefers-color-scheme: dark)')`.

- [ ] **Step 1: Write `src/state/theme.test.ts`** with a mocked `matchMedia` whose `matches` and `change` listeners the test controls:
  - no stored key → `theme` is `system`, `<html>` has no `data-theme`, `effective` equals the mocked scheme;
  - stored `dark` → `theme` `dark`, `data-theme="dark"`; stored `banana` and stored `"dark"` (with quotes) → `system`;
  - `setTheme('light')` stores the raw string `light` and sets the attribute; `setTheme('system')` removes the key and the attribute;
  - a `change` event flips `effective` while `system`; with `dark` chosen it changes nothing;
  - `setTheme` sets `content` of both `meta[name="theme-color"]` to `#FFFFFF` or `#171A1F` for Light or Dark and restores `#FFFFFF` / `#171A1F` by media for System;
  - paper: default `night`; `setPaper('sepia')` stores `sepia`; stored `banana` → `night`;
  - with `localStorage.setItem` throwing, `setTheme('dark')` and `setPaper('dimmed')` still update the hook's value and throw nothing.
- [ ] **Step 2: Run it.** Expected: FAIL, module not found.
- [ ] **Step 3: Add `readText` and `writeText`** to `storage.ts` (as `readJSON`/`writeJSON`, without JSON). In `storageItems.test.ts` add `readText|writeText` to the call pattern in `areasOf`. Add to `STORAGE_ITEMS`: `{ key: 'fingerscore.theme', where: 'local', label: 'the colour theme you chose' }` and `{ key: 'fingerscore.paper', where: 'local', label: 'the paper colour you chose for dark mode' }`.
- [ ] **Step 4: Implement `src/state/theme.ts`** as one zustand store; both key constants live in this file only.
- [ ] **Step 5: Edit `index.html`:** the inline script of handoff §2 as the first element after the charset meta; `<meta name="color-scheme" content="light dark">`; replace the one `theme-color` meta by two with `media="(prefers-color-scheme: light)"` `#FFFFFF` and `media="(prefers-color-scheme: dark)"` `#171A1F`. Call `initTheme()` in `main.tsx`.
- [ ] **Step 6: Run `npx vitest run src/state src/content src/pages/legalPages.test.tsx`.** Expected: PASS.
- [ ] **Step 7: Commit** `feat: theme and paper preference, applied before first paint`.

### Task 3: Header control and logo

**Files:**
- Create: `src/ui/ThemeMenu.tsx`, `src/ui/ThemeMenu.module.css`, `src/ui/ThemeMenu.test.tsx`
- Modify: `src/ui/Header.tsx`, `src/ui/icons.tsx`

**Interfaces:**
- Consumes: `useTheme()` from Task 2.
- Produces: `export default function ThemeMenu(): JSX.Element`.

- [ ] **Step 1: Write `ThemeMenu.test.tsx`:**
  - the button's accessible name is `Theme: System` at first, has `aria-haspopup="menu"` and `aria-expanded="false"`;
  - a click opens a `menu` named `Theme` with three `menuitemradio` items `System`, `Light`, `Dark`; `System` has `aria-checked="true"`, focus is on it;
  - ArrowDown, ArrowUp, Home and End move focus and wrap; Enter on `Dark` closes the menu, the button is named `Theme: Dark`, focus is on the button, `<html>` has `data-theme="dark"`;
  - Escape closes and returns focus; a mousedown outside closes;
  - after Dark, choosing System and then Light each work (all three reachable from each other).
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `ThemeMenu`** after the open/close, outside-click and key handling of `src/ui/FileMenu.tsx`. Icons monitor, sun, moon as 16 px stroke icons in `icons.tsx`. The label is a `<span>` hidden below 560 px; the `aria-label` carries the name at every width. Button height 44 px. Menu: `surface`, `border`, `shadow`; the chosen item shows a check mark.
- [ ] **Step 4: Put `<ThemeMenu />` after the `<nav>` in `Header.tsx`.** In `LogoMark` replace the stroke literals by `var(--c-text)` and the fill by `var(--c-accent)`.
- [ ] **Step 5: Run `npx vitest run src/ui src/App.test.tsx`.** Expected: PASS.
- [ ] **Step 6: Commit** `feat: theme switch in the header`.

### Task 4: Renderer palette and the PDF's light colours

**Files:**
- Create: `src/render/palette.ts`, `src/render/palette.test.ts`
- Modify: `src/render/NoteView.tsx`, `FingeringChart.tsx`, `Glyph.tsx`, `SystemView.tsx`, `ScaleStaff.tsx`, `TupletMark.tsx`, their tests, `src/pdf/engine.ts`, `src/pdf/sheetPdf.ts`, `src/pdf/scalePdf.ts`, `src/pdf/prepareSvg.ts`, `src/colourLiterals.test.ts`

**Interfaces:**
- Produces, from `src/render/palette.ts`:
  - `interface Palette { paper; ink; staff; chord; lyric; text; muted; border; warning; warningBg; error; errorBg; ghostKey; badgeBg; playing; selection }` (all `string`)
  - `SCREEN: Palette` — `var(--c-paper)`, `var(--c-ink)`, staff `var(--c-lyric)`, `var(--c-chord)`, `var(--c-lyric)`, text `var(--c-text-2)`, `var(--c-muted)`, `var(--c-border)`, `var(--c-warning)`, `var(--c-warning-bg)`, `var(--c-error)`, `var(--c-error-bg)`, `var(--c-ghost-key)`, badgeBg `var(--c-bg)`, playing `color-mix(in srgb, var(--c-chord) 14%, transparent)`, selection `color-mix(in srgb, var(--c-chord) 20%, transparent)`
  - `LIGHT: Palette` — the light column of `tokens.json` for the same roles, staff `#2A2D33`, playing `rgba(14,110,104,0.14)`, selection `#E3F4F2`
  - `PaletteProvider` (context provider, prop `value: Palette`), `usePalette(): Palette` (default `SCREEN`)

- [ ] **Step 1: Write `palette.test.ts`:** `LIGHT.ink` is `#15171C`, `chord` `#0E6E68`, `lyric` `#2A2D33`, `warning` `#B45309`, `error` `#B91C1C`, `ghostKey` `#C3C7CE`, `paper` `#FFFFFF`, `staff` `#2A2D33`; every `SCREEN` value contains `var(--c-`; a `FingeringChart` rendered bare has a closed hole with `fill="var(--c-ink)"` and an open hole with `fill="var(--c-paper)"`; the same inside `<PaletteProvider value={LIGHT}>` has `#15171C` and `#FFFFFF`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `palette.ts`.** Replace every colour constant and literal in the six renderer files by a `usePalette()` read; delete the exported `INK`, `WARN`, `STAFF` constants and pass colours where helpers need them. Open holes and the tuplet halo use `paper`. Colours stay SVG presentation attributes (`fill={p.ink}`).
- [ ] **Step 4: In `engine.ts`**, wrap the content of `renderOffscreen` in `<PaletteProvider value={LIGHT}>` and take `INK`, `TEXT`, `MUTED`, `BORDER` from `LIGHT` (lower-case values become upper-case; jsPDF treats them alike). `prepareSvg.ts`: the `'#000'` fallback becomes `LIGHT.ink` only if no test pins black; otherwise keep the behaviour by importing a named constant from `palette.ts`.
- [ ] **Step 5: Update renderer tests** that assert hex fills to assert the `SCREEN` strings. Remove `it.fails` from the `.ts`/`.tsx` half of `src/colourLiterals.test.ts`.
- [ ] **Step 6: Run `npx vitest run` and `npx playwright test e2e/pdf.spec.ts e2e/pdf-content.spec.ts e2e/pdf-scale.spec.ts`.** Expected: PASS; the PDF tests prove the PDF is unchanged.
- [ ] **Step 7: Commit** `feat: the sheet renderer takes its colours from a palette; the PDF keeps the light one`.

### Task 5: Paper themes and their controls

**Files:**
- Create: `src/ui/PaperChoice.tsx`, `src/ui/PaperChoice.test.tsx`
- Modify: `src/render/Paper.tsx`, `src/render/Paper.module.css`, `src/pages/Scales.tsx`, `src/pages/Scales.module.css`, `src/pages/SheetPage.tsx`, `src/ui/PlayMode.tsx`, `src/ui/PlayMode.module.css`, `src/ui/PlayMode.test.tsx`

**Interfaces:**
- Consumes: `usePaper()`, `useTheme()` from Task 2; `Segmented` from `src/ui/Segmented.tsx`.
- Produces: `PaperChoice(props: { variant: 'card' | 'toolbar' }): JSX.Element | null` — `null` when `effective` is `light`.

- [ ] **Step 1: Write `PaperChoice.test.tsx`:** with effective light both variants render nothing; with effective dark the `card` variant is a radiogroup named `Paper` with `Night`, `Dimmed`, `Sepia`, `Night` checked; choosing `Sepia` stores `sepia`; the `toolbar` variant is a button named `Paper: Night` that opens a menu of three `menuitemradio` items and reads `Paper: Dimmed` after that choice. In `PlayMode.test.tsx`: the sheet element has `data-paper="night"`, and `data-paper="sepia"` after the choice; the hint contains "Dark mode is easier on the eyes on stage."
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `Paper`'s `<article>` and the Scales section get `data-paper={paper}` and `background: var(--c-paper)`. `SheetPage`: `<PaperChoice variant="card" />` under `ShowToggles` in the *Show on sheet* card. `PlayMode`: `<PaperChoice variant="toolbar" />` after A+, behind a rule; the sheet's background is `var(--c-playmode-paper)` when the paper is `night` and `var(--c-paper)` otherwise; add the hint sentence. The paper setting never touches the document store.
- [ ] **Step 4: Run `npx vitest run src/ui src/pages src/render`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: Night, Dimmed and Sepia paper in dark mode`.

### Task 6: Browser pass

**Files:** whatever the pass finds.

- [ ] **Step 1: Start the dev server** (`.claude/launch.json`, `fingerscore-dev`) and walk start, tracks, sheet (all four modes, File menu, alternate-fingering popover, banners), Scales, Play mode, About, Imprint, Privacy, Terms in dark, then Dimmed and Sepia on the sheet, then light.
- [ ] **Step 2: Confirm** that `fill="var(--c-ink)"` paints in the SVG. If a browser ignores variables in presentation attributes, move the colours of the six renderer files to `style` and adjust `prepareSvg` to read them there.
- [ ] **Step 3: Fix each leftover** and list it in the task report. Print preview from Dark and from System on a dark system shows white paper.
- [ ] **Step 4: Commit** `fix: dark mode leftovers from the browser pass`.

### Task 7: Acceptance checks and docs

**Files:**
- Create: `e2e/dark-mode.spec.ts`
- Modify: `e2e/accessibility.spec.ts`, `src/acceptanceIndex.test.ts`, `README.md`

**Interfaces:**
- Consumes: `STATES`, `openState` from `e2e/states.ts`; the button name `Theme: …`; the radiogroup `Paper`.

- [ ] **Step 1: Write `e2e/dark-mode.spec.ts`** with six tests titled `D01 …` to `D06 …`, as spec 4.5 defines them. Fixed values: dark page background `rgb(15, 17, 20)`, light paper `rgb(255, 255, 255)`, Night paper `rgb(27, 30, 35)`, Dimmed `rgb(217, 219, 223)`, Sepia `rgb(34, 30, 24)`, printed notation `#15171C`. Use `page.emulateMedia({ colorScheme })` and `{ media: 'print' }`. D01 reads the background in a `DOMContentLoaded` listener added by `page.addInitScript`. D03 collects, per state, every element whose computed `background-color`, `color` or `border-color` equals one of the light-only values `#FFFFFF`, `#F3F4F6`, `#FAFAFB`, `#E2E4E8`, `#D5D8DE`, `#15171C`, `#2A2D33`, `#0E6E68`, and expects none. D05 compares the fill colours in the PDF's operator list for Dark and for Light. D06 runs axe with the tags of `accessibility.spec.ts` on `sheet-view` with each of the three papers.
- [ ] **Step 2: In `accessibility.spec.ts`** run `scan` for each state in both schemes: the existing test stays as the light run and a second test `scan (dark)` emulates dark before `prepare`. `landmark`, `targets` and `focus` stay single.
- [ ] **Step 3: In `acceptanceIndex.test.ts`** add the same three numbering guards for `e2e/dark-mode.spec.ts` and `D01`–`D06`.
- [ ] **Step 4: Run `npx vitest run` and `npm run test:e2e`.** Expected: PASS. A contrast finding is fixed by choosing another existing token, never by an exclusion.
- [ ] **Step 5: README:** add a "Dark mode: `e2e/dark-mode.spec.ts`" entry to the checks section with the six checks in one line each, the new test counts, and the measured run time. Run `npm run build` and `npm run check:bundle`.
- [ ] **Step 6: Commit** `test: dark mode acceptance checks D01 to D06, the accessibility scan in both themes`.

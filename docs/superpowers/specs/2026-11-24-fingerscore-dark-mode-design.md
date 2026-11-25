# fingerscore: dark mode — design

Date: 2026-11-24 · Status: approved by the owner on 2026-11-24

This document defines dark mode for fingerscore. It is written for the builder. Section numbers (§) refer to `DARKMODE.md` in the handoff package `handoffs/fingerscore-darkmode-2026-11-24.zip`. That package also holds `tokens.css`, `tokens.json` and the concept board `prototype/DarkMode.dc.html`. Where the board and `DARKMODE.md` differ, `DARKMODE.md` and `tokens.json` win (§ intro).

## 1. Intent

Players practise at night and read from a stand or on stage. A white page glares there. Dark mode gives the whole app a low-glare theme and gives the sheet its own dark paper.

## 2. Goals, non-goals, anti-goals

**Goals**

1. The theme has three values: **System**, **Light**, **Dark**. System is the default. The user can switch between all three at any time from the header (owner's decision, 2026-11-24).
2. System follows the operating system live. Light and Dark override it. The choice persists per device and applies before first paint.
3. Every colour in the app comes from a token in `tokens.css`. No component holds a colour literal.
4. In dark mode the sheet has three paper themes: Night (default), Dimmed, Sepia. They apply to the sheet editor, Scales, library incipits and Play mode.
5. Print and PDF are light, whatever the theme.
6. Both themes pass WCAG 2.2 AA in the automated scan.

**Non-goals:** changes to layout, spacing, radii, typography, icon shapes or chart geometry; a paper choice in light mode; a theme stored in the document; colour transitions on theme switch.

**Anti-goals**

- A light flash on load for a user whose theme is dark.
- A PDF or printout with dark paper.
- Two token vocabularies side by side (`--ink` next to `--c-ink`).

## 3. Approaches considered

**Tokens**

| | Approach | Trade-off |
|---|---|---|
| **A** | **Take the handoff's `tokens.css` with the three corrections of 4.1 and rename every usage to `--c-*`** (chosen) | One mechanical rename across about 40 CSS files. The app then matches the handoff name for name. |
| B | Keep today's names (`--ink`, `--teal`) and give them dark values | Smaller diff, but the app and the handoff disagree on every name, and `paper`, `ink`, `chord`, `lyric` have no counterpart today. |
| C | Alias the old names to the new ones | Two vocabularies. Rejected as an anti-goal. |

**Sheet colours in the SVG renderer**

| | Approach | Trade-off |
|---|---|---|
| **A** | **A palette object passed by React context: CSS variable references on screen, light hex literals in the PDF's offscreen render** (chosen) | The PDF never sees a variable, so it cannot go dark. One extra context. |
| B | CSS variables everywhere; the PDF path reads computed styles and rewrites fills | The PDF depends on the page's current theme and on style resolution in an offscreen host. |
| C | `currentColor` only | One colour per element; charts, chords and warnings need several. |

## 4. What gets built

### 4.1 Tokens

- `src/styles/tokens.css` becomes the handoff's `tokens.css` plus the non-colour tokens that exist today (`--radius`, `--radius-card`, `--page-padding`), with three corrections:
  1. The paper-theme selectors `:root:not([data-theme="light"]) [data-paper="…"]` move inside `@media (prefers-color-scheme: dark)`. As shipped they sit outside it and would darken the sheet for a System user on a light operating system.
  2. The print block also resets `:root:not([data-theme="light"])` and every `[data-paper]`, so a System-dark page prints light.
  3. The Dimmed scope is extended, see 4.3.
- Every `var(--old)` becomes its `--c-*` counterpart: `ink`→`text`, `text`→`text-2`, `muted`→`muted`, `border`→`border`, `border-2`→`border-strong`, `page`→`bg`, `pagebar`→`pagebar`, `card`→`surface`, `teal`→`accent`, `teal-hover`→`accent-hover`, `teal-tint`→`accent-tint`, `teal-light`→`accent-tint-2`, `amber`→`warning`, `amber-bg`→`warning-bg`, `red`→`error`, `red-bg`→`error-bg`, `ghost`→`ghost-key`. Where the element is a filled primary button, a selected segment or a destructive button, use `primary-bg`/`on-accent`, `selected-bg`/`selected-fg` or `danger-bg` per §3 "Component mapping".
- The 66 colour literals in 22 CSS modules become tokens, following the §3 mapping. Shadows use `--c-shadow`.
- **Light mode changes where the handoff says so (designer's call in this document).** The Play-mode toolbar, dark today in both themes, becomes `surface` with `raised` buttons (§5). Banner text takes `warning` and `error`; the Toast and the selection fill follow their tokens. Light mode is otherwise unchanged.
- **Builder's calls (not in the handoff):** `--muted-2` becomes `muted`. `--teal-border` becomes `accent`. A destructive button's text is `on-accent` (the handoff gives `#FFFFFF` / `#0F1114`, the same values). If a literal has no fitting token, the builder picks the nearest by role and lists it in the task report; no new token is added.
- A unit test fails when a file under `src` other than `tokens.css`, the PDF light palette and the PDF dev hook contains a colour literal.

### 4.2 Theme selection

- State: `'system' | 'light' | 'dark'`, default `'system'`. Stored in `localStorage` under `fingerscore.theme` as the plain string `light` or `dark`, without JSON quotes, because the inline script compares the raw value; System removes the key. An unreadable value is System. `src/state/storage.ts` gains raw-string read and write helpers, and `src/content/storageItems.test.ts` learns to recognise them. Both new keys join `STORAGE_ITEMS`, which lists them on the Privacy page.
- Applied as `data-theme="light|dark"` on `<html>`; absent means System. `tokens.css` does the rest, including the live reaction to the operating system.
- `index.html` gains the inline script from §2 before any stylesheet, `<meta name="color-scheme" content="light dark">`, and two `theme-color` metas (light `#FFFFFF`, dark `#171A1F`) with `media` attributes. When the user picks Light or Dark, both metas take that theme's colour.
- New module `src/state/theme.ts`: read, write, apply, and a hook that returns the chosen value and the effective one (`light` or `dark`; for System it listens to `matchMedia('(prefers-color-scheme: dark)')`).
- **Control:** a button at the right end of the header, after Songs and Scales. It shows an icon (monitor, sun, moon) and the label of the chosen value. On a narrow header it shows the icon only. Its accessible name is always "Theme: System", "Theme: Light" or "Theme: Dark".
- Clicking opens a menu (`role="menu"`) with three `menuitemradio` items, `aria-checked` on the chosen one. Arrow keys move, Enter and Space choose, Esc closes and returns focus to the button, a click outside closes. Choosing applies at once and closes the menu. Reuse the patterns of `FileMenu`.
- The logo mark draws its stem in `text` and its hole in `accent`, which reproduces `brand/mark-on-dark.svg` in dark. The wordmark already uses tokens. The brand files in the handoff equal those in the repo; nothing to copy.

### 4.3 Sheet colours and paper themes

- New module `src/render/palette.ts`: a `Palette` (paper, ink, chord, lyric, text, muted, warning, warning-bg, error, error-bg, ghost-key, highlight, selection, halo) and two instances. `SCREEN` holds `var(--c-…)` references. `LIGHT` holds the light hex values from `tokens.json`, except staff lines, which keep today's `#2A2D33` so the PDF does not change. On screen, staff lines use `lyric` (the same value in light). A context provides `SCREEN` by default.
- `NoteView`, `FingeringChart`, `Glyph`, `SystemView`, `ScaleStaff` and `TupletMark` read every colour from the palette. Open holes and the tuplet halo use `paper`, not white.
- Highlights (§4): playback position is `chord` at 14% alpha, selection fill is `chord` at 20% alpha, both by `color-mix` over the paper. They derive from the paper theme's chord colour so they stay visible on Dimmed paper, where the global `accent-tint` is dark.
- `Paper` and the Scales section set the paper background from `--c-paper`. Play mode uses `--c-playmode-bg` for the backdrop; its sheet uses `--c-playmode-paper` on Night paper and `--c-paper` on Dimmed and Sepia.
- **Paper setting:** `'night' | 'dimmed' | 'sepia'`, default `'night'`, stored in `localStorage` under `fingerscore.paper`. It lives in `src/state/theme.ts`, outside the document store and its undo history. One value serves all three places.
- The `.paper` element, the Scales section and the Play-mode sheet carry `data-paper`. With correction 1 of 4.1, paper themes apply only when the effective theme is dark, so the attribute is harmless in light.
- **Dimmed is a light island (designer's call).** The handoff's Dimmed scope overrides seven tokens. The paper also shows `muted`, `text`, `border`, banner fills and badges, and dark `muted` on `#D9DBDF` is about 1.7:1. The Dimmed scope therefore sets every other colour token to its light value and keeps the handoff's seven. Controls nested in the paper (edit panels, alternate-fingering pills) inherit the paper's tokens on all three papers; no reset.
- **Library incipits stay on `surface` (designer's call).** The handoff says both "strip shown on `surface`" (§3) and "paper themes for library incipits" (§4). This design follows §3: incipits and the library's row staff draw in the page's `ink`, carry no `data-paper`, and look the same on all three papers. A Dimmed incipit would be a light patch on every card.
- **Controls, shown only when the effective theme is dark:** a "Paper" segmented control (Night · Dimmed · Sepia) in the sheet's *Show on sheet* card, and a "Paper: Night ▾" menu button in the Play-mode toolbar. Both write the same setting and apply at once.
- The Play-mode hint gains one sentence recommending dark mode on stage (§5). The wake lock is unchanged.

### 4.4 Print and PDF

- Print: the `@media print` block of `tokens.css` restores the light tokens on `:root`. The builder adds a print rule that resets the paper-theme tokens on `[data-paper]`, because those selectors outrank `:root`. `print.css` replaces its two `#ffffff` with `--c-paper`.
- PDF: `renderOffscreen` in `src/pdf/engine.ts`, which `sheetPdf`, `scalePdf` and the dev hook share, wraps its render in the palette context with `LIGHT`. `engine.ts` takes its own colours from `LIGHT`. The PDF output is unchanged from today, byte for byte in colour.

### 4.5 Tests

- Unit: theme module (default, stored values, corrupt value, System removes the key, effective theme follows a mocked `matchMedia`), palette (`LIGHT` equals the light column of `tokens.json`), header control (menu roles, keyboard, `aria-checked`), paper controls hidden in light.
- `e2e/dark-mode.spec.ts` holds the six checks of §8 as D01–D06:
  - D01: with emulated dark system and no stored theme, `<html>` has no `data-theme` and the page background is `#0F1114` at `DOMContentLoaded`; switching the emulated scheme to light changes it live. With emulated light system and no stored theme, the sheet's paper is `#FFFFFF`.
  - D02: Light and Dark chosen in the header persist across a reload and override the emulated scheme. System, chosen again, follows it.
  - D03: on every state in `e2e/states.ts`, in dark, no element's computed background, text or border colour is a light-theme-only token value (run on Night paper).
  - D04: the sheet in dark defaults to Night; Dimmed and Sepia apply at once and survive a reload; after a paper change the Undo button's state is unchanged.
  - D05: with Dark chosen, and again with System on an emulated dark system, print emulation gives white paper and `#15171C` notation, and the downloaded PDF's page colours equal those of a PDF made in Light.
  - D06: the axe scan.
- `e2e/accessibility.spec.ts` runs its axe scan for every state in both themes, by emulating the colour scheme. Target-size and focus checks run once.
- **Builder's call:** the D checks get their own file. `src/acceptanceIndex.test.ts` keeps guarding A01–A12 and V01–V10 and gains the same numbering guard for D01–D06 in the new file.

## 5. Constraints

- No new dependency.
- The start bundle limit rises from 400,000 to 410,000 bytes (owner's decision, 2026-11-24). Dark mode adds 7,810 bytes that must load at start; the start set is 405,378 bytes.
- No stored document format changes.
- The README's checks section lists the new spec file.

## 6. Left to the builder

- Icon drawings for monitor, sun and moon, in the style of `src/ui/icons.tsx`.
- The breakpoint at which the header button drops its label.
- The exact token for each of the 66 literals, within §3 of the handoff.
- Order of work. Suggested: tokens and rename, theme module and header control, renderer palette, paper themes and controls, print and PDF, tests.

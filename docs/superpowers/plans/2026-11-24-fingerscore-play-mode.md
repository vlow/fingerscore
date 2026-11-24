# Play Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-screen performance view of the sheet with page turning, tempo-linked auto-scroll, zoom and a wake lock; the audio button is renamed to "Listen".

**Architecture:** Pure maths in `src/domain/playMode.ts`. A `PlayMode` overlay component renders the existing `Paper` with a new `readOnly` flag and owns scrolling, keys, the auto-scroll loop and the wake lock. `SheetPage` holds the open/closed state; `Transport` gets the entry button.

**Tech Stack:** React 18, TypeScript, CSS modules, zustand store (untouched), vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-fingerscore-play-mode-design.md` (and `fingerscore-handoff/SPEC.md` §11a after Task 1)

## Global Constraints

- Turn distance: 88% of the visible height. Tap zones: 12% of the width.
- Zoom: 75–200%, step 25, default 125. Speed factor: 50–200%, step 5, default 100.
- Speed uses the sheet's real average beats per line, not the spec's fixed 16.
- Preferences live in `localStorage` key `fingerscore.playmode` as `{ zoom: number, speed: number }` (percent integers). No migrations.
- Play mode never changes the document.
- Copy: "Play mode", "Listen", "Listen from selected", "Stop", "Exit", "Auto-scroll", "Pause", "Speed", "A−", "A+", "Page n / m".
- Colours from the prototype: overlay `#EEF0F2`, bar `#15171C`, buttons `#2A2D33`, active `#5FD3C6` on `#15171C`, dividers `#3A3D44`, readout `#C9CDD3`.

## Review Focus

1. A sheet that fits on one screen: indicator reads "Page 1 / 1", turning does nothing, auto-scroll switches itself off at once.
2. Corrupt or out-of-range stored preferences fall back to 125 and 100.
3. A browser without `navigator.wakeLock`, or one that rejects the request: play mode opens all the same.
4. Keys pressed while the speed slider has focus: arrows move the slider, they do not turn the page; Esc still exits.
5. Leaving the sheet page (browser back) while auto-scroll runs: the animation frame is cancelled and the lock released.

---

### Task 1: Handoff update and the Listen rename

**Files:**
- Replace: `fingerscore-handoff/` with the extracted zip `/Users/f.engel/Code/fingerscore/handoffs/fingerscore-playmode.zip`, without `reference/`
- Modify: `src/ui/Transport.tsx`, `src/pages/SheetPage.tsx` (`SHEET_LABEL`), comments in `src/pages/sheet/usePlayback.ts`
- Test: every test and e2e spec that names the button "Play" or "Play from selected" (`grep -rn "Play" src e2e`)

- [ ] **Step 1:** Change the tests to expect `Listen`, `Listen from selected` and the label `Sheet music. Arrow keys select a note, Enter listens from it.` Run `npm test`; expect failures in those tests.
- [ ] **Step 2:** Rename in `Transport.tsx` and `SheetPage.tsx`. Run `npm test`; expect PASS.
- [ ] **Step 3:** Copy the handoff. `git diff --stat fingerscore-handoff` shows `SPEC.md`, `CLAUDE.md` and five `Editor*.dc.html`.
- [ ] **Step 4:** Commit `feat: the audio button reads Listen; handoff with play mode (§11a)`.

### Task 2: Play mode maths

**Files:**
- Create: `src/domain/playMode.ts`, `src/domain/playMode.test.ts`

**Interfaces — Produces:**

```ts
export const ZOOM = { min: 75, max: 200, step: 25, initial: 125 } as const;
export const SPEED = { min: 50, max: 200, step: 5, initial: 100 } as const;
export const TURN = 0.88;
/** Quarter-note beats on an average line: sum of bar caps / TPQ / systems. 0 systems → 0. */
export function beatsPerLine(doc: Doc, systems: number): number;
/** Seconds one line takes at this tempo and speed factor (percent). */
export function lineSeconds(beats: number, tempo: number, speed: number): number;
/** Pixels per second: systemHeight · zoom / lineSeconds. 0 when beats is 0. */
export function scrollSpeed(beats: number, tempo: number, speed: number, zoom: number): number;
export function pageCount(scrollHeight: number, clientHeight: number): number;
export function pageNumber(scrollTop: number, scrollHeight: number, clientHeight: number): number;
/** Clamped scrollTop after a turn; dir is 1 or -1. */
export function turnTarget(scrollTop: number, scrollHeight: number, clientHeight: number, dir: 1 | -1): number;
export function stepZoom(zoom: number, dir: 1 | -1): number;
export function clampZoom(v: unknown): number;   // not a finite number or out of range → initial
export function clampSpeed(v: unknown): number;
/** "100% · 1 line / 10 s" */
export function speedLabel(beats: number, tempo: number, speed: number): string;
```

- [ ] **Step 1: Failing tests** with these assertions:
  - `beatsPerLine(mkDoc of 8 bars of 48 ticks, 2)` = 16; 6/8 doc of 8 bars of 36 ticks on 2 lines = 12.
  - `lineSeconds(16, 100, 100)` = 9.6; at speed 200 = 4.8.
  - `scrollSpeed(16, 100, 100, 125)` ≈ 290 · 1.25 / 9.6; `scrollSpeed(0, 100, 100, 125)` = 0.
  - `pageCount(1000, 1000)` = 1; `pageCount(2760, 1000)` = 3; `pageNumber(0, 2760, 1000)` = 1; `pageNumber(880, 2760, 1000)` = 2; `pageNumber(1760, 2760, 1000)` = 3; `pageNumber(5000, 2760, 1000)` = 3.
  - `turnTarget(0, 2760, 1000, 1)` = 880; `turnTarget(1700, 2760, 1000, 1)` = 1760; `turnTarget(100, 2760, 1000, -1)` = 0.
  - `stepZoom(200, 1)` = 200; `stepZoom(75, -1)` = 75; `stepZoom(125, 1)` = 150.
  - `clampZoom('x')` = 125; `clampZoom(300)` = 125; `clampZoom(150)` = 150; `clampSpeed(NaN)` = 100.
  - `speedLabel(16, 100, 100)` = `'100% · 1 line / 10 s'`.
- [ ] **Step 2:** `npx vitest run src/domain/playMode.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement. `pageCount` = max(1, ⌈(scrollHeight − clientHeight) / (TURN · clientHeight)⌉ + 1); `pageNumber` = min(⌊scrollTop / (TURN · clientHeight) + 0.05⌋ + 1, pageCount).
- [ ] **Step 4:** Run → PASS. Commit `feat: play mode maths`.

### Task 3: Read-only paper

**Files:**
- Modify: `src/render/Paper.tsx`, `src/render/SystemView.tsx`, `src/render/Paper.module.css`
- Test: `src/render/Paper.test.tsx`

**Interfaces — Produces:** `PaperProps.readOnly?: boolean`; with it `selectedId`, `onSelect`, `onTitle`, `onSubtitle` become optional. `SystemViewProps.readOnly?: boolean`.

- [ ] **Step 1: Failing test** `readOnly draws plain headings and nothing to click`: with `readOnly`, no `textbox` role exists, the title text is in an `h1`, `container.querySelectorAll('[data-hit]')` is empty, an empty subtitle renders no element, and `renderUnderChart` passed alongside is never called.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Plain title and subtitle reuse the input's typography classes.
- [ ] **Step 4:** `npm test` → PASS. Commit `feat: Paper can render read-only`.

### Task 4: The PlayMode overlay

**Files:**
- Create: `src/state/playModePrefs.ts`, `src/ui/PlayMode.tsx`, `src/ui/PlayMode.module.css`, `src/ui/PlayMode.test.tsx`

**Interfaces:**
- Consumes: Task 2 functions, `Paper readOnly`, `readJSON`/`writeJSON` from `src/state/storage.ts`.
- Produces:

```ts
// playModePrefs.ts
export interface PlayModePrefs { zoom: number; speed: number }
export function readPlayModePrefs(): PlayModePrefs;      // clamped, defaults on anything unreadable
export function writePlayModePrefs(p: PlayModePrefs): void;
// PlayMode.tsx
export default function PlayMode(p: { doc: Doc; derived: Derived; layout: SheetLayout; onExit(): void }): JSX.Element;
```

Structure (after the prototype): `div[role=region][aria-label="Play mode"][tabIndex=-1]` focused on mount, containing the scroller (`data-testid="play-scroller"`), two tap-zone buttons ("Previous page", "Next page", `tabIndex=-1`, bottom 88px free), and `div[role=toolbar][aria-label="Play mode controls"]`. The paper wrapper has `style={{ zoom: zoom / 100 }}`.

Keys on the region: → ↓ PageDown Space next; ← ↑ PageUp previous; a/A auto-scroll; + = larger; − smaller; Escape exit. Keys from an `input` are left alone except Escape; Space and Enter from a `button` are left alone.

Auto-scroll: one effect keyed on the running flag; reads speed from refs so slider and zoom changes apply without a restart; stops and sets the flag off when `scrollTop + clientHeight >= scrollHeight - 2`.

Wake lock: request on mount if `navigator.wakeLock` exists, again on `visibilitychange` to visible, release on unmount; every call guarded.

- [ ] **Step 1: Failing tests** (jsdom: stub `scrollTo` on the scroller and define `clientHeight`/`scrollHeight` with `Object.defineProperty`):
  - renders the region, the read-only title, "Page 1 / 1" and no textbox;
  - with scrollHeight 2760 and clientHeight 1000: `→` calls `scrollTo({ top: 880, behavior: 'smooth' })`; after setting `scrollTop = 880` and firing `scroll`, the indicator reads "Page 2 / 3";
  - clicking "Next page" turns as well; `←` at the top targets 0;
  - `Escape` calls `onExit`; so does the Exit button;
  - `+` sets the paper wrapper's zoom to 1.5 and writes `{ zoom: 150, speed: 100 }` to `fingerscore.playmode`; stored `{ zoom: 999, speed: 'x' }` renders at 1.25;
  - `a` sets `aria-pressed="true"` and the label "Pause"; with a one-screen sheet it falls back to "Auto-scroll" after one animation frame (fake timers / stubbed rAF);
  - the readout shows `speedLabel` for the doc; moving the slider to 200 halves the seconds;
  - `ArrowRight` on the slider does not call `scrollTo`;
  - mounts without `navigator.wakeLock`, and with one whose `request` rejects; with a working stub, unmount calls `release` and cancels the animation frame.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement component, CSS and prefs.
- [ ] **Step 4:** `npm test` → PASS. Commit `feat: play mode overlay`.

### Task 5: Wire into the sheet page

**Files:**
- Modify: `src/ui/Transport.tsx`, `src/ui/Transport.module.css`, `src/pages/SheetPage.tsx`, `src/styles/print.css` if the overlay needs hiding in print
- Test: `src/pages/SheetPage.test.tsx`, `e2e/play-mode.spec.ts`

**Interfaces — Consumes:** `PlayMode` (Task 4). `Transport` gains `onPlayMode(): void`; the button is first in the group.

- [ ] **Step 1: Failing tests** in `SheetPage.test.tsx`: clicking "Play mode" shows the region "Play mode", and the page wrapper has the `inert` attribute; with audio playing, entering stops it (button reads "Listen" after exit); with a note selected in Edit notes, after enter and Escape the mode is View and nothing is selected; after Escape the "Play mode" button has focus.
- [ ] **Step 2:** Run → FAIL. Implement: `const [performing, setPerforming] = useState(false)`; enter = stop player, `changeMode('view', false)`, `select(null)`, `closeAlt(false)`.
- [ ] **Step 3:** `npm test` → PASS.
- [ ] **Step 4:** `e2e/play-mode.spec.ts`, sample sheet at viewport 1280×800: enter play mode; no `textbox`, no `[data-hit]` inside the region; `ArrowRight` moves the scroller's `scrollTop` to 0.88 × its `clientHeight` (±2); the indicator reads "Page 2 / n"; press `a`, `scrollTop` grows within 1.5 s; reload-free re-entry keeps a changed zoom; `Escape` removes the region and the "Sheet title" textbox is back. Run `npx playwright test e2e/play-mode.spec.ts e2e/core-path.spec.ts` → PASS.
- [ ] **Step 5:** `npm run build && npm test && npm run test:e2e` → PASS. Commit `feat: play mode on the sheet page`.

### Task 6: README

- [ ] Add one or two sentences on play mode to `README.md` where the features are listed. Commit `docs: play mode`.

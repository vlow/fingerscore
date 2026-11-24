# Acceptance suite and accessibility pass (part 6b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A numbered acceptance suite for the 12 handoff checks and 10 version 2 checks, an accessibility scan with measured checks that ends at zero findings, and the fixes both turn up.

**Architecture:** Two new Playwright files share one helper module that brings the app into each named state. The accessibility file starts against a baseline of recorded findings; fix tasks empty the baseline and the last one deletes it. The acceptance file is written last, on the fixed app.

**Tech Stack:** Playwright (Chromium), `@axe-core/playwright` (development only), Vitest, React 18, CSS modules.

**Spec:** `docs/superpowers/specs/2026-11-24-fingerscore-v2-quality-design.md`

## Global Constraints

- Everything loaded at page start stays at or under 400,000 bytes (`npm run build && npm run check:bundle`); it is 396,061 bytes. If a fix does not fit, move code out of the start set; do not raise the limit.
- `@axe-core/playwright` is a devDependency. It is not imported from `src`. `npm run notices -- --check` keeps passing.
- Fixtures are self-made, small, and live in `e2e/fixtures`. Never read, copy or commit anything from `samples/` or `fingerscore-handoff/reference/`.
- The existing tests keep passing (1543 unit, 85 end-to-end + 2 skipped, 1 preview). A test changes only when the behaviour it pins changes on purpose; the report names each one.
- Print styles and PDF output do not change. `e2e/pdf*.spec.ts`, the print tests in `e2e/scales.spec.ts` and the PDF unit tests pass unchanged. A fix that would alter them applies to the screen only.
- Handoff colours and shapes (fingerscore-handoff/SPEC.md section 15) stay unless one fails the rule; then the nearest passing value replaces it, in `src/styles/tokens.css` where a token exists.
- Scan rule sets: axe tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`. End state: zero findings. An exclusion covers one rule on one selector and carries a written reason.
- Target sizes: 36 × 36 px for every control, 44 × 44 px for primary actions and the header navigation, measured on the area that takes the click. A link inside a sentence is exempt. A note on the paper: at least 24 px high.
- Every new test is shown failing once (on the defect it guards or on a deliberate break) and the report holds that output.
- Chromium only. TypeScript: no `Array.prototype.at`. Do not stop a server on port 5173. Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. A state is scanned before its lazy code or fonts have arrived, and the scan passes on an empty page → every state helper waits for a landmark of that state and for `document.fonts.ready`; a test asserts each state shows its landmark before the scan (Task 1).
2. A control that grows pushes a toolbar row out of its card at common widths → no page scrolls sideways at 320, 768 and 1024 px in the sheet, start and scales states (Task 3).
3. A taller note click area covers the alternate-fingering pill or the neighbouring line → a click on a note selects that note, a click on a pill opens its popover, in a dense bar and at a system boundary (Task 3).
4. Shortcut keys fire while the player types text → typing "Bag ace" into a lyric and "Cage" into a chord field changes no note and no length (Task 3).
5. A colour fix changes the printed sheet or the PDF → the PDF and print tests run unchanged in every fix task; a token used by the paper is changed only if the paper's own contrast fails (Tasks 2 and 3).

---

### Task 1: States helper, scan, measured checks, baseline

**Files:**
- Modify: `package.json` (devDependency `@axe-core/playwright`), `package-lock.json`
- Create: `e2e/states.ts`, `e2e/accessibility.spec.ts`, `e2e/a11y-baseline.json`, `e2e/a11yBaseline.ts`

**Interfaces:**
- Produces:
  - `e2e/states.ts`: `export interface AppState { id: string; landmark: (page: Page) => Locator; open: (page: Page) => Promise<void> }` and `export const STATES: AppState[]` with these ids, in this order: `start-empty`, `start-strip`, `start-library`, `start-refusal`, `tracks`, `sheet-view`, `sheet-edit-selected`, `sheet-lyrics`, `sheet-chords`, `sheet-out-of-range`, `sheet-alt-popover`, `sheet-file-menu`, `sheet-pdf-message`, `play-mode`, `scales`, `scales-alt-popover`, `about`, `imprint`, `privacy`, `terms`. `open` starts from cleared storage, reaches the state, waits for `landmark` and `document.fonts.ready`.
  - `export async function openState(page: Page, id: string): Promise<void>`.
  - `e2e/a11y-baseline.json`: `{ "axe": { [stateId]: { rule: string; target: string }[] }, "targets": { [stateId]: string[] }, "focus": { [stateId]: string[] } }`.
  - `e2e/a11yBaseline.ts`: `export function beyondBaseline(kind, stateId, found): string[]` — findings not in the baseline; `export function staleBaseline(kind, stateId, found): string[]` — baseline entries no longer found.

- [ ] **Step 1:** Install `@axe-core/playwright` as a devDependency. Run `npm run notices -- --check` — expected: exit 0.
- [ ] **Step 2:** Write `e2e/states.ts`. Reuse the ways the existing specs reach each state (`e2e/core-path.spec.ts`, `editing.spec.ts`, `library.spec.ts`, `play-mode.spec.ts`, `scales.spec.ts`, `pdf.spec.ts`, `import-formats.spec.ts`); do not change those files. `sheet-out-of-range` uses a deliberate shift; `sheet-pdf-message` uses a Cyrillic lyric; `start-refusal` drops a `.txt` file.
- [ ] **Step 3:** Write `e2e/accessibility.spec.ts` with four groups, each looping over `STATES`:
  - `landmark`: after `open`, the landmark is visible.
  - `scan`: axe with the tags of the Global Constraints; each finding becomes `{ rule, target }`; `beyondBaseline('axe', …)` is `[]` and `staleBaseline('axe', …)` is `[]`.
  - `targets`: for every visible `button, a[href], input, select, textarea, [role=button], [role=menuitem], [role=radio], [role=tab], [tabindex]:not([tabindex="-1"])` outside running text: need = 44 for a control with the attribute `data-primary` or inside `header nav`, else 36; the control passes when `document.elementFromPoint` at the centre ± need/2 − 1 px in x and in y (four points, clamped to the viewport) returns the control, a descendant, its label, or an element whose click the control handles (the control's `::before`/`::after` report the control itself). A link whose parent is a `p`, `li` or `span` with other text is exempt. Failures are recorded as a stable description (`role + accessible name`).
  - `focus`: press Tab until the focus returns to the start or 200 stops; at each stop the focused element has an outline or box-shadow that differs from its unfocused style; stops listed by description.
  If the environment variable `A11Y_SHOTS` names a folder, each state also saves `<folder>/<id>.png` (full page).
- [ ] **Step 4:** Run the file with an empty baseline (`{ "axe": {}, "targets": {}, "focus": {} }`) — expected: FAIL wherever the app has findings. Keep the output for the report. Then write the real findings into `e2e/a11y-baseline.json` (a small script or a `A11Y_WRITE_BASELINE=1` mode of the spec).
- [ ] **Step 5:** Run `npx playwright test e2e/accessibility.spec.ts` — expected: PASS. Show the gate works: add one fake violation (for example remove an `aria-label` locally), run, see the `scan` group fail, revert.
- [ ] **Step 6:** Save the "before" pictures: `A11Y_SHOTS=<the report folder given in your dispatch>/before npx playwright test e2e/accessibility.spec.ts`.
- [ ] **Step 7:** Run `npx tsc --noEmit -p .`, `npx vitest run`, `npm run test:e2e` — expected: all pass. Report: the number of findings per kind and state, and the total run time of the new file.
- [ ] **Step 8:** Commit — `test: accessibility scan and measured checks against a baseline of today's findings`

---

### Task 2: Fix the scan findings

**Files:**
- Modify: the components and CSS the baseline's `axe` entries point to; `src/styles/tokens.css` for colours; `e2e/a11y-baseline.json`
- Test: `e2e/accessibility.spec.ts` (existing), unit tests of each changed component

**Interfaces:**
- Consumes: `e2e/a11y-baseline.json`, `STATES` (Task 1).
- Produces: a baseline whose `axe` object is `{}`; a list `exclusions` in `e2e/accessibility.spec.ts`: `{ rule: string; selector: string; reason: string }[]`.

- [ ] **Step 1:** Group the `axe` entries by rule. For each rule write the fix in one sentence in the report before touching code.
- [ ] **Step 2:** Fix rule by rule:
  - Contrast: change the token to the nearest value with at least 4.5:1 for text and 3:1 for large text and for the borders or marks of controls. A colour drawn on the paper (notes, charts, lyrics, chords) changes only if the paper itself fails.
  - Names, roles, states: add the missing label, role or state in the component; add a unit test that reads it by role and name.
  - Ghost keys of the full key map (`#C3C7CE`): if the scan reports them, add the exclusion with the reason "unpressed keys drawn for orientation; the pressed keys carry the fingering". No other exclusion without a reason of the same kind.
  After each rule: remove its entries from the baseline and run `npx playwright test e2e/accessibility.spec.ts` — expected: PASS (the stale check forces the removal).
- [ ] **Step 3:** Add a unit test `src/a11yExclusions.test.ts` that reads `e2e/accessibility.spec.ts` and fails if `exclusions` has an entry without `reason` or more entries than the report of this task lists (pin the count).
- [ ] **Step 4:** Run `npx vitest run`, `npx tsc --noEmit -p .`, `npm run test:e2e`, `npm run test:e2e:preview`, `npm run build && npm run check:bundle` — expected: all pass; report the start-set size and every changed colour as old → new with its measured contrast.
- [ ] **Step 5:** Commit — `fix: accessibility scan findings (contrast, names, states)`

---

### Task 3: Sizes, focus, keyboard, announcements, motion, narrow screens; baseline deleted

**Files:**
- Modify: `src/styles/global.css` (footer links), `src/ui/Transport.module.css`, `src/ui/PlayMode.module.css` (sliders), `src/render/SystemView.tsx` (`MIN_HIT`), `src/pages/SheetPage.tsx` (paper description), `src/pages/sheet/useSelection.ts` (announcement), whatever else the baseline's `targets` and `focus` entries name
- Modify: `e2e/accessibility.spec.ts`, `e2e/states.ts` if a state needs it
- Delete: `e2e/a11y-baseline.json`, `e2e/a11yBaseline.ts`

**Interfaces:**
- Consumes: baseline with `axe: {}` (Task 2).
- Produces: `e2e/accessibility.spec.ts` that requires zero findings minus `exclusions`; no baseline.

- [ ] **Step 1: Sizes.** Fix every `targets` entry. Known ones: footer links (give each a 36 px hit height without changing the text size), the two range sliders (36 px hit height), any control the baseline names. The alternate-fingering pill keeps its look. Note click areas: at least 24 px high (`MIN_HIT` is 16 today); the width keeps following the note spacing. Add to the spec: in the sample sheet, a click on a note in the densest bar selects that note; a click on an alternate-fingering pill opens its popover; a click on a note in the last bar of a system selects that note and not one in the next system. Report the smallest note click-area width measured.
- [ ] **Step 2: Focus.** Fix every `focus` entry: a visible mark with at least 3:1 contrast against its background.
- [ ] **Step 3: Delete the baseline** and the baseline module; the three groups now assert zero findings (minus `exclusions`). Run the file — expected: PASS.
- [ ] **Step 4: New tests in `e2e/accessibility.spec.ts`,** each shown failing first where the behaviour is new:
  - `keyboard only`: with no mouse action, choose an instrument, open the sample, make the sheet, switch to Edit notes, change the selected note's pitch, switch to Lyrics and type "Bag ace", switch to Chords and type "Cage", save, open the File menu and start Download JSON, enter play mode, leave it with Esc. Assert after the typing that the notes and lengths of the sheet equal those before the typing. Assert that Esc on the File menu and on the alternate-fingering popover returns focus to the control that opened it.
  - `announcements`: the import refusal has `role="alert"`; save status and PDF messages are in a `role="status"` region; selecting a note in Edit notes puts "Selected: <pitch>, <length>, bar <n>" into the live region (the length is new: add it in `useSelection.ts`, with a unit test).
  - `paper description`: the paper keeps its accessible name and has an accessible description that contains the title, the instrument name and the written key; it updates when the title changes.
  - `reduced motion`: with `page.emulateMedia({ reducedMotion: 'reduce' })`, a page turn in play mode changes the scroll position within one frame (no smooth scrolling).
  - `narrow screens`: at 320 × 640, 768 × 1024 and 1024 × 768 no state scrolls sideways (`documentElement.scrollWidth <= clientWidth`); the paper's own container is allowed to scroll.
- [ ] **Step 5:** Save the "after" pictures: `A11Y_SHOTS=<the report folder given in your dispatch>/after npx playwright test e2e/accessibility.spec.ts`. List in the report every state whose picture changed and what changed.
- [ ] **Step 6:** Run `npx vitest run`, `npx tsc --noEmit -p .`, `npm run test:e2e`, `npm run test:e2e:preview`, `npm run build && npm run check:bundle` — expected: all pass; report the start-set size.
- [ ] **Step 7:** Commit — `fix: target sizes, note click areas, paper description, selection announcement; the accessibility checks require zero findings`

---

### Task 4: Acceptance suite

**Files:**
- Create: `e2e/acceptance.spec.ts`, `src/acceptanceIndex.test.ts`
- Create: `e2e/fixtures/full.mscx`, `e2e/fixtures/dorian.abc`, `e2e/fixtures/cut-time.abc`, `e2e/fixtures/repeat.abc`

**Interfaces:**
- Consumes: `openState`, `STATES` from `e2e/states.ts`; helpers of `e2e/pdfHelpers.ts`, `e2e/readPdf.ts`.
- Produces: tests titled `A01 …` to `A12 …` and `V01 …` to `V10 …`, one each.

- [ ] **Step 1: Write the four fixtures.** `full.mscx`: a MuseScore 4 score, one staff, 8 bars, 3/4, D major, with a title, one lyric line and three chord symbols. `dorian.abc`: `K:Ddor`, 8 bars. `cut-time.abc`: `M:C|`, 8 bars, with `Q:1/2=60`. `repeat.abc`: 4/4, a pickup, `|: … :|` with `[1` and `[2` endings, 20 notes on the page.
- [ ] **Step 2: Write `src/acceptanceIndex.test.ts`:** reads `e2e/acceptance.spec.ts`, collects the titles of `test(` calls, and asserts that the numbers `A01`–`A12` and `V01`–`V10` each start exactly one title and that no other test is in the file. Run it — expected: FAIL (file missing).
- [ ] **Step 3: Write the A tests** (handoff SPEC section 16; the sample is Auld Lang Syne):
  - A01 Xaphoon C, sample: suggested shift 0, written F major, range C4–D5, no out-of-range note, the range card's verdict as the app words it.
  - A02 Xaphoon C: shift the sample down until notes fall below C4; the red banner names the count, that many noteheads are red, that many charts show "!".
  - A03 sample: alto sax written F major / sounds A♭ major; B♭ clarinet written C major / sounds B♭ major; tenor sax written F major / sounds E♭ major.
  - A04 alto sax key bridge: set "Sounds in" to D major → written B major.
  - A05 sample playback: 56 notes, 39.0 s at ♩ = 100 (the transport's total or the schedule the page exposes); `repeat.abc`: the notes played number the first pass plus the second pass to the second ending, and the first ending is skipped the second time.
  - A06 Edit notes: quarter → eighth inserts an eighth rest; a length that does not fit is disabled; undo restores the bar; the key is unchanged throughout.
  - A07 Chords: typing "Bb" shows "B♭"; "F#m7b5/C#" renders F♯m⁷♭⁵/C♯; transposing +2 moves the stored chords.
  - A08 Play mode: the editing UI is hidden; → and Space turn by 88 % of the viewport; auto-scroll at 100 % and ♩ = 100 moves one system per 9.6 s; Esc exits.
  - A09 Library: one saved sheet shows 1 bar + 4 empty bars and "All 1"; All opens the library view; filter, sort and search work; delete asks first; Play opens the sheet in play mode.
  - A10 Lyrics bulk: "Oh love is gen-tle" → Oh | love | is | gen- | tle on consecutive notes.
  - A11 Save → "Saved"; a change → "Unsaved changes"; Download JSON then Open JSON gives the same document (compare the parsed files); a foreign JSON is refused.
  - A12 Scales: A harmonic minor contains G♯; E blues is E G A B♭ B D; C chromatic rises with sharps and falls with flats.
  The head comment of the file names the unit tests that pin the handoff's own numbers on the handoff song (`src/domain/transpose.test.ts`, `src/domain/playback.test.ts`, `src/pages/SheetPage.test.tsx`, by test title).
- [ ] **Step 4: Write the V tests** as design section 5.1 lists them (V01–V10), with `full.mscx`, `dorian.abc`, `cut-time.abc` and the existing `triplet.abc`. V03: the playback duration is the one `Q:1/2=60` gives for 8 bars of 2/2 (16 s). V08 on a sheet: the automatic alternate follows the neighbours for one named note of the sample; a manual pick survives a reload. V10: from the start page through sample, sheet, Download PDF, the four pages: every request URL has the page's origin.
- [ ] **Step 5:** For each test, break its assertion once (or the behaviour, where cheap) to see it fail; list in the report the line that failed for each number. A check that fails on the real app is a finding: fix it if the fix is under about 30 lines and touches one module; otherwise leave the test in place with `test.fixme` and the finding in the report under "Open defects".
- [ ] **Step 6:** Run `npx vitest run src/acceptanceIndex.test.ts` — expected: PASS. Run `npx vitest run`, `npx tsc --noEmit -p .`, `npm run test:e2e`, `npm run test:e2e:preview` — expected: all pass. Report the run time of `e2e/acceptance.spec.ts` and the list "check → differs from the handoff because …" for A01, A02, A03, A05.
- [ ] **Step 7:** Commit — `test: acceptance suite, A01–A12 from the handoff and V01–V10 for version 2`

---

### Task 5: README and corrections

**Files:**
- Modify: `README.md`, `e2e/play-mode.spec.ts` (comment only), `docs/superpowers/specs/2026-11-24-fingerscore-v2-quality-design.md` (only where the build differs)

**Interfaces:**
- Consumes: the reports of Tasks 1–4.

- [ ] **Step 1:** README section "Checks": what `e2e/acceptance.spec.ts` covers (the 12 handoff checks and 10 version 2 checks, with the note that checks 1, 2, 3 and 5 pin the shipped sample and unit tests pin the handoff song); how to run one check (`npx playwright test e2e/acceptance.spec.ts -g "A05"`); what `e2e/accessibility.spec.ts` covers (the 20 states, the rule sets, target sizes, focus, keyboard, announcements, reduced motion, narrow screens); the exclusions with their reasons; what was not tested (a real screen reader, a real phone, browsers other than Chromium). Remove the items "accessibility pass" and "acceptance suite" from any not-done list.
- [ ] **Step 2:** In `e2e/play-mode.spec.ts` the comment "§14 check 8" becomes "§16 check 8".
- [ ] **Step 3:** Correct the design document where the build differs (exclusions actually made, sizes actually chosen). Change nothing else.
- [ ] **Step 4:** Run `npx vitest run`, `npx tsc --noEmit -p .`, `npm run test:e2e` — expected: all pass.
- [ ] **Step 5:** Commit — `docs: the checks section of the README; corrections`

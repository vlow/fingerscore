# D.C., D.S., Segno, Coda and Fine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The six common jumps and their marks are imported, played, drawn, printed and editable; a song whose marks do not add up plays straight and says why.

**Architecture:** A bar carries the marks as optional fields. One domain module knows the play order after a jump and the problems of a document; playback, the sheet page and the importers use it. A sheet with marks gets one more row above the staff in every system. Play mode leaves the start set and the glyph data loses its prose, to make room.

**Tech Stack:** TypeScript 7 strict, React 18, Vitest, Playwright, the existing importers (DOM reading for MusicXML and MuseScore, the abcjs parser for ABC), Bravura outlines via `npm run glyphs`.

**Spec:** `docs/superpowers/specs/2026-11-24-fingerscore-jumps-design.md`

## Global Constraints

- Everything loaded at page start stays at or under 410,000 bytes (`npm run build && npm run check:bundle`; the owner raised the limit for dark mode). It is 405,390 bytes. Task 1 must bring it to 397,000 bytes or less before any mark is built; if it does not, stop and report.
- Dark mode (merged from main on 2026-11-25): everything drawn on the paper takes its colours from the palette (`src/render/palette`), never a fixed colour; the PDF keeps the light palette; stylesheets use the `--c-*` variables; `e2e/dark-mode.spec.ts` (D01–D06) and the accessibility scan in both themes keep passing.
- The six jumps are `dc`, `dcFine`, `dcCoda`, `ds`, `dsFine`, `dsCoda`. Their texts on the sheet are "D.C.", "D.C. al Fine", "D.C. al Coda", "D.S.", "D.S. al Fine", "D.S. al Coda". The other texts are "Fine" and "To Coda".
- New bar fields are optional and absent when unset: `segno?: true`, `coda?: true`, `fine?: true`, `toCoda?: true`, `jump?: Jump`. A saved sheet without them opens and plays as before. No migration.
- A sheet without any mark keeps today's layout to the pixel: the existing layout, PDF, print and end-to-end tests pass unchanged.
- Sheet, playback and PDF agree: a mark that is drawn is either played or named in the notice.
- Every jump is taken at most once; the play order ends.
- The accessibility file keeps passing with zero findings and no exclusion: new controls have a 36 px click area, an accessible name that contains their visible text, a visible focus mark, and work by keyboard.
- CI rules: code under `src` comes with unit tests; a new dependency is not needed and not added; no test depends on macOS rendering; a unit test with a wall-clock budget skips it when `instrumented` (`src/test/timing.ts`) is true; `npm run notices -- --check` keeps passing.
- Fixtures are self-made and live in `e2e/fixtures` or beside the unit tests. Never read from, copy or commit anything in `samples/`. The MuseScore structure to imitate is written in design section 5.4.
- Do not use the attribute name `data-mark` on drawn elements: the PDF preparation deletes `[data-mark]`.
- Site text: short sentences, no evaluative adjectives. TypeScript: no `Array.prototype.at`. Do not stop a server on port 5173. Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. A sheet saved before this part, and a downloaded JSON file from before, open, play and print exactly as before (Task 2).
2. Play mode opened by the library's "Play" link on a cold load, where the code has not arrived yet, and when the code cannot be loaded: the sheet stays usable, a message appears, nothing is stuck (Task 1).
3. MusicXML with several parts: the jump marks stand in one part only, often the top one; the player picks another track and still gets the marks (Task 3).
4. Removing or adding bars around marks: marks stay with their bars; removing the Segno bar of a D.S. gives the notice, not a crash; undo brings the mark back (Task 5).
5. A sheet with marks in the PDF: more rows per system change the number of systems per page; no system is cut at a page break, and the marks are on the page of their bar (Task 4).

---

### Task 1: Make room in the start set

**Files:**
- Modify: `src/pages/SheetPage.tsx` (play mode loaded on demand), `src/ui/PlayMode.tsx` only if an export must change, `scripts/extract-glyphs.ts`, `scripts/extract-glyphs.md`, `src/data/glyphs.json`
- Test: `src/pages/SheetPage.lazy.test.tsx`, `src/pages/SheetPage.test.tsx`, `e2e/play-mode.spec.ts`, `e2e/library.spec.ts`, a unit test for the glyph file's shape

**Interfaces:**
- Produces: play mode as its own chunk, requested the first time `performing` becomes true; `src/data/glyphs.json` holding only what the renderer reads (per glyph: its outline and the numbers the code uses), with the explanatory text moved to `scripts/extract-glyphs.md`.

- [ ] **Step 1:** Record the baseline: `npm run build && npm run check:bundle`; note the start-set bytes and the size of the play-mode code in it.
- [ ] **Step 2:** Write failing tests: (a) with the play-mode chunk not yet loaded, pressing "Play mode" keeps the sheet visible and usable and shows play mode once the chunk resolves; (b) when the chunk fails to load, a message "Play mode could not be loaded. Reload the page and try again." appears as an alert, the sheet is in its normal view, and the Play mode button works again after a later successful load; (c) arriving at `/sheet?…&mode=play` from the library behaves the same in both cases; (d) the glyph file has no key other than the ones the renderer reads.
- [ ] **Step 3:** Load play mode with `lazy` and a boundary that handles the failure as (b) says; do not render an inline fallback that changes the page. Keep `inert`, focus return and Esc as they are.
- [ ] **Step 4:** Change the glyph script so the bundled JSON carries no prose, move the prose to the `.md`, run `npm run glyphs`, and confirm the outlines are unchanged (compare the path data before and after in a test or a one-off script; report the result).
- [ ] **Step 5:** Run `npx vitest run`, `npx tsc --noEmit -p .`, `npm run test:e2e`, `npm run test:e2e:preview`, `npm run build && npm run check:bundle`. Report the start set before and after. If it is above 397,000 bytes, stop and report BLOCKED with the numbers.
- [ ] **Step 6:** Commit — `build: play mode loads on first use; the glyph data carries outlines only`

---

### Task 2: Model, play order, problems, persistence

**Files:**
- Modify: `src/domain/types.ts`, `src/domain/playback.ts`, `src/domain/persistence.ts`, `src/pages/sheet/usePlayback.ts` (the key that decides whether playback is rebuilt)
- Create: `src/domain/jumps.ts`, `src/domain/jumps.test.ts`
- Test: `src/domain/playback.test.ts`, `src/domain/persistence.test.ts`

**Interfaces:**
- Produces:
  - `export type Jump = 'dc' | 'dcFine' | 'dcCoda' | 'ds' | 'dsFine' | 'dsCoda'` and the five optional `Bar` fields of the Global Constraints, in `types.ts`. `Doc.source` gains `dropped?: string[]`.
  - `src/domain/jumps.ts`: `export const JUMP_TEXT: Record<Jump, string>`; `export type BarMark = 'segno' | 'coda' | 'fine' | 'toCoda'`; `export function hasJumpMarks(doc: Doc): boolean`; `export interface JumpProblem { bar: number; text: string }` (`bar` is a bar index); `export function jumpProblems(doc: Doc): JumpProblem[]`; `export function barLabelOf(doc: Doc, bar: number): number` if no such helper exists (a pickup bar is bar 0).
  - `src/domain/playback.ts`: `export function playOrder(doc: Doc): number[]` — bar indices in play order (today's private `barOrder`, extended).

- [ ] **Step 1: Write the failing tests** on small documents built in the test (bars named by letters, `|:` `:|` `1.` `2.` as needed):
  - No marks: `playOrder` equals today's order for a straight song, a repeat, a repeat with two endings.
  - `A B C D[dcFine]` with Fine on B → `A B C D A B`.
  - `A B[toCoda] C D[dcCoda] E[coda] F` → `A B C D A B E F`.
  - `A B[segno] C D[ds]` → `A B C D B C D`; with Fine on C → `A B C D B C`.
  - `A B[segno] C[toCoda] D[dsCoda] E[coda]` → `A B C D B C E`.
  - Plain `dc` with a Fine → stops at the Fine; without → runs to the end.
  - Repeat with endings before the jump: `|: A | 1. B :| 2. C | D[dc]` → `A B A C D A C D`.
  - A jump bar that ends a repeat: `|: A B[dc] :|` → `A B A B A B`.
  - A pickup bar with `dc` at the end → the pickup plays again.
  - A tie from the "To Coda" bar into the Coda bar when the Coda is the next bar is cut (`buildSchedule` gives two notes).
  - Every problem of design 5.3 has one test: its text names the mark, the printed bar number, and ends with "Playback ignores the jump."; with a problem, `playOrder` equals the order without the jump.
  - A Segno with a `dc` jump is no problem.
  - A document saved without the fields loads without them; one with every field round-trips through `serialize`/`parse` and through the library store; an unknown `jump` value in a file is dropped on load.
- [ ] **Step 2:** Run `npx vitest run src/domain` — expected: FAIL.
- [ ] **Step 3:** Implement. The play order keeps one function; after the jump it runs in a mode where end repeats are ignored and, in a group of endings, only the highest ending present is played. Problems are found first; with any problem the jump is ignored. Keep the 4 × bar-count cap.
- [ ] **Step 4:** Run `npx vitest run`, `npx tsc --noEmit -p .` — expected: PASS.
- [ ] **Step 5:** Commit — `feat: jump marks in the model; play order and problems`

---

### Task 3: Import from MusicXML, MuseScore and ABC

**Files:**
- Modify: `src/import/types.ts`, `src/import/musicxml.ts`, `src/import/mscz/common.ts`, `src/import/mscz/shared.ts`, `src/import/mscz/v2.ts`, `src/import/mscz/v3.ts`, `src/import/abc.ts`, `src/import/abcjs.d.ts`, `src/import/bars.ts`, `src/import/buildDoc.ts`, `src/ui/DropZone.tsx` or `src/domain/persistence.ts` where the import result message is made
- Test: the importers' test files; new self-made fixtures beside them

**Interfaces:**
- Consumes: `Jump`, the `Bar` fields, `Doc.source.dropped` (Task 2).
- Produces: `ParsedSong.marks` entries gain `segno?`, `coda?`, `fine?`, `toCoda?`, `jump?`; `ParsedSong.dropped: string[]` — one plain sentence per dropped mark, for example `"A second Segno in bar 12 was left out."`; `buildDoc` copies marks to bars and `dropped` to `doc.source.dropped`.

- [ ] **Step 1: Write the failing tests,** one fixture per case, written by hand:
  - MuseScore, in the structure of design 5.4, for each of versions 2, 3 and 4: `Marker` labels `segno`, `coda` (To Coda), `codab` (Coda), `fine`; `Jump` label triples for all six forms. Assert the bar of each mark. A `Jump` with another triple (for example `jumpTo` `segno2`) → nothing set and one `dropped` sentence. `playRepeats`, `eid`, `markerType` present → ignored.
  - MusicXML: `sound` inside a `direction` and directly in a `measure`; `segno`/`coda` elements in a direction and in a barline; words "D.S. al Coda" beside `dalsegno` → `dsCoda`; `dalsegno` without words in a file that has a `tocoda` → `dsCoda`, with a `fine` → `dsFine`, with neither → `ds`. A mark in the middle of a bar goes to the bar's edge. A two-part file with the marks only in part 1: choosing part 2 gives the same marks.
  - ABC: each decoration of design 5.4; `!dacoda!` → To Coda; a decoration on a bar line → Segno/Coda to the next bar, the others to the bar before; quoted text `"^D.S. al Coda"` → nothing. A tune whose bars are realigned by the importer keeps each mark on its music.
  - A mark behind the last note → dropped with a sentence.
  - `buildDoc`: marks land on `doc.score` bars; `dropped` lands in `doc.source.dropped`; the import result message lists the dropped sentences.
- [ ] **Step 2:** Run the importers' tests — expected: FAIL.
- [ ] **Step 3:** Implement the three readers and the plumbing. MuseScore: read `Marker` and `Jump` as measure children in every version. MusicXML: read the marks of every part and merge them by measure number before the chosen part is built.
- [ ] **Step 4:** Run `npx vitest run`, `npx tsc --noEmit -p .`, `npm run test:e2e` — expected: PASS (existing import tests unchanged).
- [ ] **Step 5:** Commit — `feat: jump marks from MusicXML, MuseScore and ABC`

---

### Task 4: Drawing, print and PDF

**Files:**
- Modify: `scripts/extract-glyphs.ts` (two glyphs: SMuFL `segno` U+E047 and `coda` U+E048), `src/data/glyphs.json`, `src/render/layout.ts`, `src/render/SystemView.tsx`, `src/render/TupletMark.tsx` if its limits depend on the band, `src/pdf/sheetPdf.ts`, `src/pdf/pageModel.ts`, `src/domain/playMode.ts` (page-turn pitch), `src/pdf/devHook.ts`
- Create: `src/render/JumpMarks.tsx` and its test
- Test: `src/render/layout.test.ts`, `src/render/Paper.test.tsx`, `src/pdf/*.test.ts`, `e2e/pdf-content.spec.ts`

**Interfaces:**
- Consumes: `hasJumpMarks`, `JUMP_TEXT` (Task 2).
- Produces: `export function markRow(doc: Doc): number` in `layout.ts` — 0 for a sheet without marks, otherwise the row's height in px; every consumer of the system height reads it from the layout (`SheetLayout` gains `systemHeight: number`) instead of `SHEET.systemHeight`; `JumpMarks` draws the marks of one bar and tags its elements with `data-jump="segno|coda|fine|toCoda|jump"`.

- [ ] **Step 1: Write the failing tests:**
  - Layout: a sheet without marks has `markRow` 0 and every number of `layoutSheet` equal to today's (compare against the current values for the sample fixture). A sheet with one mark: every system is taller by `markRow`, all systems the same height, staff and charts shifted down by `markRow`.
  - Drawing: Segno and Coda at the left edge of their bar; "Fine", "To Coda" with the Coda sign, and each jump text right-aligned at the right edge of their bar, bold italic; in a bar with an ending bracket, a triplet mark and a chord symbol, the bounding boxes of the marks overlap none of them and not the lyrics.
  - A long text in a short bar ("D.S. al Coda" in a 2/4 bar) stays inside the system's width.
  - PDF: the jump texts are text items in the bold italic font, the two signs are paths, each on the page of its bar; a sheet with marks and 20 systems breaks pages between systems and no system is cut; a sheet without marks gives the same page model as before.
  - Print: the marks are visible in print media; nothing else changes.
- [ ] **Step 2:** Run the tests — expected: FAIL.
- [ ] **Step 3:** Extract the two glyphs (`npm run glyphs`), implement the row and the marks, and replace every use of the fixed system height by the layout's. Play mode's page turn uses the layout's height.
- [ ] **Step 4:** Look at one rendered sheet with all marks and one PDF page of it (the dev hook or a test that writes pictures to the folder named in your dispatch); put the picture paths in the report.
- [ ] **Step 5:** Run `npx vitest run`, `npx tsc --noEmit -p .`, `npm run test:e2e`, `npm run test:e2e:preview`, `npm run build && npm run check:bundle` — expected: PASS; report the start-set bytes.
- [ ] **Step 6:** Commit — `feat: jump marks on the sheet, in print and in the PDF`

---

### Task 5: Editing and the notice

**Files:**
- Modify: `src/domain/edit.ts`, `src/ui/NotePanel.tsx` (+ CSS), `src/pages/sheet/useEditPanelSlot.tsx`, `src/pages/sheet/useSelection.ts` or where announcements are made, `src/pages/SheetPage.tsx`
- Create: `src/ui/JumpNotice.tsx` and its test
- Test: `src/domain/edit.test.ts`, `src/ui/NotePanel.test.tsx`, `src/pages/SheetPage.test.tsx`, `e2e/states.ts` (a state with marks, if a new one is needed), `e2e/accessibility.spec.ts` only if a state is added

**Interfaces:**
- Consumes: `Jump`, `BarMark`, `JUMP_TEXT`, `jumpProblems` (Task 2); `doc.source.dropped` (Task 3).
- Produces: `export function setBarMark(doc: Doc, bar: number, mark: BarMark, on: boolean): Doc` and `export function setJump(doc: Doc, bar: number, jump: Jump | null): Doc` in `edit.ts` — setting a mark that exists on another bar moves it; `JumpNotice` with props `{ problems: JumpProblem[]; dropped: string[] }`.

- [ ] **Step 1: Write the failing tests:**
  - `setBarMark`/`setJump`: set, clear, move from another bar (the earlier one is gone in the same result), unknown bar index returns the document unchanged; `removeBar` on a bar with marks removes them; `addBarAfter` leaves marks on their bars.
  - Panel: with a note selected, a section headed "Bar" shows toggles "Segno", "Coda" (start of the bar), "Fine", "To Coda" (end of the bar) with `aria-pressed`, and a select labelled "Jump at the end of the bar" with the options "None" and the six texts; each change is one undo step; Undo restores the earlier state including a moved mark.
  - Announcement: after a change the live region says the printed bar number and what the bar holds, for example "Bar 16: D.S. al Coda".
  - Notice: with a problem, an amber notice in its own place lists each problem text; it disappears when the marks add up; the existing banner still shows its own message at the same time; with `dropped` sentences the notice lists them too.
  - Removing the Segno bar of a `ds` song shows the notice; Undo removes it.
  - Keyboard: every new control is reachable with Tab and operable with Space/Enter and the arrow keys of a select.
- [ ] **Step 2:** Run the tests — expected: FAIL.
- [ ] **Step 3:** Implement. The section belongs to the bar of the selected event; rests count. The controls meet the size and name rules of the Global Constraints.
- [ ] **Step 4:** Run `npx vitest run`, `npx tsc --noEmit -p .`, `npm run test:e2e` (the accessibility file must pass unchanged or with the new state), `npm run build && npm run check:bundle` — expected: PASS; report the start-set bytes.
- [ ] **Step 5:** Commit — `feat: jump marks can be edited; a notice names marks that do not add up`

---

### Task 6: Acceptance check, README, documents

**Files:**
- Modify: `e2e/acceptance.spec.ts`, `src/acceptanceIndex.test.ts`, `README.md`, `docs/superpowers/specs/2026-11-24-fingerscore-jumps-design.md` (only where the build differs)
- Create: `e2e/fixtures/ds-coda.abc` (self-made)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1:** Change the index test to require V01–V11 for `e2e/acceptance.spec.ts` (the dark-mode file keeps D01–D06); run it — expected: FAIL.
- [ ] **Step 2:** Write `V11` in `e2e/acceptance.spec.ts`: import `ds-coda.abc` (a Segno, a "To Coda", a Coda, "D.S. al Coda", 8 short bars); the four marks are on the sheet in their bars; play at the fastest speed and assert the order of highlighted bars; with the keyboard only, select a note in the last bar, set the jump to "D.C. al Fine" and "Fine" on an earlier bar, see the texts change; Undo twice restores the imported marks; the downloaded PDF holds the text "D.S. al Coda". Keep it under 20 s; show one assertion failing once.
- [ ] **Step 3:** README: the feature list (the six forms, the three import formats, editing, the notice), what is not supported (double signs, D.S.S., quoted ABC text, jumps from MIDI, auto-scroll does not follow jumps or repeats), the "Checks" section (V11; count the checks the README names and correct the number), and remove D.C./Coda from any not-done list.
- [ ] **Step 4:** Correct the design where the build differs. Change nothing else.
- [ ] **Step 5:** Run `npx vitest run`, `npx tsc --noEmit -p .`, `npm run test:e2e`, `npm run test:e2e:preview`, `npm run notices -- --check`, `npm run build && npm run check:bundle` — expected: PASS.
- [ ] **Step 6:** Commit — `test: acceptance check V11 for jump marks; README`

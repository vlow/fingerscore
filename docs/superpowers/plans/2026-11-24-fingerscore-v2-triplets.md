# Triplets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eighth, quarter and sixteenth triplets are imported from all four formats, drawn with a 3, and can be made, changed and undone in Edit notes.

**Architecture:** The document stays a list of event lengths in ticks (12 per quarter). Triplet values (2, 4, 8, 16) join the eight plain values; one pure function derives the groups from a bar's lengths, and validation, import, drawing and editing all use it. Import snaps positions to whole ticks first, then decides per bar which windows are triplet groups and rounds the rest to sixteenths as before.

**Tech Stack:** TypeScript 7 strict (no `Array.prototype.at`), React 18, Vitest (globals, jsdom), Playwright. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-24-fingerscore-v2-triplets-design.md`

## Global Constraints

- Plain lengths: 3, 6, 9, 12, 18, 24, 36, 48. Triplet lengths: 2, 4, 8, 16. The two lists stay separate in code; nothing treats a triplet length as a plain one.
- Group spans and member lengths: S = 6 → 2, 4. S = 12 → 2, 4, 8. S = 24 → 4, 8, 16. A group starts at a multiple of S/2 in metric ticks and never crosses a bar line.
- Metric tick of an event = its tick from the bar start + (full bar capacity − the bar's `cap`). Only a pickup bar has `cap` below the full capacity.
- Notated value = length × 3/2 (2 → 3, 4 → 6, 8 → 12, 16 → 24).
- Every bar of every document that leaves an importer or an edit function is valid: lengths are plain or triplet values, they sum to `cap`, and every triplet-valued event lies in a group.
- Exact texts: button `Triplet`; shortcut key `P`; spoken lengths `triplet sixteenth`, `triplet eighth`, `triplet quarter`, `triplet half`; notice `Rhythm simplified: notes shorter than a sixteenth and tuplets other than triplets were rounded.`; keys line `Keys: ↑ ↓ pitch · A–G note · 2–6 length · . dot · P triplet · R rest · T tie`.
- No migration and no backward compatibility code.
- `samples/` and `fingerscore-handoff/reference/` are never committed or copied into fixtures.
- A task is done only when `npm test` and `npx tsc --noEmit -p .` pass. Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. A triplet at the end of a pickup bar, and a group that starts on the "and" (metric tick 6 for S = 12): import, validation and the editor must agree that it is a group. Expected: the same bar passes `tripletGroups`, is produced by import, and "Make a triplet" is enabled exactly where a group may start. (Tests in Tasks 1, 2, 4.)
2. Plain rhythms must never turn into triplets: sixteenths, dotted eighth plus sixteenth, a quintuplet, a note 0.021 quarter off the triplet grid. Expected: rounded as before, `simplified` set where rounding happened. (Task 2.)
3. Random sequences of edits, undo and redo. Expected: after every step every bar is valid and ids are unique. (Property-style test in Task 4.)
4. A crafted saved sheet with a lone length of 4, or a group that starts at an odd tick. Expected: refused as damaged. A sheet with triplets survives save, reload and a JSON round trip. (Tasks 1, 5.)
5. A 4/4 bar of 24 triplet sixteenths, and a bar mixing a quarter-triplet bracket with an ending bracket above it. Expected: note positions strictly increase, beams stay inside their groups, the 3 does not sit on the ending bracket. (Task 3.)

---

### Task 1: Model — triplet values, groups, validation

**Files:**
- Create: `src/domain/triplets.ts`
- Modify: `src/domain/time.ts`, `src/domain/persistence.ts`, `src/domain/edit.ts` (`lengthName` only)
- Test: `src/domain/triplets.test.ts`, `src/domain/persistence.test.ts`, `src/domain/edit.test.ts`

**Interfaces:**
- Produces in `time.ts`: `PLAIN_LENGTHS` (the existing `DURATIONS`, which stays exported under that name for existing callers), `TRIPLET_LENGTHS = [16, 8, 4, 2] as const`, `isPlainLength(d)`, `isTripletLength(d)`.
- Produces in `triplets.ts`:
  - `interface TripletGroup { start: number; span: 6 | 12 | 24; ids: string[] }` (`start` = tick from the bar start)
  - `tripletGroups(bar: Bar, fullCap: number): TripletGroup[] | null` — the groups left to right, or `null` when a triplet-valued event is in no group. Rule: design 4.1 (left to right; at the first ungrouped triplet-valued event a group starts; try S = 6, 12, 24; the start's metric tick must be a multiple of S/2; the following events must tile the window with that S's member lengths).
  - `groupOf(groups: TripletGroup[], id: string): TripletGroup | null`
  - `notatedLength(d: number): number` — `d × 3/2` for a triplet length, `d` otherwise.
  - `canStartGroup(metricTick: number, span: 6 | 12 | 24): boolean`
  - `MEMBER_LENGTHS: Record<6 | 12 | 24, readonly number[]>`
  - `tripletRests(ticks: number, span: 6 | 12 | 24): number[]` — member lengths, longest first, that sum to `ticks`; throws when impossible.
- Produces: `lengthName(d)` returns `triplet eighth` etc. for triplet lengths.
- Produces: `validateDoc` accepts triplet lengths and refuses a bar for which `tripletGroups` is `null`.

- [ ] **Step 1: Failing tests.** `triplets.test.ts`, with a helper that builds a bar from a list of lengths (all notes) and `cap`:
  - 4/4 (`cap` 48, `fullCap` 48), from tick 0, rest of the bar filled with plain lengths. Expected groups (start, span): `[4,4,4]` → (0,12); `[8,4]`, `[4,8]` → (0,12); `[2,2,2]`, `[4,2]`, `[2,4]` → (0,6); six 2s → (0,6),(6,6); `[8,8,8]`, `[16,8]`, `[8,16]` → (0,24); twelve 4s → four groups of 12; `[4,4,2,2]`, `[2,2,8]`, `[8,2,2]` → (0,12); `[8,4,4,8]` → (0,12),(12,12); `[12,8,4]` → (12,12); `[6,4,4,4]` → (6,12); `[3,2,2,2]` → (3,6); `[12,8,8,8]` → (12,24).
  - `null` for: `[4,4]` then plain; a lone `4`; `[3,4,4,4]` (start 3 is not a multiple of 6); `[6,8,8,8]` (start 6 is not a multiple of 12); `[4,4,4]` at the end of a bar where only 8 ticks remain; `[2,2]` then plain lengths; `[16,2,…]`.
  - 6/8 (`cap` 36): `[4,4,4,6,6,6,6]` → (0,12); `[18,4,4,4,6]` → (18,12).
  - Pickup: `cap` 12, `fullCap` 48, `[4,4,4]` → (0,12); `cap` 18, `[6,4,4,4]` → (6,12) (metric tick 36); `cap` 6, `[2,2,2]` → (0,6); `cap` 15, `[3,4,4,4]` → (3,12) (metric tick 36).
  - Rests as members give the same groups.
  - `notatedLength`: 2 → 3, 4 → 6, 8 → 12, 16 → 24, 12 → 12. `tripletRests(8, 12)` → `[8]`; `(6, 12)` → `[4, 2]`; `(4, 6)` → `[4]`; `(16, 24)` → `[16]`; `(20, 24)` → `[16, 4]`; `(3, 12)` throws.
  - `lengthName(4)` → `triplet eighth`; `(2)`, `(8)`, `(16)` accordingly; `lengthName(9)` unchanged.
  `persistence.test.ts`: a document with a bar `[4,4,4,12,24]` validates and round-trips through `serialise`/`parseFileText`; a bar `[4,12,8,24]` (a lone 4 and a lone 8) → refused as damaged; a bar `[3,4,4,4,…]` → refused; a length of 5 → refused.
- [ ] **Step 2:** Run `npx vitest run src/domain/triplets.test.ts src/domain/persistence.test.ts`; fail.
- [ ] **Step 3:** Implement. `validEvent` accepts plain or triplet lengths; `validBar` calls `tripletGroups` with the meter's full capacity. `splitDuration`, `isDuration` and `fits` in `edit.ts` keep meaning plain lengths.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit -p .` pass.
- [ ] **Step 5:** Commit `feat: triplet lengths and groups in the model; validation`.

### Task 2: Import — recognise triplet groups

**Files:**
- Modify: `src/import/quantise.ts`, `src/import/bars.ts`, `src/import/buildDoc.ts`, `src/pages/SheetPage.tsx` (the notice text)
- Create: `src/import/tripletWindows.ts`
- Test: `src/import/core.test.ts` (or the file that tests `quantise`/`toBars` today), `src/import/tripletWindows.test.ts`, `src/import/musicxml.test.ts`, `src/import/mscz.test.ts`, `src/import/abc.test.ts`, `src/import/midi.test.ts`, `src/import/samples.test.ts`

**Interfaces:**
- Consumes: Task 1 (`tripletGroups`, `MEMBER_LENGTHS`, `canStartGroup`, `tripletRests`).
- Produces: `quantise(notes)` snaps every start and end to the nearest whole tick when it is within 0.02 quarter of it, otherwise to the nearest multiple of 3 with `simplified` true; durations stay at least 1 tick; the result is integer ticks that need not be multiples of 3.
- Produces in `tripletWindows.ts`: `findWindows(notes: QNote[], barStart: number, cap: number, fullCap: number): { start: number; span: 6 | 12 | 24 }[]` for one bar (ticks absolute, `start` absolute), by the five conditions of design 4.2, left to right, smallest span first.
- Produces: `toBars(notes, ts, pickupTicks, marks): { bars: Bar[]; rounded: boolean }` — inside a window the pieces are placed as members (silence as `tripletRests`); outside windows every start and end is rounded to the nearest multiple of 3 (`rounded` true when that moved anything) and split as today; a note is split and tied at window edges and bar lines.
- Produces: `buildDoc` sets `source.simplified` from `q.simplified || rounded || pickup rounding`.

- [ ] **Step 1: Failing tests** (positions in quarters into `buildDoc` or ticks into `toBars`, whichever the existing tests use; 4/4 unless said):
  - three notes at 0, 1/3, 2/3 of length 1/3, then a quarter, a half → bar lengths `[4,4,4,12,24]`, not simplified;
  - long-short: 0..2/3, 2/3..1 → `[8,4,…]`; short-long → `[4,8,…]`;
  - three triplet quarters 0..2 → `[8,8,8,24]` (one group of 24, no ties);
  - six triplet sixteenths in beat 1 → `[2,2,2,2,2,2,…]` and `tripletGroups` gives two groups of 6;
  - "eighth, eighth, two sixteenths" in triplet values (0, 1/3, 2/3, 5/6) → `[4,4,2,2,…]`;
  - a triplet with a silent middle (notes at 0 and 2/3) → `[4, rest 4, 4]`; a single note 0..2/3 then silence to the next beat → `[8, rest 4]`;
  - a triplet on beats 2–3 as quarter triplets (1..3) → `[12,8,8,8,12]`;
  - an eighth then a triplet starting on the "and" (0..0.5, then thirds of a quarter from 0.5 to 1.5) → `[6,4,4,4,6,…]`;
  - the last triplet note tied over the beat (2/3..2) → `[4,4,4 tie,12,…]` with the tie flag on the member and the plain note the same pitch;
  - a plain quarter tied into the first member of a triplet (0..1⅓ then 1⅓, 1⅔) → `[12 tie,4,4,4,…]`;
  - a group at the end of one bar and a note across the bar line;
  - pickup of one quarter holding a triplet → first bar `cap` 12 `[4,4,4]`; pickup of 1.5 quarters `[6,4,4,4]`;
  - 6/8: a triplet on beat 2 (1.5..2.5 quarters in three equal notes) → group at tick 18;
  - Review Focus 2: four sixteenths → `[3,3,3,3]`; dotted eighth + sixteenth → `[9,3]`; a quintuplet in one beat → rounded, `simplified` true, every bar valid; a note at 0.354 (0.021 off 1/3) → rounded, `simplified` true; a note at 0.345 (0.012 off) → triplet;
  - every produced bar passes `tripletGroups` (assert in a helper used by all of the above).
  - Per format, one test each that a triplet in the file arrives as `[4,4,4]`: MusicXML `<time-modification>` 3:2 on three eighths; MuseScore version 3 `<Tuplet>`…`<endTuplet/>` and version 2 `<Tuplet id>`; ABC `(3abc`; MIDI with three notes at exact thirds of the quarter (ppq 480: ticks 0, 160, 320). These go through `parseFile`/the parser and `buildDoc`.
  - `SheetPage` notice text is the new string (update the existing test that asserts the old one).
- [ ] **Step 2:** Run the focused files; fail.
- [ ] **Step 3:** Implement. Existing tests that assert `simplified` for a triplet input change to assert the triplet; say which in the report.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit -p .` pass.
- [ ] **Step 5:** If `samples/` exists, extend `samples.test.ts`: both Caprice copies build a sheet (through `buildDoc` with the default options) whose bars are all valid and contain at least 15 groups of span 12 and at least 30 groups of span 6; the version 3 and 4 sheets have equal lengths bar by bar; `the-entertainer-scott-joplin2-tuplets.mscz` builds a sheet with exactly one more group than `…2.mscz`; every other sample builds a sheet with all bars valid. Report the counts found and whether each sheet is marked simplified.
- [ ] **Step 6:** Commit `feat: import recognises eighth, quarter and sixteenth triplets`.

### Task 3: Drawing — the 3, brackets, beams, notated values

**Files:**
- Modify: `src/render/layout.ts`, `src/render/NoteView.tsx`, `src/render/SystemView.tsx`, print styles if the new marks need them
- Test: `src/render/layout.test.ts`, `src/render/Paper.test.tsx` (or the test file that renders a sheet today)

**Interfaces:**
- Consumes: Task 1.
- Produces in `layout.ts`: `SheetLayout.tuplets: TupletMark[]` with `interface TupletMark { bar: number; ids: string[]; beamed: boolean }` (`beamed`: one beam joins all members, so the number stands alone); `beamGroups` forms beams by group inside a triplet group (members of notated length 3 or 6, across beat boundaries inside the group, never across its edge) and keeps the beat rule for plain events, which never beam with a triplet member. `BeamGroup.beams` is computed from notated lengths.
- Produces in the SVG: for each mark a `<g data-tuplet="">` holding a `<text>` with `3` and, when not `beamed`, a bracket path with `data-tuplet-bracket=""`; attribute `data-tuplet-side="above" | "below"`.

- [ ] **Step 1: Failing tests.**
  - `layout.test.ts`: `[4,4,4,12,24]` → one beam group of the three ids with 1 beam, one mark with `beamed` true; `[2,2,2,2,2,2,…]` → two beam groups of 2 beams, two marks; `[8,4,…]` → no beam, mark with `beamed` false; `[4, rest 4, 4]` → no beam joining across the rest, `beamed` false; `[4,4,2,2]` → one beam group marked `mixed`, `beamed` true; in 6/8 a group at ticks 12..24 beams as one group although the beat boundary at 18 lies inside; a plain eighth next to a triplet eighth is not in its beam; twelve plain eighths still beam by beat as before; Review Focus 5: a bar of 24 lengths of 2 gives 24 strictly increasing x positions and eight beam groups of three.
  - Width: a 4/4 bar `[4,4,4,…]` has a larger weight than a bar of plain eighths, and a bar with a 2 a larger one still (assert through the bars-per-system result for a score of such bars: fewer than 4 per system; for bars of 24 twos: 1 per system).
  - Render: a triplet eighth has one flag when alone and none when beamed; a member of 8 draws a filled head with a stem and no flag; a member of 16 an open head; a triplet eighth rest draws the eighth rest glyph; no `data-dot` inside a group. One `data-tuplet` per group with the text `3`; a bracket for `[8,4]` and none for `[4,4,4]`; for a group under an ending bracket (`volta: '1'` on its bar) with notes above the staff, `data-tuplet-side` is `below`, otherwise `above`; the mark's bounding box (computed from its attributes) does not intersect the chord line, the lyric line or the ending bracket line of `SHEET`.
- [ ] **Step 2:** Run; fail. **Step 3:** Implement; exact sizes and offsets are yours, in the look of standard engraving at the sheet's scale. **Step 4:** `npm test`, `npx tsc --noEmit -p .` pass.
- [ ] **Step 5:** Look at it: build a small sheet with each figure (the dev page `src/pages/DevSheet.tsx` or a scratch script that renders to an image, as earlier parts did) and put a screenshot path in the report; check print (`@media print`) shows the marks.
- [ ] **Step 6:** Commit `feat: draw triplets — number, bracket, beams by group, notated values`.

### Task 4: Edit rules for triplets

**Files:**
- Modify: `src/domain/edit.ts`
- Test: `src/domain/edit.test.ts`, `src/domain/edit.property.test.ts` (new)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `canMakeTriplet(doc, id): boolean`; `makeTriplet(doc, id): Doc | null`
  - `inTriplet(doc, id): boolean`; `undoTriplet(doc, id): { doc: Doc; selectId: string } | null`
  - `toggleTriplet(doc, id): { doc: Doc; selectId: string } | null` (make or undo; `selectId` is the first member, or the resulting event)
  - `lengthChoices(doc, id): { notated: number; d: number; enabled: boolean; pressed: boolean }[]` — the five base lengths 3, 6, 12, 24, 48 as the panel shows them; for a group member `d` is the triplet length for that notated value and only the group's member lengths that fit are enabled; for a plain event as today.
  - `setLength(doc, id, d)` accepts a triplet length for a group member and applies the bar-fill rules inside the window (design 4.4); for a plain event it behaves as today and, when it reaches into a group, removes covered members and turns the remainder of the window into plain rests.
  - `toggleDotted` returns `null` for a group member; `fits`/`dottedOf` unchanged for plain events.

Rules: design 4.4, each bullet. Every function returns a document whose bars are all valid.

- [ ] **Step 1: Failing tests** (`edit.test.ts`), 4/4 bars built from length lists:
  - make: on a quarter at tick 0 → `[4,4,4,…]`, first keeps id, pitch, lyric, chord, fingering choice; the two new are notes of the same pitch with new ids; on a rest → three rests; on an eighth at tick 6 → `[…,2,2,2,…]`; on a half at tick 12 → `[12,8,8,8,12]`; `canMakeTriplet` false for: a dotted quarter, a whole, a sixteenth, a quarter at tick 6, an event already in a group; tie moves to the third member when the next event has the same pitch, else it is cleared;
  - undo: `[4,4,4]` → one quarter with the first member's id; first member a rest and second a note → the result is a note with the second's id, pitch, lyric and chord; all rests → a rest; the tie of the last member survives when still valid; removed members' lyrics, chords and fingering choices are gone from the maps; `selectId` is the result's id;
  - length in a group: `[4,4,4]`, first to 8 → `[8,4]` (the second member is consumed, the third stays with its id); first to 2 → `[2, rest 2, 4, 4]`; in `[4,8]` the first to 8 → `[8,4]`, where the partly covered second member keeps its id and its end with length 4; in `[4,4,2,2]` the third to 4 → `[4,4,4]`; no choice ever fills the whole window with one event (assert through `lengthChoices`);
  - `lengthChoices` for a member of an eighth triplet: Sixteenth, Eighth, Quarter enabled when they fit before the window's end, Half and Whole disabled; the member's own notated value is `pressed`;
  - a plain quarter at tick 0 lengthened to a half over `[4,4,4]` at 12 → `[24,…]`, the three members removed; to a dotted quarter → `[18, rest 6,…]`; a plain eighth at tick 6 lengthened to a quarter over `[2,2,2]` at 12 → group removed;
  - pitch, rest toggle, tie toggle on a member work and keep the group; `toggleDotted` on a member returns `null`;
  - remove bar and add bar next to a bar with a group.
- [ ] **Step 2: Property-style test** (`edit.property.test.ts`): a seeded pseudo-random generator (no dependency) starts from a document of four 4/4 bars and applies 300 random operations from: `setLength` with every length from `lengthChoices` that is enabled, `toggleTriplet`, `shiftPitch`, `toggleRest`, `toggleTie`, `toggleDotted`, `addBarAfter`, `removeBar`, on a random event; after each, when the result is not `null`: every bar passes `tripletGroups` and sums to `cap`, all ids are unique, `validateDoc` accepts the document. Twenty seeds. On failure print the seed and the operation list.
- [ ] **Step 3:** Run; fail. **Step 4:** Implement. **Step 5:** `npm test`, `npx tsc --noEmit -p .` pass.
- [ ] **Step 6:** Commit `feat: make, change and undo triplets in the edit rules`.

### Task 5: Note panel, keys, announcements, end-to-end, README

**Files:**
- Modify: `src/ui/NotePanel.tsx`, `src/pages/sheet/useSheetKeys.ts`, `src/pages/sheet/useSelection.ts` if the announcement needs it, `src/pages/SheetPage.tsx` wiring for `selectId`, `README.md`
- Create: `e2e/triplets.spec.ts`, `e2e/fixtures/triplet.abc`
- Test: `src/ui/NotePanel.test.tsx`, `src/pages/SheetPage.test.tsx` (or the existing keyboard test file)

**Interfaces:**
- Consumes: Task 4 (`toggleTriplet`, `canMakeTriplet`, `inTriplet`, `lengthChoices`), Task 3 (the `data-tuplet` marks).

- [ ] **Step 1: Failing tests.**
  - Panel: a button named `Triplet` with `aria-keyshortcuts="P"` after `Dotted`; `aria-pressed` true on a member; disabled where `canMakeTriplet` is false and the event is not in a group; clicking it on a quarter gives three events and keeps the selection on the first; clicking it on a member gives one event and selects it; the Length buttons follow `lengthChoices` (on a member of an eighth triplet: Sixteenth, Eighth, Quarter enabled, the member's value pressed, Dotted disabled); the keys line is the exact text of the Global Constraints.
  - Keys (sheet focused, Edit notes): `P` makes and undoes; `4` on a member of an eighth triplet sets the triplet quarter; `5` does nothing there; `.` does nothing there; `P` in View mode does nothing; `P` while typing in the Lyric field types a letter.
  - Announcement: selecting a member says `…, triplet eighth, …`.
  - One undo step per action: make a triplet, press undo → the quarter is back with its lyric.
- [ ] **Step 2:** Implement; `npm test` passes.
- [ ] **Step 3: End-to-end** (`e2e/triplets.spec.ts`, following `e2e/import-formats.spec.ts` and `e2e/editing.spec.ts`): drop `triplet.abc` (a short original tune with one `(3` group) → the sheet shows one `data-tuplet` with `3` and no "Rhythm simplified" notice; switch to Edit notes, select a quarter, press `P` → a second `data-tuplet`; press ↑ on the second member → its note name changes; press `P` again → the mark is gone; make it again, save, reload → two marks; download JSON and open it again → two marks (Review Focus 4).
- [ ] **Step 4: README.** Triplets: what is imported (eighth, quarter, sixteenth; a sextuplet as two triplets), what stays rounded (5, 7, half-note triplets, loosely played MIDI), the swing effect for MIDI files exported with swing playback, the Triplet button and key `P`, the width effect (two or three bars per line with eighth triplets, one with triplet sixteenths). Remove "Triplets" from the list of missing features and the sentence that tuplets are rounded until part 4b. Keep the file's style: short concrete sentences, exact numbers, no evaluative adjectives.
- [ ] **Step 5:** `npm test`, `npx tsc --noEmit -p .`, `npm run build && npm run check:bundle`, `npm run test:e2e` all pass; put the four results in the report.
- [ ] **Step 6:** Commit `feat: Triplet button and key; end-to-end test; README`.

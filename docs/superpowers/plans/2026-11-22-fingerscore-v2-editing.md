# fingerscore v2 part 2 (Editing with Undo and Redo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit notes, lyrics and chords on the sheet, with undo and redo.

**Architecture:** Pure edit functions take a `Doc` and return a new `Doc` (or `null` when the edit is not allowed); the store commits every document change through one function that maintains an in-memory snapshot history; the sheet page gets a mode switch and one editing panel per mode, rendered under the system that holds the selected event.

**Tech Stack:** Existing stack only. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-22-fingerscore-v2-editing-design.md` (binding) and `fingerscore-handoff/SPEC.md` §9.2–9.5, §10, §16 checks 6–8 (copy and layout). Prototype: `fingerscore-handoff/prototype/Editor.dc.html` (mode switch, panels, bulk card, undo/redo buttons).

## Global Constraints

- Time is in ticks, 12 per quarter. Allowed durations: 3, 6, 9, 12, 18, 24, 36, 48. Every bar's events sum exactly to its `cap` after every edit.
- Event ids are stable and unique: an edited event keeps its id; new events get `newId()`.
- Pitches are concert MIDI numbers in the original key (`Ev.m`); written = m + shift + instrument offset. Edits never change `shift`.
- Edit functions are pure: they never mutate their input and return `null` when the edit is not allowed.
- Every document change goes through the store's history; UI state (mode, selection, open panels) never does.
- One file format, no migration (owner's rule): `Ev.c` is removed, `Doc.imported` is added; older saved sheets open with empty `imported`.
- User-facing strings are exactly those in the design doc.
- Real `<button>`/`<input>`/`<textarea>` with labels; `aria-pressed` on toggles and the mode switch (`role="radiogroup"`/`role="radio"` + `aria-checked` for the segmented control); disabled controls use the `disabled` attribute; visible focus; touch targets ≥ 44px (secondary ≥ 36px); buttons that insert text into a field must not take focus from it.
- Design tokens from `src/styles/tokens.css`; CSS modules; one component per file under `src/ui/`. Editing UI does not print.
- TypeScript 7 strict; the configured lib lacks `Array.prototype.at`.
- Commit after every task; end commit messages with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Commands: `npm test`, `npm run build`, `npm run test:e2e`.

## Review Focus

1. **Lengthening a note over a partly covered neighbour whose remainder is not one allowed duration** (e.g. a quarter grows by a sixteenth over a following quarter: 9 ticks remain → allowed; by an eighth over a dotted quarter: 12 remain → allowed; by a sixteenth over an eighth: 3 remain → allowed; by a sixteenth over a half: 21 remain → rests 18 + 3): the bar still sums to `cap`, ids are unique. → Task 1 tests.
2. **Editing inside a pickup bar and inside 3/4 and 6/8 bars**: lengths that do not fit are refused; "+ Bar after" creates a bar of the meter's capacity. → Task 1 tests.
3. **Undo across a structural edit**: remove a bar that held lyrics, chords and a fingering choice, undo → all three are back; redo removes them again. → Task 2 test.
4. **Typing fast in a lyric field, then Ctrl+Z**: one step back restores the previous text of that note, and the field shows it; typing in another note starts a new step. → Task 2 and Task 5 tests.
5. **An edit made while the song plays**: playback stops, nothing throws, the selection stays. → Task 4 test.

## File Structure

```
src/domain/types.ts            Ev without c; Doc.imported
src/domain/edit.ts             note and bar edits (pure)
src/domain/editText.ts         lyric and chord edits, bulk fill, restore, edit count (pure)
src/state/store.ts             history (undo/redo), sheet generation, applyEdit
src/ui/ModeSwitch.tsx          View · Edit notes · Lyrics · Chords
src/ui/UndoRedo.tsx            page-bar buttons
src/ui/NotePanel.tsx           Edit notes panel
src/ui/LyricPanel.tsx          Lyrics panel
src/ui/ChordPanel.tsx          Chords panel
src/ui/BulkCard.tsx            sidebar card "Lyrics & chords"
src/ui/useSheetShortcuts.ts    Ctrl/⌘+S, Z, Shift+Z, Y
src/pages/SheetPage.tsx        wiring, mode state, keyboard per mode
src/render/Paper.tsx, SystemView.tsx   slot under a system; forced visibility of lyrics/chords
e2e/editing.spec.ts
```

---

### Task 1: Document change and note edits

**Files:**
- Modify: `src/domain/types.ts`, `src/domain/persistence.ts` (+ test), `src/domain/fixture.ts`, `src/import/buildDoc.ts`, `src/import/bars.ts`, `src/test/helpers.ts`, every test or module that constructs an `Ev` with `c`
- Create: `src/domain/edit.ts`, `src/domain/edit.test.ts`

**Interfaces:**
- Produces (`types.ts`): `Ev = { id; m; d; r; tie; l }`; `Doc.imported: { lyrics: Record<string, string>; chords: Record<string, string> }`.
- Produces (`edit.ts`):

```ts
export interface Located { bar: number; index: number; tick: number; ev: Ev }
export function locate(doc: Doc, id: string): Located | null;
export function eventOrder(doc: Doc): Ev[];                                  // all events in score order
export function nextEvent(doc: Doc, id: string): Ev | null;                 // across bar lines
export function fits(doc: Doc, id: string, d: number): boolean;             // start + d <= bar cap, d allowed
export function setLength(doc: Doc, id: string, d: number): Doc | null;     // bar-fill rules, design 4.3
export function shiftPitch(doc: Doc, id: string, semitones: number): Doc | null;   // null on a rest or outside 0..127
export function setLetter(doc: Doc, id: string, letter: number, prefer: 'nearest'): Doc | null;   // letter 0=C..6=B; key signature's alteration; nearest playable octave
export function toggleRest(doc: Doc, id: string): Doc | null;
export function canTie(doc: Doc, id: string): boolean;
export function toggleTie(doc: Doc, id: string): Doc | null;
export function addBarAfter(doc: Doc, barIndex: number): { doc: Doc; selectId: string };
export function removeBar(doc: Doc, barIndex: number): { doc: Doc; selectId: string } | null;   // null when one bar is left
export const BASE_LENGTHS = [3, 6, 12, 24, 48] as const;
export function splitLength(d: number): { base: number; dotted: boolean };   // 9 → {6,true}, 36 → {24,true}
export function dottedOf(base: number): number | null;                       // 6→9, 12→18, 24→36, else null
```

Rules: design 4.3 "Bar-fill rules" verbatim. Removed events lose their entries in `doc.fingering`, `doc.chords`, `doc.imported.lyrics`, `doc.imported.chords`. A pitch change or note→rest drops `doc.fingering[id]`. `setLetter`: written pitch class = letter's natural pc + the key signature's alteration for that letter (written key from `doc.originalTonicPc + shift + inst.off`, `doc.originalMode`); among octaves whose written pitch has `rangeState` 'ok' or 'ext' pick the one nearest the current written pitch (ties → the lower); if none is playable pick the nearest regardless; convert back to concert `m`. On a rest `setLetter` turns it into a note at that pitch. `validateDoc` in `persistence.ts`: drop the `c` requirement; read `imported` (two string maps restricted to existing event ids; missing → empty maps).

- [ ] **Step 1: Migrate `Ev.c` → `Doc.imported`.** `buildDoc` and the fixture fill `imported.lyrics` (non-empty syllables) and `imported.chords` (chord texts as imported). Update persistence validation and its tests; add a test that a document without `imported` and with stray `c` fields opens with empty maps. Run `npm test` → green before continuing.
- [ ] **Step 2: Write the failing tests** (`edit.test.ts`; build documents with `mkDoc` from `src/test/helpers.ts`, where an event is `[midi, ticks, { tie? }]` and midi 0 is a rest)

```ts
const sum = (d: Doc) => d.score.every(b => b.ev.reduce((s, e) => s + e.d, 0) === b.cap);
const ids = (d: Doc) => d.score.flatMap(b => b.ev.map(e => e.id));
const uniq = (d: Doc) => new Set(ids(d)).size === ids(d).length;
const shape = (d: Doc, bar = 0) => d.score[bar].ev.map(e => (e.r ? 'r' : 'n') + e.d);
const ok = (d: Doc | null): Doc => { expect(d).not.toBeNull(); expect(sum(d!)).toBe(true); expect(uniq(d!)).toBe(true); return d!; };

it('check 6: quarter → eighth inserts an eighth rest', () => {
  const d = mkDoc([{ ev: [[60, 12], [62, 12], [64, 24]] }]); const id = d.score[0].ev[0].id;
  const r = ok(setLength(d, id, 6)); expect(shape(r)).toEqual(['n6', 'r6', 'n12', 'n24']); expect(r.score[0].ev[0].id).toBe(id);
});
it('shorter: the gap is filled greedily', () => { const d = mkDoc([{ ev: [[60, 48]] }]); expect(shape(ok(setLength(d, d.score[0].ev[0].id, 3)))).toEqual(['n3', 'r36', 'r9']); });
it('longer: consumes whole events', () => { const d = mkDoc([{ ev: [[60, 12], [62, 12], [64, 24]] }]);
  const r = ok(setLength(d, d.score[0].ev[0].id, 24)); expect(shape(r)).toEqual(['n24', 'n24']); expect(ids(r)).toEqual([d.score[0].ev[0].id, d.score[0].ev[2].id]); });
it.each([
  ['quarter +3 over a quarter', [[60, 12], [62, 12], [64, 24]], 15, null],                     // 15 is not an allowed duration
  ['quarter → dotted quarter over a quarter', [[60, 12], [62, 12], [64, 24]], 18, ['n18', 'n6', 'n24']],
  ['eighth → dotted eighth over an eighth', [[60, 6], [62, 6], [64, 36]], 9, ['n9', 'n3', 'n36']],
  ['quarter → dotted quarter over a half', [[60, 12], [62, 24], [64, 12]], 18, ['n18', 'n18', 'n12']],
  ['sixteenth → eighth over a half (21 left → rests)', [[60, 3], [62, 24], [64, 21 - 0]], 6, null],   // placeholder row: replace with a valid bar, see note
])('longer over a partly covered neighbour: %s', (_n, evs, d, expected) => { /* build, call setLength on the first event, compare shape or null */ });
it('a partly covered neighbour with a non-representable remainder becomes rests', () => {
  const d = mkDoc([{ ev: [[60, 3], [62, 24], [64, 12], [0, 9]] }]);                            // 3 + 24 + 12 + 9 = 48
  const r = ok(setLength(d, d.score[0].ev[0].id, 6)); expect(shape(r)).toEqual(['n6', 'r18', 'r3', 'n12', 'r9']);
  expect(ids(r)).not.toContain(d.score[0].ev[1].id);
});
it('never crosses the bar line; fits() agrees', () => { const d = mkDoc([{ ev: [[60, 24], [62, 24]] }, { ev: [[64, 48]] }]); const id = d.score[0].ev[1].id;
  expect(fits(d, id, 24)).toBe(true); expect(fits(d, id, 36)).toBe(false); expect(setLength(d, id, 36)).toBeNull(); expect(fits(d, id, 5)).toBe(false); });
it('pickup bar and 3/4', () => { const d = mkDoc([{ ev: [[60, 12]] }, { ev: [[62, 36]] }], [3, 4]); const p = d.score[0].ev[0].id;
  expect(fits(d, p, 18)).toBe(false); expect(shape(ok(setLength(d, p, 6)))).toEqual(['n6', 'r6']);
  expect(fits(d, d.score[1].ev[0].id, 48)).toBe(false); const a = addBarAfter(d, 1); expect(a.doc.score[2]).toMatchObject({ cap: 36, rs: false, re: false, volta: '' });
  expect(a.doc.score[2].ev).toHaveLength(1); expect(a.doc.score[2].ev[0]).toMatchObject({ r: true, d: 36, m: 62 }); expect(a.selectId).toBe(a.doc.score[2].ev[0].id); });
it('6/8 bar capacity', () => { const d = mkDoc([{ ev: [[60, 36]] }], [6, 8]); expect(addBarAfter(d, 0).doc.score[1].cap).toBe(36); });
it('lyrics, chords and fingering stay with surviving events and leave with consumed ones', () => {
  let d = mkDoc([{ ev: [[60, 12], [62, 12], [64, 24]] }]); const [a, b, c] = d.score[0].ev;
  d = { ...d, score: d.score.map(bar => ({ ...bar, ev: bar.ev.map(e => ({ ...e, l: e.id })) })), fingering: { [b.id]: 1, [c.id]: 1 },
        chords: { [b.id]: parseChord('C', 0), [c.id]: parseChord('G', 0) }, imported: { lyrics: { [b.id]: 'x', [c.id]: 'y' }, chords: { [b.id]: 'C' } } };
  const r = ok(setLength(d, a.id, 24));
  expect(Object.keys(r.fingering)).toEqual([c.id]); expect(Object.keys(r.chords)).toEqual([c.id]); expect(r.imported).toEqual({ lyrics: { [c.id]: 'y' }, chords: {} });
  expect(r.score[0].ev[1].l).toBe(c.id); expect(d.score[0].ev).toHaveLength(3);   // input untouched
});
it('pitch: semitone, octave, limits, rests', () => { const d = mkDoc([{ ev: [[60, 24], [0, 24]] }]); const [n, rest] = d.score[0].ev;
  expect(ok(shiftPitch(d, n.id, 1)).score[0].ev[0].m).toBe(61); expect(ok(shiftPitch(d, n.id, -12)).score[0].ev[0].m).toBe(48);
  expect(shiftPitch(d, n.id, 100)).toBeNull(); expect(shiftPitch(d, rest.id, 1)).toBeNull(); });
it('a pitch change drops that note\'s fingering choice only', () => { let d = mkDoc([{ ev: [[60, 24], [62, 24]] }]); const [a, b] = d.score[0].ev;
  d = { ...d, fingering: { [a.id]: 1, [b.id]: 1 } }; expect(ok(shiftPitch(d, a.id, 1)).fingering).toEqual({ [b.id]: 1 }); });
it('ties: allowed only into a same-pitch note, cleared when pitches part', () => {
  const d = mkDoc([{ ev: [[60, 24], [60, 24]] }, { ev: [[60, 24], [62, 24]] }]); const [a, b] = d.score[0].ev; const c = d.score[1].ev[0];
  expect(canTie(d, a.id)).toBe(true); expect(canTie(d, b.id)).toBe(true); expect(canTie(d, c.id)).toBe(false);          // b ties over the bar line
  const tied = ok(toggleTie(d, a.id)); expect(tied.score[0].ev[0].tie).toBe(true); expect(ok(toggleTie(tied, a.id)).score[0].ev[0].tie).toBe(false);
  expect(ok(shiftPitch(tied, b.id, 2)).score[0].ev[0].tie).toBe(false);          // the tie into b is cleared
  expect(ok(shiftPitch(tied, a.id, 2)).score[0].ev[0].tie).toBe(false);          // the tie out of a is cleared
  expect(ok(toggleRest(tied, b.id)).score[0].ev[0].tie).toBe(false); expect(toggleTie(d, c.id)).toBeNull();
});
it('rest ↔ note remembers the pitch and keeps the lyric', () => { let d = mkDoc([{ ev: [[60, 24], [62, 24]] }]); const b = d.score[0].ev[1];
  d = { ...d, score: [{ ...d.score[0], ev: [d.score[0].ev[0], { ...b, l: 'la' }] }] };
  const r = ok(toggleRest(d, b.id)); expect(r.score[0].ev[1]).toMatchObject({ r: true, m: 62, l: 'la', tie: false });
  expect(ok(toggleRest(r, b.id)).score[0].ev[1]).toMatchObject({ r: false, m: 62, l: 'la' }); });
it('letters: key signature and nearest playable octave', () => {
  const d = { ...mkDoc([{ ev: [[67, 48]] }]), inst: 'fl' as const, originalTonicPc: 7, shift: 0 };     // G major, written = concert on flute
  const id = d.score[0].ev[0].id; expect(ok(setLetter(d, id, 3, 'nearest')).score[0].ev[0].m).toBe(66);   // F → F♯4 (nearest to G4)
  expect(ok(setLetter(d, id, 0, 'nearest')).score[0].ev[0].m).toBe(72);                                   // C → C5 (5 up) rather than C4 (7 down)
  const low = { ...d, score: [{ ...d.score[0], ev: [{ ...d.score[0].ev[0], m: 61 }] }] };                 // C♯4 on a flute (lowest note C4)
  expect(ok(setLetter(low, id, 6, 'nearest')).score[0].ev[0].m).toBe(71);                                 // B: B3 is unplayable → B4
});
it('bars: add and remove', () => { const d = mkDoc([{ ev: [[60, 48]], rs: true }, { ev: [[62, 48]], re: true, volta: '1' }]);
  const a = addBarAfter(d, 0); expect(a.doc.score.map(b => [b.rs, b.re, b.volta])).toEqual([[true, false, ''], [false, false, ''], [false, true, '1']]);
  const r = removeBar(a.doc, 1)!; expect(r.doc.score).toHaveLength(2); expect(r.selectId).toBe(d.score[1].ev[0].id);
  const last = removeBar(d, 1)!; expect(last.selectId).toBe(d.score[0].ev[0].id); expect(removeBar(mkDoc([{ ev: [[60, 48]] }]), 0)).toBeNull(); });
it('dots', () => { expect(splitLength(9)).toEqual({ base: 6, dotted: true }); expect(splitLength(36)).toEqual({ base: 24, dotted: true }); expect(splitLength(12)).toEqual({ base: 12, dotted: false });
  expect([3, 6, 12, 24, 48].map(dottedOf)).toEqual([null, 9, 18, 36, null]); });
it('every edit result passes validation', () => { /* apply each edit above to sampleDoc('asax') on several events; validateDoc(JSON.parse(JSON.stringify(result))) is not null */ });
```

Notes for the implementer: the `it.each` block is a sketch — write each row as a real case with a valid bar (sum 48) and the expected shape computed from the rules; the row marked "placeholder" must be replaced by the stand-alone test below it. Every test body given as a comment must become real assertions.
- [ ] **Step 3: Run** `npx vitest run src/domain/edit.test.ts` → FAIL.
- [ ] **Step 4: Implement `edit.ts`.**
- [ ] **Step 5: Run** → PASS; `npm test` and `npm run build` green.
- [ ] **Step 6: Commit** `feat: note and bar edit operations; imported lyrics and chords kept for restore`.

---

### Task 2: History in the store

**Files:**
- Modify: `src/state/store.ts`, `src/state/store.test.ts`, `src/state/deleteWithUndo.ts`, `src/domain/persistence.ts` (canonical cache)

**Interfaces:**
- Produces (additions to `AppState`):

```ts
past: Doc[]; future: Doc[];                          // in memory only, never persisted
sheetGen: number;                                    // raised by setDoc, openEntry, openImported, openUnsaved
undo(): void; redo(): void;
applyEdit(next: Doc | null, coalesceKey?: string): boolean;   // false when next is null or identical; pushes history
export const HISTORY_LIMIT = 200; export const COALESCE_MS = 1500;
export function canUndo(s: Pick<AppState, 'past'>): boolean; export function canRedo(s: Pick<AppState, 'future'>): boolean;
```

Rules: every action that changes the document (`setInstrument` with a doc, `setShift`, `patchDoc`, `setFingering`, `resetFingerings`, `setPrefs` when it re-picks the shift, `applyEdit`) goes through one internal `commit(next, coalesceKey?)`: no-op when `next === doc`; otherwise push the previous doc onto `past` (drop the oldest beyond `HISTORY_LIMIT`), clear `future`, set `doc`. With a `coalesceKey` equal to the previous commit's key and less than `COALESCE_MS` since it, the previous doc is not pushed again (the step is extended). `patchDoc` gains an optional second argument `coalesceKey`. `undo`/`redo` move documents between `past`, `doc` and `future` and reset the coalescing state; they keep `instId` in step with `doc.inst`. `setDoc`, `openEntry`, `openImported`, `openUnsaved` clear both stacks and raise `sheetGen`. `canonical(doc)` is cached per document object (WeakMap) so `saveStatus` stays cheap. `deleteWithUndo` and the sheet page use `sheetGen`, not the identity of `doc.source`, as the "same sheet" test. Use an injectable clock (`now: () => number`, default `Date.now`) so tests control time.

- [ ] **Step 1: Write the failing tests** (additions to `store.test.ts`)

```ts
it('undo and redo restore documents', () => {
  const s = useApp.getState; s().setDoc(sampleDoc('asax')); const d0 = s().doc!;
  s().patchDoc({ tempo: 90 }); s().setShift(d0.shift + 1); expect(s().past).toHaveLength(2); expect(canUndo(s())).toBe(true);
  s().undo(); expect(s().doc!.shift).toBe(d0.shift); expect(s().doc!.tempo).toBe(90); expect(canRedo(s())).toBe(true);
  s().undo(); expect(s().doc).toBe(d0); expect(canUndo(s())).toBe(false);
  s().redo(); s().redo(); expect(s().doc!.shift).toBe(d0.shift + 1); expect(canRedo(s())).toBe(false);
  s().undo(); s().patchDoc({ tempo: 70 }); expect(s().future).toEqual([]);       // a new change clears redo
});
it('undo brings back what a structural edit removed (review focus 3)', () => {
  const s = useApp.getState; let d = sampleDoc('asax'); const bar = d.score[2]; const ev = bar.ev[0];
  d = { ...d, fingering: { [ev.id]: 0 }, chords: { ...d.chords, [ev.id]: parseChord('C', 0) } }; s().setDoc(d);
  expect(s().applyEdit(removeBar(d, 2)!.doc)).toBe(true); expect(s().doc!.score).toHaveLength(d.score.length - 1); expect(s().doc!.chords[ev.id]).toBeUndefined();
  s().undo(); expect(s().doc).toBe(d); s().redo(); expect(s().doc!.fingering[ev.id]).toBeUndefined();
});
it('applyEdit refuses null and identical documents', () => { const s = useApp.getState; s().setDoc(sampleDoc('fl'));
  expect(s().applyEdit(null)).toBe(false); expect(s().applyEdit(s().doc)).toBe(false); expect(s().past).toEqual([]); });
it('coalesces changes to one field within 1.5 s (review focus 4)', () => {
  const s = useApp.getState; let t = 0; setClock(() => t); s().setDoc({ ...sampleDoc('fl'), title: 'A' });
  s().patchDoc({ title: 'Ab' }, 'title'); t += 500; s().patchDoc({ title: 'Abc' }, 'title'); expect(s().past).toHaveLength(1);
  t += 2000; s().patchDoc({ title: 'Abcd' }, 'title'); expect(s().past).toHaveLength(2);
  s().patchDoc({ subtitle: 'x' }, 'subtitle'); expect(s().past).toHaveLength(3);                 // another key starts a new step
  s().undo(); s().undo(); expect(s().doc!.title).toBe('Abc'); s().undo(); expect(s().doc!.title).toBe('A');
  s().patchDoc({ title: 'B' }, 'title'); s().undo(); t += 100; s().patchDoc({ title: 'C' }, 'title'); expect(s().past).toHaveLength(1);   // undo resets coalescing
});
it('history is capped at 200 steps', () => { const s = useApp.getState; s().setDoc(sampleDoc('fl')); for (let i = 0; i < 250; i++) s().patchDoc({ tempo: 40 + (i % 150) });
  expect(s().past.length).toBe(HISTORY_LIMIT); });
it('opening or importing a sheet resets history and raises the generation', () => {
  const s = useApp.getState; s().setDoc(sampleDoc('fl')); s().patchDoc({ tempo: 90 }); const g = s().sheetGen; s().saveSheet(); const id = s().libraryId!;
  s().setDoc(sampleDoc('cl')); expect(s().past).toEqual([]); expect(s().sheetGen).toBe(g + 1);
  s().patchDoc({ tempo: 80 }); s().openEntry(id); expect(s().past).toEqual([]); expect(s().future).toEqual([]); expect(s().sheetGen).toBe(g + 2);
});
it('undo to the saved document shows saved', () => { const s = useApp.getState; s().setDoc(sampleDoc('fl')); s().saveSheet();
  s().patchDoc({ tempo: 90 }); expect(saveStatus(s())).toBe('dirty'); s().undo(); expect(saveStatus(s())).toBe('saved'); });
it('undo of an instrument change restores instrument, shift and fingering choices', () => {
  const s = useApp.getState; const d = { ...sampleDoc('asax'), fingering: { e3: 0 } }; s().setDoc(d); s().setInstrument('cl');
  expect(s().doc!.fingering).toEqual({}); s().undo(); expect(s().doc).toBe(d); expect(s().instId).toBe('asax'); });
it('history is not written to storage', () => { const s = useApp.getState; s().setDoc(sampleDoc('fl')); s().patchDoc({ tempo: 90 });
  expect(Object.keys(sessionStorage).join() + Object.keys(localStorage).join()).not.toMatch(/past|future|history/i);
  useApp.setState({ doc: null, past: [], future: [] }); hydrate(); expect(useApp.getState().past).toEqual([]); });
```

`setClock` is a test-only export of the store module. Existing store and page tests must stay green; reset the new fields in the tests' `beforeEach`.
- [ ] **Step 2: Run** `npx vitest run src/state` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; `npm test`, `npm run build`, `npm run test:e2e` green.
- [ ] **Step 5: Commit** `feat: undo and redo history in the store`.

---

### Task 3: Mode switch, undo/redo controls, shortcuts, panel slot

**Files:**
- Create: `src/ui/ModeSwitch.tsx`, `src/ui/UndoRedo.tsx`, `src/ui/useSheetShortcuts.ts` (+ CSS modules)
- Modify: `src/pages/SheetPage.tsx` (+ CSS, test), `src/render/Paper.tsx`, `src/render/SystemView.tsx`, `src/render/Paper.test.tsx`, `src/styles/print.css`

**Interfaces:**
- Produces:

```tsx
export type Mode = 'view' | 'notes' | 'lyrics' | 'chords';
export function ModeSwitch(p: { mode: Mode; onMode(m: Mode): void }): JSX.Element;      // radiogroup "Mode"; hint text below, design 4.2
export function UndoRedo(p: { canUndo: boolean; canRedo: boolean; onUndo(): void; onRedo(): void }): JSX.Element;
export function useSheetShortcuts(h: { onSave(): void; onUndo(): void; onRedo(): void }): void;   // window keydown; e.key or e.code; preventDefault
// Paper gains: forceShow?: { lyrics?: boolean; chords?: boolean };  renderUnderSystem?(systemIndex: number): React.ReactNode;
```

Behaviour: design 4.2 and 4.6. The mode switch sits in the toolbar row left of the playback controls. `UndoRedo` sits in the page bar left of the save status; tooltips (`title`) "Undo (Ctrl+Z)" / "Redo (Ctrl+Shift+Z)", with ⌘ on Apple platforms. The existing Ctrl/⌘+S handler moves into `useSheetShortcuts`; Z/Y work while a text field of the page has focus. Title and subtitle edits pass coalesce keys `'title'` / `'subtitle'`; the tempo slider passes `'tempo'`. After undo/redo a selection whose event no longer exists is cleared; the selection also clears on a `sheetGen` change (replacing the `doc.source` identity test). `Paper` renders `renderUnderSystem(i)` as HTML directly below system `i` (inside the paper, not printed). In this task the slot shows, for modes other than View with a selection, a placeholder panel element `<div role="group" aria-label="{Edit notes|Lyrics|Chords} panel">` — Tasks 4–6 fill it. ←/→ skip tied continuations in View and Lyrics mode and include them in Edit notes and Chords mode. Selecting a rest or tied continuation in Lyrics mode moves to the next note that can carry a syllable.

- [ ] **Step 1: Write the failing tests** (`SheetPage.test.tsx`, `Paper.test.tsx`)

```tsx
it('mode switch: four modes, hint, View by default', async () => { open('asax'); const g = screen.getByRole('radiogroup', { name: 'Mode' });
  expect(within(g).getAllByRole('radio').map(r => r.textContent)).toEqual(['View', 'Edit notes', 'Lyrics', 'Chords']); expect(within(g).getByRole('radio', { name: 'View' })).toBeChecked();
  expect(screen.getByText('Click a note to choose where playback starts.')).toBeInTheDocument();
  await user.click(within(g).getByRole('radio', { name: 'Edit notes' })); expect(screen.getByText('Click a note or rest, then change its pitch or length. Arrow keys work too.')).toBeInTheDocument(); });
it('a panel appears under the selected note\'s system in edit modes only', async () => { open('asax'); const first = firstEventId();
  await clickEvent(first); expect(screen.queryByRole('group', { name: /panel/ })).toBeNull();
  await user.click(screen.getByRole('radio', { name: 'Edit notes' })); expect(screen.getByRole('group', { name: 'Edit notes panel' })).toBeInTheDocument();
  await user.keyboard('{Escape}'); expect(screen.queryByRole('group', { name: /panel/ })).toBeNull(); });
it('undo and redo buttons and shortcuts', async () => { open('asax'); const undo = screen.getByRole('button', { name: 'Undo' }); const redo = screen.getByRole('button', { name: 'Redo' });
  expect(undo).toBeDisabled(); expect(redo).toBeDisabled(); await user.click(screen.getByLabelText('Lyrics', { selector: 'input[type=checkbox]' }));
  expect(undo).toBeEnabled(); await user.click(undo); expect(useApp.getState().doc!.show.lyrics).toBe(true); expect(redo).toBeEnabled();
  await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}'); expect(useApp.getState().doc!.show.lyrics).toBe(false);
  await user.keyboard('{Control>}z{/Control}'); expect(useApp.getState().doc!.show.lyrics).toBe(true); await user.keyboard('{Control>}y{/Control}'); expect(useApp.getState().doc!.show.lyrics).toBe(false); });
it('typing a title is one undo step and Ctrl+Z works inside the field', async () => { open('asax'); const t = screen.getByRole('textbox', { name: 'Sheet title' });
  await user.clear(t); await user.type(t, 'Waly'); await user.keyboard('{Control>}z{/Control}'); expect(t).toHaveValue('The Water Is Wide'); expect(t).toHaveFocus(); });
it('lyrics mode shows lyrics even when the toggle is off; chords mode shows chords', async () => { open('xc', { show: { fingerings: true, chords: false, lyrics: false, raiseExtensions: true } });
  expect(screen.queryByText('wat-')).toBeNull(); await user.click(screen.getByRole('radio', { name: 'Lyrics' })); expect(screen.getByText('wat-')).toBeInTheDocument();
  expect(useApp.getState().doc!.show.lyrics).toBe(false); await user.click(screen.getByRole('radio', { name: 'Chords' })); expect(document.querySelectorAll('[data-chord]').length).toBeGreaterThan(0); });
it('undo clears a selection whose note is gone', async () => { /* select an event, applyEdit(addBarAfter…) selecting the new rest via the store, undo → no [data-selected] */ });
it('play from selected still works in every mode', async () => { /* for each mode: select, button reads "Play from selected" */ });
```

`firstEventId`/`clickEvent` are helpers over `[data-hit]`. Existing selection, playback and save tests stay green.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, layout from `prototype/Editor.dc.html` (mode switch, undo/redo). **Step 4: Run** → PASS; `npm test`, `npm run build`, `npm run test:e2e` green.
- [ ] **Step 5: Commit** `feat: mode switch, undo and redo controls, shared shortcuts`.

---

### Task 4: Edit notes panel and keys

**Files:**
- Create: `src/ui/NotePanel.tsx` (+ CSS module)
- Modify: `src/pages/SheetPage.tsx` (+ test)

**Interfaces:**
- Consumes: `edit.ts` (all), store `applyEdit`, `Derived`.
- Produces: `NotePanel(p: { doc: Doc; derived: Derived; id: string; onEdit(next: Doc | null, selectId?: string): void })`.

Behaviour: design 4.3 in full. Accessible names: group "Edit notes panel"; buttons "Octave down", "Semitone down", "Semitone up", "Octave up"; the note name as text between them (e.g. "G4", "rest"); length buttons "Sixteenth", "Eighth", "Quarter", "Half", "Whole" with `aria-pressed`; toggle "Dotted" (`aria-pressed`); toggle "Tie" (`aria-pressed`); "Turn into rest" / "Turn into note"; "+ Bar after"; "Remove bar". Length button semantics: pressing a base length sets that length undotted; "Dotted" toggles between the base and its dotted value. Disabled states follow `fits`, `canTie`, pitch limits, rests. Keyboard per design 4.3, handled by the sheet's key handler in Edit notes mode only; letter keys and digits must not fire when a text field has focus or a modifier is held. Every edit goes through `applyEdit`; edits that return `selectId` move the selection. An edit stops playback (the page's existing effect on `doc.score`).

- [ ] **Step 1: Write the failing tests**

```tsx
const edit = async (id = 'asax') => { open(id); await user.click(screen.getByRole('radio', { name: 'Edit notes' })); };
it('check 6: quarter → eighth leaves an eighth rest; undo restores; the key does not change', async () => {
  await edit(); const d0 = useApp.getState().doc!; const q = d0.score.flatMap(b => b.ev).find(e => !e.r && e.d === 12)!; await clickEvent(q.id);
  const panel = screen.getByRole('group', { name: 'Edit notes panel' }); expect(within(panel).getByRole('button', { name: 'Quarter' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(within(panel).getByRole('button', { name: 'Eighth' })); const d1 = useApp.getState().doc!; const bar = d1.score.find(b => b.ev.some(e => e.id === q.id))!;
  const i = bar.ev.findIndex(e => e.id === q.id); expect(bar.ev[i].d).toBe(6); expect(bar.ev[i + 1]).toMatchObject({ r: true, d: 6 }); expect(d1.shift).toBe(d0.shift);
  await user.click(screen.getByRole('button', { name: 'Undo' })); expect(useApp.getState().doc).toBe(d0);
});
it('lengths that do not fit are disabled', async () => { /* select the last quarter of a bar: Half, Whole and Dotted disabled; Sixteenth, Eighth enabled */ });
it('pitch buttons and note name', async () => { /* Semitone up changes m by 1 and the name text; on a rest all four pitch buttons are disabled and the name reads "rest" */ });
it('dotted, tie, rest toggles', async () => { /* aria-pressed follows the document; Tie disabled unless the next note has the same pitch */ });
it('bars: add after and remove', async () => { /* + Bar after: one more bar, the new rest is selected (data-selected on it); Remove bar: back to the old count; with one bar Remove bar is disabled */ });
it('keyboard: arrows, letters, digits, dot, R, T, Delete', async () => {
  await edit('fl'); const n = firstNote(); await clickEvent(n.id); const sheet = screen.getByRole('group', { name: /Sheet music/ }); sheet.focus();
  await user.keyboard('{ArrowUp}'); expect(ev(n.id).m).toBe(n.m + 1); await user.keyboard('{Control>}{ArrowDown}{/Control}'); expect(ev(n.id).m).toBe(n.m + 1 - 12);
  await user.keyboard('3'); expect(ev(n.id).d).toBe(6); await user.keyboard('.'); expect(ev(n.id).d).toBe(9); await user.keyboard('2'); expect(ev(n.id).d).toBe(3);
  await user.keyboard('r'); expect(ev(n.id).r).toBe(true); await user.keyboard('r'); expect(ev(n.id).r).toBe(false); await user.keyboard('{Delete}'); expect(ev(n.id).r).toBe(true);
  await user.keyboard('g'); expect(ev(n.id).r).toBe(false); expect(ev(n.id).m % 12).toBe(expectedPcOfGInKey());
  await user.keyboard('{ArrowRight}'); expect(selectedId()).not.toBe(n.id);
});
it('keys do nothing in View mode and while typing in the title', async () => { /* 'r' in View mode leaves the note; typing "radar" in the title edits the title only */ });
it('an edit during playback stops it and keeps the selection (review focus 5)', async () => { /* mocked player: Play, then Semitone up → player.stop called, selection kept, no throw */ });
```

Every body given as a comment must become real assertions.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, layout from the prototype's note panel. **Step 4: Run** → PASS; `npm test`, `npm run build`, `npm run test:e2e` green.
- [ ] **Step 5: Commit** `feat: edit-notes panel and keyboard editing`.

---

### Task 5: Lyrics — text edits, panel, bulk card

**Files:**
- Create: `src/domain/editText.ts`, `src/domain/editText.test.ts`, `src/ui/LyricPanel.tsx`, `src/ui/BulkCard.tsx` (+ CSS modules)
- Modify: `src/pages/SheetPage.tsx` (+ test)

**Interfaces:**
- Produces (`editText.ts`):

```ts
export function carriesLyric(doc: Doc, id: string): boolean;                 // a note that is not a tied continuation
export function nextLyricNote(doc: Doc, id: string | null, dir: 1 | -1): string | null;   // id null + dir 1 → the first
export function setLyric(doc: Doc, id: string, text: string): Doc | null;    // null when unchanged
export function splitVerse(text: string): string[];                          // 'Oh love is gen-tle _ and' → ['Oh','love','is','gen-','tle','','and']
export function fillLyrics(doc: Doc, text: string, fromId: string | null): Doc | null;
export function clearLyrics(doc: Doc): Doc | null; export function clearChords(doc: Doc): Doc | null;
export function editCount(doc: Doc): number;                                  // events whose lyric or chord differs from doc.imported
export function restoreFromFile(doc: Doc): Doc | null;                        // lyrics and chords of surviving events back to imported; null at 0 edits
export function setChord(doc: Doc, id: string, text: string, tk: number): Doc | null;   // '' removes; used by Task 6
```

`splitVerse`: split on whitespace; a word with inner hyphens becomes one syllable per part, each but the last keeping a trailing "-"; a standalone `_` is an empty syllable. `restoreFromFile` chords: `parseChord(imported text, 0)` for events that have an imported chord, removed for those that have none. `editCount` chord comparison: current chord's `raw` at its `tk` versus the imported text at tk 0 — count an event when it has a chord and no imported one, lacks one that was imported, or the chord's stored pitch classes/rest differ from `parseChord(imported, 0)`.
- UI: design 4.4 in full. `LyricPanel` props `{ doc; id; onEdit(next: Doc | null, coalesceKey: string): void; onMove(id: string): void; onClose(): void }`; the field is labelled "Lyric"; symbol buttons named by their character with `aria-label`s "Insert ‿", "Insert ’", "Insert -", "Insert „", "Insert “", "Insert …" and `onMouseDown={e => e.preventDefault()}` so the field keeps focus. Coalesce key `lyric:{id}`. `BulkCard` props `{ doc; selectedId; onEdit(next: Doc | null): void }`: textarea labelled "Type or paste a verse", buttons "Fill lyrics", "Clear lyrics", "Clear chords", text "{n} edits to lyrics and chords" (singular "1 edit to lyrics and chords"), button "Restore from file"; sits in the sidebar after "Range check" in every mode.

- [ ] **Step 1: Write the failing tests**

```ts
// editText.test.ts
it('check 8: bulk fill', () => { expect(splitVerse('Oh love is gen-tle')).toEqual(['Oh', 'love', 'is', 'gen-', 'tle']);
  const d = mkDoc([{ ev: [[60, 12], [62, 12, { tie: true }], [62, 12], [0, 12]] }, { ev: [[64, 12], [65, 12], [67, 12], [69, 12]] }]);
  const r = fillLyrics(d, 'Oh love is gen-tle', null)!; expect(r.score.flatMap(b => b.ev).map(e => e.l)).toEqual(['Oh', 'love', '', '', 'is', 'gen-', 'tle', '']); });
it('fill from a note, underscores, overflow, three-part words', () => { const d = mkDoc([{ ev: [[60, 12], [62, 12], [64, 12], [65, 12]] }]); const ids = d.score[0].ev.map(e => e.id);
  const start = { ...d, score: [{ ...d.score[0], ev: d.score[0].ev.map(e => ({ ...e, l: 'x' })) }] };
  expect(fillLyrics(start, 'a _ b c d e', ids[1])!.score[0].ev.map(e => e.l)).toEqual(['x', 'a', '', 'b']);
  expect(splitVerse('  beau-ti-ful   day ')).toEqual(['beau-', 'ti-', 'ful', 'day']); expect(fillLyrics(d, '   ', null)).toBeNull(); });
it('next lyric note skips rests and tied continuations', () => { /* forward, backward, from null, at the ends → null */ });
it('set, clear, count, restore', () => { const d = sampleDoc('xc'); const first = d.score[0].ev[0]; expect(editCount(d)).toBe(0); expect(restoreFromFile(d)).toBeNull();
  const a = setLyric(d, first.id, 'Oh')!; expect(editCount(a)).toBe(1); expect(setLyric(a, first.id, 'Oh')).toBeNull();
  const b = clearChords(a)!; expect(Object.keys(b.chords)).toEqual([]); expect(editCount(b)).toBe(1 + Object.keys(d.chords).length);
  const c = restoreFromFile(b)!; expect(c.score[0].ev[0].l).toBe(first.l); expect(editCount(c)).toBe(0);
  expect(Object.keys(c.chords).sort()).toEqual(Object.keys(d.chords).sort()); expect(clearLyrics(clearLyrics(d)!)).toBeNull(); });
it('setChord: stores relative to the key, removes on empty, keeps invalid text', () => { const d = mkDoc([{ ev: [[60, 48]] }]); const id = d.score[0].ev[0].id;
  const a = setChord(d, id, 'Bb', 2)!; expect(a.chords[id]).toMatchObject({ ok: true, pc: 8, tk: 2 }); expect(setChord(a, id, 'Bb', 2)).toBeNull();
  expect(setChord(a, id, '', 2)!.chords[id]).toBeUndefined(); expect(setChord(d, id, 'N.C.', 0)!.chords[id]).toMatchObject({ ok: false, raw: 'N.C.' }); expect(setChord(d, id, '', 0)).toBeNull(); });
// SheetPage.test.tsx
it('lyric field: type, Enter to the next note, Shift+Tab back, one undo step per note (review focus 4)', async () => {
  open('xc'); await user.click(screen.getByRole('radio', { name: 'Lyrics' })); const notes = lyricNotes(); await clickEvent(notes[0].id);
  const f = screen.getByRole('textbox', { name: 'Lyric' }); expect(f).toHaveFocus(); expect(f).toHaveValue(notes[0].l);
  await user.clear(f); await user.type(f, 'Oh{Enter}'); expect(ev(notes[0].id).l).toBe('Oh'); expect(selectedId()).toBe(notes[1].id); expect(screen.getByRole('textbox', { name: 'Lyric' })).toHaveFocus();
  await user.type(screen.getByRole('textbox', { name: 'Lyric' }), '!'); await user.keyboard('{Shift>}{Tab}{/Shift}'); expect(selectedId()).toBe(notes[0].id);
  await user.keyboard('{Control>}z{/Control}'); expect(ev(notes[1].id).l).toBe(notes[1].l); await user.keyboard('{Control>}z{/Control}'); expect(ev(notes[0].id).l).toBe(notes[0].l);
  expect(screen.getByRole('textbox', { name: 'Lyric' })).toHaveValue(notes[0].l); });
it('symbol buttons insert at the caret and keep focus', async () => { /* type "ab", caret between, click "Insert ‿" → "a‿b", field still focused */ });
it('selecting a rest in Lyrics mode moves to the next note', async () => { /* … */ });
it('bulk card: fill from the selection, clear, edit count, restore', async () => { /* textarea + Fill lyrics; "3 edits to lyrics and chords"; Restore from file → 0 edits, button disabled; each action is one undo step */ });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test`, `npm run build`, `npm run test:e2e` green.
- [ ] **Step 5: Commit** `feat: lyrics mode with bulk fill and restore from file`.

---

### Task 6: Chords panel

**Files:**
- Create: `src/ui/ChordPanel.tsx` (+ CSS module)
- Modify: `src/pages/SheetPage.tsx` (+ test), `src/domain/chords.ts` if a helper is needed for the typed-text prettifying

**Interfaces:**
- Consumes: `setChord`, `eventOrder`/`nextEvent`, `chordText`, `prettyChord`, `parseChord`.
- Produces: `ChordPanel(p: { doc: Doc; derived: Derived; id: string; onEdit(next: Doc | null, coalesceKey: string): void; onMove(id: string): void; onClose(): void })`.

Behaviour: design 4.5 in full. Field labelled "Chord", showing the chord as displayed in the current key (`chordText` at the current `tk`), or the raw text when invalid. While typing, the stored value is `setChord(doc, id, prettyChord(typed), tk)` with `tk = mod12(shift + inst.off)`; coalesce key `chord:{id}`. Buttons with `aria-label` "Insert ♭", "Insert ♯", "Insert m", "Insert °", "Insert ø", "Insert Δ7", "Insert 7", "Insert sus4", "Insert add9", "Insert 6", "Insert /", "Insert ( )"; they keep focus in the field. The hint and the invalid message from design 4.5; the invalid message has `role="status"`. Enter/Tab next event, Shift+Tab previous, Esc clears the selection.

- [ ] **Step 1: Write the failing tests**

```tsx
it('check 7: typing Bb shows B♭; F#m7b5/C# is stored and drawn; transposing moves chords', async () => {
  open('fl'); await user.click(screen.getByRole('radio', { name: 'Chords' })); const e = firstEvent(); await clickEvent(e.id);
  const f = screen.getByRole('textbox', { name: 'Chord' }); expect(f).toHaveFocus(); await user.clear(f); await user.type(f, 'Bb'); expect(f).toHaveValue('B♭');
  await user.clear(f); await user.type(f, 'F#m7b5/C#'); expect(f).toHaveValue('F♯m7♭5/C♯'); expect(useApp.getState().doc!.chords[e.id]).toMatchObject({ ok: true });
  const before = chordOnSheet(e.id); expect(before).toBe('F♯m7♭5/C♯'); act(() => useApp.getState().setShift(useApp.getState().doc!.shift + 2));
  expect(chordOnSheet(e.id)).toBe('G♯m7♭5/D♯'); });
it('chords on rests and tied notes; empty removes; invalid stays red with the message', async () => { /* select a rest → field; type "N.C." → status "Not a chord we can transpose. Start with a note name A–G."; clear → chord removed, message gone */ });
it('buttons insert at the caret; "( )" puts the caret inside', async () => { /* type "C", click "Insert ( )", type "9" → "C(9)"; click "Insert Δ7" → appended; field keeps focus */ });
it('Enter moves to the next event including rests; one undo step per chord', async () => { /* … */ });
```

`chordOnSheet(id)` reads the text of the `[data-chord]` element of that event with extensions flattened (adapt to the renderer's markup).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test`, `npm run build`, `npm run test:e2e` green.
- [ ] **Step 5: Commit** `feat: chords mode`.

---

### Task 7: End-to-end tests and README

**Files:**
- Create: `e2e/editing.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the e2e tests** — each starts from cleared storage, loads the sample, makes the sheet, and collects console/page errors (must stay empty):
  1. *Edit notes:* switch to Edit notes, click a quarter note in the second system, press the "Eighth" button → that note's column is followed by a rest; the header's key text is unchanged; press Ctrl+Z → the rest is gone; press the "+ Bar after" button → one more bar (count `[data-testid=system]` bars via `[data-bar]` or the last bar number); "Undo" button → back.
  2. *Keyboard:* focus the sheet, select with ArrowRight, press ArrowUp → the selected note's chart changes or its `data-ev` group's notehead y changes; `r` → a rest glyph in that column; Ctrl+Shift+Z after Ctrl+Z redoes.
  3. *Lyrics:* Lyrics mode, click the first note, type "La" + Enter + "li" → both syllables visible on the sheet; paste "Should auld ac-quain-tance be for-got" into the bulk textarea, select the first note, "Fill lyrics" → "quain-" visible; the edit count line shows a number > 0; "Restore from file" → the original first syllable "Should" is visible again and the count reads 0 edits.
  4. *Chords:* Chords mode, click the first note, type "Bb" → field shows "B♭" and the sheet shows a chord at that note; change the instrument select to another instrument → the chord text on the sheet changes or stays valid (no red); type "xyz" in another note → the invalid message is visible.
  5. *Save and reload:* after an edit the status reads "Unsaved changes"; Save → "Saved"; reload → the edit is still there and the undo button is disabled.
- [ ] **Step 2: Run** `npm run test:e2e` → fix what fails in the app (small fixes) or report it.
- [ ] **Step 3: README**: move editing and undo/redo to "does", with the keyboard shortcuts as a short table; keep the "does not do" list true (insert mode, copy/paste, repeats editing, meter changes, triplets, verses, Scales, MuseScore/ABC, generated PDF, legal pages).
- [ ] **Step 4: Run** `npm test`, `npm run build`, `npm run test:e2e` → all green.
- [ ] **Step 5: Commit** `test: end-to-end editing flows; docs: README for editing`.

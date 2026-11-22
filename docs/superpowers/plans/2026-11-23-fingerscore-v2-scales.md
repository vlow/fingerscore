# fingerscore v2 part 3 (Scales Page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Scales page that shows any of eight scales in any key for any instrument, with a fingering chart under every note; plus two preparations: the sheet page split into smaller pieces and on-demand loading.

**Architecture:** A pure scale builder returns spelled, range-checked notes; a dedicated `ScaleStaff` SVG component draws lines of whole notes with charts, reusing glyphs, fingering lookup and the chooser; the page holds its settings in component state mirrored to localStorage. Independently, `SheetPage.tsx` is split into hooks and components, and routes and editing panels load with `React.lazy`.

**Tech Stack:** Existing stack only. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-23-fingerscore-v2-scales-design.md` (binding), `fingerscore-handoff/SPEC.md` §12 and §16 check 10, prototype `fingerscore-handoff/prototype/Scales.dc.html` (layout, copy, and a reference implementation of the scale logic in its `<script type="text/x-dc">` block).

## Global Constraints

- Written pitch on this page: a scale is built in the instrument's written pitch; concert = written − instrument offset. Fingerings always follow the written note.
- Fingerings come from `optionsFor(instId, written, recorderSystem)` and the automatic choice from `chooseFingerings`; no fingering logic is duplicated.
- Letters follow scale degrees (design 4.2); double sharps and double flats are spelled and drawn, never respelled.
- User-facing strings are exactly those in the design doc.
- All `localStorage` access goes through `src/state/storage.ts` (key `fingerscore.scales`).
- Real `<button>`/`<select>`/`<input>` with labels; segmented controls and key chips are radiogroups (`role="radio"`, `aria-checked`, roving tabindex, arrow keys); `role="status"` for the notice; visible focus; touch targets ≥ 44px (secondary ≥ 36px); decorative SVG `aria-hidden`, and each scale line has a text alternative (see Task 2).
- Design tokens from `src/styles/tokens.css`; CSS modules; one component per file.
- The sheet page's behaviour must not change in Task 4: its existing tests are the guard and are not edited (imports may be updated).
- TypeScript 7 strict; the configured lib lacks `Array.prototype.at`.
- Commit after every task; end commit messages with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Commands: `npm test`, `npm run build`, `npm run test:e2e`.

## Review Focus

1. **Scales that need a double sharp or a theoretical key** (G♯ harmonic and melodic minor: F𝄪; D♭/G♭ major and E♭/B♭ minor with C♭ or F♭): letters follow degrees, the right glyph is drawn, the name text is right. → Task 1 and Task 2 tests.
2. **Scales that do not fit the instrument** (2 octaves on the Xaphoon from B4; alto flute up to its `ext`): cut at the top with the right notice; never an unplayable note. → Task 1 tests.
3. **Whole range on every instrument × every scale × every key**: non-empty, ascending, inside `lo..hi`, every note has a spelling and a range state. → Task 1 property test.
4. **Notes without a sourced fingering**: no scale the builder makes reaches today's gaps (sax written 94/95), but the data can change — the staff must draw a box, not crash, and break the chooser run there. → Task 2 test with a hand-made note.
5. **Stored settings from an older or foreign shape** in `fingerscore.scales`: ignored field by field, the page opens with defaults. → Task 3 test.

## File Structure

```
src/data/scales.json                 copied from the handoff (already committed)
src/domain/keys.ts                   Spelled.alter widened to −2..2; names for double accidentals
src/domain/scales.ts                 buildScale, key chips, names
src/render/Glyph.tsx, glyphs.json    doubleSharp, doubleFlat (Bravura)
src/render/ScaleStaff.tsx            lines of whole notes with names, charts, alternates
src/pages/Scales.tsx (+ css, test)   the page
src/pages/sheet/…                    pieces split from SheetPage.tsx
src/App.tsx, src/ui/Header.tsx       route, nav, lazy loading
e2e/scales.spec.ts
```

---

### Task 1: Scale construction and spelling

**Files:**
- Modify: `src/domain/keys.ts` (+ test), `scripts/extract-glyphs.ts`, `src/data/glyphs.json`, `src/render/Glyph.tsx` (+ test)
- Create: `src/domain/scales.ts`, `src/domain/scales.test.ts`

**Interfaces:**
- Produces (`keys.ts`): `Spelled.alter: -2 | -1 | 0 | 1 | 2`; `accidental()` returns `'doubleSharp' | 'sharp' | 'natural' | 'flat' | 'doubleFlat' | null`; a helper `spelledName(letter, alter, octave?)` giving "F♯", "F𝄪", "B𝄫", "C" (with the octave appended when given). Existing callers keep working (sheets never produce ±2).
- Produces (`Glyph.tsx`): `GlyphName` gains `'doubleSharp' | 'doubleFlat'` (Bravura U+E263, U+E264 via `npm run glyphs`), placed like the other accidentals.
- Produces (`scales.ts`):

```ts
export type ScaleId = 'maj' | 'nmin' | 'hmin' | 'mmin' | 'pmaj' | 'pmin' | 'blues' | 'chrom';
export const SCALE_IDS: ScaleId[];                                   // in the order above
export function scaleName(id: ScaleId): string;                      // 'major', 'natural minor', … from scales.json
export function isMinorType(id: ScaleId): boolean;
export type ScaleRange = 'one' | 'two' | 'all';
export type ScaleDirection = 'up' | 'updown';
export interface ScaleNote { written: number; spelled: Spelled; state: 'ok' | 'ext'; ascending: boolean; accidental: ReturnType<typeof accidental> }
export interface ScaleResult { notes: ScaleNote[]; sig: number; tonic: string; notice: string | null }
export function buildScale(o: { inst: InstId; scale: ScaleId; tonicPc: number; range: ScaleRange; direction: ScaleDirection }): ScaleResult;   // tonicPc = written
export interface KeyChip { writtenPc: number; concertPc: number; written: string; concert: string }
export function keyChips(inst: InstId, scale: ScaleId, by: 'read' | 'sound'): KeyChip[];   // 12 chips, ordered by the leading name's pc from C
export function isKeyTransposing(inst: InstId): boolean;             // off mod 12 !== 0
```

Rules: design 4.1 and 4.2 verbatim. `ScaleNote.accidental` already applies the rule of design 4.2: an accidental when the alteration differs from the signature, or when the most recent earlier note of the sequence with the same letter and octave had another alteration (so G♮ gets a natural when descending melodic minor after G♯). Tonic letter: from the tonic name (major or minor table by scale type). Degree letters wrap (letter index mod 7); the octave of a spelled note is the octave in which its letter's natural pitch is nearest to the written pitch (so B♯3 = MIDI 60, C♭5 = MIDI 71).

- [ ] **Step 1: Write the failing tests**

```ts
const names = (r: ScaleResult) => r.notes.map(n => n.spelled.name.replace(/\d+$/, ''));
const build = (inst: InstId, scale: ScaleId, tonicPc: number, range: ScaleRange = 'one', direction: ScaleDirection = 'up') => buildScale({ inst, scale, tonicPc, range, direction });
it('check 10a: A harmonic minor contains G♯', () => { const r = build('fl', 'hmin', 9); expect(names(r)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G♯', 'A']); expect(r.sig).toBe(0); expect(r.tonic).toBe('A');
  expect(r.notes.map(n => n.accidental)).toEqual([null, null, null, null, null, null, 'sharp', null]); });
it('check 10b: E blues = E G A B♭ B D', () => { const r = build('fl', 'blues', 4); expect(names(r)).toEqual(['E', 'G', 'A', 'B♭', 'B', 'D', 'E']);
  expect(r.sig).toBe(1); expect(r.notes.map(n => n.accidental)).toEqual([null, null, null, 'flat', 'natural', null, null]); });
it('check 10c: C chromatic up with sharps, down with flats', () => { const r = build('fl', 'chrom', 0, 'one', 'updown');
  expect(names(r).slice(0, 13)).toEqual(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C']);
  expect(names(r).slice(13)).toEqual(['B', 'B♭', 'A', 'A♭', 'G', 'G♭', 'F', 'E', 'E♭', 'D', 'D♭', 'C']); expect(r.sig).toBe(0); expect(r.notes[12].ascending).toBe(true); expect(r.notes[13].ascending).toBe(false); });
it('chromatic in a flat key ascends with flats', () => { expect(names(build('fl', 'chrom', 5)).slice(0, 4)).toEqual(['F', 'G♭', 'G', 'A♭']); });
it('melodic minor descends as natural minor', () => { const r = build('fl', 'mmin', 9, 'one', 'updown'); expect(names(r)).toEqual(['A', 'B', 'C', 'D', 'E', 'F♯', 'G♯', 'A', 'G', 'F', 'E', 'D', 'C', 'B', 'A']);
  expect(r.notes[8].accidental).toBe('natural'); expect(r.notes[9].accidental).toBe('natural'); });
it('double sharp: G♯ harmonic minor has F𝄪 (review focus 1)', () => { const r = build('fl', 'hmin', 8); expect(r.tonic).toBe('G♯'); expect(names(r)).toEqual(['G♯', 'A♯', 'B', 'C♯', 'D♯', 'E', 'F𝄪', 'G♯']);
  expect(r.sig).toBe(5); expect(r.notes[6].accidental).toBe('doubleSharp'); expect(r.notes[6].spelled.alter).toBe(2); });
it('flat keys keep their letters: G♭ major has C♭, E♭ minor has C♭', () => { expect(names(build('fl', 'maj', 6))).toEqual(['G♭', 'A♭', 'B♭', 'C♭', 'D♭', 'E♭', 'F', 'G♭']); expect(build('fl', 'maj', 6).sig).toBe(-6);
  expect(names(build('fl', 'nmin', 3))).toEqual(['E♭', 'F', 'G♭', 'A♭', 'B♭', 'C♭', 'D♭', 'E♭']); const cb = build('fl', 'maj', 6).notes[3]; expect(cb.written % 12).toBe(11); expect(cb.accidental).toBeNull(); });
it('pentatonics', () => { expect(names(build('fl', 'pmaj', 0))).toEqual(['C', 'D', 'E', 'G', 'A', 'C']); expect(names(build('fl', 'pmin', 9))).toEqual(['A', 'C', 'D', 'E', 'G', 'A']); });
it('starts on the lowest tonic at or above the lowest note', () => { expect(build('asax', 'maj', 0).notes[0].written).toBe(60); expect(build('asax', 'maj', 10).notes[0].written).toBe(58); expect(build('asax', 'maj', 9).notes[0].written).toBe(69); expect(build('cl', 'maj', 4).notes[0].written).toBe(52); });
it('two octaves and the amber notice', () => { const r = build('asax', 'maj', 7, 'two'); expect(r.notes[0].written).toBe(67); expect(r.notes[r.notes.length - 1].written).toBe(91);
  expect(r.notes.filter(n => n.state === 'ext').length).toBeGreaterThan(0); expect(r.notice).toBe('Notes above F6 need extended fingerings and are marked amber. Try 1 octave or another key for an easier scale.'); });
it('a scale that does not fit is cut at the top (review focus 2)', () => { const r = build('xc', 'maj', 11, 'two');   // Xaphoon C4–C6: B4 + 24 = B6
  expect(r.notes[0].written).toBe(71); expect(Math.max(...r.notes.map(n => n.written))).toBeLessThanOrEqual(84);
  expect(r.notice).toBe('The second octave does not fit this instrument. Shown up to C6, the top of the extended range.'); expect(r.notes.every(n => n.state === 'ok')).toBe(true); });
it('whole range: every instrument, scale and key (review focus 3)', () => { for (const id of ORDER) for (const sc of SCALE_IDS) for (let pc = 0; pc < 12; pc++) {
  const r = build(id, sc, pc, 'all'); const w = r.notes.map(n => n.written); expect(w.length, `${id} ${sc} ${pc}`).toBeGreaterThan(0);
  expect(w).toEqual([...w].sort((a, b) => a - b)); expect(w[0]).toBeGreaterThanOrEqual(inst(id).lo); expect(w[w.length - 1]).toBeLessThanOrEqual(inst(id).hi);
  for (const n of r.notes) { expect(Math.abs(n.spelled.alter)).toBeLessThanOrEqual(2); expect(spelledMidi(n.spelled)).toBe(n.written); } } });
it('up and down ends where it started and does not repeat the top', () => { const r = build('fl', 'maj', 0, 'one', 'updown'); const w = r.notes.map(n => n.written); expect(w.length).toBe(15); expect(w[14]).toBe(w[0]); expect(w[7]).toBe(72); expect(w[8]).toBe(71); });
it('key chips', () => { const read = keyChips('asax', 'maj', 'read'); expect(read).toHaveLength(12); expect(read[0]).toMatchObject({ written: 'C', concert: 'E♭', writtenPc: 0, concertPc: 3 });
  const sound = keyChips('asax', 'maj', 'sound'); expect(sound[0]).toMatchObject({ concert: 'C', written: 'A', concertPc: 0, writtenPc: 9 });
  expect(keyChips('asax', 'hmin', 'read')[8].written).toBe('G♯'); expect(isKeyTransposing('asax')).toBe(true); expect(isKeyTransposing('picc')).toBe(false); expect(isKeyTransposing('fl')).toBe(false); });
it('scale names', () => { expect(SCALE_IDS.map(scaleName)).toEqual(['major', 'natural minor', 'harmonic minor', 'melodic minor', 'major pentatonic', 'minor pentatonic', 'blues', 'chromatic']); });
```

`spelledMidi(s)` is a test helper: natural pitch of the letter in that octave plus `alter`. Add `keys.test.ts` cases for `spelledName` and `accidental` with ±2, and a `Glyph` test that `doubleSharp` and `doubleFlat` have non-empty paths.
- [ ] **Step 2: Run** `npx vitest run src/domain/scales.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Extend `scripts/extract-glyphs.ts` with the two code points and run `npm run glyphs`; the existing glyph paths in `glyphs.json` must not change (check with `git diff --stat` that only additions appear).
- [ ] **Step 4: Run** → PASS; `npm test`, `npm run build` green.
- [ ] **Step 5: Commit** `feat: scale construction with degree-based spelling; double accidentals`.

---

### Task 2: Scale staff

**Files:**
- Create: `src/render/ScaleStaff.tsx`, `src/render/ScaleStaff.module.css`, `src/render/ScaleStaff.test.tsx`

**Interfaces:**
- Consumes: `ScaleResult`, `optionsFor`, `chooseFingerings`, `Glyph`, `FingeringChart`, `MissingChart`, `signatureLetters`, `staffPos`, `inst`.
- Produces:

```tsx
export const NOTES_PER_LINE = 15;
export function ScaleStaff(p: { inst: InstId; scale: ScaleResult; chartStyle: 'compact' | 'full'; recorderSystem: 'baroque' | 'german'; showNames: boolean; showAlternates: boolean }): JSX.Element;
```

Behaviour: design 4.3 and the "Notation" bullet of 4.4. Each line is one `<svg data-testid="scale-line" aria-hidden="true">` preceded by a visually hidden paragraph listing that line's note names ("C4, D4, E4, …") as its text alternative. Per note a `<g data-note data-state="ok|ext">` with the whole-note head (amber when `ext`), ledger lines, the accidental glyph when `note.accidental` is set, the name text `[data-name]` under the staff when `showNames`, the chosen chart `[data-chart]` or `MissingChart` `[data-missing]`, and, when `showAlternates`, every further option stacked below as `[data-alt]` with its name text. The chooser runs over the whole sequence (not per line); a note without options breaks the run. Line height grows with the tallest stack of that line. Clef and key signature start every line; a thin double barline `[data-end]` follows the last note of the last line. Geometry from `prototype/Scales.dc.html` and the sheet's constants (staff space 10px, glyph scale).

- [ ] **Step 1: Write the failing tests**

```tsx
const draw = (o: Partial<Parameters<typeof ScaleStaff>[0]> & { scale: ScaleResult; inst: InstId }) =>
  render(<ScaleStaff chartStyle="compact" recorderSystem="baroque" showNames showAlternates={false} {...o} />);
it('one line for an octave: notes, names, charts, end barline', () => { const scale = buildScale({ inst: 'fl', scale: 'maj', tonicPc: 0, range: 'one', direction: 'up' });
  const { container } = draw({ inst: 'fl', scale }); expect(container.querySelectorAll('[data-testid="scale-line"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-note]')).toHaveLength(8); expect([...container.querySelectorAll('[data-name]')].map(e => e.textContent)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
  expect(container.querySelectorAll('[data-chart]').length + container.querySelectorAll('[data-missing]').length).toBe(8); expect(container.querySelectorAll('[data-end]')).toHaveLength(1);
  expect(screen.getByText('C4, D4, E4, F4, G4, A4, B4, C5')).toBeInTheDocument(); });
it('breaks lines at 15 notes', () => { const scale = buildScale({ inst: 'fl', scale: 'chrom', tonicPc: 0, range: 'one', direction: 'updown' });   // 25 notes
  const { container } = draw({ inst: 'fl', scale }); const lines = container.querySelectorAll('[data-testid="scale-line"]'); expect(lines).toHaveLength(2);
  expect(lines[0].querySelectorAll('[data-note]')).toHaveLength(15); expect(lines[1].querySelectorAll('[data-note]')).toHaveLength(10); expect(lines[1].querySelectorAll('[data-clef]')).toHaveLength(1); });
it('accidentals and double sharp glyph (review focus 1)', () => { const scale = buildScale({ inst: 'fl', scale: 'hmin', tonicPc: 8, range: 'one', direction: 'up' });
  const { container } = draw({ inst: 'fl', scale }); expect(container.querySelectorAll('[data-acc="doubleSharp"]')).toHaveLength(1); expect(container.querySelectorAll('[data-keysig] [data-acc]').length).toBe(5);
  expect([...container.querySelectorAll('[data-name]')].map(e => e.textContent)[6]).toBe('F𝄪5'); });
it('extended notes are amber', () => { const scale = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 7, range: 'two', direction: 'up' }); const { container } = draw({ inst: 'asax', scale });
  expect(container.querySelectorAll('[data-state="ext"]').length).toBe(scale.notes.filter(n => n.state === 'ext').length); });
it('a note without a sourced fingering shows a box (review focus 4)', () => {
  // No scale the builder makes reaches the open sax gaps (written 94/95), so append such a note by hand.
  const scale = buildScale({ inst: 'tsax', scale: 'maj', tonicPc: 0, range: 'one', direction: 'up' }); const last = scale.notes[scale.notes.length - 1];
  const gap = { ...last, written: 95, state: 'ext' as const, spelled: { letter: 6, alter: 0 as const, octave: 6, name: 'B6' }, accidental: null };
  expect(optionsFor('tsax', 95, 'baroque')).toEqual([]);                                   // still a documented gap; if this fails, pick another gap from fingering-gaps.json
  const { container } = draw({ inst: 'tsax', scale: { ...scale, notes: [...scale.notes, gap, { ...last }] } });
  expect(container.querySelectorAll('[data-missing]')).toHaveLength(1); expect(container.querySelectorAll('[data-chart]')).toHaveLength(9); });
it('names can be hidden; alternates can be shown', () => { const scale = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 5, range: 'one', direction: 'up' });   // F major: B♭4 has bis / 1+1 / side
  const a = draw({ inst: 'asax', scale, showNames: false }); expect(a.container.querySelectorAll('[data-name]')).toHaveLength(0); expect(a.container.querySelectorAll('[data-alt]')).toHaveLength(0); a.unmount();
  const b = draw({ inst: 'asax', scale, showAlternates: true }); expect(b.container.querySelectorAll('[data-alt]').length).toBeGreaterThanOrEqual(2); expect(b.container.textContent).toContain('side B♭'); });
it('the automatic choice matches the sheet\'s chooser', () => { /* build the ChooserItem list by hand for an F major scale on alto sax and assert the [data-chart] option index per note equals chooseFingerings' result (expose data-option on the chart group) */ });
it('recorder system and chart style reach the charts', () => { /* rs F major: baroque vs german render different hole patterns for F; asax full style renders more [data-sat] than compact */ });
```

Every body given as a comment must become real assertions.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `npm test`, `npm run build` green.
- [ ] **Step 5: Commit** `feat: scale staff with names, charts and stacked alternates`.

---

### Task 3: The Scales page

**Files:**
- Create: `src/pages/Scales.tsx`, `src/pages/Scales.module.css`, `src/pages/Scales.test.tsx`, `src/ui/Segmented.tsx` (+ CSS) if no reusable segmented control exists
- Modify: `src/App.tsx` (lazy route `/scales`), `src/ui/Header.tsx` (+ `src/App.test.tsx`), `src/styles/print.css`

**Interfaces:**
- Consumes: Task 1 and 2 exports; `useApp(s => s.instId)`; `readJSON`/`writeJSON`; instrument helpers; `hasSatellites`; `legend`.
- Produces: default export `Scales` (the page); stored settings shape `{ inst, scale, tonicPc, range, direction, by, chartStyle, recorderSystem, showAlternates, showNames }` under `fingerscore.scales`.

Behaviour: design 4.4 in full. Accessible names: heading "Scales with fingerings"; button "Print"; select "Instrument"; select "Scale"; radiogroups "Range", "Direction", "Key", and "Name keys by" (radios "You read", "Sounds in"; only for key-transposing instruments); chart-style radiogroup "Chart style" (radios "Compact", "Full key map") or "Recorder system" (radios "Baroque", "German fingering") as applicable; checkboxes "Show alternate fingerings", "Note names". Key chip accessible names: "{written} · sounds {concert}" / "{concert} · you read {written}" / just the name for non-transposing instruments. The scale is drawn inside `<section aria-label="Scale">` on a paper-like card with a caption line "{Instrument display name} · {tonic} {scale name}" (+ " · sounds {concert tonic} {scale name}" when key-transposing), then `ScaleStaff`, then the legend (`legend(inst)`) and "fingerscore.eu". Stored settings are validated field by field on load (unknown instrument → preferred instrument; unknown values → defaults). Header: "Scales" nav link, current on `/scales`; "Songs" stays current on `/`, `/tracks`, `/sheet`. Print: on this page only the scale section prints (extend `print.css` with a `:has([data-print-scale])` block like the sheet's).

- [ ] **Step 1: Write the failing tests**

```tsx
beforeEach(() => { localStorage.clear(); useApp.setState({ instId: 'asax' }); });
it('opens with the preferred instrument, C major, one octave up', () => { renderScales(); expect(screen.getByRole('heading', { level: 1, name: 'Scales with fingerings' })).toBeInTheDocument();
  expect(screen.getByLabelText('Instrument')).toHaveValue('asax'); expect(screen.getByLabelText('Scale')).toHaveValue('maj');
  expect(within(screen.getByRole('radiogroup', { name: 'Key' })).getByRole('radio', { name: 'C · sounds E♭' })).toBeChecked();
  expect(within(screen.getByRole('region', { name: 'Scale' })).getByText('Alto sax in E♭ · C major · sounds E♭ major')).toBeInTheDocument();
  expect(document.querySelectorAll('[data-note]')).toHaveLength(8); });
it('header navigation', () => { renderApp('/scales'); expect(screen.getByRole('link', { name: 'Scales' })).toHaveAttribute('aria-current', 'page'); expect(screen.getByRole('link', { name: 'Songs' })).not.toHaveAttribute('aria-current'); });
it('scale, key, range and direction change the notation', async () => { renderScales(); await user.selectOptions(screen.getByLabelText('Scale'), 'blues');
  await user.click(screen.getByRole('radio', { name: /^E · sounds G$/ })); expect(noteNames()).toEqual(['E4', 'G4', 'A4', 'B♭4', 'B4', 'D5', 'E5']);
  await user.click(screen.getByRole('radio', { name: 'Up & down' })); expect(noteNames()).toHaveLength(13); await user.click(screen.getByRole('radio', { name: '2 octaves' })); expect(noteNames().length).toBeGreaterThan(13); });
it('name keys by what sounds', async () => { renderScales(); await user.click(screen.getByRole('radio', { name: 'Sounds in' }));
  const chips = within(screen.getByRole('radiogroup', { name: 'Key' })).getAllByRole('radio'); expect(chips[0]).toHaveAccessibleName('C · you read A'); expect(chips.find(c => c.getAttribute('aria-checked') === 'true')).toHaveAccessibleName('E♭ · you read C'); });
it('non-transposing instruments have plain chips and no naming toggle', async () => { renderScales(); await user.selectOptions(screen.getByLabelText('Instrument'), 'fl');
  expect(screen.queryByRole('radiogroup', { name: 'Name keys by' })).toBeNull(); expect(within(screen.getByRole('radiogroup', { name: 'Key' })).getAllByRole('radio')[0]).toHaveAccessibleName('C'); });
it('the notice shows for scales that leave the normal range', async () => { renderScales(); await user.selectOptions(screen.getByLabelText('Instrument'), 'xc'); await user.click(screen.getByRole('radio', { name: 'B' }));
  await user.click(screen.getByRole('radio', { name: '2 octaves' })); expect(screen.getByRole('status')).toHaveTextContent('The second octave does not fit this instrument. Shown up to C6, the top of the extended range.'); });
it('chart style or recorder system by instrument family', async () => { renderScales(); expect(screen.getByRole('radiogroup', { name: 'Chart style' })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Instrument'), 'rs'); expect(screen.getByRole('radiogroup', { name: 'Recorder system' })).toBeInTheDocument(); expect(screen.queryByRole('radiogroup', { name: 'Chart style' })).toBeNull();
  await user.selectOptions(screen.getByLabelText('Instrument'), 'xc'); expect(screen.queryByRole('radiogroup', { name: /Chart style|Recorder system/ })).toBeNull(); });
it('checkboxes: note names and alternates', async () => { renderScales(); await user.click(screen.getByLabelText('Note names')); expect(document.querySelectorAll('[data-name]')).toHaveLength(0);
  await user.click(screen.getByRole('radio', { name: /^F · sounds A♭$/ })); await user.click(screen.getByLabelText('Show alternate fingerings')); expect(document.querySelectorAll('[data-alt]').length).toBeGreaterThan(0); });
it('settings are remembered; the preferred instrument and an open sheet are untouched', async () => { const doc = sampleDoc('asax'); useApp.setState({ doc }); const first = renderScales();
  await user.selectOptions(screen.getByLabelText('Instrument'), 'cl'); await user.selectOptions(screen.getByLabelText('Scale'), 'hmin'); await user.click(screen.getByRole('radio', { name: 'Whole range' })); first.unmount();
  expect(useApp.getState().instId).toBe('asax'); expect(useApp.getState().doc).toBe(doc); renderScales(); expect(screen.getByLabelText('Instrument')).toHaveValue('cl'); expect(screen.getByLabelText('Scale')).toHaveValue('hmin');
  expect(screen.getByRole('radio', { name: 'Whole range' })).toBeChecked(); });
it('foreign stored settings fall back field by field (review focus 5)', () => { localStorage.setItem('fingerscore.scales', JSON.stringify({ inst: 'oboe', scale: 'lydian', tonicPc: 99, range: 7, direction: null, showNames: 'yes', by: 'sound' }));
  renderScales(); expect(screen.getByLabelText('Instrument')).toHaveValue('asax'); expect(screen.getByLabelText('Scale')).toHaveValue('maj'); expect(screen.getByRole('radio', { name: '1 octave' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Sounds in' })).toBeChecked(); localStorage.setItem('fingerscore.scales', '{oops'); cleanup(); expect(() => renderScales()).not.toThrow(); });
it('Print prints', async () => { const print = vi.spyOn(window, 'print').mockImplementation(() => {}); renderScales(); await user.click(screen.getByRole('button', { name: 'Print' })); expect(print).toHaveBeenCalled(); });
it('radiogroups work with arrow keys', async () => { renderScales(); screen.getByRole('radio', { name: '1 octave' }).focus(); await user.keyboard('{ArrowRight}'); expect(screen.getByRole('radio', { name: '2 octaves' })).toBeChecked(); expect(screen.getByRole('radio', { name: '2 octaves' })).toHaveFocus(); });
```

`noteNames()` reads `[data-name]` texts; `renderScales`/`renderApp` render inside a `MemoryRouter` (the lazy route needs `await screen.findBy…` in `renderApp` tests).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, layout and copy from `prototype/Scales.dc.html`. **Step 4: Run** → PASS; `npm test`, `npm run build`, `npm run test:e2e` green.
- [ ] **Step 5: Commit** `feat: Scales page`.

---

### Task 4: Split the sheet page; load on demand

**Files:**
- Create: `src/pages/sheet/useSelection.ts`, `useSheetKeys.ts`, `usePlayback.ts`, `EditPanelSlot.tsx` (names indicative; one responsibility each)
- Modify: `src/pages/SheetPage.tsx`, `src/App.tsx`, any import paths

**Interfaces:**
- Produces: the same default export `SheetPage`; no behaviour change. `SheetPage.tsx` ends below 300 lines. `App.tsx` loads `Tracks` and (when Task 3 has landed) `Scales` with `React.lazy` inside `Suspense`; the sheet page loads `NotePanel`, `LyricPanel`, `ChordPanel` and `BulkCard` lazily.

- [ ] **Step 1: Record the baseline**: run `npm test` (count) and `npm run build` (main chunk size in kB) and note both in the report.
- [ ] **Step 2: Split** selection and announcements, the sheet key handling (all modes), playback (audible key, toggle, error), and the under-system panel slot with its focus watch out of `SheetPage.tsx`. Move, do not rewrite: keep names, logic and comments. Do not edit `SheetPage.test.tsx` except where a lazily loaded panel now needs `await screen.findBy…`/`waitFor` — list every such change in the report.
- [ ] **Step 3: Lazy loading** as described. Keyboard and focus behaviour must hold when a panel chunk arrives after the selection (the field still takes focus on a click; `Tab` from the sheet still reaches it).
- [ ] **Step 4: Run** `npm test` (same count as baseline, all green), `npm run build` (main chunk < 500 kB, no size warning; report all chunk sizes), `npm run test:e2e` (green).
- [ ] **Step 5: Commit** `refactor: split the sheet page into hooks; load panels and pages on demand`.

---

### Task 5: End-to-end test and README

**Files:**
- Create: `e2e/scales.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the e2e tests** (cleared storage first; console/page errors collected and expected empty):
  1. Open `/`, follow the header's "Scales" link → heading visible, 8 notes, the checked key chip names the alto sax's C; choose "harmonic minor" and the chip whose written name is A → a note named "G♯" is visible; choose "Up & down" → 15 notes; choose "2 octaves" → more than 15 notes and two `[data-testid=scale-line]`.
  2. Instrument "Xaphoon in C", key B, "2 octaves" → the notice text of design 4.1 is visible and no note name above C6 appears.
  3. Toggle "Show alternate fingerings" in F major on alto sax → `[data-alt]` count > 0; reload → the instrument, scale, key and the checkbox state are restored.
  4. Emulate print media (`page.emulateMedia({ media: 'print' })`) → the control card and the site header are hidden, the scale section is visible.
  5. Bundle check: after `npm run build` is not part of e2e — instead assert in this spec that navigating from `/` to `/scales` triggers a request for a separate script chunk (the Scales page is not in the entry chunk): collect `request` events for `.js` after the click and expect at least one.
- [ ] **Step 2: Run** `npm run test:e2e` → fix what fails in the app (small fixes) or report it.
- [ ] **Step 3: README**: add the Scales page to "does" (eight scales, twelve keys, ranges, direction, key naming for transposing instruments, alternates, print); remove it from "does not do"; keep the rest true.
- [ ] **Step 4: Run** `npm test`, `npm run build`, `npm run test:e2e` → all green.
- [ ] **Step 5: Commit** `test: end-to-end Scales page; docs: README for scales`.

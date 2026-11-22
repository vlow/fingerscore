# fingerscore Version 1 (Core Path) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-only app that turns a MIDI or MusicXML file into a transposed sheet with a fingering chart under every note for 12 woodwinds, with playback and print.

**Architecture:** Pure TypeScript domain modules (keys, transposition, fingerings, chooser, playback schedule) with unit tests; importers that turn files into a `ParsedSong` and then a `Doc`; an SVG renderer driven by a pure layout function; three React pages over one zustand store. No backend.

**Tech Stack:** Vite, TypeScript strict, React 18, react-router-dom 6, zustand, CSS modules, `@tonejs/midi`, `midi-file`, `jszip`, `@fontsource/atkinson-hyperlegible`, Vitest (+ jsdom, @testing-library/react), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-22-fingerscore-v1-core-path-design.md` (the design; wins for version 1) and `fingerscore-handoff/SPEC.md` (behaviour, copy, layout numbers; cited as §n). Prototypes in `fingerscore-handoff/prototype/*.dc.html` are the visual reference and contain working reference code in their `<script type="text/x-dc">` blocks. Read them, never ship them.

## Global Constraints

- App lives at the repo root. `fingerscore-handoff/` is read-only reference. Never commit `fingerscore-handoff/reference/` or the zip.
- Pitches are MIDI numbers. The document stores **concert pitch in the original key** plus `shift`; written = concert + shift + instrument.off. Never store written pitches.
- Time is in **ticks, 12 per quarter note**. Allowed durations: 3, 6, 9, 12, 18, 24, 36, 48. Every bar's events sum exactly to its `cap`.
- Meters: 4/4, 3/4, 2/4, 6/8 only, one per song.
- Everything attached to an event (fingering override, chord) is keyed by the event's stable `id`.
- English UI only. Copy comes verbatim from SPEC.md where it gives copy.
- No network requests at runtime except same-origin static files. Fonts are self-hosted. No analytics, no cookies.
- All `localStorage`/`sessionStorage` access goes through `src/state/storage.ts` and is wrapped in try/catch.
- Fingerings come from published charts only. No derived or guessed entries.
- Real `<button>`, `<a>`, `<input>`, `<select>` with labels; `aria-pressed`/`aria-checked`/`aria-expanded` on toggles; `role="alert"` on errors; visible focus; touch targets ≥ 44px (secondary ≥ 36px).
- Design tokens (§15): ink `#15171C`, text `#2A2D33`, muted `#5B616E`/`#4A505C`, borders `#E2E4E8`/`#D5D8DE`, page `#F3F4F6`, page bar `#FAFAFB`, card `#FFFFFF`, teal `#0E6E68` (hover `#0A4F4A`, tint `#E3F4F2`, light `#F0FAF8`), amber `#B45309` on `#FFF7ED`, red `#B91C1C` on `#FEF2F2`, ghost `#C3C7CE`. Radius 10px controls, 12–16px cards, 999px pills. Page padding 28px.
- Commit after every task. End commit messages with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Commands: `npm run dev`, `npm test`, `npm run test:e2e`, `npm run build`.

## Review Focus

1. **A file that is not what its extension says** (a text file named `.mid`, a truncated `.mxl`): the drop zone shows the unsupported-file error naming the file; nothing throws to the console. → test in Task 16.
2. **A chosen track with overlapping or simultaneous notes** (legato overlaps, chords): the sheet still has bars that sum to `cap`, one note at a time. → test in Task 15.
3. **A MIDI file without tempo, key signature or time signature events**: tempo 120, 4/4, key estimated; no crash. → test in Task 16.
4. **Browser storage blocked** (private mode throws on `setItem`): the whole core path still works for the session. → test in Task 14.
5. **A song no shift can make playable** (range wider than the instrument): a best shift is still returned, the red banner shows, unplayable notes get "!" boxes, the chooser does not crash on runs broken by them. → tests in Tasks 5 and 8.

## File Structure

```
index.html, vite.config.ts, tsconfig.json, playwright.config.ts
public/demo/Auld_Lang_Syne.mid          generated, committed
scripts/make-demo-midi.ts               generates the demo
scripts/extract-glyphs.md               how the two new glyph sets were produced
docs/fingering-gaps.md                  human-readable gap list with sources checked
src/
  main.tsx, App.tsx                     router + shell
  styles/tokens.css, styles/global.css, styles/print.css
  data/instruments.json, fingerings.json, fingering-gaps.json, glyphs.json, sample-song.json
  domain/types.ts        Doc, Bar, Ev, ChordSym, InstId, Mode, TimeSig
  domain/time.ts         tick constants, meters, duration splitting
  domain/instruments.ts  instrument lookup, families, range state, interval text
  domain/keys.ts         key signature, key name, spelling, staff position, accidentals
  domain/transpose.ts    shift scoring, ranking, key-bridge jumps
  domain/fingerings.ts   optionsFor(), legend, meta
  domain/chooser.ts      Viterbi choice
  domain/chords.ts       parse / transpose / format
  domain/playback.ts     schedule with repeats and voltas
  domain/fixture.ts      sample-song.json → Doc
  domain/derive.ts       one selector: Doc → everything the sheet page shows
  import/types.ts, quantise.ts, bars.ts, keyfind.ts, melody.ts, harmony.ts, midi.ts, musicxml.ts, buildDoc.ts, index.ts
  render/layout.ts, Glyph.tsx, FingeringChart.tsx, SystemView.tsx, Paper.tsx
  audio/player.ts
  state/storage.ts, store.ts
  ui/Header.tsx, Footer.tsx, PageBar.tsx, Steps.tsx, InstrumentPicker.tsx, DropZone.tsx, KeyBridge.tsx,
     RangeMeter.tsx, Banners.tsx, ShowToggles.tsx, AltFingeringPopover.tsx, Transport.tsx, PianoRoll.tsx, icons.tsx
  pages/Start.tsx, Tracks.tsx, SheetPage.tsx
e2e/core-path.spec.ts
```

Tests sit beside their module as `*.test.ts(x)`.

---

### Task 1: Project scaffold, shell and design tokens

**Files:**
- Create: `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `playwright.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`, `src/styles/global.css`, `src/ui/Header.tsx`, `src/ui/Footer.tsx`, `src/ui/icons.tsx`, `src/pages/Start.tsx`, `src/pages/Tracks.tsx`, `src/pages/SheetPage.tsx` (the three pages as stubs), `src/App.test.tsx`, `README.md`
- Copy: `fingerscore-handoff/data/{instruments,fingerings,glyphs,sample-song}.json` → `src/data/`

**Interfaces:**
- Produces: routes `/`, `/tracks`, `/sheet` (BrowserRouter; unknown paths redirect to `/`); `<Header/>`, `<Footer/>`; CSS custom properties named `--ink`, `--text`, `--muted`, `--muted-2`, `--border`, `--border-2`, `--page`, `--pagebar`, `--card`, `--teal`, `--teal-hover`, `--teal-tint`, `--teal-light`, `--amber`, `--amber-bg`, `--red`, `--red-bg`, `--ghost`, `--radius`, `--radius-card`; npm scripts `dev`, `build`, `test` (`vitest run`), `test:e2e` (`playwright test`, webServer = `npm run dev`, baseURL `http://localhost:5173`).

- [ ] **Step 1: Scaffold.** `npm create vite@latest . -- --template react-ts` in the repo root (keep existing files), then install: `react-router-dom@6 zustand @tonejs/midi midi-file jszip @fontsource/atkinson-hyperlegible` and dev: `vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom @playwright/test tsx`. Pin React to 18. Enable `"strict": true`, `"resolveJsonModule": true`. Vitest: `environment: 'jsdom'`, `include: ['src/**/*.test.{ts,tsx}']`. Run `npx playwright install chromium`.
- [ ] **Step 2: Write the failing test** `src/App.test.tsx`:

```tsx
it('renders the shell on every route', () => {
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  expect(screen.getByRole('link', { name: /fingerscore/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Songs' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('link', { name: 'Scales' })).toBeNull();        // version 2
  expect(screen.getByText('Your sheets are stored in your browser. Nothing is stored on the server.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Imprint' })).toBeNull();       // version 2
});
```

`App` must not create its own router; `main.tsx` wraps it in `BrowserRouter`.
- [ ] **Step 3: Run** `npm test` → FAIL (no Header).
- [ ] **Step 4: Implement** tokens and global CSS (import the four Atkinson Hyperlegible faces 400/700 + italics from `@fontsource`; `font-family` on `body`), Header per §2.1 (logo mark + wordmark, nav "Songs" only), Footer per §2.3 (logo + "fingerscore © 2026", the storage sentence, no links), page stubs with an `<h1>`. Take the logo mark SVG and header/footer layout from `prototype/Main.dc.html`.
- [ ] **Step 5: Run** `npm test` → PASS; `npm run build` → succeeds.
- [ ] **Step 6: README** with the four commands and one line: "History routing: the server must serve `index.html` for `/tracks` and `/sheet` (nginx: `try_files $uri /index.html;`)."
- [ ] **Step 7: Commit** `chore: scaffold app shell, tokens, header and footer`.

---

### Task 2: Document types and time

**Files:**
- Create: `src/domain/types.ts`, `src/domain/time.ts`, `src/domain/time.test.ts`

**Interfaces:**
- Produces (`types.ts`):

```ts
export type InstId = 'xc'|'xbb'|'ssax'|'asax'|'tsax'|'bsax'|'cl'|'rs'|'ra'|'fl'|'picc'|'afl';
export type Mode = 'major' | 'minor';
export type TimeSig = [4,4] | [3,4] | [2,4] | [6,8];
export interface Ev { id: string; m: number; d: number; r: boolean; tie: boolean; l: string; c: string }
export interface Bar { cap: number; rs: boolean; re: boolean; volta: '' | '1' | '2'; ev: Ev[] }
export interface ChordSym { raw: string; ok: boolean; pc: number; rest: string; bass: number | null; tk: number }
export interface Doc {
  score: Bar[]; timeSig: TimeSig;
  originalTonicPc: number; originalMode: Mode;     // minor: tonic of the minor key
  tempo: number; inst: InstId; shift: number;
  fingering: Record<string, number>;               // event id → option index
  chords: Record<string, ChordSym>;                // event id → chord
  title: string; subtitle: string;
  chartStyle: 'compact' | 'full'; recorderSystem: 'baroque' | 'german';
  show: { fingerings: boolean; chords: boolean; lyrics: boolean; raiseExtensions: boolean };
  source: { file: string; format: 'MIDI' | 'MusicXML' | 'sample'; track: string; trackCount: number; simplified: boolean };
}
```

`Ev.m` on a rest keeps the last pitch. `Ev.c` is the chord text as imported (kept for version 2). `ChordSym.tk` = `(shift + inst.off) mod 12` at which `raw` is shown verbatim.

- Produces (`time.ts`):

```ts
export const TPQ = 12;
export const DURATIONS = [48, 36, 24, 18, 12, 9, 6, 3] as const;
export function barCap(ts: TimeSig): number;                 // 48, 36, 24, 36
export function beatTicks(ts: TimeSig): number;              // 12, 12, 12, 18 (beam group length)
export function isSupportedTimeSig(n: number, d: number): boolean;
export function splitDuration(ticks: number): number[];      // greedy, largest first
export function newId(): string;                             // 'e' + counter/random; unique per session
```

- [ ] **Step 1: Write the failing tests**

```ts
it('bar capacities', () => { expect([[4,4],[3,4],[2,4],[6,8]].map(t => barCap(t as TimeSig))).toEqual([48,36,24,36]); });
it('beam groups', () => { expect(beatTicks([6,8])).toBe(18); expect(beatTicks([3,4])).toBe(12); });
it('supported meters', () => { expect(isSupportedTimeSig(5,4)).toBe(false); expect(isSupportedTimeSig(6,8)).toBe(true); });
it('splits durations greedily', () => {
  expect(splitDuration(48)).toEqual([48]);
  expect(splitDuration(30)).toEqual([24, 6]);
  expect(splitDuration(15)).toEqual([12, 3]);
  expect(splitDuration(21)).toEqual([18, 3]);
});
it('rejects off-grid durations', () => { expect(() => splitDuration(4)).toThrow(); });
```

- [ ] **Step 2: Run** `npx vitest run src/domain/time.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat: document types and tick-based time`.

---

### Task 3: Instruments and range states

**Files:**
- Modify: `src/data/instruments.json` — `xc` and `xbb`: `"hi": 84, "ext": 84, "easyTop": 79`
- Create: `src/domain/instruments.ts`, `src/domain/instruments.test.ts`

**Interfaces:**
- Produces:

```ts
export interface Instrument { id: InstId; name: string; group: Family; off: number; lo: number; hi: number; ext: number; kind: 'xaph'|'sax'|'cl'|'fl'|'rec'; easyTop: number; base?: number }
export type Family = 'Saxophone'|'Clarinet'|'Flute'|'Xaphoon'|'Recorder';
export const FAMILIES: Family[];                       // Saxophone, Clarinet, Flute, Xaphoon, Recorder
export const ORDER: InstId[];                          // all 12, family order then member order
export const DEFAULT_INST: InstId;                     // 'asax'
export function inst(id: InstId): Instrument;
export function familyMembers(f: Family): Instrument[];   // sax: ssax, asax, tsax, bsax; flute: fl, picc, afl; xaphoon: xc, xbb; recorder: rs, ra
export function familyDefault(f: Family): InstId;      // asax, cl, fl, xc, rs
export function familySubline(f: Family): string;      // '4 types', 'B♭', '3 types', '2 keys', '2 types'
export function shortName(id: InstId): string;         // picker label: 'Alto E♭', 'Soprano C', 'Alto flute G', 'Clarinet B♭', 'Xaphoon C' …
export type RangeState = 'ok' | 'ext' | 'bad';
export function rangeState(i: Instrument, written: number): RangeState;
export function isTransposing(i: Instrument): boolean; // off mod 12 !== 0
export function intervalText(i: Instrument): string;
export function summary(i: Instrument): string;        // picker header summary, §4.2
export function noteNameFlat(midi: number): string;    // 'B♭3', 'C4' (range labels use flat spelling, §6.4)
```

`intervalText`: off 0 → "sounds as written"; −12 → "sounds an octave higher than written"; otherwise "{name}: you read {x} higher than it sounds" with x = 2 "a whole step", 5 "a perfect fourth", 9 "a major sixth", 14 "a ninth (octave + whole step)", 21 "an octave + major sixth".

- [ ] **Step 1: Write the failing tests**

```ts
it('range states', () => {
  const x = inst('xc');
  expect([59, 60, 84, 85].map(w => rangeState(x, w))).toEqual(['bad','ok','ok','bad']);
  const a = inst('asax');
  expect([57, 58, 89, 90, 96, 97].map(w => rangeState(a, w))).toEqual(['bad','ok','ok','ext','ext','bad']);
});
it('xaphoon follows the official chart', () => { expect(inst('xbb')).toMatchObject({ lo: 60, hi: 84, ext: 84, easyTop: 79 }); });
it('family defaults', () => { expect(FAMILIES.map(familyDefault)).toEqual(['asax','cl','fl','xc','rs']); });
it('interval text', () => {
  expect(intervalText(inst('asax'))).toBe('Alto sax in E♭: you read a major sixth higher than it sounds');
  expect(intervalText(inst('fl'))).toBe('sounds as written');
  expect(intervalText(inst('rs'))).toBe('sounds an octave higher than written');
});
it('summary', () => { expect(summary(inst('asax'))).toBe('Alto sax in E♭ · B♭3 – F6 · reads a major sixth above concert'); });
```

Display names "Alto sax in E♭" etc. differ from `name` in the JSON ("Alto sax (E♭)"); add a `label` map in `instruments.ts` — take the wording from `prototype/Main.dc.html`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: instruments, range states, Xaphoon range from the official chart`.

---

### Task 4: Keys, spelling and staff positions

**Files:**
- Create: `src/domain/keys.ts`, `src/domain/keys.test.ts`

**Interfaces:**
- Produces:

```ts
export function mod12(n: number): number;
export function keySignature(tonicPc: number, mode: Mode): number;      // −6..+5; minor uses relative major (tonic+3)
export function keyName(tonicPc: number, mode: Mode): string;           // 'B♭ major', 'F♯ minor'
export function tonicName(tonicPc: number, mode: Mode): string;         // 'B♭', 'F♯'
export function sigText(sig: number): string;                           // 'no sharps or flats', '2 ♯', '3 ♭'
export interface Spelled { letter: number; alter: -1|0|1; octave: number; name: string }  // letter 0=C..6=B
export function spell(midi: number, sig: number): Spelled;              // sig >= 0 → sharps, sig < 0 → flats
export function staffPos(s: Spelled): number;                           // diatonic steps above E4 (bottom line): E4=0, C4=−2, F5=8
export function accidental(s: Spelled, sig: number): 'sharp'|'flat'|'natural'|null;   // null when the key signature already says it
export function signatureLetters(sig: number): number[];                // letters altered, in order F C G D A E B / B E A D G C F
```

Major tonic names: `C D♭ D E♭ E F G♭ G A♭ A B♭ B`. Minor tonic names: `C C♯ D E♭ E F F♯ G G♯ A B♭ B`. Signature by major tonic pc: `{0:0,1:-5,2:2,3:-3,4:4,5:-1,6:-6,7:1,8:-4,9:3,10:-2,11:5}`.

- [ ] **Step 1: Write the failing tests**

```ts
it('signatures', () => {
  expect(keySignature(2,'major')).toBe(2); expect(keySignature(6,'major')).toBe(-6);
  expect(keySignature(9,'minor')).toBe(0); expect(keySignature(6,'minor')).toBe(3);
});
it('names', () => {
  expect(keyName(10,'major')).toBe('B♭ major'); expect(keyName(6,'major')).toBe('G♭ major');
  expect(keyName(6,'minor')).toBe('F♯ minor'); expect(sigText(-3)).toBe('3 ♭'); expect(sigText(0)).toBe('no sharps or flats');
});
it('spelling follows the signature', () => {
  expect(spell(66, 2).name).toBe('F♯4'); expect(spell(66, -1).name).toBe('G♭4'); expect(spell(61, 0).name).toBe('C♯4');
});
it('staff positions', () => {
  expect(staffPos(spell(64,0))).toBe(0); expect(staffPos(spell(60,0))).toBe(-2); expect(staffPos(spell(77,0))).toBe(8);
  expect(staffPos(spell(70,-2))).toBe(4);   // B♭4 sits on the B line
});
it('accidentals', () => {
  expect(accidental(spell(66,2), 2)).toBeNull();          // F♯ in D major
  expect(accidental(spell(65,2), 2)).toBe('natural');     // F♮ in D major
  expect(accidental(spell(70,0), 0)).toBe('sharp');       // A♯ in C major
  expect(accidental(spell(70,-2), -2)).toBeNull();
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** `feat: key signatures, spelling, staff positions`.

---

### Task 5: Transposition scoring and the sample fixture

**Files:**
- Create: `src/domain/fixture.ts`, `src/domain/transpose.ts`, `src/domain/transpose.test.ts`

**Interfaces:**
- Consumes: `inst`, `rangeState`, `keySignature`, `Doc`.
- Produces:

```ts
// fixture.ts
export function sampleDoc(instId?: InstId): Doc;   // from sample-song.json: d and cap ×6, ids 'e1'…, timeSig [4,4], originalTonicPc 2, major, tempo 100, shift = best shift
// transpose.ts
export interface Prefs { easyRegister: boolean; fewAccidentals: boolean }
export const DEFAULT_PREFS: Prefs;                 // both true
export interface ShiftScore { shift: number; score: number; bad: number; ext: number; upper: number; low: number; sig: number; min: number; max: number }
export function scoringPitches(score: Bar[]): number[];        // concert m of non-rest events that are not tied continuations
export function evalShift(pitches: number[], shift: number, i: Instrument, tonicPc: number, mode: Mode, prefs: Prefs): ShiftScore;
export function rankShifts(pitches: number[], i: Instrument, tonicPc: number, mode: Mode, prefs: Prefs): ShiftScore[];  // −24..+24, best first, ties → smaller |shift|
export function bestShiftForWrittenTonic(ranked: ShiftScore[], i: Instrument, originalTonicPc: number, writtenTonicPc: number): number;
export function bestShiftForConcertTonic(ranked: ShiftScore[], originalTonicPc: number, concertTonicPc: number): number;
export function reasonText(s: ShiftScore, i: Instrument): string;   // 'low register only' when upper === 0 && ext === 0 && bad === 0; otherwise e.g. '3 notes in the upper register', '2 extended', '8 unplayable'
```

Formula (§6.3): `score = bad*1000 + ext*60 + upper*3*E + low*3*E + |sig|*8*A + |shift|`, with `E = prefs.easyRegister ? 1 : 0`, `A = prefs.fewAccidentals ? 1 : 0`; `bad = w<lo || w>ext`, `ext = hi<w<=ext`, `upper = easyTop<w<=hi`, `low = kind==='sax' && w<62`; `sig` = signature of the written key. `min`/`max` are written pitches. With an empty pitch list every count is 0.

`sample-song.json` chords are spelled 3 semitones above the stored pitches (`chordSpellingOffset: -3`). Leave `doc.chords` empty in this task; Task 9 fills them.

- [ ] **Step 1: Write the failing tests** (values computed from the fixture with the formula)

```ts
const P = () => scoringPitches(sampleDoc().score);
const rank = (id: InstId) => rankShifts(P(), inst(id), 2, 'major', DEFAULT_PREFS);
it('fixture shape', () => { expect(P()).toHaveLength(41); expect(Math.min(...P())).toBe(57); expect(Math.max(...P())).toBe(69);
  expect(sampleDoc().score[0].cap).toBe(36); expect(sampleDoc().score[1].cap).toBe(48); });
it('check 1: Xaphoon C suggests C major, G4–G5', () => {
  const r = rank('xc');
  expect(r.slice(0,3).map(s => s.shift)).toEqual([10, 3, 5]);
  expect(r[0]).toMatchObject({ score: 10, bad: 0, ext: 0, upper: 0, min: 67, max: 79, sig: 0 });
  expect(reasonText(r[0], inst('xc'))).toBe('low register only');
});
it('check 1b: Xaphoon B♭', () => { expect(rank('xbb').slice(0,3).map(s => s.shift)).toEqual([8, 1, 3]); });
it('check 2: shift 0 on Xaphoon C has 8 notes below C4', () => {
  expect(evalShift(P(), 0, inst('xc'), 2, 'major', DEFAULT_PREFS).bad).toBe(8);
});
it('check 3: written and sounding keys', () => {
  const k = (id: InstId) => { const s = rank(id)[0].shift; return [mod12(2 + s + inst(id).off), mod12(2 + s)]; };
  expect(k('asax')).toEqual([7, 10]);   // reads G, sounds B♭
  expect(k('cl')).toEqual([0, 10]);     // reads C, sounds B♭
  expect(k('tsax')).toEqual([7, 5]);    // reads G, sounds F
  expect(k('fl')[0]).toBe(0); expect(k('ra')[0]).toBe(0);
});
it('check 4: alto sax, sounds in D → reads B', () => {
  const s = bestShiftForConcertTonic(rank('asax'), 2, 2);
  expect(mod12(2 + s)).toBe(2); expect(mod12(2 + s + 9)).toBe(11);
});
it('never fails on an unplayable song', () => {
  const wide = [40, 100]; const r = rankShifts(wide, inst('xc'), 0, 'major', DEFAULT_PREFS);
  expect(r).toHaveLength(49); expect(r[0].bad).toBeGreaterThan(0);
});
it('preferences switch weights off', () => {
  const r = rankShifts(P(), inst('xc'), 2, 'major', { easyRegister: true, fewAccidentals: false });
  expect(r[0].shift).toBe(3);   // smallest |shift| with everything playable and nothing above G5
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. If an asserted value disagrees, print the full ranking and compare with the formula before touching the test; the values for `xc`/`xbb` top three and their scores (10/11/13 and 8/9/11) were computed independently.
- [ ] **Step 5: Commit** `feat: transposition scoring with acceptance checks 1–4`.

---

### Fingering research procedure (used by Tasks 6 and 7)

1. Find a published fingering chart for the instrument. Preferred: the maker's or a method publisher's chart, and The Woodwind Fingering Guide (wfg.woodwind.org). Open it, read every note from `lo` to `ext`.
2. Enter one array of options per written MIDI pitch. Option = `{ "h": [...], "x": [...], "n": "name", "p": penalty }`. `h` follows `LAYOUT[kind]` order (index 0 is the offset key/hole: Xaphoon top hole then thumb at index 1; sax octave key; clarinet register key then thumb hole; flute thumb; recorder thumb); 1 = closed/pressed, 0 = open, 0.5 = half-hole. `x` lists pressed satellite key ids from `SATS[kind]`. First option = standard fingering, `p: 0`, `n: "standard"` unless the chart names it.
3. Alternates: only those a basic chart prints (sax B♭ bis / 1+1 / side; sax side C; sax forked F♯; clarinet left/right pinky for low E/F/F♯ and clarion B/C/C♯; clarinet throat B♭ variants only if the basic chart shows them; flute B♭ 1+1 / thumb; recorder none unless printed). No trill fingerings, no intonation fingerings. Penalties: 0.1–0.5, lower = more common.
4. Cross-check every note against a second, independent chart. Where the two disagree, keep the one both a maker/publisher and the WFG agree on; if still unclear, leave the pitch out and record it as a gap.
5. A key the chart needs that `SATS[kind]` lacks: add it to `SATS` with a position that follows §8.2 and to `FINGER`.
6. A pitch with no published fingering: no entry. Add `{ "inst" | "kind", "pitch", "note", "checked": [sources] }` to `src/data/fingering-gaps.json` and a line to `docs/fingering-gaps.md`.
7. Record in `meta[kind]`: `sources: [{ title, url, accessed: 'YYYY-MM-DD' }]` (two at least) and `reviewed: null`.
8. Never copy chart images or text into the repo; only the fingering facts.

---

### Task 6: Fingering data schema, Xaphoon table, lookup

**Files:**
- Modify: `src/data/fingerings.json` (new shape)
- Create: `src/data/fingering-gaps.json`, `docs/fingering-gaps.md`, `src/domain/fingerings.ts`, `src/domain/fingerings.test.ts`

**Interfaces:**
- Produces (JSON shape; `LAYOUT`, `SATS`, `SHAPE`, `LEGEND`, `FINGER` stay as they are; `status`, `rules`, `XA`, `REC`, `REC_GERMAN`, `SAX`, `CL`, `FL` are removed):

```json
{
  "tables":    { "xaph": { "60": [opt] }, "sax": {}, "cl": {}, "fl": {}, "rec": { "0": [opt] }, "recGerman": { "5": [opt] } },
  "overrides": { "tsax": { "91": [opt] } },
  "meta":      { "xaph": { "sources": [], "reviewed": null } }
}
```

`rec` and `recGerman` are keyed by `written − base` (soprano and alto share one table); every other table by written MIDI pitch. `recGerman` holds only the notes that differ. `overrides[instId]` replaces the kind table's entry for that pitch.

```ts
export interface FingeringOption { h: number[]; x: string[]; n: string; p: number }
export function optionsFor(id: InstId, written: number, recorderSystem: 'baroque'|'german'): FingeringOption[];  // [] when none
export function legend(id: InstId): string;       // LEGEND[kind] + ' · fingering data: draft' unless meta reviewed
export function hasSatellites(kind: Instrument['kind']): boolean;   // sax, cl, fl
export const LAYOUT, SATS, SHAPE, FINGER;         // typed re-exports
export function coverageGaps(): { inst: InstId; pitch: number }[];  // pitches lo..ext with no option
export function documentedGaps(): { inst: InstId; pitch: number }[]; // from fingering-gaps.json (a 'kind' entry expands to its instruments)
```

- [ ] **Step 1: Migrate the JSON.** Move the existing sax, clarinet, flute and recorder entries into `tables` unchanged (recorder arrays become `[{h, x: [], n: 'standard', p: 0}]`; `REC_GERMAN` likewise into `recGerman`). Do not materialise the old `rules`. Every pitch `lo..ext` that now lacks an entry goes into `fingering-gaps.json` with `"checked": []` and note `"not yet looked up"` — Task 7 empties this list.
- [ ] **Step 2: Transcribe the Xaphoon chart.** Source: https://cdn.shopify.com/s/files/1/0267/3777/0547/files/fingeringchart.pdf?v=1590460154 (2 pages, rotated 90°; position 1 = top hole, 2 = thumb, 3–9 = finger holes; `h` = positions 1..9). Render each page at ≥ 4× and read every dot. A first reading at 2.5× gave the values below; C4–F5 were clear, **F♯5–C6 must be re-read at high zoom** (F♯5 and G5 looked identical, which cannot be right):

| Note | MIDI | h (1..9) | | Note | MIDI | h (1..9) |
|---|---|---|---|---|---|---|
| C4 | 60 | 1 1 1 1 1 1 1 1 1 | | C5 | 72 | 1 1 0 0 0 0 0 0 1 |
| C♯4 | 61 | 1 1 1 1 1 1 1 1 ½ | | C♯5 | 73 | 1 0 1 1 1 0 0 0 1 |
| D4 | 62 | 1 1 1 1 1 1 1 1 0 | | D5 | 74 | 1 0 0 0 0 0 0 0 1 |
| E♭4 | 63 | 1 1 1 1 1 1 1 0 1 | | E♭5 | 75 | 0 1 1 1 1 0 0 0 0 |
| E4 | 64 | 1 1 1 1 1 1 1 0 0 | | E5 | 76 | 0 1 0 0 0 0 0 0 1 |
| F4 | 65 | 1 1 1 1 1 1 0 0 0 | | F5 | 77 | 0 0 0 0 0 0 0 0 1 |
| F♯4 | 66 | 1 1 1 1 1 0 1 1 1 | | F♯5 | 78 | re-read (marked * on the chart) |
| G4 | 67 | 1 1 1 1 1 0 0 0 1 | | G5 | 79 | re-read |
| G♯4 | 68 | 1 1 1 1 0 1 1 1 0 | | G♯5 | 80 | re-read (has a half-hole at 9) |
| A4 | 69 | 1 1 1 1 0 0 0 0 1 | | A5 | 81 | re-read |
| B♭4 | 70 | 1 1 1 0 0 0 0 0 1 | | B♭5 | 82 | re-read |
| B4 | 71 | 1 1 0 1 1 1 0 0 1 | | B5 | 83 | re-read |
| | | | | C6 | 84 | re-read |

Verify C4–C5 against `fingerscore-handoff/reference/The_Water_Is_Wide_songbook_page.pdf` where it shows the note. Write differences between the two sources into `docs/fingering-gaps.md` under "Xaphoon: source differences" and follow the official chart. Chart notes ("use slightly less lip pressure" on E♭4, the right little finger supporting the instrument above G) go into `n` in our own words. `meta.xaph.sources` = the official chart and the songbook page (title only, no URL).
- [ ] **Step 3: Write the failing tests**

```ts
it('xaphoon covers C4–C6 from the official chart', () => {
  for (let w = 60; w <= 84; w++) expect(optionsFor('xc', w, 'baroque').length, String(w)).toBeGreaterThan(0);
  expect(optionsFor('xc', 60, 'baroque')[0].h).toEqual([1,1,1,1,1,1,1,1,1]);
  expect(optionsFor('xc', 61, 'baroque')[0].h).toEqual([1,1,1,1,1,1,1,1,0.5]);
  expect(optionsFor('xc', 71, 'baroque')[0].h).toEqual([1,1,0,1,1,1,0,0,1]);
  expect(optionsFor('xc', 74, 'baroque')[0].h).toEqual([1,0,0,0,0,0,0,0,1]);
  expect(optionsFor('xbb', 74, 'baroque')).toEqual(optionsFor('xc', 74, 'baroque'));
});
it('option arrays match the layout', () => {
  for (const id of ORDER) for (let w = inst(id).lo; w <= inst(id).ext; w++)
    for (const o of optionsFor(id, w, 'baroque')) {
      expect(o.h).toHaveLength(LAYOUT[inst(id).kind].length);
      for (const k of o.x) expect(SATS[inst(id).kind as 'sax'][k], `${id} ${w} ${k}`).toBeDefined();
    }
});
it('every gap is documented', () => {
  const doc = new Set(documentedGaps().map(g => `${g.inst}:${g.pitch}`));
  expect(coverageGaps().filter(g => !doc.has(`${g.inst}:${g.pitch}`))).toEqual([]);
});
it('no documented gap has data', () => {
  for (const g of documentedGaps()) expect(optionsFor(g.inst, g.pitch, 'baroque'), `${g.inst}:${g.pitch}`).toEqual([]);
});
it('recorder systems', () => {
  expect(optionsFor('rs', 65, 'german')[0].h).not.toEqual(optionsFor('rs', 65, 'baroque')[0].h);   // F differs
  expect(optionsFor('ra', 70, 'german')[0].h).toEqual(optionsFor('rs', 65, 'german')[0].h);        // same index 5
});
it('override wins over the kind table', () => { /* inject via vi.mock of the JSON: overrides.tsax['91'] → returned for tsax, not for asax */ });
it('legend carries the draft suffix until reviewed', () => { expect(legend('xc')).toMatch(/ · fingering data: draft$/); });
```

- [ ] **Step 4: Run** → FAIL. **Step 5: Implement** `fingerings.ts`. **Step 6: Run** → PASS.
- [ ] **Step 7: Commit** `feat: fingering data schema, official Xaphoon table, lookup`.

---

### Task 7: Full fingering tables for sax, clarinet, flute and recorder

One task, four commits. Follow the **Fingering research procedure** above for each kind. A reviewer checks each kind's entries against its recorded sources.

**Files:**
- Modify: `src/data/fingerings.json`, `src/data/fingering-gaps.json`, `docs/fingering-gaps.md`, `src/domain/fingerings.test.ts`

**Interfaces:**
- Consumes: Task 6 shape and tests (they must stay green after every commit).
- Produces: complete `tables.sax` (58–96), `tables.cl` (52–96), `tables.fl` (60–96), `tables.rec` (index 0–26 → with `ext` up to index 31), `tables.recGerman`; `overrides` for `ssax`/`tsax`/`bsax` above written F6 (89) and for `picc`/`afl` where their charts differ from the C flute; `meta` for every kind and override set.

Scope per kind:

| Kind | Pitches | Named alternates to include | Notes |
|---|---|---|---|
| sax | 58–89 standard; 90–96 altissimo | B♭ (bis, 1+1, side), C (side C), F♯ (forked), high F (front F), high E/F palm vs front | `tables.sax` holds the alto altissimo; other saxes via `overrides`. High F♯ key (`hFs`) fingering is the standard for F♯6; add a no-F♯-key alternate if the chart prints one. |
| cl | 52–96 (Boehm) | pinky left/right pairs (E3/B4, F3/C5, F♯3/C♯5), F♯4 (two), B♭4 throat | Altissimo above C6 (84): one standard fingering per note from the chart. |
| fl | 60–96 | B♭ (1+1, thumb), F♯ (middle-finger alternate only if printed) | `picc` has no C4/C♯4 (lo = 62). `afl` ends at 93. |
| rec | index 0–31, baroque; German differences | none unless printed | Verify German F, F♯ and upper F; double holes: 0.5 = larger hole only. |

- [ ] **Step 1: Add the failing test** (it fails now because the gap list is long):

```ts
it('gap list is short and sourced', () => {
  const gaps = documentedGaps();
  for (const g of rawGaps()) expect(g.checked.length, `${g.inst ?? g.kind}:${g.pitch}`).toBeGreaterThanOrEqual(2);
  expect(gaps.filter(g => g.pitch <= inst(g.inst).hi)).toEqual([]);     // nothing missing inside the normal range
});
it('named alternates exist', () => {
  expect(optionsFor('asax', 70, 'baroque').map(o => o.x.join())).toEqual(expect.arrayContaining(['bis', 'sBb']));
  expect(optionsFor('asax', 72, 'baroque').length).toBeGreaterThanOrEqual(2);
  expect(optionsFor('cl', 52, 'baroque').map(o => o.x.join())).toEqual(expect.arrayContaining(['lpE', 'rpE']));
  expect(optionsFor('fl', 70, 'baroque').length).toBeGreaterThanOrEqual(2);
});
it('every kind records two sources', () => { for (const k of ['xaph','sax','cl','fl','rec']) expect(meta(k).sources.length).toBeGreaterThanOrEqual(2); });
```

Export `rawGaps()` and `meta(kind)` from `fingerings.ts`. If a normal-range pitch truly has no published fingering, stop and report it to the owner instead of weakening the second assertion.
- [ ] **Step 2: Sax.** Research, enter, cross-check, update gaps. Run `npx vitest run src/domain/fingerings.test.ts` (Task 6 tests pass). Commit `data: full saxophone fingering table with sources`.
- [ ] **Step 3: Clarinet.** Same. Commit `data: full clarinet fingering table with sources`.
- [ ] **Step 4: Flute, piccolo, alto flute.** Same. Commit `data: full flute fingering tables with sources`.
- [ ] **Step 5: Recorder baroque and German.** Same. Commit `data: full recorder fingering tables with sources`.
- [ ] **Step 6: Run** `npm test` → all PASS including Step 1's tests. Write the final summary at the top of `docs/fingering-gaps.md`: per kind, sources, number of notes, number of gaps, and "reviewed: no".

---

### Task 8: Fingering chooser

**Files:**
- Create: `src/domain/chooser.ts`, `src/domain/chooser.test.ts`

**Interfaces:**
- Consumes: `FingeringOption`, `FINGER`.
- Produces:

```ts
export interface ChooserNote { id: string; written: number; options: FingeringOption[] }   // options [] → breaks the run
export type ChooserItem = ChooserNote | null;                                              // null = rest → breaks the run
export function chooseFingerings(items: ChooserItem[], overrides: Record<string, number>): Record<string, number>;  // id → option index, for notes with options
export function transitionCost(a: FingeringOption, b: FingeringOption): number;
```

Costs (§8.4): `transitionCost` = number of differing `h` entries + size of the symmetric difference of `x` + 3 for every pair (ka in a.x, kb in b.x) with `ka !== kb` and `FINGER[ka] === FINGER[kb]`. Node cost = `option.p`, plus 2 when the option's `x` contains `'bis'` and the previous or next note in the run is a B natural (written pc 11). An override pins that note to the given index (ignored if out of range). Tied continuations are not passed in (the caller skips them). Ties in total cost → lower option index.

- [ ] **Step 1: Write the failing tests** with hand-made options (no dependency on real data):

```ts
const o = (h: number[], x: string[] = [], p = 0): FingeringOption => ({ h, x, n: '', p });
it('single option notes', () => { expect(chooseFingerings([{ id:'a', written:60, options:[o([1])] }], {})).toEqual({ a: 0 }); });
it('prefers the path with fewer finger changes', () => {
  const items = [{ id:'a', written:60, options:[o([1,1,0])] },
                 { id:'b', written:62, options:[o([0,0,1]), o([1,1,1], [], 0.4)] },
                 { id:'c', written:60, options:[o([1,1,0])] }];
  expect(chooseFingerings(items, {})).toEqual({ a:0, b:1, c:0 });
});
it('penalises same-finger slides', () => {
  expect(transitionCost(o([1],['tB']), o([1],['tBb']))).toBe(2 + 3);
  expect(transitionCost(o([1],['tB']), o([1],['rEb']))).toBe(2);
});
it('avoids bis next to B natural', () => {
  const bb = { id:'a', written:70, options:[o([0,1,0],['bis']), o([0,1,0],['sBb'], 0.4)] };
  const b  = { id:'b', written:71, options:[o([0,1,0])] };
  expect(chooseFingerings([bb, b], {}).a).toBe(1);
});
it('overrides are fixed points', () => {
  const n = (id: string) => ({ id, written:60, options:[o([1]), o([0], [], 0.1)] });
  expect(chooseFingerings([n('a'), n('b')], { a: 1 })).toEqual({ a:1, b:1 });
});
it('rests and notes without options break runs and never crash', () => {
  const r = chooseFingerings([null, { id:'a', written:10, options:[] }, { id:'b', written:60, options:[o([1])] }, null], {});
  expect(r).toEqual({ b: 0 });
  expect(chooseFingerings([], {})).toEqual({});
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (Viterbi per run). **Step 4: Run** → PASS. **Step 5: Commit** `feat: Viterbi fingering chooser`.

---

### Task 9: Chord symbols

**Files:**
- Create: `src/domain/chords.ts`, `src/domain/chords.test.ts`
- Modify: `src/domain/fixture.ts` (fill `doc.chords`)

**Interfaces:**
- Produces:

```ts
export function parseChord(text: string, tk: number): ChordSym;      // tk = (shift + off) mod 12 the text is spelled in; pc/bass stored relative to the original concert key: pc = spelledPc − tk
export function chordText(c: ChordSym, tk: number, sig: number): string;       // raw verbatim when tk === c.tk or !c.ok; otherwise root/bass re-spelled for sig (sharps when sig >= 0)
export interface ChordParts { root: string; quality: string; ext: string; bass: string | null }
export function chordParts(text: string): ChordParts;                // for display: quality ∈ m, min, -, °, dim, aug, +, ø stays normal size; the rest is 'ext' (raised); b/# inside ext → ♭/♯
export function prettyChord(text: string): string;                   // 'Bb' → 'B♭', 'F#m7b5/C#' → 'F♯m7♭5/C♯'
```

Regex (§9.5): `^([A-G])([#♯b♭]?)(.*?)(/([A-G])([#♯b♭]?))?$`, root case-insensitive. Invalid text → `{ raw, ok: false, pc: 0, rest: '', bass: null, tk }`.

- [ ] **Step 1: Write the failing tests**

```ts
it('check 7: pretty accidentals', () => { expect(prettyChord('Bb')).toBe('B♭'); expect(prettyChord('F#m7b5/C#')).toBe('F♯m7♭5/C♯'); });
it('parts for raised extensions', () => {
  expect(chordParts('F♯m7♭5/C♯')).toEqual({ root:'F♯', quality:'m', ext:'7♭5', bass:'C♯' });
  expect(chordParts('C7')).toEqual({ root:'C', quality:'', ext:'7', bass:null });
  expect(chordParts('B♭Δ7')).toEqual({ root:'B♭', quality:'', ext:'Δ7', bass:null });
});
it('transposes with the key', () => {
  const c = parseChord('Am', 3);                      // sample song: spelled 3 above the stored key
  expect(c).toMatchObject({ ok:true, pc:6, rest:'m', bass:null, tk:3 });
  expect(chordText(c, 3, -1)).toBe('Am');
  expect(chordText(c, 5, 1)).toBe('Bm');              // +2
  expect(chordText(parseChord('F', 3), 4, -6)).toBe('G♭');
});
it('invalid text is kept and not transposed', () => {
  const c = parseChord('N.C.', 0); expect(c.ok).toBe(false); expect(chordText(c, 5, 0)).toBe('N.C.');
});
it('fixture chords', () => { const d = sampleDoc('xc'); expect(Object.keys(d.chords).length).toBeGreaterThan(0);
  expect(d.chords[d.score[0].ev[0].id]).toMatchObject({ raw:'Am', tk:3 }); });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** `feat: chord parsing, transposition and display parts`.

---

### Task 10: Playback schedule and audio player

**Files:**
- Create: `src/domain/playback.ts`, `src/domain/playback.test.ts`, `src/audio/player.ts`

**Interfaces:**
- Produces:

```ts
export interface SchedNote { evId: string; start: number; dur: number; midi: number }    // ticks; midi = sounding (m + shift)
export interface Schedule { notes: SchedNote[]; totalTicks: number }
export function buildSchedule(doc: Doc): Schedule;
export function ticksToSeconds(ticks: number, tempo: number): number;                   // ticks * 60 / (tempo * 12)
// audio/player.ts
export interface Player { play(s: Schedule, doc: Doc, onEvent: (evId: string | null) => void): void; stop(): void; readonly playing: boolean }
export function createPlayer(): Player;
```

Schedule rules (§11): bar order follows repeats — play to the bar with `re`, jump back to the last bar with `rs` (or bar 0), on the second pass skip bars with `volta === '1'`. A chain of tied notes is one `SchedNote` with summed duration, `evId` of the first. A tie whose chain is cut by a jump (tie into a first ending, second pass) ends at the bar line; the next bar's first note is struck anew. Rests produce no note.

Player: Web Audio, look-ahead scheduling; per note oscillator → low-pass → gain; attack 25 ms, release 60 ms, peak gain 0.22. Timbre by `inst(doc.inst).group`: Saxophone sawtooth/2200 Hz, Xaphoon sawtooth/1500, Clarinet square/1500, Flute sine/4000, Recorder triangle/3000. `onEvent` fires with the current `evId` at note start and `null` at the end. Create the `AudioContext` lazily on first `play` (browser autoplay rules).

- [ ] **Step 1: Write the failing tests**

```ts
it('check 5: demo playback', () => {
  const s = buildSchedule(sampleDoc('xc'));
  expect(s.notes).toHaveLength(73);
  expect(s.totalTicks).toBe(262 * 6);
  expect(ticksToSeconds(s.totalTicks, 100)).toBeCloseTo(78.6, 1);
});
it('sounding pitch', () => { const d = sampleDoc('asax'); expect(buildSchedule(d).notes[0].midi).toBe(d.score[0].ev[0].m + d.shift); });
it('ties merge, rests are silent', () => { /* 1 bar: C(24, tie) C(12) rest(12) → one note dur 36 */ });
it('no repeats: plays straight through', () => { /* 2 plain bars → totalTicks = sum of caps */ });
it('repeat without voltas plays the section twice', () => { /* bars: [rs] A, B [re], C → A B A B C */ });
```

Write the last three with small hand-built `Doc`s (a helper `mkDoc(bars)` in the test file).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `playback.ts`, then `player.ts` (no unit test; exercised in e2e). **Step 4: Run** → PASS. **Step 5: Commit** `feat: playback schedule with repeats and Web Audio player`.

---

### Task 11: Glyphs and the fingering chart component

**Files:**
- Modify: `src/data/glyphs.json` (add `restSixteenth`, `digit2`, `digit3`, `digit4`, `digit6`, `digit8` and their placement notes)
- Create: `scripts/extract-glyphs.md`, `src/render/Glyph.tsx`, `src/render/FingeringChart.tsx`, `src/render/FingeringChart.test.tsx`

**Interfaces:**
- Produces:

```tsx
export type GlyphName = 'trebleClef'|'flat'|'sharp'|'natural'|'restWhole'|'restHalf'|'restQuarter'|'restEighth'|'restSixteenth'|'digit2'|'digit3'|'digit4'|'digit6'|'digit8';
export function Glyph(p: { name: GlyphName; x: number; y: number; fill?: string }): JSX.Element;   // <path> with the placement transform from glyphs.json; y = see below
export function FingeringChart(p: { kind: Instrument['kind']; option: FingeringOption; style: 'compact'|'full'; x: number; y: number; scale?: number }): JSX.Element;  // <g>, x = column centre, y = chart top
export function MissingChart(p: { type: 'bad'|'ext'|'alt'; x: number; y: number }): JSX.Element;   // dashed box: '!' red, 'ext' amber, 'alt' grey
```

`Glyph` y conventions: clef and rests take `y` = bottom staff line (B); accidentals take `y` = note y. Transforms are in `glyphs.json` `placement`.

- [ ] **Step 1: Extract glyphs.** Get GNU FreeSerif (`FreeSerif.otf`/`.ttf` from the GNU FreeFont release, GPL with font exception). Extract outline paths in font units (1000/em, y up) for U+1D13F (sixteenth rest) and the time-signature digits U+1D7D0-style bold digits if present, otherwise plain digits 2, 3, 4, 6, 8, with any font tool (`fonttools` pen → SVG path). Do not commit the font. Sixteenth rest uses the common rest transform. Digits: scale so one digit is 20px tall (two staff spaces); upper digit baseline on the middle line, lower digit baseline on the bottom line. Write the tool, commands and source URL into `scripts/extract-glyphs.md`. If the font lacks U+1D13F, compose the sixteenth rest from the eighth rest path plus a second hook shifted down-left by one staff space and say so in the md file.
- [ ] **Step 2: Write the failing tests** (render into an `<svg>` with Testing Library):

```tsx
const opt = (h: number[], x: string[] = []) => ({ h, x, n: '', p: 0 });
it('xaphoon: closed, open and half holes', () => {
  const { container } = render(<svg><FingeringChart kind="xaph" style="compact" x={0} y={0} option={opt([1,1,1,1,1,1,1,0,0.5])} /></svg>);
  expect(container.querySelectorAll('[data-hole]')).toHaveLength(9);
  expect(container.querySelectorAll('[data-hole="closed"]')).toHaveLength(7);
  expect(container.querySelectorAll('[data-hole="open"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-hole="half"]')).toHaveLength(1);
});
it('compact: a plain sax note draws no satellites', () => {
  const { container } = render(<svg><FingeringChart kind="sax" style="compact" x={0} y={0} option={opt([0,1,1,1,0,0,0])} /></svg>);
  expect(container.querySelectorAll('[data-sat]')).toHaveLength(0);
});
it('compact: only the cluster of a pressed key, neighbours ghosted', () => {
  const { container } = render(<svg><FingeringChart kind="sax" style="compact" x={0} y={0} option={opt([0,1,0,0,0,0,0], ['sBb'])} /></svg>);
  expect(container.querySelectorAll('[data-sat]')).toHaveLength(3);            // side cluster: sE, sC, sBb
  expect(container.querySelectorAll('[data-sat="pressed"]')).toHaveLength(1);
});
it('full key map: every satellite drawn', () => {
  const { container } = render(<svg><FingeringChart kind="sax" style="full" x={0} y={0} option={opt([0,1,0,0,0,0,0], ['bis'])} /></svg>);
  expect(container.querySelectorAll('[data-sat]')).toHaveLength(16);
});
it('recorder double holes', () => {
  const { container } = render(<svg><FingeringChart kind="rec" style="compact" x={0} y={0} option={opt([1,1,1,1,1,1,0.5,0])} /></svg>);
  expect(container.querySelectorAll('[data-double]')).toHaveLength(2);
});
```

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** from §8.1–8.3 and the drawing code in `prototype/SaxFingeringStudy.dc.html` / `ClarinetFingeringStudy.dc.html` / `EditorRecorder.dc.html`: holes at `LAYOUT[kind][i] = [dx, dyTop, size, double?]`; closed = ink fill, open = white fill + ink stroke, half = half-filled; compact satellites = 5px dots (pressed ink, cluster neighbours ring `#C3C7CE` 1px); full = shapes `SHAPE[cluster] = [w, h]` (pills for palm/side, squares for the table), ghost stroke, pressed ink fill. **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat: glyph component, new rest and digit glyphs, fingering chart`.

---

### Task 12: Sheet layout

**Files:**
- Create: `src/domain/derive.ts`, `src/domain/derive.test.ts`, `src/render/layout.ts`, `src/render/layout.test.ts`

**Interfaces:**
- Consumes: Tasks 2–9.
- Produces (`derive.ts`):

```ts
export interface DerivedEvent {
  id: string; bar: number; index: number; tick: number; d: number; rest: boolean; tiedFrom: boolean; tieTo: boolean;
  written: number; spelled: Spelled; pos: number; accidental: 'sharp'|'flat'|'natural'|null; state: RangeState;
  options: FingeringOption[]; chosen: number | null; auto: number | null; overridden: boolean;
  lyric: string; chord: string | null; chordOk: boolean;
}
export interface Derived {
  inst: Instrument; writtenTonicPc: number; concertTonicPc: number; sig: number;
  writtenKey: string; concertKey: string; originalKey: string;           // key names in the song's mode
  events: DerivedEvent[]; byId: Record<string, DerivedEvent>;
  ranked: ShiftScore[]; current: ShiftScore; best: ShiftScore; isSuggested: boolean;
  counts: { notes: number; bad: number; ext: number; withAlternates: number; overridden: number };
  min: number; max: number;                                              // written, over sounding notes; NaN-free: 0 when no notes
  headerKeys: string;                                                    // 'you read G major · sounds B♭ major' / 'C major' for non-transposing
  legend: string;
}
export function derive(doc: Doc, prefs: Prefs): Derived;
```

`chosen` = override if valid, else `auto`; both null without options. Tied continuations: `options: []`, `chosen: null`. `accidental` is null on tied continuations.

- Produces (`layout.ts`):

```ts
export const SHEET = { width: 940, pad: 40, systemWidth: 860, systemHeight: 290, staffTop: 75, staffBottom: 115, chordY: 2, lyricY: 22, voltaY: 46, chartY: 166, altButtonDy: 90, minPitch: 20, barPad: 16, barPadAfterRepeat: 26, barTail: 14 } as const;
export interface EvLayout { id: string; x: number; y: number }            // y = notehead centre; rests: staff middle
export interface BarLayout { bar: number; x: number; width: number; events: EvLayout[] }
export interface SystemLayout { index: number; y: number; headerWidth: number; showTimeSig: boolean; barNumber: number | null; bars: BarLayout[] }
export interface BeamGroup { ids: string[]; beams: 1 | 2 | 'mixed' }
export interface SheetLayout { systems: SystemLayout[]; height: number; beams: BeamGroup[] }
export function layoutSheet(doc: Doc, d: Derived): SheetLayout;
export function headerWidth(sig: number, first: boolean): number;         // clef + |sig| accidentals + time signature on the first system
```

Layout rules: staff y `= staffBottom − 5·pos` (§7.1). Note x `= barX + pad + tick·(width − pad − barTail)/cap`; a bar holding one whole-bar rest centres it. Bar need `= pad + barTail + (cap / minDurationInBar) · minPitch`. `avail = systemWidth − headerWidth`. Weight of a bar `= max(need, avail/4)`. Fill a system greedily with up to 4 bars while the sum of weights ≤ avail (a single bar always fits; if its need > avail it gets width avail). Widths `= weight · avail / sum(weights)`, except in the last system, where widths = weights when their sum < avail. Beam groups: cut the bar into windows of `beatTicks(timeSig)` starting at tick 0. Inside one window, a maximal run of adjacent non-rest events with duration 3, 6 or 9 forms a group when it has at least two events. An event outside any group keeps its flag(s). `beams`: 1 if all 6, 2 if all 3, `'mixed'` otherwise.

- [ ] **Step 1: Write the failing tests**

```ts
it('derive: alto sax header and counts', () => {
  const d = derive(sampleDoc('asax'), DEFAULT_PREFS);
  expect(d.headerKeys).toBe('you read G major · sounds B♭ major');
  expect(d.isSuggested).toBe(true); expect(d.counts).toMatchObject({ notes: 41, bad: 0 });
});
it('derive: unplayable notes have no chart', () => {
  const doc = { ...sampleDoc('xc'), shift: 0 }; const d = derive(doc, DEFAULT_PREFS);
  expect(d.counts.bad).toBe(8);
  expect(d.events.filter(e => e.state === 'bad').every(e => e.chosen === null)).toBe(true);
});
it('derive: minor songs are named minor', () => {
  const d = derive({ ...sampleDoc('fl'), originalTonicPc: 9, originalMode: 'minor', shift: 0 }, DEFAULT_PREFS);
  expect(d.writtenKey).toBe('A minor'); expect(d.sig).toBe(0);
});
it('plain 4/4 song: four equal bars per system as in the prototype', () => {
  const doc = sampleDoc('xc'); const L = layoutSheet(doc, derive(doc, DEFAULT_PREFS));
  expect(L.systems).toHaveLength(5);                                   // 17 bars
  expect(L.systems.slice(0,4).every(s => s.bars.length === 4)).toBe(true);
  const w = L.systems[1].bars.map(b => b.width); expect(Math.max(...w) - Math.min(...w)).toBeLessThan(0.01);
  expect(L.systems[0].showTimeSig).toBe(true); expect(L.systems[1].barNumber).toBe(4);      // pickup is bar 0 and unnumbered; system 2 starts at score index 4 = bar 4
  expect(L.systems[4].bars[0].width).toBeCloseTo(L.systems[3].bars[0].width, 0);            // last system is not stretched
});
it('sixteenths reduce bars per system', () => {
  const doc = mkDoc([sixteenthBar(), sixteenthBar(), sixteenthBar(), sixteenthBar()]);       // 16 × d=3 each
  const L = layoutSheet(doc, derive(doc, DEFAULT_PREFS));
  expect(L.systems[0].bars.length).toBe(2);
  const b = L.systems[0].bars[0]; expect(b.events[1].x - b.events[0].x).toBeGreaterThanOrEqual(20);
});
it('beams follow the meter', () => {
  const doc68 = mkDoc([bar68of(6,6,6,6,6,6)], [6,8]);
  expect(layoutSheet(doc68, derive(doc68, DEFAULT_PREFS)).beams.map(g => g.ids.length)).toEqual([3,3]);
  const doc44 = mkDoc([bar44of(6,6,3,3,6,12,12)]);
  expect(layoutSheet(doc44, derive(doc44, DEFAULT_PREFS)).beams.map(g => [g.ids.length, g.beams])).toEqual([[2,1],[3,'mixed']]);
});
```

Bar numbering: bars count from 1 at the first full bar; a pickup bar is bar 0 and unnumbered. The first system shows no number. Put `mkDoc` and the bar helpers in `src/test/helpers.ts`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `derive.ts`, then `layout.ts`. **Step 4: Run** → PASS. **Step 5: Commit** `feat: derived sheet model and layout with variable bars per system`.

---

### Task 13: Sheet renderer

**Files:**
- Create: `src/render/SystemView.tsx`, `src/render/Paper.tsx`, `src/render/Paper.module.css`, `src/render/Paper.test.tsx`

**Interfaces:**
- Consumes: `Derived`, `SheetLayout`, `Glyph`, `FingeringChart`, `MissingChart`, `chordParts`.
- Produces:

```tsx
export function Paper(p: {
  doc: Doc; derived: Derived; layout: SheetLayout;
  playingId: string | null;
  onTitle(title: string): void; onSubtitle(subtitle: string): void;
  renderUnderChart?(ev: DerivedEvent, x: number, y: number, systemIndex: number, lastSystem: boolean): React.ReactNode;   // slot for the alt-fingering pill (Task 20)
}): JSX.Element;
```

Root element: `<article class="paper" data-testid="paper">`, 940px wide. Each system is one `<svg data-testid="system">` of 860 × 290. Every event group is `<g data-ev={id} data-state="ok|ext|bad">`, with `data-playing="true"` on the playing one. Charts carry `data-chart`, missing-chart boxes `data-missing="bad|ext|alt"`, chord symbols `data-chord`.

- [ ] **Step 1: Write the failing tests**

```tsx
const setup = (id: InstId, patch: Partial<Doc> = {}) => { const doc = { ...sampleDoc(id), ...patch }; const derived = derive(doc, DEFAULT_PREFS);
  return render(<Paper doc={doc} derived={derived} layout={layoutSheet(doc, derived)} playingId={null} onTitle={() => {}} onSubtitle={() => {}} />); };
it('renders title, tempo, header keys, legend', () => {
  setup('asax');
  expect(screen.getByDisplayValue('The Water Is Wide')).toBeInTheDocument();
  expect(screen.getByText('♩ = 100')).toBeInTheDocument();
  expect(screen.getByText(/you read G major · sounds B♭ major/)).toBeInTheDocument();
  expect(screen.getByText(/fingering data: draft/)).toBeInTheDocument(); expect(screen.getByText('fingerscore.eu')).toBeInTheDocument();
});
it('one chart per sounding note that is not a tied continuation', () => {
  const { container } = setup('xc');
  expect(container.querySelectorAll('[data-testid="system"]')).toHaveLength(5);
  expect(container.querySelectorAll('[data-chart]')).toHaveLength(41);
});
it('check 2: unplayable notes are red with "!" boxes', () => {
  const { container } = setup('xc', { shift: 0 });
  expect(container.querySelectorAll('[data-state="bad"]')).toHaveLength(8);
  expect(container.querySelectorAll('[data-missing="bad"]')).toHaveLength(8);
});
it('show toggles hide bands', () => {
  const { container } = setup('xc', { show: { fingerings: false, chords: false, lyrics: false, raiseExtensions: true } });
  expect(container.querySelectorAll('[data-chart]')).toHaveLength(0);
  expect(screen.queryByText('wat-')).toBeNull();
});
it('lyrics and chords are drawn', () => { const { container } = setup('xc'); expect(screen.getByText('wat-')).toBeInTheDocument(); expect(container.querySelectorAll('[data-chord]').length).toBeGreaterThan(0); });
it('playing note is highlighted', () => { /* playingId = first id → [data-playing="true"] exists once */ });
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per §7 with `prototype/Editor.dc.html` as the reference for exact geometry: clef, key signature, time-signature digits (first system), bar number above later systems; barlines, repeat barlines with dots, final barline, volta brackets "1." / "2."; noteheads as ellipses rotated −22° (filled for d ≤ 18, open for 24/36/48, whole larger and stemless); stems up if pos < 4 (right side) else down (left), length 33px; flags for unbeamed 6 (one) and 3 (two); beams from `layout.beams` (direction by the group's average position; `'mixed'` = full first beam, second beam over the sixteenths, stub for a lone sixteenth); augmentation dots for 9/18/36 (shifted up on a line); ledger lines for pos ≤ −2 and pos ≥ 10; ties as arcs (below for stems up), split in two halves across systems; accidentals via `Glyph`; rests via `Glyph` (dotted rests get a dot; 36-tick rest in 3/4 or 6/8 as a full bar = whole rest centred); note colour red/amber by state; chords above (`chordParts`, extensions raised when `show.raiseExtensions`, invalid chords red with wavy underline); lyric line; charts at `chartY`; `renderUnderChart` at `chartY + altButtonDy`. Title/subtitle are `<input>`s styled as the printed heading (dashed outline on hover, teal on focus, placeholders "Add a title" / "Add a subtitle (composer, arranger…)"), calling `onTitle`/`onSubtitle`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Visual check.** Add a temporary route `/dev/sheet?inst=xc` rendering `Paper` for the fixture; open it with `npm run dev` and compare against `prototype/Editor.dc.html` markup and the songbook page for proportions. Fix what differs. Keep the route (dev only: `import.meta.env.DEV`).
- [ ] **Step 6: Commit** `feat: SVG sheet renderer`.

---

### Task 14: Store, session and preferences

**Files:**
- Create: `src/state/storage.ts`, `src/state/store.ts`, `src/state/store.test.ts`

**Interfaces:**
- Consumes: `Doc`, `Prefs`, `rankShifts`, `scoringPitches`; `ParsedSong` type (declare in `src/import/types.ts` now, see Task 15).
- Produces:

```ts
// storage.ts — never throws
export function readJSON<T>(area: 'local' | 'session', key: string): T | null;
export function writeJSON(area: 'local' | 'session', key: string, value: unknown): boolean;
export function remove(area: 'local' | 'session', key: string): void;
// keys: 'fingerscore.inst', 'fingerscore.prefs' (local); 'fingerscore.song', 'fingerscore.doc' (session)

// store.ts (zustand)
export interface AppState {
  instId: InstId; prefs: Prefs; song: ParsedSong | null; doc: Doc | null;
  setInstrument(id: InstId): void;      // persists; with a doc: sets doc.inst, re-picks best shift, clears doc.fingering
  setPrefs(p: Partial<Prefs>): void;    // persists; with a doc whose shift is the current best: re-picks best
  setSong(s: ParsedSong | null): void;
  setDoc(d: Doc | null): void;
  setShift(shift: number): void;        // clamps to −24..24, clears doc.fingering
  patchDoc(p: Partial<Pick<Doc, 'title'|'subtitle'|'tempo'|'chartStyle'|'recorderSystem'|'show'>>): void;
  setFingering(evId: string, index: number | null): void;   // null removes the override
  resetFingerings(): void;
}
export const useApp: UseBoundStore<StoreApi<AppState>>;
export function hydrate(): void;        // called once in main.tsx: instId and prefs from local, song and doc from session
```

Every change to `song`/`doc` is mirrored to sessionStorage (subscribe; skip silently when `writeJSON` returns false).

- [ ] **Step 1: Write the failing tests**

```ts
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); useApp.setState({ instId: 'asax', prefs: DEFAULT_PREFS, song: null, doc: null }); });
it('changing the instrument re-picks the shift and clears overrides', () => {
  useApp.getState().setDoc({ ...sampleDoc('asax'), fingering: { e3: 1 } });
  useApp.getState().setInstrument('cl');
  const d = useApp.getState().doc!; expect(d.inst).toBe('cl'); expect(d.fingering).toEqual({});
  expect(mod12(2 + d.shift + 2)).toBe(0);                 // clarinet reads C
  expect(readJSON('local', 'fingerscore.inst')).toBe('cl');
});
it('changing the shift clears overrides', () => { /* setDoc with fingering, setShift(1) → {} and shift 1; setShift(99) → 24 */ });
it('doc survives a reload through sessionStorage', () => {
  useApp.getState().setDoc(sampleDoc('xc')); useApp.setState({ doc: null }); hydrate();
  expect(useApp.getState().doc?.title).toBe('The Water Is Wide');
});
it('blocked storage does not break the app', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
  expect(() => { useApp.getState().setInstrument('fl'); useApp.getState().setDoc(sampleDoc('fl')); useApp.getState().setShift(2); }).not.toThrow();
  expect(useApp.getState().doc?.shift).toBe(2); spy.mockRestore();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked'); });
  expect(() => hydrate()).not.toThrow();
});
it('corrupt stored JSON is ignored', () => { sessionStorage.setItem('fingerscore.doc', '{oops'); expect(() => hydrate()).not.toThrow(); expect(useApp.getState().doc).toBeNull(); });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** `feat: app store with session mirror and safe storage`.

---

### Task 15: Import core — quantise, bars, key estimate, document builder

**Files:**
- Create: `src/import/types.ts`, `src/import/quantise.ts`, `src/import/bars.ts`, `src/import/keyfind.ts`, `src/import/buildDoc.ts`, `src/import/core.test.ts`

**Interfaces:**
- Produces:

```ts
// types.ts — positions and durations in quarter notes (float), measured from the start of the first bar
export interface RawNote { start: number; dur: number; midi: number }
export interface ParsedTrack {
  id: string; name: string; instrument: string; channel: number | null; percussion: boolean;
  notes: RawNote[]; lyrics: { at: number; text: string }[]; chords: { at: number; text: string }[];   // chords: MusicXML <harmony>, in the file's key
}
export interface ParsedSong {
  file: string; format: 'MIDI' | 'MusicXML'; timeSig: TimeSig; tempo: number;
  key: { tonicPc: number; mode: Mode } | null;
  pickup: number;                                   // quarter notes in the pickup bar, 0 = none
  marks: { bar: number; rs?: boolean; re?: boolean; volta?: '1' | '2' }[];    // bar index incl. pickup
  tracks: ParsedTrack[];
}
export class ImportError extends Error { constructor(public userMessage: string) }

// quantise.ts
export interface QNote { start: number; dur: number; midi: number }           // ticks, on the 3-tick grid, dur ≥ 3
export function quantise(notes: RawNote[]): { notes: QNote[]; simplified: boolean };   // simplified = any onset or duration moved by more than 0.02 quarter
export function monophonic(notes: QNote[], keep: 'top' | 'bottom'): QNote[];           // one note at a time: same-onset → keep top/bottom; an overlapping earlier note is cut at the next onset
// bars.ts
export function toBars(notes: QNote[], ts: TimeSig, pickupTicks: number, marks: ParsedSong['marks']): Bar[];
// keyfind.ts
export function estimateKey(notes: RawNote[]): { tonicPc: number; mode: Mode };       // Krumhansl–Schmuckler, duration-weighted
// buildDoc.ts
export interface BuildOptions { trackId: string; keep: 'top' | 'bottom'; lyricsFrom: string | null; chordsFrom: string | 'file' | null; instId: InstId; prefs: Prefs }
export function buildDoc(song: ParsedSong, o: BuildOptions): Doc;
```

`toBars`: split notes at bar lines and into allowed durations (`splitDuration`), tie the pieces; fill gaps with rests (`r: true`, `m` = last pitch, 60 before any note; rests split by `splitDuration`, a fully empty bar = one rest of `cap`); trailing empty bars are dropped; first bar `cap = pickupTicks` when > 0; `marks` set `rs`/`re`/`volta`; every event gets `newId()`.

`buildDoc`: quantise → monophonic → toBars; lyrics: each lyric at `at` goes to the note starting at that tick (nearest within 3 ticks), `l` on the event; chords: `chordsFrom === 'file'` uses the track's `chords`, a track id uses `detectChords` (Task 17; until then treat as none) — each chord lands on the event sounding at that tick, `doc.chords[id] = parseChord(text, 0)` and `ev.c = text`; key = `song.key ?? estimateKey(melody notes)`; `shift` = best shift for the instrument; `title` = file name without extension, underscores → spaces; `subtitle: ''`; `tempo` = rounded song tempo clamped to 40..200; `chartStyle: 'compact'`, `recorderSystem: 'baroque'`, all `show` flags true; `source = { file, format, track: name, trackCount, simplified }`. A track with no notes → `throw new ImportError('"{track}" has no notes.')`.

- [ ] **Step 1: Write the failing tests**

```ts
const n = (start: number, dur: number, midi = 60): RawNote => ({ start, dur, midi });
it('quantises to sixteenths and reports rounding', () => {
  expect(quantise([n(0, 1), n(1, 0.5)])).toEqual({ notes: [{ start:0, dur:12, midi:60 }, { start:12, dur:6, midi:60 }], simplified: false });
  const t = quantise([n(0, 1/3), n(1/3, 1/3), n(2/3, 1/3)]);                 // eighth triplet
  expect(t.simplified).toBe(true); expect(t.notes.every(q => q.start % 3 === 0 && q.dur % 3 === 0 && q.dur >= 3)).toBe(true);
});
it('monophonic: chords and overlaps', () => {
  expect(monophonic([{ start:0, dur:12, midi:60 }, { start:0, dur:12, midi:67 }], 'top')).toEqual([{ start:0, dur:12, midi:67 }]);
  expect(monophonic([{ start:0, dur:24, midi:60 }, { start:12, dur:12, midi:62 }], 'top')).toEqual([{ start:0, dur:12, midi:60 }, { start:12, dur:12, midi:62 }]);
});
const sums = (bars: Bar[]) => bars.every(b => b.ev.reduce((s, e) => s + e.d, 0) === b.cap && b.ev.every(e => DURATIONS.includes(e.d as 48)));
it('bars always sum to cap', () => {
  const bars = toBars([{ start:6, dur:60, midi:60 }, { start:75, dur:3, midi:62 }], [4,4], 0, []);
  expect(sums(bars)).toBe(true); expect(bars).toHaveLength(2);
  expect(bars[0].ev[0]).toMatchObject({ r: true, d: 6 });
  expect(bars[0].ev.at(-1)!.tie).toBe(true);                                   // tied over the bar line
});
it('pickup bar and 3/4', () => {
  const bars = toBars([{ start:0, dur:12, midi:60 }, { start:12, dur:36, midi:62 }], [3,4], 12, []);
  expect(bars.map(b => b.cap)).toEqual([12, 36]); expect(sums(bars)).toBe(true);
});
it('repeat marks land on bars', () => { /* marks [{bar:0, rs:true},{bar:1, re:true, volta:'1'}] → flags set */ });
it('estimates major and minor', () => {
  const scale = (pcs: number[]) => pcs.map((p, i) => n(i, i === 0 || i === pcs.length - 1 ? 2 : 1, 60 + p));
  expect(estimateKey(scale([0,2,4,5,7,9,11,12,7,4,0]))).toEqual({ tonicPc: 0, mode: 'major' });
  expect(estimateKey(scale([9,11,12,14,16,17,20,21,16,12,9]))).toEqual({ tonicPc: 9, mode: 'minor' });
});
it('buildDoc: overlapping polyphonic track still gives valid bars (review focus 2)', () => {
  const song = mkSong([ n(0, 2.5, 60), n(0, 1, 64), n(1, 1.7, 67), n(2.2, 0.4, 72) ]);
  const doc = buildDoc(song, opts()); expect(sums(doc.score)).toBe(true);
  const sounding = doc.score.flatMap(b => b.ev); expect(sounding.length).toBeGreaterThan(0);
});
it('buildDoc: lyrics, title, key, shift', () => {
  const song = mkSong([n(0,1,62), n(1,1,64), n(2,2,66)], { file: 'My_Song.mid', lyrics: [{ at:0, text:'Oh' }, { at:1, text:'love' }], key: { tonicPc:2, mode:'major' } });
  const doc = buildDoc(song, opts({ lyricsFrom: 't1' }));
  expect(doc.title).toBe('My Song'); expect(doc.score[0].ev.map(e => e.l)).toEqual(['Oh','love','']);
  expect(doc.originalTonicPc).toBe(2); expect(doc.source.simplified).toBe(false);
});
it('empty track is refused', () => { expect(() => buildDoc(mkSong([]), opts())).toThrow(ImportError); });
```

`mkSong`/`opts` are local test helpers (one track `t1`, 4/4, tempo 100, `instId: 'fl'`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS. **Step 5: Commit** `feat: import core — quantise, bars, key estimate, document builder`.

---

### Task 16: MIDI import and the demo song

**Files:**
- Create: `scripts/make-demo-midi.ts`, `public/demo/Auld_Lang_Syne.mid` (generated), `src/import/midi.ts`, `src/import/index.ts`, `src/import/midi.test.ts`
- Modify: `package.json` (script `"demo": "tsx scripts/make-demo-midi.ts"`)

**Interfaces:**
- Produces:

```ts
export function parseMidi(file: string, bytes: Uint8Array): ParsedSong;
export async function parseFile(file: File): Promise<ParsedSong>;          // index.ts: by extension .mid/.midi → parseMidi; .musicxml/.xml/.mxl → parseMusicXml (Task 17); else ImportError
export const ACCEPT = '.mid,.midi,.musicxml,.xml,.mxl';
```

`parseMidi`: notes, track names, programs (General MIDI instrument name), channels, tempo, time signature and key signature via `@tonejs/midi`; lyric meta events per track via `midi-file` `parseMidi` (type `lyrics`; fall back to `text` events when a track has no `lyrics` events and its text events align with note onsets). Channel 10 (index 9) → `percussion: true`. Defaults: tempo 120, time signature 4/4, `key: null`. Positions in quarter notes = ticks / ppq. Pickup: if the earliest note of any non-percussion track starts at `t0` with `0 < t0 < barLength` and `barLength − t0 ≤ barLength / 2`, set `pickup = barLength − t0` and subtract `t0` from every position. Errors (all `ImportError`, message shown to the user):
- parse failure → `"{file}" could not be read as a MIDI file.`
- unsupported or changing time signature → `{file} is in {n}/{d}. fingerscore reads 4/4, 3/4, 2/4 and 6/8 for now.` / `{file} changes its time signature. fingerscore reads one time signature per song for now.`
- no track with notes outside percussion → `"{file}" has no melody track.`
- other extension → `"{file}" is not a format fingerscore reads yet. Use MIDI or MusicXML.`

Demo script: writes a format-1 MIDI with `midi-file` `writeMidi`, 480 ppq, F major key signature event, 4/4, tempo 100, quarter-note pickup: the file starts with three quarters of silence in every track and the melody's first note sits on beat 4 of the first bar; the chord, bass and drum tracks start on the following downbeat. Track 1 "Melody" (program 73 flute, channel 1) with lyric events; track 2 "Chords" (program 0, channel 2): one block triad per half bar; track 3 "Bass" (program 32, channel 3): root on beats 1 and 3; track 4 "Drums" (channel 10): simple pattern. Melody (q = quarter, dq = dotted quarter, e = eighth, dh = dotted half):

```
pickup: C4 q
 1: F4 dq, F4 e, F4 q, A4 q      2: G4 dq, F4 e, G4 q, A4 q
 3: F4 dq, F4 e, A4 q, C5 q      4: D5 dh, D5 q
 5: C5 dq, A4 e, A4 q, F4 q      6: G4 dq, F4 e, G4 q, A4 q
 7: F4 dq, D4 e, D4 q, C4 q      8: F4 dh, D5 q
 9: C5 dq, A4 e, A4 q, F4 q     10: G4 dq, F4 e, G4 q, D5 q
11: C5 dq, A4 e, A4 q, C5 q     12: D5 dh, D5 q
13: C5 dq, A4 e, A4 q, F4 q     14: G4 dq, F4 e, G4 q, A4 q
15: F4 dq, D4 e, D4 q, C4 q     16: F4 dh
```

Harmony and bass are the builder's call (I–IV–V in F fits: F, C7, B♭). Lyrics: Burns, verse 1 and chorus ("Should auld acquaintance be forgot…"), one syllable per note, hyphen kept on a split syllable's first part; where the words run short, leave notes without a lyric event.

- [ ] **Step 1: Write the script and generate** `npm run demo` → file exists, < 5 kB. Commit the `.mid`.
- [ ] **Step 2: Write the failing tests** (read the file with `fs.readFileSync`):

```ts
const demo = () => parseMidi('Auld_Lang_Syne.mid', new Uint8Array(readFileSync('public/demo/Auld_Lang_Syne.mid')));
it('reads the demo', () => {
  const s = demo();
  expect(s).toMatchObject({ format: 'MIDI', timeSig: [4,4], tempo: 100, key: { tonicPc: 5, mode: 'major' }, pickup: 1 });
  expect(s.tracks.map(t => t.name)).toEqual(['Melody','Chords','Bass','Drums']);
  expect(s.tracks[3].percussion).toBe(true);
  expect(s.tracks[0].notes).toHaveLength(56);
  expect(s.tracks[0].lyrics[0]).toEqual({ at: 0, text: 'Should' });
});
it('demo becomes a 17-bar sheet', () => {
  const doc = buildDoc(demo(), { trackId: demo().tracks[0].id, keep: 'top', lyricsFrom: demo().tracks[0].id, chordsFrom: null, instId: 'asax', prefs: DEFAULT_PREFS });
  expect(doc.score).toHaveLength(17); expect(doc.score[0].cap).toBe(12); expect(doc.score[1].ev.map(e => e.d)).toEqual([18, 6, 12, 12]);
  expect(doc.title).toBe('Auld Lang Syne'); expect(doc.source.simplified).toBe(false);
});
it('garbage bytes give a readable error (review focus 1)', () => {
  expect(() => parseMidi('notes.mid', new TextEncoder().encode('hello'))).toThrowError(ImportError);
  try { parseMidi('notes.mid', new TextEncoder().encode('hello')); } catch (e) { expect((e as ImportError).userMessage).toBe('"notes.mid" could not be read as a MIDI file.'); }
});
it('bare MIDI without meta events gets defaults (review focus 3)', () => {
  const s = parseMidi('bare.mid', bareMidi());            // helper: writeMidi with one track, two notes, no tempo/time/key events
  expect(s).toMatchObject({ tempo: 120, timeSig: [4,4], key: null });
});
it('refuses 5/4', () => { /* writeMidi with timeSignature 5/4 → userMessage 'five.mid is in 5/4. fingerscore reads 4/4, 3/4, 2/4 and 6/8 for now.' */ });
it('refuses a drums-only file', () => { /* userMessage '"d.mid" has no melody track.' */ });
it('parseFile refuses other extensions', async () => { await expect(parseFile(new File(['x'], 'song.abc'))).rejects.toMatchObject({ userMessage: '"song.abc" is not a format fingerscore reads yet. Use MIDI or MusicXML.' }); });
```

The melody table has 56 notes (1 + 4·12 + 3·2 + 1).
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS. **Step 6: Commit** `feat: MIDI import and generated Auld Lang Syne demo`.

---

### Task 17: MusicXML import, melody detection, chord detection

**Files:**
- Create: `src/import/musicxml.ts`, `src/import/melody.ts`, `src/import/harmony.ts`, `src/import/musicxml.test.ts`, `src/import/detect.test.ts`, `src/import/fixtures/*.musicxml` (hand-written, small)
- Modify: `src/import/buildDoc.ts` (use `detectChords`), `src/import/index.ts`

**Interfaces:**
- Produces:

```ts
export async function parseMusicXml(file: string, bytes: Uint8Array): Promise<ParsedSong>;   // .mxl: unzip with jszip, read META-INF/container.xml → rootfile
export interface TrackInfo { id: string; score: number; recommended: boolean; tags: ('Lyrics'|'Single notes'|'Chords')[]; stats: { notes: number; min: number; max: number; maxSimultaneous: number } }
export function analyseTracks(song: ParsedSong): TrackInfo[];        // same order as song.tracks; exactly one recommended (highest score, never percussion), none if no usable track
export function usableTracks(song: ParsedSong): ParsedTrack[];       // non-percussion with ≥ 1 note
export function detectChords(notes: RawNote[], ts: TimeSig, pickup: number, totalQuarters: number): { at: number; text: string }[];
```

MusicXML: one `ParsedTrack` per part and voice (`id` = `P1:1`, name = part name, plus " · voice 2" for further voices); `<divisions>` → quarter notes; `<chord/>` notes share the onset; `<backup>`/`<forward>`; ties merge into one `RawNote`; first measure `implicit="yes"` or shorter than the time signature → `pickup`; `<key><fifths>` + `<mode>` → `key` (mode defaults to major; tonic from fifths and mode); `<sound tempo>` or `<metronome>` → tempo (default 120); first `<lyric>` (number 1) per note → `lyrics` (syllabic `begin`/`middle` append "-"); `<harmony>` root/kind/bass → `chords` text (kind → suffix: major "", minor "m", dominant "7", major-seventh "maj7", minor-seventh "m7", diminished "dim", augmented "aug", half-diminished "m7♭5", suspended-fourth "sus4", else the `text` attribute or ""); `<barline>` `<repeat direction>` and `<ending number type="start">` → `marks`; `<time-modification>` (tuplets) are read at their sounding length (quantise then reports `simplified`). Time-signature errors as in Task 16. Unreadable XML or zip → `"{file}" could not be read as a MusicXML file.`

Melody score (§5.2), per usable track: `monophonicRatio` (share of onsets with one note) × 3 + (has lyrics ? 2 : 0) + clamp((avgPitch − 55) / 12, 0, 2) + (share of notes in MIDI 55–84) × 2. Tags: "Lyrics" if lyrics; "Single notes" if maxSimultaneous = 1 else "Chords".

Chord detection (§5.2): per window (4/4: half bar = 2 quarters; 6/8: half bar = 1.5 quarters; 3/4 and 2/4: whole bar), collect sounding pitch classes weighted by duration; score every root × {major "", minor "m", dominant "7"} template as (weight inside template) − (weight outside) and take the best; emit only when the chord differs from the previous one; skip windows with fewer than 2 pitch classes.

- [ ] **Step 1: Write fixtures**: `simple.musicxml` (1 part, 4/4, C major, pickup, 4 bars with a tie over a bar line, lyrics with a split syllable, two `<harmony>`, forward and backward repeat with endings 1 and 2); `two-voices.musicxml` (1 part, 2 voices); `waltz-minor.musicxml` (3/4, `<fifths>0</fifths><mode>minor</mode>`, sixteenths and a dotted eighth); `seven-eight.musicxml` (7/8).
- [ ] **Step 2: Write the failing tests**

```ts
it('simple: tracks, pickup, key, lyrics, chords, repeats', async () => {
  const s = await load('simple.musicxml');
  expect(s).toMatchObject({ format: 'MusicXML', timeSig: [4,4], key: { tonicPc: 0, mode: 'major' }, pickup: 1 });
  expect(s.tracks).toHaveLength(1); expect(s.tracks[0].lyrics.map(l => l.text)).toContain('wat-');
  expect(s.tracks[0].chords.map(c => c.text)).toEqual(['C', 'G7']);
  expect(s.marks).toEqual(expect.arrayContaining([{ bar: 1, rs: true }, expect.objectContaining({ re: true, volta: '1' }), expect.objectContaining({ volta: '2' })]));
});
it('a tie over the bar line is one note', async () => { /* the tied pair appears as one RawNote with summed dur */ });
it('two voices → two tracks', async () => { expect((await load('two-voices.musicxml')).tracks.map(t => t.id)).toEqual(['P1:1','P1:2']); });
it('3/4 minor with sixteenths becomes a valid sheet', async () => {
  const s = await load('waltz-minor.musicxml'); expect(s.timeSig).toEqual([3,4]); expect(s.key).toEqual({ tonicPc: 9, mode: 'minor' });
  const doc = buildDoc(s, opts(s)); expect(doc.originalMode).toBe('minor'); expect(doc.score.every(b => b.ev.reduce((a, e) => a + e.d, 0) === b.cap)).toBe(true);
  expect(doc.score.flatMap(b => b.ev).some(e => e.d === 3)).toBe(true); expect(doc.source.simplified).toBe(false);
});
it('7/8 is refused', async () => { await expect(load('seven-eight.musicxml')).rejects.toMatchObject({ userMessage: 'seven-eight.musicxml is in 7/8. fingerscore reads 4/4, 3/4, 2/4 and 6/8 for now.' }); });
it('.mxl container', async () => { /* zip simple.musicxml with jszip in the test incl. META-INF/container.xml → same track count */ });
it('broken XML is refused', async () => { await expect(parseMusicXml('x.musicxml', new TextEncoder().encode('<score'))).rejects.toBeInstanceOf(ImportError); });
it('demo: melody recommended, drums not usable', () => {
  const s = demo(); const info = analyseTracks(s);
  expect(info.find(i => i.recommended)!.id).toBe(s.tracks[0].id);
  expect(info[0].tags).toEqual(['Lyrics', 'Single notes']); expect(info[1].tags).toContain('Chords');
  expect(usableTracks(s)).toHaveLength(3);
});
it('detects chords from the demo chord track', () => {
  const s = demo(); const c = detectChords(s.tracks[1].notes, s.timeSig, s.pickup, 65);
  expect(c[0].text).toBe('F'); expect(new Set(c.map(x => x.text)).size).toBeGreaterThanOrEqual(2);
  expect(c.every(x => /^[A-G][♯♭]?(m|7)?$/.test(x.text))).toBe(true);
});
it('buildDoc places detected chords', () => { /* chordsFrom = chord track id → Object.keys(doc.chords).length > 4; first chord raw 'F' */ });
```

- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS. **Step 6: Commit** `feat: MusicXML import, melody and chord detection`.

---

### Task 18: Start page

**Files:**
- Create: `src/ui/InstrumentPicker.tsx`, `src/ui/DropZone.tsx`, `src/pages/Start.module.css`, `src/pages/Start.test.tsx`
- Modify: `src/pages/Start.tsx`

**Interfaces:**
- Consumes: store, `parseFile`, `usableTracks`, `analyseTracks`, `buildDoc`, instruments helpers.
- Produces: `<InstrumentPicker value onChange />`, `<DropZone onSong(song) />`; a shared helper in `src/import/index.ts`:

```ts
export function defaultBuildOptions(song: ParsedSong, instId: InstId, prefs: Prefs): BuildOptions;   // recommended track, keep 'top', lyricsFrom = first track with lyrics (prefer the chosen one), chordsFrom = 'file' if the chosen track has chords, else first other usable track tagged 'Chords', else null
```

Behaviour (§4, design 5.4): order headline → picker → drop zone → key preferences → "Try a sample" → "How it works". Copy from §4.1–4.5 with the drop zone text "Drop a song here" · "or browse your computer · new songs become a sheet for your {instrument}" and chips "MIDI .mid" · "MusicXML .musicxml .mxl". Picker per §4.2 (5-column family segmented control with sublines, 4-column type grid, `radiogroup`/`radio`/`aria-checked`, live summary). Drop zone states: idle → parsing → success "✓ {file} — Ready — next you pick the part to play." [Continue →] [Choose another file] → error (`role="alert"`, the `userMessage`, [Try another file]). On success `setSong(song)`. Continue: with one usable track build the doc with `defaultBuildOptions`, `setDoc`, navigate `/sheet`; otherwise navigate `/tracks`. "Try a sample" (a `<button>` styled as a link) fetches `/demo/Auld_Lang_Syne.mid` and goes through the same path, straight to `/tracks`. Key preference checkboxes bound to `prefs`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('picker: family selects its default type and persists', async () => {
  renderStart(); await user.click(screen.getByRole('radio', { name: /Clarinet/ }));
  expect(useApp.getState().instId).toBe('cl'); expect(screen.getByText(/Clarinet in B♭ · E3 – E6/)).toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: /Saxophone/ })); expect(useApp.getState().instId).toBe('asax');
  expect(within(screen.getByRole('radiogroup', { name: /type/i })).getAllByRole('radio')).toHaveLength(4);
});
it('headline and drop zone copy', () => { renderStart();
  expect(screen.getByRole('heading', { level: 1, name: 'Sheet music with fingering charts for woodwinds' })).toBeInTheDocument();
  expect(screen.getByText('Drop a song here')).toBeInTheDocument(); expect(screen.queryByText(/Saved sheet/)).toBeNull(); });
it('a MIDI file leads to Continue', async () => {
  renderStart(); await user.upload(screen.getByLabelText(/drop a song/i), demoFile());
  expect(await screen.findByText(/Auld_Lang_Syne.mid — Ready/)).toBeInTheDocument(); expect(useApp.getState().song?.tracks).toHaveLength(4);
});
it('a wrong file shows the error by name', async () => {
  renderStart(); await user.upload(screen.getByLabelText(/drop a song/i), new File(['x'], 'tune.abc'));
  expect(await screen.findByRole('alert')).toHaveTextContent('"tune.abc" is not a format fingerscore reads yet.');
});
it('preferences are stored', async () => { renderStart(); await user.click(screen.getByLabelText(/few sharps or flats/)); expect(useApp.getState().prefs.fewAccidentals).toBe(false); });
```

(`user.upload` with `applyAccept: false` for the wrong-file test.)
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, layout and styling from `prototype/Main.dc.html` and `PickerOptions.dc.html` (option A). **Step 4: Run** → PASS; check the page in `npm run dev`. **Step 5: Commit** `feat: start page with instrument picker and drop zone`.

---

### Task 19: Tracks page

**Files:**
- Create: `src/ui/PageBar.tsx`, `src/ui/Steps.tsx`, `src/ui/PianoRoll.tsx`, `src/pages/Tracks.module.css`, `src/pages/Tracks.test.tsx`
- Modify: `src/pages/Tracks.tsx`, `src/audio/player.ts` (add `previewTrack(notes: RawNote[], tempo: number, seconds: number): void`)

**Interfaces:**
- Consumes: `song`, `analyseTracks`, `defaultBuildOptions`, `buildDoc`, `inst`, `rangeState`.
- Produces: `<PageBar left right />`, `<Steps current="track"|"sheet" />` (File ✓ — Track — Sheet).

Behaviour (§5.2, §2.2): no song → redirect `/`. Page bar: steps (Track current), right "Different file" (→ `/`). One row per track: radio, "n · Name", instrument + channel, tags (TrackInfo tags, plus "Below range" when more than half of the track's notes are below `lo` at shift 0 for the current instrument, plus "Can't be played" for percussion), stats (notes, range as note names, max simultaneous), `PianoRoll` (SVG mini roll with the instrument's sounding range band), play-preview button (8 seconds). Percussion rows disabled. Recommended track pre-selected with a "Recommended" badge. Side panel "Selected": polyphony choice "From chords, keep: Top note / Bottom note" only when the track is tagged "Chords" (the spec's "Voice 1" option is dropped: voices are separate rows); hint when notes sit far below the range ("will be moved up by octaves"). "Extras on the sheet": select "Chord symbols from" (None / "Chord symbols in the file" when the selected track has `chords` / each other usable track "detected from {name}") and "Lyrics from" (None / each track with lyrics). CTA "Make the sheet from {track} →" → `buildDoc`, `setDoc`, navigate `/sheet`; an `ImportError` shows as `role="alert"`.

- [ ] **Step 1: Write the failing tests**

```tsx
beforeEach(() => useApp.setState({ song: demo(), doc: null, instId: 'asax' }));
it('lists four tracks, recommends the melody, disables drums', () => {
  renderTracks(); const radios = screen.getAllByRole('radio', { name: /^\d · / });
  expect(radios).toHaveLength(4); expect(radios[0]).toBeChecked(); expect(radios[3]).toBeDisabled();
  expect(screen.getByText('Recommended')).toBeInTheDocument(); expect(screen.getByText("Can't be played")).toBeInTheDocument();
});
it('extras default to detected chords and melody lyrics', () => {
  renderTracks(); expect(screen.getByLabelText('Chord symbols from')).toHaveDisplayValue(/Chords/); expect(screen.getByLabelText('Lyrics from')).toHaveDisplayValue(/Melody/);
});
it('polyphony choice only for chord tracks', async () => {
  renderTracks(); expect(screen.queryByText(/From chords, keep/)).toBeNull();
  await user.click(screen.getAllByRole('radio', { name: /^\d · / })[1]); expect(screen.getByText(/From chords, keep/)).toBeInTheDocument();
});
it('CTA builds the sheet', async () => {
  renderTracks(); await user.click(screen.getByRole('button', { name: /Make the sheet from .*Melody/ }));
  const d = useApp.getState().doc!; expect(d.score).toHaveLength(17); expect(d.inst).toBe('asax'); expect(Object.keys(d.chords).length).toBeGreaterThan(0);
});
it('redirects without a song', () => { useApp.setState({ song: null }); renderTracks(); expect(currentPath()).toBe('/'); });
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, layout from `prototype/Tracks.dc.html`. **Step 4: Run** → PASS; check in the browser via "Try a sample". **Step 5: Commit** `feat: tracks page`.

---

### Task 20: Sheet page

**Files:**
- Create: `src/ui/KeyBridge.tsx`, `src/ui/RangeMeter.tsx`, `src/ui/Banners.tsx`, `src/ui/ShowToggles.tsx`, `src/ui/AltFingeringPopover.tsx`, `src/ui/Transport.tsx`, `src/pages/SheetPage.module.css`, `src/styles/print.css`, `src/pages/SheetPage.test.tsx`
- Modify: `src/pages/SheetPage.tsx`

**Interfaces:**
- Consumes: store, `derive`, `layoutSheet`, `Paper`, `buildSchedule`, `createPlayer`, key and instrument helpers.

Behaviour:
- No doc → redirect `/`. `derived = useMemo(derive(doc, prefs))`, `layout = useMemo(layoutSheet)`.
- **Page bar** (§2.2): steps (Sheet current); file chip `{file} · {format} · track {track} of {trackCount} · {N} notes · Change track` ("Change track" → `/tracks`, hidden when `song` is null or has one usable track); right: **Print** button (`window.print()`).
- **Sidebar cards** in order: *Detected in file* (original key name, time signature, tempo, and "Rhythm simplified: triplets and notes shorter than a sixteenth were rounded." when `source.simplified`); *Fingerings for* (instrument `<select>` grouped by family in family order → `setInstrument`; "Compact / Full key map" toggle for sax, clarinet, flute; "Baroque / German fingering" for recorder; alternates summary "{n} notes have alternate fingerings · {m} changed by you" + "Reset all to auto"); *Key & transposition* (`KeyBridge`); *Range check* (`RangeMeter`); *Show on sheet* (`ShowToggles`: Fingering charts · Chord symbols (transposed) · └ Raise extensions · Lyrics).
- **KeyBridge** (§6.2): transposing instruments get two linked selects "Sounds in · concert pitch" (help "What the band and audience hear. Set this to play along with others.") and "You read · written pitch" (help "{sigText} · this is the sheet below, with your fingerings"), 12 options each named in the song's mode, connector = `intervalText`; non-transposing get one "Key" select with `intervalText` as help. Changing a select → `setShift(bestShiftForConcertTonic / bestShiftForWrittenTonic)`. Fine-tune: − / + semitone, display "{+n} semitones from original" ("+1 oct +3" form when |shift| ≥ 12), "Octave down" / "Octave up" (disabled when the result leaves −24..24). "Keys that fit": top 3 of `ranked`, each a button "Sounds {concert} → you read {written} · {reasonText} · {min} – {max}" (non-transposing: "{written} · …"), current highlighted with `aria-pressed`; badge "Suggested" when `isSuggested`.
- **RangeMeter** (§6.4): bar from `lo − 7` to `ext + 4`, teal band `lo..hi`, amber band `hi+1..ext` (absent when `ext === hi`), song overlay coloured by worst state; labels lowest, highest, extended top (flat spelling); text "This song: {min} – {max} · all playable" / "· {n} extended" / "· {n} unplayable".
- **Banners** (§6.4): red `role="alert"` when `counts.bad > 0`: "{n} notes are below {lo} — out of range for the {instrument}" / "above {ext}" / "outside {lo} – {ext}" as applies, second line "Those notes are marked red and have no fingering chart.", button "Use {best written key} ({±shift})" unless current is best; amber `role="status"` when only `counts.ext > 0`: "{n} notes need extended high fingerings" + same button; teal when `isSuggested` and no problems: "Suggested key applied: sounds in {concert}, you read {written} ({±shift} from the original {originalKey}). Every note fits the {instrument}, {reasonText}." (non-transposing: "Suggested key applied: {written} (…)").
- **Transport** (§11): Play/Stop button (`aria-pressed`), tempo slider 40–200 labelled "♩ = {tempo}" → `patchDoc({ tempo })`. Playing highlights via `playingId`. Stop on unmount, on any doc change except title/subtitle, and on instrument/shift change.
- **Alternate fingerings** (§8.5): via `Paper`'s `renderUnderChart`, a pill button "⇅ {n}" under every chart whose event has ≥ 2 options (teal when overridden; `aria-expanded`). Clicking opens `AltFingeringPopover` below the chart (above in the last system): title "{note name} · bar {n} — pick a fingering", one button per option with a mini `FingeringChart`, its name, tag "auto" on the automatic choice, current outlined. Picking the auto option → `setFingering(id, null)`; another → `setFingering(id, index)`. Esc and outside click close; focus returns to the pill.
- **Print** (`print.css`, `@media print`): only the paper is visible; `@page { size: A4; margin: 12mm }`; each system `break-inside: avoid`; title inputs without border or outline; pills, popovers and highlights hidden; paper scaled to the page width.
- Narrow screens: sidebar wraps above the main column; the paper scrolls horizontally in its container (§15).

- [ ] **Step 1: Write the failing tests**

```tsx
const open = (id: InstId, patch: Partial<Doc> = {}) => { useApp.setState({ doc: { ...sampleDoc(id), ...patch }, instId: id, song: null, prefs: DEFAULT_PREFS }); return renderSheet(); };
it('suggested banner and badge', () => { open('asax');
  expect(screen.getByText(/Suggested key applied: sounds in B♭ major, you read G major/)).toBeInTheDocument(); expect(screen.getByText('Suggested')).toBeInTheDocument(); });
it('check 2: red banner at shift 0 on Xaphoon C, fix button applies the best key', async () => {
  open('xc', { shift: 0 }); const alert = screen.getByRole('alert'); expect(alert).toHaveTextContent('8 notes are below C4 — out of range for the xaphoon');
  await user.click(within(alert).getByRole('button', { name: /Use C major \(\+10\)/ })); expect(useApp.getState().doc!.shift).toBe(10); expect(screen.queryByRole('alert')).toBeNull();
});
it('check 4: key bridge, sounds in D → reads B', async () => {
  open('asax'); await user.selectOptions(screen.getByLabelText(/Sounds in/), 'D major');
  expect(screen.getByLabelText(/You read/)).toHaveDisplayValue('B major');
});
it('non-transposing instruments get one Key select', () => { open('fl'); expect(screen.getByLabelText('Key')).toBeInTheDocument(); expect(screen.queryByLabelText(/Sounds in/)).toBeNull(); });
it('fine-tune and octave buttons', async () => { open('fl'); const s = useApp.getState().doc!.shift;
  await user.click(screen.getByRole('button', { name: /semitone up|\+/ })); expect(useApp.getState().doc!.shift).toBe(s + 1); });
it('changing the instrument re-suggests', async () => { open('asax'); await user.selectOptions(screen.getByLabelText(/Fingerings for/), 'cl');
  expect(screen.getByText(/you read C major · sounds B♭ major/)).toBeInTheDocument(); });
it('chart style toggle only where satellites exist', () => { open('asax'); expect(screen.getByRole('button', { name: 'Full key map' })).toBeInTheDocument();
  cleanup(); open('xc'); expect(screen.queryByRole('button', { name: 'Full key map' })).toBeNull(); cleanup(); open('rs'); expect(screen.getByRole('button', { name: 'German fingering' })).toBeInTheDocument(); });
it('alternate fingering: pick, summary, reset', async () => {
  open('asax'); const pills = screen.getAllByRole('button', { name: /⇅/ }); await user.click(pills[0]);
  const dialog = screen.getByRole('dialog'); expect(dialog).toHaveTextContent(/pick a fingering/); expect(within(dialog).getByText('auto')).toBeInTheDocument();
  const options = within(dialog).getAllByRole('button'); await user.click(options.find(b => !/auto/.test(b.textContent!))!);
  expect(Object.keys(useApp.getState().doc!.fingering)).toHaveLength(1); expect(screen.getByText(/1 changed by you/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Reset all to auto' })); expect(useApp.getState().doc!.fingering).toEqual({});
});
it('show toggles and title editing', async () => { open('xc'); await user.click(screen.getByLabelText('Lyrics')); expect(useApp.getState().doc!.show.lyrics).toBe(false);
  await user.clear(screen.getByDisplayValue('The Water Is Wide')); await user.type(screen.getByPlaceholderText('Add a title'), 'Waly'); expect(useApp.getState().doc!.title).toBe('Waly'); });
it('simplified notice', () => { open('fl', { source: { file:'a.mid', format:'MIDI', track:'1', trackCount:1, simplified:true } }); expect(screen.getByText(/Rhythm simplified/)).toBeInTheDocument(); });
it('range text', () => { open('xc'); expect(screen.getByText('This song: G4 – G5 · all playable')).toBeInTheDocument(); });
it('redirects without a doc', () => { useApp.setState({ doc: null }); renderSheet(); expect(currentPath()).toBe('/'); });
```

The alternates test depends on the sax data from Task 7 (the fixture on alto sax in G major contains written B4 and C5; C5 has the side-C alternate). If no note in the fixture has two options, assert on a hand-built doc containing written B♭4 instead.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, layout from `prototype/Editor.dc.html` and variants (omit the mode switch, bulk card, undo/redo, Save, File). **Step 4: Run** → PASS.
- [ ] **Step 5: Manual check** in `npm run dev`: sample → tracks → sheet; play and stop; print preview shows only the paper, systems unbroken across pages; narrow window wraps.
- [ ] **Step 6: Commit** `feat: sheet page — key bridge, range check, banners, alternates, playback, print`.

---

### Task 21: End-to-end test and finish

**Files:**
- Create: `e2e/core-path.spec.ts`
- Modify: `README.md`, `.gitignore` (Playwright output), `src/App.tsx` (remove nothing; confirm the dev route is DEV-only)

- [ ] **Step 1: Write the e2e test**

```ts
test('core path: sample → track → sheet → instruments → alternate → playback', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/'); await page.getByRole('button', { name: /Try a sample/ }).click();
  await expect(page).toHaveURL(/\/tracks$/); await expect(page.getByText('Recommended')).toBeVisible();
  await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(page).toHaveURL(/\/sheet$/); await expect(page.getByTestId('system').first()).toBeVisible();
  await expect(page.getByDisplayValue('Auld Lang Syne')).toBeVisible();
  for (const id of ['cl', 'xc', 'rs']) { await page.getByLabel(/Fingerings for/).selectOption(id); await expect(page.locator('[data-chart]').first()).toBeVisible(); await expect(page.getByRole('alert')).toHaveCount(0); }
  await page.getByLabel(/Fingerings for/).selectOption('asax');
  await page.getByRole('button', { name: /⇅/ }).first().click(); await page.getByRole('dialog').getByRole('button').nth(1).click();
  await expect(page.getByText(/changed by you/)).toBeVisible();
  await page.getByRole('button', { name: 'Play' }).click(); await expect(page.locator('[data-playing="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Stop' }).click(); await expect(page.locator('[data-playing="true"]')).toHaveCount(0);
  await page.reload(); await expect(page.getByDisplayValue('Auld Lang Syne')).toBeVisible();          // session survives reload
  expect(errors).toEqual([]);
});
test('no third-party requests', async ({ page }) => {
  const foreign: string[] = []; page.on('request', r => { if (!r.url().startsWith('http://localhost:5173') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) foreign.push(r.url()); });
  await page.goto('/'); await page.getByRole('button', { name: /Try a sample/ }).click(); expect(foreign).toEqual([]);
});
```

- [ ] **Step 2: Run** `npm run test:e2e` → fix what fails in the app, not in the test, unless the test names a control differently from Tasks 18–20.
- [ ] **Step 3: Run** `npm test && npm run build` → all PASS, build succeeds.
- [ ] **Step 4: README**: what version 1 does and does not do (from the design, sections 2 and 7), how to run it, the fingering data status table (per kind: sources, reviewed no) and the note that public hosting waits for the Imprint in version 2.
- [ ] **Step 5: Commit** `test: end-to-end core path; docs: README for version 1`.

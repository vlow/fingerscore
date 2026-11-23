# MuseScore and ABC import, parsers on demand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** fingerscore opens MuseScore 2, 3 and 4 files and ABC tunes, names modal keys, reads cut time, and loads each parser only when a file of its format is opened.

**Architecture:** Every importer returns the existing `ParsedSong` (`src/import/types.ts`); everything after parsing (quantising, bars, melody detection, sheet building) stays as it is. `parseFile` picks a format by extension and loads its parser with a dynamic `import()`. MuseScore has one entry and two readers: one for format versions 3 and 4 (voices as `<voice>` elements), one for version 2 (voices by `<track>` and `<tick>`). ABC uses the `abcjs` parser; the importer computes pitches itself.

**Tech Stack:** TypeScript 7 strict (no `Array.prototype.at`), Vite 8, Vitest (globals, jsdom), Playwright, `jszip` (present), `abcjs` (new, MIT).

**Spec:** `docs/superpowers/specs/2026-11-23-fingerscore-v2-import-formats-design.md`. Section 4.8 of the spec lists, per sample file, the exact XML forms each MuseScore version uses; read it before any MuseScore task.

## Global Constraints

- No network request with file content; no new dependency except `abcjs`.
- No parser module and none of `@tonejs/midi`, `midi-file`, `jszip`, `abcjs` is imported statically from the entry. `npm run build` must report the entry chunk (`dist/assets/index-*.js`) at 400.00 kB or less.
- User-facing failures are `ImportError(userMessage)`; exact strings are in the tasks. A non-`ImportError` thrown inside a parser is reported as `"{file}" could not be read as a {MuseScore|ABC} file.`
- `samples/` and `fingerscore-handoff/reference/` are git-ignored and are never committed, copied into fixtures, or quoted beyond a few elements. Committed fixtures are hand-written strings inside the test files.
- Time: positions and durations in `ParsedSong` are quarter notes (float) from the start of the first bar; `pickup` is the pickup bar's length in quarters, 0 for none.
- `ParsedTrack.chords` are text in concert pitch, in the form `musicxml.ts` `chordText` produces (root from `ROOT_NAMES` by pitch class).
- No backward compatibility: stored formats change in place, no migration.
- Tests run with `npm test`; a task is done only when `npm test` and `npx tsc --noEmit -p .` pass.
- Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. A version 3 or 4 `.mscx` holds the parts' excerpt scores as further `<Score>` elements nested in the main one. Reading every `<Staff>` in the document would list each part twice. Expected: only the main score's staves become tracks. (Test in Task 4.)
2. A measure whose content does not add up to its length (an incomplete voice 2, a corrupt file). Expected: every measure starts at the grid position given by the measure lengths, never at the running sum of a voice's durations, so one short voice cannot shift the rest of the song. (Test in Task 4 and Task 6.)
3. A `.mscz` whose `.mscx` is very large when unpacked, or a zip without any `.mscx`. Expected: refuse with the "could not be read as a MuseScore file" message; an unpacked score above 50 MB is refused without being parsed. (Test in Task 4.)
4. An ABC file with a byte-order mark, Windows line endings, Latin-1 bytes, or text before the first `X:`. Expected: it opens like the clean file. (Test in Task 7.)
5. The parser chunk fails to download. Expected: the drop zone shows the load message, and choosing the file again retries. (Test in Task 3.)

---

### Task 1: Cut time and one shared meter check

**Files:**
- Modify: `src/domain/types.ts` (`TimeSig`), `src/domain/time.ts`, `src/import/midi.ts`, `src/import/musicxml.ts`
- Create: `src/import/meter.ts`
- Test: `src/domain/time.test.ts`, `src/import/meter.test.ts`, `src/import/musicxml.test.ts`, `src/render/layout.test.ts`, `src/domain/edit.test.ts`, `src/domain/persistence.test.ts`

**Interfaces:**
- Produces: `TimeSig` gains `[2,2]`. `isSupportedTimeSig(2, 2) === true`. `beatTicks([2,2]) === 24`. `barCap([2,2]) === 48`.
- Produces: `songTimeSig(file: string, sigs: readonly (readonly [number, number])[]): TimeSig` in `src/import/meter.ts`: the first signature (4/4 when the list is empty); throws `ImportError`.

- [ ] **Step 1: Failing tests.** `time.test.ts`: the three values above. `meter.test.ts`: `songTimeSig('a.mid', [])` → `[4,4]`; `[[2,2]]` → `[2,2]`; `[[5,4]]` throws with `a.mid is in 5/4. fingerscore reads 4/4, 3/4, 2/4, 6/8 and 2/2 for now.`; `[[4,4],[3,4]]` throws with `a.mid changes its time signature. fingerscore reads one time signature per song for now.` `musicxml.test.ts`: a part with `<time symbol="cut"><beats>2</beats><beat-type>2</beat-type></time>` and four quarter notes gives `timeSig` `[2,2]` and one bar. `layout.test.ts`: in a 2/2 bar of eight eighths the beam groups are two groups of four ids. `src/render/Paper.test.tsx` (or the existing test that checks the drawn time signature): a 2/2 document draws the digits 2 over 2. `edit.test.ts`: in a 2/2 document `setLength` to a whole note (48) on the first event of a bar is allowed and "+ Bar after" inserts a bar with `cap` 48. `persistence.test.ts`: a document with `timeSig` `[2,2]` validates.
- [ ] **Step 2:** Run `npm test`; the new tests fail.
- [ ] **Step 3:** Implement. `midi.ts` and `musicxml.ts` call `songTimeSig` and lose their own two strings. Existing tests that assert the old "4/4, 3/4, 2/4 and 6/8" wording change to the new wording. Fix every place TypeScript now reports for the wider `TimeSig`.
- [ ] **Step 4:** `npm test` and `npx tsc --noEmit -p .` pass.
- [ ] **Step 5:** Commit `feat: cut time (2/2) as a fifth meter; one shared meter check`.

### Task 2: Seven modes

**Files:**
- Modify: `src/domain/types.ts` (`Mode`), `src/domain/keys.ts`, `src/domain/persistence.ts` (the `originalMode` check), `src/import/musicxml.ts` (`writtenKey`), `src/import/types.ts` if needed
- Test: `src/domain/keys.test.ts`, `src/domain/persistence.test.ts`, `src/import/musicxml.test.ts`, `src/domain/derive.test.ts`

**Interfaces:**
- Produces: `type Mode = 'major' | 'minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian'`; `export const MODES: Mode[]` (that order) in `keys.ts`.
- Produces: `keySignature(tonicPc, mode)` for all seven: the signature of the major key whose tonic lies below the mode's tonic by 0 (major), 2 (dorian), 4 (phrygian), 5 (lydian), 7 (mixolydian), 9 (minor), 11 (locrian) semitones.
- Produces: `tonicName(tonicPc, mode)`: the existing tables for major and minor; for the five others the name `spell(tonicPc, keySignature(tonicPc, mode))` gives, without the octave.
- Produces: `keyName(tonicPc, mode)`: `"C major"`, `"A minor"` as today; the others capitalised: `"D Dorian"`, `"E Phrygian"`, `"F Lydian"`, `"G Mixolydian"`, `"B Locrian"`.

- [ ] **Step 1: Failing tests.** `keys.test.ts`: `keySignature(2,'dorian') === 0`, `keySignature(7,'mixolydian') === 0`, `keySignature(9,'dorian') === 1`, `keySignature(3,'dorian') === -5`, `keySignature(6,'dorian') === 4`; `keyName(2,'dorian') === 'D Dorian'`, `keyName(3,'dorian') === 'E♭ Dorian'`, `keyName(6,'dorian') === 'F♯ Dorian'`, `keyName(7,'mixolydian') === 'G Mixolydian'`; for every mode and every pitch class `keySignature` is within −6..6. `persistence.test.ts`: `originalMode: 'dorian'` validates, `'ionian'` does not. `musicxml.test.ts`: `<key><fifths>0</fifths><mode>dorian</mode></key>` in a non-transposing part gives `key` `{ tonicPc: 2, mode: 'dorian' }`; the same in a part with `<transpose><chromatic>-2</chromatic>` gives `tonicPc` 0; `<mode>ionian</mode>` reads as major, `<mode>aeolian</mode>` as minor; an unknown mode text still gives `mode: null`. `derive.test.ts`: a document with `originalTonicPc` 2, `originalMode` `'dorian'`, shift 2 on a non-transposing instrument has `writtenKey` `'E Dorian'` and key signature 2.
- [ ] **Step 2:** Run; fail.
- [ ] **Step 3:** Implement. In `writtenKey` the tonic is `fifths * 7` plus the mode's offset from the list above. `scales.ts` keeps using only major and minor. Fix what TypeScript reports for the wider `Mode` (for example `keyfind.ts` `fit`, which keeps handling major and minor only and is only ever called with those).
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit -p .` pass.
- [ ] **Step 5:** Commit `feat: name all seven modes; read the mode from MusicXML`.

### Task 3: Parsers on demand, format table, size limit

**Files:**
- Modify: `src/import/index.ts`, `src/import/types.ts` (`ParsedSong.format`), `src/domain/types.ts` (`Doc.source.format`), `src/domain/persistence.ts` (`formats`), `src/pages/SheetPage.tsx` (`IMPORTED`), `src/ui/LoadBoundary.tsx`
- Create: `src/loadFailed.ts` (the `LOAD_FAILED` string, re-exported by `LoadBoundary.tsx`), `scripts/check-bundle.mjs`
- Modify: `package.json` (script `check:bundle`)
- Test: `src/import/index.test.ts`, `src/ui/DropZone.test.tsx`, `src/domain/persistence.test.ts`

**Interfaces:**
- Produces: `ParsedSong['format']` and `Doc['source']['format']` gain `'MuseScore'` and `'ABC'` (the latter keeps `'sample' | 'file' | 'library'`).
- Produces in `index.ts`: `type Parser = (file: string, bytes: Uint8Array) => Promise<ParsedSong>` and a table `FORMATS: { name: 'MIDI' | 'MusicXML' | 'MuseScore' | 'ABC'; extensions: string[]; article: 'a' | 'an'; load: () => Promise<Parser> }[]`. This task fills MIDI (`.mid`, `.midi`) and MusicXML (`.musicxml`, `.xml`, `.mxl`); Tasks 4 and 7 add one entry each. `ACCEPT` is built from the table plus `.json`.
- Produces: `parseFile(file: File): Promise<ParsedSong>` with these rules, in order: extension not in the table → `"{file}" is not a format fingerscore reads. Use MIDI, MusicXML, MuseScore or ABC.`; `file.size > 20 * 1024 * 1024` → `"{file}" is larger than 20 MB and can't be opened.`; reading the bytes fails → `"{file}" could not be read as {article} {name} file.`; `load()` rejects → `ImportError(LOAD_FAILED)`; the parser throws an `ImportError` → rethrown; anything else it throws → `"{file}" could not be read as {article} {name} file.`
- Produces: `npm run check:bundle` exits 1 with a message when no `dist/assets/index-*.js` exists or the largest one exceeds 400 000 bytes, else prints its size.

- [ ] **Step 1: Failing tests.** `index.test.ts`: each message above (mock a format's `load` to reject for the load case; a 21 MB `File` for the size case, made with `new File([new Uint8Array(21 * 1024 * 1024)], 'big.mid')`); a `.mid` file still parses. `DropZone.test.tsx`: when `parseFile` rejects with `ImportError(LOAD_FAILED)` the zone shows that text and [Try another file]. `persistence.test.ts`: a document with `source.format` `'MuseScore'` and one with `'ABC'` validate and keep the value.
- [ ] **Step 2:** Run; fail.
- [ ] **Step 3:** Implement. `index.ts` has no static import of `./midi` or `./musicxml`; `buildOptionsFor`, `defaultBuildOptions` and `ACCEPT` stay static exports. `IMPORTED` in `SheetPage.tsx` gains both names.
- [ ] **Step 4:** `npm test`; `npm run build && npm run check:bundle`. Expected: the entry chunk is at or below 400.00 kB and the build lists separate chunks holding the MIDI and MusicXML parsers. If the entry is above the limit, find what still pulls a library into it (`npx vite build --debug` or a search for static imports of `src/import/midi`, `src/import/musicxml`, `jszip`, `@tonejs/midi`) and remove that import; do not raise the limit.
- [ ] **Step 5:** `npm run test:e2e` passes (the sample song and the MIDI path now load a chunk first).
- [ ] **Step 6:** Commit `feat: load each parser on demand; format table, 20 MB limit, bundle check`.

### Task 4: MuseScore versions 3 and 4 — notes, time, key, parts

**Files:**
- Create: `src/import/mscz.ts` (entry), `src/import/mscz/common.ts`, `src/import/mscz/v3.ts`
- Modify: `src/import/index.ts` (table entry: name `MuseScore`, extensions `.mscz`, `.mscx`, article `a`)
- Test: `src/import/mscz.test.ts`

**Interfaces:**
- Produces: `parseMuseScore(file: string, bytes: Uint8Array): Promise<ParsedSong>` in `mscz.ts`: unzips when the bytes start with `PK` (the score is the first entry whose name ends in `.mscx` and has no `/`; none → unreadable; unpacked size above 50 MB → unreadable), parses XML, requires the root `museScore`, reads its `version` as a number, and dispatches: below 2 → `"{file}" was saved with a MuseScore version fingerscore does not read. Open it in a current MuseScore and save it again, or export MusicXML.`; 2.x → `readV2` (Task 6; until then the same refusal text); 3 and above → `readV3`.
- Produces in `common.ts`: `durationQuarters(type: string, dots: number): number | null` (`whole` 4, `half` 2, `quarter` 1, `eighth` 0.5, `16th` 0.25, `32nd` 0.125, `64th` 0.0625; one dot ×1.5, two ×1.75; `measure` is handled by the caller); `pcOfTpc(tpc: number): number` = `mod12((tpc - 14) * 7)`; `majorTonicOfFifths(fifths: number): number` = `mod12(fifths * 7)`; `interface ScoreReader { (file: string, score: Element, version: number): ParsedSong }`.
- Produces in `v3.ts`: `readV3: ScoreReader`.

Behaviour of `readV3` (forms in spec 4.8):
- The main score is the `<Score>` child of the root; staves are its direct `<Staff id="n">` children that contain `<Measure>`; parts are its direct `<Part>` children, each listing its staff ids. Nested `<Score>` elements (excerpts) are ignored.
- Measure lengths: `len="a/b"` on the `<Measure>` (as a fraction of a whole note) or else the meter. The grid of measure starts comes from the first staff. `pickup` = the first measure's length when it is shorter than the meter, else 0.
- Meter: every `<TimeSig>` `sigN`/`sigD` of the first staff, through `songTimeSig`.
- Per staff and `<voice>` (index 1..4): walk the children in order. `<Chord>` and `<Rest>` advance the position by their duration; `durationType` `measure` = the measure's length. A `<Tuplet>` element opens a ratio `normalNotes/actualNotes` that multiplies durations until `<endTuplet/>`. A `<Chord>` with a child whose name starts with `grace`, or `acciaccatura` or `appoggiatura`, is skipped without advancing. `<location><fractions>` gaps inside a voice advance the position by that fraction of a whole note. Every measure starts at its grid position.
- Notes: each `<Note>` of a chord gives a `RawNote` with `midi` = `<pitch>`. A note that carries a tie start (`<Spanner type="Tie">` with `<next>`) is merged with the following note of the same pitch in the same voice into one longer note.
- Tracks: one per staff and voice with notes. Name: the part's `<trackName>`; with more than one staff in the part add ` · staff {s}` (1-based within the part); with more than one voice with notes on the staff add ` · voice {n}`. `id` = `"{staffId}:{voice}"`. `instrument` = the part's instrument `<longName>` or `<trackName>`. `percussion` = the part's instrument has `<useDrumset>1</useDrumset>` or the staff has `<StaffType group="percussion">`. `channel` = 10 for percussion, else null.
- Key: from the first staff of the first non-percussion part, the `<KeySig>` in the first measure; none there = 0 fifths. Version 4 (`version >= 4`): `<concertKey>` is the concert signature. Version 3: `<accidental>` is the written signature, shifted by the part's `<transposeChromatic>` (concert tonic = `majorTonicOfFifths(accidental) + transposeChromatic`), unless the score's `<Style>` has `<concertPitch>1</concertPitch>`, then it is concert already. Result `{ tonicPc, mode: null }`.
- Tempo: the first `<Tempo><tempo>` × 60, rounded; default 120.
- No melody track → `"{file}" has no melody track.`
- `lyrics`, `chords` and `marks` stay empty in this task.

- [ ] **Step 1: Failing tests** with hand-written `.mscx` strings (helper `mscx(version, body)` in the test file) and one zip made with `jszip` in the test:
  - version gate: `1.14` refuses with the text above; a root other than `museScore` and a zip without `.mscx` give `"x.mscz" could not be read as a MuseScore file.`;
  - one staff, 4/4, quarter C5 (`pitch` 72), eighth rest, eighth D5, half E5 → notes `[{start:0,dur:1,midi:72},{start:1.5,dur:0.5,midi:74},{start:2,dur:2,midi:76}]`, `timeSig` `[4,4]`, `pickup` 0, `tempo` 120;
  - `<Tempo><tempo>1.33333</tempo>` → tempo 80;
  - first measure `len="1/4"` → `pickup` 1 and the second measure's first note at start 1;
  - a triplet of eighths between `<Tuplet>` (2/3, `baseNote` eighth) and `<endTuplet/>` → starts 0, 1/3, 2/3 with dur 1/3 (compare with `toBeCloseTo`);
  - a grace chord (`<grace16/>`) before a quarter does not move it;
  - two tied quarters of the same pitch → one note of dur 2; across a bar line too;
  - a staff with two `<voice>` elements → two tracks, the second named `… · voice 2`; a piano part with two staves → names with ` · staff 1` and ` · staff 2`;
  - Review Focus 1: a nested excerpt `<Score>` with its own `<Staff>` does not add tracks;
  - Review Focus 2: voice 2 of measure 1 holds only one quarter; a note at the start of measure 2 in voice 2 still starts at 4;
  - key, version 3: `<accidental>4</accidental>` on a part with `transposeChromatic` −2 → `tonicPc` 2; the same with `<concertPitch>1</concertPitch>` in `<Style>` and `<accidental>2</accidental>` → 2; no `<KeySig>` on a part with `transposeChromatic` −9 → 3; a later `<KeySig>` in measure 5 does not change the key;
  - key, version 4: `<concertKey>-3</concertKey><actualKey>0</actualKey>` → `tonicPc` 3;
  - percussion: a part with `<useDrumset>1</useDrumset>` listed first → its track has `percussion: true`, and the key comes from the next part; a score with only that part throws `has no melody track`;
  - Review Focus 3: a `PK` file whose `.mscx` entry reports an unpacked size above 50 MB is refused (stub the size check's input rather than building a 50 MB file);
  - `parseFile(new File([bytes], 'a.mscx'))` returns `format` `'MuseScore'`.
- [ ] **Step 2:** Run `npx vitest run src/import/mscz.test.ts`; fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit -p .` pass.
- [ ] **Step 5:** If `samples/` exists, run the reader over `samples/fur-elise-easy-ver4.mscz`, `samples/canon-in-d-major-for-saxophone-quartet4.mscz` and `samples/caprice-24-niccolo-paganini-paganini-caprice-24 musescore 3.mscz` in a scratch script and note in the report: track names, meter, key, the first five notes of the first track. Expected for the quartet: four tracks (Soprano, Alto, Tenor, Baritone Saxophone), 4/4, `tonicPc` 2, first note `midi` 74 at start 0.5.
- [ ] **Step 6:** Commit `feat: MuseScore 3 and 4 import — notes, time, key, parts`.

### Task 5: MuseScore versions 3 and 4 — lyrics, chord symbols, repeats, endings

**Files:**
- Modify: `src/import/mscz/v3.ts`, `src/import/mscz/common.ts`
- Test: `src/import/mscz.test.ts`

**Interfaces:**
- Consumes: `readV3`, `pcOfTpc` (Task 4).
- Produces in `common.ts`: `harmonyText(rootTpc: number, name: string | null, bassTpc: number | null): string`: root and bass from `ROOT_NAMES` (the table of `musicxml.ts`, moved to a shared module both import) by `pcOfTpc`; kind text mapped at its start: `mi` → `m`, `ma` → `maj`, `o` → `°`, `0` → `ø`, everything else unchanged; bass appended as `/X`. Examples: `(15, 'mi', null)` → `Gm`; `(14, null, 16)` → `C/D`; `(14, 'o7', null)` → `C°7`; `(13, '7', 17)` → `F7/A`.
- Produces in `common.ts`: `lyricText(text: string, syllabic: string | null): string`: `begin` and `middle` get a trailing `-`, as `musicxml.ts` `lyricOf` does.

Behaviour:
- Lyrics: `<Lyrics>` children of a `<Chord>` without `<no>` or with `<no>0</no>` (verse 1) → `{ at: chord start, text }` on that voice's track.
- Chord symbols: a `<Harmony>` in a voice applies at the position of the next chord or rest of that voice. Fields: `<root>`, `<name>`, and the bass in `<base>` (version 3) or `<bass>` (version 4), either directly inside `<Harmony>` or inside its `<harmonyInfo>`. `<extension>` is ignored. A `<Harmony>` without `<root>` is skipped. The symbols of a part's first staff go to every track of that part, as `musicxml.ts` gives a part's chords to all its voices.
- Repeats: `<startRepeat/>` → `rs`, `<endRepeat>` → `re` on that measure's index (first staff only).
- Endings: `<Spanner type="Volta">` with a `<Volta>` child and `<next>`: `<endings>` 1 or 2 → `volta` `'1'` / `'2'` on the measure where it starts and on the following `measures − 1` measures; other numbers and lists are ignored.

- [ ] **Step 1: Failing tests:** the four `harmonyText` examples; a version 4 `<Harmony><harmonyInfo><name>m</name><root>15</root></harmonyInfo></Harmony>` before the third chord → `chords` `[{ at: 2, text: 'Gm' }]`; a version 3 `<Harmony><root>14</root><base>16</base><extension>1</extension></Harmony>` → `C/D`; lyrics with `syllabic` begin/end → `['won-', 'der']`; verse 2 (`<no>1</no>`) is not imported; a first-verse text `1 The` is kept as written; a four-measure score with `<startRepeat/>` in measure 1, a volta 1 over measure 3 with `<endRepeat>2</endRepeat>`, a volta 2 over measure 4 → `marks` `[{bar:0,rs:true},{bar:2,re:true,volta:'1'},{bar:3,volta:'2'}]`; with a pickup measure the bar indices count the pickup as bar 0.
- [ ] **Step 2:** Run; fail. **Step 3:** Implement. **Step 4:** `npm test`, `npx tsc --noEmit -p .` pass.
- [ ] **Step 5:** If `samples/` exists: `the-entertainer-scott-joplin4.mscz` and `…3.mscz` each give 164 chord symbols per chord-carrying track and marks with four `rs`, four `re`, four volta-1 runs and four volta-2 runs; `the-love-of-god-is-greater-far4.mscz` gives lyrics on the melody track starting `1 The`, and chord texts that include `Gm` and `C/D`. Report the numbers.
- [ ] **Step 6:** Commit `feat: MuseScore 3 and 4 import — lyrics, chord symbols, repeats, endings`.

### Task 6: MuseScore version 2

**Files:**
- Create: `src/import/mscz/v2.ts`
- Modify: `src/import/mscz.ts` (dispatch 2.x to `readV2`)
- Test: `src/import/mscz.test.ts`

**Interfaces:**
- Consumes: `ScoreReader`, `durationQuarters`, `pcOfTpc`, `majorTonicOfFifths`, `harmonyText`, `lyricText` (Tasks 4, 5).
- Produces: `readV2: ScoreReader`, returning the same `ParsedSong` a version 3 file of the same music gives.

Differences from `readV3` (forms in spec 4.8); everything not listed is the same rule:
- No `<voice>` wrapper. A measure's children are read in order; an element belongs to voice `track % 4` where `track` is its `<track>` child (absent = the staff's first voice). A `<tick>` element sets the position to that absolute tick; convert with the score's `<Division>` (ticks per quarter, 480 when absent) relative to the measure's start tick. Each voice otherwise continues where its last element ended.
- Tuplets: `<Tuplet id="n">` declares the ratio once; a chord or rest with a `<Tuplet>n</Tuplet>` child uses it.
- Grace notes: a `<Chord>` with `<acciaccatura/>`, `<appoggiatura/>` or a child whose name starts with `grace`.
- Ties: a `<Note>` with a `<Tie>` child starts a tie to the next note of the same pitch in that voice.
- Endings: `<Volta id="n">` with `<endings>` in the measure where it starts; it covers measures up to, not including, the measure that holds `<endSpanner id="n"/>`. A volta whose end is never found covers its start measure only.
- Key: `<accidental>` is the written signature unless `<concertPitch>1</concertPitch>` is in `<Style>`.
- Chord symbols: `<root>`, `<name>`, `<base>` directly inside `<Harmony>`.

- [ ] **Step 1: Failing tests** (version `2.06` fixtures): the note, pickup, tie, percussion and key cases of Task 4 in version 2 form; a second voice written as `<tick>` rewind plus `<track>1</track>` chords → two tracks; Review Focus 2 for version 2 (a voice that ends early does not shift the next measure); a triplet by id; an `<acciaccatura/>` chord is skipped; lyrics verse 1 only; `Gm` and `C/D`; the four-measure repeat-and-endings case with `<Volta id>` / `<endSpanner id>` → the same `marks` as in Task 5; one cross-check test that builds the same four-bar tune in version 2 and version 3 form and expects equal `tracks`, `marks`, `key`, `pickup`, `timeSig`.
- [ ] **Step 2:** Run; fail. **Step 3:** Implement. **Step 4:** `npm test`, `npx tsc --noEmit -p .` pass.
- [ ] **Step 5:** If `samples/` exists: the version 2 quartet gives the same notes, key and track names as its version 4 copy; `the-entertainer-scott-joplin2.mscz` gives the same `marks` and chord texts as the version 3 copy. Report any difference with the file, bar and element; do not paper over it.
- [ ] **Step 6:** Commit `feat: MuseScore 2 import`.

### Task 7: ABC

**Files:**
- Create: `src/import/abc.ts`
- Modify: `src/import/index.ts` (table entry: name `ABC`, extension `.abc`, article `an`), `package.json` (`abcjs`)
- Test: `src/import/abc.test.ts`

**Interfaces:**
- Produces: `parseAbc(file: string, bytes: Uint8Array): Promise<ParsedSong>`.

- [ ] **Step 1: Confirm the library.** `npm install abcjs`. Read its documentation and source for the parse-only entry and write down in the report: the import path that brings the parser (and whether a smaller one than the package root exists), and where the parse result holds, per voice: notes with their letter/octave or diatonic pitch and explicit accidental, durations, rests, chords in brackets, ties, tuplets, bar types and ending numbers, lyrics per note, chord symbols and annotations, the key (root, accidental, mode), meter, unit length, tempo, voice names and clef/octave modifiers. Run a three-line test that parses `X:1\nK:C\nCDEF|` under vitest (jsdom) to prove the parser runs there. If the parser cannot run under jsdom or does not expose bar types or lyrics, stop and report BLOCKED with what is missing.
- [ ] **Step 2: Failing tests** (inline tune strings):
  - `X:1\nM:4/4\nL:1/4\nK:C\nCDEF|G2A2|` → one track "Melody", notes C4 D4 E4 F4 (60, 62, 64, 65) at 0..3, G4 at 4 dur 2, A4 at 6 dur 2; `key` `{tonicPc:0, mode:'major'}`; `format` `'ABC'`;
  - octave marks: `c` = 72, `c'` = 84, `C,` = 48;
  - key signature: `K:Bb` with `B e` → 70, 75; an explicit `=E` → 64 and a following `E` in the same bar → 64, in the next bar → 63;
  - `K:Ador` → `{tonicPc:9, mode:'dorian'}`; `K:Dmix` → `{2,'mixolydian'}`; `K:Em` → `{4,'minor'}`; `K:Cmaj` → `{0,'major'}`; `K:HP` and `K:D exp ^f` throw `"t.abc" could not be read as an ABC file.`;
  - lengths: `L:1/8` with `A2 B/2 c3/2 d>e` → durations 1, 0.25, 0.75, 0.75, 0.25; missing `L:` with `M:2/4` → unit 1/16, with `M:4/4` → unit 1/8;
  - `(3abc` → three notes of 1/3 quarter each with `L:1/8`;
  - `M:C` → `[4,4]`; `M:C|` → `[2,2]`; `M:5/4` throws the shared meter text; an inline `[M:3/4]` after the first bar throws the "changes its time signature" text;
  - `Q:1/4=140` → 140; `Q:3/8=80` → 120; none → 120;
  - pickup: `M:4/4 L:1/4`, `F/2|B2c2|` → `pickup` 0.5;
  - ties: `c2-|c2` → one note of dur 4 quarters with `L:1/4`;
  - chords `[CEG]2` → three notes at the same start;
  - rests `z2`, `x`, and `Z` (a full bar) advance time;
  - voices: `V:1 name="Tune"` and `V:2 clef=bass octave=-1` → two tracks named `Tune` and `2`; the second sounds an octave lower; a `clef=treble-8` voice sounds an octave lower;
  - lyrics: the tune line `E3 | G2 c | d3 |` with `w:Qual gran-de va-ga_` → texts `Qual`, `gran-`, `de`, `va-` on the first four notes and nothing more; `*` skips a note; `~` gives a space; `W:` lines are ignored;
  - chord symbols: `"C"E3 | "Dm/F"d3 | "^slowly"A3` → `[{at:0,text:'C'},{at:3,text:'Dm/F'}]`;
  - repeats and endings: `|: C4 |1 D4 :|2 E4 |]` with `M:4/4`, `L:1/4` → `marks` `[{bar:0,rs:true},{bar:1,re:true,volta:'1'},{bar:2,volta:'2'}]`; `::` sets `re` on the bar before and `rs` on the bar after;
  - an inline `[K:G]` changes the pitches after it (`F` → 66) and leaves `key` at the first key;
  - only the first tune of a file with `X:1 … X:2 …` is read;
  - Review Focus 4: the first test's tune with a UTF-8 byte-order mark, with `\r\n` line endings, with `%` directive lines before `X:`, and as Latin-1 bytes holding `T:Música` all give the same notes;
  - a file without any note throws `"t.abc" has no melody track.`
- [ ] **Step 3:** Run `npx vitest run src/import/abc.test.ts`; fail.
- [ ] **Step 4:** Implement on the parse result confirmed in Step 1. Decode with `TextDecoder('utf-8', { fatal: true })`, falling back to `latin1`. Tempo, pitches, lyric alignment and bar marks are computed by the importer; where `abcjs` already delivers a value in the needed form (for example lyrics attached per note), use it and keep the test.
- [ ] **Step 5:** `npm test`, `npx tsc --noEmit -p .`, then `npm run build && npm run check:bundle`: the entry stays at or below 400.00 kB and `abcjs` sits in its own chunk. Put that chunk's size in the report.
- [ ] **Step 6:** If `samples/` exists: `040-amor-de-cristo.abc` gives 3/4, tempo 140, C major, one track, lyrics starting `1. Qual`, chord texts starting `C`, `Dm/F`, `Dm`, `G`; `b034-the-bonny-greyeyed-morn.abc` gives 4/4, B♭ major, `pickup` 0.5, first notes F4 (65) then B♭4 (70). Report what was found.
- [ ] **Step 7:** Commit `feat: ABC import`.

### Task 8: Start page texts, sample test, end-to-end tests, README

**Files:**
- Modify: `src/ui/DropZone.tsx` (+ its CSS module if the chips need it), `src/pages/Start.tsx` (subline), `README.md`
- Create: `src/import/samples.test.ts`, `e2e/import-formats.spec.ts`, `e2e/fixtures/tune.abc`, `e2e/fixtures/tune.mscx` (both hand-written, short, original)
- Test: `src/ui/DropZone.test.tsx`, `src/pages/Start.test.tsx`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Failing tests.** `DropZone.test.tsx`: the chips read, in order, `MIDI .mid`, `MusicXML .musicxml .mxl`, `MuseScore .mscz`, `ABC .abc`, `Saved sheet .json`; the file input's `accept` contains `.mscz`, `.mscx` and `.abc`. `Start.test.tsx`: the subline is `Upload a MIDI, MusicXML, MuseScore or ABC file. We transpose it to a key that suits your instrument and add a fingering chart under every note.`
- [ ] **Step 2:** Implement; `npm test` passes.
- [ ] **Step 3: `samples.test.ts`.** The whole file is skipped (`describe.skipIf`) when `samples/` does not exist. It parses every `.mscz`, `.mscx` and `.abc` in the folder through `parseFile` and asserts:
  - `the-entertainer-scott-joplin.mscz` (version 1) throws the version refusal; every other file parses with at least one non-percussion track and a supported meter;
  - same music, different version or state → equal results. For each group, `tracks` (names, notes, lyrics, chords), `marks`, `key`, `pickup`, `timeSig`, `tempo` are deep-equal (notes compared with a tolerance of 1e-6): the quartet in versions 2 and 4; each concert-pitch copy against the plain copy of its version; the Caprice in versions 3 and 4; the Entertainer in versions 2, 3 and 4; the hymn in versions 2 and 3; the hymn in version 4 against version 3 except for the two chord texts the owner changed (`Gm`, `C/D`);
  - the quartet: `tonicPc` 2, four tracks named after the four saxophones;
  - each `…pickup-bar` copy: `pickup` 1;
  - each `…drums` copy: exactly one track with `percussion: true`;
  - the Entertainer copies: marks with four `rs`, four `re`, voltas `'1'` and `'2'`; `the-entertainer-scott-joplin2-tuplets.mscz` has at least one note whose duration is a third of a quarter;
  - the Caprice: 2/4, `tonicPc` 3;
  - the two ABC tunes: the values of Task 7 Step 6.
  A group whose files differ is a finding: report file, track, bar and both values. Fix the reader when the difference is a reading error; when two files really differ in content, narrow that assertion and say so in the report.
- [ ] **Step 4: End-to-end** (`e2e/import-formats.spec.ts`, following `e2e/core-path.spec.ts`): drop `tune.mscx` → the track page lists its track and shows `MuseScore` → build the sheet → the page-bar chip contains `MuseScore · track 1 of 1` and the first note names match the fixture; the same for `tune.abc` with `ABC`. One test drops a `.txt` file and sees `is not a format fingerscore reads. Use MIDI, MusicXML, MuseScore or ABC.`
- [ ] **Step 5: README.** Formats list gains MuseScore (versions 2, 3, 4; version 1 is refused with advice) and ABC (first tune, first verse); modes; cut time; remove "MuseScore (`.mscz`) and ABC import" from the list of missing features; state that tuplets are still rounded until part 4b; state the on-demand loading and the 400 kB entry limit with `npm run check:bundle`.
- [ ] **Step 6:** `npm test`, `npx tsc --noEmit -p .`, `npm run build && npm run check:bundle`, `npm run test:e2e` all pass. Put the four results in the report.
- [ ] **Step 7:** Commit `feat: MuseScore and ABC on the start page; sample checks, end-to-end tests, README`.

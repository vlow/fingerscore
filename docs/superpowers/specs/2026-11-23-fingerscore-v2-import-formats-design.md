# fingerscore version 2, part 4a: MuseScore and ABC import, import code on demand — design

Date: 2026-11-23 · Status: draft, waiting for the owner's approval

This document defines part 4a of version 2: two more import formats, and loading the import code only when a file is opened. It is written for the builder. Behaviour comes from `fingerscore-handoff/SPEC.md` §4.3 and §5; this document lists what part 4a contains and where it deviates. Section numbers (§) refer to SPEC.md. Part 4b (triplets) follows with its own design; section 7 records what the owner already decided for it.

## 1. Intent

Players keep songs as MuseScore files and as ABC tunes, the usual format of folk tune collections. Today they must export MusicXML or MIDI first. The app should read both formats directly.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Open `.mscz` and `.mscx` files written by MuseScore 2, 3 and 4, with parts and voices as rows on the track page, lyrics, chord symbols, repeats and endings.
2. Open `.abc` files: the first tune, `V:` voices as rows, `w:` lyrics, quoted chord symbols, repeats and endings.
3. Name modal keys as they are: a tune in D Dorian shows "D Dorian", not C major or A minor.
4. Read cut time (2/2) as a fifth meter.
5. The start page's entry bundle gets smaller, not larger: at most 400 kB (today 424.42 kB), with all parsers loaded on demand.

**Non-goals:** triplets (part 4b; until then both new formats round them with the existing notice), MuseScore 1, more than one tune per ABC file, ABC tune books as a list to choose from, dynamics, articulation, grace notes, multi-verse lyrics, meters other than 4/4, 3/4, 2/4, 6/8, 2/2; detecting a mode from the notes of a MIDI or MuseScore file (the key finder keeps choosing between major and minor).

**Anti-goals**

- A file that opens with wrong pitches. An ABC key the importer cannot read is a refusal with a message, not a guess. MuseScore transposing parts are checked against a real file (4.8) before the format is offered.
- Any network request with the file's content.
- A parser library in the entry bundle.

## 3. Approaches considered

**ABC**

| | Approach | Trade-off |
|---|---|---|
| **A** | **`abcjs` parser, loaded on demand** (chosen; §5.1 names it) | Handles the dialect: decorations, inline fields, line continuations, voice syntax. The importer still computes pitches itself (key signature and bar accidentals) from the parsed tune, and reads repeats from the bar types. Adds a dependency (MIT) that loads only when an `.abc` file is opened. |
| B | Own parser for a subset | No dependency, full control. Real tune files use more of the dialect than a subset covers; each gap is a file that fails to open. |
| C | `abcjs` audio sequence (flattened notes) | Pitches come resolved, but repeats arrive unfolded and lyrics are lost. Rejected: the sheet needs repeat marks and lyrics. |

**MuseScore**

| | Approach | Trade-off |
|---|---|---|
| **A** | **Read the `.mscx` XML with `DOMParser`, `jszip` for `.mscz`** (chosen; §5.1) | Same tools as the MusicXML importer; no new dependency. The format is not a published standard, so the importer supports the versions found in real files (2, 3, 4) and refuses others. Version 2 nests voices differently from 3 and 4, so there are two readers behind one entry. |
| B | Ask the player to export MusicXML | No code, but that is today's state. |

**Loading on demand**

One dynamic `import()` per format inside `parseFile`, so a MIDI file never loads the XML or ABC code. Considered and rejected: one chunk for all import code (ABC's library would load for every MIDI file).

## 4. What part 4a contains

### 4.1 Import code on demand

- `parseFile` loads the parser for the file's format with a dynamic import: MIDI (`@tonejs/midi`, `midi-file`), MusicXML (`jszip`), MuseScore (`jszip`), ABC (`abcjs`). No parser module and none of these libraries is imported statically from the entry.
- `index.ts` keeps `ACCEPT`, `buildOptionsFor` and `defaultBuildOptions` as static, cheap exports; only the parser modules move behind `import()`.
- While the parser loads, the drop zone shows its existing "Reading {file} …" state. A rejected `import()` is wrapped by `parseFile` into an `ImportError` with the app's load message (the text of `LoadBoundary`): "This part of fingerscore could not be loaded. Check your connection and reload the page." The drop zone shows it with its usual [Try another file]; choosing the same file again retries the load.
- "Try a sample" uses the same path.
- Measured by `npm run build`: the entry chunk is at most 400 kB.

### 4.2 Formats, names, messages

- `ParsedSong.format` and `Doc.source.format` gain `'MuseScore'` and `'ABC'`. Both count as imported songs everywhere `MIDI` and `MusicXML` do (page-bar chip, "Change track", step indicator, validation).
- Accepted extensions: `.mscz`, `.mscx`, `.abc` beside the existing ones.
- Drop zone chips: MIDI .mid · MusicXML .musicxml .mxl · **MuseScore .mscz** · **ABC .abc** · Saved sheet .json.
- Start page subline (§4.1): "Upload a MIDI, MusicXML, MuseScore or ABC file. We transpose it to a key that suits your instrument and add a fingering chart under every note."
- Unknown extension: `"{file}" is not a format fingerscore reads. Use MIDI, MusicXML, MuseScore or ABC.`
- Unreadable file: `"{file}" could not be read as a MuseScore file.` / `… as an ABC file.`
- MuseScore 1 (root `version` below 2): `"{file}" was saved with a MuseScore version fingerscore does not read. Open it in a current MuseScore and save it again, or export MusicXML.`
- Unsupported meter and a change of meter: the two existing strings of `musicxml.ts` and `midi.ts` ("… fingerscore reads 4/4, 3/4, 2/4 and 6/8 for now.", which now also names 2/2, and "… changes its time signature. fingerscore reads one time signature per song for now."), moved into one shared helper that all four importers use.
- A file without notes in any part: the existing `"{file}" has no melody track.`
- A song file of any format larger than 20 MB is refused before reading: `"{file}" is larger than 20 MB and can't be opened.`
- The three places that list formats gain both values: `Doc['source']['format']` (`domain/types.ts`), the `formats` list in `persistence.ts`, `IMPORTED` in `SheetPage.tsx`.

### 4.3 MuseScore (`src/import/mscz.ts`)

Output is a `ParsedSong`, the same shape the MusicXML importer returns.

- `.mscz`: a zip; the score is the first `.mscx` entry at the top level. `.mscx`: the XML itself.
- Version: the root's `version` attribute. 2.x, 3.x and 4.x are read; below 2 is refused (4.2); above 4 is tried with the reader for 4.
- Why version 2: the owner's three sample files, taken as "MuseScore 4 scores", are two files of version 2.06 (MuseScore 2.1) and one of 3.01. Scores downloaded from score sites keep the version they were uploaded in, so old versions are what players have.
- Version 2 lists a staff's chords and rests directly in the measure and marks other voices by track and tick elements; versions 3 and 4 wrap each voice in a `<voice>` element.
- **Tracks:** one row per part and voice that holds notes, named `{part name}` or `{part name} · voice {n}` when the part has more than one voice with notes. A part with two staves (piano) gives rows per staff and voice: `{part name} · staff {s} · voice {n}`. Instrument name from the part's instrument; a part whose instrument has `useDrumset` 1 or whose staff type group is `percussion` is listed as percussion.
- **Pitches** are read from `<pitch>`, the sounding pitch: in the sample saxophone quartet the soprano's first note has `<pitch>` 74 (D5) with a written spelling of E, and the piece is in D. Transposing parts need no correction. Chords (several notes in one `<Chord>`) become simultaneous notes.
- **Time:** durations from `<durationType>` and `<dots>`, tuplets by their ratio, full-measure rests by the measure length. Positions accumulate per voice inside a measure; a measure's length comes from the time signature, or from its actual length attribute when present (pickup bar, shortened bar).
- **Pickup:** a first measure shorter than the meter.
- **Key:** the key signature in force at the first bar; a part without one there is in written C. A staff's key signature is the written one (the B♭ soprano of the sample shows four sharps for concert D), so the reader for versions 2 and 3 shifts it by the part's chromatic transposition, unless the score's style says `concertPitch` 1; the reader for version 4 takes `<concertKey>` as it is. Later key changes are ignored for the song's key, as in the MusicXML importer (pitches are absolute, so they stay right). Mode unknown (`mode: null`), so the key finder decides major or minor.
- **Tempo:** the first tempo mark, converted to quarter notes per minute; default 120.
- **Meter:** the first time signature; a later change of meter is refused with the shared message (4.2).
- **Lyrics:** verse 1 only, attached to the note's onset; syllabic `begin`/`middle` get a trailing hyphen as in the MusicXML importer.
- **Chord symbols:** `<Harmony>` with root and bass as tonal pitch class numbers plus the kind text, rendered to the same text form the MusicXML importer produces, in concert pitch (the convention of `ParsedTrack.chords` for every importer). The kind text is taken as MuseScore stores it; a symbol whose text the chord parser cannot read is kept as typed text, as for any import.
- **Repeats and endings:** start and end repeat of measures, voltas 1 and 2 from the volta spanners. Other voltas, D.C., D.S. and Coda are ignored.
- **Ties:** tied notes are merged into one note before quantising, as in the MusicXML importer.
- Ignored: grace notes, ornaments, dynamics, articulation, hidden or cue-size notes are read as normal notes unless marked as not played.

### 4.4 ABC (`src/import/abc.ts`)

- Text is decoded as UTF-8, with a fallback to Latin-1 when UTF-8 decoding fails.
- **Tune:** the first tune of the file (first `X:` block; a file without `X:` is read as one tune). Text and `%` directives before the first `X:` are skipped, as in the owner's samples.
- **Header:** `M:` meter (`C` = 4/4, `C|` = 2/2; every meter outside the five supported ones is refused), `L:` unit length (ABC's default rule when missing), `Q:` tempo converted to quarters per minute (default 120), `K:` key. Tonic and mode are read as written, for all seven modes (4.6); explicit accidentals after the key (`K:D exp ^f`) and `K:HP` are refused as unreadable keys. A key the importer cannot read is a refusal.
- **Tracks:** one row per `V:` voice with notes, named by the voice's name or id; a tune without voices gives one row named "Melody".
- **Pitches:** note letter and octave marks, the key signature, explicit accidentals, and bar accidentals (an accidental holds to the end of the bar for that letter and octave). Applied voice modifiers: `octave=`, `transpose=` and clef names ending in `+8` or `-8`; every other voice or clef modifier is ignored. Chords in brackets become simultaneous notes.
- **Time:** note lengths as multiples of `L:`, broken rhythm (`>` `<`), tuplets by ABC's rules, rests `z` and `x`, full-bar rests `Z`.
- **Pickup:** a first bar shorter than the meter.
- **Lyrics:** `w:` lines aligned by ABC's rules (`-` splits syllables and leaves a trailing hyphen, `_` holds, `*` skips, `~` joins words with a space, `|` advances to the next bar). First verse only; `W:` lines are ignored.
- **Chord symbols:** quoted text above a note when it starts with a note name A–G; other annotations (`"^text"`, `"_text"`) are ignored. Stored in concert pitch, the convention of `ParsedTrack.chords`.
- **Repeats and endings:** `|:` `:|` `::` and endings `[1` `[2` (also `|1` `:|2`). Others are ignored.
- **Ties** (`-`) merge notes before quantising. Slurs, grace notes, decorations and inline text are ignored. An inline `M:` change is refused with the shared message (4.2). An inline `K:` change is followed for the pitches of the notes after it; the song's key stays the first one.

### 4.5 Track page and sheet

No change in behaviour: melody detection, tags, preview, lyrics and chord sources work on `ParsedSong` and treat the new formats like MusicXML. The page-bar chip names the format: the existing layout with the new names, for example `{file} · MuseScore · track 1 of 3 · 64 notes`. The track page's format line shows the same names.

### 4.6 Modes

- `Mode` becomes one of seven: major, minor, Dorian, Phrygian, Lydian, Mixolydian, Locrian (ABC's Ionian reads as major, Aeolian as minor). The key signature follows from tonic and mode; the tonic's name uses the spelling that signature gives it.
- Sources: ABC `K:` and MusicXML `<mode>` (which today falls back to "estimated" for anything but major and minor). MIDI and MuseScore carry no mode; the key finder decides major or minor as before.
- Everywhere a key is named, the mode is named: "D Dorian", "G Mixolydian". The transposition suggestions rank by key signature and range as before; a transposed Dorian tune stays Dorian.
- `validateDoc` accepts the seven values in `originalMode`.
- The Scales page is not changed by this part. Dorian and Mixolydian as scales to practise are a separate, small addition the owner can ask for.

### 4.7 Cut time

- 2/2 is the fifth supported meter, in all four importers, in validation and in the editor: a bar holds 48 ticks like 4/4, the beat is the half note, and eighths beam in groups of four.
- It is drawn as the digits 2 over 2. ABC's `C|` and MusicXML's cut symbol read as 2/2.
- The tempo stays in quarter notes per minute, as stored today.

### 4.8 Tests and fixtures

- Unit tests per importer with hand-written fixtures in the test files: a two-voice part, a transposing part, a pickup, repeats with endings, lyrics with a melisma, chord symbols with a bass note, a triplet (rounded, `simplified` true), each refusal.
- **Real files:** the owner's samples are in `samples/`: twenty-four MuseScore files (one of version 1.14, eight of 2.06, one of 3.01, six of 3.02, eight of 4.70) and two ABC tunes. Their licences are unknown, so `samples/` is git-ignored. One test file reads every file in `samples/` and checks track names, meter, key and the first notes of each; it skips itself when the folder is missing. Committed fixtures are hand-written and modelled on these files.
- **MuseScore 4:** `fur-elise-easy-ver4.mscz` and `canon-in-d-major-for-saxophone-quartet4.mscz` (format 4.70, written by MuseScore 4.7.7) cover notes, rests, ties, voices, two staves, the meter, four transposing parts and the key signature. Version 4 writes the key signature as `<concertKey>` (2 for D major in the quartet) beside the written `<actualKey>`; versions 2 and 3 write the written key as `<accidental>`. `caprice-24-niccolo-paganini-paganini-caprice-24.mscz` (4.70, alto sax, 2/4) adds 8 repeat pairs (`<startRepeat/>`, `<endRepeat>2</endRepeat>` as children of the measure), 62 tuplets (`<Tuplet>` with `normalNotes`, `actualNotes`, `baseNote`: 20 eighth triplets, sixteenth triplets, sextuplets, one septuplet) and 57 grace notes (a `<Chord>` with a `<grace16/>`-style child, which the importer skips). `caprice-24-niccolo-paganini-paganini-caprice-24 musescore 3.mscz` (3.02, written by MuseScore 3.6.2) is the same piece with the same counts, so version 3 is covered for repeats, tuplets, grace notes, ties and a transposing part. It has no `<KeySig>` element at all: the written key has no accidentals, and the version 4 copy states `concertKey` −3 with `actualKey` 0. So a part without a key signature is in written C, and the importer still shifts that by the part's transposition (alto sax: concert three flats). `the-love-of-god-is-greater-far.mscz` (2.06, written by MuseScore 2.2.1; two parts on four staves, 3/4) adds, for version 2: 208 lyric syllables in three verses (`<Lyrics>` inside the chord, verse index in `<no>`, absent for verse 1; `<syllabic>` begin/middle/end; `<ticks>` for a held syllable; verse 1 text starts with the verse number, "1 The", which is kept as written), 22 chord symbols (`<Harmony>` before the chord, here with `<root>` only: tonal pitch classes 13, 14, 15 = F, C, G), and second voices marked by `<track>` with a `<tick>` rewind. `the-love-of-god-is-greater-far4.mscz` is the same hymn saved by MuseScore 4.7.7 (4.70): lyrics are written as in version 2 (a held syllable as `<ticks_f>`, a fraction of a whole note, instead of `<ticks>`); a chord symbol's fields sit one level deeper, `<Harmony><harmonyInfo><root>`; voices are `<voice>` elements. Two of its chords were changed by the owner to Gm and C/D: the kind is the text of `<name>` (`m`), the bass note a tonal pitch class in `<bass>` (16 = D), both beside `<root>`. `the-entertainer-scott-joplin.mscz` is format 1.14 (MuseScore 1.3): the real file for the version 1 refusal of 4.2. It stores its 8 endings as `<Volta>` elements at the top level with tick positions, a third layout the importer does not read. `the-entertainer-scott-joplin4.mscz` is the same piece saved by MuseScore 4.7.7 (4.70): 4 first and 4 second endings (`<Spanner type="Volta">` inside the voice at the bar where the ending starts, with `<endings>` 1 or 2 and a `<next>` location giving its length in measures; a matching spanner with `<prev>` marks the end), 4 repeat pairs, and 164 chord symbols with the kinds `mi`, `7`, `o7`, `o` and bass notes on ten different pitch classes. `the-entertainer-scott-joplin3.mscz` is the same piece saved by MuseScore 3.6.2 (3.02): endings as in version 4; chord symbols with `<root>`, `<name>` and the bass note in `<base>` directly inside `<Harmony>` (version 4: `<bass>` inside `<harmonyInfo>`). A converted file also carries the old kind number in `<extension>`; the importer ignores it, since every chord of the file that is not a plain major chord has a `<name>`. The piece starts in C without a key signature element, changes to F (`<accidental>` −1) and back (`0`): the song's key is the key in force at the first bar, and a missing element there means written C, not the first `<KeySig>` found in the file. `the-love-of-god-is-greater-far3.mscz` is the hymn saved by MuseScore 3.6.2 (3.02): lyrics as in versions 2 and 4; a held syllable carries both `<ticks>` and `<ticks_f>`. Versions 3 and 4 are now covered by real files for every feature of 4.3 except the three named last. `the-entertainer-scott-joplin2.mscz` is the piece saved by MuseScore 2.3 (2.06): an ending is a `<Volta id="…">` element with `<endings>` in the measure where it starts and ends at the `<endSpanner id="…"/>` with the same id; repeats are `<startRepeat/>` and `<endRepeat>` in the measure; chord symbols have `<root>`, `<name>` and `<base>` directly inside `<Harmony>`, as in version 3. `the-entertainer-scott-joplin2-tuplets.mscz` is that file with a triplet and a grace note added by the owner in MuseScore 2.3: a tuplet is declared once as `<Tuplet id="1">` with `normalNotes`, `actualNotes` and `baseNote`, and each of its chords or rests refers to it by a `<Tuplet>1</Tuplet>` child (versions 3 and 4 instead place the chords between a `<Tuplet>` element and an `<endTuplet/>`); a grace note is a `<Chord>` with an `<acciaccatura/>` child (versions 3 and 4: `<grace16/>` and similar). Three copies of the quartet saved with "Concert pitch" on (`…-2-concert-pitch`, `…-3-concert-pitch`, `…4-concert-pitch`) show: versions 2 and 3 record the switch as `<concertPitch>1</concertPitch>` in the score's style, and `<accidental>` then holds the concert key (2 for D major), which must not be shifted again; version 4 writes `<concertKey>` in both states and drops `<actualKey>` when the switch is on, so the version 4 reader always takes `<concertKey>`. `<pitch>` is the sounding pitch in every state and version. Three copies of the quartet with a shortened first bar (`…-2-pickup-bar`, `…-3-pickup-bar`, `…4-concert-pitch-4-pickup-bar`) show the same form in all versions: `<Measure len="1/4">`, the actual length as a fraction of a whole note, on the measure of every staff; version 2 still numbers that measure 1. Three copies of the quartet with a drum part (`…-2-drums`, `…-3-drums`, `…4-concert-pitch-4-drums`) show the same marks in all versions: the part's instrument has `<useDrumset>1</useDrumset>` and its staff has `<StaffType group="percussion">`; a drum note is a normal `<Note>` whose `<pitch>` is the drum sound's number. In the version 4 copy the drum part is the first part of the score, so a percussion part can stand anywhere. Versions 2, 3 and 4 are now covered by real files for every feature of 4.3. The local sample test asserts each of these features on the file that carries it.
- One end-to-end test per format: drop the file, pick the track, see the sheet with the expected first notes.
- A build check for the entry chunk limit of 4.1.

## 5. Calls made by the author

1. Part 4 is split: 4a formats and loading, 4b triplets.
2. `.mscx` is accepted beside `.mscz`.
3. MuseScore 2 is supported because the owner's real files are version 2; MuseScore 1 is refused with advice (owner's decision of 2026-11-23: version 1 stores chord kinds as numbers that need MuseScore's own GPL-licensed table, a licence question the owner does not want to open now).
4. ABC: first tune only, first verse only.
5. All seven modes are named, not only Dorian and Mixolydian: the rule is the same for each.
6. Cut time is drawn as 2/2 in digits, not as the cut-C symbol.
7. The entry bundle limit is 400 kB.
9. A size limit of 20 MB for every song format.
10. A failed parser download shows the load message in the drop zone; there is no separate retry button.
11. Key changes inside a song do not refuse the file: MuseScore pitches are absolute, ABC pitches follow the new key.
8. Format chips: the drop zone names five formats; the hint text stays as it is.

## 6. Left to the builder

Module split inside each importer, the exact XML paths for MuseScore 3 and 4 (verified against the real files of 4.8), the walk over the `abcjs` parse result (the plan's first ABC task confirms from the library's documentation and source what the parse result holds and that the parser runs under jsdom), whether `abcjs` is imported whole or by its parser entry, fixtures, CSS for the two new chips.

## 7. Decided for part 4b (triplets), recorded here

Owner's decision of 2026-11-23: triplets come from imported files, their pitch can be edited, and they can be added in Edit notes like regular notes. Proposed scope, to be confirmed in the 4b design: eighth and quarter triplets as complete groups of three, rests inside a group allowed; other tuplets stay rounded with the notice. Open for the 4b design: the owner's Caprice sample uses sixteenth triplets and sextuplets, which this scope would round.

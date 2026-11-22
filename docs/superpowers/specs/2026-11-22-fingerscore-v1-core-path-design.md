# fingerscore version 1: core path — design

Date: 2026-11-22 · Status: awaiting owner approval

This document defines the first running version of fingerscore. It is written for the builder who plans and implements it. It does not repeat `fingerscore-handoff/SPEC.md`; it says which parts of the spec version 1 contains, where version 1 deviates, and which decisions are settled. Section numbers (§) refer to SPEC.md. Where this document and the spec disagree about version 1, this document wins.

## 1. Intent

The owner wants to run fingerscore locally and test it on real song files. If it does the job, he hosts it on his own server for other woodwind players. Version 1 must therefore answer one question: does the path from a song file to a playable, printable sheet with correct fingerings work on real files?

Full feature set per SPEC.md remains the target. Version 2 adds the rest.

## 2. Goals, non-goals, anti-goals

**Goals for version 1**

1. A player drops a MIDI or MusicXML file, picks the part, and gets a transposed sheet with a fingering chart under every note, for any of the 12 instruments.
2. The player can change instrument and key, see range problems, pick alternate fingerings, listen to the sheet, and print it.
3. Every fingering shown comes from a published chart, with the source recorded.
4. A built-in demo song exercises the whole path, including the track page.

**Non-goals for version 1** (all move to version 2, behaviour per SPEC.md)

- Editing notes, lyrics and chords (§9.3–9.5), the mode switch (§9.2), the bulk card, undo/redo (§10).
- Browser library, Save, File menu, JSON import/export, gallery (§4.4, §13.1, §13.2).
- Scales page (§12).
- MuseScore `.mscz` and ABC import.
- Generated PDF with jsPDF (§13.3 preferred path).
- About, Imprint, Privacy pages (§14).
- Full accessibility audit and the complete Playwright acceptance suite. Version 1 still uses real buttons, labels, ARIA states and visible focus as it goes (§15), so the audit in version 2 finds little.

**Anti-goals**

- A fingering that is guessed or derived by rule where a published chart exists.
- Any network request with user data, any analytics, cookies, or third-party font request.
- Architecture shortcuts that force a rewrite in version 2: the document model, stable event IDs and the concert-pitch rule (handoff `CLAUDE.md`, "Rules") apply from day one.
- Public hosting of version 1. German law requires the Imprint, and that page arrives in version 2.

## 3. Constraints

- Stack as given in `fingerscore-handoff/CLAUDE.md`: Vite, TypeScript strict, React 18, SVG rendering, CSS modules or a token file, Vitest, Playwright, `@tonejs/midi`, `jszip`, Web Audio. Node 24 and npm 11 are installed.
- The app lives at the repo root (`/Users/f.engel/Code/fingerscore`). `fingerscore-handoff/` stays as read-only reference. Data files are copied to `src/data/` and edited there.
- `fingerscore-handoff/reference/` and the zip are git-ignored and must stay unpublished.
- Output is a static `dist/` folder. English UI only. Copy comes from SPEC.md.
- Music limits: single staff, treble clef, one time signature per song. Rhythm support is wider than §1 and §5.1; see 5.2a.

## 4. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Spec order, milestones 1–10 | Simple to follow. Import arrives at milestone 8, so the owner cannot test his own songs until most of the app exists. |
| **B** | **Core path first** (chosen) | Version 1 runs file → track → sheet → playback → print. The owner judges the app on real files early. Editing and saving wait for version 2. |
| C | View-only on the built-in song | Fastest. Tests rendering and fingerings only, not real files. |

The owner chose B on 2026-11-22, because the test he wants to run is "is it up to the task on my songs".

## 5. What version 1 contains

### 5.1 Fingering data (first work package; everything else depends on it)

Decided by the owner: tables must be accurate, looked up in full, not derived.

- Replace the partial tables and the `rules` block in `fingerings.json` with one explicit entry per written MIDI pitch from `lo` to `ext`, for each chart kind: `xaph`, `sax`, `cl`, `fl`, `rec` (baroque) and the German recorder variant. Keep the option shape `{h, x, n, p}` and the existing `LAYOUT`, `SATS`, `SHAPE`, `FINGER`, `LEGEND` blocks so the chart renderer and chooser work as specified in §8.
- Look each table up in published fingering charts. Cross-check every kind against a second independent source. Record per kind: sources (title, URL, date accessed) and a `reviewed` flag with reviewer and date.
- Alternates (decided by the owner): store only the alternates a basic fingering chart prints, such as sax B♭ bis / 1+1 / side, side C, clarinet left/right pinky alternation, forked F (§8.4). No trill fingerings and no intonation fingerings. Penalties `p` are the builder's call, standard fingering = 0.
- Tables are per chart kind, with optional per-instrument overrides. Use an override wherever published charts differ between instruments of one kind (known cases: sax altissimo above written F6 differs between soprano, alto, tenor and baritone; piccolo and alto flute differ from the C flute in parts of the third octave). Lookup order: instrument override, then kind table. Sources and the `reviewed` flag are recorded per kind and per override set.
- Where no source gives a fingering for a pitch inside `lo..ext`, leave the entry out; do not derive one. The sheet then shows the "ext" or "alt" box per §8.3 (for a gap inside `lo..hi`, the amber "ext" box). Each gap goes into `docs/fingering-gaps.md` with the sources checked. Do not change `lo`, `hi` or `ext` in `instruments.json`; the owner decides on range changes from the gap list.
- If a source needs a key the current `SATS` layout lacks, add the key to `SATS` (position per §8.2) rather than dropping the fingering.
- The legend keeps " · fingering data: draft" for a kind until its `reviewed` flag is set. Only the owner or a player he names sets it. Xaphoon gets the suffix too until reviewed (deviation from §7.4, because its upper register was derived).
- A unit test asserts that every pitch `lo..ext` of every instrument either has at least one option or appears in a gap list kept beside the data. An undocumented gap fails the test; a documented one is reported.
- **Xaphoon** (decided by the owner): the source is the maker's official chart, https://cdn.shopify.com/s/files/1/0267/3777/0547/files/fingeringchart.pdf?v=1590460154 (read 2026-11-22). It gives one fingering for each of the 25 semitones C4–C6 over nine positions (top hole, thumb, seven finger holes), including half-holes for C♯4 and G♯5, and marks G♯5–C6 as "second register – use higher overtone". Transcribe it exactly; the existing `XA` table and its octave rule are wrong above C5 and are dropped. In `instruments.json`, both Xaphoons get `hi = 84`, `ext = 84` (C6) and `easyTop = 79` (G5, the last note before overblowing). The second source for the cross-check is the handoff's songbook page for C4–C5; no second source is required above that.
- Existing status of the data, for orientation: sax "draft from memory", clarinet verified only for the low register, flute first and third octave from woodwind.org, recorder draft, Xaphoon 14 notes from a songbook chart.

### 5.2 Domain core (§3, §6, §7.3, §8.4)

Instruments, spelling and key signatures, transposition scoring, range states, fingering lookup, Viterbi chooser with manual overrides as fixed points, chord parse/transpose/format (display only), playback schedule including repeats and voltas. Unit-tested. Acceptance checks 1–5 of §16 run as Vitest tests against `sample-song.json` ("The Water Is Wide").

The new Xaphoon range changes checks 1 and 2 (computed with the §6.3 formula on the fixture):

- Check 1: Xaphoon C now suggests **+10 → C major written, G4–G5**, all playable, score 10. F major (+3, C4–C5) is second with 11, G major (+5) third with 13. Xaphoon B♭ suggests +8 (C major written), then +1 (F), then +3 (G). The reason text "low register only" of §6.4 applies when no note is above `easyTop`, which still holds.
- Check 2: unchanged in substance (shift 0: 8 notes below C4).
- Checks 3–5: unchanged.

**Minor keys** (decided by the owner; extends the spec, which names major keys only). The document stores `originalMode: "major" | "minor"` beside `originalTonicPc`, which holds the tonic of the song's actual key (A for A minor). Key signatures and note spelling use the relative major, so §6.3 and §7.3 work unchanged. Every key label names the key in the song's mode: "Detected in file", both key-bridge selects and their options, "Keys that fit", banners and the printed header read "A minor", not "C major". Import takes the mode from the file where given (MIDI key-signature event, MusicXML `<mode>`) and otherwise estimates it. The sample fixture is major, so §16 checks 1–4 are unaffected.

Check 5 asserts 73 sounded notes and the duration the schedule computes (262 eighths, 78.6 s at ♩ = 100). The "≈ 76 s" in §16 is treated as a rounding slip. Rule for a tie into a first ending: on the second pass the tied note ends at the bar line and the second-ending note is struck anew.

`sample-song.json` is a fixture, not the document format: its events lack IDs and its chords are spelled 3 semitones above the stored pitches (`chordSpellingOffset`). A loader converts it into the §13.1 document model.

### 5.2a Meters and sixteenths (decided by the owner; extends the spec)

The spec limits v1 to 4/4 on an eighth-note grid (§1, §5.1, §17). The owner lifted that limit, because he tests on real songs.

- **Time unit.** Durations and bar capacities are integers in **ticks, 12 per quarter note**: sixteenth 3, eighth 6, dotted eighth 9, quarter 12, dotted quarter 18, half 24, dotted half 36, whole 48. This replaces "eighths" everywhere the spec uses them (`d`, `cap`, §13.1). The unit also fits triplets (triplet eighth = 4), so version 2 can add them without a model change.
- **Time signatures.** 4/4, 3/4, 2/4 and 6/8, one per song, stored in the document as `timeSig: [beats, unit]`. Bar capacity: 48, 36, 24, 36 ticks. A pickup bar has a smaller `cap`. Any other signature, or a signature change inside the song, is refused: "{file} is in 5/4. fingerscore reads 4/4, 3/4, 2/4 and 6/8 for now."
- **Allowed durations.** The eight values above. A duration that fits no single value is split into tied notes.
- **Drawing.** Time-signature digits; sixteenth flags and double beams; dotted eighths; a sixteenth rest. `glyphs.json` has no sixteenth rest and no digits: extract them from GNU FreeSerif the same way as the existing glyphs, or set digits as text in a serif face if extraction fails (builder's call). Beam groups follow the meter: per quarter beat in 4/4, 3/4 and 2/4; per dotted-quarter beat in 6/8. Mixed eighth/sixteenth groups get a partial second beam. This generalises §7.2 ("beams for eighth pairs starting on a beat").
- **Whole-bar rest.** A centred whole rest in every meter.
- **System breaks.** The spec fixes four bars per system (§7.1). Fingering charts need a minimum horizontal pitch (the widest chart of the current instrument and style plus a gap; builder derives the number from `LAYOUT`/`SATS`). Fill each system greedily with up to four bars; when the bars' charts would not fit at that pitch, the system takes fewer bars. Bars in a system then get widths in proportion to their need, not equal widths. A single bar that does not fit alone compresses its pitch to fit. A song with only eighths and longer in 4/4 must still lay out exactly as §7.1 describes, so the sample fixture matches the prototype.
- **Tempo and playback.** Tempo stays in quarter notes per minute in every meter, shown as "♩ = n". (6/8 shows the same label; a dotted-quarter display can come later.)
- **Triplets and anything finer than a sixteenth.** Not drawn in version 1. Both importers snap such notes to the sixteenth grid and the "Detected in file" card says "Rhythm simplified: triplets and notes shorter than a sixteenth were rounded." Version 2 adds triplets, reliable from MusicXML first.
- **Fixture.** The `sample-song.json` loader multiplies `d` and `cap` by 6.
- **Version 2 note.** The bar-fill rules of §9.3 and the length buttons of the editor need the same generalisation.

### 5.3 Renderer (§7, §8.1–8.3)

Staff, glyphs from `glyphs.json`, notes, rests, beams, ties, repeats, voltas, chords, one lyric line, fingering charts in compact and full key map style, recorder baroque/German, missing-chart boxes, sheet header and legend. Layout numbers per §7.1.

### 5.4 Pages

Routes `/`, `/tracks`, `/sheet`. Global header and footer per §2.1 and §2.3 with these version 1 changes: the "Scales" nav item and the footer links About, Privacy and Imprint are left out until their pages exist. The GitHub link stays out until the owner supplies a URL.

**Start page (§4)** — headline, instrument picker (§4.2 in full, choice stored in localStorage), drop zone, key preferences, "Try a sample", "How it works". Changes: no gallery; the drop zone accepts `.mid`, `.midi`, `.musicxml`, `.xml`, `.mxl` only and shows only those format chips; its text reads "Drop a song here". A `.mscz`, `.abc` or `.json` file gets the unsupported-file error naming the file.

**Tracks page (§5.2)** — in full: track rows with tags, stats, mini piano roll and play preview, melody detection with "Recommended", the "Selected" side panel with the polyphony choice, "Extras on the sheet" (chords from, lyrics from), the CTA. A file with one usable part skips this page (§4.3).

**Sheet page (§9.1)** — page bar with step indicator, file chip and "Change track" (§2.2); on the right a **Print** button replaces undo/redo, save status, Save and File. Sidebar cards: Detected in file, Fingerings for (instrument select, chart style or recorder system), Key & transposition (§6.2 in full), Range check (§6.4), Show on sheet (§9.7). Main column: banners (§6.4), a toolbar row with playback controls only (§11), the paper. Under each chart with alternatives the "⇅ n" pill and popover (§8.5), plus the sidebar summary and "Reset all to auto".

Title and subtitle are editable inline in version 1 (§9.6), because an imported file name makes a poor printed heading.

### 5.5 Import (§5.1)

- MIDI via `@tonejs/midi`; MusicXML via `DOMParser`, `.mxl` via `jszip`.
- Lyrics: MIDI lyric meta events, MusicXML `<lyric>` (first verse only). Chords: MusicXML `<harmony>`, or detected from a chosen harmony track per §5.2.
- Original key: from the file's key signature when present, otherwise estimated from the melody's pitch classes (builder's call on the method).
- Repeats and voltas: read from MusicXML barlines and endings. MIDI has none.
- Quantise to the sixteenth grid. Meters, refusals and rounding notices per 5.2a.
- Notes longer than a bar are split into tied notes (§5.1). A pickup bar is detected and stored with its reduced `cap`.

### 5.6 Demo song

- A script (`scripts/make-demo-midi.*`) generates `Auld_Lang_Syne.mid`: four tracks (melody with lyric events for verse 1 and chorus, a chord track, a bass track, percussion on channel 10), 4/4 with pickup, rhythm on the eighth grid. Tune and Burns's words are public domain; the arrangement is ours.
- "Try a sample" on the start page loads this file through the normal import path, so the tracks page shows four tracks, recommends the melody, lists percussion as disabled, and offers chord detection from the chord track.
- "The Water Is Wide" stays a test fixture only.

### 5.7 Playback (§11)

In full: Play/Stop, tempo slider, timbre per family, sounding pitch, ties, repeats with first and second endings, current-note highlight. The label "Play from selected" needs note selection and waits for version 2.

### 5.8 Print

Print button → `window.print()` with a print stylesheet: paper only (title, systems, legend), A4, no system split across pages, no input borders.

### 5.9 State and persistence in version 1

- One document store shaped like `doc` in §13.1 (score with stable event IDs, originalTonicPc, tempo, inst, shift, fingering overrides keyed by event ID, chords, title, subtitle, chartStyle, recorderSystem, show, source). UI state is separate.
- The parsed file and the current document are kept in memory and mirrored to `sessionStorage`, so a reload of `/tracks` or `/sheet` keeps the work. With nothing to show, both routes redirect to `/`.
- localStorage holds the instrument choice and the two key preferences. Nothing else.
- Changing instrument re-picks the best shift (§6.3) and resets fingering overrides (§8.5).

### 5.10 Tests and done criteria

- Vitest: domain logic, importers (against the generated demo MIDI and small MusicXML fixtures written for the tests), fingering coverage, §16 checks 1–5.
- Playwright: one end-to-end run of the core path — load the sample, pick the recommended track, reach the sheet, switch to three other instruments, open an alternate-fingering popover and pick an option, start and stop playback.
- Done when `npm test`, `npm run test:e2e` and `npm run build` pass, and the owner has opened the sheet for the demo song locally.

## 6. Left to the builder

- Project layout (the structure in handoff `CLAUDE.md` is a suggestion), state library, router, CSS approach, test fixtures.
- Routing mode. History routes need a server fallback; note the required server rule in the README.
- Key estimation method, melody-detection weights, chord-detection templates within §5.2.
- The demo arrangement: key, harmony, bass line, drum pattern.
- Fingering penalties `p` and the names `n` of alternates.
- Order of work after the fingering data package.

## 7. Version 2 (not planned here)

Triplets; editing modes and undo/redo; library, Save, File menu, JSON files, gallery; Scales page; `.mscz` and ABC import; generated PDF; About, Imprint, Privacy; nav and footer links; accessibility audit; full Playwright acceptance suite (§16 checks 6–10); deployment to the owner's server.

## 8. Calls made by the author, not yet confirmed by the owner

1. Songs in a meter other than 4/4, 3/4, 2/4 or 6/8, or with a meter change, are refused.
2. Triplets and notes shorter than a sixteenth are rounded with a notice; triplets are not drawn in version 1, also not from MusicXML.
3. Title and subtitle editing moves into version 1.
4. `sessionStorage` keeps the current sheet across a reload.
5. Xaphoon also carries the "draft" suffix until reviewed.
12. Tempo is counted in quarter notes in 6/8 too.
13. Systems hold fewer than four bars where sixteenths would make the charts overlap.
14. With the new Xaphoon range, the sample song's suggested key on Xaphoon C becomes C major (G4–G5); F major (C4–C5) drops to second.
6. Nav and footer links to missing pages are left out rather than shown disabled.
7. Version 1 is not hosted publicly, because the Imprint is missing.
8. "The Water Is Wide" is a test fixture only; the visible demo is Auld Lang Syne.
9. Fingering tables are per chart kind with per-instrument overrides where published charts differ.
10. A pitch with no published fingering stays empty and goes on a gap list; ranges in `instruments.json` change only on the owner's word.
11. Acceptance check 5 asserts 78.6 s, not the spec's "≈ 76 s"; a note tied into a first ending is struck anew in the second ending.

## 9. Changes after version 1 (owner decisions, 2026-11-22)

- **Xaphoon easy range.** After seeing both keys as fingerings, the owner chose the low octave: `easyTop = 72` (C5) for both Xaphoons, replacing 79. "The Water Is Wide" on Xaphoon C suggests F major, C4–C5 again (+3, score 11), as in SPEC §16 check 1; Xaphoon B♭ suggests +1. This replaces the values in 5.1, 5.2 and call 14 above.
- **Xaphoon F♯5.** Two fingerings from the Xaphoon handbook: the G5 fingering with less lip pressure (standard, as the chart prints it) and the high F fingering with more lip pressure.
- **Flute low C.** The C key alone, following the Woodwind Fingering Guide.
- **Music glyphs.** All glyphs move from GNU FreeSerif to Bravura (SIL Open Font License); the FreeSerif credit is replaced by a Bravura credit.

# fingerscore — functional specification

Version 1.0 · 22 Nov 2026 · Domain: fingerscore.eu

fingerscore turns a song file into sheet music for a woodwind instrument: transposed into a key that fits the instrument, with a fingering chart under every note. It runs entirely in the browser — no backend, no account. Sheets are stored locally and can be exported/imported as JSON.

This spec describes the agreed behaviour. The clickable prototype in `prototype/` shows every screen; the data in `data/` is the source of truth for instruments, fingerings, scales, glyphs and the demo song. Where the prototype and this spec disagree, **this spec wins**.

---

## 1. Scope

**In scope (v1)**
- Import MIDI, MusicXML (.musicxml/.xml/.mxl), MuseScore (.mscz) and ABC; choose the part (track/voice) to play.
- 12 instruments in 5 families with fingering charts.
- Transposition with suggested keys, range checks, concert-vs-written key handling.
- Notation rendering (single staff, treble clef, 4/4) with fingering charts, chords and one lyric line.
- Editing: notes/rests/bars, lyrics, chords, title/subtitle, manual fingering alternatives.
- Undo/redo, audio playback, save/load (browser library + JSON files), print/PDF.
- Scales page (any scale, any key, any instrument, with fingerings).
- About, Imprint, Privacy pages; global header and footer.

**Out of scope (v1)** — see §17 for the full list: OMR (PDF/image scans), time signatures other than 4/4, multiple lyric verses, internationalisation, accounts/sync.

---

## 2. Information architecture

| Route | Page | Prototype file |
|---|---|---|
| `/` | Songs (start page): instrument picker, drop zone, "Your sheets" gallery | `Main.dc.html` |
| `/tracks` | Choose a track / part | `Tracks.dc.html` |
| `/sheet` | Sheet editor | `Editor.dc.html` (+ variants `EditorOutOfRange`, `EditorAltoSax`, `EditorRecorder`, `EditorClarinet`) |
| `/scales` | Scales with fingerings | `Scales.dc.html` |
| `/about` | About | `About.dc.html` |
| `/imprint` | Imprint (legally required in DE) | `Imprint.dc.html` |
| `/privacy` | Privacy policy | *(to be written — placeholder link)* |

### 2.1 Global header (identical on every page)
Left: logo mark + wordmark "fingerscore" (link to `/`). Right: nav "Songs" | "Scales" with the current section highlighted (`aria-current="page"`). Nothing page-specific in the header.

### 2.2 Page bar (page-specific, directly below the header)
Light grey bar (`#FAFAFB`, bottom border). Content per page:
- **Tracks:** step indicator *File ✓ — Track — Sheet*, right: "Different file".
- **Sheet (imported song):** step indicator (*Sheet* current), file chip `The_Water_Is_Wide.mid · MIDI · track 1 "Melody" of 4 · 41 notes · Change track`. Right: undo/redo, save status, **Save**, **File ▾**.
- **Sheet (opened from JSON or library):** no steps, no "Change track". Chip shows a document icon + `name.fingerscore.json · fingerscore sheet · N notes` or `Title · saved in this browser · N notes`. Right side unchanged.
- Start, Scales, About, Imprint: no page bar.

### 2.3 Global footer (identical on every page)
One row, same horizontal padding as the header: logo + "fingerscore © 2026" · "Your sheets are stored in your browser. Nothing is stored on the server." · spacer · links **About · GitHub · Privacy · Imprint**. GitHub uses a neutral `</>` icon (no GitHub logo). The site is English only — no German labels.

---

## 3. Instruments

Source of truth: `data/instruments.json`.

| Family | Instrument | Written = concert + | Normal written range | Extended up to | Chart kind |
|---|---|---|---|---|---|
| Saxophone | Soprano B♭ | +2 | B♭3–F6 | C7 | sax |
| | Alto E♭ | +9 | B♭3–F6 | C7 | sax |
| | Tenor B♭ | +14 | B♭3–F6 | C7 | sax |
| | Baritone E♭ | +21 | B♭3–F6 | C7 | sax |
| Clarinet | Clarinet B♭ | +2 | E3–E6 | C7 | cl |
| Flute | Flute C | 0 | C4–A6 | C7 | fl |
| | Piccolo C | −12 (sounds 8va) | D4–A6 | C7 | fl |
| | Alto flute G | +5 | C4–G6 | A6 | fl |
| Xaphoon | Xaphoon C | 0 | C4–D6 | G6 | xaph |
| | Xaphoon B♭ | +2 | C4–D6 | G6 | xaph |
| Recorder | Soprano C | −12 (sounds 8va) | C4–D6 | G6 | rec |
| | Alto F | 0 | F4–G6 | C7 | rec |

- Range states per written note: inside `lo..hi` = playable; `hi+1..ext` = **extended** (amber); outside `lo..ext` = **unplayable** (red, no fingering chart).
- `easyTop`: notes above it count as "upper register" when scoring keys (Xaphoon/sax above C♯5 = octave key/overblowing; clarinet above B♭4 = crossing the break; flute above C♯6).
- **Default instrument: Alto sax E♭.** Family order everywhere: Saxophone, Clarinet, Flute, Xaphoon, Recorder.
- Instrument names show their key where the name doesn't contain it ("Alto E♭", "Soprano C", "Alto flute G").

---

## 4. Start page (`/`)

Order top to bottom: headline → "Your sheets" gallery (only if non-empty) → instrument picker → drop zone → key preferences → "Try a sample" link → "How it works" (3 steps) → footer.

### 4.1 Headline
H1 "Sheet music with fingering charts for woodwinds". Subline: "Upload a MIDI, MusicXML or MuseScore file. We transpose it to a key that suits your instrument and add a fingering chart under every note."

### 4.2 Instrument picker — "aligned grid" (decided)
- Card header: "Your instrument" (left) and a live summary (right), e.g. `Alto sax in E♭ · B♭3 – F6 · reads a major sixth above concert`.
- **Row 1:** one full-width segmented control with **5 equal columns** (families). Each segment: family name + small subline ("4 types", "B♭", "3 types", "2 keys", "2 types"). Selected = black fill, white text.
- **Row 2:** types of the selected family on a fixed **4-column grid** (empty columns stay empty — never stretch, never wrap). Selected = teal outline + light teal fill.
- Selecting a family selects its default type (Sax→Alto, Clarinet, Flute, Xaphoon C, Recorder Soprano).
- The choice is remembered (localStorage) and passed to the track/sheet pages.
- ARIA: `radiogroup` per row, `role="radio"` + `aria-checked` on segments.

### 4.3 Drop zone (one control for songs **and** saved sheets)
- Text: "Drop a song or a saved sheet here" · "or browse your computer · new songs become a sheet for your {instrument}". Format chips: MIDI .mid · MusicXML .musicxml .mxl · MuseScore .mscz · ABC .abc · **Saved sheet .json** (highlighted teal).
- Whole area is a file input (click or drag & drop). Border turns teal while dragging.
- Result states replace the content:
  - **Song file** → "✓ file.mid — Ready — next you pick the part to play." [Continue →] (to `/tracks`) [Choose another file]. If the file has only one usable part, skip `/tracks` and go straight to the sheet.
  - **fingerscore JSON** → validated (§13.1), added to the library, "✓ "Title" added to your sheets" [Open sheet →] [Add another].
  - **Invalid JSON** → "file.json isn't a fingerscore sheet" [Try another file].
  - Unsupported/unparseable song → clear error with the file name.

### 4.4 "Your sheets" gallery
- Shown only if the library has entries. Header "Your sheets" + "N sheets · saved in this browser".
- Responsive card grid (`auto-fill, minmax(220px, 1fr)`), most recent first, 4 shown + "Show all N".
- Card: decorative staff lines at the top, title, instrument, "Saved 5 min ago". Whole card opens the sheet; a delete icon button (with confirmation or undo toast) removes it.

### 4.5 Key preferences (checkboxes, default on)
"Prefer the easy register (no octave key or overblowing)" and "Prefer keys with few sharps or flats" — feed the scoring weights in §6.3.

---

## 5. Import & track selection (`/tracks`)

### 5.1 Parsing (all client-side)
| Format | Library suggestion | Notes |
|---|---|---|
| MIDI | `@tonejs/midi` | tracks, channels, programs, lyric meta events, tempo, time signature |
| MusicXML / .mxl | `DOMParser` (+ `JSZip` for .mxl) | parts, voices, `<lyric>`, `<harmony>` |
| MuseScore .mscz | `JSZip` → .mscx XML | parts/voices like MusicXML |
| ABC | `abcjs` parser | `V:` voices, `w:` lyrics, chord symbols in quotes |

Quantise to eighth-note grid (v1). Durations supported: 1, 2, 3, 4, 6, 8 eighths (eighth, quarter, dotted quarter, half, dotted half, whole). Longer notes are split into tied notes across bar lines.

### 5.2 Track list
One row per track (MIDI) / per part and voice (MusicXML/MuseScore; a part with 2 voices → 2 rows) / per `V:` voice (ABC). Each row: radio, `n · Name`, instrument + channel, tags (Lyrics, Single notes, Chords, Below range, Can't be played), stats (notes, range, max simultaneous notes), mini piano roll with the instrument's range band, play-preview button.
- Percussion (MIDI channel 10) is listed but disabled.
- **Melody detection** (pre-selected + "Recommended"): score = monophonic ratio + has lyrics + higher average pitch + note density in a singable range; exclude percussion.
- Side panel "Selected": hints (e.g. polyphonic → "From chords, keep: Top note / Bottom note / Voice 1"; far below range → will be moved up by octaves).
- "Extras on the sheet": *Chord symbols from* (detected harmony of another track / none) and *Lyrics from* (track with lyric events / none).
- CTA "Make the sheet from {track} →".

Chord detection from a harmony track (v1, simple): per half bar, collect sounding pitch classes, match against major/minor/7th templates, root = best match; output chord names relative to the original key.

---

## 6. Keys & transposition

### 6.1 Model
- `shift` = semitones applied to the **concert** pitch of the original song (can be −24..+24).
- Sounding note = `m + shift`; written note = `m + shift + instrument.off`.
- **The sheet always shows written pitch** for the selected instrument. Concert pitch is only a way to *choose* the key.

### 6.2 Key bridge UI (sidebar card "Key & transposition")
For transposing instruments (off mod 12 ≠ 0), two linked selects:
1. 🔊 **Sounds in · concert pitch** — "What the band and audience hear. Set this to play along with others."
2. Connector: "Alto sax in E♭: you read a major sixth higher than it sounds" (whole step / perfect fourth / ninth / octave + major sixth as applicable).
3. ♫ **You read · written pitch** — "{n ♯/♭} · this is the sheet below, with your fingerings".

Changing either select jumps to the shift with that tonic that has the **best score** (§6.3) across octaves. Non-transposing instruments show one "Key" select ("sounds as written" / "sounds an octave higher than written").

Below: **Fine-tune** — −/+ semitone buttons, big "+3 semitones from original" display (with "+1 oct +3" when ≥12), "Octave down"/"Octave up". **Keys that fit** — top 3 suggestions, each "Sounds B♭ → you read G · reason · range", current one highlighted. A "Suggested" badge appears when the current shift equals the best one.

### 6.3 Suggested key (scoring)
For every shift in −24..+24 compute over all non-rest, non-tied-continuation notes (written pitch w):
```
bad   = count(w < lo || w > ext)
ext   = count(hi < w <= ext)
upper = count(easyTop < w <= hi)
low   = count(sax && w < 62)          // awkward low pinky keys
score = bad*1000 + ext*60 + upper*3 + low*3 + |keySignature(written key)|*8 + |shift|
```
Best = lowest score. Changing the instrument re-picks the best shift. **Editing notes freezes the shift** (never re-suggest while the user edits).

Expected results for the demo song (original D major, A3–A4): Xaphoon C → +3 (F major, C4–C5, "low register only"); Alto sax → G major written (sounds B♭); Clarinet → C major written (sounds B♭); Flute → C major; Alto recorder → C major.

### 6.4 Range check (sidebar)
Bar from (lo − 7) to (ext + 4): teal band = playable, amber band = extended, song range overlay (teal / amber / red by state). Labels: lowest, highest, extended-top note names (flat spelling). Text "This song: C4 – C5 · all playable / N extended / N unplayable".

Banners above the sheet:
- **Unplayable** (red, `role="alert"`): "8 notes are below C4 — out of range for the xaphoon" + "Those notes are marked red and have no fingering…" + [Use F major (+3)].
- **Extended only** (amber, `role="status"`): "N notes need extended high fingerings" + [Use …].
- **Suggested applied** (teal): "Suggested key applied: sounds in F major, you read … (+3 from the original D major). Every note fits the {instrument}, low register only."

---

## 7. Notation rendering

Render as SVG (recommended) at the paper width of the prototype (sheet 940px wide incl. 40px padding, systems 860px).

### 7.1 Layout
- 4 bars per system (pickup counts as a bar). First system: clef + key signature + 4/4; later systems: clef + key signature + bar number above the staff start.
- Staff: 5 lines, 10px spacing. Positions: `p` = diatonic steps above E4 (bottom line); `y = bottomLine − 5p`.
- Bar width = (systemWidth − header) / 4; note x = barStart + pad + t·(barWidth − pad − 14)/barLength (pad 16, 26 after a repeat-start). A whole-bar rest is centred.
- Vertical bands per system: chords (y≈2), lyrics (y≈22), volta brackets (y≈46), staff (75–115), fingering charts (y≈166), alt-fingering button (FY+90). System height ≈ 290px.

### 7.2 Symbols
- Clef, accidentals and rests: outline paths in `data/glyphs.json` (from GNU FreeSerif), with the exact placement transforms.
- Noteheads: ellipses rotated −22°, filled (eighth/quarter/dotted quarter) or open (half, dotted half, whole; whole slightly larger, no stem).
- Stems: up if p < 4 (right side), down otherwise (left side), length 33px. Flags for single eighths; **beams** for eighth pairs starting on a beat (t even); beam direction by the pair's average position.
- Ledger lines for p ≤ −2 and p ≥ 10. Augmentation dots in the space (shifted up when on a line).
- Ties: arcs below (stems up) or above; ties across systems are drawn as two halves.
- Repeat start/end barlines with dots, final barline on the last bar, volta brackets "1." / "2.".
- Out-of-range notes in red (unplayable) / amber (extended).

### 7.3 Spelling
- Key signature from the written key's tonic (`keySignatureByMajorTonicPc`); F♯ major is always spelled G♭ (−6).
- Note spelling: sharp keys use sharps (C♯ D♯ F♯ G♯ A♯), flat keys flats (D♭ E♭ G♭ A♭ B♭).
- Accidental drawn when the note's alteration differs from the key signature (natural sign when cancelling). Tied continuations get no accidental. (v1 ignores accidental carry within a bar.)

### 7.4 Header & legend
Sheet title and subtitle (editable inline, §9.6), tempo "♩ = {tempo}", right: "{instrument} · {header keys}" e.g. "you read G major · sounds B♭ major". Footer of the paper: chart legend for the instrument family (`LEGEND` in `data/fingerings.json`, plus " · fingering data: draft" for non-Xaphoon) and "fingerscore.eu".

---

## 8. Fingering charts

Data: `data/fingerings.json` (layouts, satellites, tables, rules, review status).

### 8.1 Visual language (shared by all instruments)
One vertical column: left-hand holes/keys (3), gap, right-hand (3–4), drawn as 8–9px circles: **black = closed/pressed, white with outline = open, half-filled = half-hole**. A small key/hole offset to the top-left: Xaphoon thumb, sax octave key, clarinet register key + thumb, flute thumb, recorder thumb. Recorder's two lowest holes are double holes.

### 8.2 Extra keys (sax, clarinet, flute) — user choice
- **Compact (default):** only the *cluster* that contains a pressed extra key is drawn: pressed key black, its neighbours as faint rings (`#C3C7CE`, 1px). Plain notes look exactly like a Xaphoon chart.
- **Full key map:** every satellite key always drawn ghosted, pressed ones black; shapes by cluster (pills for palm/side keys, squares for the sax pinky table, etc. — `SHAPE`).
- Positions follow the instrument (player's view): sax palm keys left-high, front F/bis right-high, LH pinky table left-middle, side keys + high F♯ right-middle, RH pinky low E♭/C right-low; clarinet A/G♯ above the column, pinky keys left/right, 4 side trill keys right; flute B♭ thumb beside the thumb, G♯ left, trill keys right, E♭/C♯/C foot keys right-low.
- Toggle "Compact / Full key map" appears in the instrument card (sheet) and on the Scales page.
- Recorder: "Baroque / German fingering" toggle.

### 8.3 Missing charts
- Unplayable note → red dashed box "!" instead of a chart.
- Extended note without data → amber dashed box "ext"; clarinet altissimo without data → grey box "alt".
- Tied continuations and rests get no chart.

### 8.4 Automatic choice of alternatives (looks at previous and next note)
Each written pitch has 1..n options `{h, x, n, p}`. Choose the cheapest path through each run of consecutive playable notes (runs break at rests and unplayable notes) with Viterbi:
```
trans(a,b) = #changed main keys + #satellites added/removed
           + 3 for every satellite pair operated by the same finger (FINGER) with different keys   // pinky slides
cost(note option) = option.p (+2 if 'bis' is used next to a B natural)
```
Manual overrides are fixed points in the path. Examples: sax B♭ → bis / 1+1 / side B♭; C → standard / side C; clarinet left/right pinky alternation for E/B and F/C.

### 8.5 Manual override UI
Under every chart with alternatives: a small pill button "⇅ 3". Clicking opens a popover (below the chart; above it in the last system) titled "B♭4 · bar 6 — pick a fingering" with a mini chart per option, its name, an "auto" tag on the automatic choice and the current choice outlined. Picking the auto choice removes the override. Overridden notes show a teal pill. Sidebar summary: "6 notes have alternate fingerings · 2 changed by you" + "Reset all to auto". Overrides reset when instrument or transposition changes.

---

## 9. Sheet editor (`/sheet`)

### 9.1 Layout
Header, page bar (§2.2), then a two-column body (wraps on narrow screens): **sidebar** (Detected in file · Fingerings for (instrument select + chart style / recorder system) · Key & transposition · Range check · Lyrics & chords bulk card · Show on sheet) and **main** (banners, mode/playback toolbar, paper).

### 9.2 Mode switch (segmented, above the paper)
**View · Edit notes · Lyrics · Chords**, plus a one-line hint for the current mode. On the right of the same row: playback controls (§11).

### 9.3 Edit notes
Click any note or rest (hit area covers chord, lyric and staff bands; selected column highlighted teal). Panel under the staff:
- **Pitch:** −8 / −1 / note name / +1 / +8 (semitones; rests turn into notes at the previous note's pitch).
- **Length:** eighth, quarter, half, whole icons, dot toggle, tie toggle (only when the next note has the same pitch).
- **Turn into rest / Turn into note**, **+ Bar after** (inserts a 4/4 bar containing a whole rest, selected), **Remove bar**.
- Keyboard: ↑/↓ semitone (Ctrl/⌘ = octave), A–G jump to that letter respecting the key signature (nearest **playable** octave), ←/→ previous/next event, 3/4/5/6 = eighth/quarter/half/whole, `.` dot, R rest↔note, T tie, Delete/Backspace → rest, Esc closes.

**Bar-fill rules** (bars always sum exactly to their capacity: 8 eighths, pickup 6):
- Shorter → the gap is filled with rests (decomposed greedily into 8,6,4,3,2,1).
- Longer → consumes following events in the same bar (removing or shortening them; non-representable remainders become rests). Never crosses the bar line; lengths that don't fit are disabled.
- Ties are cleared if the next event is no longer a note of the same pitch.
- Lyrics, chords and fingering overrides stay attached to their events across structural edits (use stable event IDs).
- Repeat/volta marks belong to bars and move with them; new bars have none.

### 9.4 Lyrics mode
Click a note → panel with only the **Lyric** field (autofocus) and symbol buttons ‿ ’ - „ “ …. Enter/Tab → next note (skipping tied continuations and rests), Shift+Tab → previous, Esc closes. Lyrics are forced visible in this mode.
**Bulk entry** (sidebar card "Lyrics & chords"): textarea "Type or paste a verse", [Fill lyrics] fills notes in order from the selected note (or the first), skipping tied continuations and rests. Syntax: `wat-er` splits a word over two notes (hyphen kept on the first syllable), a standalone `_` leaves a note empty. Plus [Clear lyrics], [Clear chords], edit count + [Restore from file].

### 9.5 Chords mode
Click any event (notes, tied notes **and rests**) → panel with only the **Chord** field (autofocus) and buttons ♭ ♯ m ° ø Δ(→Δ7) 7 sus4 add9 6 / ( ) (inserted at the caret; "( )" places the caret inside; buttons don't steal focus). Hint: "b → ♭ and # → ♯ after a note name".
- Parse `^([A-G])([#♯b♭]?)(.*?)(/([A-G])([#♯b♭]?))?$` (case-insensitive root). Valid chords are stored **in concert pitch relative to the original key** (root pc, rest, bass pc) so they follow any transposition/instrument; the typed text is shown verbatim until the key changes. Invalid text is kept, shown red with a wavy underline and not transposed ("Not a chord we can transpose. Start with a note name A–G.").
- Display: root + quality (m, min, -, °, dim, aug, +, ø) normal size; the rest (extensions/alterations) **raised** (C⁷, F♯m⁷♭⁵/C♯, B♭Δ⁷) with b/# in extensions shown as ♭/♯. Option "Raise extensions" (default on) in *Show on sheet*.

### 9.6 Title & subtitle
Edited inline on the paper (inputs styled exactly like the printed heading; dashed outline on hover, teal outline on focus, placeholders "Add a title" / "Add a subtitle (composer, arranger…)"). No visible border in print.

### 9.7 Show on sheet
Checkboxes: Fingering charts · Chord symbols (transposed) · └ Raise extensions · Lyrics.

---

## 10. Undo / redo

- Buttons ↶ ↷ in the page bar (44×44, disabled at 40% opacity when empty, tooltips with shortcuts). Shortcuts: Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, Ctrl+Y (handled on the app root, not globally on `window`).
- History covers the **document**: score, tempo, instrument, shift, fingering overrides, lyrics, chords, title, subtitle, chart style, recorder system, show-toggles, raise-extensions. UI state (popovers, selection, mode, menus) is not recorded.
- Typing in the same field within 1.5 s coalesces into one step. Max 200 steps. A new change clears redo. Opening a sheet is undoable. History is not persisted.

---

## 11. Playback

- Controls (right side of the mode row): **▶ Play / ■ Stop** (label "Play from selected" when a note is selected in an edit mode) and a tempo slider 40–200 (label "♩ = 100"). Tempo is part of the document and is printed on the sheet.
- Web Audio, scheduled ahead: one oscillator per note → low-pass filter → gain envelope (25 ms attack, 60 ms release, gain 0.22). Timbre per family: sax sawtooth/2200 Hz, Xaphoon sawtooth/1500, clarinet square/1500, flute sine/4000, recorder triangle/3000.
- Plays **sounding pitch** (`m + shift`). Tied notes sound as one note, rests are silent.
- Repeats: play to the repeat-end bar (1st ending), jump back to the last repeat-start, on the second pass skip the "1." bar and continue with "2.".
- The current event is highlighted on the sheet (teal column). Any score edit or leaving the page stops playback.

---

## 12. Scales page (`/scales`)

Controls (one card): Instrument select · Scale (major, natural minor, harmonic minor, melodic minor, major pentatonic, minor pentatonic, blues, chromatic) · Range (1 octave / 2 octaves / Whole range) · Direction (Up / Up & down) · Key chips (12) · chart style / recorder system · "Show alternate fingerings" · "Note names". "Download PDF" next to the page title.

- **Key chips** show both names on transposing instruments ("G · sounds B♭"); a toggle "Name keys by: ♫ You read / 🔊 Sounds in" swaps which is primary and orders the chips by concert key.
- **Start note:** lowest written tonic ≥ `lo`. 2 octaves beyond `ext` are cut at `ext` with a notice; notes above `hi` are amber with the notice "Notes above F6 need extended fingerings…". Whole range = all scale notes `lo..hi`.
- **Spelling:** heptatonic scales by degree (letter = tonic letter + degree, see `data/scales.json`); minor-type scales use the relative major signature; melodic minor descends as natural minor; blues has a ♭5; chromatic uses sharps up (flats in flat keys) and flats down. Tonic spelling from the major/minor tonic tables.
- **Rendering:** whole-note heads without stems, up to 15 notes per line, note names under the staff, fingering charts (same chooser as §8.4 along the scale), optional stacked alternatives with their names.

---

## 13. Save & load (no backend)

### 13.1 Document file format (`*.fingerscore.json`)
```json
{
  "app": "fingerscore",
  "format": 1,
  "savedAt": "2026-11-22T12:00:00Z",
  "title": "The Water Is Wide",
  "doc": {
    "score":   [ { "cap": 6, "rs": false, "re": false, "volta": "", "ev": [ { "id": "e1", "m": 57, "d": 2, "r": false, "tie": false, "l": "The", "c": "Am" } ] } ],
    "originalTonicPc": 2,
    "tempo": 100,
    "inst": "asax",
    "shift": -4,
    "fingering": { "e17": 1 },
    "chords":    { "e5": { "raw": "B♭maj7", "ok": true, "pc": 7, "rest": "maj7", "bass": null, "tk": 6 } },
    "title": "The Water Is Wide", "subtitle": "Traditional",
    "chartStyle": "compact", "recorderSystem": "baroque",
    "show": { "fingerings": true, "chords": true, "lyrics": true, "raiseExtensions": true },
    "source": { "file": "The_Water_Is_Wide.mid", "format": "MIDI", "track": "1 Melody", "trackCount": 4 }
  }
}
```
- `m` = concert MIDI pitch in the original key (rests keep the last pitch for "turn into note"), `d` in eighths, `l` lyric, `c` chord (as imported), `id` stable event id. Overrides keyed by event id (the prototype keyed by index — don't copy that).
- Validation on import: `app === "fingerscore"`, `format` supported, `doc.score` well-formed (bar sums = cap, allowed durations). Reject with a clear message otherwise. Migrate older formats explicitly.

### 13.2 Browser library
- `localStorage` key `fingerscore.library.v1`: array of `{ id, title, inst (display name), savedAt, doc }`, newest first. IDs: time-based + random suffix. Wrap all storage access in try/catch; if blocked/full, show "This browser blocks local storage. Use "Download JSON" instead." / "Couldn't save — the browser storage may be full." Consider IndexedDB if sheets get large.
- **Save** button saves/updates the current entry (first save creates it). Status text: "Not saved yet" / "Unsaved changes" / "Saved" (compare a canonical serialisation of the document against the last saved one).
- **File ▾** menu: **Download PDF** (primary, teal) · **Download JSON** · **Open JSON file…** · **New sheet** (→ `/`), then "Saved in this browser" list (title, instrument · saved ago, current one highlighted, Open, Delete) and a note "Sheets are stored only on this device. Download a JSON file to back up or move a sheet to another computer."
- Opening from the start page gallery: navigate to `/sheet?id=<id>` (the prototype used a `fingerscore.pending` key because artboards can't pass parameters).

### 13.3 PDF
"Download PDF" must produce a clean, paginated A4/Letter PDF of the paper only (title, systems, legend). v1 may use a print stylesheet + `window.print()`; preferred: generate from the SVG (e.g. `svg2pdf.js` + `jsPDF`) with page breaks between systems.

---

## 14. About & legal pages

- **About:** single narrow article column (680px): eyebrow "About", H1 "Why I made fingerscore", lead paragraph, author line (initials avatar, name, one-line bio, GitHub button), sections *The story* (with a centred pull quote), *Under the hood*, *Thanks & credits* (keep: The Woodwind Fingering Guide; GNU FreeSerif; Atkinson Hyperlegible by the Braille Institute), contact line. Copy is lorem ipsum / placeholders — the owner supplies text.
- **Imprint:** "Information according to § 5 DDG" card with Provider (name, address), Contact (email, phone), Represented by, Register entry, VAT ID, Responsible for content (§ 18 (2) MStV); sections *Consumer dispute resolution*, *Liability for links*; link to Privacy. No link to the EU ODR platform (discontinued July 2025). All values are placeholders — **have the final texts reviewed legally.**
- **Privacy (to write):** mention localStorage use for the library (user-initiated, no cookies, no tracking), that files are processed locally and never uploaded, and the hosting provider's server logs. **Self-host all fonts** (no Google Fonts requests).

---

## 15. Design system

- **Typeface:** Atkinson Hyperlegible (400/700 + italics), self-hosted, everywhere (UI, headings, sheet). Hierarchy via size rather than many weights.
- **Colours:** ink `#15171C`, text `#2A2D33`, muted `#5B616E` / `#4A505C`, borders `#E2E4E8` / `#D5D8DE`, page `#F3F4F6`, page bar `#FAFAFB`, cards `#FFFFFF`; accent teal `#0E6E68` (hover `#0A4F4A`, tint `#E3F4F2`, light `#F0FAF8`); amber `#B45309` on `#FFF7ED`; red `#B91C1C` on `#FEF2F2`. Selected segment = ink fill. Ghost keys `#C3C7CE`.
- **Shapes:** radius 10px controls, 12–16px cards, 999px pills; card border 1px; popovers with soft shadow `0 12px 32px rgba(20,22,28,.18)`.
- **Spacing:** 28px page padding, 14–24px gaps; header 12px vertical padding.
- **Icons:** simple 2px stroke line icons (no emoji, no brand logos).
- **Accessibility:** WCAG 2.2 AA contrast; touch targets ≥ 44px (secondary ≥ 36px); real buttons/links/inputs with labels; `aria-pressed`/`aria-checked`/`aria-expanded` on toggles, segmented controls and menus; `role="alert"` for errors; visible focus; keyboard support for all editing; decorative SVG `aria-hidden`.
- **Responsive:** sidebar + main wrap on narrow screens; the paper scrolls horizontally inside its container on small screens; picker grid columns stay aligned.

---

## 16. Acceptance checks (from the prototype)

1. Demo song on Xaphoon C: suggested +3 → F major written, C4–C5, all playable, "low register only".
2. Same song at shift 0 on Xaphoon C: 8 notes below C4, red banner, red noteheads, "!" boxes.
3. Alto sax: written G major, sounds B♭ major; Clarinet: written C major, sounds B♭ major; Tenor: G major / F major.
4. Key bridge on alto sax: set "Sounds in" D major → written B major.
5. Playback of the demo: 73 notes with the repeat (pickup + 16 bars, second pass to the 2nd ending), ≈ 76 s at ♩ = 100.
6. Edit notes: quarter → eighth inserts an eighth rest; lengths that don't fit are disabled; undo restores everything; editing doesn't change the key.
7. Chords: typing "Bb" shows "B♭"; "F#m7b5/C#" renders F♯m⁷♭⁵/C♯; transposing +2 moves stored chords.
8. Lyrics bulk: "Oh love is gen-tle" → Oh | love | is | gen- | tle on consecutive notes.
9. Save → "Saved"; any change → "Unsaved changes"; Download/Open JSON round-trips the document exactly; foreign JSON is rejected.
10. Scales: A harmonic minor contains G♯; E blues = E G A B♭ B D (♭5 spelled B♭); C chromatic goes up with sharps and down with flats.

---

## 17. Open items / not in v1

- **Fingering data review** (sax, clarinet altissimo, recorder, Xaphoon chromatic/upper register) by players of each instrument.
- Real PDF generation, page layout, print options (with/without charts).
- Time signatures other than 4/4, triplets, sixteenths, dynamics, articulation, multiple voices.
- Multiple lyric verses (the songbook has 3 verses + "Repeat verse 1").
- Inserting notes mid-bar without overwriting (insert mode), copy/paste, multi-select.
- More instruments (tin whistle, oboe, bassoon, bass clarinet, B-foot flute gizmo).
- OMR import of PDFs/images.
- Internationalisation (would require translating all UI + legal pages).
- Persisting the selected instrument from the start page through `/tracks` to `/sheet` (prototype pages each have their own default).

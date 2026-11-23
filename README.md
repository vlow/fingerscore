# fingerscore

Turns a song file into sheet music with a fingering chart under every note, for woodwinds. It runs in the browser only. Nothing leaves your machine.

Version 1 answered one question: does the path from a song file to a playable, printable sheet with correct fingerings work on real files? Version 2 adds saving and files, then editing with undo and redo, then a Scales page: any scale in any key with a fingering chart under every note, then MuseScore and ABC import.

## What it does

- Reads MIDI, MusicXML, MuseScore and ABC files. See "Formats" below.
- Finds the melody track and lets you pick another one.
- Suggests a key where every note fits your instrument's range. You can shift by semitones or octaves.
- Flags notes outside the range.
- Draws the sheet and a fingering chart under every note, in compact or full key map style. Recorders come in baroque and German systems.
- Offers alternate fingerings where published charts list them. You pick one per note.
- Plays the sheet: Play and Stop, tempo slider, repeats, first and second endings, highlight on the current note.
- Prints the sheet (A4, paper only) through the browser's print dialog.
- Shows scales with fingerings on a Scales page, linked from the header. Pick an instrument and one of eight scales (major, natural, harmonic and melodic minor, major and minor pentatonic, blues, chromatic) in any of twelve keys; the key with six accidentals comes in both spellings (F♯ and G♭ major, D♯ and E♭ minor). Choose one octave, two octaves or the whole range, up or up and down. Letters follow the scale degrees, except that a double sharp or double flat is written as the plain neighbouring note (A♮ instead of B𝄫). On transposing instruments you name keys by what you read or by what sounds. Notes with more than one fingering get the same "⇅" pill as on a sheet: pick another fingering and the neighbouring notes adapt; "Reset all to auto" undoes your picks, and a change of instrument, scale, key, range, direction or recorder system clears them. Optional: alternate fingerings under each note, note names, and print (A4, the scale only, with your picks). The page remembers your settings and picks in this browser.
- Covers 12 instruments: Xaphoon, saxophones, clarinet, flutes, recorders.
- Ships a sample song, Auld Lang Syne. Regenerate it with `npm run demo`.

### Formats

| Format | Extensions | Notes |
|---|---|---|
| MIDI | `.mid`, `.midi` | |
| MusicXML | `.musicxml`, `.xml`, `.mxl` | |
| MuseScore | `.mscz`, `.mscx` | Versions 2, 3 and 4. Reads lyrics, chord symbols, repeats and endings. |
| ABC | `.abc` | First tune, first verse. Reads lyrics, chord symbols, repeats and endings. |

Every voice of every part becomes a track:

- MIDI: one row per track.
- MusicXML and MuseScore: one row per part, staff and voice that has notes.
- ABC: one row per voice.

Percussion rows are listed and cannot be played.

A song longer than 2000 bars is refused when the sheet is made. A sheet holds at most 2000 bars.

MuseScore limits:

- Version 1 files (MuseScore 1.x) are refused. The message says to open the file in a current MuseScore and save it again, or to export MusicXML.
- The voice of a note comes from the order of the voice elements in a bar. If a bar uses voice 3 while voice 2 is empty and MuseScore leaves the empty voice out, the notes of voice 3 are read as voice 2. No sample file has this case.
- Only the first verse of lyrics is read.
- Only endings 1 and 2 are read.
- A repeat or ending marked only on a lower staff is not read.
- A change of meter is refused.
- Chord symbols are shared by all melody tracks of a score.

ABC limits:

- A key line with its own accidentals (`K:D exp ^f`) is refused. So is a key the ABC library cannot read and a key with more than seven sharps or flats.
- Text in quotes counts as a chord symbol only when it looks like one. "D.C." and "A tempo" are ignored.
- A shortened bar before a repeat sign or an ending keeps its notes at the start. A pickup inside the tune is placed at the end of its own bar. Two short bars that make one full bar, as at a repeat sign, and a short last bar stay as written.
- A bar longer than the meter is taken as written.
- Voice names come from the `V:` lines in order.
- A syllable on the second note of a tie is not shown.
- Only the first tune of a file and the first verse of lyrics are read.
- A change of meter is refused.

### Editing

A mode switch above the sheet has four modes: View, Edit notes, Lyrics and Chords. Click a note or rest to select it. The panel for the mode opens under that system. Esc clears the selection.

- **Edit notes:** change the pitch by semitone or octave. Set the length from sixteenth to whole, with a dot. Tie a note to the next note of the same pitch. Turn a note into a rest and back. Add a bar after the selected one, or remove it. Every bar keeps its full length.
- **Lyrics:** type one syllable per note. Enter moves to the next note that can carry a syllable. The card "Lyrics & chords" fills a pasted verse from the selected note: `wat-er` puts "wat-" and "er" on two notes, and a lone `_` leaves a note empty. "Clear lyrics" and "Clear chords" empty them.
- **Chords:** type a chord such as Am7 or F♯m7♭5 on any note or rest. The app stores it relative to the original key, so it follows every transposition and instrument. Text that is not a chord stays, in red, and is not transposed.
- **Restore from file:** the card shows how many lyric and chord edits you made. "Restore from file" returns lyrics and chords to what the file had.
- **Undo and redo:** the page bar has Undo and Redo buttons. They cover every change to the sheet, up to 200 steps. History lives in memory and starts empty when you open a sheet.

| Keys | Where | Action |
|---|---|---|
| Ctrl/⌘+S | Sheet page | Save |
| Ctrl/⌘+Z | Sheet page | Undo |
| Ctrl/⌘+Shift+Z, Ctrl+Y | Sheet page | Redo |
| ← / → | Every mode, sheet focused | Previous or next note or rest (View and Lyrics skip tied notes; Lyrics also skips rests) |
| Home / End | Every mode, sheet focused | First or last note or rest |
| Enter, Space | Every mode, sheet focused | Play from the selection, or stop playback |
| Esc | Every mode | Clear the selection |
| ↑ / ↓ | Edit notes, sheet focused | Semitone up or down |
| Ctrl/⌘+↑ / ↓ | Edit notes | Octave up or down |
| A–G | Edit notes | Jump to that note name, nearest to the current pitch |
| 2 3 4 5 6 | Edit notes | Sixteenth, eighth, quarter, half, whole |
| . | Edit notes | Dot |
| R | Edit notes | Note or rest |
| T | Edit notes | Tie |
| Delete, Backspace | Edit notes | Turn into rest |
| Tab | Lyrics and Chords, sheet focused | Go into the Lyric or Chord field |
| Enter, Tab | Lyric or Chord field | Next note (Lyrics) or next event (Chords) |
| Shift+Tab | Lyric or Chord field | Previous note or event; at the first one, back to the sheet |
| Esc | Lyric or Chord field | Clear the selection |

The Edit notes keys follow the key's position on layouts without Latin letters, and on French AZERTY the digits and the dot work with Shift.

### Saving and files

- Save keeps the sheet in your browser's local storage. Press the Save button or Ctrl/⌘+S. The sheet page shows "Not saved yet", "Unsaved changes" or "Saved".
- Sheets live only in this browser on this device. Clearing site data deletes them.
- The start page lists your saved sheets under "Your sheets". Open one with a click. Delete one and Undo brings it back for a few seconds.
- To back up a sheet or move it to another computer, choose File, then Download JSON. Open it there with File, then Open JSON file…, or drop it on the start page. The start page drop zone takes songs (MIDI, MusicXML, MuseScore, ABC) and saved-sheet files (.json).
- The File menu also lists your saved sheets.

The file format is one JSON format: `{ app, format, savedAt, title, doc }`. The app validates every file on import and refuses anything else. No compatibility promise holds before the public release: a later version may change the format and reject older files.

### Loading

The MIDI, MusicXML, MuseScore and ABC readers load when you first drop a file of that format. If the download fails, the drop zone shows the load message and "Try another file"; choosing the file again retries (checked in Chromium). The entry chunk stays at 400 kB or less; `npm run check:bundle` checks it after a build.

The Tracks and Scales pages and the editing panels load when you first need them; the start and sheet pages load with the app. If one fails to load, for example after a dropped connection or a new release, the app shows "This part of fingerscore could not be loaded. Check your connection and reload the page." with a Reload button. The header and the rest of the app keep working.

### Rhythm rules

- Meters: 4/4, 3/4, 2/4, 2/2 (cut time) and 6/8. One meter per song. Any other meter, or a meter change inside the song, is refused with a message.
- Note lengths: whole down to sixteenth, with dotted values. Longer lengths that fit no single value become tied notes.
- Triplets and notes shorter than a sixteenth are rounded to the sixteenth grid. The "Detected in file" card says so. Tuplets stay rounded until part 4b.
- Keys: major, minor, Dorian, Phrygian, Lydian, Mixolydian and Locrian, named in full ("D Dorian"). ABC and MusicXML give the mode. MIDI and MuseScore do not, so the key finder picks major or minor.

## What it does not do

- Editing repeats and endings, or changing the time signature, or the key signature other than by transposing.
- Triplets.
- A generated PDF. Use the print dialog.
- About, Imprint and Privacy pages.
- A full accessibility audit.

Later versions plan these.

Not planned yet: insert mode, copy and paste, selecting several notes, and more than one verse of lyrics.

There is no sync between browsers or devices, and none is planned: the app has no server and sends no user data over the network. To move a sheet, use File, then Download JSON, and open the file on the other device.

## Run it

```
npm install
npm run dev        # dev server on http://localhost:5173
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end test (Playwright)
npm run build      # type-check and build to dist/
npm run check:bundle  # after a build: entry chunk at most 400 kB
npm run demo       # regenerate the sample MIDI file
```

`npm run test:e2e` attaches to a dev server on port 5173 or starts its own. If Playwright reports a missing browser, run `npx playwright install chromium` once.

### Server rule for history routing

The app uses real paths (`/tracks`, `/sheet`). The server must serve `index.html` for them. nginx: `try_files $uri /index.html;`.

## Fingering data status

Every fingering comes from published charts. Where charts print different fingerings for a note, the first is the standard one and the others are offered as alternates, unless the evidence shows a variant is probably wrong. Where no fingering is sourced, the app shows no chart for that note. It never guesses.

The owner has reviewed the Xaphoon table. The other tables are drafts until a player of that instrument has reviewed them; the sheet's legend says so.

| Kind | Sources | Reviewed |
|---|---|---|
| Xaphoon | Official Xaphoon chart; "The Water Is Wide" songbook page; Xaphoon handbook | yes (owner, 2026-11-22) |
| Saxophone | The Woodwind Fingering Guide; Sax Teacher UK saxophone and altissimo charts | no |
| Clarinet | The Woodwind Fingering Guide; Tomplay clarinet chart; Sax Teacher UK clarinet chart | no |
| Flute, piccolo, alto flute | The Woodwind Fingering Guide; Tomplay flute chart; Sax Teacher UK flute chart; flutetunes.com; Yamaha flute chart; *Flute For Dummies* chart | no |
| Recorder (baroque) | The Woodwind Fingering Guide; Dolmetsch Online; Tomplay recorder charts; Yamaha, Philippe Bolton and Prescott Workshop charts; American Recorder Society charts; Blockis | no |
| Recorder (German) | The Woodwind Fingering Guide; Yamaha and Dolmetsch German charts; Philippe Bolton; Blockis; Wikipedia (en, de) citing Rowland-Jones and Linde | no |

Source titles, URLs and access dates are in the `meta` block of `src/data/fingerings.json`.

Known gaps, with the sources checked for each, are in [docs/fingering-gaps.md](docs/fingering-gaps.md). Every note inside the normal range has a fingering; the remaining gaps are three saxophone altissimo notes. The same file records which chart prints each alternate and why some printed variants were left out.

## Credits

- Music glyphs (clef, accidentals, rests, time-signature digits): outline paths from Bravura by Steinberg, SIL Open Font License 1.1 (licence in [licenses/Bravura-OFL.txt](licenses/Bravura-OFL.txt)).
- Fingerings: The Woodwind Fingering Guide, plus the other charts listed above.
- Typeface: Atkinson Hyperlegible by the Braille Institute.

## Hosting

Do not host version 1 publicly. German law requires an Imprint, and that page arrives in version 2.

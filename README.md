# fingerscore

Turns a song file into sheet music with a fingering chart under every note, for woodwinds. It runs in the browser only. Nothing leaves your machine.

Version 1 answered one question: does the path from a song file to a playable, printable sheet with correct fingerings work on real files? Version 2 adds saving and files first.

## What it does

- Reads MIDI and MusicXML files.
- Finds the melody track and lets you pick another one.
- Suggests a key where every note fits your instrument's range. You can shift by semitones or octaves.
- Flags notes outside the range.
- Draws the sheet and a fingering chart under every note, in compact or full key map style. Recorders come in baroque and German systems.
- Offers alternate fingerings where published charts list them. You pick one per note.
- Plays the sheet: Play and Stop, tempo slider, repeats, first and second endings, highlight on the current note.
- Prints the sheet (A4, paper only) through the browser's print dialog.
- Covers 12 instruments: Xaphoon, saxophones, clarinet, flutes, recorders.
- Ships a sample song, Auld Lang Syne. Regenerate it with `npm run demo`.

### Saving and files

- Save keeps the sheet in your browser's local storage. Press the Save button or Ctrl/⌘+S. The sheet page shows "Not saved yet", "Unsaved changes" or "Saved".
- Sheets live only in this browser on this device. Clearing site data deletes them.
- The start page lists your saved sheets under "Your sheets". Open one with a click. Delete one and Undo brings it back for a few seconds.
- To back up a sheet or move it to another computer, choose File, then Download JSON. Open it there with File, then Open JSON file…, or drop it on the start page. The start page drop zone takes songs (MIDI, MusicXML) and saved-sheet files (.json).
- The File menu also lists your saved sheets.

The file format is one JSON format: `{ app, format, savedAt, title, doc }`. The app validates every file on import and refuses anything else. No compatibility promise holds before the public release: a later version may change the format and reject older files.

### Rhythm rules

- Meters: 4/4, 3/4, 2/4 and 6/8. One meter per song. Any other meter, or a meter change inside the song, is refused with a message.
- Note lengths: whole down to sixteenth, with dotted values. Longer lengths that fit no single value become tied notes.
- Triplets and notes shorter than a sixteenth are rounded to the sixteenth grid. The "Detected in file" card says so.

## What it does not do

- Edit notes, lyrics or chords. No undo or redo.
- Sync sheets between browsers or devices. Use Download JSON.
- Scales page.
- MuseScore (`.mscz`) and ABC import.
- Triplets.
- A generated PDF. Use the print dialog.
- About, Imprint and Privacy pages.
- A full accessibility audit.

Version 2 plans these.

## Run it

```
npm install
npm run dev        # dev server on http://localhost:5173
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end test (Playwright)
npm run build      # type-check and build to dist/
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

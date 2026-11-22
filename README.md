# fingerscore

Turns a song file into sheet music with a fingering chart under every note, for woodwinds. It runs in the browser only. Nothing leaves your machine.

This is version 1. It answers one question: does the path from a song file to a playable, printable sheet with correct fingerings work on real files?

## What version 1 does

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

### Rhythm rules

- Meters: 4/4, 3/4, 2/4 and 6/8. One meter per song. Any other meter, or a meter change inside the song, is refused with a message.
- Note lengths: whole down to sixteenth, with dotted values. Longer lengths that fit no single value become tied notes.
- Triplets and notes shorter than a sixteenth are rounded to the sixteenth grid. The "Detected in file" card says so.

## What version 1 does not do

- Edit notes, lyrics or chords. No undo.
- Save songs, keep a library, or import and export JSON.
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

Every fingering comes from published charts. Where charts disagree and no common fingering exists, the app shows no chart for that note. It never guesses.

No owner has reviewed any table yet.

| Kind | Sources | Reviewed |
|---|---|---|
| Xaphoon | Official Xaphoon chart; "The Water Is Wide" songbook page | no |
| Saxophone | The Woodwind Fingering Guide; Sax Teacher UK saxophone and altissimo charts | no |
| Clarinet | The Woodwind Fingering Guide; Tomplay clarinet chart; Sax Teacher UK clarinet chart | no |
| Flute, piccolo, alto flute | The Woodwind Fingering Guide; Tomplay flute chart; Sax Teacher UK flute chart; flutetunes.com | no |
| Recorder (baroque) | The Woodwind Fingering Guide; Dolmetsch Online; Tomplay recorder charts | no |
| Recorder (German) | The Woodwind Fingering Guide; Wikipedia (en, de) citing Rowland-Jones and Linde | no |

Source titles, URLs and access dates are in the `meta` block of `src/data/fingerings.json`.

Known gaps, with the sources checked for each, are in [docs/fingering-gaps.md](docs/fingering-gaps.md). Its section "Waiting for the owner" lists the gaps inside the normal range, such as flute C4 and four German recorder notes. A player who knows the right fingering can settle them.

## Credits

- Treble clef, accidentals and rests: outline paths from GNU FreeSerif.
- Fingerings: The Woodwind Fingering Guide, plus the other charts listed above.
- Typeface: Atkinson Hyperlegible by the Braille Institute.

## Hosting

Do not host version 1 publicly. German law requires an Imprint, and that page arrives in version 2.

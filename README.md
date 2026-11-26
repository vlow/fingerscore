# fingerscore

Turns a song file into sheet music with a fingering chart under every note, for woodwinds. It runs in the browser only. Nothing leaves your machine.

Version 1 answered one question: does the path from a song file to a playable, printable sheet with correct fingerings work on real files? Version 2 adds saving and files, then editing with undo and redo, then a Scales page: any scale in any key with a fingering chart under every note, then MuseScore and ABC import, then a PDF download, then jump marks (D.C., D.S., Segno, Coda, Fine).

## What it does

- Reads MIDI, MusicXML, MuseScore and ABC files. See "Formats" below.
- Finds the melody track and lets you pick another one.
- Suggests a key where every note fits your instrument's range. You can shift by semitones or octaves.
- Flags notes outside the range.
- Draws the sheet and a fingering chart under every note, in compact or full key map style. Recorders come in baroque and German systems.
- Offers alternate fingerings where published charts list them. You pick one per note.
- Plays the sheet aloud: Listen and Stop, tempo slider, repeats, first and second endings, jump marks, highlight on the current note.
- Play mode for playing from the screen: only the sheet, full screen. Pages turn with the arrow keys, Space, Page Up/Down (a Bluetooth pedal sends these), the toolbar or a tap on the screen edge. Auto-scroll (A) keeps the music about a third down the screen at the pace of the tempo; the speed slider goes from 25 % to 150 %. A− and A+ set the size; the sheet is never wider than the screen. The screen stays awake. Esc exits.
- Shows jump marks: Segno, Coda, Fine, "To Coda" and the six jumps D.C., D.C. al Fine, D.C. al Coda, D.S., D.S. al Fine and D.S. al Coda. Reads them from MusicXML, MuseScore and ABC, plays the form they name, edits them with undo, and names marks that do not add up in a notice. See "Jump marks" below.
- Downloads the sheet as a PDF (File, then Download PDF). See "PDF" below.
- Prints the sheet (A4, paper only) through the browser's print dialog.
- Shows scales with fingerings on a Scales page, linked from the header. Pick an instrument and one of eight scales (major, natural, harmonic and melodic minor, major and minor pentatonic, blues, chromatic) in any of twelve keys; the key with six accidentals comes in both spellings (F♯ and G♭ major, D♯ and E♭ minor). Choose one octave, two octaves or the whole range, up or up and down. Letters follow the scale degrees, except that a double sharp or double flat is written as the plain neighbouring note (A♮ instead of B𝄫). On transposing instruments you name keys by what you read or by what sounds. Notes with more than one fingering get the same "⇅" pill as on a sheet: pick another fingering and the neighbouring notes adapt; "Reset all to auto" undoes your picks, and a change of instrument, scale, key, range, direction or recorder system clears them. Optional: alternate fingerings under each note, note names. Download the scale as a PDF (A4 or Letter, by browser region, like the sheet PDF) or print it (A4, the scale only, with your picks). The page remembers your settings and picks in this browser.
- Has four text pages, linked from the footer: Terms (/terms), Imprint (/imprint), Privacy (/privacy) and About (/about). Their personal details come from `src/content/operator.ts`, which holds the owner's details. A notice at the start-page drop zone, in the library view of "Your sheets" (beside Import…) and in the File menu links to Terms.
- Covers 12 instruments: Xaphoon, saxophones, clarinet, flutes, recorders.
- Ships a sample song, Auld Lang Syne. Regenerate it with `npm run demo`.

### Formats

| Format | Extensions | Notes |
|---|---|---|
| MIDI | `.mid`, `.midi` | Carries no jump marks. |
| MusicXML | `.musicxml`, `.xml`, `.mxl` | Reads jump marks. |
| MuseScore | `.mscz`, `.mscx` | Versions 2, 3 and 4. Reads lyrics, chord symbols, repeats, endings and jump marks. |
| ABC | `.abc` | First tune, first verse. Reads lyrics, chord symbols, repeats, endings and jump marks. |

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
- Text in quotes counts as a chord symbol only when it looks like one. "D.C." and "A tempo" are ignored. Jump marks are read from decorations only (see "Jump marks").
- A shortened bar before a repeat sign or an ending keeps its notes at the start. A pickup inside the tune is placed at the end of its own bar. Two short bars that make one full bar, as at a repeat sign, and a short last bar stay as written.
- A bar longer than the meter is taken as written.
- Voice names come from the `V:` lines in order.
- A syllable on the second note of a tie is not shown.
- Only the first tune of a file and the first verse of lyrics are read.
- A change of meter is refused.

### Editing

A mode switch above the sheet has four modes: View, Edit notes, Lyrics and Chords. Click a note or rest to select it. The panel for the mode opens under that system. Esc clears the selection.

- **Edit notes:** change the pitch by semitone or octave. Set the length from sixteenth to whole, with a dot. Tie a note to the next note of the same pitch. Turn a note into a rest and back. Turn an eighth, quarter or half note or rest into a triplet and back. Add a bar after the selected one, or remove it. Every bar keeps its full length. The section "Bar" sets the jump marks of the bar the note is in (see "Jump marks").
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
| Enter, Space | Every mode, sheet focused | Listen from the selection, or stop playback |
| Esc | Every mode | Clear the selection |
| ↑ / ↓ | Edit notes, sheet focused | Semitone up or down |
| Ctrl/⌘+↑ / ↓ | Edit notes | Octave up or down |
| A–G | Edit notes | Jump to that note name, nearest to the current pitch |
| 2 3 4 5 6 | Edit notes | Sixteenth, eighth, quarter, half, whole; inside a triplet, the triplet values that fit |
| . | Edit notes | Dot |
| P | Edit notes | Triplet: make three equal notes, or undo the group |
| R | Edit notes | Note or rest |
| T | Edit notes | Tie |
| Delete, Backspace | Edit notes | Turn into rest |
| Tab | Lyrics and Chords, sheet focused | Go into the Lyric or Chord field |
| Enter, Tab | Lyric or Chord field | Next note (Lyrics) or next event (Chords) |
| Shift+Tab | Lyric or Chord field | Previous note or event; at the first one, back to the sheet |
| Esc | Lyric or Chord field | Clear the selection |

The Edit notes keys follow the key's position on layouts without Latin letters, and on French AZERTY the digits and the dot work with Shift.

### Triplets

Import:

- Eighth, quarter and sixteenth triplets are imported from MIDI, MusicXML, MuseScore and ABC. A group shows the number 3, with a bracket when one beam does not join its notes.
- A sextuplet shows as two triplets of sixteenths.
- A triplet position must be exact: within 0.005 of a quarter. Written tuplets and MIDI files exported from notation software are exact. This matters for MIDI files played by hand: their triplets stay rounded to the sixteenth grid.
- A MIDI file with a resolution that cannot hold an exact third, for example 100 ticks per quarter with the lengths added up, has that triplet rounded.
- A triplet is recognised only when every note of the figure starts and ends exactly, and so does every note that starts or ends on the figure's edges. One loose note rounds the whole figure.
- Groups of five or seven and half-note triplets are rounded, and the song shows the "Rhythm simplified" notice.
- A MIDI file exported with swing playback has its eighths in a 2:1 ratio. The sheet shows a triplet quarter and a triplet eighth on every beat. MusicXML, MuseScore and ABC carry written values and are not affected.

Editing:

- In Edit notes, the Triplet button or the key P works on a note or a rest of eighth, quarter or half length that starts where a group may start: an eighth on any sixteenth, a quarter on any eighth, a half on any quarter of the bar. It turns a note into three equal notes and a rest into three rests. The same button or key turns the group back into one note or rest.
- Inside a triplet the Length buttons offer the values that fit and keep the group whole, and the dot is off.

Width: a 4/4 bar with eighth triplets needs about a third more width than a plain bar, so a line holds two or three bars. A bar with triplet sixteenths usually fills a line.

### Jump marks

Marks: Segno and Coda (signs at the start of a bar), Fine and "To Coda" (words at the end of a bar), and one jump at the end of a bar: D.C., D.C. al Fine, D.C. al Coda, D.S., D.S. al Fine or D.S. al Coda.

Import:

- MusicXML: the `sound` attributes, the `segno` and `coda` elements and the direction words. A mark belongs to the measure it is written in. Only a segno or coda in a right barline belongs to the next measure.
- MuseScore 2, 3 and 4: the `Marker` and `Jump` elements.
- ABC: the decorations `!segno!`, `!coda!`, `!fine!`, `!dacoda!` (the "To Coda"), `!D.C.!`, `!D.S.!`, `!dacapo!`, `!D.C.alfine!`, `!D.C.alcoda!`, `!D.S.alfine!` and `!D.S.alcoda!`. A decoration on a bar line gives a Segno or Coda to the next bar and any other mark to the bar before. Quoted text is not read.
- A form outside the six, a second sign of a kind and a mark behind the last note are left out. The import message and the notice above the sheet say which.

Play order:

- Playback follows repeats and endings until the jump. It takes the jump once, at the end of its bar, after the repeat of that bar.
- D.C. returns to the first bar (the pickup bar counts). D.S. returns to the Segno.
- "al Fine", and a plain D.C. or D.S. in a song with a Fine, stop at the end of the Fine bar. "al Coda" continues at the Coda from the end of the "To Coda" bar and plays to the end. A plain jump without a Fine plays to the end.
- After the jump no repeat is taken in the music already played, and of a group of endings only the last is played. The Coda and anything after the jump bar are played with their repeats and endings.
- A tie does not carry across the jump or from the "To Coda" to the Coda.
- The highlight follows the same order.

Editing: in Edit notes the section "Bar" has the toggles Segno and Coda ("Start"), Fine and To Coda ("End"), and the select "Jump at the end of the bar". A second mark of a kind moves the first. Each toggle is one undo step. Changes of the jump select on one bar within 1.5 s of each other are one undo step, so typing through "D.C." to "D.C. al Fine" is one step; a change on another bar, a toggle or another edit starts a new step. Each change is announced ("Bar 16: D.S. al Coda").

Notice: when marks do not add up, an amber notice above the sheet names the problem, for example "D.S. al Coda in bar 16 needs a Segno. Playback ignores the jump." The marks stay on the sheet and playback runs straight through. The notice names: a D.S. without a Segno; an "al Coda" without a "To Coda" or a Coda, or with the Coda before the "To Coda"; the Coda and the "To Coda" in one bar; a Coda at or before the jump bar; an "al Fine" without a Fine; more than one jump, Segno, Coda, Fine or "To Coda"; a Segno, Fine or "To Coda" after the jump bar; a Fine or "To Coda" in the jump bar; a Fine before the Segno of a D.S.; a "To Coda" before the Segno of a D.S. al Coda; a Segno, Fine or "To Coda" in an ending that the jump skips (endings after the jump bar play as written, so a Coda there is no problem); a jump in an ending or repeated section that is never taken; and a jump inside a repeated section, before the section's end. A song without a jump has no such notice. A mark that the jump does not use (a Fine in an "al Coda" song, a Segno in a D.C. song) is drawn, not played, and gives no notice (a Fine, "To Coda" or Segno after the jump bar is named, as listed above). The notice also lists the marks the import left out, also when the song has no jump; the list goes with the first edit of a mark or of the bars, because its bar numbers would be out of date.

Drawing: a system stacks only the bands the sheet uses, from top to bottom: the marks (30 px, when the sheet has a mark), chord symbols (22 px), lyrics (24 px), ending brackets (14 px) and the headroom above the staff. A chord band is there when a chord symbol is drawn anywhere on the sheet, a lyric band when a lyric is, an ending band when a bar has an ending. Lyrics mode and Chords mode stack their band as well, so there is room to type; leaving the mode takes it away again, and print, the PDF and play mode never stack a band the Show switches leave empty. The headroom is 15 px or the height of the highest thing a note draws (head, accidental, ledger line, stem, beam, flag, dot, tie, triplet mark) plus 4 px, whichever is more. All systems of a sheet have the same height; a sheet with no chord, lyric, ending or mark has systems of 236 px (230 px when it has one system: the headroom of such a sheet also holds the bar number of the second system and later ones), one that uses every band and has no high note 290 px (320 px with marks). The marks stand on top of the stack, directly above the headroom on a sheet without the other bands. Whatever changes the height of the systems (a mode, a Show switch, undo, an edit that adds or removes a chord, lyric, ending or mark, a high note) keeps the selected note, or else the first system on screen, where it is on the screen. The alternate-fingering popover loads at the first click on a pill. The PDF and print show the marks; in the PDF the texts are searchable and the signs are outlines.

Not done:

- Double Segno, double Coda and D.S.S.
- Quoted text in ABC ("D.S. al Coda" above a note).
- Jump marks from MIDI files.
- Repeat signs and ending brackets are import-only; they cannot be edited.
- Play mode's auto-scroll moves at a steady pace. It does not follow repeats or jumps.
- The time shown on the Tracks page comes from the file and ignores repeats and jumps.

### Saving and files

- Save keeps the sheet in your browser's local storage. Press the Save button or Ctrl/⌘+S. The sheet page shows "Not saved yet", "Unsaved changes" or "Saved".
- Sheets live only in this browser on this device. Clearing site data deletes them.
- The start page shows your five newest sheets under "Your sheets" as one line of music: each bar holds a title, the first six notes, the instrument and when you saved it. Open opens the sheet, Play opens it in Play mode. The bin asks "Delete?" first, and Undo brings a deleted sheet back for a few seconds.
- "All N" turns the strip into the library view: search titles and instruments, sort by save time, title or instrument, and filter by instrument family. Close returns to the strip.
- To back up a sheet or move it to another computer, choose File, then Download JSON. Open it there with File, then Open JSON file…, or drop it on the start page. The start page drop zone takes songs (MIDI, MusicXML, MuseScore, ABC) and saved-sheet files (.json).
- To back up or move every sheet at once, open the library view and choose Export all as JSON. It downloads `fingerscore-library.json`. Import… in the library view, or the start page drop zone, adds every sheet of that file under a new id; importing the same file twice adds the sheets twice.
- The File menu also lists your saved sheets.

A sheet file is `{ app, format, savedAt, title, doc }`. A library file is `{ app, format, kind: "library", savedAt, sheets }`, with `{ title, inst, key, fam, savedAt, doc }` per sheet. The app validates every file on import and refuses anything else; a library import skips damaged sheets and says how many. No compatibility promise holds before the public release: a later version may change the format and reject older files.

### PDF

File, then Download PDF, makes a PDF of the sheet. The Scales page has a Download PDF button next to Print. The PDF is made in your browser. Nothing is uploaded.

- **Contents:** a sheet has the title block, every system with its fingering charts, and the legend. A scale has its caption, every line and the legend. The sheet is drawn with your Show settings. A scale is drawn with your picks. A PDF of two or more pages has a footer on every page: `{title} · page {n} of {N}` (the caption for a scale, and `page {n} of {N}` for an untitled sheet).
- **Paper:** the same for a sheet and a scale: A4 (210 × 297 mm). US Letter (215.9 × 279.4 mm) when the first language of the browser has the region US or CA. Margins are 12 mm. There is no setting.
- **Layout:** a system or a scale line is never split across pages. A scale line with many stacked alternate fingerings that does not fit on the rest of a page starts a new page, which can leave white space. When the legend would stand alone on the last page of a sheet or a scale, the page before it is scaled down by up to 8% and centred so that the legend fits; if that is not enough, the legend gets a page of its own.
- **Text:** the PDF embeds Atkinson Hyperlegible Regular, Bold and Bold Italic (SIL Open Font License, text in `src/pdf/fonts/OFL.txt`). Lyrics, chord symbols and titles can be searched and copied. The symbols ♭ ♯ ♮ 𝄫 𝄪 ♩ Δ ‿ ● ○ ◐ are drawn as shapes, not as text: a search for "Bm7" finds the chord, a search for "B♭" finds nothing, and copying "C♯m7♭5" gives "Cm75".
- **Characters:** the PDF supports Latin and extended Latin letters (such as ł, ő, č, ř, š, ž) and the eleven symbols above. If a title, lyric or chord uses any other character, for example Cyrillic or Greek letters, no PDF is made. The red message line lists up to 12 of the characters and says "Use Print instead". Print draws them with the fonts of the browser.
- **File name:** `{title}-{instrument}.pdf` for a sheet, `{key}-{scale}-{instrument}.pdf` for a scale, for example `auld-lang-syne-alto-sax.pdf` and `c-major-alto-sax.pdf`. Each part is lower case. Accented letters become plain letters (`Žluťoučký kůň` gives `zlutoucky-kun`). A sharp or flat sign after a letter A to G is written as a word (`F♯ major` gives `f-sharp-major`, `B♭ Blues` gives `b-flat-blues`), so that F♯ major and F major get different names. Other characters become `-`. A part is cut at 80 characters. An untitled sheet uses `sheet`. The JSON file name follows the same rule.
- **Loading:** the PDF code and the six font files load when you first click Download PDF, not with the app. If they cannot load, the red message line shows the load message. Another failure shows "The PDF could not be made. Use Print instead." `npm run check:bundle` fails when the shell or a page holds the PDF libraries (see "Loading").
- **Progress:** the File menu entry reads "Preparing PDF…" and is disabled while the PDF is made. For a PDF of more than 10 pages the page announces "Preparing PDF, page {n} of {N}" at every 10th page and at the last. A sheet of 2000 bars makes about 125 pages. Leaving the page or opening another sheet stops the work and nothing is downloaded.
- **Print:** unchanged. It stays in the File menu and next to Download PDF on the Scales page.
- **Phones:** a browser that shows a PDF in a tab instead of saving it does so for this file too.

### Loading

The MIDI, MusicXML, MuseScore and ABC readers load when you first drop a file of that format. If the download fails, the drop zone shows the load message and "Try another file"; choosing the file again retries (checked in Chromium).

The PDF code and fonts load on the first click of Download PDF (see "PDF"). Play mode loads when you first open it; until the code arrives the sheet stays in its normal view, and if it cannot load the page shows "Play mode could not be loaded. Reload the page and try again." Every page loads on demand. A first visit downloads the shell and the code of the page at that address, both at once: a script in `index.html` preloads the page's files while the shell arrives, and the page shows with the header, without an empty frame in between. A link starts loading its page when the pointer enters it or it gets focus. The editing panels load when you first need them. If one fails to load, for example after a dropped connection or a new release, the app shows "This part of fingerscore could not be loaded. Check your connection and reload the page." with a Reload button. The header and the rest of the app keep working.

### Bundle layers

The build has three layers. `npm run check:bundle` measures each after a build, in brotli bytes, and fails when one is over its limit in `bundle-budget.json`.

- **Shell:** the code every visitor downloads first: `src/shell/` (header, footer, theme, router, route table), React, React Router and zustand. 55,230 bytes today, limit 61,440. The check fails when any other module ends up in the shell and names the import chain that pulled it in.
- **Routes:** one per page, the page's own code beyond the shell. The sheet page is the largest: 64,754 bytes, limit 81,920.
- **Features:** code a page loads with `import()`: play mode, the panels, the popover, the file readers, the PDF engine.

A new route or feature without its own entry in `bundle-budget.json` gets `routeDefault` or `featureDefault`. `npm run check:bundle -- --propose` prints limits from the current sizes (the shell plus 10 %, every other layer plus 25 %); copying them into `bundle-budget.json` is the owner's decision.

**Adding a feature.** Code outside `src/shell/` stays out of the first download as long as the shell does not import it. To load a component on first use, declare it once: `const Panel = lazyView(lazyModule(() => import('./Panel').then(m => m.default)))` (`src/shell/lazy.tsx`). Spread `intentProps(module)` on the control that opens it to start the download on hover or focus.

### Rhythm rules

- Meters: 4/4, 3/4, 2/4, 2/2 (cut time) and 6/8. One meter per song. Any other meter, or a meter change inside the song, is refused with a message.
- Note lengths: whole down to sixteenth, with dotted values. Longer lengths that fit no single value become tied notes.
- Notes shorter than a sixteenth and tuplets other than triplets are rounded to the sixteenth grid. So are half-note triplets and loosely played MIDI triplets (see "Triplets"). The "Detected in file" card says so.
- Keys: major, minor, Dorian, Phrygian, Lydian, Mixolydian and Locrian, named in full ("D Dorian"). ABC and MusicXML give the mode. MIDI and MuseScore do not, so the key finder picks major or minor.

## What it does not do

- Editing repeats and endings, or changing the time signature, or the key signature other than by transposing.

Later versions plan these.

Not planned yet: insert mode, copy and paste, selecting several notes, and more than one verse of lyrics. What jump marks leave out is listed under "Jump marks".

There is no sync between browsers or devices, and none is planned: the app has no server and sends no user data over the network. To move a sheet, use File, then Download JSON, and open the file on the other device.

## Checks

Three end-to-end files test the finished app in Chromium. All run in CI on every push with the other end-to-end tests.

### Acceptance: `e2e/acceptance.spec.ts`

23 tests, about 55 s on a laptop (test times add up to 54.2 s in one full run). A01 to A12 are the 12 checks of the handoff (SPEC section 16), in its order. V01 to V11 are checks for version 2:

| Test | Covers |
|---|---|
| V01 | MuseScore import: key, time signature, tempo, lyrics, chord symbols; the title comes from the file name |
| V02 | ABC import in D Dorian: signature and mode |
| V03 | Cut time: import and playback speed |
| V04 | Triplets: import, make, change, undo |
| V05 | Sheet PDF: pages, title, lyrics and chord letters as text |
| V06 | Scale PDF: name and one chart per note |
| V07 | Scales: G♭ and F♯ major, the natural sign in E♭ blues |
| V08 | Alternate fingerings: automatic choice, manual choice after a reload |
| V09 | The four pages from the footer; the import notice links to the terms |
| V10 | No request leaves the origin on the core path |
| V11 | Jump marks: a tune with Segno, To Coda, Coda and D.S. al Coda is imported, drawn and played in the order 1 2 3 4 5 6 2 3 4 7 8; a D.C. al Fine and a Fine are set by keyboard and undone; the PDF holds the text "D.S. al Coda" |

The shipped sample is "Auld Lang Syne"; the handoff's numbers describe "The Water Is Wide". So A01, A02, A03 and A05 pin the sample's values. Unit tests pin the handoff's own numbers for checks 1, 2, 3 and 5 on the handoff song: `src/domain/transpose.test.ts` (checks 1, 2, 3), `src/domain/playback.test.ts` (check 5) and `src/pages/SheetPage.test.tsx` (check 2). `src/acceptanceIndex.test.ts` fails unless each of the 23 numbers appears once; it guards D01 to D06 of the dark mode file in the same way.

Run one check by its number:

```
npx playwright test e2e/acceptance.spec.ts -g "A05"
```

### Dark mode: `e2e/dark-mode.spec.ts`

6 tests, about 15 s on a laptop (one run took 14.8 s). `src/noFlash.test.ts` runs the inline script of `index.html` that sets a chosen theme before the first paint. D01 to D06 are the six checks of the dark mode handoff (DARKMODE.md section 8), in its order:

| Test | Covers |
|---|---|
| D01 | A first visit on a dark system is dark when the page has loaded; the page follows the system live; on a light system the sheet is white |
| D02 | Light and Dark from the header survive a reload and override the system; System follows it again |
| D03 | In dark mode none of the 21 states shows a colour that only the light theme has |
| D04 | The sheet is on Night paper; Dimmed and Sepia apply at once and survive a reload; a paper change is no edit; Play mode and Scales use the same paper |
| D05 | The PDF made in dark mode has the colours of the one made in light mode; print shows white paper and dark notes on all three papers, also under System on a dark system |
| D06 | The accessibility scan passes on the sheet with out-of-range notes on Night, Dimmed and Sepia paper, and on Play mode and Scales on Dimmed and Sepia |

The theme is System, Light or Dark. System is the default and follows the device. The choice is kept in the browser under `fingerscore.theme`, the paper under `fingerscore.paper`. Every colour is a token in `src/styles/tokens.css`; `src/colourLiterals.test.ts` fails on a colour written anywhere else under `src`, except the PDF's light palette (`src/render/palette.tsx`) and the PDF development page.

### Accessibility: `e2e/accessibility.spec.ts`

The file has 118 tests and takes about 119 s on a laptop (test times add up to 118.9 s in one full run). Each of 21 states is opened from empty storage: start (empty, one saved sheet, library, refusal), Tracks, the sheet in View, Edit notes with a note selected, Edit notes with the jump notice (a D.S. without a Segno), Lyrics and Chords, the out-of-range banner, the alternate-fingering popover, the File menu and the PDF message, Play mode, Scales (default and popover), and the four text pages. Every state gets:

- **Scan:** axe-core with the rule sets `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa`, once in light mode and once in dark mode. Zero findings are required.
- **Target size:** 36 × 36 px for every control, 44 × 44 px for primary actions and the header navigation. The test measures the area that takes the click, by asking the browser which element sits at four points near the corners of the required box. A link inside a sentence is exempt; a menu item is not. On the paper, a note and an alternate-fingering pill are held to 24 px: a pill must stay under its note, and pills where notes sit close are 26 px apart, so a larger click area would reach the next pill. A note must be at least 24 px high. Its width follows the note spacing: it measured 31 px at the narrowest, once, on the sample, and the test asserts at least 16 px wide and 24 px high.
- **Focus:** every Tab stop shows a mark with at least 3:1 contrast against its surroundings. The walk starts at the first control of the page and, when it leaves the page, its last stop is the last control. In the File menu the walk uses ArrowDown and visits every item.

Further tests:

- **Keyboard only:** from the instrument to Play mode with no mouse click, including Esc returning focus to the control that opened a menu or popover.
- **Announcements:** refusals and the PDF's unsupported-character message are alerts; save status and PDF progress are status messages; selecting a note announces its pitch, length and bar; the paper's description names title, instrument and key.
- **Reduced motion:** with the system setting on, a page turn jumps within one frame; without it, the turn glides.
- **Narrow screens:** at 320 × 640, 768 × 1024 and 1024 × 768 no state scrolls sideways.
- **Names:** a button's accessible name starts with its visible text, then says what it does: "−8 Octave down", "−1 Semitone down", "+1 Semitone up", "+8 Octave up", "3 Triplet", "A− Smaller", "A+ Larger". The visible text is real text, not generated by CSS.
- **Click areas on the paper:** the densest stretch, the last bar of a system and the edge of an alternate-fingering pill (12 px right of its centre opens its own popover). In a bar of four eighth notes and a half, each pill sits nearer to its own note than to any other.

There is no exclusion from any rule. Run one state with `npx playwright test e2e/accessibility.spec.ts -g "sheet-file-menu"`. `A11Y_SHOTS=<absolute folder>` saves a picture of each state there; a relative path stops the run.

### SonarCloud: zero open issues

`main` has no open SonarCloud issue, and nothing merges into it with one. The free plan's quality gate cannot be set to zero, so the repository keeps the rule itself. Every push runs the SonarCloud job: it fails when the quality gate fails, and then `scripts/check-sonar.mjs` fails it on any open issue of the pushed branch, of any type or severity. Check a branch by hand with `SONAR_BRANCH=<branch> node scripts/check-sonar.mjs`. Push, check and fix until it prints `no open issues`. An issue whose fix would make the code harder to maintain or to read is proposed to the owner as "won't fix", with the reason; `CLAUDE.md` gives the loop and the exception.

### Not tested

- A real screen reader (VoiceOver, NVDA, TalkBack).
- A real phone.
- Browsers other than Chromium.

## Run it

```
npm install
npm run dev        # dev server on http://localhost:5173
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright), including the two suites under "Checks"
npm run build      # type-check and build to dist/
npm run check:bundle  # after a build: brotli size of each layer within bundle-budget.json, only shell code in the shell
npm run demo       # regenerate the sample MIDI file
npm run notices    # write third-party-packages.json, the list of packages in the build; add -- --check to compare without writing
npm run check:release  # before publishing: build, bundle budget, package list, and the owner's details (see "Hosting")
npm run icons      # regenerate favicon.ico and the app icons in public/ from brand/
```

`npm run test:e2e` starts its own dev server from this checkout on port 5179; it never reuses a running one, so `npm run dev` on 5173 can stay open. If port 5179 is taken, the run stops with an error. If Playwright reports a missing browser, run `npx playwright install chromium` once.

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
- Typeface: Atkinson Hyperlegible by the Braille Institute, SIL Open Font License 1.1.
- PDF: [jsPDF](https://github.com/parallax/jsPDF) and [svg2pdf.js](https://github.com/yWorks/svg2pdf.js), both MIT.
- Licences of every package in the build and both fonts: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). The app serves the same text as `third-party-notices.txt`. The list of packages is in `third-party-packages.json`; `npm run notices` rewrites it.

## Hosting

Do these steps before the site goes public.

1. Fill in `src/content/operator.ts`. Every value that starts with `TODO:` is a placeholder. There are eleven: name, address, email, phone, responsibleForContent, hostName, hostAddress, logRetention, aboutLead, authorBio and story. The repository address is optional and lives in `src/content/repository.ts`; set it there once the repository is public.
2. Have a lawyer read the Terms, Privacy and Imprint pages. Ask whether the notice at the start-page drop zone, in the library view of "Your sheets" (beside Import…) and in the File menu is enough, and whether German versions are needed.
3. Run `npm run check:release`. It builds the app, checks the bundle budget, compares `third-party-packages.json` with the build, and lists every placeholder that is left. It exits 1 until all eleven are filled in.
4. Set up nginx and deploy, as below.
5. Host the app at the root of a domain. A sub-path such as `example.org/fingerscore/` needs a Vite `base` and a router `basename`. Neither is set.

### nginx

The app is static files. nginx serves them with the rules in `deploy/nginx/fingerscore-locations.conf`, which CI's `nginx` job tests on every push:

- **Hashed files under `/assets/`:** cached for a year (`immutable`). A missing one is a 404.
- **`index.html`:** checked on every visit; unchanged, it costs a 304. The app's paths (`/sheet`, `/tracks`, …) answer with it.
- **Other files** (icons, the manifest, the demo song): cached for a day.
- **Compression:** the build writes a brotli and a gzip copy of every text file. nginx sends the smallest one the browser accepts and compresses nothing itself.

Install nginx and the brotli module from Ubuntu's or Debian's archive:

```bash
sudo apt install nginx libnginx-mod-http-brotli-static
```

Without the module, delete the `brotli_static` line in `fingerscore-locations.conf`; nginx then sends gzip.

Copy `deploy/nginx/fingerscore-locations.conf` to `/etc/nginx/` and `deploy/nginx/fingerscore.conf` to `/etc/nginx/sites-enabled/`. Fill in its `TODO:` lines (domain, certificate, site folder), then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Deploy

Each deploy is three steps, run from the checkout after `npm run build`. `<host>` is the server, `<site>` the folder nginx serves, and `<releases>` a folder beside it for the release lists.

Copy the build. Without `--delete`, so a tab opened before the deploy still finds its old files:

```bash
rsync -r --checksum dist/ <host>:<site>/
```

Record which files this release uses:

```bash
scp build-report/release-files.txt <host>:<releases>/$(date -u +%Y%m%dT%H%M%SZ).txt
```

Delete files no release of the last 30 days uses. Add `--dry-run` first to see the list:

```bash
ssh <host> 'bash -s' -- <site> <releases> < deploy/prune-assets.sh
```

### Cloudflare (optional)

The free plan can sit in front of nginx with no change here. It caches `.js`, `.css` and font files at its edge and passes `index.html` through to nginx, so the server mostly answers 304s. Leave "Browser Cache TTL" at "Respect Existing Headers".

Check once the domain is live, replacing `<domain>` and `<vendor file>` (the `vendor-*.js` name in `dist/assets/`):

1. `curl -sI -H 'Accept-Encoding: br' https://<domain>/assets/<vendor file>`, twice. The second answer shows `cf-cache-status: HIT`, `content-encoding: br` and `cache-control: public, max-age=31536000, immutable`.
2. `curl -sI https://<domain>/` shows `cf-cache-status: DYNAMIC` or `BYPASS`, and `cache-control: no-cache`.
3. Read the free plan's current terms on bandwidth. Cloudflare's CDN terms restrict video and other large files, not a site's scripts and fonts; this was not confirmed against the plan's bandwidth limits.

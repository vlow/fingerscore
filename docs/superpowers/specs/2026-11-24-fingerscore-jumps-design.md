# fingerscore: D.C., D.S., Segno, Coda and Fine

Date: 2026-11-24. Audience: the owner, who approves it, and the builder, who plans from it.

## 1. Purpose

Songbook tunes often end with an instruction such as "D.C. al Fine" or "D.S. al Coda". Today the importers drop these marks without a word: the sheet shows nothing, and playback runs straight through. A player who follows the sheet or the playback then plays the wrong form.

This part makes the marks part of the sheet: imported, drawn, played, printed, and editable.

## 2. Goals, non-goals, anti-goals

**Goals** (owner's decisions of 2026-11-24)

- The six common jumps: D.C., D.C. al Fine, D.C. al Coda, D.S., D.S. al Fine, D.S. al Coda. With them the marks Segno, Coda, Fine and "To Coda".
- Import from MusicXML, MuseScore 2 to 4, and ABC.
- Playback and the playing highlight follow the jump. Repeats are not taken again after a jump.
- The marks appear on the sheet, in print and in the PDF.
- The marks can be added, changed and removed in the editor, with undo.
- A song whose marks do not add up keeps its notes; the jump is not played and a notice says why.

**Non-goals**

- Double Segno, double Coda, "D.S.S." and other rare forms. They are dropped at import with a notice.
- A setting for "repeats after the jump". They are never taken.
- Editing of repeat signs and ending brackets. They stay import-only, as today.
- Jumps on the Scales page. MIDI files carry no such marks.

**Anti-goals**

- A mark that is drawn but not played, or played but not drawn. Sheet, playback and PDF must agree.
- A silent drop. Whatever the app cannot honour is named in a notice.
- A play order that never ends. Every jump is taken at most once.

## 3. Constraints

- Everything loaded at page start stays at or under 410,000 bytes (the limit since dark mode). It is 405,390 now, and the model, the play order and the drawing all load at start. The marks need an estimated 6,000 to 9,000 bytes. So room is made first (section 5.8).
- The marks take their colours from the renderer's palette, so they follow the dark papers; the PDF keeps the light palette.
- Saved sheets keep opening. The new fields are optional; a sheet without them has no marks. No migration.
- The accessibility checks keep requiring zero findings with no exemption: new controls have a 36 px click area, a name, a focus mark and keyboard access.
- The pipeline's rules apply: code under `src` comes with unit tests; no test depends on macOS rendering; fixtures are self-made.
- Symbols come from Bravura as outlines, like the symbols drawn today. No font file is shipped.

## 4. Approaches

**Where the marks live**

1. **On the bar** (chosen): optional fields beside the repeat and ending fields the bar already has. Import, drawing and play order all work per bar today.
2. A separate list of marks with bar numbers. Every bar insertion and removal would have to renumber it.
3. On notes. The marks belong to barlines, not to notes.

**How playback learns the form**

1. **The play order is computed from the marks** (chosen), in the one function that already follows repeats and endings.
2. Unrolling the song at import into a straight run. The sheet would no longer match the songbook, and editing would touch copies.

## 5. Design

### 5.1 Model

A bar gains five optional fields:

- `segno` and `coda`: the sign stands at the start of the bar.
- `fine` and `toCoda`: the instruction stands at the end of the bar.
- `jump`: one of `dc`, `dcFine`, `dcCoda`, `ds`, `dsFine`, `dsCoda`, at the end of the bar.

Everything that copies or compares bars carries the new fields: saving and loading (`src/domain/persistence.ts` rebuilds each bar from known fields), the JSON file, undo, and the check that decides whether playback must be rebuilt. The sheet's `source` gains an optional list of marks the import dropped (5.4).

### 5.2 Play order

- Until the jump the song plays as today: repeats and endings are followed, and Fine and "To Coda" are passed over.
- The jump is taken at the end of its bar, once. If that bar also ends a repeat, the repeat is played first and the jump is taken when the bar is reached the last time.
- Playback continues at the first bar (D.C.), which includes a pickup bar, or at the Segno bar (D.S.).
- After the jump no repeat is taken in the music already played, and of a group of endings only the last one present is played (ending 2 where the song has endings 1 and 2). The Coda and anything after the jump bar are played with their repeats and endings.
- "al Fine", and a plain D.C. or D.S. when the song has a Fine: playback stops at the end of the Fine bar.
- "al Coda": at the end of the "To Coda" bar, playback continues at the Coda bar and runs to the end.
- A plain D.C. or D.S. without a Fine runs to the end of the song.
- A tie does not carry across the jump or across the step from "To Coda" to the Coda.

### 5.3 Marks that do not add up

One function lists the problems of a document:

- D.S. without a Segno.
- "al Coda" without a "To Coda" or without a Coda, or with the Coda before the "To Coda".
- "al Fine" without a Fine.
- More than one jump, Segno, Coda, Fine or "To Coda".
- A Segno after the jump bar; a Fine or a "To Coda" after the jump bar; a Fine before the Segno of a D.S.
- A Fine or a "To Coda" in the jump bar itself.
- A "To Coda" before the Segno of a "D.S. al Coda".
- The Coda and the "To Coda" in one bar; the Coda at or before the jump bar, because the jump never reaches it.
- A Segno, a Fine or a "To Coda" in a bar that belongs to an ending which the replay after the jump skips. Endings after the jump bar play as written, so a Coda in one is no problem.
- A jump that stands in an ending or in a repeated section and is never taken.
- A jump inside a repeated section, before the section's end: it would fire on the first pass and the section's repeat would never be taken.

The list is made only when the document has a jump. Marks without a jump play nothing, so nothing is ignored and no notice appears. The same holds for a mark the jump does not use, such as a Fine in an "al Coda" song or a Segno in a D.C. song: it is drawn, not played, and gives no notice (except a Segno, Fine or "To Coda" after the jump bar, which is listed above).

The sentences about marks the import left out (5.4) are listed in the notice also when the song has no jump. They stay until the first edit of a mark or of the bars, because their bar numbers are those of the import; that edit clears them, and undo brings them back.

Bar numbers in the notice are the ones printed on the sheet (a pickup bar is bar 0).

With any problem, playback ignores the jump and plays straight. The sheet page shows one amber notice in a place of its own (the existing banner shows one message at a time and keeps its job) that names the problem in plain words, for example: "D.S. al Coda in bar 16 needs a Segno. Playback ignores the jump." The marks are still drawn, so the player sees what the song says.

### 5.4 Import

- **MusicXML:** the `sound` element, which stands in a direction or directly in a measure, with its attributes `segno`, `coda`, `tocoda`, `fine`, `dacapo`, `dalsegno`; the `segno` and `coda` elements of a direction or a barline; and the direction words ("D.C. al Fine", "D.S. al Coda", "To Coda", "Fine"). The attributes do not say "al Fine" or "al Coda": the words decide, and without words a Fine or a "To Coda" in the file decides.
- **MuseScore 2, 3, 4:** checked on the owner's files of 2026-11-24 (formats 2.06, 3.02 and 4.70): all three versions write the same structure. `Marker` and `Jump` are direct children of the measure, outside the voices.
  - A `Marker` is told apart by its `label`: `segno` is the Segno, `fine` is Fine, `coda` is "To Coda", and `codab` is the Coda sign. The text is not used (the signs are written as `<sym>segno</sym>` and `<sym>coda</sym>`).
  - A `Jump` is told apart by three labels: `jumpTo` (`start` or `segno`), `playUntil` (`end`, `fine` or `coda`) and `continueAt` (empty or `codab`). `start` with `fine` is D.C. al Fine; `start` with `coda` and `codab` is D.C. al Coda; `start` with `end` is D.C.; the three with `segno` are the D.S. forms. Any other combination of labels is a form outside the six.
  - Version 2 adds `playRepeats`, version 4 adds `eid` and `markerType`; the reader ignores all three.
  - The files hold no D.S. jump. `segno` as the `jumpTo` value follows from the marker's label and is the one value not seen in a file.
- **ABC:** the decorations the parser knows: `!segno!`, `!coda!`, `!fine!`, `!D.C.!`, `!D.S.!`, `!dacapo!`, `!D.C.alfine!`, `!D.C.alcoda!`, `!D.S.alfine!`, `!D.S.alcoda!`, and `!dacoda!`, which is a "To Coda". A decoration on a bar line gives a Segno or Coda to the next bar and every other mark to the bar before. Quoted text such as "D.S. al Coda" above a note is not read.
- In MusicXML a mark belongs to the measure it is written in, wherever it stands in the measure: Segno and Coda to the measure's start, Fine, "To Coda" and the jump to its end. Only a segno or coda in a right barline belongs to the next measure. A bare `dalsegno` is a plain D.S. unless the file has exactly one of Fine and "To Coda" (a Fine alone makes it D.S. al Fine, a "To Coda" alone D.S. al Coda); with both or neither it is plain. The words of a direction are matched by their letters only: "To Coda 𝄌" is a "To Coda".
- In ABC a mark in the middle of a bar moves to the bar's edge: Segno and Coda to its start, the others to its end.
- A form outside the six, or a second sign of a kind, is dropped. So is a mark behind the last note. The import result names what the importer dropped, and the sheet keeps the list with its source and shows it in the notice of 5.3. A sentence that depends on the chosen track (marks behind that track's last note) appears only in the sheet's notice, not in the import message.
- A mark stays with its music when the importer splits, merges or realigns bars, as repeat marks do.

### 5.5 Drawing

- Segno and Coda signs: above the staff at the left edge of their bar.
- "Fine", "To Coda" followed by the Coda sign, and the jump text ("D.C. al Fine"): above the staff at the right edge of their bar, right-aligned, in bold italic.
- The marks have a row of their own, 30 px high, on top of the bands that the sheet uses (5.10 decides which bands a sheet stacks and how tall the headroom is). The signs are 31 and 42 px high at full size and are drawn at 0.57 of the staff scale, so they fit the row. A sheet that uses every band and has no high note looks as it does today; with marks it is 30 px taller.
- Text widths are measured in the bold italic face. The face is requested at first use, and the marks are drawn again once it has loaded.
- When the marks of one bar do not fit side by side, the gap between them shrinks from 8 to 4 px, then the text from 13 to 10 px. Then the marks of the bar form one run that may reach left past the barline, but never into the clef or into another bar's marks. In a bar with four or five marks the text can shrink further, down to 6 px.
- Text widths are measured in the browser and estimated in tests.
- The marks never overlap chord symbols, lyrics, ending brackets or triplet marks. This is tested on a bar that has all of them and on a bar with an ending bracket, a triplet and notes up to C6 on ledger lines. A property test over random sheets, with each band switched on at random, checks that no drawn note element meets a band.
- The taller system changes how many systems fit on a PDF page and how far play mode turns; both read the height from the layout.
- The two signs are extracted from Bravura into `src/data/glyphs.json` with the existing script.
- Print uses the same drawing. In the PDF the signs are outlines and the texts are searchable text.

### 5.10 Bands above the staff collapse when empty (owner's decision of 2026-11-25)

After testing, the owner found the marks too far above the staff on sheets without chords and lyrics, and the empty space itself too large. The rule of 5.5 for where the marks row sits (top row, or lowered into empty bands) is replaced by this one, which applies to every sheet, with or without marks.

A system stacks only the bands the sheet uses. The decision is made once per sheet, so all systems of a sheet keep the same height. From top to bottom:

| Band | Present when |
|---|---|
| Marks | the sheet has a jump mark |
| Chord symbols | a chord symbol is drawn anywhere on the sheet, or the sheet is in Chords mode |
| Lyrics | a lyric is drawn anywhere on the sheet, or the sheet is in Lyrics mode |
| Ending brackets | a bar of the sheet has an ending |
| Headroom | always |

- "Drawn" is the renderer's own test: the content exists and its "Show on sheet" switch is on. Print, PDF and play mode never count the editing mode.
- Each band keeps the height and inner layout it has today. A sheet that uses every band and has no note reaching above the old lanes looks as it does today.
- **Headroom** is the space between the lowest present band and the top staff line. It is as tall as the highest thing any note of the sheet draws (heads, ledger lines, accidentals, stems, beams, flags, dots, ties, triplet marks) plus a 4 px margin, and never less than today's gap between the ending brackets and the staff. Notes therefore no longer run into lyrics or brackets; a sheet with very high notes grows by what they need.
- The marks row sits on top of the bands that are present. On a sheet with no chords, lyrics or endings it stands directly above the headroom.
- Everything below the staff (fingering charts, alternate-fingering marks) keeps its distance to the staff. The system's height is the sum of what is present.
- Entering Lyrics or Chords mode on a sheet without that band makes the band appear and every system grow; leaving the mode without typing removes it again. The owner chose this to start with; the alternative (bands stay during all editing and collapse only for viewing, playing and printing) remains open.
- The rule "low or top" of the marks row, with its 44 px drop, is removed. The fitting of several marks in one bar (gap, text size, run past the barline) stays.
- The guard for unchanged layout is recorded anew on purpose: sheets get shorter where a band is empty.

### 5.6 Editing

In "Edit notes", the panel for the selected note gains a section "Bar" for the bar that note is in:

- Two toggles for the start of the bar, labelled "Start": Segno, Coda.
- Two toggles for the end of the bar, labelled "End": Fine, To Coda.
- One select, "Jump at the end of the bar": None, or one of the six.

Each toggle is one undo step. Changes of the jump select on one bar within 1.5 s of each other are one undo step (typing through "D.C." to "D.C. al Fine" is one step); a change on another bar, a toggle or any other edit starts a new step. Setting a second jump, Segno, Coda, Fine or "To Coda" moves it: the earlier one is removed in the same step, so the document never holds two. The notice of 5.3 is a standing status region. It is empty when the marks add up, and it is not rendered in play mode. It appears and disappears as the marks change. Removing a bar removes its marks. An edit of a mark or of the bars clears the import's list of dropped marks (5.3). The live region announces the change: "Bar 16: D.S. al Coda", "Bar 6: To Coda removed", "Bar 4: Fine moved from bar 2".

### 5.7 What follows on its own

- The playing highlight follows the play order.
- Transposing, changing the instrument and lyrics are unaffected.

What does not follow: play mode's auto-scroll moves down the page at a steady speed and does not follow repeats today. It does not follow jumps either. The time on the track page is taken from the file before a sheet exists and ignores repeats and jumps, as today.

### 5.8 Start budget

Two steps make room, and the builder measures each before the marks are built:

- **Play mode** (the full-screen view) is loaded when it is first opened, from the sheet page or from "Play" in the library. That frees about 8,000 bytes. A plain dynamic import in a hook loads it. While the code is on its way the sheet stays in its normal view and usable; play mode starts when the code has arrived. If it cannot be loaded, the message "Play mode could not be loaded. Reload the page and try again." shows and the sheet stays in its normal view.
- **The glyph data** bundled with the app carries explanatory text beside the outlines. The text moves to the script's notes and the bundled file keeps the outlines only.

The start set went from 405,390 to 394,870 bytes with the two steps and stands at 405,824 bytes with the feature. If the two steps had not brought it to 397,000 bytes or less, the builder would have stopped and reported before building the marks.

### 5.9 Tests

- Play order: each of the six forms on a self-made tune; each with a repeat and two endings before the jump; every problem of 5.3; a song with no marks unchanged.
- Import: one self-made fixture per format with a Segno, a "To Coda", a Coda and "D.S. al Coda"; one with "D.C. al Fine"; a dropped rare form with its notice.
- Editing: each control, undo, moving a mark, removing a bar.
- Drawing: positions of every mark; no overlap with an ending bracket, a triplet mark and a chord symbol in one bar.
- PDF: the texts are text, the signs are outlines, on the right page.
- End-to-end: a new acceptance check V11; the index test and the file's head comment change from V01–V10 to V01–V11. V11: (import a "D.S. al Coda" tune, see the marks, play it and observe the bar order, add a "D.C. al Fine" by keyboard, undo.) The accessibility file covers the new controls through the "Edit notes" state.
- Play mode on demand: it opens on first use; a failed load shows the notice.

## 6. Calls made by the author

- **Branch:** `v2-jumps`.
- **A plain D.C. or D.S. stops at a Fine if the song has one.** That is how such songs are meant.
- **After the jump the last ending is played** and first endings are skipped.
- **A second mark of a kind moves the mark** instead of being refused.
- **Marks that do not add up are still drawn.**
- **Repeats and endings stay import-only.** Making them editable is a separate piece of work.
- **Play mode leaves the start set** and the glyph data loses its prose, to make room.
- **A sheet with marks gets one more row above the staff in every system.** Sheets without marks do not change.
- **The row stands on top of the bands the sheet uses.** It is 30 px. The drawing of the system moves by the stack's shift, which is the distance of the top staff line from where it was before bands could collapse (5.10).
- **In MusicXML a mark belongs to the measure it is written in**, wherever it stands, except a segno or coda in a right barline.
- **A jump that is never taken is a problem** and gets a notice.
- **Text below 10 px only in bars with four or five marks.**
- **Play mode's auto-scroll stays as it is.** It does not follow repeats today.
- **Quoted text in ABC is not read**; the decorations are.
- **A jump in a bar that ends a repeat is taken after the repeat.**
- **MIDI and the Scales page are untouched.**

## 7. Open, for the owner

- Whether repeat signs and ending brackets should become editable too, later.
- Whether play mode's auto-scroll should follow repeats and jumps, later.

## 8. Left to the builder

Field types and names beyond those above, the wording of notices, the exact positions and sizes of the marks within 5.5, the fixtures, and how play mode is split out.

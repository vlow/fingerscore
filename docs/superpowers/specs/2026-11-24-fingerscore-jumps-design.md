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
- After the jump no repeat is taken. Of a group of endings only the last one present is played (ending 2 where the song has endings 1 and 2).
- "al Fine", and a plain D.C. or D.S. when the song has a Fine: playback stops at the end of the Fine bar.
- "al Coda": at the end of the "To Coda" bar, playback continues at the Coda bar and runs to the end.
- A plain D.C. or D.S. without a Fine runs to the end of the song.
- A tie does not carry across the jump or across the step from "To Coda" to the Coda, also when the Coda bar is the next bar.

### 5.3 Marks that do not add up

One function lists the problems of a document:

- D.S. without a Segno.
- "al Coda" without a "To Coda" or without a Coda, or with the Coda before the "To Coda".
- "al Fine" without a Fine.
- More than one jump, Segno, Coda, Fine or "To Coda".
- A Segno after the jump bar; a Fine or a "To Coda" after the jump bar; a Fine before the Segno of a D.S.
- A Fine or a "To Coda" in the jump bar itself.
- A Segno, a Fine or a "To Coda" in a bar that belongs to an ending which is skipped after the jump.

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
- A mark in the middle of a bar moves to the bar's edge: Segno and Coda to its start, the others to its end.
- A form outside the six, or a second sign of a kind, is dropped. So is a mark behind the last note. The import result names what was dropped, and the sheet keeps the list with its source and shows it in the notice of 5.3.
- A mark stays with its music when the importer splits, merges or realigns bars, as repeat marks do.

### 5.5 Drawing

- Segno and Coda signs: above the staff at the left edge of their bar.
- "Fine", "To Coda" followed by the Coda sign, and the jump text ("D.C. al Fine"): above the staff at the right edge of their bar, right-aligned, in bold italic.
- The band above the staff is full today: chord symbols, lyrics, ending brackets and triplet marks leave gaps of 8 and 15 px, and the signs are 31 and 42 px high at full size. So a sheet that has at least one of these marks gets one more row above the staff in every system, and all its systems stay the same height. A sheet without marks keeps today's layout to the pixel. The signs are drawn at the size that fits the row.
- The marks never overlap chord symbols, lyrics, ending brackets or triplet marks. The builder fixes the row's height and order and tests it on a bar that has all of them.
- The taller system changes how many systems fit on a PDF page and how far play mode turns; both read the height from the layout.
- The two signs are extracted from Bravura into `src/data/glyphs.json` with the existing script.
- Print uses the same drawing. In the PDF the signs are outlines and the texts are searchable text.

### 5.6 Editing

In "Edit notes", the panel for the selected note gains a section "Bar" for the bar that note is in:

- Two toggles for the start of the bar: Segno, Coda.
- Two toggles for the end of the bar: Fine, To Coda.
- One choice for the end of the bar: no jump, or one of the six.

Each change is one undo step. Setting a second jump, Segno, Coda, Fine or "To Coda" moves it: the earlier one is removed in the same step, so the document never holds two. The notice of 5.3 appears and disappears as the marks change. Removing a bar removes its marks. The live region announces the change ("Bar 16: D.S. al Coda").

### 5.7 What follows on its own

- The playing highlight follows the play order.
- Transposing, changing the instrument and lyrics are unaffected.

What does not follow: play mode's auto-scroll moves down the page at a steady speed and does not follow repeats today. It does not follow jumps either. The time on the track page is taken from the file before a sheet exists and ignores repeats and jumps, as today.

### 5.8 Start budget

Two steps make room, and the builder measures each before the marks are built:

- **Play mode** (the full-screen view) is loaded when it is first opened, from the sheet page or from "Play" in the library. That frees about 8,000 bytes. While the code is on its way the sheet stays as it is and usable; play mode starts when the code has arrived. If it cannot be loaded, a message says so and the sheet stays in its normal view.
- **The glyph data** bundled with the app carries explanatory text beside the outlines. The text moves to the script's notes and the bundled file keeps the outlines only.

If the two steps do not bring the start set to 397,000 bytes or less, the builder stops and reports before building the marks.

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
- **Play mode's auto-scroll stays as it is.** It does not follow repeats today.
- **Quoted text in ABC is not read**; the decorations are.
- **A jump in a bar that ends a repeat is taken after the repeat.**
- **MIDI and the Scales page are untouched.**

## 7. Open, for the owner

- Whether repeat signs and ending brackets should become editable too, later.
- Whether play mode's auto-scroll should follow repeats and jumps, later.

## 8. Left to the builder

Field types and names beyond those above, the wording of notices, the exact positions and sizes of the marks within 5.5, the fixtures, and how play mode is split out.

# fingerscore version 2, part 3: Scales page — design

Date: 2026-11-23 · Status: approved by the owner in conversation on 2026-11-23

This document defines the Scales page and two preparations in the code base. It is written for the builder. Behaviour comes from `fingerscore-handoff/SPEC.md` §12 and §16 check 10, the prototype `fingerscore-handoff/prototype/Scales.dc.html` and `src/data/scales.json`. Section numbers (§) refer to SPEC.md.

## 1. Intent

A player wants to practise a scale on their instrument and see how each note is fingered, in any key, without making a sheet first.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Show any of eight scales in any of twelve keys for any of the twelve instruments, as notation with a fingering chart under every note.
2. Name keys the way the player thinks: by what they read or by what sounds.
3. Print the scale.

**Non-goals:** saving scales, editing, undo, playback, generated PDF (part 5), arpeggios or modes beyond the eight scales.

**Anti-goals:** a fingering on the Scales page that differs from the sheet's for the same note and instrument; a scale spelled with the wrong letters (G♯ where A♭ belongs).

## 3. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A** | **A scale builder that returns spelled notes, and a small dedicated staff component** (chosen) | Scales have no bars, rhythm or lyrics; a dedicated component of whole notes is simpler than bending the sheet layout. Glyphs, charts, the fingering lookup and the chooser are reused. |
| B | Build a `Doc` for the scale and reuse the sheet renderer | Reuses everything, but drags in bars, 4/4, bar lines and the 4-bars-per-system rule, none of which fit 15 stemless notes per line. |

## 4. What part 3 contains

### 4.1 Scale construction (§12)

- Input: instrument, scale, written tonic pitch class, range, direction.
- **Start note:** the lowest written pitch at or above the instrument's `lo` whose pitch class is the tonic.
- **Range:** "1 octave" = start to start + 12; "2 octaves" = start to start + 24; "Whole range" = every scale note from `lo` to `hi` (not starting on the tonic).
- **Limits:** a 1- or 2-octave scale never goes above `ext`; if it would, it is cut at the highest scale note at or below `ext`, with the notice "{prefix}Shown up to {last note shown}." The prefix is "The second octave does not fit this instrument. " for 2 octaves and "This octave does not fit this instrument. " for 1 octave. When the cut scale also has notes above `hi`, the notice goes on: " Notes above {hi note} need extended fingerings and are marked amber." Otherwise, if any note is above `hi`: notice "Notes above {hi note} need extended fingerings and are marked amber. Try 1 octave or another key for an easier scale." Note names in notices use flat spelling, as in the range meter.
- **Direction:** "Up", or "Up & down" (ascending, then descending without repeating the top note, ending on the start note). Melodic minor descends as natural minor. Over the whole range the descent ends on the descending form's lowest note at or above `lo`, which for melodic minor can lie below the ascent's first note. Each note carries whether it belongs to the ascent.
- **Range state** per note as on a sheet: playable, extended (amber), never unplayable (the limits above prevent it).

### 4.2 Spelling (§12, §16 check 10)

- **Tonic name:** from the major tonic table for major-type scales (major, major pentatonic, chromatic), from the minor tonic table for minor-type scales (natural, harmonic, melodic minor, minor pentatonic, blues).
- **Heptatonic, pentatonic and blues scales:** each note's letter = tonic letter + the scale degree index from `scales.json`; the accidental is whatever makes that letter sound the note. This can require a double sharp (G♯ harmonic minor has F double-sharp) or, in principle, a double flat: both are supported and drawn with the Bravura glyphs. In text a double sharp is written "F𝄪" and a double flat "B𝄫".
- **Chromatic:** ascending with sharps, or with flats when the tonic's major key has flats; descending always with flats.
- **Key signature on the staff:** the tonic's major signature for major-type scales, the relative major's for minor-type scales, none for the chromatic scale.
- **Accidentals drawn:** a note gets an accidental when its alteration differs from the key signature, or when the most recent earlier note of the sequence with the same letter and octave had a different alteration (the blues scale's B♭ then B♮; G♮ and F♮ when melodic minor descends after G♯ and F♯).

### 4.3 Fingerings

- The same lookup as on a sheet (`optionsFor`, including per-instrument overrides and the recorder system) and the same automatic choice, run along the scale's note sequence.
- A note without a sourced fingering shows the same box as on a sheet.
- **Choosable, as on a sheet:** every chart whose note has two or more fingerings gets the pill "⇅ {n}" under it (teal when the player changed that note). It opens the sheet's popover, titled "{note} — pick a fingering", with one button per option, the tag "auto" on the automatic choice and the current choice outlined. Picking the auto option removes the pick; picking another sets it. Esc and a click outside close the popover and return the focus to the pill. Manual-only variants can be picked.
- A pick belongs to the note's position in the scale's sequence and is a fixed point for the automatic choice along the whole sequence, so the neighbours adapt. Picks are cleared when the notes or their fingering tables change (instrument, scale, key, range, direction, recorder system), not by chart style, note names, the alternates checkbox or the key naming.
- "Show alternate fingerings" (off by default) stacks every further option under the note, each with its name: the chosen chart on top, then every option except the chosen one; manual-only variants are included. Names describe the fingering only; the charts that print an option are recorded in the data (`src`) and in `docs/fingering-gaps.md`, not shown.
- Print shows the chosen fingerings; the pills, the popover and the summary line do not print.

### 4.4 The page (`/scales`)

- Header navigation shows "Songs" and "Scales"; "Scales" is current on `/scales`.
- Title "Scales with fingerings" and a **Print** button beside it (the spec's "Download PDF" until PDF generation exists). Printing shows only the scale: title line "{Instrument} · {tonic} {scale name}" (plus "sounds {concert tonic} {scale name}" for transposing instruments), the staves, the chart legend and "fingerscore.eu", on A4.
- One control card: **Instrument** select (grouped by family, as on the sheet page) · **Scale** select with the eight scales · **Range** segmented "1 octave / 2 octaves / Whole range" · **Direction** segmented "Up / Up & down" · **Key** chips (12, a radiogroup) · chart style "Compact / Full key map" for sax, clarinet and flute, or "Baroque / German fingering" for recorder · checkboxes "Show alternate fingerings" and "Note names" (on by default) · when the scale has notes with alternatives, the line "{n} notes have alternate fingerings · {m} changed by you" ("1 note has …") and, when m > 0, the button "Reset all to auto".
- **Key chips:** for a transposing instrument each chip reads "{written} · sounds {concert}"; the toggle "Name keys by: You read / Sounds in" swaps which name leads ("{concert} · you read {written}") and orders the chips by the leading name's pitch class from C. Non-transposing instruments show one name and no toggle. Octave-transposing instruments (piccolo, soprano recorder) count as non-transposing here.
- The notice from 4.1, when there is one, shows between the card and the scale with `role="status"`.
- **Notation:** treble clef and key signature at the start of every line; whole-note heads without stems; up to 15 notes per line, evenly spaced; ledger lines; amber noteheads for extended notes; under the staff the note name (when "Note names" is on), then the fingering chart, then the stacked alternates (when shown). A thin double barline after the last note.
- Defaults: the preferred instrument; major; the key whose written tonic is C; 1 octave; Up. The page remembers its settings and the fingering picks in this browser (`fingerscore.scales` in localStorage, through the storage module); a stored instrument that no longer exists falls back to the preferred one, and a stored pick is kept only when its note exists in the rebuilt scale and its option index is valid for that note.
- Changing the instrument on this page does not change the preferred instrument or an open sheet.

### 4.5 Preparations

- **Split `src/pages/SheetPage.tsx`** (about 600 lines) into focused pieces without changing behaviour: selection and announcements, the sheet's key handling, playback, and the editing-panel slot become hooks or components under `src/pages/sheet/`. The page's tests are the guard and stay as they are.
- **Load on demand:** the Scales page, the Tracks page and the three editing panels with the bulk card are loaded with `React.lazy`; the main chunk drops below Vite's 500 kB warning limit. Lazy parts show nothing while loading (a `Suspense` fallback of `null`), except the page routes, which show an empty main area.

## 5. Calls made by the author

1. Print in place of Download PDF.
2. Settings remembered per browser; the Scales instrument is independent of the preferred instrument after the first visit.
3. Alternates off by default; when on, every option is stacked, variants included.
4. No key signature for the chromatic scale.
5. Double sharps and double flats are spelled and drawn rather than respelled enharmonically.
6. A 1-octave scale that does not fit is cut with a notice rather than moved down an octave (the start note is already the lowest tonic).
7. Tracks page is lazy-loaded too, to keep the main chunk small.

## 6. Left to the builder

Staff geometry for scale lines (port from the prototype), component split, CSS, the shape of the stored settings, icons.

# fingerscore version 2, part 4b: triplets — design

Date: 2026-11-24 · Status: draft, waiting for the owner's approval

This document defines part 4b of version 2: triplets from imported files, on the sheet, and in the editor. It is written for the builder. It builds on the app as it is after part 4a (four importers, ticks, five meters, editing with undo). Section numbers (§) refer to `fingerscore-handoff/SPEC.md`.

## 1. Intent

Songs with triplets are rounded to sixteenths today, and the sheet says "rhythm simplified". A player should see and play the rhythm the file has, and be able to write a triplet into a sheet.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Triplets in a MIDI, MusicXML, MuseScore or ABC file arrive as triplets: eighth, quarter and sixteenth triplets, including the long-short figure (a triplet quarter and a triplet eighth) and rests inside a group.
2. The sheet draws a group with the number 3, and a bracket where a beam does not already join its notes.
3. In Edit notes a player can turn a note into a triplet and back, and change pitch, rest, tie, lyric and chord of every triplet note like any other note.

**Non-goals:** tuplets of 5, 7 or other counts (rounded with the notice, as today); a sextuplet drawn with a 6 (it shows as two triplets of sixteenths); half-note triplets; nested tuplets; duplets in 6/8; recognising triplets in a MIDI file played with loose timing; a dotted note inside a triplet.

**Anti-goals**

- A sheet with a triplet note outside a complete group. Validation refuses it; no edit can produce it.
- A bar that does not sum to its capacity (unchanged from part 2).
- An imported rhythm that is recognised as triplets when the file has plain notes. When in doubt, the importer rounds as today and says so.

## 3. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A** | **Lengths in ticks, groups derived from the lengths** (chosen) | A note of 2, 4, 8 or 16 ticks can only be a triplet value, so the document needs no new field. One pure function finds the groups; validation, drawing and editing use it. A document is valid when every triplet-valued note lies in a complete group. |
| B | An explicit group marker on each event | Marker and lengths can disagree; every edit must keep both in step; the file format grows. |
| C | A separate rational time model for tuplets of any count | Covers 5 and 7 too, but replaces the tick model everywhere. Out of proportion. |

## 4. What part 4b contains

### 4.1 Model

- Ticks stay 12 per quarter. **Triplet values:** 2, 4, 8 and 16 ticks. `Ev.d` may hold one of these beside the eight plain values (3, 6, 9, 12, 18, 24, 36, 48). No other field changes. The code keeps two lists, plain and triplet; nothing treats a triplet value as a plain length.
- **A triplet group** is a window of span S ∈ {6, 12, 24} ticks that is filled exactly by its members, notes or rests:
  - S = 6 (sixteenth triplet): members of 2 or 4.
  - S = 12 (eighth triplet): members of 2, 4 or 8. A member of 2 is half a triplet eighth, so "eighth, eighth, two sixteenths" under one 3 is a group.
  - S = 24 (quarter triplet): members of 4, 8 or 16.
- **Where a group may start:** at a multiple of S/2, counted in metric ticks. Metric ticks are ticks from the start of the bar; in a pickup bar they are counted so that the bar ends on a bar line (metric tick = tick + full bar − pickup length). So an eighth triplet may start on a beat or on the "and", a quarter triplet on any beat, and beat 2 of a 6/8 bar (tick 18) can start one. A group never crosses a bar line.
- **One function** `tripletGroups(bar) → { start, span, ids }[]` reads a bar from left to right. At the first event with a triplet value that is not yet in a group, a group must start at that event: try S = 6, then 12, then 24; take the first S for which the start is allowed and the following events tile the window with that S's member values. If none fits, the bar is invalid. Smallest first means six triplet sixteenths in a beat are two groups, and "quarter, eighth, eighth, quarter" in triplet values is two eighth-triplet groups.
- **Notated value** of a triplet note = its length × 3/2 (2 → sixteenth, 4 → eighth, 8 → quarter, 16 → half). Heads, stems, flags, beams, rests and the spoken length are taken from the notated value.
- `validateDoc` accepts a bar when its lengths are plain or triplet values, they sum to `cap`, and `tripletGroups` places every triplet-valued event. `cap` rules are unchanged.
- No migration: sheets saved before have no triplet values and stay valid.

### 4.2 Import (all four formats)

The importers already deliver exact note positions. Recognition happens once, in the shared step that builds bars: after the melody is reduced to one note at a time, with the meter and the pickup known. The bar builder places group members itself; plain stretches are rounded and split as today.

- **Which positions count.** A note start or end is taken as a triplet position only when it lies within 0.005 quarter of a whole tick. Written tuplets and MIDI files from notation software are exact; this keeps a quintuplet or a septuplet, whose notes come as near as 0.012 quarter to a tick, from being read in part as triplets. Every other position is rounded to the sixteenth grid as today.
- **Which cut is chosen.** Inside each bar the importer looks at every way of placing triplet windows (4.1: span, allowed start, member lengths) so that all triplet positions of the bar are explained and every piece is a member or a plain length, and takes the best one by this order:
  1. the fewest ties created by cutting notes;
  2. then the fewest events (notes and rests);
  3. then the smallest total span of the windows.
  A quarter-triplet window is used on import only when its members are triplet quarters and triplet halves (8 and 16); it is not used to hold triplet eighths.
- So: a long-short figure is one eighth-triplet group of two notes, not a sixteenth-triplet group with a tie; a triplet with a silent middle is one group with one rest; three triplet quarters are one quarter-triplet group; a plain quarter tied into a triplet stays a quarter tied to the first of three triplet eighths.
- A triplet position that no placement explains is rounded to the sixteenth grid, and the song is marked simplified.
- A note that reaches past its window is split at the window's end and tied, like a note across a bar line. A note that starts before a window and ends inside it is split at the window's start and tied.
- Silence inside a group becomes triplet rests, the longest member values first.
- Everything not recognised is rounded to the sixteenth grid as today, and `source.simplified` is set. A song whose only non-plain rhythm is recognised triplets is not marked simplified.
- The notice reads: "Rhythm simplified: notes shorter than a sixteenth and tuplets other than triplets were rounded."
- MIDI: recognition works for files exported from notation software. Loosely played triplets stay rounded. A MIDI file exported with swing playback has its eighths in a 2:1 ratio and therefore shows a triplet quarter and a triplet eighth on every beat; that is what the file says. MusicXML, MuseScore and ABC carry written values and are not affected. The README names both.

### 4.3 Drawing

- A group shows the number **3**, centred between its first and last note head or rest. When one beam joins all its members, the number stands alone at the beam. Otherwise a bracket spans from the first to the last member, open in the middle for the number.
- Placement: a beamed group's number stands at its beam, on the stem side (above the beam when the stems point up, below it when they point down). A bracketed group's number and bracket go above the group, just clear of its highest head, stem or flag, and below it when the space above is taken (the ending bracket line, or the lyric band). When the position at the beam is taken, the number goes to the other side. Neither ever enters the fingering chart row, and each keeps at least 3 units from the ink of the neighbouring notes.
- Beams: a group beams by group, not by beat: its members of notated eighth or sixteenth value beam together across the whole group (triplet eighths one beam, triplet sixteenths two, mixed values as a dotted eighth and a sixteenth are drawn today), also where a beat boundary falls inside the group. A beam never crosses a group's edge, and a plain note never beams with a triplet note.
- Heads, rests and flags follow the notated value: a member of 16 is an open head, one of 8 a filled head without flag. Dots never appear in a group.
- Spacing stays proportional to ticks, and the existing width rule applies with the bar's shortest length. A 4/4 bar with eighth triplets needs about a third more width than a plain bar, so such lines hold two or three bars; a bar with triplet sixteenths usually fills a line alone.
- The number and bracket are drawn in print too.
- Screen readers and the selection's spoken text: a triplet note is named "triplet eighth", "triplet quarter", "triplet sixteenth", "triplet half".

### 4.4 Editing (Edit notes)

Panel: one new button **Triplet** in the Length row, after the dot, `aria-pressed` when the selected event is in a group, shortcut **P** (named in `aria-keyshortcuts`; the keys line at the bottom of the panel gains "P triplet"). The edit functions in the domain enforce every rule below; the panel only reflects them.

- **Make a triplet** (on a plain event): enabled when the event's length is 6, 12 or 24 and its start is an allowed group start for that span (4.1). The event becomes three events of a third each, filling the same time. The first keeps the id, pitch, lyric, chord and fingering choice. The two new ones get new ids and the same pitch; they are notes when the event was a note and rests when it was a rest. A tie on the original moves to the third member when the event after the group is a note of the same pitch; otherwise it is cleared. The selection stays on the first member.
- **Undo a triplet** (on a group member): the group becomes one plain event of the group's span. It takes the id, pitch, lyric, chord and fingering choice of the first member that is a note, or of the first member when all are rests. It carries a tie when the group's last member had one and the event after it is still a note of the same pitch. The other members are removed with their lyrics, chords and fingering choices. The selection moves to the resulting event.
- **Length inside a group:** the Length buttons show notated values, and only the group's member values are enabled (eighth triplet: Sixteenth, Eighth, Quarter). The existing bar-fill rules apply inside the window: shorter leaves triplet rests, longest member values first; longer consumes the following members; a partly covered member keeps its id and end when what remains is a member value, otherwise it becomes triplet rests. A length change never crosses the group's edge. The dot is disabled. No member length fills a whole window, so a group stays a group until it is undone or covered.
- **Number keys 2–6** inside a group choose the notated value when it is enabled; otherwise they do nothing.
- **A plain edit that reaches into a group** (lengthening the event before it): plain events start and end on the sixteenth grid and group spans are multiples of 6, so the edit covers the group completely or leaves a remainder that is a multiple of 3. Covered members are removed; a remainder becomes plain rests. No edit leaves part of a group.
- **Pitch, rest/note, tie, A–G, arrows, Delete, lyrics, chords, fingering choice:** as for any event. A tie from the last member of a group into a plain note, and from a plain note into the first member, is allowed when the pitches match.
- **Add bar, remove bar:** unchanged.
- Undo and redo cover each of these as one step.

### 4.5 Playback, fingerings, lyrics, scales

Playback, the fingering chooser, "Fill lyrics", chord entry, key and transposition work on ticks and event order and need no rule change. The Scales page is not affected.

### 4.6 Tests

- Unit: `tripletGroups` for every member pattern of S = 6, 12, 24, misaligned and incomplete cases; validation; import recognition from each format (ABC `(3abc`, MusicXML `time-modification`, MuseScore `<Tuplet>` in versions 2 and 3, MIDI at exact thirds), the long-short figure, a rest inside a group, a tie out of a group, a quintuplet still rounded with the notice; every edit rule of 4.4 with the invariant "every bar valid after every edit" checked by a property-style test over random edit sequences; drawing of number, bracket, beams and rests.
- Samples (local): the Caprice in versions 3 and 4 and the version 2 Entertainer copy with the added triplet import their triplets; the Caprice is not marked simplified except for its one group of seven; version 3 and 4 copies agree.
- End-to-end: import a fixture with an eighth triplet, see the 3; in Edit notes turn a quarter into a triplet, change the middle pitch, undo it; save, reload, the triplet is still there.

## 5. Calls made by the author

1. Groups are derived from lengths; the file format gains no field.
2. A sextuplet shows as two sixteenth triplets.
3. A new triplet is three notes of the selected note's pitch, not one note and two rests.
4. The shortcut is the letter P. The key 3 selects the eighth, and Ctrl/⌘+3 switches browser tabs.
5. Inside a group only its member lengths are offered, so the long-short figure is two steps: make a triplet, then set the first note to the longer value.
6. A plain edit may dissolve a group into rests but never leaves part of one.
7. Recognition on import needs exact positions; hand-played MIDI stays rounded.
8. Half-note triplets (three in the time of a whole) are out of scope.
9. A member may be half a triplet note ("eighth, eighth, two sixteenths" under one 3), because that figure is common and would otherwise be rounded.
10. A group may start on a beat or halfway between: at a multiple of half its span. In a pickup bar positions are counted from the bar line at its end.
11. On import the cut with the fewest ties wins, then the fewest notes and rests, then the least triplet territory. A triplet position must be exact within 0.005 quarter, tighter than the 0.02 used for rounding, so that groups of five or seven are not read in part as triplets.
12. A MIDI file exported with swing playback shows triplets on every beat.
13. The 3 goes above the group, or below it when the space above is taken by an ending bracket.

## 6. Left to the builder

Where the group function lives and how it is cached; the exact position and size of number and bracket (port the look of standard engraving at the sheet's scale); how the import step walks windows; icons; CSS; fixtures.

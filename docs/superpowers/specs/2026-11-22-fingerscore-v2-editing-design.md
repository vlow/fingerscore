# fingerscore version 2, part 2: editing with undo and redo — design

Date: 2026-11-22 · Status: approved by the owner in conversation on 2026-11-22

This document defines the second part of version 2: editing notes, lyrics and chords on the sheet, with undo and redo. It is written for the builder. Behaviour comes from `fingerscore-handoff/SPEC.md` §9.2–9.5 and §10; this document lists what part 2 contains and where it adapts the spec to the app as built (ticks, four meters, sixteenths, the library). Section numbers (§) refer to SPEC.md.

## 1. Intent

An imported song is rarely right as it comes: a wrong note, a missing lyric, a chord to add. The player wants to fix the sheet in place, and to take a change back.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Change pitch and length of any note, turn notes into rests and back, tie notes, add and remove bars.
2. Enter lyrics note by note or paste a verse; enter chord symbols on any event.
3. Undo and redo every change to the sheet, up to 200 steps.

**Non-goals:** insert mode, copy and paste, multi-select, editing repeats and endings, changing the time signature or the key signature directly, triplets, more than one lyric verse, persisted history.

**Anti-goals**

- A bar that does not sum to its capacity, or an event id that changes or repeats. Saved sheets are validated; an inconsistent document cannot be saved.
- An edit that changes the key: editing never re-suggests the transposition.
- Losing lyrics, chords or fingering choices of notes the edit did not touch.

## 3. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A** | **Pure edit functions over immutable documents + a snapshot history in the store** (chosen) | Each edit returns a new `Doc`; undo is a stack of documents. Simple, testable, matches how the store already works. Memory: 200 snapshots share unchanged bars by reference. |
| B | Command objects with inverse operations | Smaller history, but every edit needs a hand-written inverse; easy to get wrong for the bar-fill rules. |
| C | A diff/patch library | Generic, but adds a dependency and hides the bar rules. |

## 4. What part 2 contains

### 4.1 Document changes

- `Ev.c` (the chord text as imported) is removed from the event.
- `Doc.imported: { lyrics: Record<string, string>; chords: Record<string, string> }` holds the lyrics and chord texts as imported, keyed by event id, for "Restore from file". Importers and the sample fixture fill it; a document without it is read as empty maps.
- No migration: sheets saved before this change open with empty `imported` maps (their `c` fields are ignored).

### 4.2 Modes (§9.2)

Segmented control above the paper: **View · Edit notes · Lyrics · Chords**, with a one-line hint for the current mode; the playback controls stay on the right of the same row. The mode is UI state, not part of the document.

- Clicking a note or rest selects it in every mode; "Play from selected" works in every mode.
- View: selection only marks the playback start.
- Lyrics mode forces lyrics visible; Chords mode forces chord symbols visible (display only; the Show toggles are not changed).
- The editing panel for the current mode appears directly under the system that holds the selected event. Esc closes it by clearing the selection.

Hints: View "Click a note to choose where playback starts." · Edit notes "Click a note or rest, then change its pitch or length. Arrow keys work too." · Lyrics "Click a note and type. Enter moves to the next note." · Chords "Click a note or rest and type a chord, for example Am7 or F♯m7♭5."

### 4.3 Edit notes (§9.3)

Panel:

- **Pitch:** buttons "Octave down", "Semitone down", the written note name, "Semitone up", "Octave up". Pitch changes apply to the stored concert pitch; the result must stay within MIDI 0..127 (the button is disabled otherwise). On a rest the pitch buttons are disabled.
- **Length:** sixteenth, eighth, quarter, half, whole, and a dot toggle. Dotted values: dotted eighth, dotted quarter, dotted half. A length that does not fit between the event's start and the end of its bar is disabled; the dot is disabled when the dotted value does not fit or does not exist (sixteenth, whole).
- **Tie** toggle: enabled only when the event is a note and the next event in the score (also across the bar line) is a note of the same pitch.
- **Turn into rest / Turn into note**; a rest becomes a note at the pitch it remembers (the previous note's pitch).
- **+ Bar after:** inserts a bar of the song's meter holding one whole-bar rest, and selects that rest. **Remove bar:** removes the selected event's bar and selects the first event of the following bar (or of the previous one); disabled when the score has one bar.

Keyboard (sheet focused, Edit notes mode): ↑/↓ semitone, Ctrl/⌘+↑/↓ octave, A–G jump to that letter (with the key signature's alteration) in the playable octave nearest to the current written pitch, ←/→ previous/next event (tied continuations included in this mode, since they can be edited), 2/3/4/5/6 sixteenth/eighth/quarter/half/whole, `.` dot, R rest↔note, T tie, Delete/Backspace turn into rest, Enter/Space play from the selection, Esc clear the selection. Keys that would do something disabled do nothing. The panel names these keys on its buttons (`aria-keyshortcuts`, no tooltips) and in one line at its bottom: "Keys: ↑ ↓ pitch · A–G note · 2–6 length · . dot · R rest · T tie".

**Bar-fill rules** (ticks; bars always sum exactly to `cap`):

- Shorter: the gap after the event is filled with rests, decomposed greedily (largest allowed duration first), each with a new id.
- Longer: the event consumes the following events of its bar. A fully covered event is removed. A partly covered event keeps its id and its end; if its remaining length is not one allowed duration, it is replaced by rests. Never crosses the bar line.
- A tie is cleared when the next event is no longer a note of the same pitch; a tie into the edited event from the previous note is cleared when the pitches no longer match.
- Lyrics, chords and fingering choices stay with their events. Removed events lose theirs. Changing an event's pitch, or turning it into a rest, drops its fingering choice.
- Repeat and ending marks belong to bars and move with them; a new bar has none.
- A new bar or a new rest remembers the pitch of the nearest earlier note.

### 4.4 Lyrics (§9.4)

- Panel with one **Lyric** field (focused on open) and symbol buttons ‿ ’ - „ “ … that insert at the caret without taking focus. Enter and Tab move to the next note that can carry a syllable (rests and tied continuations are skipped), Shift+Tab to the previous one; at the last note Enter keeps the selection. Esc clears the selection.
- The Lyric field takes focus when a click on the sheet makes or re-makes the selection, when the mode switches to Lyrics with a selection, and on Enter/Tab moves; arrow keys on the sheet move the selection without taking focus from the sheet.
- Selecting a rest or a tied continuation in Lyrics mode moves the selection to the next note that can carry a syllable.
- Sidebar card "Lyrics & chords": textarea "Type or paste a verse", **Fill lyrics** (fills from the selected note, or from the first note; `wat-er` puts "wat-" and "er" on two notes; a standalone `_` leaves a note empty; extra syllables beyond the last note are dropped; notes beyond the text keep what they have), **Clear lyrics**, **Clear chords**, and a line "{n} edits to lyrics and chords" with **Restore from file** (restores lyrics and chords of all surviving events to the imported state; disabled at 0 edits). A sheet with no imported lyrics or chords at all (one saved before this feature, or a file without them) shows "Nothing was imported with this sheet." instead of the count, and Restore from file stays disabled. The card shows in every mode.

### 4.5 Chords (§9.5)

- Panel with one **Chord** field (focused on open) and buttons ♭ ♯ m ° ø Δ 7 sus4 add9 6 / ( ) that insert at the caret without taking focus; "Δ" inserts "Δ7"; "( )" inserts both and puts the caret between them. Hint: "b → ♭ and # → ♯ after a note name". Typing "b" or "#" directly after a root or bass letter is shown as ♭ / ♯.
- Any event can carry a chord: notes, tied continuations and rests. Enter and Tab move to the next event, Shift+Tab to the previous. An empty field removes the chord. The Chord field takes focus on the same occasions as the Lyric field (4.4).
- A valid chord is stored relative to the original key, so it follows every transposition and instrument; the typed text shows verbatim until the key changes. Invalid text is kept, shown red with a wavy underline, not transposed, with the message "Not a chord we can transpose. Start with a note name A–G." under the field.

### 4.6 Undo and redo (§10)

- Buttons ↶ ↷ in the page bar, left of the save status: 44×44, disabled at 40% opacity when there is nothing to undo or redo, labelled "Undo" / "Redo" with the shortcut in the tooltip.
- Shortcuts on the sheet page: Ctrl/⌘+Z undo, Ctrl/⌘+Shift+Z and Ctrl+Y redo, Ctrl/⌘+S save — one handler for all three, also while a text field of the page has focus (the app's history replaces the browser's text undo in the title, subtitle, lyric and chord fields).
- History covers the whole document: score, lyrics, chords, title, subtitle, tempo, instrument, transposition, fingering choices, chart style, recorder system, show toggles. Selection, mode, open panels and menus are not recorded.
- Changes to the same field within 1.5 s coalesce into one step (title, subtitle, tempo slider, one event's lyric, one event's chord). Maximum 200 steps; a new change clears redo. History lives in memory only.
- **History resets when a sheet is opened or imported** (deviation from §10 "Opening a sheet is undoable"): undo never crosses into another sheet.
- After undo or redo, a selection whose event no longer exists is cleared. The save status follows the document: undoing back to the saved state shows "Saved".

## 5. Calls made by the author

1. Key 2 selects the sixteenth; 3–6 as in the spec.
2. The pitch buttons are octave and semitone steps (the spec's "−8 / +8" read as octave buttons).
3. In 3/4 and 6/8 the longest note is the dotted half; "whole" is disabled there.
4. Rests keep their lyric text invisibly when a note is turned into a rest, so turning it back restores the syllable.
5. Chords mode also forces chord symbols visible.
6. ←/→ in Edit notes and Chords mode step through every event; in View and Lyrics mode they skip tied continuations.
7. The edit count counts events whose lyric or chord differs from the imported state.
8. A "sheet generation" number in the store, raised on every open or import, replaces the identity of `doc.source` as the "same sheet" test for selection, history reset and relinking.

## 6. Left to the builder

Component split and CSS, icons for the length buttons, the exact panel layout (port from `prototype/Editor.dc.html`), the caching of the canonical string, test fixtures.

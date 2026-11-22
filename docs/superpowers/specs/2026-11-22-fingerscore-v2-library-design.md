# fingerscore version 2, part 1: library and files — design

Date: 2026-11-22 · Status: approved by the owner in conversation on 2026-11-22, with one change (no migration of older file formats)

This document defines the first part of version 2: saving sheets in the browser, and exporting and importing them as JSON files. It is written for the builder. Behaviour comes from `fingerscore-handoff/SPEC.md` §2.2, §4.3, §4.4 and §13; this document lists what part 1 contains and where it deviates. Section numbers (§) refer to SPEC.md.

## 1. Intent

A player who has made a sheet wants to keep it, find it again, and move it to another computer. Version 1 keeps the current sheet only for the browser session.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Save the current sheet in this browser and see whether it has unsaved changes.
2. Open, list and delete saved sheets, from the sheet page and from the start page.
3. Download a sheet as a JSON file and open such a file again, by menu or by dropping it on the start page.

**Non-goals** (later parts of version 2): undo and redo, editing, Scales page, MuseScore/ABC import, generated PDF, legal pages.

**Anti-goals**

- Backward compatibility. Until the public release there is exactly one file format; anything else is refused. No migration code.
- Any network request with user data. Files are read and written locally.
- Losing a sheet silently: a failed save says so.

## 3. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A** | **localStorage behind a repository module** (chosen) | Synchronous and simple. About 5 MB per origin; a sheet is a few kB, so hundreds fit. |
| B | IndexedDB | No practical size limit, but asynchronous everywhere and more code. The repository module keeps this swap open. |
| C | Files only, no browser library | No storage limits, but no gallery and no one-click save, which §4.4 and §13.2 require. |

## 4. What part 1 contains

### 4.1 File format (`*.fingerscore.json`)

```json
{ "app": "fingerscore", "format": 1, "savedAt": "2026-11-22T12:00:00.000Z", "title": "Auld Lang Syne", "doc": { … } }
```

- `doc` is the app's `Doc` type as it is (`src/domain/types.ts`): durations and bar capacities in ticks (12 per quarter), `timeSig`, `originalMode`, event ids, `fingering` and `chords` keyed by event id.
- `format` is 1. A file with another `app` or `format` is refused.
- Download file name: the title in lower case with runs of characters outside `a–z0–9` replaced by `-`, trimmed, plus `.fingerscore.json`; an empty title gives `sheet.fingerscore.json`.

### 4.2 Validation on import (one function, used for files and for library entries)

A document is accepted when all of these hold; otherwise it is refused as a whole:

- envelope: `app === "fingerscore"`, `format === 1`, `doc` is an object;
- `timeSig` is one of 4/4, 3/4, 2/4, 6/8; `inst` is a known instrument; `shift` is an integer in −24..24; `tempo` is a number (clamped to 40..200); `originalTonicPc` is 0..11; `originalMode` is major or minor;
- `score` is a non-empty array of bars; every bar has `cap` > 0 and ≤ the meter's bar capacity, `rs`/`re` booleans, `volta` in `'' | '1' | '2'`, and events whose durations are allowed values and sum to `cap`; every event has a unique non-empty string id other than `__proto__`, `constructor`, `prototype` or any other name every object inherits (`toString`, `valueOf`, …)..127, booleans `r` and `tie`, strings `l` and `c`;
- size: at most 2000 bars and at most 64 events in one bar. A file larger than 5 MB is refused before it is read, with the "isn't a fingerscore sheet" message.

Repaired silently instead of refused: missing `title`/`subtitle` (empty string), missing or malformed `show`, `chartStyle`, `recorderSystem` (defaults), fingering overrides whose event id is unknown or whose index is not a valid option for that note (dropped), chord entries whose event id is unknown or whose shape is wrong, for example a `pc`, `bass` or `tk` that is not an integer 0..11 (dropped), unknown extra fields (dropped), a missing `source` (replaced, see 4.5).

User messages: `"{file}" isn't a fingerscore sheet.` for a wrong envelope or unparseable JSON; `"{file}" is damaged and can't be opened.` for a right envelope with an invalid document.

### 4.3 Library

- localStorage key `fingerscore.library.v1`: array of `{ id, title, inst, savedAt, doc }`, newest first. `inst` is the instrument's display name; `id` is time-based plus a random suffix.
- All access through one repository module with try/catch. Reading validates each entry with 4.2 and skips invalid ones.
- Messages (§13.2): storage blocked → `This browser blocks local storage. Use "Download JSON" instead.`; write failed → `Couldn't save — the browser storage may be full.`; a sheet that would fail 4.2 after a JSON round trip is not written → `This sheet can't be saved: its data is inconsistent.`
- Blocked or full storage never stops a JSON file from opening. When the library write fails during an import, the sheet opens anyway without a library entry: status "Not saved yet", `source.format` `file`. The storage message shows in the sheet page's alert line (File menu) or under the drop-zone result (4.6).

### 4.4 Sheet page

- The store tracks which library entry the current sheet belongs to (`libraryId`) and the canonical serialisation at the last save. Both are session state and survive a reload.
- **Save status** in the page bar: "Not saved yet" (no library entry), "Unsaved changes", "Saved". Compared by canonical serialisation of the document.
- **Save** button: first save creates the entry, later saves update it and move it to the top. An entry's title is the sheet title, or "Untitled sheet".
- **File ▾** menu (button with `aria-haspopup="menu"`, `aria-expanded`; Esc and outside click close; arrow keys move): **Print** (primary, teal; replaces "Download PDF" until PDF generation exists) · **Download JSON** · **Open JSON file…** · **New sheet** (→ `/`), then "Saved in this browser": each entry with title, "instrument · saved {time ago}", the current one highlighted, **Open** and **Delete** (same undo toast as on the start page); below it the note "Sheets are stored only on this device. Download a JSON file to back up or move a sheet to another computer."
- The separate Print button of version 1 moves into the menu.
- Deleting the current sheet's entry keeps the sheet open and sets the status to "Not saved yet".
- **`/sheet?id=<id>`** opens that library entry (replacing the current sheet) and then drops the query from the URL. An unknown id shows the start page with a `role="alert"` message "That sheet is no longer saved in this browser."
- No prompt when leaving with unsaved changes.

### 4.5 Where a sheet came from

`Doc.source.format` gains two values beside `MIDI`, `MusicXML` and `sample`: `file` (opened from a JSON file) and `library` (opened from the library). Opening sets `source` to `{ file: <file name or title>, format, track: '', trackCount: 0, simplified: false }` — and clears the session's parsed song, so "Change track" and the step indicator disappear, as §2.2 describes.

Page bar chip (§2.2): imported song → as today; JSON file → document icon + `{name}.fingerscore.json · fingerscore sheet · {N} notes`; library → document icon + `{title} · saved in this browser · {N} notes`. A sheet made from an imported song keeps its chip after saving.

### 4.6 Start page

- **"Your sheets" gallery** (§4.4), above the instrument picker, only when the library is non-empty: header "Your sheets" + "{N} sheets · saved in this browser"; responsive grid `auto-fill, minmax(220px, 1fr)`; newest first; 4 shown + "Show all {N}"; card with decorative staff lines, title, instrument, "Saved 5 min ago"; the whole card opens the sheet (`/sheet?id=`); a delete icon button removes it and shows a toast "Deleted "{title}"" with **Undo** for 6 seconds.
- **Drop zone** (§4.3): text "Drop a song or a saved sheet here"; chip "Saved sheet .json" (teal) beside the MIDI and MusicXML chips; a `.json` file is validated, added to the library, and the result reads `✓ "{title}" added to your sheets` with [Open sheet →] and [Add another]; an invalid file shows the 4.2 message with [Try another file]. When the library write fails, the file becomes the session's current sheet and the result reads `✓ "{title}" opened — it could not be saved in this browser.` with [Open sheet →] (to `/sheet`) and [Add another], and the storage message (4.3) below it as `role="alert"`.

### 4.7 Time-ago text

"just now" (< 1 min), "{n} min ago", "{n} h ago", "yesterday", "{n} days ago" (< 30 days), otherwise the date as `22 Nov 2026`.

## 5. Calls made by the author

1. `format` stays 1; there is no migration (owner's decision).
2. localStorage, not IndexedDB.
3. Invalid library entries are skipped, not shown as broken cards.
4. Print stays the primary menu action until PDF generation exists.
5. Opening a JSON file from the File menu adds it to the library too, like dropping it on the start page, and opens it.
6. No unsaved-changes prompt.
7. Deleting a saved sheet, from the gallery or from the File menu, shows the same toast with Undo for 6 seconds; there is no confirmation dialog. The 6 seconds run from the moment the toast appears. They pause only while the pointer is over the toast and restart in full when it leaves. Focus on Undo does not pause them.

## 6. Left to the builder

Component split, CSS, the canonical serialisation (stable key order), the toast implementation, icon drawings, test fixtures.

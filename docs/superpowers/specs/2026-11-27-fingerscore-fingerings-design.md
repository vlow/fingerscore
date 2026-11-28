# fingerscore: fingerings on the instrument — design

Date: 2026-11-27 · Status: approved by the owner in conversation on 2026-11-27

This document defines how fingerscore shows a fingering on a drawing of the instrument: a Fingerings page of its own, and a Fingering panel on the sheet page and the Scales page. It is written for the builder. The design comes from the owner's mockup "Concept · Fingerings on the instrument" (`FingeringsView.dc.html` on the fingerscore design canvas). The drawings come from the key map prototype on this branch (`src/render/keymap/`, dev page `/dev/keymap`).

## 1. Intent

The fingering chart is an abstract column of dots. A beginner does not know which dot is which key on the instrument, and a player switching instruments does not either. Showing the chart beside a drawing of the instrument, key for key, answers "where is that key?" for any note, on its own page or next to the song being learnt.

## 2. Goals, non-goals, anti-goals

**Goals**

1. A Fingerings page (`/fingerings`) that shows any note on any of the twelve instruments: the chart, the instrument from two sides, the keys to press, and every sourced alternate.
2. A Fingering panel on the sheet page that follows the song note by note, and on the Scales page that walks the scale.
3. One view, three places: the page and both panels use the same component, so a key highlights the same way everywhere.
4. A link to the panel from the alternate-fingering popover, and to the page from the range banner.

**Non-goals:** a printable whole-range chart (the mockup's "Print chart"; a later option); tips on when to use an alternate (the mockup's "Smoother for F–F♯ trills" lines; there is no sourced text for them); drawings in print, PDF or play mode; sound when a note is picked (the mockup's "point to hear"; see §7); one drawing per size within a family (piccolo, alto flute and alto recorder use their family's drawing).

**Anti-goals**

- A guessed fingering. A note without a sourced fingering says so and shows no keys, as on a sheet.
- A change to a sheet from the Fingerings page. The page only looks; the sheet panel picks fingerings, with undo, exactly as the popover does.
- A key that cannot be found. Every key of a chart shows in at least one drawing (a test pins this).

## 3. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A** | **One `FingeringView` component (chart, drawings, key list, alternates), placed by a page and by a panel** (chosen) | One place for the linking logic and the drawings; the panel passes a narrow layout and a fingering-picking callback. |
| B | The page only; the sheet links to it | Less to build, but the player leaves the song to look a note up; the mockup asks for the panel. |
| C | A dialog over the sheet (the first proposal in conversation) | Covers the music the player is reading; no stepping through the song. |

## 4. What gets built

### 4.1 The view (`FingeringView`)

- **Stage header:** the written note large ("B♭4"), "written · sounds {concert}" for transposing instruments, then "{instrument} · {fingering name}" and a tag naming the option ("Standard", "Alternate 2").
- **Chart:** the full key map chart (`FingeringChart`, style full), large.
- **Drawings:** the instrument model's views (`InstrumentDrawing`): two fixed views per instrument, each chosen so that no part of the instrument hides a key. They are drawn on a canvas of one fixed size for every instrument (the owner's finding of 2026-11-28: the clarinet took far more room than the saxophone, the flute was too small to read), scaled to fill it at one scale for both views, and turned within the model's tilt range where that draws them larger: the flute lies diagonally, the straight instruments may lean. Lines keep one width at any scale. On the page the note picker sits in a bar above the stage, so the canvas gets the full width. On the panel, one view at a time with a "Front / Behind" toggle (labels follow the model's views).
- **Press list:** the keys held down, by name and finger ("Octave key · left thumb"); "Nothing — every key open" when none.
- **Linked highlight:** pointing at a key in the chart, on a drawing or in the press list highlights it everywhere (accent fill, ring) and names it in one fixed line. Click pins the highlight; a second click or Esc unpins. The line has a fixed height, so a long name never moves the drawing.
- **Keyboard (deviation from the mockup, found in the build):** the chart's and drawings' keys are pointer-only. The chart's keys sit about 21 px apart, so as controls they could never meet the app's 36 px target size, which `e2e/accessibility.spec.ts` enforces. The keyboard and screen readers reach every key through buttons instead: the press list, and "All keys of the {instrument}", a disclosure listing every key. Focusing one highlights the key in the chart and on the drawings, as pointing does; Enter or Space pins it.
- **No fingering:** the chart's "no data" box, the drawings without pressed keys, and "No sourced fingering for this note. fingerscore never guesses."

### 4.2 The Fingerings page (`/fingerings`)

- Header navigation: Songs · Scales · **Fingerings**; "Fingerings" is current on `/fingerings`.
- **Page bar:** title "Fingerings for", the instrument select (grouped by family, as elsewhere), the recorder system (Baroque / German) for recorders, the shape (Straight / Curved) for the soprano saxophone.
- **Range strip:** the instrument's whole written range in one row of notes, each at least 34 px wide; a dot marks notes with more than one fingering; shaded: extended notes. When not all fit, the strip shows what fits and names the rest as buttons ("‹ B♭3 – D4", "C5 – F6 ›") that move a screenful minus two notes. It never wraps and never scrolls sideways; a sideways swipe, trackpad swipe or Shift+wheel moves one note. Choosing a note elsewhere moves the strip just enough to show it.
- **Note picker, left column:**
  - *Staff:* a treble staff in written pitch. Pointing at a line or space shows a ghost note with its name; outside the range the area is shaded and the tag says so. Click picks the natural note; ♭ ♮ ♯ change it. Ledger lines as needed.
  - *By name:* letter buttons C–B keep the octave; ♭ ♮ ♯; "Octave {n}" with − and +.
  - *Type:* a text field that takes C, c#, Db, F♯5, Bes, Fis (German names too); without an octave it takes the nearest note in range.
  - *Alternates:* every sourced option for the note, each with a mini chart and its name; picking one changes the view only.
- **Stage, right column:** the view of §4.1, both drawings side by side.
- **Address:** the state is in the URL (`/fingerings?inst=asax&note=Bb4&alt=2`, plus `shape=curved` and `system=german` where they apply), so a link opens on that note. Unknown or out-of-range values fall back: the preferred instrument, its written C5 (or the nearest note in range), the standard fingering.
- **Defaults:** the preferred instrument and written C5. The soprano shape is remembered in this browser (§4.8).

### 4.3 The Fingering panel on the sheet page

- **Open:** in View mode, a click on the fingering chart under a note selects the note, as a click there does today, and also opens the panel. A click elsewhere on the note keeps today's behaviour. The hint line under the mode switch says "Click a fingering chart to see it on the instrument".
- **Slot:** the panel takes the right-hand slot of the shortcuts panel (`KeysPanel`: sticky, 392 px; a drawer under 1024 px; a bottom sheet under 768 px). Only one of the two is open: opening one closes the other. Its open state is not stored; the shortcuts panel keeps its stored state.
- **Following the song:** the panel shows the selected note. The sheet's own keys move the selection as today (← → previous and next stop, Home and End), so the panel steps through the song with them; no new key. A rest shows "Rest"; a tied continuation is skipped by the sheet already. The panel's ‹ › buttons step the same way, skipping rests. With no selection the panel keeps its last note.
- **Content:** title "Fingering", "note {i} of {n}", close ✕; ‹ ›; "{written} sounds {concert} · bar {n}"; the view of §4.1 with one drawing and the Front / Behind toggle; the alternates as buttons. Picking one sets the note's fingering with the store's `setFingering` (the automatic option clears the pick), the same action as the ⇅ popover: one undo step per pick.
- **Close:** ✕, or Esc while focus is in the panel; focus returns to the sheet. Esc on the sheet clears the selection as today and leaves the panel open on its last note.
- **Link:** "Open in Fingerings ↗" opens the page on that note, instrument and fingering.

### 4.4 The Fingering panel on the Scales page

The same panel. The Scales page has no selection: a click on a note's chart opens the panel on that note, and ← → while focus is in the panel, or ‹ ›, walk the scale up and down. Picking an alternate sets the scale's pick for that note (`pickFingering`, stored with the scale's settings), as the scale's popover does.

### 4.5 Entry points

| Where | What |
|---|---|
| Header | "Fingerings" link (§4.2) |
| Sheet, View mode | click a chart under a note (§4.3) |
| Alternate-fingering popover | a "Show on instrument" link at its foot opens the panel on that note |
| Scales page | click a note's chart (§4.4) |
| Range banners (notes out of range; notes that need extended fingerings) | "Show fingerings" opens the page on the highest such note. An out-of-range note has no sourced fingering, so the page says so; that is the point: the player sees why the sheet marks it red. |
| Play mode, print, PDF | unchanged: no panel, no drawings |

### 4.6 Keyboard shortcuts

New entries in `GROUPS` (`src/ui/shortcuts.ts`), with rows in `rowFor`, `aria-keyshortcuts` on the controls and the README key table:

- **Fingerings page** (a new group): ↑ ↓ semitone; Ctrl/⌘ + ↑ ↓ octave; A–G note name. None works while focus is in the text field.
- **Sheet:** no new key. The panel follows the selection, so the "Move and listen" keys step it. Esc in the panel closes it, which joins the "Move and listen" group's Esc row.
- **Scales page** (a new group): ← → previous and next note while focus is in the panel; Esc closes it.

### 4.7 Drawings: data and checks

- One model per chart family (sax, clarinet, flute, recorder, Xaphoon); the soprano saxophone has a straight and a curved model. Key ids are the chart's (`h0`… for the column, the `SATS` ids for the rest).
- Tests: every model has exactly its chart's keys; every key shows in at least one view; no part of the instrument covers a key shown in a view.
- The models are loaded on demand with the view, not with the shell or the sheet page.

### 4.8 Storage

`fingerscore.fingerings` in localStorage holds `{ soprano: 'straight' | 'curved' }`, read and written through `src/shell/storage.ts` and listed in `STORAGE_ITEMS`, so the Privacy page names it and `storageItems.test.ts` pins it. Everything else lives in the URL.

## 5. Code

- `src/render/keymap/`: models, projection, `InstrumentDrawing`, `ChartTargets` (from the prototype).
- `src/ui/fingering/FingeringView.tsx`: the view of §4.1; `FingeringPanel.tsx`: the panel of §4.3–4.4.
- `src/pages/Fingerings.tsx` and `src/pages/fingerings/`: the page, the range strip, the staff picker, the name picker.
- `src/domain/noteText.ts`: reading a typed note name (English and German) to a written pitch. Unit-tested.
- `src/shell/routePages.ts`, `routes.tsx`, `Header.tsx`: the route and the link. `bundle-budget.json`: a route budget for `/fingerings` and a feature budget for the panel.
- `/dev/keymap` and `src/pages/DevKeymap.tsx` are removed once the page exists.
- Tests that list the header links (`App.test.tsx`, `App.boundary.test.tsx`, `routes.test.tsx`, `e2e/scales.spec.ts`) gain "Fingerings". `e2e/states.ts` gains accessibility states for the page, the sheet panel and the Scales panel.

## 6. Delivery

Four steps, one commit each, in one pull request (the owner's decision of 2026-11-27, replacing one pull request per step): the steps share the view and the models, and the page and both panels are reviewed together. Each commit passes the tests and leaves the branch free of SonarCloud issues before the next step starts, so the pull request can be reviewed commit by commit. It stays a draft until step 4 is in.

1. The view (§4.1) and the page with the instrument select, the name and text pickers, the alternates, the keys and the address; the header link; storage.
2. The staff picker and the range strip.
3. The sheet panel (§4.3) and the popover link.
4. The Scales panel (§4.4) and the range banner link.

## 7. Calls made by the author, for the owner to confirm

1. No tips on alternates: there is no sourced text; the fingering names stay.
2. No sound when a note is picked in this round; the woodwind voice could play it later.
3. The panel shows one drawing at a time, with a toggle, as in the mockup; the page shows both.
4. The soprano shape is a stored preference, not a setting of the sheet.
5. The hint "Click a fingering chart…" shows in the sheet's hint line under the mode switch, not as a banner.
6. On the sheet the panel follows the selection and uses the sheet's existing ← → keys, rather than keys of its own that would clash with them. The mockup's "skip rests" holds for the panel's ‹ › buttons; the keys keep stopping on rests, as they do today.
7. **Added in the build (step 4):** a "Fingering" button in the page bar of the sheet and the Scales page, and the key I on both, open and close the panel. A chart click is pointer-only and the popover link only exists for notes with alternates, so without them the panel had no way in from the keyboard (WCAG 2.1.1); a learner also opens it often, which CLAUDE.md asks a shortcut for. I is unused on the sheet in every mode.
8. **Added in the build (step 4):** the Fingerings page's address takes a note up to two octaves outside the range, so the red range banner's link can open the page on a note the sheet marks red; the page then says there is no sourced fingering.

## 8. Open points

- Key positions and hole spacing are estimates from typical instruments; a player of each family should check them. Particular doubts: the order of the sax palm keys, the clarinet's left-pinky cluster, the flute's trill keys, and which finger covers the Xaphoon's top hole (the drawing assumes the left index).

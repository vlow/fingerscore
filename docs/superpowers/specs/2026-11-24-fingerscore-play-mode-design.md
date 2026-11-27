# fingerscore: play mode — design

Date: 2026-11-24 · Status: approved by the owner on 2026-11-24

This document defines play mode, the performance view of a sheet. It is written for the builder. Section numbers (§) refer to `fingerscore-handoff/SPEC.md`; play mode is §11a, and the prototype is the `perform` branch of `fingerscore-handoff/prototype/Editor.dc.html`.

## 1. Intent

A player reads the sheet from a tablet on a music stand or from a laptop while playing. The editor around the paper distracts, the paper is small, and both hands are on the instrument. Play mode shows only the paper, large, and moves it without hands.

## 2. Goals, non-goals, anti-goals

**Goals**

1. A "Play mode" button on the sheet page opens a full-screen view with only the paper.
2. The player turns pages by toolbar button, tap zone, key or Bluetooth pedal.
3. The sheet can scroll by itself at a speed tied to the tempo, adjustable from 50% to 200%.
4. The paper zooms from 75% to 200%. The screen stays awake.
5. The audio button reads "Listen" so nobody confuses it with play mode.

**Non-goals:** auto-scroll that follows repeats (the music jumps back, the scroll keeps going); a cursor that follows the notes; audio in play mode; a metronome. (Play mode on the scales page was a non-goal here; `2026-11-27-fingerscore-scales-play-mode-design.md` adds it.)

**Anti-goals**

- An edit made from play mode. Nothing in it changes the document.
- A second sheet renderer. Play mode draws the same `Paper` as the editor.

## 3. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A** | **A `PlayMode` overlay that renders `Paper` with a `readOnly` flag** (chosen) | One renderer. The flag removes title inputs, hit areas and the under-chart slot. |
| B | Hide the editor chrome with CSS and keep the page as is | Hit areas and inputs stay in the DOM and in the tab order; the scroll container is the window, shared with the editor. |
| C | A separate route `/play` | A URL the player could bookmark, but the document lives in the store and the route adds navigation state for no gain. |

## 4. What gets built

### 4.1 Entry and exit

- `Transport` gains an outlined teal **Play mode** button (music-stand icon, title "Show only the score, with page turning and auto-scroll") left of the audio button.
- The audio button reads **Listen** / **Listen from selected** / **Stop**. The sheet's screen-reader label becomes "… Enter listens from it." Existing tests change with it.
- Entering stops audio, switches to view mode, clears the selection and closes the alternate-fingering popover. Auto-scroll starts off.
- **Esc** or **Exit** leaves. Focus returns to the Play mode button.
- The overlay is `position: fixed; inset: 0`, background `#EEF0F2`, above the app header. While it is open the editor behind it is `inert`. It is hidden in print.

### 4.2 Paper

`Paper` gets `readOnly`: title and subtitle are plain text (an empty one draws nothing), `SystemView` draws no hit areas, no selection, no under-chart or under-system slots. The paper is zoomed with CSS `zoom`, as in the prototype.

### 4.3 Page turning

- A turn scrolls by 88% of the visible height, smooth, clamped to the ends.
- Next: › button, right tap zone (12% of the width, above the toolbar), → ↓ Page Down Space. Previous: ‹ button, left tap zone, ← ↑ Page Up.
- Indicator "Page n / m", `aria-live="polite"`, with m = ⌈(scrollHeight − clientHeight) / (0.88 · clientHeight)⌉ + 1 and n = ⌊scrollTop / (0.88 · clientHeight) + 0.05⌋ + 1, capped at m.

### 4.4 Auto-scroll

- Toggle button "Auto-scroll" / "Pause", `aria-pressed`, key **A**. Off by default.
- A `requestAnimationFrame` loop adds whole pixels to `scrollTop`. It stops at the end of the sheet. Manual scrolling and turning work while it runs.
- **Pace (deviation from §11a, the owner's decision):** the spec fixes a line at 16 beats. The app paces every line by its own beats: the line at the reading line passes in `beats · 60 / tempo / factor` seconds, and the speed is `systemHeight · zoom` pixels in that time. An average over the sheet was tried first and ran 23% fast on the demo, because its last line holds one bar.
- **Reading line:** the music is kept 35% down the screen. After Auto-scroll is pressed, and after a page turn, the sheet waits until the music has come down from the top to that line, then moves. Without the wait the line being played leaves the screen at the top while it is played. The readout counts down: "100% · starts in 8 s".
- Slider 25–150% in steps of 5, readout "100% · 1 line / 10 s" for a full line. 100% is the pace of the music; players slow the scroll down more often than they speed it up.

### 4.5 Size, wake lock, preferences

- **A−** / **A+** and keys **−** / **+** (also **=**) change the zoom by 25 points between 75% and 200%. Default 125%.
- **Fit to width (deviation from §11a, the owner's decision):** the paper is never wider than the screen. The zoom on screen is the chosen zoom or `(scroller width − 24) / 940`, whichever is smaller; the chosen zoom stays stored. A+ is off at that limit; A− steps from the size on screen to the next size on the 25-step grid.
- The Screen Wake Lock is requested on entry where the browser has it, requested again when the page becomes visible, and released on exit.
- Zoom and speed factor are stored in `localStorage` under `fingerscore.playmode`. They are not part of the document or the undo history. Values outside the ranges fall back to the defaults.

### 4.6 Toolbar

A dark floating bar at the bottom centre, wrapping on small screens: Exit · ‹ Page n / m › · Auto-scroll, Speed · A− A+. Colours and sizes follow the prototype.

## 5. Code

- `src/domain/playMode.ts`: pure functions for line seconds, scroll speed, page count, page number, turn target, clamped zoom and speed. Unit-tested.
- `src/state/playModePrefs.ts`: read and write the preferences.
- `src/ui/PlayMode.tsx` + CSS module: overlay, keys, toolbar, auto-scroll loop, wake lock.
- `src/render/Paper.tsx`, `SystemView.tsx`: `readOnly`.
- `src/ui/Transport.tsx`, `src/pages/SheetPage.tsx`: the button, the rename, the state.
- `e2e/play-mode.spec.ts`: acceptance check 8.
- `fingerscore-handoff/` is replaced by the new handoff, without `reference/`.

## 6. Left to the builder

File-internal structure, CSS details, and how the tests reach scroll geometry in jsdom.

# Play mode tempo and metronome

For the builder and the owner. Play mode gets one tempo per sheet that drives both the auto-scroll and a new metronome.

## Intent

A player practises a piece slower than written and wants to hear the beat while reading from the screen. Today Play mode has a speed slider in percent and no sound. After this change the player sets one tempo, shown in BPM. The scroll and the click follow it, and Play mode remembers it for that sheet ("this piece I can play at 96 so far").

## Goals

- One tempo control in Play mode, in BPM. Moving it changes the scroll speed and the click together. The readout shows BPM and the share of the sheet's tempo, for example `♩ = 96 · 80 %`.
- A metronome toggle in the toolbar and on the key M.
- The tempo is remembered per sheet, on this device.

## Non-goals

- The metronome does not follow the music's position: no sync to the bar under the reading line, no count-in tied to auto-scroll.
- No volume control, no choice of click sound, no visual beat flash.
- The Play mode tempo is not in Download JSON or Export all.

## Anti-goals

- Play mode must not change the sheet. Setting the tempo never marks the sheet "Unsaved changes" and never adds an undo step. Listen on the sheet page keeps playing at the sheet's tempo.
- The click must not drift or stutter when the tab is busy: it is scheduled on the audio clock, not on timers.

## Approaches

- **A. A per-device map keyed by sheet id (picked).** `fingerscore.playmode` holds `{ zoom, tempos: { [libraryId]: bpm } }`. Play mode stays read-only, and the sheet format does not change. The cost: the tempo is not in backups.
- B. A field in the sheet (`doc.playTempo`). It travels with backups, but every change marks the sheet unsaved, and Save is out of reach in Play mode.
- C. A field in the sheet that Play mode writes straight into the library entry. It bypasses Save and reorders "Your sheets", or needs a special case to avoid that.

The owner picked A.

## Decided

- **Stored value:** a BPM (quarter notes per minute), not a percentage. A later change to the sheet's tempo leaves the stored BPM alone. The device-wide `speed` percentage goes away; under the no-compatibility rule, the stored format changes in place.
- **No stored BPM:** Play mode opens at the sheet's tempo (100 %).
- **Unsaved sheet:** it has no library id. Its tempo lives in memory for the visit. When the sheet is saved and gets an id, the tempo is stored under that id.
- **Scroll:** the scroll speed is computed from the Play mode BPM where it now uses `doc.tempo × speed %`.

## Calls left to the builder (proposals, owner may correct)

- **Range:** the slider runs in whole BPM from 25 % to 150 % of the sheet's tempo, as the speed slider does today, kept within 20–300 BPM. A stored BPM outside the range is clamped on read.
- **Beat unit:** a quarter in 4/4, 3/4 and 2/4, a dotted quarter in 6/8, a half in 2/2. The first beat of each bar is accented with a higher pitch. The readout stays in quarter notes, like the sheet page's `♩ =`.
- **Sound:** a short synthesized click through Web Audio, on its own AudioContext, scheduled ahead the way `src/audio/player.ts` schedules notes. A tempo change takes effect at the next beat, without restarting the bar.
- **Lifetime:** the metronome starts off every time Play mode opens and stops when Play mode closes. It runs whether auto-scroll is on or off.
- **Pruning:** writing the prefs drops tempos whose sheet id is no longer in the library, so a deleted sheet leaves nothing behind. Writing is not done on delete, so Undo within a few seconds keeps the tempo.
- **Shortcut:** M toggles the metronome. It is added to `GROUPS` and `rowFor` in `src/ui/shortcuts.ts`, to the button's `aria-keyshortcuts` and tooltip, and to the README key table. No key for changing the tempo: players set it before they play, and the slider keeps its arrow keys.

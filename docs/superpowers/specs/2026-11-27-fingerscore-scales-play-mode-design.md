# Play mode on the Scales page: design

Owner's request of 2026-11-27. Replaces the non-goal "play mode on the scales page" in `2026-11-24-fingerscore-play-mode-design.md`.

## Intent

A player practises a scale from a screen on the music stand and wants it shown without distraction, as a tune is in Play mode. On a small screen even a short scale needs auto-scroll, and later scale styles may span several pages.

## Goals, non-goals, anti-goals

- **Goal:** the Scales page gets a Play mode button. Play mode there does what it does for a tune: full screen, page turns by key, pedal, toolbar or screen edge, auto-scroll with the speed slider, A− and A+, the paper choice, the keys card, Esc to leave, the screen kept awake.
- **Non-goals:** audio, a tempo control on the Scales page, a shortcut to open Play mode (the sheet has none either: it is opened once per practice).
- **Anti-goal:** two copies of Play mode that drift apart.

## Approaches

1. **One Play mode for both pages (chosen).** `PlayMode` takes the content to show and a pace per line instead of a sheet. The sheet passes its `Paper` and one line per system; the Scales page passes the scale's paper and one line per scale line. One component, one set of keys and tests.
2. **A copy for scales.** About 300 duplicated lines, and every later fix made twice. Rejected.

## Design

- `PlayMode` props: `lines: { beats, height }[]`, `tempo`, `children`, `onExit`. Auto-scroll paces the line being read by its own beats and height. It finds the lines on screen by `[data-play-line]`, which a sheet system and a scale line both carry.
- **Pace for scales (owner's choice 1):** one note per beat at 60 bpm. A full line of 15 notes passes in 15 s at 100 %. The speed slider and zoom are the same stored preferences as for a tune.
- In Play mode the scale shows its caption, staff, charts and legend with the player's picks, and no fingering pills.
- The Play mode loader moves from `src/pages/sheet/` to `src/ui/` so both pages share one chunk, and a failed load shows the same notice on both pages.
- Leaving Play mode returns the focus to the Play mode button.

# fingerscore — handoff package

Everything needed to build **fingerscore.eu**: a browser-only web app that turns song files into sheet music with fingering charts for woodwinds.

## Contents

| Path | What it is |
|---|---|
| `SPEC.md` | **Functional specification** — the source of truth for behaviour, algorithms, data formats, design system and acceptance checks. |
| `CLAUDE.md` | Build instructions and conventions for Claude Code (stack, structure, commands, rules). |
| `data/instruments.json` | 12 instruments: transposition, ranges, chart kind. |
| `data/fingerings.json` | Fingering chart layouts, satellite keys, fingering tables + alternatives, derivation rules, data review status. |
| `data/scales.json` | Scale definitions and spelling tables. |
| `data/sample-song.json` | The demo song ("The Water Is Wide", as imported from MIDI) in the document model. |
| `data/glyphs.json`, `data/glyphs/*.svg` | Treble clef, accidentals and rests as outline paths (GNU FreeSerif) with placement transforms. |
| `prototype/*.dc.html` | The clickable design prototype (one file per screen). Open them as reference for layout, copy and interaction; the logic inside each `<script type="text/x-dc">` block is a working reference implementation of the algorithms. They need the Design-canvas runtime (`support.js`, not included) to run — read them, don't ship them. |
| `prototype/canvas.json` | Layout of the design canvas (which screen is which). |
| `reference/` | The songbook page the fingering style is modelled on (internal reference only — do not publish). |

### Prototype screens
`Main` start page · `Tracks` choose a part · `Editor` sheet editor (suggested key) · `EditorOutOfRange` original key with range warnings · `EditorAltoSax` / `EditorRecorder` / `EditorClarinet` other instruments · `Scales` · `About` · `Imprint` · studies: `PickerOptions` (instrument picker, option A chosen), `FontOptions` (option C, Atkinson Hyperlegible, chosen), `SaxFingeringStudy` (compact + full key map chosen), `ClarinetFingeringStudy`.

## Suggested prompt for Claude Code

> Read `CLAUDE.md` and `SPEC.md` in this folder. Build fingerscore as described: set up the project, then implement it milestone by milestone (see the milestone list in CLAUDE.md), using the JSON files in `data/` as the source of truth and the prototypes in `prototype/` as visual and behavioural reference. After each milestone, run the tests and the acceptance checks from SPEC §16 that apply, and summarise what's done and what's next.

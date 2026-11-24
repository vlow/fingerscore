# CLAUDE.md — building fingerscore

Read `SPEC.md` first. It is the source of truth; `prototype/` is the visual/behavioural reference; `data/` holds the domain data. Don't invent fingerings, ranges or legal text — use `data/` and mark gaps as TODO.

## Stack (recommended)
- **Vite + TypeScript (strict) + React 18**, plain CSS modules or a small token file (no UI kit; the design is custom).
- State: a single document store (e.g. Zustand or a reducer) with an undo/redo history of document snapshots (SPEC §10). Keep UI state separate.
- Rendering: **SVG** components for staff, notes, glyphs and fingering charts.
- Parsing: `@tonejs/midi`, `jszip` (.mxl/.mscz), `DOMParser` (MusicXML/MSCX), `abcjs` (ABC parser only).
- Audio: Web Audio API (no samples in v1).
- PDF: print stylesheet first; then `jspdf` + `svg2pdf.js`.
- Storage: localStorage (library, last instrument) behind a small repository module (swap to IndexedDB later).
- Fonts: self-host **Atkinson Hyperlegible** (`@fontsource/atkinson-hyperlegible` or the files from the Braille Institute). No requests to Google.
- Tests: **Vitest** for domain logic, **Playwright** for the acceptance checks in SPEC §16.
- Static hosting (any CDN). No backend, no analytics, no cookies.

## Suggested structure
```
src/
  domain/        instruments.ts, fingerings.ts, keys.ts (spelling, key signatures), transpose.ts (scoring),
                 chooser.ts (Viterbi fingering choice), score.ts (document model + edit ops + bar-fill rules),
                 chords.ts (parse/transpose/format), lyrics.ts (bulk fill), playback.ts, scales.ts, persistence.ts (file format, validation, migration)
  import/        midi.ts, musicxml.ts, mscz.ts, abc.ts, melody.ts (detection), harmony.ts (chord detection)
  render/        Staff.tsx, System.tsx, Note.tsx, Glyph.tsx, FingeringChart.tsx, layout.ts
  ui/            Header, Footer, PageBar, InstrumentPicker, DropZone, Gallery, KeyBridge, RangeMeter, ModeSwitch,
                 NotePanel, LyricPanel, ChordPanel, AltFingeringPopover, FileMenu, Transport, ...
  pages/         Start, Tracks, Sheet, Scales, About, Imprint, Privacy
  data/          ← copy of ../data/*.json (import as typed modules)
```

## Milestones
1. Project setup, design tokens, header/footer, routing, static About/Imprint.
2. Domain core with unit tests: instruments, spelling/key signatures, transposition scoring (SPEC §6.3 + §16 checks 1–4), fingering lookup incl. derived registers, Viterbi chooser.
3. Renderer: staff, glyphs (`data/glyphs.json`), notes/rests/beams/ties/repeats, fingering charts (compact + full), chords, lyrics — render `data/sample-song.json` to match the prototype.
4. Sheet page: sidebar (instrument, key bridge, suggestions, range meter, show toggles), banners, alternate-fingering popover.
5. Editing modes (notes, lyrics, chords, title), undo/redo, keyboard shortcuts.
6. Playback (Listen) and Play mode (performance view with page turning and auto-scroll, SPEC §11a).
7. Persistence: document format + validation, library, File menu, gallery, drop zone for JSON.
8. Import: MIDI first (with the demo file behaviour), then MusicXML/.mxl, .mscz, ABC; track page; melody + harmony detection.
9. Scales page.
10. PDF export, accessibility pass, Playwright acceptance suite, performance pass.

## Rules
- Pitches are MIDI numbers. Store **concert pitch in the original key** plus `shift`; written = concert + shift + instrument.off. Never store written pitches in the document.
- Durations are integers in eighth notes (1,2,3,4,6,8). Bars always sum to their capacity.
- Use **stable event IDs** for everything attached to events (lyrics, chords, fingering overrides).
- Don't re-suggest the key after the user edited notes.
- English UI only. Text in SPEC is the copy to use; keep it consistent (e.g. "Sounds in · concert pitch", "You read · written pitch").
- Accessibility per SPEC §15 is a requirement, not polish.
- Credit GNU FreeSerif (glyph outlines) and The Woodwind Fingering Guide (clarinet/flute data) on the About page.
- Fingering data for sax, recorder and parts of Xaphoon/clarinet is **draft** — keep the "fingering data: draft" legend suffix until reviewed, and keep the data in JSON so musicians can correct it without touching code.

## Commands (after setup)
`npm run dev` · `npm test` · `npm run test:e2e` · `npm run build`

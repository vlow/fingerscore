# Generated PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Download PDF" on the sheet page and on the Scales page produces a paginated vector PDF of the paper, built in the browser, with every character drawn.

**Architecture:** A lazy module `src/pdf/` is the only place that imports the PDF libraries. It renders the app's own SVG components (`SystemView`, the scale lines) off screen, prepares the SVG for conversion, lays out the text parts (title block, legend, footer) itself, and writes pages with `jsPDF` and `svg2pdf.js`. The page model (sizes, pagination, title fitting, legend wrap), the character check and the file names are pure functions with unit tests; the PDF content is tested in a real browser and read back with a PDF parser.

**Tech Stack:** TypeScript 7 strict (no `Array.prototype.at`), React 18, Vite 8, Vitest, Playwright. New: `jspdf`, `svg2pdf.js` (runtime, lazy chunk); `pdfjs-dist` (development only, for tests).

**Spec:** `docs/superpowers/specs/2026-11-24-fingerscore-v2-pdf-design.md`

## Global Constraints

- No network request with sheet content. The PDF libraries and fonts load only on the first "Download PDF"; the entry chunk (`dist/assets/index-*.js`) stays at or below 400,000 bytes and must not contain the PDF library.
- Page: A4 210 × 297 mm; US Letter 215.9 × 279.4 mm when the browser's first language has the region `US` or `CA`. Margins 12 mm. The 860 units of a system fill the width between the margins.
- A system and a scale line are never split across pages.
- Embedded fonts: Atkinson Hyperlegible Regular, Bold, Bold Italic, each as Latin and extended-Latin TrueType files, with the OFL licence text committed beside them.
- Symbols drawn as outlines: ♭ ♯ ♮ 𝄫 𝄪 ♩ Δ ‿ ● ○ ◐.
- Exact texts: menu entry `Download PDF`; while building `Preparing PDF…`; live line `Preparing PDF, page {n} of {N}` (only when N > 10); `The PDF can't show these characters: {list}. Use Print instead.` (at most 12 distinct characters, comma-separated, then ` and {n} more`); `The PDF could not be made. Use Print instead.`; load failure = `LOAD_FAILED` from `src/loadFailed.ts`; page footer `{title} · page {n} of {N}` or `page {n} of {N}`.
- File names: `{title}-{instrument}.pdf` / `{key}-{scale}-{instrument}.pdf`, each part lower case, runs outside `a–z0–9` → `-`, trimmed, empty parts dropped; an untitled sheet uses `sheet`.
- Document properties: title, subject (subtitle), creator `fingerscore`.
- `samples/` and `fingerscore-handoff/reference/` are never committed.
- A task is done only when `npm test` and `npx tsc --noEmit -p .` pass. Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. Every one of the eleven symbols in each text kind (title, subtitle, lyric, chord, legend, tempo line, key line), and a text that mixes both font files and a symbol ("Łódź in B♭"). Expected: every character is in the PDF at its place; nothing is dropped; the text is as wide and centred as on screen within one unit. (Tasks 1, 3.)
2. Page breaks for 1 to 9 systems on A4 and on Letter, with and without a title block, and a legend that does not fit after the last system. Expected: no system straddles a page, the legend moves to a new page alone, the footer appears only from two pages. (Tasks 2, 3.)
3. Sheets that draw less or more than the sample: Show switches off for lyrics, chords and fingerings; notes outside the range (amber, red box); triplets with brackets above and below; endings; ties across a line break; raised chord extensions; a squeezed lyric. Expected: all inside the margins, nothing clipped at a system's edge. (Task 3.)
4. Clicking "Download PDF" twice, leaving the page while a long PDF is prepared, and a failed load of the PDF chunk or a font. Expected: one download; no download after leaving; the load message. (Task 5.)
5. A Cyrillic lyric, an emoji in the title, a lone combining accent. Expected: no PDF, the message names the characters (at most 12, then "and n more"). (Tasks 2, 5.)

---

### Task 1: Proof in a real browser, fonts, and the conversion rules

**Files:**
- Create: `scripts/make-pdf-fonts.ts`, `src/pdf/fonts/*.ttf` (six files), `src/pdf/fonts/OFL.txt`, `src/pdf/fonts/coverage.json`, `src/pdf/spike.ts`, `e2e/pdf-spike.spec.ts`, `e2e/readPdf.ts`
- Modify: `package.json` (`jspdf`, `svg2pdf.js`; dev `pdfjs-dist`; script `fonts`), `scripts/extract-glyphs.ts` and `src/data/glyphs.json` (quarter note)

**Interfaces:**
- Produces: `npm run fonts` unpacks the six WOFF files of `@fontsource/atkinson-hyperlegible` (`latin` and `latin-ext` × 400 normal, 700 normal, 700 italic) to TrueType with Node's `zlib` (WOFF 1 is a zlib-wrapped sfnt; no font library) and writes `coverage.json`: `{ "latin": number[][], "latinExt": number[][] }` as sorted inclusive code point ranges read from the fonts' character maps.
- Produces: glyph `noteQuarterUp` in `glyphs.json` (the script must fail on an empty outline, as it does for the others).
- Produces in `e2e/readPdf.ts`: `readPdf(bytes: Uint8Array): Promise<{ pages: { width: number; height: number; text: { str: string; x: number; y: number; width: number }[] }[]; fonts: string[] }>` using `pdfjs-dist` in Node.
- Produces a written record in the task report (not code): for each SVG feature below, whether `svg2pdf.js` converts it correctly as emitted, or which preparation step is needed — `<text>` with `text-anchor="middle"`, `font-weight`, `font-style`, a quoted font-family stack; `textLength` with `lengthAdjust="spacingAndGlyphs"`; `<tspan dx dy font-size>`; `paint-order="stroke"`; `fill="transparent"`; a rotated `<ellipse>`; arc path commands; dashed strokes; rounded rects; ink outside the `viewBox` with `overflow: visible`.

- [ ] **Step 1:** Install the dependencies. Write and run `npm run fonts`; check that each TrueType file opens (parse it with the dev dependency `opentype.js` in the script and compare its glyph count with the WOFF's).
- [ ] **Step 2: Failing test** `e2e/pdf-spike.spec.ts`: the page calls a dev-only hook (exposed by `src/pdf/spike.ts` behind `import.meta.env.DEV`, loaded through a dynamic import) that returns the PDF bytes for one system of the sample song with a chord `B♭m7`, a lyric squeezed by `textLength`, and a triplet; the test reads it with `readPdf` and expects: one page of 210 × 297 mm; the embedded font names contain "Atkinson"; the text items contain `B` and `m7` on one baseline with a gap between them that equals the flat outline's width within one unit (so the flat is drawn there and nothing else), and the lyric's syllables; the page has no item outside the 12 mm margins.
- [ ] **Step 3:** Implement the smallest pipeline that passes: render `SystemView` to SVG markup off screen (static markup into a detached `<svg>` in the document), apply the preparation steps you found necessary, convert with `svg2pdf.js` into a `jsPDF` page with the fonts registered. Write the feature record.
- [ ] **Step 4:** Render the PDF page to a PNG (pdfjs in the test or a headless browser) into the scratch folder and look at it beside a screenshot of the same system on screen. Put both paths in the report and name every visible difference.
- [ ] **Step 5 (gate):** If an embedded font, the `B♭` without a gap, the squeezed lyric or the triplet's outlined 3 cannot be produced with these two libraries, stop and report BLOCKED with what failed and what you tried. Otherwise `npm test`, `npx tsc --noEmit -p .`, `npm run build && npm run check:bundle` pass (the entry must not grow by more than 2,000 bytes).
- [ ] **Step 6:** Commit `feat: PDF proof — fonts, one system as a PDF page, conversion rules`.

### Task 2: Page model, characters, file names

**Files:**
- Create: `src/pdf/pageModel.ts`, `src/pdf/chars.ts`, `src/pdf/names.ts`, `src/pdf/errors.ts`
- Test: `src/pdf/pageModel.test.ts`, `src/pdf/chars.test.ts`, `src/pdf/names.test.ts`

**Interfaces:**
- Consumes: `coverage.json` (Task 1).
- Produces in `pageModel.ts`:
  - `interface PageSize { name: 'A4' | 'Letter'; widthMm: number; heightMm: number }`; `pageSizeFor(language: string): PageSize`
  - `MARGIN_MM = 12`, `UNITS = 860`; `unitMm(size)` = (width − 24) / 860; `pageHeightUnits(size)`
  - `interface Block { kind: 'title' | 'subtitle' | 'meta' | 'caption' | 'system' | 'line' | 'legend'; height: number; index?: number }` (heights in units)
  - `paginate(blocks: Block[], pageHeight: number): { blocks: Block[]; scale: number }[][]` — pages of blocks in order; a block that does not fit starts a new page; a `legend` that does not fit moves to a new page alone; a block taller than a page gets `scale` = page height / its height, alone on its page; all others `scale` 1.
  - `fitText(text: string, widthAt: (text: string, px: number) => number, maxWidth: number, px: number, minPx: number): { text: string; px: number }` — smaller until it fits, then cut with `…`.
  - `wrapLegend(legend: string, footer: string, widthOf: (text: string) => number, maxWidth: number): { lines: string[]; footerOwnLine: boolean }` — break at ` · ` separators first, then at spaces; the footer shares the last line when both fit with a gap of 24 units.
  - `footerText(title: string, page: number, pages: number): string | null` — `null` when `pages` is 1.
- Produces in `chars.ts`: `SYMBOLS` (the eleven characters); `fontFor(ch: string): 'latin' | 'latinExt' | 'symbol' | null`; `runs(text: string): { kind: 'latin' | 'latinExt' | 'symbol'; text: string }[]`; `unsupported(texts: string[]): string[]` (distinct, in order of first appearance, by code point so that surrogate pairs such as 𝄫 stay whole).
- Produces in `errors.ts`: `class PdfError extends Error { constructor(public userMessage: string) }`; `unsupportedMessage(chars: string[]): string`; `PDF_FAILED = 'The PDF could not be made. Use Print instead.'`.
- Produces in `names.ts`: `sheetPdfName(title: string, instrument: string): string`; `scalePdfName(key: string, scale: string, instrument: string): string`.

- [ ] **Step 1: Failing tests.**
  - `pageSizeFor`: `en-US`, `es-US`, `en-CA`, `fr-CA` → Letter; `en-GB`, `de-DE`, `de`, `en`, `` → A4.
  - `paginate` with a title block of heights 44 + 28 + 24 and systems of 290 on A4 (page height from `pageHeightUnits`): 1 to 9 systems → no page exceeds the height, order kept, expected system counts per page stated from the arithmetic in the test; the same on Letter; without title and subtitle; a legend of 40 that fits; one that does not → last page holds only the legend; a `line` of 1,400 units → alone with `scale` < 1; Review Focus 2.
  - `fitText`: fits unchanged; shrinks to an intermediate size; at `minPx` is cut and ends with `…`; an empty string.
  - `wrapLegend`: short legend and footer on one line; the saxophone legend (take it from `legend('asax')`) wraps at separators; footer on its own line when the last line is full.
  - `footerText('Song', 2, 3)` → `Song · page 2 of 3`; `('', 2, 3)` → `page 2 of 3`; `('Song', 1, 1)` → `null`.
  - `chars`: each of the eleven symbols → `symbol`; `é` → `latin`; `ł`, `ő`, `č` → `latinExt`; `Ж`, `中`, `😀`, a lone U+0301 → `null`; `runs('Łódź in B♭')` → `[latinExt 'Ł', latin 'ód', latinExt 'ź', latin ' in B', symbol '♭']`; `unsupported(['Жук', 'a中', 'ok'])` → `['Ж','у','к','中']`; `unsupportedMessage` with 3 characters and with 14 (lists 12, then ` and 2 more`).
  - names (the instrument part is the instrument's display name without a key in brackets, so `Alto sax (E♭)` gives `Alto sax`): `('Auld Lang Syne', 'Alto sax (E♭)')` → `auld-lang-syne-alto-sax.pdf`; `('', 'Alto sax')` → `sheet-alto-sax.pdf`; `('Ça ira!', 'Flute')` → `a-ira-flute.pdf`; `scalePdfName('C', 'major', 'Alto sax')` → `c-major-alto-sax.pdf`; `('F♯', 'harmonic minor', 'Xaphoon in C')` → `f-harmonic-minor-xaphoon-in-c.pdf`.
- [ ] **Step 2:** Run; fail. **Step 3:** Implement. **Step 4:** `npm test`, `npx tsc --noEmit -p .` pass.
- [ ] **Step 5:** Commit `feat: PDF page model, character check, file names`.

### Task 3: The sheet PDF

**Files:**
- Create: `src/pdf/engine.ts`, `src/pdf/prepareSvg.ts`, `src/pdf/drawText.ts`, `src/pdf/sheetPdf.ts`
- Modify or remove: `src/pdf/spike.ts` (the dev hook now calls the real function), `e2e/pdf-spike.spec.ts` (becomes `e2e/pdf-content.spec.ts`)
- Test: `e2e/pdf-content.spec.ts`, `src/pdf/prepareSvg.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces in `sheetPdf.ts`: `makeSheetPdf(doc: Doc, o: { language: string; onProgress?(page: number, pages: number): void; signal?: AbortSignal }): Promise<Blob>` — throws `PdfError(unsupportedMessage(...))` before any work when `unsupported` is not empty for the title, subtitle, every lyric, every chord text, the instrument and key line and the legend; throws a `DOMException` named `AbortError` when the signal fires; yields to the browser between pages.
- Produces in `drawText.ts`: `drawText(pdf, text, { x, y, px, weight: 400 | 700, italic?: boolean, anchor: 'start' | 'middle' | 'end', color, squeezeTo?: number })` — lays out `runs(text)` piece by piece from the right font file or as symbol outlines, measured so that the whole text has the anchor the SVG asked for; `textWidth(text, px, weight, italic)`.
- Produces in `prepareSvg.ts`: `prepareSvg(svg: SVGSVGElement): void` — the preparation steps recorded in Task 1 (at least: remove the transparent click areas and every element with `data-mark` or `data-print-hide`; replace each `<text>` by what `drawText` will draw, or keep it for the converter when it has no symbol, no squeeze and no halo — follow the Task 1 record; make sure ink outside the box is not clipped).
- Layout of the page parts (units; design 4.2): title 26 bold centred, subtitle 14 bold centred, meta line 12 regular muted with the tempo left and the instrument and key line right; block heights title 44, subtitle 28, meta 24; systems at their layout height; legend 11 regular with `wrapLegend`, line height 16; footer text 10 regular muted, centred, its baseline 5 mm above the bottom edge.

- [ ] **Step 1: Failing tests** in `e2e/pdf-content.spec.ts` (a dev-only hook returns the bytes for a document the test passes in; read back with `readPdf`):
  - the sample song: page count equals `paginate`'s result; each page is A4; title, subtitle, `♩ = …` line, a lyric line (syllables in order when the text items of a system are sorted by x), a chord symbol, the legend and `fingerscore.eu` are present; fonts embedded; no footer on a one-page sheet; with nine systems the footer `… · page 2 of 3` is on page 2;
  - Letter for language `en-US` (page 215.9 × 279.4 mm);
  - Review Focus 1: a document whose title, subtitle, lyrics and chords use each of the eleven symbols and `Łódź in B♭`: every latin and extended-latin character appears in the text items in order, and each symbol leaves a gap of its outline's width (assert neighbouring items' x positions against `textWidth`), none dropped;
  - Review Focus 3: a document with the Show switches off draws no lyric and chord text and no charts; a document with triplets (above and below), endings, a tie across systems, notes outside the range, raised chord extensions and a squeezed lyric: every text item and (by rendering page 1 to an image and checking that the margin strips are white) every mark lies inside the margins; the squeezed lyric's width is within one unit of its `textLength`;
  - an unsupported character → the hook rejects with the message of the Global Constraints;
  - an aborted signal → rejects with `AbortError`, and `onProgress` was called at most once more after the abort;
  - a 400-bar document completes and reports progress `n of N` for every page; put the time in the report.
  `prepareSvg.test.ts` (jsdom): click areas and marked elements are removed; a text with a symbol is replaced; a plain text is kept or replaced as the record says.
- [ ] **Step 2:** Run; fail. **Step 3:** Implement. **Step 4:** `npm test`, `npx tsc --noEmit -p .`, `npm run test:e2e` pass.
- [ ] **Step 5:** Render page 1 of the sample song and page 1 of the "everything" document to PNG in the scratch folder, look at each beside the screen, and list every visible difference in the report (fix what is wrong; name what is intended, such as the missing dashed field outlines).
- [ ] **Step 6:** Commit `feat: sheet PDF — pages, title block, legend, text with symbols`.

### Task 4: The scale PDF

**Files:**
- Modify: `src/render/ScaleStaff.tsx` (export what the PDF needs to render one line at a time with its height; the page keeps rendering as before)
- Create: `src/pdf/scalePdf.ts`
- Test: `e2e/pdf-content.spec.ts`, `src/render/ScaleStaff.test.tsx`

**Interfaces:**
- Consumes: Tasks 1-3 (`drawText`, `prepareSvg`, page model).
- Produces from `ScaleStaff.tsx`: `scaleLines(p: ScaleStaffProps): { height: number; render(): JSX.Element }[]` (or an equivalent export) — the same lines `ScaleStaff` draws, each with its own height in units; `ScaleStaff` is built on it so both cannot drift.
- Produces: `makeScalePdf(input: { inst: InstId; scale: ScaleResult; scaleName: string; caption: string; chartStyle: 'compact' | 'full'; recorderSystem: RecorderSystem; showNames: boolean; showAlternates: boolean; overrides: Record<number, number> }, o: { language: string; onProgress?(page: number, pages: number): void; signal?: AbortSignal }): Promise<Blob>` — caption 18 bold centred (block height 40), lines, legend and `fingerscore.eu`, footer `{caption} · page {n} of {N}`.

- [ ] **Step 1: Failing tests.** `ScaleStaff.test.tsx`: `scaleLines` returns as many lines as the page draws and the sum of heights equals the drawn height; the existing tests pass unchanged. `pdf-content.spec.ts`: C major on alto sax, one octave → one A4 page with the caption, eight note names, the legend with its three discs drawn (gaps as in Task 3) and `fingerscore.eu`; whole range, up and down, alternates shown on a saxophone → several pages, no line split (each line's note names lie on one page), footer with the caption from page 2; the player's picked fingering is the one drawn (compare the option name text under the picked note when alternates are shown); a caption with `♯` or `♭` is drawn in full; a line taller than a page (stub the line height through a test-only input, or use an instrument and note with the most options and say which) is scaled and alone on its page.
- [ ] **Step 2:** Run; fail. **Step 3:** Implement. **Step 4:** `npm test`, `npx tsc --noEmit -p .`, `npm run test:e2e` pass.
- [ ] **Step 5:** Render page 1 of a scale PDF to PNG, look at it beside the Scales page, list differences in the report.
- [ ] **Step 6:** Commit `feat: scale PDF`.

### Task 5: Buttons, messages, loading, bundle check, README

**Files:**
- Create: `src/pdf/request.ts`
- Modify: `src/ui/download.ts`, `src/ui/FileMenu.tsx`, `src/pages/sheet/useFileActions.ts`, `src/pages/SheetPage.tsx`, `src/pages/Scales.tsx` (+ its CSS module), `scripts/check-bundle.mjs`, `README.md`; remove `src/pdf/spike.ts` if the tests no longer need a dev hook, or keep one dev-only hook file and say so
- Test: `src/pages/SheetPage.test.tsx`, `src/pages/Scales.test.tsx`, `src/pdf/request.test.ts`, `e2e/pdf.spec.ts`

**Interfaces:**
- Consumes: `makeSheetPdf`, `makeScalePdf`, names, errors.
- Produces in `download.ts`: `downloadBlob(name: string, blob: Blob): void`; `downloadText` uses it.
- Produces in `request.ts` (static, small; the only static import the pages make from `src/pdf/`): `requestSheetPdf(doc, o: { onProgress?, signal? }): Promise<void>` and `requestScalePdf(input, o)`: load the engine with `import()`, build, download under the right name; map a rejected import or font fetch to `PdfError(LOAD_FAILED)`, an `AbortError` to a silent return, a `PdfError` unchanged, anything else to `PdfError(PDF_FAILED)`.
- Sheet page: File menu order `Download PDF` (primary), `Print`, `Download JSON`, `Open JSON file…`, `New sheet`. While a PDF is prepared the entry reads `Preparing PDF…`, is disabled, and a second request is ignored. Errors go to the existing file error line. Progress goes to the sheet's existing live line when N > 10. Leaving the page aborts.
- Scales page: `Download PDF` (primary style of the old Print button) and `Print` (plain); a new `role="alert"` line under the controls for the messages; the same busy, progress and abort rules.
- `check-bundle.mjs` also fails when the entry chunk contains the string `jsPDF` or `svg2pdf`.

- [ ] **Step 1: Failing tests.** `request.test.ts` (engine mocked): each error mapping; abort is silent; the file name passed to `downloadBlob`. `SheetPage.test.tsx`: the menu order and names; clicking `Download PDF` shows `Preparing PDF…` disabled and calls the request once on a double click; a `PdfError` shows its text in the alert line; success clears an earlier error; Print still calls `window.print`. `Scales.test.tsx`: both buttons, the alert line, the request receives the current settings and picks.
- [ ] **Step 2:** Implement; `npm test` passes.
- [ ] **Step 3: End-to-end** `e2e/pdf.spec.ts`: sample song → File → Download PDF → a download named `…-….pdf` whose bytes start with `%PDF` and which `readPdf` reads with the title in it; the Scales page → Download PDF → `c-major-….pdf`; a Cyrillic lyric typed in Lyrics mode → the unsupported-characters message and no download; the PDF chunk request aborted (as `e2e/parser-load.spec.ts` does for parsers) → the load message; start a PDF for a 400-bar sheet and navigate away → no download event within two seconds (Review Focus 4).
- [ ] **Step 4: README.** A section "PDF": what Download PDF contains; A4 or Letter by browser region; the font and that the text is searchable; which characters are supported (Latin and extended Latin, the eleven symbols) and what happens otherwise; Print remains; the PDF is made in the browser and nothing is uploaded; the libraries load on the first click. Remove "generated PDF" from the list of missing features. Keep the file's style.
- [ ] **Step 5:** `npm test`, `npx tsc --noEmit -p .`, `npm run build && npm run check:bundle`, `npm run test:e2e` all pass; put the four results and the chunk list (PDF chunk and font sizes) in the report.
- [ ] **Step 6:** Commit `feat: Download PDF on the sheet and Scales pages`.

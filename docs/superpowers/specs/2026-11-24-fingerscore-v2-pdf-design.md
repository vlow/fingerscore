# fingerscore version 2, part 5: generated PDF — design

Date: 2026-11-24 · Status: approved by the owner on 2026-11-24; revised during the build (see section 5)

This document defines part 5 of version 2: "Download PDF" for a sheet and for a scale page. It is written for the builder. Behaviour comes from `fingerscore-handoff/SPEC.md` §13.2 and §13.3; this document lists what part 5 contains and where it goes beyond the spec. Section numbers (§) refer to SPEC.md.

## 1. Intent

A player wants a file of the sheet to put on a tablet, send to a band mate or print later. Today the app opens the browser's print dialog; the result depends on the browser and its settings. A PDF made by the app is the same everywhere.

## 2. Goals, non-goals, anti-goals

**Goals**

1. "Download PDF" on the sheet page produces a paginated vector PDF of the paper only: title block, systems, legend.
2. The same on the Scales page for the scale shown.
3. Every character that is on the paper is in the PDF, or the app says which ones it cannot draw and offers Print.
4. The start page does not grow: the PDF code and fonts load on the first click.

**Non-goals:** print options (with or without charts, font size, margins), a page-size setting, a preview, tagged or accessible PDF structure, PDF/A, embedding the sheet's JSON in the PDF, a cancel button, right-to-left text.

**Anti-goals**

- A PDF with a missing character where the screen shows one (a "B" for "B♭", a gap for a lyric syllable).
- A system or a fingering chart cut by a page break.
- Any network request with the sheet's content. The PDF is built in the browser.
- A PDF library or font in the entry bundle.

## 3. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A** | **Generate from the SVG with `jsPDF` + `svg2pdf.js`, loaded on demand** (chosen; §13.3 names it as preferred) | The paper is already vector SVG, with music symbols as outlines. Vector output, embedded text font, pages under the app's control. Two dependencies in a lazy chunk. |
| B | `pdf-lib` and drawing every element by hand | Full control, but every shape of the renderer needs a second implementation that must be kept in step. |
| C | Own PDF writer | No dependency; font embedding and text encoding alone are a project. |
| D | Print stylesheet only (today) | No code, but the result differs per browser and cannot be tested. Stays as the second menu entry and as the fallback. |

## 4. What part 5 contains

### 4.1 Where it is offered

- **Sheet page, File menu (§13.2):** **Download PDF** is the first, primary (teal) entry; **Print** moves to second place; the rest is unchanged. While the PDF is built the entry reads "Preparing PDF…" and is disabled; for a PDF of more than 10 pages the page's live line says "Preparing PDF, page {n} of {N}" at every 10th page and at the last, and is cleared afterwards. A PDF in preparation stops, and nothing is downloaded, when the page is left or another sheet is opened or imported.
- **Scales page:** a primary button **Download PDF** in place of today's Print button, and **Print** as a plain button beside it. The page gains an alert line for the failures below.
- **File name:** sheet → `{title}-{instrument}.pdf`; scale → `{key}-{scale}-{instrument}.pdf`; each part in lower case. Accents become plain letters, a sharp or flat sign after a letter A to G is written as a word (`F♯` gives `f-sharp`, `B♭` gives `b-flat`, so F♯ major and F major differ), runs of other characters outside `a–z0–9` become `-`, each part is cut at 80 characters, empty parts are dropped, and the instrument's key in brackets ("Alto sax (E♭)") is dropped. The JSON file name follows the same rule. Examples: `auld-lang-syne-alto-sax.pdf`, `sheet-alto-sax.pdf` for an untitled sheet, `c-major-alto-sax.pdf`.
- **Failures**, shown in the page's alert line (`role="alert"`):
  - the PDF code or a font cannot be loaded → the app's load message ("This part of fingerscore could not be loaded. Check your connection and reload the page.");
  - characters that cannot be drawn (4.4) → `The PDF can't show these characters: {list}. Use Print instead.` (at most 12 distinct characters listed, then "and {n} more");
  - anything else → `The PDF could not be made. Use Print instead.`

### 4.2 Page model

- **Size:** A4 (210 × 297 mm). US Letter (215.9 × 279.4 mm) when the browser's first language has the region US or CA. There is no setting.
- **Margins:** 12 mm on all sides, as the print stylesheet uses today.
- **Scale:** the 860 units of a system fill the width between the margins (A4: 186 mm), so a PDF system has the proportions of the screen and of today's print.
- **Sheet, first page.** On screen the title block, the legend and the footer are page text, not part of the drawing, so the PDF lays them out itself, in the paper's sizes (in units of the 860-unit width):
  - title, 26 bold, centred. The title is cut to its first 300 characters (by code point) and every run of white space, line breaks and tabs included, becomes one space; then, if it is wider than the content, it is set smaller until it fits, down to 14; if it still does not fit it is cut with "…" (found by binary search, so a long title costs little time).
  - subtitle, 14 bold, centred, same rule.
  - one line in 12 regular, muted: the tempo "♩ = {tempo}" on the left, the instrument and keys line on the right.
  - An empty title or subtitle takes no space (on screen the empty field keeps its height; in the PDF there is nothing to click).
- **Systems** follow in order. A system is never split. A system that does not fit on the rest of a page starts the next page.
- **After the last system:** the chart legend in 11 regular, wrapped at the content width, and "fingerscore.eu" right-aligned on the legend's last line, or on a line of its own when it does not fit there. When the legend would stand alone on the last page, the page before it is scaled down to no less than 92% and centred so that the legend fits; if that is not enough, the legend gets a page of its own. This applies to sheets and to scale pages.
- **Page footer**, only when the PDF has more than one page: `{title} · page {n} of {N}` centred in the bottom margin, or `page {n} of {N}` without a title, in the small muted style of the bar numbers. The title in the footer is cut once for the document, to fit the widest footer line (`page {N} of {N}`), and is the same on every page.
- **What is drawn:** exactly what the paper shows for the sheet's settings — the Show switches for fingerings, chords and lyrics, chart style, recorder system, transposition, "raise extended notes", the player's fingering choices, amber and red marks for notes outside the range. Not drawn: the selection highlight, the playback highlight, the "⇅" buttons, the editing panel, the dashed outlines of the title fields.
- **Scales:** the caption line (18 bold, centred) as on the Scales paper, the staff lines with note names and charts (alternates stacked when that option is on), legend and "fingerscore.eu"; the notice above the paper is not part of it. Same margins, scale, break rule and footer (`{caption} · page {n} of {N}`). A staff line is the unit that is never split. A line is never scaled to fit the rest of a page: it starts the next page. Only a line taller than a page is scaled down to the page height. The caption is cut and fitted like a title. The document subject of a scale PDF is the scale name.
- **Colours** as on screen.
- **Document properties:** title = sheet title with line breaks collapsed and cut at 300 characters (or the scale caption), subject = subtitle (the scale name for a scale), creator = "fingerscore". No author, no keywords.

### 4.3 How it is built

- The systems and scale lines are made from the same React components that draw the paper (`SystemView`, `ScaleStaff`), rendered off screen for the PDF's own pagination, not taken from the live page. So the result does not depend on scroll position, zoom, window width or the edit mode. They are rendered with the sheet's own Show settings and nothing else: no forced lyric or chord line of an edit mode, no selected and no playing event, no "⇅" buttons, no editing panel; the invisible click areas of the events are left out.
- Features of the drawing that a PDF cannot take over as they are get an explicit step before conversion:
  - the white outline behind a triplet's 3 becomes a white rounded rectangle under the plain digit;
  - text that is squeezed to a given width (lyrics and chord symbols that would collide) is scaled horizontally by the measured ratio;
  - raised chord extensions become separately placed text pieces;
  - ink that reaches outside a system's box (a high chord symbol, a tuplet mark) must not be clipped.
- One module `src/pdf/` holds the page model and is the only place that imports the PDF libraries. It is loaded with `import()` on the first click; the fonts are loaded with it.
- The work is split per page with a yield to the browser between pages, so the page stays responsive for a long sheet (2,000 bars are about 125 pages). When the user leaves the page while a PDF is being prepared, the work stops and nothing is downloaded.
- The download is a file with type `application/pdf`. Where a browser shows a PDF in a tab instead of saving it (some phones), that is accepted.
- `npm run check:bundle` fails when everything that loads at start (the entry chunk and the chunks it loads with it) is over a budget of 400,000 bytes, or when that code contains PDF markers (strings of the PDF libraries).

### 4.4 Text

- **Font:** Atkinson Hyperlegible Regular, Bold and Bold Italic (SIL Open Font License) are embedded, so lyrics and chord symbols in the PDF can be searched and copied. The font package the app uses ships each of them as two files, Latin and extended Latin (the second holds letters such as ł, ő, č, ř, š, ž), in a web format. A build script unpacks them to TrueType files, which are committed with the licence text. All six files are fetched on the first click; only the files a document uses are embedded. A text is drawn piece by piece from the file that has each character.
- **Symbols the font lacks and the app itself writes** are drawn as outlines at the size and position of the text around them:
  - ♭, ♯, ♮, 𝄫, 𝄪 from the music font's outlines the app already has;
  - ♩ (tempo line) from the music font, added to the build script that extracts outlines;
  - Δ as a triangle, ‿ as an arc;
  - ●, ○, ◐ of the chart legend as the discs the charts use.
  Each symbol gets 8% of the font size as space on each side, and an accidental gets a thin outline stroke so that it matches the text weight. Widths are measured with the PDF's own font metrics. A text such as "B♭m7" is laid out piece by piece so that it is as wide and as centred as on screen. Symbols are shapes, so they are not searchable text: a search for "Bm7" finds the chord, a search for "B♭" finds nothing.
- **Check before building:** every character of the texts that are drawn (the title, subtitle, caption, instrument and key line and legend; lyrics and chord texts only when the Show switch draws them; for a scale the note names and option names when those are shown) must be in one of the embedded font files or in the symbol list. Otherwise no PDF is made and the message of 4.1 names the characters. Print remains available and draws them with the browser's fonts.
- Text is drawn in the PDF's page order so that copying a line of lyrics gives the syllables in order.

### 4.5 Tests

- Unit (no browser needed): the page model (which system lands on which page for A4 and Letter, title block present or absent, long title shrunk and cut, legend wrap, legend pushed to a new page, footer only from two pages, a scale line taller than a page), the file names, the character check over both font files, the layout of a text with symbols, the region rule for the page size.
- PDF content, in a real browser (Playwright), read back with a PDF parser that is a development dependency only: page count and page size; the title, a lyric line and a chord symbol are present as text; a sheet with ♭, ♯, ♩, Δ, ‿ and Polish lyrics has every character; the legend shows its discs; fonts are embedded; no element lies outside the margins; no system straddles two pages.
- Visual: one PDF page of the sample song and one of a scale are rendered to an image in the test run and looked at during the build; the image paths go into the task report.
- End-to-end: Download PDF on the sheet page and on the Scales page gives a download with the expected name that starts with `%PDF`; the unsupported-character message appears for a Cyrillic lyric; a failed load of the PDF code shows the load message; Print still opens the print path.
- Bundle: `npm run check:bundle` adds up every file the page loads at start (limit 400,000 bytes) and fails if one of them contains the PDF library.
- Fonts: the committed PDF fonts and `coverage.json` must match the installed font package.
- Notices: `THIRD-PARTY-NOTICES.md` and the copy served with the app must be identical.
- Production build: `npm run test:e2e:preview` downloads a PDF from the build served by `vite preview`.

## 5. Calls made by the author

1. `jsPDF` + `svg2pdf.js`, as §13.3 prefers.
2. The PDF is rendered from the components off screen, not from what is on screen.
3. A4, or Letter for US and Canadian browsers; no setting.
4. A page footer with title and page numbers from two pages on.
5. The font is embedded, Latin and extended Latin; the eleven missing symbols (♭ ♯ ♮ 𝄫 𝄪 ♩ Δ ‿ ● ○ ◐) are drawn as outlines.
6. A sheet with characters outside the font gets a message and Print, not a PDF with gaps.
7. Print stays as the second menu entry.
8. Colours as on screen; no black-and-white option.
9. The Scales page gets the same button (owner's decision of 2026-11-24).
10. An empty title or subtitle takes no space in the PDF; a title too long for the page is set smaller, then cut.
11. A scale line taller than a page is scaled down to fit.
12. Leaving the page, or opening or importing another sheet, stops a PDF that is being prepared; there is no cancel button.
13. Title, subtitle and caption: white space collapsed, cut to 300 characters, then fitted; the footer title is fitted once per document.
14. A legend alone on the last page is kept with the music: the page before is scaled down to 92% at most and centred; otherwise the legend gets its own page. Sheets and scale pages.
15. A scale line is never scaled to fill the rest of a page; only a line taller than a page is scaled. The subject of a scale PDF is the scale name.
16. File names: accents become plain letters, sharps and flats are written as words, each part is cut at 80 characters, the instrument's key in brackets is dropped. One rule for PDF and JSON.
17. The live line shows every 10th page and the last, for PDFs of more than 10 pages, and is cleared afterwards.
18. A triplet's 3 gets a white rounded rectangle under the digit.
19. The bundle check counts everything that loads at start against 400,000 bytes and looks for PDF markers in it.
20. All six font files are fetched on the first click; only the files a document uses are embedded.
21. Symbols are shapes with 8% of the font size on each side and a thin stroke on accidentals; widths come from the PDF's font metrics; they are not searchable text.
22. The character check covers the texts that are drawn: hidden lyrics and chords are excluded, scale note names and option names are included.
23. The licences of the runtime libraries and both fonts ship in `THIRD-PARTY-NOTICES.md` and as `third-party-notices.txt` with the app.

## 6. Left to the builder

The module split inside `src/pdf/`; how the off-screen SVG reaches the PDF library and how text runs are measured; the conversion script for the fonts; the progress wording beyond 4.1; the PDF parser used in tests; exact type sizes of the footer.

The plan's first task is a spike in a real browser that proves, before anything else is built: one system of the sample song as a PDF page with an embedded font, a "B♭" chord drawn without a gap, a squeezed lyric and a triplet's 3 with its outline, and the result read back by the parser in a test. If the two libraries cannot do that from this app's SVG, the task stops and reports.

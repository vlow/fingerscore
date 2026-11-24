# fingerscore version 2, part 6b: acceptance suite and accessibility pass

Date: 2026-11-24. Audience: the owner, who approves it, and the builder, who plans from it.

## 1. Purpose

Part 6b is the last part before hosting. It proves two things about the finished app and fixes what the proof turns up:

- The app does what the handoff's acceptance list (SPEC section 16) says, and what version 2 added.
- The app meets the handoff's accessibility rule (SPEC section 15): a person can use it with a keyboard, a screen reader, a phone or weak eyesight.

## 2. Goals, non-goals, anti-goals

**Goals**

- One end-to-end file with a numbered test for each of the 12 handoff checks and for each version 2 addition.
- An automated accessibility scan of every page and main state, with zero findings at the end.
- Measured checks for what a scan cannot see: target sizes, visible focus, keyboard paths, announcements, reduced motion, narrow screens.
- Fixes for every finding, including sizes and colours where the rule gives the number (owner's decision of 2026-11-24).

**Non-goals**

- No performance pass.
- No new features and no redesign.
- No test with a real screen reader or a real phone. Those need a person; section 7 lists them.
- No second browser engine. The suites run in Chromium, as today.

**Anti-goals**

- A check that cannot fail. Every new test is shown failing once, on the defect it guards or on a deliberate break.
- A scan made green by exclusions. An exclusion needs a written reason and the owner sees the list.
- A fix that changes the printed sheet or the PDF. Both are a player's working material and must come out as before.

## 3. Constraints

- Everything loaded at page start stays at or under 400,000 bytes. It is 396,061 now, so 3,939 bytes remain. If the fixes need more, the builder first moves code out of the start set. Raising the limit is the owner's decision.
- The scan tool (axe-core with its Playwright binding) is a development dependency. It is not shipped and needs no entry in the notices.
- Test files come only from `e2e/fixtures` and are made for the tests. Nothing from `samples/` or `fingerscore-handoff/reference/` is read, copied or committed.
- The existing 85 end-to-end tests and 1543 unit tests keep passing. A test changes only when the behaviour it pins is changed on purpose, and the report names each such change.
- The handoff's colours and shapes (SPEC section 15) stay unless one fails the rule. Then the nearest value that passes replaces it.

## 4. Approaches

**Acceptance suite**

1. **One numbered file, one test per check** (chosen). Anyone can see which check is covered and run exactly that one.
2. A table that maps the 12 checks to the existing tests. Cheap, but the existing tests follow the build order, cover several checks at once and leave gaps nobody sees.
3. Renumbering and regrouping the existing 85 tests. The same result as 1 with more churn and a risk of losing coverage.

**Accessibility**

1. **A scan in the real browser plus measured checks, then fixes** (chosen). The scan sees contrast, names, roles and states on the drawn page; the measured checks cover sizes, focus and keyboard.
2. A scan at unit level (jsdom). No layout, so no contrast, no sizes, no focus order.
3. A review by reading the code only. Finds less and leaves nothing behind that keeps the next change honest.

## 5. Design

### 5.1 Acceptance suite

- File `e2e/acceptance.spec.ts`. Test titles start with the check's number: `A01` to `A12` for the handoff checks in their order, `V01` onwards for version 2.
- The 12 handoff checks are taken from SPEC section 16 with their numbers.
- **The demo song differs from the handoff.** The handoff's values for checks 1, 2, 3 and 5 describe "The Water Is Wide". The app ships "Auld Lang Syne" as its sample (decided in version 1). The handoff song remains as a unit-test fixture, and unit tests already pin the handoff's values on it. So:
  - A01 pins the sample's real values on Xaphoon C: no shift, F major, C4–D5, all playable.
  - A02 forces notes out of range with a deliberate shift and checks the red banner, the red noteheads and the "!" boxes with the count the app reports.
  - A03 pins what the sample gives: alto sax writes F major and sounds A♭ major; clarinet writes C major and sounds B♭ major; tenor sax writes F major and sounds E♭ major.
  - A05 has two parts. The sample plays 56 notes in 39.0 s at ♩ = 100. A self-made ABC fixture with a repeat and two endings proves that playback takes the repeat and reaches the second ending on the second pass.
  - A10 uses the handoff's own text ("Oh love is gen-tle") in the bulk box.
  - The other checks (A04, A06–A09, A11, A12) are tested as the handoff words them.
  - The unit tests that pin the handoff's numbers on the fixture are named in a comment at the head of the file. One of them pins 78.6 s where the handoff says "≈ 76 s"; the report lists this.
- Version 2 checks:
  - V01 A MuseScore file imports with title, key, time signature, lyrics and chord symbols.
  - V02 An ABC file in a mode (Dorian) imports with its signature and mode.
  - V03 A tune in cut time imports and plays at the right speed.
  - V04 Triplets: imported, made from plain notes, changed and undone.
  - V05 Download PDF on a sheet gives a paginated file whose title, lyrics and chord letters are text.
  - V06 Download PDF on a scale gives a file with the scale's name and one chart per note.
  - V07 Scales offer both G♭ and F♯ major; E♭ blues spells its ♭5 as A♮.
  - V08 Alternate fingerings: the automatic choice follows the neighbouring notes, a manual choice survives a reload.
  - V09 The four pages open from the footer; the import notice links to the terms.
  - V10 No request leaves the origin during the whole core path.
- **When a check and the app differ:** the handoff's value stands unless a later decision of the owner changed it (for example the demo song or a wording). The test then pins the decided behaviour, and the closing report lists the difference with the decision it rests on. A difference with no decision behind it is a defect: it is fixed here when the fix is small, and reported to the owner when it is not.
- New fixtures, all self-made and small: a MuseScore file with title, key, lyrics and chord symbols (V01), an ABC tune in D Dorian (V02), an ABC tune in cut time (V03), the ABC tune with a repeat and two endings (A05).
- V08 covers a sheet, not a scale; V10 follows the whole core path, including the PDF download and its fonts.
- A unit test reads the file and fails unless A01–A12 and V01–V10 each appear exactly once.

### 5.2 Accessibility scan

- File `e2e/accessibility.spec.ts`, using axe with the rule sets for WCAG 2.0, 2.1 and 2.2 at levels A and AA.
- States scanned:
  - Start: empty; with one saved sheet (strip); library view; drop zone showing a refusal.
  - Tracks page.
  - Sheet: View, Edit notes with a note selected, Lyrics, Chords; with the out-of-range banner; alternate-fingering popover open; File menu open; PDF message for an unsupported character.
  - Play mode.
  - Scales: default; alternate popover open.
  - About, Imprint, Privacy, Terms.
- Result required: zero findings. An exclusion is allowed only for a single rule on a single element, written in the test with its reason. Known candidate: ghost keys in the "Full key map" chart (`#C3C7CE` on white), which show keys that are not pressed and carry no information on their own.

### 5.3 Measured checks

- **Target size:** every button, link, input and other control can be hit in an area of at least 36 × 36 px. Primary actions and the header navigation have at least 44 × 44 px. The test measures the area that takes the click (it asks the browser which element is under points 18 or 22 px from the centre), so a small mark with a larger invisible hit area passes, as the alternate-fingering pill does today. A link inside a sentence is exempt, as in WCAG. Known to be too small today: the footer links (about 17 px high) and the two sliders (about 16 px).
- **Notes on the paper:** the click area of a note is at least 24 px high (the WCAG 2.2 AA minimum; it is 16 px today). Its width follows the note spacing and can stay below 24 px in dense bars, because wider areas would overlap. The arrow keys move the selection from note to note as the alternative. The report states the smallest measured width.
- **Visible focus:** tabbing through each state, every stop shows a focus mark with at least 3:1 contrast against its surroundings, and the order follows the reading order.
- **Keyboard only:** one test completes the core path without a mouse: choose an instrument, open the sample, make the sheet, change a note, type a lyric, type a chord, save, download from the File menu, enter and leave play mode. No stop traps the focus. Esc closes a popover or menu and returns focus to the control that opened it.
- **States:** segmented controls, toggles, menus and popovers expose pressed, checked or expanded as the handoff requires.
- **Announcements:** import refusals and other errors are alerts. Save status, PDF progress and PDF messages are status messages. In the editing modes the app already announces the selected note in a polite live region ("Selected: G4, bar 3"); the announcement gains the note's length. The paper keeps its accessible name, which tests and users of assistive software rely on, and gains a description with title, instrument and key. Decorative drawings are hidden.
- **Reduced motion:** with the system setting "reduce motion", page turns and scrolling jump instead of gliding. The app already does this; a test pins it. Auto-scroll in play mode stays, because the player starts it.
- **Narrow screens:** at 320 px width no page scrolls sideways. The paper may scroll inside its own container, as the handoff allows.

### 5.4 Fix policy

- Sizes and colours change where the rule gives the number. The closing report shows each visible change as a before and after picture.
- Where the rule can be met in more than one way and the choice shows (for example which of two greys gets darker, or whether a row of small buttons grows or wraps), the builder picks, applies it and lists it for the owner.
- Print styles and PDF output do not change. The existing PDF and print tests guard this; a fix that would alter them is done for the screen only.

### 5.5 Order of work

1. Build the scan and the measured checks. Record every finding in `e2e/a11y-baseline.json`; the tests pass while the app has no finding beyond the baseline.
2. Fix the findings in groups (colours; sizes; names and states; focus and keyboard; announcements and motion). Each group removes its entries from the baseline.
3. Delete the baseline. The tests then require zero findings.
4. Write the acceptance suite; fix or report what it turns up.

### 5.6 Documents

The README gains a short section: what the two suites cover, how to run one check, and what was not tested (section 7).

## 6. Calls made by the author

- **Branch:** `v2-quality`.
- **Target sizes follow the handoff (44 and 36 px)**, which is stricter than WCAG 2.2 AA (24 px).
- **Notes on the paper are held to 24 px in height**, not 36, because the staff sets their size; their width may stay smaller in dense bars.
- **Target size is measured on the area that takes the click**, not on the visible mark.
- **Checks 1, 2, 3 and 5 pin the shipped sample's values**; the handoff's numbers stay pinned by unit tests on the handoff song.
- **The paper's accessible name stays**; title, instrument and key go into its description.
- **Ghost keys are treated as decoration** and may be excluded from the contrast rule.
- **Chromium only.**
- **Version 2 checks V01–V10** are my selection of what version 2 added.

## 7. Open, for the owner

- A session with a real screen reader (VoiceOver on a Mac is enough) and one on a real phone. The automated checks cannot replace them.
- Whether the start limit of 400,000 bytes may rise if the fixes do not fit in the 3,939 bytes that remain.
- From earlier parts, unchanged: the lawyer's reading of the legal texts, the details file, sub-path hosting.

## 8. Left to the builder

The helper functions of the two files, the fixtures (self-made), the grouping of fixes into commits, the exact new sizes and colours within the rule, and the wording of announcements.

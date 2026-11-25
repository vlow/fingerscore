# Open points

This file lists what is undecided, unconfirmed or unfinished in fingerscore, for the owner. It replaces the lists that existed only in build conversations. State: 2026-11-25, `main` at `20a465e`.

How to use it: decide or do an item, then delete it or move it to "Closed" at the end with the date and one line on the outcome. An item names what decides it and where the related code or text is.

## 1. Before the site is hosted

| # | Open point | What decides it | Where |
|---|---|---|---|
| 1 | The owner's details are placeholders: name, address, e-mail, phone, person responsible for content, host name and address, log retention, About lead, author bio, story. | The owner fills them in. `npm run check:release` fails while one is missing. A tag `v*` runs that check in the pipeline. | `src/content/operator.ts` |
| 2 | Terms, Privacy and Imprint are drafts. | A lawyer reads them. | `src/pages/Terms.tsx`, `Privacy.tsx`, `Imprint.tsx` |
| 3 | Is the notice at import ("Only import songs you have the rights to") enough, or is a one-time confirmation needed? | The lawyer. The owner chose the notice on the condition that it suffices. | `src/ui/RightsNotice.tsx`; drop zone, library view, File menu |
| 4 | Must Imprint and Privacy also exist in German? The site is English only. | The lawyer. | — |
| 5 | Is a phone number published in the Imprint? | The owner, with the lawyer. | `operator.ts`, field `phone` |
| 6 | The footer and About show a GitHub link only when an address is set. | The owner sets it or leaves it empty. | `src/content/repository.ts` |
| 7 | Hosting under a sub-path needs a Vite `base` and a router `basename`; neither is set. The host must answer unknown paths with `index.html`. | Where the site will live. | `vite.config.ts`, `src/shell/main.tsx`; README "Hosting" |
| 8 | Trademark clearance for the name and the logo. | The owner. | — |
| 9 | No test with a real screen reader and none on a real phone. Automated checks run in Chromium only. | One session with VoiceOver, one on a phone. | README "Checks → Not tested" |

## 2. Decisions taken for the owner that are not yet confirmed

Each of these was made during a build so that work could continue. Reversing one is a small change unless noted.

| # | Decision | Why it was made | Where |
|---|---|---|---|
| 10 | The footer reads "Your sheets are stored in your browser, not on a server." The handoff said "Nothing is stored on the server." | The host keeps request logs, which the Privacy page states. | `src/shell/Footer.tsx` |
| 11 | Terms, section Fingerings: "The fingerings are taken from published fingering charts." | The earlier wording read as if the drawings were copied. | `src/pages/Terms.tsx` |
| 12 | "Terms of Use" in the File menu is a menu entry reached with the arrow keys; Tab closes the menu. | A paragraph inside a menu is invisible to a screen reader, and the accessibility scan allows no exemption. | `src/ui/FileMenu.tsx`, `RightsNotice.tsx` |
| 13 | Alternate-fingering marks on the sheet have a 24 px click area, not the handoff's 36 px, and sit 26 px apart where notes are close. | At 36 px a mark moved under the neighbouring note. | `src/ui/AltPill.module.css`, `src/render/pillSpread.ts` |
| 14 | The notices say fingerscore uses JSZip under the MIT licence (JSZip offers MIT or GPL 3). | A dual licence needs a choice. | `THIRD-PARTY-NOTICES.md` |
| 15 | After a jump, repeats are skipped only in music already played. A repeat inside the Coda, or after the jump bar, is played. | The owner said "repeats not taken after a jump"; applied to the whole song, a repeat in the Coda never sounded. | `src/domain/playback.ts` |
| 16 | A plain D.C. or D.S. stops at a Fine if the song has one. | That is how such songs are written. | `src/domain/playback.ts` |
| 17 | A MusicXML "D.S." without words, in a file that has both a Fine and a "To Coda", becomes a plain D.S. | The file does not say which is meant. | `src/import/jumpMarks.ts` |
| 18 | Headroom above the staff is as tall as the highest thing any note draws, plus 4 px. Sheets with very high notes, and sheets with triplet marks above their notes (about 13 px per system), are taller than before. | Notes no longer run into lyrics or brackets. | `src/render/sheetLayout.ts`, `src/render/ink.ts` |
| 19 | With four or five jump marks in one narrow bar, their text can shrink below 10 px, down to 6 px. | Small text beats overlapping text, and such a bar is one the notice already names as wrong. | `src/render/JumpMarks.tsx` |
| 20 | The alternate-fingering popover loads on the first click on a mark, to stay inside the start budget. | The alternative was to load the jump marks' drawing late, which shows. | `src/pages/sheet/useAltFingering.tsx` |

## 3. Trial choices

| # | Choice | Alternative | Where |
|---|---|---|---|
| 21 | The lyric band (chord band) appears when Lyrics mode (Chords mode) is entered on a sheet without it, and goes away when the mode is left without content. Every system grows or shrinks by that band. | The bands stay during all editing and collapse only for viewing, playing, printing and the PDF. | `src/render/sheetLayout.ts`, `src/pages/SheetPage.tsx` |

## 4. Features not built

| # | Open point | Notes | Where |
|---|---|---|---|
| 22 | Repeat signs and ending brackets cannot be edited; they come from the import only. Jump marks can be edited. | A "Bar" section for them would sit next to the jump controls. | `src/ui/NotePanel.tsx`, `src/domain/edit.ts` |
| 23 | Play mode's auto-scroll moves down the page at a steady speed. It follows neither repeats nor jumps. | Following the play order means a time-indexed rewrite of the scroll. | `src/domain/playMode.ts` |
| 24 | Double Segno, double Coda and "D.S.S." are dropped at import with a notice. Quoted text in ABC ("D.S. al Coda" above a note) is not read; the decorations are. | — | `src/import/jumpMarks.ts`, `src/import/abc.ts` |
| 25 | Third endings: the model stores endings 1 and 2 only. | After a jump, a third ending plays together with the second. | `src/domain/types.ts` |
| 26 | The song title comes from the file name. | **In progress:** branch `claude/song-title-extraction-607074` holds one commit, "imports take the song title from the file, else the file name". It is not merged. | `src/import/buildDoc.ts` |
| 27 | MuseScore 1 files are refused. | The owner parked the licensing question. | `src/import/mscz.ts` |
| 28 | Chord symbols with raised extensions overlap when chords sit close, on screen and in the PDF. | `MIN_CONDENSE` sets how far text is squeezed. | `src/render/lyrics.ts` |
| 29 | A performance pass. The handoff's build order named one; none was done. | The start budget and the PDF timing tests exist. | — |
| 30 | Fingering tables other than the Xaphoon's are not signed off by players. The sheet's legend says "fingering data: draft". | A player of each instrument checks the table. | `docs/fingering-gaps.md`; README "Fingering data status" |
| 31 | A real MuseScore file with a D.S. jump has not been seen. The owner's sample files hold "D.C. al Coda". | The reader expects `jumpTo` = `segno`, which follows from the marker's label. | `src/import/mscz/shared.ts` |

## 5. Technical debt

| # | Open point | Notes | Where |
|---|---|---|---|
| 32 | The start budget is nearly used up: 409,079 of 410,000 bytes load at page start, so 921 remain. | The ready lever: load the jump marks' drawing and its two glyphs on first use, about 7,000 bytes, at the price of marks appearing a moment after the sheet. Raising the limit is the owner's decision. | `scripts/check-bundle.mjs`, `src/render/JumpMarks.tsx` |
| 33 | One wall-clock test ("300 bars of triplet sixteenths take less than twice the time of 150 bars") does not skip its budget in the coverage run, unlike two similar tests. It failed twice in local coverage runs under load and passes on the pipeline. | Use `instrumented` as the other two do. | `src/render/scaling.test.tsx`, `src/test/timing.ts` |
| 34 | Holding the reader's place when the sheet's height changes is tested in Chromium only. Firefox adjusts scroll on its own and could correct twice. | Try it in Firefox and Safari. | `src/pages/sheet/HoldView.tsx` |
| 35 | Printing while Lyrics or Chords mode is on relies on the browser's `beforeprint` event to drop the forced band. If a browser fires it late, the page prints with an empty band in every system. | Tested with dispatched events, not a real print dialog. | `src/pages/sheet/usePrinting.ts` |
| 36 | The width of jump-mark text is measured with the font loaded in the page; the PDF draws with the embedded font file. A 4 % margin covers the difference. | Matters only in a crowded bar. | `src/render/JumpMarks.tsx` |
| 37 | The whole sheet re-renders on every highlighted note during playback. | No drawing component is memoised. It has not been a problem so far. | `src/render/` |
| 38 | Symbols drawn as shapes in the PDF (♭ ♯ and others) are not searchable text. A search for "B♭" finds nothing. | By design; listed so it is not forgotten. | `src/pdf/symbols.ts` |

## 6. Housekeeping

| # | Open point | Notes |
|---|---|---|
| 39 | Five local branches from parallel sessions are fully contained in `main`: `claude/add-play-mode-extension-42904f`, `claude/backing-tracks-concept-8b9d74`, `claude/dark-mode-implementation-14886d`, `claude/design-updates-integration-797ef6`, `claude/fingerscore-cicd-pipeline-ddf2f5`. Some have worktrees under `.claude/worktrees/`. | Delete them once their sessions are done. |
| 40 | The folder `samples/` (the owner's test files) and `fingerscore-handoff/reference/` are git-ignored and must never be committed. | Standing rule. |

## Where the other records are

- What the app does not do: README, "What it does not do" and "Jump marks".
- Hosting steps: README, "Hosting".
- What the automated checks cover and what was not tested: README, "Checks".
- The design of each part, with the calls made at design time (section 6) and what was open then (section 7): `docs/superpowers/specs/`.
- Decisions made during builds were kept in ledgers that were deleted after each merge. The ones still worth knowing are in section 2 above.

## Closed

Nothing yet.

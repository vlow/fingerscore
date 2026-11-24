# About, Imprint, Privacy, Terms (part 6a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four static pages, footer links, an import notice with a link to the terms, a release check for the owner's details, and third-party notices that cover every package in the build.

**Architecture:** The four pages are lazy routes that share one article layout and read the owner's details from one content file. The footer and a small notice component load at start. Two scripts guard a release: one lists the packages in the build, one refuses placeholders.

**Tech Stack:** Vite 8, TypeScript 7 strict, React 18, react-router-dom 6, CSS modules, Vitest + Testing Library, Playwright, `tsx` for scripts.

**Spec:** `docs/superpowers/specs/2026-11-24-fingerscore-v2-pages-design.md`

## Global Constraints

- Everything loaded at page start stays at or under 400,000 bytes (`npm run build && npm run check:bundle`). It is 393,851 bytes before this plan. Footer links and notice together add at most 2,000 bytes: the start set after Task 3 is at most 395,851 bytes.
- The four pages load on demand (`lazy` + `LoadBoundary` + `Suspense`, as `/scales` does).
- English only. Site text: short sentences, active voice, no evaluative adjectives (significant, robust, seamless, key, various, comprehensive).
- The builder writes no personal detail of the owner. Name, address, e-mail, phone, hosting provider, About lead, bio and story are values starting with `TODO:` in `src/content/operator.ts`.
- No text on a page says the page is a draft. No text relies on "fair use" or on private copying.
- Every factual sentence on a page is true of the build: no cookies, no tracking, no request leaves the origin, fonts served by the app, files never uploaded.
- No request leaves the origin; `npm run test:e2e:preview` keeps passing.
- TypeScript: no `Array.prototype.at`. Commit messages end with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Never read, copy or commit anything from `fingerscore-handoff/reference/` or `samples/`. Do not stop a server on port 5173.
- Exact site strings: notice "Only import songs you have the rights to." followed by the link text "Terms of Use"; footer link texts "About", "Terms", "Privacy", "Imprint", "GitHub"; document titles "About – fingerscore", "Imprint – fingerscore", "Privacy – fingerscore", "Terms of Use – fingerscore".

## Review Focus

1. A visitor loads `/terms` directly or reloads it → the page appears (dev server and `vite preview`); the README tells the owner the host must answer unknown paths with `index.html`. Test in Task 3 (e2e, direct `goto`).
2. An optional detail (represented by, register, VAT ID, repository, pull quote) is the empty string → its row, link or quote is absent, with no empty label. Tests in Tasks 1, 2 and 3.
3. A 320 px wide screen → the footer wraps and the page has no horizontal scroll, on `/terms` and on `/`. Test in Task 3 (e2e).
4. Keyboard in the File menu → arrow keys move over the menu items as before and skip the notice; Tab reaches the "Terms of Use" link; choosing it closes the menu. Test in Task 3.
5. A sheet with unsaved changes, then the terms link from the File menu, then Back → the changes are still there. Test in Task 3 (e2e).

---

### Task 1: Owner's details, article layout, Terms and Imprint

**Files:**
- Create: `src/content/operator.ts`, `src/content/operator.test.ts`
- Create: `src/ui/Article.tsx`, `src/ui/Article.module.css`
- Create: `src/pages/Terms.tsx`, `src/pages/Imprint.tsx`, `src/pages/legalPages.test.tsx`
- Modify: `src/App.tsx` (routes)

**Interfaces:**
- Produces:
  - `interface Operator { name: string; address: string[]; email: string; phone: string; representedBy: string; register: string; vatId: string; responsibleForContent: string; hostName: string; hostAddress: string; logRetention: string; repositoryUrl: string; aboutLead: string; authorBio: string; story: string[]; pullQuote: string }`
  - `export const operator: Operator` — required fields hold `'TODO: …'` texts; the optional ones (`representedBy`, `register`, `vatId`, `repositoryUrl`, `pullQuote`) hold `''`.
  - `export function isPlaceholder(value: string): boolean` — true when the value starts with `TODO:`.
  - `export function placeholders(o: Operator): string[]` — names of fields with a placeholder; an array field counts when any entry is one or the array is empty.
  - `export function formatDate(iso: string): string` — `'2026-11-24'` → `'24 November 2026'`.
  - `Article` props: `{ eyebrow: string; title: string; documentTitle: string; lastChanged?: string; children: ReactNode }`. It draws the eyebrow, one `h1`, the children, and "Last changed: 24 November 2026" when `lastChanged` is set. It sets `document.title` to `documentTitle` while mounted and back to `fingerscore` after.
  - Pages take an optional prop `details?: Operator` (default `operator`) so tests can pass filled details.

- [ ] **Step 1: Write the failing tests** in `operator.test.ts` and `legalPages.test.tsx`:
  - `placeholders(operator)` contains `name`, `address`, `email`, `phone`, `responsibleForContent`, `hostName`, `hostAddress`, `logRetention`, `aboutLead`, `authorBio`, `story` and none of the five optional fields.
  - `placeholders(filled)` is `[]` for a fully filled object; `formatDate('2026-11-24')` is `'24 November 2026'`.
  - Terms: exactly one `h1` "Terms of Use"; `document.title` is "Terms of Use – fingerscore" and "fingerscore" after unmount; six `h2` in order "What fingerscore is", "Your songs", "What you make", "Fingerings", "No warranty", "Changes and law"; the text contains each sentence of design section 5.4 verbatim; contains "Last changed: 24 November 2026"; has a link "Imprint" to `/imprint`; the page text matches neither `/fair use/i` nor `/private (use|copy)/i`.
  - Imprint: `h1` "Imprint"; heading "Information according to § 5 DDG"; shows name, every address line, e-mail and phone of the passed details; the rows "Represented by", "Register entry", "VAT ID" appear only when their value is not empty (test both); "Responsible for content (§ 18 (2) MStV)"; `h2` "Consumer dispute resolution" and "Liability for links"; a link "Privacy" to `/privacy`; no link whose address contains `ec.europa.eu`.
  - Routes: rendering `App` in a `MemoryRouter` at `/terms` and at `/imprint` shows the page's `h1` (use `findByRole`).
- [ ] **Step 2: Run** `npx vitest run src/content src/pages/legalPages.test.tsx` — expected: FAIL, modules missing.
- [ ] **Step 3: Implement** `operator.ts`, `Article`, `Terms`, `Imprint` and the two lazy routes in `App.tsx` (keys `terms`, `imprint`). Article column: 680 px at most, existing design tokens, no page bar. Terms text: design section 5.4, each numbered paragraph under its `h2`. Imprint wording for the two sections: the builder writes it; consumer dispute resolution says the provider does not take part in dispute resolution before a consumer arbitration board; liability for links says linked sites are the responsibility of their operators and were checked when linked.
- [ ] **Step 4: Run** `npx vitest run src/content src/pages/legalPages.test.tsx` and `npx tsc --noEmit -p .` — expected: PASS, clean.
- [ ] **Step 5: Commit** — `feat: Terms and Imprint pages, the owner's details file`

---

### Task 2: Privacy and About

**Files:**
- Create: `src/content/storageItems.ts`, `src/content/storageItems.test.ts`
- Create: `src/pages/Privacy.tsx`, `src/pages/About.tsx`
- Modify: `src/pages/legalPages.test.tsx`, `src/App.tsx` (routes)

**Interfaces:**
- Consumes: `Operator`, `operator`, `Article` from Task 1.
- Produces: `export const STORAGE_ITEMS: { key: string; where: 'local' | 'session'; label: string }[]` — one entry per key the app keeps: local `fingerscore.library.v1`, `fingerscore.inst`, `fingerscore.prefs`, `fingerscore.playmode`, `fingerscore.scales`; session `fingerscore.song`, `fingerscore.doc`, `fingerscore.sheet`. `label` is plain words, for example "your saved sheets".

- [ ] **Step 1: Write the failing tests:**
  - `storageItems.test.ts`: read every non-test `.ts`/`.tsx` file under `src` from disk, collect every string literal matching `/^fingerscore\.[a-z0-9.]+$/` except `fingerscore.library.probe`; the set equals the set of `STORAGE_ITEMS` keys. For each item, the source file that holds the key uses `localStorage` or `sessionStorage` matching `where` (the builder checks the real code first and corrects the `where` values in this plan's list if the code differs).
  - Privacy: `h1` "Privacy"; title "Privacy – fingerscore"; shows `hostName`, `hostAddress` and `logRetention` of the passed details; contains "Art. 6 (1) (f) GDPR" and "§ 25 (2) TDDDG"; contains the `label` of every storage item, the local ones under a sentence naming local storage and the session ones under a sentence naming session storage; contains the sentences "fingerscore sets no cookies.", "fingerscore does not track you.", "A song file is read in your browser and is never uploaded."; names the six rights of design 5.5; has a link "Imprint" to `/imprint`; "Last changed: 24 November 2026".
  - About: eyebrow "About"; `h1` "Why I made fingerscore"; title "About – fingerscore"; shows `aboutLead`, `name`, `authorBio` and every `story` paragraph of the passed details; `h2` "The story", "Under the hood", "Thanks & credits"; a `blockquote` only when `pullQuote` is not empty (test both); a "GitHub" link only when `repositoryUrl` is not empty (test both); credits contain "The Woodwind Fingering Guide", "Bravura" and "Atkinson Hyperlegible" and do not contain "FreeSerif"; a link "third-party notices" whose `href` is `import.meta.env.BASE_URL + 'third-party-notices.txt'` and that is a plain `a` (a click does not change the router location).
  - Routes `/privacy` and `/about` show their `h1`.
- [ ] **Step 2: Run** `npx vitest run src/content src/pages/legalPages.test.tsx` — expected: FAIL.
- [ ] **Step 3: Implement** `storageItems.ts`, `Privacy`, `About`, the two routes (keys `privacy`, `about`). Privacy content: design 5.5, including how to delete the data (delete a sheet in "Your sheets"; clear site data in the browser). About "Under the hood" from repository facts only: runs in the browser, nothing uploaded, the libraries named in `package.json` dependencies.
- [ ] **Step 4: Run** the same command and `npx tsc --noEmit -p .` — expected: PASS, clean.
- [ ] **Step 5: Commit** — `feat: Privacy and About pages`

---

### Task 3: Footer links and the import notice

**Files:**
- Create: `src/ui/RightsNotice.tsx`, `src/ui/RightsNotice.module.css`, `src/ui/Footer.test.tsx`, `e2e/pages.spec.ts`
- Modify: `src/ui/Footer.tsx`, `src/styles/global.css`, `src/ui/DropZone.tsx` (+ `DropZone.test.tsx`), `src/ui/Gallery.tsx`, `src/ui/FileMenu.tsx` (+ their CSS modules and existing tests where one exists; otherwise add `src/ui/RightsNotice.test.tsx` covering Gallery and FileMenu)

**Interfaces:**
- Consumes: `operator.repositoryUrl` from Task 1.
- Produces: `RightsNotice` props `{ className?: string; onNavigate?(): void }` — draws `<p>` with "Only import songs you have the rights to. " and a router `Link` "Terms of Use" to `/terms`; `onNavigate` runs on a click of the link. `Footer` takes an optional prop `repositoryUrl?: string` (default `operator.repositoryUrl`).

- [ ] **Step 1: Write the failing unit tests:**
  - Footer: order of the row is brand, "© 2026", the sentence "Your sheets are stored in your browser. Nothing is stored on the server.", then a `nav` labelled "Site" with links About → `/about`, Terms → `/terms`, Privacy → `/privacy`, Imprint → `/imprint` in that order; with `repositoryUrl="https://example.org/r"` a link "GitHub" sits between About and Terms and no image or icon in it shows a GitHub logo; with `''` there is no GitHub link.
  - DropZone: the notice and its link are present in the initial state and in every state that shows the file input or a "Choose another file" button; the link is not inside the element that opens the file dialog on click (a click on the link does not open the dialog).
  - Gallery: in the library view the notice sits in the same foot as "Import…"; the one-line strip has no notice.
  - FileMenu: with the menu open, the notice sits directly after the "Open JSON file…" item; the `p` has no `role="menuitem"`; ArrowDown from "Open JSON file…" moves focus to "New sheet"; the link is reachable with Tab; a click on the link closes the menu.
- [ ] **Step 2: Run** `npx vitest run src/ui` — expected: the new assertions FAIL.
- [ ] **Step 3: Implement** the component, the footer `nav` and the three placements. Footer CSS: the row wraps; the link group does not break inside a link.
- [ ] **Step 4: Write `e2e/pages.spec.ts`:**
  - From `/`, each footer link opens its page (`h1` visible, title as in Global Constraints), and the header logo leads back.
  - `page.goto('/terms')` directly shows "Terms of Use".
  - The notice link on the start page opens `/terms`.
  - At a 320 × 640 viewport, `/` and `/terms` have `document.documentElement.scrollWidth <= clientWidth`.
  - Open the sample sheet, change one note so the save status shows unsaved changes, open File, follow "Terms of Use", go back: the change and the unsaved status are still there.
- [ ] **Step 5: Run** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run test:e2e`, `npm run build && npm run check:bundle` — expected: all pass; the start set is at most 395,851 bytes (report the number).
- [ ] **Step 6: Commit** — `feat: footer links and the import notice`

---

### Task 4: Unused PDF chunks out of the build; notices for every package in it

**Files:**
- Modify: `vite.config.ts`, `scripts/check-bundle.mjs`, `package.json` (script `notices`), `THIRD-PARTY-NOTICES.md`, `public/third-party-notices.txt`, `src/thirdPartyNotices.test.ts`
- Create: `scripts/make-notices-list.ts`, `third-party-packages.json`

**Interfaces:**
- Produces:
  - `third-party-packages.json`: `{ "name": string, "version": string, "license": string }[]`, sorted by name, one entry per package whose code or font files are in the production build.
  - `npm run notices` — builds, writes the file. `npm run notices -- --check` — builds, writes nothing, exits 1 and prints the difference when the committed file differs.
  - `check:bundle` additionally fails when any file in `dist/assets` is an html2canvas, dompurify or canvg chunk.

- [ ] **Step 1: Confirm** with a search of `src` that the app calls neither `.html(` on a jsPDF document nor `addSvgAsImage`. Report the search and its result. If either is called, stop and report BLOCKED.
- [ ] **Step 2: Extend `check-bundle.mjs`** to read every `.js` file in `dist/assets`. Choose a marker per library that today's three chunks contain and that jsPDF's own chunk does not (jsPDF's error texts name these libraries, so the library name alone is not a marker). Run `npm run build && npm run check:bundle` — expected: FAIL, naming the three chunks. Put the output in the report.
- [ ] **Step 3: Stub the imports** in `vite.config.ts`: a small plugin resolves `html2canvas`, `dompurify` and `canvg` to an empty module in the build and in the dev server. Run `npm run build && npm run check:bundle` — expected: PASS; `dist/assets` holds no such chunk; report the count and total size of `dist/assets` before and after.
- [ ] **Step 4: Run** `npm run test:e2e` and `npm run test:e2e:preview` — expected: PASS (the PDF downloads are unchanged).
- [ ] **Step 5: Write `scripts/make-notices-list.ts`.** Approach: run Vite's `build()` from the script with one extra plugin whose `generateBundle` reads the module ids of every chunk, maps each id under `node_modules` to its package (scoped and nested packages included), and reads name, version and licence from that package's `package.json`. Add `@fontsource/atkinson-hyperlegible` and `@fontsource/bravura` from a fixed list. Run `npm run notices`; commit the list.
- [ ] **Step 6: Replace the first test** in `src/thirdPartyNotices.test.ts` and add one:
  - every entry of `third-party-packages.json` has a heading `## <name> <version>` in the notices;
  - every `## ` heading in the notices names an entry of the list (no stale section);
  - every runtime dependency in `package.json` is in the list or is one of the packages stubbed in Step 3 (none are today);
  - the existing font and served-copy tests stay.
  Run `npx vitest run src/thirdPartyNotices.test.ts` — expected: FAIL, listing the missing packages.
- [ ] **Step 7: Add the sections** to `THIRD-PARTY-NOTICES.md` in the form of the existing ones: heading, licence and repository line, one sentence saying which direct dependency brings the package in, the licence text from the package's licence file. A package without a licence file gets the standard text of the licence its `package.json` names, with the copyright line from its README or `package.json` author; say so in the section. Copy the file to `public/third-party-notices.txt`. Run the test — expected: PASS.
- [ ] **Step 8: Run** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run notices -- --check` — expected: PASS, clean, exit 0.
- [ ] **Step 9: Commit** — `build: unused PDF chunks are not shipped; notices cover every package in the build`

---

### Task 5: Release check and hosting instructions

**Files:**
- Create: `scripts/check-release.ts`, `src/content/checkRelease.test.ts`
- Modify: `package.json` (script `check:release`), `README.md` (Hosting section, scripts list, credits), `docs/superpowers/specs/2026-11-24-fingerscore-v2-pages-design.md` (only where the build differs from it)

**Interfaces:**
- Consumes: `placeholders`, `Operator` (Task 1); `npm run notices -- --check` (Task 4); `check:bundle`.
- Produces: `npm run check:release` = `npm run build`, `npm run check:bundle`, `npm run notices -- --check`, then `tsx scripts/check-release.ts`. The script takes an optional path to a details module (default `src/content/operator.ts`), prints `check:release: still a placeholder: <field>` for each one and exits 1, or prints `check:release: the owner's details are filled in.` and exits 0.

- [ ] **Step 1: Write the failing test** `checkRelease.test.ts`: run the script with `tsx` as a child process on two temporary details modules written to the OS temp folder — one with `name: 'TODO: name'` (expect exit 1 and the line `still a placeholder: name`), one fully filled with invented test values such as "Test Person" (expect exit 0). Also: run it on the committed file and expect exit 1.
- [ ] **Step 2: Run** `npx vitest run src/content/checkRelease.test.ts` — expected: FAIL, script missing.
- [ ] **Step 3: Implement** the script and the `check:release` entry.
- [ ] **Step 4: Rewrite the README Hosting section:** (1) fill in `src/content/operator.ts`; (2) have a lawyer read Terms, Privacy and Imprint, and ask whether the notice suffices and whether German versions are needed; (3) run `npm run check:release`; (4) the host must answer unknown paths with `index.html`; (5) hosting under a sub-path needs a Vite `base` and a router `basename`, which are not set. Remove the sentence that the Imprint arrives in version 2. Add `notices` and `check:release` to the scripts list.
- [ ] **Step 5: Run** `npx vitest run`, `npx tsc --noEmit -p .`, `npm run build && npm run check:bundle`, `npm run test:e2e`, `npm run test:e2e:preview`; then `npm run check:release` — expected: all pass except `check:release`, which exits 1 and lists the eleven placeholder fields. Put its output in the report.
- [ ] **Step 6: Commit** — `build: release check for the owner's details; hosting instructions`

# fingerscore version 2, part 6a: About, Imprint, Privacy, Terms

Date: 2026-11-24. Audience: the owner, who approves it, and the builder, who plans from it.

## 1. Purpose

fingerscore is going to be hosted in public from Germany. Before that it needs four static pages and one notice:

- **Imprint** and **Privacy**, which German law requires.
- **Terms of Use**, so that responsibility for a song's rights sits with the person who imports it, not with the owner.
- **About**, which credits the sources the app is built on.
- A **notice at every place a file comes in**, with a link to the terms.

The owner's reason for the terms: nobody may use the app in a way that makes the owner liable for a copyright infringement.

## 2. Goals, non-goals, anti-goals

**Goals**

- Routes `/about`, `/imprint`, `/privacy`, `/terms`.
- Footer links to all four on every page.
- The import notice at the drop zone, the gallery and the File menu.
- The owner's personal details live in one file. The site cannot be released while a placeholder remains.
- Third-party notices cover every package whose code is in the build.

**Non-goals**

- No confirmation dialog, no checkbox, no stored consent (owner's decision: notice only).
- No German version of any page.
- No accessibility audit of the whole app and no acceptance suite. Both are part 6b.
- No account, no contact form, no analytics.

**Anti-goals**

- The texts must not promise something the app does not do. Every factual sentence (no cookies, nothing uploaded, fonts served by the app) must be true of the build and, where a test can show it, be covered by one.
- The terms must not rely on "fair use" or on the private-copy rule. German law has no general fair use, and § 53 (4) UrhG excludes sheet music from private copying.
- No legal text may look final. All four are drafts until a lawyer has read them; the documents say so, the pages do not.

## 3. Constraints

- Everything loaded at page start must stay at or under 400,000 bytes (`npm run check:bundle`). It is 393,851 bytes now. The four pages therefore load on demand, like Tracks and Scales.
- The footer and the notice load at start. Together they may add at most 2,000 bytes to the start set.
- English only. Site text follows the owner's writing standards: short sentences, no evaluative adjectives.
- No personal detail of the owner is written by the builder. Name, address, e-mail, phone and hosting provider are placeholders that the owner fills in.
- No request leaves the origin (the existing production-build test checks this and keeps doing so).

## 4. Approaches

1. **Four React pages with the text in the components, loaded on demand** (chosen). Same pattern as the existing pages; tests can read the text; the start set does not grow.
2. **Markdown files rendered at run time.** Needs a Markdown renderer in the bundle for four short texts. Rejected.
3. **Static HTML files in `public/`.** No header, footer or router; the look diverges from the app. Rejected.

For the acknowledgement: a visible notice (chosen by the owner) against a one-time confirmation stored in the browser. The confirmation could not be proven later, because nothing is stored on a server.

## 5. Design

### 5.1 Routes and layout

- `/about`, `/imprint`, `/privacy`, `/terms`, each a lazy route inside a `LoadBoundary`, as `/scales` is.
- No page bar on these pages.
- One shared article layout: a single column, 680 px wide at most, an eyebrow line, one `h1`, sections with `h2`. The pages use the existing design tokens.
- Each page sets the document title: "About – fingerscore", "Imprint – fingerscore", "Privacy – fingerscore", "Terms of Use – fingerscore".
- Privacy, Terms and Imprint end with a "Last changed" date taken from one constant per page.

### 5.2 Footer

The existing row stays in its order: brand, "© 2026", the stored-in-your-browser sentence. After a spacer come the links, in this order: **About · Terms · Privacy · Imprint**. A **GitHub** link with the neutral `</>` icon appears between About and Terms only when the owner's details file names a repository address. On narrow screens the row wraps; the links stay on one line among themselves where the width allows.

### 5.3 Import notice

One shared component draws the line:

> Only import songs you have the rights to. [Terms of Use](/terms)

Where it appears:

- **Drop zone** on the start page: under the hint line, always visible, in every state in which a file can be chosen or dropped.
- **Gallery** ("Your sheets"): in the library view, beside "Import…". The one-line strip has no import control; the drop zone on the same page carries the notice.
- **File menu** on the sheet page: a text line directly under "Open JSON file…". The line is not a menu item and takes no keyboard stop; its link does.
  Changed in part 6b: the link is a menu item, so that the menu has only valid children. The arrow keys reach it, Enter or Space follows it, and Tab closes the menu.

The link opens `/terms` in the same tab everywhere. A sheet with unsaved changes survives the visit, because the app keeps the open sheet in the browser session; a test opens the terms from the File menu with unsaved changes, goes back and finds the changes.

### 5.4 Terms of Use (draft text)

1. **What fingerscore is.** fingerscore runs in your browser. A file you open is read on your device. It is not sent to us and we do not store it.
2. **Your songs.** Import only music that is in the public domain, that you wrote yourself, or that you have permission or a licence to copy and arrange. By importing a file you confirm that this is the case. A song in the public domain can still come in a protected edition or arrangement.
3. **What you make.** You are responsible for the sheets you make and for what you do with them: printing, sharing, publishing. Do not pass on sheets of protected music without permission.
4. **Fingerings.** The fingerings are taken from published fingering charts. They can contain errors. Check them against your instrument.
5. **No warranty.** fingerscore is free and comes as it is. We are liable without limit for intent, for gross negligence and for injury to life, body or health. Any other liability is excluded as far as the law allows.
6. **Changes and law.** We may change these terms; the date below shows the last change. German law applies. Contact: see the Imprint.

### 5.5 Privacy (content)

- **Who is responsible:** the provider named in the Imprint.
- **Hosting and server logs:** the hosting provider (placeholder) records the IP address, time, requested address and browser identification of each request, to keep the server secure; legal basis Art. 6 (1) (f) GDPR; retention period (placeholder).
- **No cookies, no tracking, no third-party requests.** Fonts are served by the app.
- **Browser storage:** the browser keeps data in two places, both only on the visitor's device. Local storage holds the saved sheets, the chosen instrument, display settings, play-mode settings and the last scale choice. Session storage holds the song and sheet that are open, until the tab closes. Both are used because the app needs them to work (§ 25 (2) TDDDG). The page names the stored items in plain words and says how to delete them (delete a sheet in "Your sheets"; clear site data in the browser).
- **Files:** a song file is read in the browser and never uploaded.
- **Rights:** access, correction, deletion, restriction, objection, complaint to a supervisory authority.

### 5.6 Imprint (content)

As the handoff specifies: a card "Information according to § 5 DDG" with Provider (name, address), Contact (e-mail, phone), and, only when the details file fills them, Represented by, Register entry and VAT ID; Responsible for content (§ 18 (2) MStV); sections *Consumer dispute resolution* and *Liability for links*; a link to Privacy. No link to the EU ODR platform.

### 5.7 About (content)

Eyebrow "About", `h1` "Why I made fingerscore", lead paragraph, author line, sections *The story*, *Under the hood*, *Thanks & credits*, contact line.

- *Under the hood* and *Thanks & credits* are written by the builder from facts in the repository: everything runs in the browser; the libraries in use; credits for The Woodwind Fingering Guide, Bravura (the music font actually used; the handoff's GNU FreeSerif is not in the app) and Atkinson Hyperlegible; a link to the third-party notices file served with the app (a plain link built from the app's base address, not a router link).
- The lead paragraph, the author line and *The story* are the owner's words. They are placeholders in the details file. The pull quote appears only when the owner supplies one.

### 5.8 The owner's details and the release check

- Two files hold the details. `src/content/operator.ts` holds: name, address lines, e-mail, phone, optional represented-by / register / VAT ID, person responsible for content, hosting provider name and address, log retention period, optional repository address (re-used from `repository.ts`), About lead, author bio, story paragraphs, optional pull quote. `src/content/repository.ts` holds the repository address alone, so the footer, which loads at start, does not load the other details.
- A value that still starts with `TODO:` is a placeholder. The pages draw it as is.
- `npm run check:release` runs the build, `check:bundle`, the package-list comparison of 5.9, and a check that fails and lists every field that is still a placeholder. `npm run build` itself keeps working with placeholders, so tests and the preview run.
- The README's hosting section says: fill in `operator.ts`, have a lawyer read the four texts, run `npm run check:release`.

### 5.9 Third-party notices

- jsPDF contains optional imports of html2canvas, dompurify and canvg (which brings core-js). The app never calls the features that need them, yet the build ships three chunks for them. The build replaces these imports with an empty stub, so the chunks are not shipped. `check:bundle` looks at every file in `dist/assets`, not only the start set, and fails if one of them is such a chunk or contains these libraries. The builder first confirms that the app calls neither `doc.html()` nor `addSvgAsImage`.
- `THIRD-PARTY-NOTICES.md` and its served copy gain a section for every package whose code is in the build, direct or indirect (about 10 to 20 new sections).
- `npm run notices` runs the build, reads which packages the built files contain, and writes the list to a committed file. The two font packages are assets, not code, and the packages embedded in JSZip's prebuilt file (immediate, lie, pako, setimmediate) leave no module ids in the build; the script adds both groups from fixed lists. A unit test fails when the notices and the committed list disagree. `npm run check:release` produces the list again and fails when it differs from the committed one.
- A package without a licence file gets its licence name and the standard text of that licence.

### 5.10 Tests

- Each page: renders its `h1`, sets its title, and holds the sentences section 5.4–5.7 require.
- Footer: four links with the right targets on every route; GitHub link only with a repository address.
- Notice: present at the three spots; its link leads to `/terms`; in the File menu its link is a menu item (changed in part 6b).
- Privacy facts: a test compares the storage items the page names with the local and session keys the app writes.
- Release check: fails with a placeholder, passes with all fields filled (run on a copy, not on the committed file).
- End-to-end: footer link to each page and back; the notice link from the start page; the production-build test still sees no request leaving the origin.
- Start budget: `check:bundle` passes.

## 6. Calls made by the author

- **Branch:** `v2-pages`.
- **Link order** in the footer: About · Terms · Privacy · Imprint (the handoff had no Terms link).
- **GitHub link** hidden until a repository address exists; the repository has no remote today.
- **Release check is a separate command**, not part of `npm run build`, so that tests and the preview keep running with placeholders.
- **Unused jsPDF chunks are removed from the build** instead of being documented in the notices.
- **Bravura is credited**, not GNU FreeSerif, because Bravura is what the app uses.
- **Liability clause** in the terms follows the usual German pattern (no exclusion for intent, gross negligence, injury). A lawyer confirms the wording.

## 7. Open, for the owner before hosting

- A lawyer reads Terms, Privacy and Imprint, and says whether the notice suffices or a confirmation is needed, and whether Imprint and Privacy must also exist in German.
- The owner fills in `operator.ts`, including the About texts.
- Sub-path hosting still needs a Vite `base` and a router `basename`.

## 8. Left to the builder

File and component names beyond those named here, CSS, the exact wording of Privacy, Imprint and the builder-written About sections within the content listed above, and how the build stubs the unused imports.

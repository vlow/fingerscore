# fingerscore v2 part 1 (Library and Files) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save sheets in the browser, list and reopen them, and export/import them as JSON files.

**Architecture:** A pure persistence module validates and serialises documents; a repository module is the only code that touches the localStorage library; the zustand store tracks which library entry the current sheet belongs to and derives the save status; the sheet page gets Save, a status text and a File menu; the start page gets a gallery and accepts `.json` in its drop zone.

**Tech Stack:** Existing stack only (Vite, TypeScript strict, React 18, react-router-dom 6, zustand, CSS modules, Vitest + Testing Library, Playwright). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-22-fingerscore-v2-library-design.md` (binding) and `fingerscore-handoff/SPEC.md` §2.2, §4.3, §4.4, §13 (copy and layout). Prototypes: `fingerscore-handoff/prototype/Editor.dc.html` (page bar, File menu), `Main.dc.html` (gallery, drop zone).

## Global Constraints

- One file format: `{ app: "fingerscore", format: 1, savedAt, title, doc }`. Anything else is refused. No migration code.
- `doc` is the app's `Doc` type unchanged apart from `source.format` gaining `'file' | 'library'`.
- All `localStorage`/`sessionStorage` access goes through `src/state/storage.ts`; the library key `fingerscore.library.v1` is touched only by `src/state/library.ts`.
- No network requests. Downloads use a Blob URL and a temporary `<a download>`.
- User-facing strings are exactly those in the design doc (sections 4.2–4.7).
- Real `<button>`/`<a>`/`<input>` with labels; menu button with `aria-haspopup="menu"` and `aria-expanded`; `role="alert"` for errors, `role="status"` for confirmations and the toast; visible focus; touch targets ≥ 44px (secondary ≥ 36px).
- Design tokens from `src/styles/tokens.css`; CSS modules; one component per file under `src/ui/`.
- TypeScript 7 strict; the configured lib lacks `Array.prototype.at`.
- Commit after every task; end commit messages with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Commands: `npm test`, `npm run build`, `npm run test:e2e`.

## Review Focus

1. **A JSON file that is valid JSON but not ours** (a `package.json`, an array, `null`): refused with `"{file}" isn't a fingerscore sheet.`; nothing is added to the library. → Task 1 and Task 4 tests.
2. **A saved sheet whose fingering overrides no longer fit** (data tables changed since it was saved): opens, with those overrides dropped. → Task 1 test.
3. **localStorage full or blocked while saving**: the sheet stays open and editable, the status does not claim "Saved", the message from design 4.3 shows. → Task 2 and Task 3 tests.
4. **A library with a corrupt entry among good ones** (hand-edited storage, half-written value): good entries still list and open. → Task 2 test.
5. **Two tabs**: a sheet deleted in another tab and then saved here is created again rather than failing; the gallery reads the library when the start page mounts. → Task 2 test.

## File Structure

```
src/domain/persistence.ts        envelope, validation, canonical serialisation, file name
src/domain/timeAgo.ts            "5 min ago" text
src/state/library.ts             repository over fingerscore.library.v1
src/state/store.ts               + libraryId, savedSnapshot, save/open/delete actions, saveStatus selector
src/ui/FileMenu.tsx              File ▾ menu
src/ui/SaveControls.tsx          status text + Save button
src/ui/Toast.tsx                 one toast with an optional action (Undo)
src/ui/Gallery.tsx               "Your sheets"
src/ui/DropZone.tsx              + .json handling
src/pages/SheetPage.tsx, Start.tsx   wiring
e2e/library.spec.ts
```

---

### Task 1: Persistence — file format and validation

**Files:**
- Modify: `src/domain/types.ts` (`source.format`: add `'file' | 'library'`)
- Create: `src/domain/persistence.ts`, `src/domain/persistence.test.ts`

**Interfaces:**
- Consumes: `Doc`, `isSupportedTimeSig`, `barCap`, `DURATIONS`, `ORDER`/`inst`, `optionsFor`, `sampleDoc`.
- Produces:

```ts
export interface SheetFile { app: 'fingerscore'; format: 1; savedAt: string; title: string; doc: Doc }
export type ParseResult = { ok: true; doc: Doc; title: string } | { ok: false; reason: 'not-a-sheet' | 'damaged' };
export function toFile(doc: Doc, now?: Date): SheetFile;                 // title = doc.title
export function serializeFile(doc: Doc, now?: Date): string;             // JSON, 2-space indent
export function parseFileText(text: string): ParseResult;                // JSON.parse + parseFile
export function parseFile(value: unknown): ParseResult;                  // envelope check, then validateDoc
export function validateDoc(value: unknown): Doc | null;                 // design 4.2: refuse → null; repair silently where listed
export function canonical(doc: Doc): string;                             // stable key order; equal docs → equal strings
export function fileName(title: string): string;                         // 'auld-lang-syne.fingerscore.json', '' → 'sheet.fingerscore.json'
export function importMessage(file: string, reason: 'not-a-sheet' | 'damaged'): string;
```

`validateDoc` returns a NEW object containing only known fields. Override validity: for each `fingering[id]`, find the event, compute written = m + shift + inst.off, and keep the entry only if `optionsFor(inst, written, recorderSystem)[index]` exists. `canonical` ignores nothing: every `Doc` field counts, including `source`.

- [ ] **Step 1: Write the failing tests**

```ts
const doc = () => sampleDoc('asax');
it('round-trips a document exactly', () => {
  const r = parseFileText(serializeFile(doc(), new Date('2026-11-22T12:00:00Z')));
  expect(r.ok && canonical(r.doc)).toBe(canonical(doc()));
  expect(r.ok && r.title).toBe('The Water Is Wide');
});
it('envelope', () => {
  const f = toFile(doc(), new Date('2026-11-22T12:00:00Z'));
  expect(f).toMatchObject({ app: 'fingerscore', format: 1, savedAt: '2026-11-22T12:00:00.000Z', title: 'The Water Is Wide' });
});
it.each([['null', null], ['array', []], ['package.json', { name: 'x', version: '1.0.0' }], ['other app', { app: 'other', format: 1, doc: {} }],
         ['other format', { app: 'fingerscore', format: 2, doc: {} }], ['no doc', { app: 'fingerscore', format: 1 }]])(
  'refuses %s as not a sheet', (_n, v) => { expect(parseFile(v)).toEqual({ ok: false, reason: 'not-a-sheet' }); });
it('refuses unparseable text as not a sheet', () => { expect(parseFileText('{oops')).toEqual({ ok: false, reason: 'not-a-sheet' }); });
const broken = (mutate: (d: any) => void) => { const f: any = JSON.parse(serializeFile(doc())); mutate(f.doc); return parseFile(f); };
it.each([
  ['bar does not sum to cap', (d: any) => { d.score[1].ev[0].d = 3; }],
  ['duration not allowed', (d: any) => { d.score[1].ev[0].d = 5; d.score[1].ev[1].d += 1; }],
  ['unknown instrument', (d: any) => { d.inst = 'oboe'; }],
  ['shift out of range', (d: any) => { d.shift = 40; }],
  ['unsupported meter', (d: any) => { d.timeSig = [5, 4]; }],
  ['duplicate event id', (d: any) => { d.score[1].ev[1].id = d.score[1].ev[0].id; }],
  ['empty score', (d: any) => { d.score = []; }],
  ['pitch out of range', (d: any) => { d.score[0].ev[0].m = 200; }],
  ['bad volta', (d: any) => { d.score[0].volta = '3'; }],
  ['bad mode', (d: any) => { d.originalMode = 'dorian'; }],
])('refuses a damaged document: %s', (_n, m) => { expect(broken(m)).toEqual({ ok: false, reason: 'damaged' }); });
it('repairs what can be repaired', () => {
  const r = broken(d => { delete d.title; delete d.show; d.chartStyle = 'fancy'; d.extra = 1; d.tempo = 999;
    d.fingering = { nope: 1, [d.score[0].ev[0].id]: 99 }; d.chords = { nope: { raw: 'C', ok: true, pc: 0, rest: '', bass: null, tk: 0 } }; delete d.source; });
  expect(r.ok).toBe(true); if (!r.ok) return;
  expect(r.doc).toMatchObject({ title: '', chartStyle: 'compact', tempo: 200, fingering: {}, chords: {},
    show: { fingerings: true, chords: true, lyrics: true, raiseExtensions: true } });
  expect('extra' in r.doc).toBe(false); expect(r.doc.source.format).toBe('file');
});
it('keeps a valid override and drops one that no longer fits', () => {
  const d = doc(); const withAlt = /* first event whose optionsFor(...) has >= 2 options */ findAltEvent(d);
  const f: any = JSON.parse(serializeFile({ ...d, fingering: { [withAlt.id]: 1 } }));
  expect((parseFile(f) as any).doc.fingering).toEqual({ [withAlt.id]: 1 });
  f.doc.fingering[withAlt.id] = 57; expect((parseFile(f) as any).doc.fingering).toEqual({});
});
it('canonical ignores key order', () => { const d = doc(); const shuffled = JSON.parse(JSON.stringify(d, Object.keys(d).reverse())) as Doc;
  expect(canonical({ ...shuffled, score: d.score, fingering: d.fingering, chords: d.chords, show: d.show, source: d.source })).toBe(canonical(d)); });
it('canonical sees every change', () => { const d = doc(); expect(canonical({ ...d, tempo: d.tempo + 1 })).not.toBe(canonical(d));
  expect(canonical({ ...d, show: { ...d.show, lyrics: false } })).not.toBe(canonical(d)); });
it('file names', () => { expect(fileName('Auld Lang Syne')).toBe('auld-lang-syne.fingerscore.json'); expect(fileName('  Ça va?! ')).toBe('a-va.fingerscore.json'); expect(fileName('')).toBe('sheet.fingerscore.json'); });
it('messages', () => { expect(importMessage('a.json', 'not-a-sheet')).toBe('"a.json" isn\'t a fingerscore sheet.'); expect(importMessage('a.json', 'damaged')).toBe('"a.json" is damaged and can\'t be opened.'); });
```

`findAltEvent` is a small helper in the test file (use `derive` or `optionsFor`).
- [ ] **Step 2: Run** `npx vitest run src/domain/persistence.test.ts` → FAIL.
- [ ] **Step 3: Implement.** A missing `source` becomes `{ file: '', format: 'file', track: '', trackCount: 0, simplified: false }`; a present one is kept if its fields have the right types.
- [ ] **Step 4: Run** → PASS; `npm test` green (the `source.format` union change must not break existing code).
- [ ] **Step 5: Commit** `feat: sheet file format, validation and canonical serialisation`.

---

### Task 2: Library repository, store state and time-ago text

**Files:**
- Create: `src/state/library.ts`, `src/state/library.test.ts`, `src/domain/timeAgo.ts`, `src/domain/timeAgo.test.ts`
- Modify: `src/state/store.ts`, `src/state/store.test.ts`

**Interfaces:**
- Consumes: Task 1 (`validateDoc`, `canonical`, `parseFileText`), `readJSON`/`writeJSON` from `storage.ts`, `displayName` from `instruments.ts`.
- Produces:

```ts
// library.ts
export interface LibraryEntry { id: string; title: string; inst: string; savedAt: string; doc: Doc }
export type SaveResult = { ok: true; entry: LibraryEntry } | { ok: false; message: string };
export function listEntries(): LibraryEntry[];                       // newest first; invalid entries skipped; never throws
export function getEntry(id: string): LibraryEntry | null;
export function saveEntry(doc: Doc, id: string | null, now?: Date): SaveResult;   // id null or unknown → new entry; known → replaced; result moved to the top
export function deleteEntry(id: string): LibraryEntry | null;        // returns the removed entry for undo
export function restoreEntry(entry: LibraryEntry): boolean;          // puts it back, ordered by savedAt
export const BLOCKED_MESSAGE = 'This browser blocks local storage. Use "Download JSON" instead.';
export const FULL_MESSAGE = "Couldn't save — the browser storage may be full.";
// timeAgo.ts
export function timeAgo(iso: string, now?: Date): string;            // design 4.7
// store.ts additions to AppState
libraryId: string | null; savedSnapshot: string | null;              // canonical(doc) at the last save or open
saveError: string | null;
saveSheet(): boolean;                                                // saves doc; sets libraryId, savedSnapshot; on failure sets saveError and returns false
openEntry(id: string): boolean;                                      // doc ← entry.doc with source { file: title, format: 'library', … }; song ← null; libraryId, savedSnapshot set
openImported(doc: Doc, fileName: string): boolean;                   // saves as a new entry, then opens it with source.format 'file' and source.file = fileName
forgetEntry(id: string): void;                                       // if it is the current sheet's entry: libraryId and savedSnapshot ← null
export type SaveStatus = 'new' | 'dirty' | 'saved';
export function saveStatus(s: Pick<AppState, 'doc' | 'libraryId' | 'savedSnapshot'>): SaveStatus;
```

Rules: entry title = `doc.title.trim() || 'Untitled sheet'`; entry `inst` = `displayName(inst(doc.inst))`. Blocked storage is detected by a failed probe write/read of the library key; `saveEntry` returns `BLOCKED_MESSAGE` then, `FULL_MESSAGE` when the write of the new array fails. `savedSnapshot` is computed from the document as stored (so the `source` rewrite on open does not make a just-opened sheet "dirty": snapshot = `canonical` of the opened doc after the rewrite). `setDoc` (a new sheet from an import) resets `libraryId`, `savedSnapshot`, `saveError` to null. `libraryId` and `savedSnapshot` are mirrored to sessionStorage (`fingerscore.sheet`) and restored by `hydrate()`. `saveStatus`: no `libraryId` → `'new'`; `canonical(doc) === savedSnapshot` → `'saved'`; else `'dirty'`.

- [ ] **Step 1: Write the failing tests**

```ts
// library.test.ts
beforeEach(() => localStorage.clear());
const T = (s: string) => new Date(s);
it('saves, lists newest first and updates in place', () => {
  const a = saveEntry(sampleDoc('asax'), null, T('2026-11-22T10:00:00Z')); const b = saveEntry({ ...sampleDoc('cl'), title: 'B' }, null, T('2026-11-22T11:00:00Z'));
  expect(a.ok && b.ok).toBe(true); if (!a.ok || !b.ok) return;
  expect(listEntries().map(e => e.title)).toEqual(['B', 'The Water Is Wide']);
  expect(listEntries()[1]).toMatchObject({ inst: 'Alto sax in E♭', savedAt: '2026-11-22T10:00:00.000Z' });
  const again = saveEntry({ ...sampleDoc('asax'), tempo: 80 }, a.entry.id, T('2026-11-22T12:00:00Z'));
  expect(again.ok && again.entry.id).toBe(a.entry.id);
  expect(listEntries().map(e => e.id)).toEqual([a.entry.id, b.entry.id]); expect(listEntries()).toHaveLength(2);
  expect(getEntry(a.entry.id)!.doc.tempo).toBe(80);
});
it('untitled sheets get a name', () => { const r = saveEntry({ ...sampleDoc('fl'), title: '  ' }, null); expect(r.ok && r.entry.title).toBe('Untitled sheet'); });
it('an unknown id creates a new entry (deleted in another tab)', () => { const r = saveEntry(sampleDoc('fl'), 'gone'); expect(r.ok && r.entry.id).not.toBe('gone'); expect(listEntries()).toHaveLength(1); });
it('delete returns the entry and restore puts it back in order', () => {
  const a = saveEntry(sampleDoc('asax'), null, T('2026-11-22T10:00:00Z')) as any; const b = saveEntry(sampleDoc('cl'), null, T('2026-11-22T11:00:00Z')) as any;
  const removed = deleteEntry(a.entry.id)!; expect(listEntries().map(e => e.id)).toEqual([b.entry.id]);
  expect(restoreEntry(removed)).toBe(true); expect(listEntries().map(e => e.id)).toEqual([b.entry.id, a.entry.id]);
  expect(deleteEntry('nope')).toBeNull();
});
it('skips corrupt entries and survives corrupt storage', () => {
  const good = saveEntry(sampleDoc('asax'), null) as any;
  const raw = JSON.parse(localStorage.getItem('fingerscore.library.v1')!); raw.push({ id: 'x', title: 'bad', inst: '?', savedAt: 'x', doc: { score: 'no' } }, 42);
  localStorage.setItem('fingerscore.library.v1', JSON.stringify(raw)); expect(listEntries().map(e => e.id)).toEqual([good.entry.id]);
  localStorage.setItem('fingerscore.library.v1', '{oops'); expect(listEntries()).toEqual([]);
  localStorage.setItem('fingerscore.library.v1', '{"a":1}'); expect(listEntries()).toEqual([]);
});
it('reports full storage', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) { if (v.length > 200) throw new DOMException('quota'); });
  expect(saveEntry(sampleDoc('asax'), null)).toEqual({ ok: false, message: FULL_MESSAGE }); spy.mockRestore(); expect(listEntries()).toEqual([]);
});
it('reports blocked storage', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
  expect(saveEntry(sampleDoc('asax'), null)).toEqual({ ok: false, message: BLOCKED_MESSAGE }); spy.mockRestore();
});
// timeAgo.test.ts
const now = new Date('2026-11-22T12:00:00Z'); const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms).toISOString(), now);
it('time ago', () => { expect(ago(20_000)).toBe('just now'); expect(ago(5 * 60_000)).toBe('5 min ago'); expect(ago(3 * 3_600_000)).toBe('3 h ago');
  expect(ago(30 * 3_600_000)).toBe('yesterday'); expect(ago(4 * 86_400_000)).toBe('4 days ago'); expect(ago(60 * 86_400_000)).toBe('23 Sep 2026'); expect(timeAgo('garbage', now)).toBe(''); });
// store.test.ts additions
it('save status follows the document', () => {
  useApp.getState().setDoc(sampleDoc('asax')); expect(saveStatus(useApp.getState())).toBe('new');
  expect(useApp.getState().saveSheet()).toBe(true); expect(saveStatus(useApp.getState())).toBe('saved');
  useApp.getState().patchDoc({ tempo: 90 }); expect(saveStatus(useApp.getState())).toBe('dirty');
  useApp.getState().patchDoc({ tempo: 100 }); expect(saveStatus(useApp.getState())).toBe('saved');
  useApp.getState().saveSheet(); expect(listEntries()).toHaveLength(1);
});
it('a failed save keeps the sheet and reports it', () => {
  useApp.getState().setDoc(sampleDoc('asax'));
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
  expect(useApp.getState().saveSheet()).toBe(false); spy.mockRestore();
  expect(useApp.getState().saveError).toBe(BLOCKED_MESSAGE); expect(saveStatus(useApp.getState())).toBe('new'); expect(useApp.getState().doc).not.toBeNull();
});
it('opening an entry replaces the sheet, clears the song and is saved', () => {
  useApp.getState().setDoc({ ...sampleDoc('cl'), title: 'Mine' }); useApp.getState().saveSheet(); const id = useApp.getState().libraryId!;
  useApp.setState({ song: {} as any }); useApp.getState().setDoc(sampleDoc('fl'));
  expect(useApp.getState().openEntry(id)).toBe(true);
  expect(useApp.getState()).toMatchObject({ song: null, libraryId: id, instId: 'cl' });
  expect(useApp.getState().doc!.source).toMatchObject({ format: 'library', file: 'Mine' }); expect(saveStatus(useApp.getState())).toBe('saved');
  expect(useApp.getState().openEntry('nope')).toBe(false);
});
it('an imported file is added and opened', () => {
  expect(useApp.getState().openImported({ ...sampleDoc('xc'), title: 'Dropped' }, 'dropped.fingerscore.json')).toBe(true);
  expect(listEntries()[0].title).toBe('Dropped'); expect(useApp.getState().doc!.source).toMatchObject({ format: 'file', file: 'dropped.fingerscore.json' });
  expect(saveStatus(useApp.getState())).toBe('saved');
});
it('forgetting the current entry makes the sheet new again', () => { useApp.getState().setDoc(sampleDoc('asax')); useApp.getState().saveSheet();
  const id = useApp.getState().libraryId!; deleteEntry(id); useApp.getState().forgetEntry(id); expect(saveStatus(useApp.getState())).toBe('new'); });
it('library link survives a reload', () => { useApp.getState().setDoc(sampleDoc('asax')); useApp.getState().saveSheet(); const id = useApp.getState().libraryId;
  useApp.setState({ doc: null, libraryId: null, savedSnapshot: null }); hydrate(); expect(useApp.getState().libraryId).toBe(id); expect(saveStatus(useApp.getState())).toBe('saved'); });
it('a new sheet from an import is not linked', () => { useApp.getState().setDoc(sampleDoc('asax')); useApp.getState().saveSheet(); useApp.getState().setDoc(sampleDoc('fl')); expect(useApp.getState().libraryId).toBeNull(); });
```

Extend the existing `beforeEach` of `store.test.ts` to reset the new fields.
- [ ] **Step 2: Run** `npx vitest run src/state src/domain/timeAgo.test.ts` → FAIL.
- [ ] **Step 3: Implement.** In `openEntry`, changing the instrument must not go through `setInstrument` (it would re-pick the shift): set `doc` and `instId` directly.
- [ ] **Step 4: Run** → PASS; `npm test` green.
- [ ] **Step 5: Commit** `feat: sheet library, save state in the store, time-ago text`.

---

### Task 3: Sheet page — Save, status, File menu, open by id

**Files:**
- Create: `src/ui/SaveControls.tsx`, `src/ui/FileMenu.tsx`, `src/ui/Toast.tsx` (+ CSS modules), `src/ui/download.ts`
- Modify: `src/pages/SheetPage.tsx`, `src/pages/SheetPage.module.css`, `src/pages/SheetPage.test.tsx`, `src/App.tsx` (toast host), `src/pages/Start.tsx` (the "no longer saved" alert only)

**Interfaces:**
- Consumes: Task 1 and 2 exports.
- Produces:

```tsx
export function SaveControls(p: { status: SaveStatus; error: string | null; onSave(): void }): JSX.Element;   // 'Not saved yet' | 'Unsaved changes' | 'Saved' + Save button; error as role="alert"
export function FileMenu(p: { entries: LibraryEntry[]; currentId: string | null; onPrint(): void; onDownload(): void; onOpenFile(file: File): void; onNew(): void; onOpen(id: string): void; onDelete(id: string): void }): JSX.Element;
export function showToast(t: { message: string; action?: { label: string; run(): void }; ms?: number }): void;   // one toast at a time; default 6000 ms
export function ToastHost(): JSX.Element;                    // mounted once in App; role="status"
export function downloadText(name: string, text: string): void;   // Blob URL + temporary <a download>
```

Behaviour: design 4.4 and 4.5 in full. Details the design leaves open:
- The page bar's right side is `<SaveControls/>` then `<FileMenu/>`; the old Print button is removed (Print is the menu's first, teal item).
- The menu: `role="menu"` with `role="menuitem"` buttons; opens on click, Enter, Space or ArrowDown on the button; ArrowUp/ArrowDown move focus, Home/End jump, Esc closes and returns focus to the button, Tab closes; outside click closes; choosing an item closes it. "Open JSON file…" triggers a hidden `<input type="file" accept=".json,application/json">`.
- Open JSON file: read the text, `parseFileText`; on success `openImported(doc, file.name)`; on failure show the `importMessage` in a `role="alert"` line under the page bar (dismissed by the next successful action).
- Saved list: entries from `listEntries()` read when the menu opens; current one marked `aria-current="true"`; "No saved sheets yet." when empty. Open → `openEntry(id)`. Delete → `deleteEntry(id)`, `forgetEntry(id)`, toast `Deleted "{title}"` with Undo → `restoreEntry(entry)`.
- `/sheet?id=…`: on mount, if the query has an id, `openEntry(id)`; success → `navigate('/sheet', { replace: true })`; failure → `navigate('/', { replace: true, state: { missingSheet: true } })`, and the Start page shows `role="alert"` "That sheet is no longer saved in this browser." when it receives that state. This must work when there is no current doc (the existing "no doc → redirect" must run after the id is handled).
- Chip (design 4.5): `source.format` `'file'` → document icon + `{source.file} · fingerscore sheet · {N} notes`; `'library'` → document icon + `{source.file} · saved in this browser · {N} notes`; otherwise as today. The step indicator shows only for `MIDI`/`MusicXML`/`sample` sources.
- Keyboard shortcut: Ctrl/⌘+S saves (preventDefault) while the sheet page is mounted.

- [ ] **Step 1: Write the failing tests** (extend `SheetPage.test.tsx`; reset `localStorage` and the new store fields in `beforeEach`)

```tsx
it('save status and Save', async () => {
  open('asax'); expect(screen.getByText('Not saved yet')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save' })); expect(screen.getByText('Saved')).toBeInTheDocument(); expect(listEntries()).toHaveLength(1);
  await user.click(screen.getByLabelText('Lyrics')); expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  await user.keyboard('{Control>}s{/Control}'); expect(screen.getByText('Saved')).toBeInTheDocument(); expect(listEntries()).toHaveLength(1);
});
it('a failed save shows the storage message', async () => {
  open('asax'); const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
  await user.click(screen.getByRole('button', { name: 'Save' })); spy.mockRestore();
  expect(screen.getByRole('alert')).toHaveTextContent('This browser blocks local storage. Use "Download JSON" instead.'); expect(screen.getByText('Not saved yet')).toBeInTheDocument();
});
it('file menu: items, keyboard, close', async () => {
  open('asax'); const btn = screen.getByRole('button', { name: /File/ }); expect(btn).toHaveAttribute('aria-haspopup', 'menu'); expect(btn).toHaveAttribute('aria-expanded', 'false');
  await user.click(btn); const menu = screen.getByRole('menu');
  expect(within(menu).getAllByRole('menuitem').slice(0, 4).map(i => i.textContent)).toEqual(['Print', 'Download JSON', 'Open JSON file…', 'New sheet']);
  expect(within(menu).getByText('No saved sheets yet.')).toBeInTheDocument();
  expect(within(menu).getByText(/Sheets are stored only on this device/)).toBeInTheDocument();
  await user.keyboard('{Escape}'); expect(screen.queryByRole('menu')).toBeNull(); expect(btn).toHaveFocus();
});
it('Print moved into the menu', async () => { open('asax'); const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  expect(screen.queryByRole('button', { name: 'Print' })).toBeNull(); await user.click(screen.getByRole('button', { name: /File/ }));
  await user.click(screen.getByRole('menuitem', { name: 'Print' })); expect(print).toHaveBeenCalled(); });
it('Download JSON writes the file', async () => { open('asax'); /* vi.mock('../ui/download') */ await user.click(screen.getByRole('button', { name: /File/ }));
  await user.click(screen.getByRole('menuitem', { name: 'Download JSON' }));
  expect(downloadText).toHaveBeenCalledWith('the-water-is-wide.fingerscore.json', expect.stringContaining('"app": "fingerscore"')); });
it('Open JSON file: round trip and a foreign file', async () => {
  open('asax'); const text = serializeFile({ ...sampleDoc('cl'), title: 'From file' });
  await user.click(screen.getByRole('button', { name: /File/ })); await user.click(screen.getByRole('menuitem', { name: 'Open JSON file…' }));
  await user.upload(screen.getByLabelText('Open JSON file', { selector: 'input' }), new File([text], 'from-file.fingerscore.json', { type: 'application/json' }));
  expect(await screen.findByRole('textbox', { name: 'Sheet title' })).toHaveValue('From file'); expect(screen.getByText(/from-file\.fingerscore\.json · fingerscore sheet/)).toBeInTheDocument();
  expect(screen.getByText('Saved')).toBeInTheDocument(); expect(screen.queryByText('Change track')).toBeNull();
  await user.upload(screen.getByLabelText('Open JSON file', { selector: 'input' }), new File(['{"name":"x"}'], 'package.json', { type: 'application/json' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('"package.json" isn\'t a fingerscore sheet.'); expect(screen.getByRole('textbox', { name: 'Sheet title' })).toHaveValue('From file');
});
it('saved list: open another sheet, delete with undo', async () => {
  saveEntry({ ...sampleDoc('fl'), title: 'Other' }, null); open('asax'); await user.click(screen.getByRole('button', { name: 'Save' }));
  await user.click(screen.getByRole('button', { name: /File/ })); const menu = screen.getByRole('menu');
  expect(within(menu).getByText('The Water Is Wide').closest('[aria-current="true"]')).not.toBeNull();
  await user.click(within(menu).getByRole('menuitem', { name: 'Open Other' })); expect(screen.getByRole('textbox', { name: 'Sheet title' })).toHaveValue('Other');
  expect(screen.getByText(/Other · saved in this browser/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /File/ })); await user.click(screen.getByRole('menuitem', { name: 'Delete Other' }));
  expect(listEntries().map(e => e.title)).toEqual(['The Water Is Wide']); expect(screen.getByText('Not saved yet')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Undo' })); expect(listEntries().map(e => e.title)).toContain('Other');
});
it('/sheet?id opens a saved sheet without a current doc; an unknown id goes to the start page', async () => {
  const r = saveEntry({ ...sampleDoc('cl'), title: 'Linked' }, null) as any; useApp.setState({ doc: null });
  renderSheet(`/sheet?id=${r.entry.id}`); expect(await screen.findByRole('textbox', { name: 'Sheet title' })).toHaveValue('Linked'); expect(currentPath()).toBe('/sheet');
  cleanup(); useApp.setState({ doc: null }); renderSheet('/sheet?id=nope'); expect(currentPath()).toBe('/');
});
```

Adapt helper names (`open`, `renderSheet`, `currentPath`) to those already in the file; `renderSheet` needs an optional initial URL and a `ToastHost`.
- [ ] **Step 2: Run** `npx vitest run src/pages/SheetPage.test.tsx` → FAIL.
- [ ] **Step 3: Implement**, layout and copy from `prototype/Editor.dc.html` (search for the File menu and save status markup).
- [ ] **Step 4: Run** → PASS; `npm test`, `npm run build` green.
- [ ] **Step 5: Commit** `feat: save, save status and File menu on the sheet page`.

---

### Task 4: Start page — gallery and saved sheets in the drop zone

**Files:**
- Create: `src/ui/Gallery.tsx`, `src/ui/Gallery.module.css`
- Modify: `src/ui/DropZone.tsx`, `src/ui/DropZone.module.css`, `src/pages/Start.tsx`, `src/pages/Start.test.tsx`, `src/import/index.ts` (`ACCEPT` gains `.json`)

**Interfaces:**
- Consumes: `listEntries`, `deleteEntry`, `restoreEntry`, `saveEntry`, `timeAgo`, `parseFileText`, `importMessage`, `showToast`, store `forgetEntry`.
- Produces: `<Gallery />` (reads the library on mount and after its own changes); `DropZone` gains `onSheet?(entry: LibraryEntry): void`.

Behaviour: design 4.6 in full. Details: the gallery is a `<section aria-labelledby>` with heading "Your sheets"; each card is an `<a href="/sheet?id=…">` (router `Link`) containing the decorative staff SVG (`aria-hidden`), title, instrument and time-ago, with a separate delete `<button aria-label="Delete {title}">` that is not nested inside the link; "Show all {N}" is a button that reveals the rest (no route change). Deleting also calls `forgetEntry(id)`. The drop zone decides by extension: `.json` → saved-sheet path (read text → `parseFileText` → `saveEntry(doc, null)` → result state with `role="status"`); a storage failure shows the storage message as the error state. [Open sheet →] navigates to `/sheet?id={id}`; [Add another] returns to idle and the gallery shows the new sheet.

- [ ] **Step 1: Write the failing tests** (extend `Start.test.tsx`; clear `localStorage` in `beforeEach`; render with `ToastHost`)

```tsx
it('no gallery without saved sheets', () => { renderStart(); expect(screen.queryByRole('heading', { name: 'Your sheets' })).toBeNull(); });
it('gallery lists saved sheets newest first, four at a time', async () => {
  for (let i = 1; i <= 6; i++) saveEntry({ ...sampleDoc('asax'), title: `Sheet ${i}` }, null, new Date(Date.UTC(2026, 10, 22, 10, i)));
  renderStart(); const g = screen.getByRole('region', { name: 'Your sheets' });
  expect(within(g).getByText('6 sheets · saved in this browser')).toBeInTheDocument();
  expect(within(g).getAllByRole('link').map(a => a.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Sheet 6')]));
  expect(within(g).getAllByRole('link')).toHaveLength(4); expect(within(g).getAllByRole('link')[0]).toHaveTextContent('Sheet 6');
  expect(within(g).getAllByRole('link')[0]).toHaveAttribute('href', expect.stringMatching(/^\/sheet\?id=/)); expect(within(g).getAllByRole('link')[0]).toHaveTextContent('Alto sax in E♭');
  await user.click(within(g).getByRole('button', { name: 'Show all 6' })); expect(within(g).getAllByRole('link')).toHaveLength(6);
});
it('delete with undo', async () => {
  saveEntry({ ...sampleDoc('asax'), title: 'Keep' }, null); saveEntry({ ...sampleDoc('cl'), title: 'Drop me' }, null); renderStart();
  await user.click(screen.getByRole('button', { name: 'Delete Drop me' })); expect(screen.queryByText('Drop me')).toBeNull(); expect(listEntries()).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('Deleted "Drop me"'); await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByText('Drop me')).toBeInTheDocument(); expect(listEntries()).toHaveLength(2);
});
it('drop zone copy and chips include saved sheets', () => { renderStart(); expect(screen.getByText('Drop a song or a saved sheet here')).toBeInTheDocument(); expect(screen.getByText(/Saved sheet/)).toBeInTheDocument(); });
it('a saved sheet dropped on the zone is added to the library', async () => {
  renderStart(); const text = serializeFile({ ...sampleDoc('fl'), title: 'Dropped' });
  await user.upload(screen.getByLabelText(/drop a song or a saved sheet/i), new File([text], 'dropped.fingerscore.json', { type: 'application/json' }));
  expect(await screen.findByText('✓ "Dropped" added to your sheets')).toBeInTheDocument(); expect(listEntries()[0].title).toBe('Dropped');
  expect(screen.getByRole('link', { name: /Open sheet/ })).toHaveAttribute('href', `/sheet?id=${listEntries()[0].id}`);
  await user.click(screen.getByRole('button', { name: 'Add another' })); expect(screen.getByRole('region', { name: 'Your sheets' })).toHaveTextContent('Dropped');
});
it('a foreign JSON file is refused and nothing is added (review focus 1)', async () => {
  renderStart(); await user.upload(screen.getByLabelText(/drop a song or a saved sheet/i), new File(['{"name":"x","version":"1.0.0"}'], 'package.json', { type: 'application/json' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('"package.json" isn\'t a fingerscore sheet.'); expect(listEntries()).toEqual([]);
});
it('the missing-sheet alert', () => { renderStart({ state: { missingSheet: true } }); expect(screen.getByRole('alert')).toHaveTextContent('That sheet is no longer saved in this browser.'); });
```

Update the existing tests that assert the old drop-zone text ("Drop a song here") and the absence of the saved-sheet chip.
- [ ] **Step 2: Run** `npx vitest run src/pages/Start.test.tsx` → FAIL.
- [ ] **Step 3: Implement**, layout from `prototype/Main.dc.html` (search for "Your sheets" and the saved-sheet chip).
- [ ] **Step 4: Run** → PASS; `npm test`, `npm run build` green.
- [ ] **Step 5: Commit** `feat: saved-sheets gallery and JSON import on the start page`.

---

### Task 5: End-to-end test and README

**Files:**
- Create: `e2e/library.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the e2e test** (selectors by accessible name; adapt to the real names if a task chose slightly different ones, keeping every assertion's intent)

```ts
test('save, reload, reopen from the gallery, export and import', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.getByRole('button', { name: /Try a sample/ }).click(); await page.getByRole('button', { name: /Make the sheet from/ }).click();
  await expect(page.getByText('Not saved yet')).toBeVisible(); await page.getByRole('button', { name: 'Save' }).click(); await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Sheet title' }).fill('Auld Lang Syne (mine)'); await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click(); await page.reload(); await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /File/ }).click(); const dl = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'Download JSON' }).click();
  const file = await dl; expect(file.suggestedFilename()).toBe('auld-lang-syne-mine.fingerscore.json'); const path = await file.path();
  await page.goto('/'); const gallery = page.getByRole('region', { name: 'Your sheets' }); await expect(gallery.getByRole('link')).toHaveCount(1);
  await gallery.getByRole('link').first().click(); await expect(page).toHaveURL(/\/sheet$/); await expect(page.getByRole('textbox', { name: 'Sheet title' })).toHaveValue('Auld Lang Syne (mine)');
  await expect(page.getByText(/saved in this browser/)).toBeVisible(); await expect(page.getByText('Change track')).toHaveCount(0);
  await page.goto('/'); await page.getByRole('button', { name: /Delete Auld Lang Syne \(mine\)/ }).click(); await expect(page.getByRole('region', { name: 'Your sheets' })).toHaveCount(0);
  await page.setInputFiles('input[type=file]', path!); await expect(page.getByText('✓ "Auld Lang Syne (mine)" added to your sheets')).toBeVisible();
  await page.getByRole('link', { name: /Open sheet/ }).click(); await expect(page.getByRole('textbox', { name: 'Sheet title' })).toHaveValue('Auld Lang Syne (mine)');
  await expect(page.locator('[data-chart]').first()).toBeVisible(); expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run** `npm run test:e2e` → fix what fails in the app, not in the test, unless a control is named differently.
- [ ] **Step 3: README**: move saving, the library and JSON files from "does not do" to "does"; describe the file format in two sentences (one format, no compatibility promise before the public release); keep the rest true.
- [ ] **Step 4: Run** `npm test`, `npm run build`, `npm run test:e2e` → all green.
- [ ] **Step 5: Commit** `test: end-to-end library flow; docs: README for saving and files`.

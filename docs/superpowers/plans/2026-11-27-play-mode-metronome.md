# Play Mode Tempo and Metronome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Play mode's percent speed slider with a per-sheet BPM that drives auto-scroll and a new metronome.

**Architecture:** Pure tempo and beat maths go in `src/domain/playMode.ts`. A tiny storage module `src/state/playTempos.ts` keeps one BPM per library id, plus one in memory for an unsaved sheet; it depends only on `src/shell/storage.ts`, so the store can call it without pulling Play mode code into other routes. A Web Audio click scheduler lives in `src/audio/metronome.ts`. `src/ui/PlayMode.tsx` wires them together.

**Tech Stack:** React 18, TypeScript, zustand, Vitest + Testing Library, Web Audio.

**Spec:** `docs/superpowers/specs/2026-11-27-fingerscore-play-mode-metronome-design.md`

## Global Constraints

- Play mode never changes the doc: no `applyEdit`, no change to `savedSnapshot`, no undo step.
- Tempo range: whole BPM from `round(0.25 × sheet tempo)` to `round(1.5 × sheet tempo)`, kept within 20–300.
- Beat unit: quarter in 4/4, 3/4, 2/4; dotted quarter in 6/8; half in 2/2. Beat 1 of each bar is accented.
- Readout: `♩ = 96 · 80% · 1 line / 12 s`, or `♩ = 96 · 80% · starts in 8 s` while auto-scroll waits.
- No backward compatibility: `fingerscore.playmode` keeps only `{ zoom }`; a stored `speed` is ignored.
- Deviation from the spec, for the bundle: tempos live under their own key `fingerscore.playtempo` (`{ [libraryId]: bpm }`), not inside `fingerscore.playmode`. Two modules writing one key would overwrite each other's fields.
- Zero SonarCloud issues before the branch is called ready (CLAUDE.md).
- Shortcut M: `GROUPS` play group, `aria-keyshortcuts="M"`, tooltip `Metronome (M)`, README key table. `rowFor` covers only sheet-page keys and has no Play mode rows, so it gets no entry.

## Review Focus

1. **Tempo changed while the metronome runs:** the next click comes one new interval after the last click, not a burst of catch-up clicks and not a restart of the bar. Test in Task 3.
2. **Stored BPM out of range for the sheet** (the sheet's tempo was lowered on the sheet page after saving 180): Play mode opens at the clamped value, and the slider shows it. Test in Task 1 (`clampTempo`) and Task 4.
3. **Unsaved sheet, then Save:** the BPM set in Play mode before saving is there after saving and reopening. Test in Task 2.
4. **Leaving Play mode while clicking:** no click sounds after exit. Test in Task 4.
5. **M while a button or the slider has focus, and held M:** toggles once; held key repeat does nothing. Test in Task 4.

---

### Task 1: Tempo and beat maths

**Files:**
- Modify: `src/domain/playMode.ts`
- Test: `src/domain/playMode.test.ts`

**Interfaces:**
- Produces:
  - `tempoRange(sheetTempo: number): { min: number; max: number }`
  - `clampTempo(v: unknown, sheetTempo: number): number` — not a finite number → `sheetTempo` clamped; else rounded and clamped to `tempoRange`.
  - `percentOf(bpm: number, sheetTempo: number): number` — `Math.round(bpm / sheetTempo * 100)`.
  - `lineSeconds(beats: number, bpm: number): number` — was `(beats, tempo, speed)`.
  - `scrollSpeed(beats: number, bpm: number, zoom: number, systemHeight: number): number` — was `(beats, tempo, speed, zoom, systemHeight)`.
  - `speedLabel(beats: number, bpm: number, sheetTempo: number, startsIn?: number | null): string`
  - `beatPattern(timeSig: TimeSig): { perBar: number; quarters: number }` — quarters per beat.
  - Removed: `SPEED`, `clampSpeed`.

- [ ] **Step 1: Write the failing tests** (replace the `SPEED`, `clampSpeed`, `scrollSpeed`, `lineSeconds` and `speedLabel` tests)

```ts
it('limits the tempo to 25–150 % of the sheet, within 20–300', () => {
  expect(tempoRange(120)).toEqual({ min: 30, max: 180 });
  expect(tempoRange(60)).toEqual({ min: 20, max: 90 });
  expect(tempoRange(240)).toEqual({ min: 60, max: 300 });
});
it('clamps a stored tempo', () => {
  expect(clampTempo(96, 120)).toBe(96);
  expect(clampTempo(96.4, 120)).toBe(96);
  expect(clampTempo(500, 120)).toBe(180);
  expect(clampTempo(5, 120)).toBe(30);
  expect(clampTempo('x', 120)).toBe(120);
  expect(clampTempo(null, 120)).toBe(120);
  expect(clampTempo(NaN, 120)).toBe(120);
});
it('scrolls one zoomed line per line time at the BPM', () => {
  expect(lineSeconds(16, 100)).toBeCloseTo(9.6);
  expect(scrollSpeed(16, 100, 125, 290)).toBeCloseTo((290 * 1.25) / 9.6);
  expect(scrollSpeed(16, 50, 125, 290)).toBeCloseTo((290 * 1.25) / 19.2);
  expect(scrollSpeed(0, 100, 125, 290)).toBe(0);
});
it('labels the tempo with its share of the sheet tempo', () => {
  expect(speedLabel(16, 100, 100)).toBe('♩ = 100 · 100% · 1 line / 10 s');
  expect(speedLabel(16, 96, 120)).toBe('♩ = 96 · 80% · 1 line / 10 s');
  expect(speedLabel(16, 96, 120, 7.2)).toBe('♩ = 96 · 80% · starts in 8 s');
});
it.each([
  [[4, 4], 4, 1], [[3, 4], 3, 1], [[2, 4], 2, 1], [[6, 8], 2, 1.5], [[2, 2], 2, 2],
] as const)('counts %j in %i beats of %f quarters', (ts, perBar, quarters) => {
  expect(beatPattern(ts as TimeSig)).toEqual({ perBar, quarters });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/domain/playMode.test.ts`
Expected: FAIL (`tempoRange is not a function` and the changed signatures).

- [ ] **Step 3: Implement the functions in `src/domain/playMode.ts`**

Remove `SPEED` and `clampSpeed`. Name the range limits as constants (`TEMPO = { minShare: 0.25, maxShare: 1.5, floor: 20, ceiling: 300 }`).

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/domain/playMode.test.ts`
Expected: PASS. `npx tsc -b` reports errors only in `PlayMode.tsx`, `playModePrefs.ts` and their tests; Task 2 and Task 4 fix them.

- [ ] **Step 5: Commit**

```bash
git add src/domain/playMode.ts src/domain/playMode.test.ts
git commit -m "feat: Play mode tempo range, label and beat pattern"
```

### Task 2: Per-sheet tempo storage

**Files:**
- Create: `src/state/playTempos.ts`
- Test: `src/state/playTempos.test.ts`
- Modify: `src/state/playModePrefs.ts` (drop `speed`), `src/state/store.ts` (`fresh`, `saveSheet`), `src/content/storageItems.ts`
- Test: `src/state/store.test.ts`

**Interfaces:**
- Consumes: `readJSON`, `writeJSON` from `src/shell/storage.ts`.
- Produces:
  - `readPlayTempo(id: string | null): number | null` — raw stored value; `null` id reads the in-memory unsaved value. Callers clamp.
  - `writePlayTempo(id: string | null, bpm: number, known: ReadonlySet<string>): void` — `null` id sets memory; otherwise drops map entries whose id is not in `known` (the written id always stays) and writes.
  - `adoptUnsavedTempo(id: string): void` — moves the memory value, if any, under `id` without pruning, then clears memory.
  - `forgetUnsavedTempo(): void`
  - `PlayModePrefs` becomes `{ zoom: number }`.

- [ ] **Step 1: Write the failing tests** in `src/state/playTempos.test.ts`

```ts
const KEY = 'fingerscore.playtempo';
beforeEach(() => { window.localStorage.clear(); forgetUnsavedTempo(); });

it('keeps one tempo per saved sheet', () => {
  writePlayTempo('a', 96, new Set(['a', 'b']));
  writePlayTempo('b', 70, new Set(['a', 'b']));
  expect(readPlayTempo('a')).toBe(96);
  expect(readPlayTempo('b')).toBe(70);
  expect(readPlayTempo('c')).toBeNull();
});
it('drops tempos of sheets no longer in the library when it writes', () => {
  writePlayTempo('a', 96, new Set(['a', 'gone']));
  window.localStorage.setItem(KEY, JSON.stringify({ a: 96, gone: 80 }));
  writePlayTempo('b', 70, new Set(['a', 'b']));
  expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({ a: 96, b: 70 });
});
it('keeps an unsaved sheet’s tempo in memory, and moves it under the id on save', () => {
  writePlayTempo(null, 88, new Set());
  expect(readPlayTempo(null)).toBe(88);
  expect(window.localStorage.getItem(KEY)).toBeNull();
  adoptUnsavedTempo('new');
  expect(readPlayTempo('new')).toBe(88);
  expect(readPlayTempo(null)).toBeNull();
});
it.each(['not json', '[]', 'null', '{"a":"x"}'])('reads nothing from stored %s', raw => {
  window.localStorage.setItem(KEY, raw);
  expect(readPlayTempo('a')).toBeNull();
});
```

In `src/state/store.test.ts`, add:

```ts
it('carries the Play mode tempo of an unsaved sheet over to its first save', () => {
  // open an unsaved sheet (openUnsaved), writePlayTempo(null, 88, new Set()), saveSheet()
  expect(readPlayTempo(useApp.getState().libraryId)).toBe(88);
});
it('forgets the unsaved tempo when another sheet opens', () => {
  // writePlayTempo(null, 88, new Set()), openUnsaved(other doc)
  expect(readPlayTempo(null)).toBeNull();
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/state/playTempos.test.ts src/state/store.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/state/playTempos.ts`; call `forgetUnsavedTempo()` inside `fresh()` and `adoptUnsavedTempo(r.entry.id)` in `saveSheet` when the previous `libraryId` was `null`; drop `speed` from `playModePrefs.ts`; add `{ key: 'fingerscore.playtempo', where: 'local', label: 'the Play mode tempo of each sheet' }` to `STORAGE_ITEMS`**

A map value counts only when it is a finite number.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/state src/content`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state src/content/storageItems.ts
git commit -m "feat: keep a Play mode tempo per sheet"
```

### Task 3: Metronome sound

**Files:**
- Create: `src/audio/metronome.ts`
- Test: `src/audio/metronome.test.ts`

**Interfaces:**
- Consumes: `beatPattern` from Task 1; `FakeAudioContext` from `src/test/fakeAudio.ts`.
- Produces:
  - `interface Metronome { start(bpm: number, timeSig: TimeSig): void; setTempo(bpm: number): void; stop(): void; readonly running: boolean }`
  - `createMetronome(): Metronome` — creates its AudioContext on the first `start`.
  - Exported constants `ACCENT_HZ = 1600`, `BEAT_HZ = 1000`, `CLICK_SECONDS = 0.03`.

Scheduling follows `src/audio/player.ts`: a `setInterval` of 25 ms queues every click that starts within 0.1 s of `currentTime`. Each click is an oscillator into a gain with a fast attack and an exponential decay over `CLICK_SECONDS`, connected to `ctx.destination` (no reverb). The first click sounds 0.05 s after `start` and is beat 1. `setTempo` sets the next click to `lastClick + newInterval`, or `currentTime + 0.05` if that is already past; the beat count carries on.

- [ ] **Step 1: Write the failing tests** (fake timers, `vi.stubGlobal('AudioContext', FakeAudioContext)`; advance the fake context's `currentTime` with the timers)

```ts
it('clicks every beat, accenting the first of each bar', () => {
  // start(120, [3, 4]); advance 1.6 s
  // oscillator start times ≈ [0.05, 0.55, 1.05, 1.55]; frequencies [ACCENT_HZ, BEAT_HZ, BEAT_HZ, ACCENT_HZ]
});
it('clicks dotted quarters in 6/8 and halves in 2/2', () => {
  // start(120, [6, 8]): interval 0.75 s; start(120, [2, 2]): interval 1 s
});
it('takes a new tempo at the next beat without catching up', () => {
  // start(120, [4, 4]); advance to 0.6 s (clicks at 0.05, 0.55); setTempo(60); advance to 2.2 s
  // next clicks at 1.55, 2.55 is not yet queued; the beat after 0.55 is beat 3 (BEAT_HZ)
});
it('stops clicking and stops queued clicks', () => {
  // start, advance, stop(); every queued oscillator has stop() called; no oscillator created after stop
  // running is false
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/audio/metronome.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `createMetronome` in `src/audio/metronome.ts`**

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/audio`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio/metronome.ts src/audio/metronome.test.ts
git commit -m "feat: metronome click scheduler"
```

### Task 4: Play mode tempo slider and metronome button

**Files:**
- Modify: `src/ui/PlayMode.tsx`, `src/pages/SheetPage.tsx:177` (pass `sheetId={libraryId}`), `src/ui/shortcuts.ts` (play group), `README.md` (feature line and key table), `src/ui/PlayMode.module.css` if the readout needs room
- Test: `src/ui/PlayMode.test.tsx`

**Interfaces:**
- Consumes: Task 1 functions, Task 2 `readPlayTempo`/`writePlayTempo`, Task 3 `createMetronome`, `listEntries` from `src/state/library.ts` (for the `known` id set).
- Produces: `PlayMode` props become `{ doc; derived; layout; sheetId: string | null; onExit }`.

Behaviour:
- `bpm` state starts at `clampTempo(readPlayTempo(sheetId), doc.tempo)`. The slider has accessible name `Tempo`, `min`/`max` from `tempoRange(doc.tempo)`, step 1. A change sets `bpm` and calls `writePlayTempo(sheetId, bpm, new Set(listEntries().map(e => e.id)))`.
- The scroll `pace` ref carries `bpm` instead of `tempo` and `speed`; `scrollSpeed(beats, bpm, zoom, systemHeight)`.
- Readout: `speedLabel(fullLineBeats(beats), bpm, doc.tempo, startsIn)`.
- A toolbar button after the tempo slider: label `Metronome`, `aria-pressed`, `aria-keyshortcuts="M"`, `title="Metronome (M)"`, class `s.on` while running. It and the key `m`/`M` toggle the metronome. Add `'m', 'M'` to the held-key list.
- The metronome is created lazily on the first toggle, gets `setTempo(bpm)` when `bpm` changes while running, and `stop()` on unmount.
- `GROUPS` play group, after `auto`: `{ id: 'metro', label: 'Metronome on or off', syn: 'click beat tempo bpm tick', keys: [k('M')] }`.
- README: change the Play mode feature line (speed slider → tempo in BPM per sheet, metronome on M); add `| M | Play mode | Metronome on or off |` after the Home/End Play mode row.

- [ ] **Step 1: Write the failing tests** (rename every `'Auto-scroll speed'` slider lookup to `'Tempo'`; replace the `speed` storage tests; stub `AudioContext` with `FakeAudioContext`)

```ts
it('opens at the sheet’s tempo when the sheet has none stored', () => {
  open(); // sampleDoc tempo T
  expect(screen.getByRole('slider', { name: 'Tempo' })).toHaveValue(String(T));
  expect(readout()).toMatch(new RegExp(`^♩ = ${T} · 100% · `));
});
it('opens at the stored tempo of this sheet, clamped to the sheet’s range', () => {
  window.localStorage.setItem('fingerscore.playtempo', JSON.stringify({ s1: 999 }));
  open({ sheetId: 's1' });
  expect(screen.getByRole('slider', { name: 'Tempo' })).toHaveValue(String(tempoRange(T).max));
});
it('stores a tempo change for this sheet and never touches the doc', () => {
  // saved entry with id s1 in the library; open({ sheetId: 's1' }); change slider to 0.8 T
  expect(readPlayTempo('s1')).toBe(Math.round(0.8 * T));
  expect(readout()).toMatch(/· 80% · /);
  // the doc passed in is unchanged (same object, same tempo)
});
it('scrolls at the pace of the Play mode tempo', () => {
  // existing pace test with scrollSpeed(beats[at], bpm, 125, systemHeight) after setting bpm
});
it('turns the metronome on and off with the button and with M, once per press', () => {
  // click Metronome → aria-pressed true, oscillators get scheduled; keyDown M → false
  // keyDown M with repeat: true → no change
  // keyDown M on the focused Tempo slider → toggles (M is not a slider key)
});
it('takes a tempo change while the metronome runs', () => {
  // M on, change slider; next oscillator start time follows the new interval
});
it('falls silent when Play mode closes', () => {
  // M on, unmount; queued oscillators stopped, none created afterwards
});
it('lists M in the Play mode keys card', () => {
  // press ?, the card has a row "Metronome on or off" with key M
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/ui/PlayMode.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the changes in `PlayMode.tsx`, `SheetPage.tsx`, `shortcuts.ts` and `README.md`**

- [ ] **Step 4: Run the full suite, types and bundle check**

Run: `npx vitest run && npm run build && npm run check:bundle`
Expected: all tests PASS; build succeeds; every bundle layer within its limit.

- [ ] **Step 5: Commit**

```bash
git add src/ui src/pages/SheetPage.tsx README.md
git commit -m "feat: Play mode tempo in BPM per sheet and a metronome on M"
```

### Task 5: Browser check and SonarCloud

- [ ] **Step 1:** Start the dev server with `preview_start`, open the sample sheet in Play mode. Check: slider shows the sheet tempo, readout format, M toggles the button state, no console errors, the layout fits at 375 px width.
- [ ] **Step 2:** Push the branch, wait for CI's SonarCloud job, run `SONAR_BRANCH=claude/metronome-play-view-1f9592 node scripts/check-sonar.mjs`. Fix each issue, push, repeat until it prints `no open issues`.

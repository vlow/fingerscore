# Woodwind Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-oscillator chiptune note in playback with a woodwind voice (custom waveform, breath noise, delayed vibrato, filter envelope) driven by per-family presets, feeding a shared reverb-and-limiter output.

**Architecture:** `presets.ts` holds the sound of each family as data. `output.ts` builds one shared output per `AudioContext` (dry + convolver reverb → limiter → destination). `voice.ts` schedules one note from a preset onto that output and returns a stoppable handle. `player.ts` keeps its scheduler and marks and calls the voice instead of wiring oscillators.

**Tech Stack:** TypeScript, Web Audio API, Vitest with a fake `AudioContext`.

**Spec:** `docs/superpowers/specs/2026-11-26-woodwind-voice-design.md`

## Global Constraints

- No new dependencies, no sample files, no AudioWorklet.
- No preset has vibrato depth above 15 cents or a vibrato delay below 0.25 s. Clarinet, Recorder and the preview preset have no vibrato.
- Reverb impulse: generated noise decaying over about 1.2 s; wet level about 0.15.
- Play must not start later than today: the first note is still scheduled at `currentTime + 0.08` (player) and `+ 0.05` (preview); waves, noise buffer and impulse are built once per context and cached.
- `npm run build && npm run check:bundle` passes.
- Zero open SonarCloud issues on the branch (`CLAUDE.md`), checked with `SONAR_BRANCH=<branch> node scripts/check-sonar.mjs`.
- New test helpers live in `src/test/` (excluded from coverage and duplication).

## Review Focus

1. **Stop mid-note.** Stop must silence everything the voice started, including the looping breath noise and the vibrato LFO; a looping noise source left running hisses forever. Test in Task 3.
2. **Very short notes.** A note shorter than attack + release (a 32nd at fast tempo) must still get envelope times that never go before `start` and are all finite. Test in Task 3.
3. **Repeated play.** Pressing play many times must reuse one shared output per context, not build a new convolver each time. Test in Task 2.
4. **Chords in the Tracks preview.** Several voices at once go through the limiter; previewing a chord schedules one voice per note. Test in Task 4.
5. **High notes.** Filter cutoffs (base and attack peak, scaled or not) never exceed half the sample rate. Test in Task 3.

---

### Task 1: Presets

**Files:**
- Create: `src/audio/presets.ts`
- Test: `src/audio/presets.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Preset {
    harmonics: number[];          // amplitude of harmonic 1..n, harmonic 1 = 1
    breath: { level: number; attackLevel: number; freq: number; q: number }; // hold level, peak on attack, bandpass
    vibrato: { rate: number; depth: number; delay: number; fade: number };   // Hz, cents, s, s; depth 0 = none
    filter: { base: number; peak: number; settle: number };                   // Hz, Hz, s
    attack: number; release: number; gain: number;                            // s, s, linear peak
  }
  export const PRESETS: Record<Family, Preset>;
  export const PREVIEW_PRESET: Preset;
  ```

- [ ] **Step 1: Write the failing tests** in `src/audio/presets.test.ts`:
  - `every preset keeps pitch clear`: for each of `PRESETS` and `PREVIEW_PRESET`, `vibrato.depth <= 15`, and `vibrato.depth === 0 || vibrato.delay >= 0.25`.
  - `clarinet, recorder and the preview have no vibrato`: `depth === 0` for `PRESETS.Clarinet`, `PRESETS.Recorder`, `PREVIEW_PRESET`.
  - `clarinet favours odd harmonics`: `harmonics[2] > harmonics[1]` and `harmonics[4] > harmonics[3]` (3rd > 2nd, 5th > 4th).
  - `every preset is well-formed`: `harmonics[0] === 1`, `filter.peak >= filter.base`, `attack > 0`, `release > 0`, `0 < gain <= 0.3`.
- [ ] **Step 2: Run** `npx vitest run src/audio/presets.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `src/audio/presets.ts`.** Starting values from the spec's table; to be tuned by ear in Task 5:
  - Saxophone: harmonics `1/n` for n = 1..12; breath 0.03 hold, 0.12 attack, 2500 Hz, Q 1; vibrato 5.5 Hz, 12 cents, 0.3 s delay, 0.3 s fade; filter 2400 → 4000 Hz over 0.12 s; attack 0.03, release 0.08, gain 0.2.
  - Xaphoon: like Saxophone with harmonics `1/n^1.3`, breath 0.05 / 0.15, filter 1600 → 2800, vibrato 10 cents.
  - Clarinet: odd harmonics `1/n`, even `0.15/n`, n = 1..11; breath 0.015 / 0.06; no vibrato; filter 1800 → 3000.
  - Flute: `[1, 0.25, 0.12, 0.04]`; breath 0.06 / 0.18, 3000 Hz, Q 0.7; vibrato 5 Hz, 15 cents, 0.25 s, 0.3 s; filter 4000 → 6000.
  - Recorder: `[1, 0.15, 0.08]`; breath 0.02 hold, 0.2 attack (the chiff), 3500 Hz, Q 2; no vibrato; filter 3500 → 5000 over 0.05 s.
  - Preview: `[1, 0.3, 0.1]`; breath 0.01 / 0.03; no vibrato; filter 3000 → 3500; gain 0.11 (half of today's peak; chords add up).
  Unused vibrato fields of no-vibrato presets: `{ rate: 0, depth: 0, delay: 0, fade: 0 }`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat: woodwind sound presets per family`.

### Task 2: Shared output and fake Web Audio

**Files:**
- Create: `src/test/fakeAudio.ts`
- Create: `src/audio/output.ts`
- Test: `src/audio/output.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/audio/output.ts
  export const REVERB_SECONDS = 1.2;
  export const REVERB_WET = 0.15;
  /** The node every voice connects to. Built on first call per context, then cached (WeakMap). */
  export function outputFor(ctx: BaseAudioContext): AudioNode;
  ```
  ```ts
  // src/test/fakeAudio.ts: records what the code builds
  export class FakeParam { value; setValueAtTime; linearRampToValueAtTime; exponentialRampToValueAtTime; setTargetAtTime; calls(): [string, number, number][] }
  export class FakeNode { start; stop; disconnect; setPeriodicWave; connect (records targets in `.outputs`); type; frequency; detune; gain; Q; buffer; loop; onended; threshold; knee; ratio; attack; release }
  export class FakeAudioContext { currentTime; sampleRate = 48000; destination; created: FakeNode[]; resume;
    createOscillator; createGain; createBiquadFilter; createBufferSource; createConvolver; createDynamicsCompressor;
    createBuffer(channels, length, rate) /* returns { length, numberOfChannels, getChannelData } with real Float32Arrays */;
    createPeriodicWave(real, imag) /* returns { real, imag } */ }
  ```
  Every `create*` pushes the node onto `created` with a `kind` field (`'oscillator'`, `'gain'`, `'biquad'`, `'source'`, `'convolver'`, `'compressor'`). `FakeParam` methods are `vi.fn()` and record `[method, value, time]`.

- [ ] **Step 1: Write `src/test/fakeAudio.ts`** as above.
- [ ] **Step 2: Write the failing tests** in `src/audio/output.test.ts`:
  - `builds one output per context`: `outputFor(ctx) === outputFor(ctx)`; `ctx.created.filter(n => n.kind === 'convolver')` has length 1 after both calls.
  - `routes dry and reverb into a limiter on the destination`: the compressor's `outputs` contains `ctx.destination`; the returned node connects to the compressor and to the convolver's input chain; the wet gain's `gain.value` is `REVERB_WET`.
  - `the impulse decays over 1.2 s`: convolver `buffer.length === Math.round(1.2 * 48000)`, 2 channels; mean absolute value of the last 10 % of samples < 0.05 × that of the first 10 %.
- [ ] **Step 3: Run** `npx vitest run src/audio/output.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement `outputFor`.** Input gain → (a) compressor, (b) wet gain (`REVERB_WET`) → convolver → compressor. Compressor as limiter: threshold −6 dB, knee 0, ratio 20, attack 0.003, release 0.1. Impulse: stereo white noise × `(1 - t/len)^3`.
- [ ] **Step 5: Run** the test. Expected: PASS.
- [ ] **Step 6: Commit** `feat: shared playback output with light reverb and a limiter`.

### Task 3: The voice

**Files:**
- Create: `src/audio/voice.ts`
- Test: `src/audio/voice.test.ts`

**Interfaces:**
- Consumes: `Preset` (Task 1); `FakeAudioContext` (Task 2, tests only).
- Produces:
  ```ts
  export interface Voice { stop(): void }   // stops and disconnects every source and node of the note; safe to call twice
  /** Schedules one note. `connected`: the note starts where the previous one ended (softer attack). */
  export function playVoice(ctx: BaseAudioContext, out: AudioNode, p: Preset, midi: number,
                            start: number, end: number, connected: boolean, onEnded?: () => void): Voice;
  export const hz: (midi: number) => number;   // moved here from player.ts
  ```

- [ ] **Step 1: Write the failing tests** (using `PRESETS` and `FakeAudioContext`):
  - `plays the pitch with the preset's waveform`: main oscillator `frequency.value ≈ 261.63` for midi 60, `setPeriodicWave` called; two voices of the same preset on one context call `createPeriodicWave` once.
  - `adds breath noise for the note's length`: one `source` node with `loop === true`, started at `start`, stopped at `end + release-tail`.
  - `vibrato only on long enough notes of presets that have it`: Saxophone note of 2 s → an LFO oscillator connected to the main oscillator's `detune`, with depth gain ramping from 0 at `start + delay` to `12` at `start + delay + fade`. Saxophone note of 0.3 s → no LFO. Clarinet note of 2 s → no LFO.
  - `a connected note starts softer`: breath gain peak and filter frequency peak are lower when `connected` is true than when false.
  - `stop silences everything`: after `voice.stop()`, every source and oscillator it created has had `stop` and `disconnect` called; calling `stop()` again does not throw.
  - `very short notes keep a sane envelope`: `start = 1`, `end = 1.01`: every recorded param time is finite and `>= 1`, and times on each param never decrease.
  - `filter stays below Nyquist`: for midi 100 with the Flute preset, every value set on the lowpass `frequency` is `<= 24000`.
- [ ] **Step 2: Run** `npx vitest run src/audio/voice.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `playVoice`.**
  - Waveform: `createPeriodicWave(real = zeros, imag = [0, ...harmonics])`, cached in a `WeakMap<BaseAudioContext, Map<Preset, PeriodicWave>>`. Noise: one 2 s mono white-noise buffer per context, cached the same way.
  - Envelope as today: 0 → `gain` over `attack`, hold, → 0 over `release`, with `attackEnd = min(start + attack, midpoint)` so short notes stay ordered.
  - Filter: lowpass at `peak` at start, `setTargetAtTime(base, start, settle / 3)`. When connected, use `base + (peak - base) * 0.3` as the start value. Clamp both to `ctx.sampleRate / 2 - 100`.
  - Breath: source → bandpass(`freq`, `q`) → gain: `attackLevel` at start (× 0.4 when connected), falling to `level` by `start + attack * 2`, → 0 at `end`.
  - Vibrato only when `depth > 0` and `end - start >= delay + 0.15`: sine LFO at `rate` → gain on `detune` (cents), ramped 0 → `depth` from `start + delay` over `fade`; a second gain of `gain * 0.05` from the same LFO onto the amplitude.
  - The main oscillator's `onended` calls `onEnded`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat: woodwind voice with breath, vibrato and a filter envelope`.

### Task 4: Player uses the voice

**Files:**
- Modify: `src/audio/player.ts` (all of `schedule()`, `clear()`, `TIMBRE`, `hz`, and the preview section)
- Modify: `src/audio/player.test.ts` (use `src/test/fakeAudio.ts`)

**Interfaces:**
- Consumes: `playVoice`, `Voice`, `hz` (Task 3); `outputFor` (Task 2); `PRESETS`, `PREVIEW_PRESET` (Task 1).
- Produces: no change to `Player`, `createPlayer`, `previewTrack`, `stopPreview`.

- [ ] **Step 1: Switch `player.test.ts` to the shared fake.** Replace the local `FakeNode`/`FakeAudioContext` with `FakeAudioContext` from `src/test/fakeAudio.ts`; `oscillators` becomes the context's created nodes of kind `'oscillator'` whose `frequency` was set to a note pitch (the preview preset has no vibrato, so that is one per note). Keep the three existing tests' assertions.
- [ ] **Step 2: Add failing tests:**
  - `player plays the family's preset`: playing a Doc with `inst: 'cl'` creates a periodic wave whose `imag` matches `PRESETS.Clarinet.harmonics`.
  - `back-to-back notes are connected, a gap is not`: notes at ticks 0–12, 12–24, 30–42 → the second note's breath attack peak is lower than the first's and the third's.
  - `stop silences breath noise too`: after `player.stop()`, every `source` node has `stop` called.
  - `previewTrack plays a chord`: three notes with the same start → three main oscillators, all started at 0.05.
- [ ] **Step 3: Run** `npx vitest run src/audio`. Expected: new tests FAIL.
- [ ] **Step 4: Change `player.ts`.** `schedule()` calls `playVoice(c, outputFor(c), PRESETS[inst(doc.inst).group], n.midi, start, end, connected, onEnded)`; `connected` is `prev !== undefined && prev.start + prev.dur === n.start` (ticks, previous scheduled note). `nodes` becomes `Voice[]`; `clear()` calls `stop()` on each. `previewTrack` does the same with `PREVIEW_PRESET` and `connected = false`. Delete `TIMBRE`, `PEAK`, `ATTACK`, `RELEASE` and the local `hz` once unused; the preview's "skip notes shorter than the attack" check uses `PREVIEW_PRESET.attack`.
- [ ] **Step 5: Run** `npm test`. Expected: all pass.
- [ ] **Step 6: Commit** `feat: playback and the track preview use the woodwind voice`.

### Task 5: Tune by ear and verify

**Files:**
- Modify: `src/audio/presets.ts` (values only)

- [ ] **Step 1:** Start the dev server with `preview_start`, open a sheet with the demo song, check the console for Web Audio errors while playing each family and while previewing a track.
- [ ] **Step 2:** Ask the owner to listen to each family and the preview. Adjust preset values from their feedback; re-run `npx vitest run src/audio/presets.test.ts` after each change.
- [ ] **Step 3:** Run `npm run build && npm run check:bundle`. Expected: no budget failure.
- [ ] **Step 4: Commit** `tune: preset values by ear`.
- [ ] **Step 5:** Push, wait for CI's SonarCloud job, run `SONAR_BRANCH=claude/midi-synth-sound-options-611767 node scripts/check-sonar.mjs`. Fix, commit, push until it prints `no open issues`.

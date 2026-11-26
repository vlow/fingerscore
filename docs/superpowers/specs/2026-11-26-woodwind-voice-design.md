# Woodwind voices for playback: design

For the builder of the new playback sound. Playback today sounds like a chiptune: one basic oscillator per note through a fixed lowpass filter ([src/audio/player.ts](../../../src/audio/player.ts)). This change replaces that note sound with a woodwind voice built from Web Audio parts, and makes each instrument's sound a preset.

## Intent

Learners play a piece back to check that they read the fingerings right. Pitch must stay easy to hear. The sound should still be musical, because playback may carry backing tracks later.

## Goals

- Each family (Saxophone, Clarinet, Flute, Xaphoon, Recorder) sounds recognisably like a wind instrument, not a chiptune.
- Pitch stays clear: vibrato is shallow and starts late, reverb is light.
- A new instrument sound is a new preset (data), not new code. This prepares backing tracks.
- Several notes at once do not distort.
- The Tracks preview uses the same voice code with a neutral preset.

## Non-goals

- Samples, SoundFonts, AudioWorklet or physical models.
- Dynamics, slurs or accents. The score holds none; every note plays at the same level.
- A sound settings UI.
- Backing tracks themselves.

## Anti-goals

The change fails, even when it works, if:

- vibrato or reverb makes a wrong note harder to hear;
- play starts later than it does today;
- a route or feature breaks `bundle-budget.json`, or the branch has an open SonarCloud issue.

## Approaches

- **A. Note voices from built-in Web Audio nodes, presets as data.** Chosen. Small, testable, runs everywhere Web Audio runs, ready for backing tracks through presets and a shared output.
- **B. Own DSP in an AudioWorklet.** Allows physical models and comes closer to a real instrument. Rejected for now: much more code, harder to test, worklet problems on older iOS Safari. A preset could later point to a worklet voice.

## Design

**`src/audio/voice.ts`** builds one note. Inputs: the output node, a preset, MIDI pitch, start and end time, and whether the note follows the previous one with no gap. It returns a handle the player can stop. One note is:

- an oscillator with a `PeriodicWave` built from the preset's harmonic amplitudes, cached per context and preset;
- vibrato: an LFO on the oscillator's detune and a little on its gain, faded in after a delay, only on notes long enough to reach it;
- a lowpass filter whose cutoff starts above the preset's base and settles to it over the attack;
- an amplitude envelope (attack, hold, release) as today.

**Presets** (`src/audio/presets.ts`) are plain objects: harmonics, vibrato rate, depth in cents, delay and fade, filter base and attack peak, attack and release times, gain. Starting points, to tune by ear:

| Family | Harmonics | Vibrato |
|---|---|---|
| Saxophone | all harmonics, falling about 1/n, bright | 5.5 Hz, 12 cents |
| Xaphoon | like the saxophone, darker | 5.5 Hz, 10 cents |
| Clarinet | odd harmonics strong, even weak | none |
| Flute | near sine, some 2nd and 3rd | 5 Hz, 15 cents |
| Recorder | near sine, weak upper | none |
| Preview (neutral) | soft, few harmonics | none |

No preset goes above 15 cents of vibrato depth or starts vibrato earlier than 0.25 s.

Tuned by ear after the test versions: vibrato no deeper than 6 cents; reverb at 6 % wet, fed only what lies below 2.5 kHz. `presets.test.ts` and `output.test.ts` hold these limits.

**Back-to-back notes.** When a note starts where the previous one ends, its attack is softer: a lower filter peak. This sounds like tonguing within a phrase. No pitch glide: without slur marks it would smear every note change.

**Shared output** (one per AudioContext): every voice feeds a dry path and a send to a `ConvolverNode`. The convolver's impulse is generated noise decaying over about 1.2 s; the wet level is low (6 %, after tuning). Both paths feed a `DynamicsCompressorNode` set as a limiter, then the destination.

**No breath noise.** The first version added filtered noise for breath. Listening showed it as unwanted air, so it was removed: a note is tone only.

**Player changes.** `schedule()` and `previewTrack` call the voice instead of building nodes. The player keeps voice handles instead of oscillators. The scheduler, marks and end handling stay as they are.

## Left to the builder

- Exact preset values, tuned by listening. Render a short phrase per family with an `OfflineAudioContext` to compare quickly.
- The fake `AudioContext` in `src/audio/player.test.ts` needs the new node types. Tests for `voice.ts` check node wiring and scheduled values, not the sound.
- Where the threshold for "long enough for vibrato" sits.

import type { ParsedSong } from '../types';
import { durationQuarters, kid, kids, num, text, type ScoreReader } from './common';
import { fraction, isGrace, ratioOf, readScore, voiceSink, type Bar, type Dialect, type VoiceRead } from './shared';

/** Versions 3 and 4 wrap each voice of a measure in a `<voice>` element and write ties, tuplets and endings as spanners and markers inside it. */

const voiceItems = (m: Element): Element[] => kids(m, 'voice').flatMap(v => Array.from(v.children));

const hasTieStart = (note: Element): boolean =>
  kids(note, 'Spanner').some(s => s.getAttribute('type') === 'Tie' && kid(s, 'next') !== undefined);

/** Notes, verse 1 lyrics and chord symbols of one voice over all measures. */
function readVoice(bars: Bar[], staffMeasures: Element[], voiceIndex: number): VoiceRead {
  const sink = voiceSink(hasTieStart);
  staffMeasures.forEach((m, i) => {
    const voice = kids(m, 'voice')[voiceIndex];
    if (!voice || i >= bars.length) return;
    const bar = bars[i];
    let pos = bar.start;
    const ratios: number[] = [];
    for (const el of Array.from(voice.children)) {
      const name = el.localName;
      if (name === 'Tuplet') {
        ratios.push(ratioOf(el));
      } else if (name === 'endTuplet') {
        ratios.pop();
      } else if (name === 'location') {
        pos += (fraction(text(el, 'fractions')) ?? 0) * 4;
      } else if (name === 'Harmony') {
        sink.harmony(el, pos);
      } else if (name === 'Chord' || name === 'Rest') {
        if (name === 'Chord' && isGrace(el)) continue;
        const type = text(el, 'durationType') ?? '';
        const written = type === 'measure' ? bar.length : durationQuarters(type, num(text(el, 'dots')) ?? 0);
        if (written === null) throw new Error(`unknown note value ${type}`);
        const dur = type === 'measure' ? written : written * ratios.reduce((a, r) => a * r, 1);
        if (name === 'Chord') sink.chord(el, pos, dur);
        pos += dur;
      }
    }
  });
  return sink.result();
}

/** Repeat signs and endings 1 and 2 of the first staff, as `ParsedSong.marks` (bar index = measure index). */
function readMarks(bars: Bar[]): ParsedSong['marks'] {
  const marks = new Map<number, ParsedSong['marks'][number]>();
  const at = (bar: number) => { let m = marks.get(bar); if (!m) { m = { bar }; marks.set(bar, m); } return m; };
  bars.forEach(({ el }, i) => {
    if (kid(el, 'startRepeat')) at(i).rs = true;
    if (kid(el, 'endRepeat')) at(i).re = true;
    for (const spanner of kids(el, 'voice').flatMap(v => kids(v, 'Spanner'))) {
      if (spanner.getAttribute('type') !== 'Volta') continue;
      const endings = text(kid(spanner, 'Volta'), 'endings');
      const next = kid(spanner, 'next');
      if ((endings !== '1' && endings !== '2') || !next) continue;
      // Rule from the Entertainer sample: the end sits `measures` bars on, plus a part of a bar when `fractions` is there: an ending inside one bar has no `measures`.
      const location = kid(next, 'location');
      const length = (num(text(location, 'measures')) ?? 0) + ((fraction(text(location, 'fractions')) ?? 0) > 0 ? 1 : 0);
      for (let b = i; b < Math.min(i + Math.max(length, 1), bars.length); b++) at(b).volta = endings;
    }
  });
  return Array.from(marks.values()).sort((a, b) => a.bar - b.bar);
}

const dialect: Dialect = { items: voiceItems, readVoice, readMarks };

export const readV3: ScoreReader = (file, score, version) => readScore(file, score, version, dialect);

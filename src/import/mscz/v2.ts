import type { ParsedSong } from '../types';
import { durationQuarters, kid, kids, num, text, type ScoreReader } from './common';
import type { Grid } from '../grid';
import { EPS, isGrace, markSink, ratioOf, readScore, voiceSink, type Bar, type Dialect, type VoiceRead } from './shared';

/**
 * Version 2 lists the chords, rests and chord symbols of every voice of a staff directly in the measure. A `<track>` child
 * names the voice (staff index × 4 + voice), a `<tick>` element moves the position to an absolute tick, a tuplet is declared
 * once by id, a tie starts at a `<Tie>` child of the note, and an ending ends at the `<endSpanner>` with its id.
 */

const DEFAULT_DIVISION = 480;
const MAX_TUPLET_DEPTH = 8;

const items = (m: Element): Element[] => Array.from(m.children);

/** Voice (0 to 3) of an element: its `<track>` modulo 4; no track is the staff's first voice. */
const voiceOf = (el: Element): number => ((num(text(el, 'track')) ?? 0) % 4 + 4) % 4;

const hasTieStart = (note: Element): boolean => kid(note, 'Tie') !== undefined;

/** Ticks per quarter note of the score. */
const divisionOf = (score: Element): number => {
  const d = num(text(score, 'Division'));
  return d !== null && d > 0 ? d : DEFAULT_DIVISION;
};

/** Ratio (normal / actual notes) of the tuplet declared with this id, times that of an enclosing tuplet. Unknown id: 1. */
function tupletRatio(declared: Map<string, Element>, id: string | undefined, depth = 0): number {
  const t = id === undefined ? undefined : declared.get(id);
  if (!t || depth > MAX_TUPLET_DEPTH) return 1;
  return ratioOf(t) * tupletRatio(declared, text(t, 'Tuplet'), depth + 1);
}

function makeReadVoice(division: number) {
  return function readVoice(bars: Bar[], staffMeasures: Element[], voiceIndex: number): VoiceRead {
    const sink = voiceSink(hasTieStart);
    const tuplets = new Map<string, Element>();
    staffMeasures.forEach((m, i) => {
      if (i >= bars.length) return;
      const bar = bars[i];
      let pos = bar.start;
      let pendingTick: number | null = null;     // a <tick> moves the voice of the next chord or rest
      for (const el of Array.from(m.children)) {
        const name = el.localName;
        if (name === 'Tuplet') {
          const id = el.getAttribute('id');
          if (id !== null) tuplets.set(id, el);
        } else if (name === 'tick') {
          const ticks = num(el.textContent?.trim());
          if (ticks !== null) pendingTick = ticks;
        } else if (name === 'Harmony') {
          if (voiceOf(el) === voiceIndex) sink.harmony(el, pendingTick !== null ? pendingTick / division : pos);
        } else if (name === 'Chord' || name === 'Rest') {
          if (name === 'Chord' && isGrace(el)) continue;
          const mine = voiceOf(el) === voiceIndex;
          const tick = pendingTick;
          pendingTick = null;
          if (!mine) continue;
          // A tick outside the measure is ignored: the voice keeps its position.
          if (tick !== null && tick / division >= bar.start - EPS && tick / division <= bar.start + bar.length + EPS) pos = tick / division;
          const type = text(el, 'durationType') ?? '';
          const written = type === 'measure' ? bar.length : durationQuarters(type, num(text(el, 'dots')) ?? 0);
          if (written === null) throw new Error(`unknown note value ${type}`);
          const dur = type === 'measure' ? written : written * tupletRatio(tuplets, text(el, 'Tuplet'));
          if (name === 'Chord') sink.chord(el, pos, dur);
          pos += dur;
        }
      }
    });
    return sink.result();
  };
}

/** Repeat signs and endings 1 and 2 of the first staff, placed on the grid's bars by position. An ending covers the measures from its start to its `<endSpanner>`: not including the measure when the mark comes before that measure's first chord or rest, including it when the mark comes after. With no end found it covers its start measure. */
function readMarks(bars: Bar[], grid: Grid): ParsedSong['marks'] {
  const marks = markSink(grid);
  /** Per end-mark id, in score order: the measure that holds the mark and whether a chord or rest comes before it there. */
  const endMarks = new Map<string, { measure: number; sounded: boolean }[]>();
  bars.forEach(({ el }, j) => {
    let sounded = false;
    for (const c of Array.from(el.children)) {
      if (c.localName === 'Chord' || c.localName === 'Rest') sounded = true;
      else if (c.localName === 'endSpanner') {
        const id = c.getAttribute('id');
        if (id === null) continue;
        const list = endMarks.get(id) ?? [];
        list.push({ measure: j, sounded });
        endMarks.set(id, list);
      }
    }
  });
  /** Index of the first measure the ending does not cover. An end mark before the first chord or rest of a measure ends the ending before that measure; one after a chord or rest ends it with that measure. No end found: the start measure only. */
  const endsAt = (id: string | null, from: number): number => {
    const found = (id === null ? undefined : endMarks.get(id))?.find(e => e.measure >= from && (e.sounded || e.measure > from));
    return found ? (found.sounded ? found.measure + 1 : found.measure) : from + 1;
  };
  bars.forEach((measure, i) => {
    const { el } = measure;
    if (kid(el, 'startRepeat')) marks.startRepeat(measure);
    if (kid(el, 'endRepeat')) marks.endRepeat(measure);
    for (const volta of kids(el, 'Volta')) {
      const endings = text(volta, 'endings');
      if (endings !== '1' && endings !== '2') continue;
      const end = endsAt(volta.getAttribute('id'), i);
      for (let b = i; b < end; b++) marks.volta(bars[b], endings);
    }
  });
  return marks.result();
}

export const readV2: ScoreReader = (file, score, version) =>
  readScore(file, score, version, { items, readVoice: makeReadVoice(divisionOf(score)), readMarks } satisfies Dialect);

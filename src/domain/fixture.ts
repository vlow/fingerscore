import sample from '../data/sample-song.json';
import { DEFAULT_INST, inst } from './instruments';
import type { Bar, Doc, InstId } from './types';
import { parseChord } from './chords';
import { DEFAULT_PREFS, rankShifts, scoringPitches } from './transpose';

const EIGHTH = 6; // ticks per eighth note

function sampleScore(): Bar[] {
  let n = 0;
  return sample.bars.map(b => ({
    cap: b.cap * EIGHTH,
    rs: b.rs,
    re: b.re,
    volta: b.volta.replace('.', '') as Bar['volta'], // the file labels endings "1." / "2."
    ev: b.ev.map(e => ({ id: `e${++n}`, m: e.m, d: e.d * EIGHTH, r: e.r, tie: e.tie, l: e.l })),
  }));
}

export function sampleDoc(instId: InstId = DEFAULT_INST): Doc {
  const score = sampleScore();
  const raw = sample.bars.flatMap(b => b.ev);
  const events = score.flatMap(b => b.ev);
  const ranked = rankShifts(scoringPitches(score), inst(instId), sample.originalTonicPc, 'major', DEFAULT_PREFS);
  // The file spells chords 3 semitones above the stored pitches.
  const chords: Doc['chords'] = {};
  const imported: Doc['imported'] = { lyrics: {}, chords: {} };
  events.forEach((e, k) => {
    if (e.l) imported.lyrics[e.id] = e.l;
    const text = raw[k].c;
    if (text) { chords[e.id] = parseChord(text, 3); imported.chords[e.id] = text; }
  });
  return {
    score,
    timeSig: [4, 4],
    originalTonicPc: sample.originalTonicPc,
    originalMode: 'major',
    tempo: sample.tempo,
    inst: instId,
    shift: ranked[0].shift,
    fingering: {},
    chords,
    imported,
    title: sample.title,
    subtitle: sample.subtitle,
    chartStyle: 'compact',
    recorderSystem: 'baroque',
    show: { fingerings: true, chords: true, lyrics: true, raiseExtensions: true },
    source: { file: 'The_Water_Is_Wide.mid', format: 'sample', track: '1 Melody', trackCount: 4, simplified: false },
  };
}

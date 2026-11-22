import { chooseFingerings, type ChooserItem } from './chooser';
import { chordText } from './chords';
import { legend, optionsFor, type FingeringOption } from './fingerings';
import { inst, isTransposing, rangeState, type Instrument, type RangeState } from './instruments';
import { accidental, keyName, keySignature, mod12, spell, staffPos, type Spelled } from './keys';
import { evalShift, rankShifts, scoringPitches, type Prefs, type ShiftScore } from './transpose';
import type { Doc } from './types';

export interface DerivedEvent {
  id: string; bar: number; index: number; tick: number; d: number; rest: boolean; tiedFrom: boolean; tieTo: boolean;
  written: number; spelled: Spelled; pos: number; accidental: 'sharp' | 'flat' | 'natural' | null; state: RangeState;
  options: FingeringOption[]; chosen: number | null; auto: number | null; overridden: boolean;
  lyric: string; chord: string | null; chordOk: boolean;
}

export interface Derived {
  inst: Instrument; writtenTonicPc: number; concertTonicPc: number; sig: number;
  writtenKey: string; concertKey: string; originalKey: string;           // key names in the song's mode
  events: DerivedEvent[]; byId: Record<string, DerivedEvent>;
  ranked: ShiftScore[]; current: ShiftScore; best: ShiftScore; isSuggested: boolean;
  counts: { notes: number; bad: number; ext: number; withAlternates: number; overridden: number };
  min: number; max: number;                                              // written, over sounding notes; 0 when no notes
  headerKeys: string;                                                    // 'you read G major · sounds B♭ major' / 'C major' for non-transposing
  legend: string;
}

/** Rests sit on the middle staff line (written B4). */
const REST_PITCH = 71;

function validOverride(value: number | undefined, options: FingeringOption[]): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value < options.length;
}

/** Everything the sheet shows, computed from the document alone. */
export function derive(doc: Doc, prefs: Prefs): Derived {
  const i = inst(doc.inst);
  const mode = doc.originalMode;
  const concertTonicPc = mod12(doc.originalTonicPc + doc.shift);
  const writtenTonicPc = mod12(concertTonicPc + i.off);
  const sig = keySignature(writtenTonicPc, mode);
  const chordKey = mod12(doc.shift + i.off);

  const events: DerivedEvent[] = [];
  let prevTied = false; // ties cross bar lines
  doc.score.forEach((bar, b) => {
    let tick = 0;
    bar.ev.forEach((e, index) => {
      const tiedFrom = !e.r && prevTied;
      const written = e.r ? REST_PITCH : e.m + doc.shift + i.off;
      const spelled = spell(written, sig);
      const state: RangeState = e.r ? 'ok' : rangeState(i, written);
      const options = e.r || tiedFrom || state === 'bad' ? [] : optionsFor(doc.inst, written, doc.recorderSystem);
      const c = doc.chords[e.id];
      events.push({
        id: e.id, bar: b, index, tick, d: e.d, rest: e.r, tiedFrom, tieTo: !e.r && e.tie,
        written, spelled, pos: staffPos(spelled),
        accidental: e.r || tiedFrom ? null : accidental(spelled, sig),
        state, options, chosen: null, auto: null, overridden: false,
        lyric: e.l, chord: c ? chordText(c, chordKey, sig) : null, chordOk: c ? c.ok : true,
      });
      tick += e.d;
      prevTied = e.tie;
    });
  });

  // Rests break a run, tied continuations are skipped, notes without options break it too.
  const items: ChooserItem[] = events
    .filter(ev => !ev.tiedFrom)
    .map(ev => (ev.rest ? null : { id: ev.id, written: ev.written, options: ev.options }));
  const pinned = chooseFingerings(items, doc.fingering);
  const free = Object.keys(doc.fingering).length ? chooseFingerings(items, {}) : pinned;
  for (const ev of events) {
    if (ev.options.length === 0) continue;
    ev.overridden = validOverride(doc.fingering[ev.id], ev.options);
    // auto: the app's own pick for this note, with other notes' overrides as fixed points where possible.
    ev.auto = (ev.overridden ? free[ev.id] : pinned[ev.id]) ?? null;
    ev.chosen = ev.overridden ? doc.fingering[ev.id] : ev.auto;
  }

  const sounding = events.filter(ev => !ev.rest && !ev.tiedFrom);
  const pitches = scoringPitches(doc.score);
  const ranked = rankShifts(pitches, i, doc.originalTonicPc, mode, prefs);
  const best = ranked[0];
  const current = ranked.find(r => r.shift === doc.shift)
    ?? evalShift(pitches, doc.shift, i, doc.originalTonicPc, mode, prefs);
  const writtenKey = keyName(writtenTonicPc, mode);
  const concertKey = keyName(concertTonicPc, mode);

  return {
    inst: i, writtenTonicPc, concertTonicPc, sig,
    writtenKey, concertKey, originalKey: keyName(doc.originalTonicPc, mode),
    events, byId: Object.fromEntries(events.map(ev => [ev.id, ev])),
    ranked, current, best, isSuggested: doc.shift === best.shift,
    counts: {
      notes: sounding.length,
      bad: sounding.filter(ev => ev.state === 'bad').length,
      ext: sounding.filter(ev => ev.state === 'ext').length,
      withAlternates: sounding.filter(ev => ev.options.length > 1).length,
      overridden: sounding.filter(ev => ev.overridden).length,
    },
    min: sounding.length ? Math.min(...sounding.map(ev => ev.written)) : 0,
    max: sounding.length ? Math.max(...sounding.map(ev => ev.written)) : 0,
    headerKeys: isTransposing(i) ? `you read ${writtenKey} · sounds ${concertKey}` : writtenKey,
    legend: legend(doc.inst),
  };
}

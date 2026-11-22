import data from '../data/instruments.json';
import type { InstId } from './types';

export type Family = 'Saxophone' | 'Clarinet' | 'Flute' | 'Xaphoon' | 'Recorder';

export interface Instrument {
  id: InstId; name: string; group: Family; off: number; lo: number; hi: number; ext: number;
  kind: 'xaph' | 'sax' | 'cl' | 'fl' | 'rec'; easyTop: number; base?: number;
}

export const FAMILIES: Family[] = ['Saxophone', 'Clarinet', 'Flute', 'Xaphoon', 'Recorder'];

const MEMBERS: Record<Family, InstId[]> = {
  Saxophone: ['ssax', 'asax', 'tsax', 'bsax'],
  Clarinet: ['cl'],
  Flute: ['fl', 'picc', 'afl'],
  Xaphoon: ['xc', 'xbb'],
  Recorder: ['rs', 'ra'],
};

export const ORDER: InstId[] = FAMILIES.flatMap(f => MEMBERS[f]);
export const DEFAULT_INST: InstId = 'asax';

const table = Object.fromEntries(
  Object.entries(data.instruments).map(([id, v]) => [id, { id, ...v }]),
) as unknown as Record<InstId, Instrument>;

export function inst(id: InstId): Instrument {
  return table[id];
}

export function familyMembers(f: Family): Instrument[] {
  return MEMBERS[f].map(inst);
}

const DEFAULTS: Record<Family, InstId> = { Saxophone: 'asax', Clarinet: 'cl', Flute: 'fl', Xaphoon: 'xc', Recorder: 'rs' };
export function familyDefault(f: Family): InstId {
  return DEFAULTS[f];
}

const SUBLINES: Record<Family, string> = {
  Saxophone: '4 types', Clarinet: 'B♭', Flute: '3 types', Xaphoon: '2 keys', Recorder: '2 types',
};
export function familySubline(f: Family): string {
  return SUBLINES[f];
}

// Display names as in the prototype: "Alto sax (E♭)" → "Alto sax in E♭".
function label(i: Instrument): string {
  return i.name.replace(/ \(([^)]+)\)$/, ' in $1');
}

const SHORT_NAMES: Record<InstId, string> = {
  ssax: 'Soprano B♭', asax: 'Alto E♭', tsax: 'Tenor B♭', bsax: 'Baritone E♭',
  cl: 'Clarinet B♭',
  fl: 'Flute C', picc: 'Piccolo C', afl: 'Alto flute G',
  xc: 'Xaphoon C', xbb: 'Xaphoon B♭',
  rs: 'Soprano C', ra: 'Alto F',
};
export function shortName(id: InstId): string {
  return SHORT_NAMES[id];
}

export type RangeState = 'ok' | 'ext' | 'bad';
export function rangeState(i: Instrument, written: number): RangeState {
  if (written < i.lo || written > i.ext) return 'bad';
  return written > i.hi ? 'ext' : 'ok';
}

export function isTransposing(i: Instrument): boolean {
  return ((i.off % 12) + 12) % 12 !== 0;
}

const HIGHER_BY: Record<number, string> = {
  2: 'a whole step',
  5: 'a perfect fourth',
  9: 'a major sixth',
  14: 'a ninth (octave + whole step)',
  21: 'an octave + major sixth',
};

export function intervalText(i: Instrument): string {
  if (i.off === 0) return 'sounds as written';
  if (i.off === -12) return 'sounds an octave higher than written';
  return `${label(i)}: you read ${HIGHER_BY[i.off]} higher than it sounds`;
}

const READS: Record<number, string> = {
  0: 'reads as it sounds',
  [-12]: 'sounds an octave higher than written',
  2: 'reads a whole step above concert',
  5: 'reads a fourth above concert',
  9: 'reads a major sixth above concert',
  14: 'reads an octave + whole step above concert',
  21: 'reads an octave + major sixth above concert',
};

const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export function noteNameFlat(midi: number): string {
  return `${FLAT_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function summary(i: Instrument): string {
  return `${label(i)} · ${noteNameFlat(i.lo)} – ${noteNameFlat(i.hi)} · ${READS[i.off]}`;
}

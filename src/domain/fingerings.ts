import data from '../data/fingerings.json';
import gapData from '../data/fingering-gaps.json';
import { inst, ORDER, type Instrument } from './instruments';
import type { InstId } from './types';

type Kind = Instrument['kind'];
type SatKind = 'sax' | 'cl' | 'fl';

export interface FingeringOption { h: number[]; x: string[]; n: string; p: number }
type Table = Record<string, FingeringOption[]>;

interface FingeringData {
  LAYOUT: Record<Kind, number[][]>;
  SATS: Record<SatKind, Record<string, [number, number, string]>>;
  SHAPE: Record<string, [number, number]>;
  LEGEND: Record<Kind, string>;
  FINGER: Record<string, string>;
  tables: Record<Kind | 'recGerman', Table>;
  overrides: Partial<Record<InstId, Table>>;
  meta: Partial<Record<Kind, KindMeta>>;
}

export interface Source { title: string; url?: string; accessed?: string }
export interface KindMeta { sources: Source[]; reviewed: string | null }

export type RecorderSystem = 'baroque' | 'german';
export interface GapEntry { inst?: InstId; kind?: Kind; pitch: number; system?: 'german'; note: string; checked: string[] }
export interface Gap { inst: InstId; pitch: number; system: RecorderSystem }

const D = data as unknown as FingeringData;

export const LAYOUT = D.LAYOUT;
export const SATS = D.SATS;
export const SHAPE = D.SHAPE;
export const FINGER = D.FINGER;

export function optionsFor(id: InstId, written: number, recorderSystem: RecorderSystem): FingeringOption[] {
  const override = D.overrides[id]?.[written];
  if (override) return override;
  const i = inst(id);
  if (i.kind === 'rec') {
    const key = String(written - (i.base ?? i.lo));
    return (recorderSystem === 'german' ? D.tables.recGerman[key] : undefined) ?? D.tables.rec[key] ?? [];
  }
  return D.tables[i.kind][written] ?? [];
}

export function legend(id: InstId): string {
  const kind = inst(id).kind;
  return D.LEGEND[kind] + (D.meta[kind]?.reviewed ? '' : ' · fingering data: draft');
}

export function hasSatellites(kind: Kind): boolean {
  return kind === 'sax' || kind === 'cl' || kind === 'fl';
}

/** Pitches lo..ext with no option. German recorder gaps are notes where the German system has none but the baroque table has one. */
export function coverageGaps(): Gap[] {
  const out: Gap[] = [];
  for (const id of ORDER) {
    const { lo, ext, kind } = inst(id);
    for (let w = lo; w <= ext; w++) {
      const baroque = optionsFor(id, w, 'baroque').length > 0;
      if (!baroque) out.push({ inst: id, pitch: w, system: 'baroque' });
      else if (kind === 'rec' && optionsFor(id, w, 'german').length === 0) out.push({ inst: id, pitch: w, system: 'german' });
    }
  }
  return out;
}

export function meta(kind: Kind): KindMeta {
  return D.meta[kind] ?? { sources: [], reviewed: null };
}

export function rawGaps(): GapEntry[] {
  return gapData.gaps as GapEntry[];
}

/** Gap list with 'kind' entries expanded to the instruments of that kind whose lo..ext contains the pitch. */
export function documentedGaps(): Gap[] {
  return rawGaps().flatMap(g => {
    const system: RecorderSystem = g.system ?? 'baroque';
    return g.inst ? [{ inst: g.inst, pitch: g.pitch, system }]
      : ORDER.filter(id => inst(id).kind === g.kind && g.pitch >= inst(id).lo && g.pitch <= inst(id).ext)
        .map(id => ({ inst: id, pitch: g.pitch, system }));
  });
}

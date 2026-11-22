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
  meta: Partial<Record<Kind, { sources: { title: string }[]; reviewed: string | null }>>;
}

interface GapEntry { inst?: InstId; kind?: Kind; pitch: number; note: string; checked: string[] }

const D = data as unknown as FingeringData;

export const LAYOUT = D.LAYOUT;
export const SATS = D.SATS;
export const SHAPE = D.SHAPE;
export const FINGER = D.FINGER;

export function optionsFor(id: InstId, written: number, recorderSystem: 'baroque' | 'german'): FingeringOption[] {
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

export function coverageGaps(): { inst: InstId; pitch: number }[] {
  const out: { inst: InstId; pitch: number }[] = [];
  for (const id of ORDER) {
    const { lo, ext } = inst(id);
    for (let w = lo; w <= ext; w++) if (optionsFor(id, w, 'baroque').length === 0) out.push({ inst: id, pitch: w });
  }
  return out;
}

export function documentedGaps(): { inst: InstId; pitch: number }[] {
  return (gapData.gaps as GapEntry[]).flatMap(g =>
    g.inst ? [{ inst: g.inst, pitch: g.pitch }]
      : ORDER.filter(id => inst(id).kind === g.kind).map(id => ({ inst: id, pitch: g.pitch })));
}

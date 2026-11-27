import type { RecorderSystem } from '../../domain/fingerings';
import { inst, noteNameFlat, ORDER } from '../../domain/instruments';
import { readNote } from '../../domain/noteText';
import type { InstId } from '../../domain/types';
import type { SopranoShape } from '../../render/keymap/models';

/** What the Fingerings page shows, all of it in the address (design 4.2). */
export interface FingeringsState {
  inst: InstId;
  /** Written pitch. */
  note: number;
  /** Option index, 0 = the standard fingering. */
  alt: number;
  system: RecorderSystem;
  shape: SopranoShape;
}

/**
 * How far outside the instrument's range an address may name a note: the range banners link to a note the sheet marks
 * red, and the page shows it with "no sourced fingering" (design 4.5). Two octaves cover any transposed song.
 */
const ADDRESS_MARGIN = 24;

/** The written C5, or the nearest note of the instrument's range. */
export function defaultNote(id: InstId): number {
  const i = inst(id);
  return Math.min(Math.max(72, i.lo), i.ext);
}

/** A note within the instrument's range, from the lowest note to the top of the extended range. */
export function inRange(id: InstId, note: number): boolean {
  const i = inst(id);
  return note >= i.lo && note <= i.ext;
}

/** A pitch as the address writes it: flat names with a plain b ("Bb4"). */
export const noteParam = (pitch: number): string => noteNameFlat(pitch).replace('♭', 'b');

/**
 * The state an address asks for. Anything missing or unknown, or a note far outside the range, falls back: the preferred instrument, its
 * written C5, the standard fingering, the Baroque recorder system, the stored soprano shape. The option index is
 * checked against the note's options by the page, which knows them.
 */
export function readAddress(params: URLSearchParams, preferred: InstId, storedShape: SopranoShape): FingeringsState {
  const raw = params.get('inst');
  const id = ORDER.includes(raw as InstId) ? (raw as InstId) : preferred;
  const i = inst(id);
  const typed = params.get('note');
  const read = typed === null ? null : readNote(typed, defaultNote(id), i.lo - ADDRESS_MARGIN, i.ext + ADDRESS_MARGIN);
  const note = read !== null && 'pitch' in read ? read.pitch : defaultNote(id);
  const alt = Number(params.get('alt'));
  const shape = params.get('shape');
  return {
    inst: id,
    note,
    alt: Number.isInteger(alt) && alt >= 1 ? alt - 1 : 0,
    system: params.get('system') === 'german' ? 'german' : 'baroque',
    shape: shape === 'curved' || shape === 'straight' ? shape : storedShape,
  };
}

/** The address of a state: only what differs from the defaults beyond instrument and note. */
export function writeAddress(st: FingeringsState): URLSearchParams {
  const params = new URLSearchParams({ inst: st.inst, note: noteParam(st.note) });
  if (st.alt > 0) params.set('alt', String(st.alt + 1));
  if (inst(st.inst).kind === 'rec' && st.system === 'german') params.set('system', 'german');
  if (st.inst === 'ssax') params.set('shape', st.shape);
  return params;
}

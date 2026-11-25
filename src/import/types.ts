import { MAX_BARS } from '../domain/persistence';
import type { Jump, Mode, TimeSig } from '../domain/types';

/** Positions and durations in quarter notes (float), measured from the start of the first bar. */
export interface RawNote { start: number; dur: number; midi: number }

export interface ParsedTrack {
  id: string; name: string; instrument: string; channel: number | null; percussion: boolean;
  notes: RawNote[]; lyrics: { at: number; text: string }[]; chords: { at: number; text: string }[];   // chords: MusicXML <harmony>, in the file's key
}

/** Repeat marks, endings and jump marks of one bar. Segno and Coda stand at its start, the others at its end. */
export interface ParsedMark {
  bar: number; rs?: boolean; re?: boolean; volta?: '1' | '2';
  segno?: true; coda?: true; fine?: true; toCoda?: true; jump?: Jump;
}

export interface ParsedSong {
  file: string; format: 'MIDI' | 'MusicXML' | 'MuseScore' | 'ABC'; timeSig: TimeSig; tempo: number;
  title: string;                                    // the song title the file states, '' = none
  key: { tonicPc: number; mode: Mode | null } | null;   // mode null: signature only; tonicPc is its major tonic
  pickup: number;                                   // quarter notes in the pickup bar, 0 = none
  marks: ParsedMark[];                              // by bar index incl. pickup
  dropped: string[];                                // one sentence per jump mark the import left out
  tracks: ParsedTrack[];
}

export class ImportError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
    this.name = 'ImportError';
  }
}

/** The refusal for a song longer than a sheet can hold (`MAX_BARS`). */
export const tooLong = (file: string): ImportError => new ImportError(`"${file}" is longer than ${MAX_BARS} bars and can't be opened.`);

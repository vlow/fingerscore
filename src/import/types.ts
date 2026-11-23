import type { Mode, TimeSig } from '../domain/types';

/** Positions and durations in quarter notes (float), measured from the start of the first bar. */
export interface RawNote { start: number; dur: number; midi: number }

export interface ParsedTrack {
  id: string; name: string; instrument: string; channel: number | null; percussion: boolean;
  notes: RawNote[]; lyrics: { at: number; text: string }[]; chords: { at: number; text: string }[];   // chords: MusicXML <harmony>, in the file's key
}

export interface ParsedSong {
  file: string; format: 'MIDI' | 'MusicXML' | 'MuseScore' | 'ABC'; timeSig: TimeSig; tempo: number;
  key: { tonicPc: number; mode: Mode | null } | null;   // mode null: signature only; tonicPc is its major tonic
  pickup: number;                                   // quarter notes in the pickup bar, 0 = none
  marks: { bar: number; rs?: boolean; re?: boolean; volta?: '1' | '2' }[];    // bar index incl. pickup
  tracks: ParsedTrack[];
}

export class ImportError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
    this.name = 'ImportError';
  }
}

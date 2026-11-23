/**
 * The parts of abcjs's parse result that `abc.ts` reads, and nothing more.
 * abcjs ships types only for its package root, which would load the renderer and the synth.
 * `abc_parse` is the parse-only entry that the root's `parseOnly` calls.
 */
declare module 'abcjs/src/parse/abc_parse' {
  export interface AbcPitch {
    /** Diatonic steps from middle C (C4 = 0, c = 7), with the voice's `octave=` applied. */
    pitch: number;
    /** Written accidental on this note: 'sharp', 'flat', 'natural', 'dblsharp', 'dblflat' or a quarter tone. */
    accidental?: string;
    startTie?: unknown;
    endTie?: unknown;
  }

  export interface AbcKey {
    root: string;      // 'A'..'G', 'HP', 'Hp' or 'none'
    acc: string;       // '', '#' or 'b'
    mode: string;      // '', 'm', 'Dor', 'Mix', 'Loc', 'Phr' or 'Lyd'
  }

  export interface AbcMeter {
    type: string;      // 'common_time', 'cut_time', 'specified', 'tempus_*'
    value?: { num: string; den: string }[];
  }

  /** Notes, rests, bars and inline key and meter changes. Fields depend on `el_type`. */
  export interface AbcElement {
    el_type: string;
    // note and rest
    duration?: number;                   // whole notes, before any tuplet
    pitches?: AbcPitch[];
    rest?: { type: string };
    chord?: { name: string; position: string }[];
    lyric?: { syllable: string; divider: string }[];   // one entry per verse
    startTriplet?: number;
    tripletMultiplier?: number;
    tripletR?: number;
    endTriplet?: boolean;
    // bar
    type?: string;                       // bar type, or the meter type of a 'meter' element
    startEnding?: string;
    endEnding?: boolean;
    // key (inline), meter (inline)
    root?: string;
    acc?: string;
    mode?: string;
    value?: { num: string; den: string }[];
  }

  export interface AbcStaff {
    voices: AbcElement[][];
    key?: AbcKey;
    meter?: AbcMeter;
    clef?: { type: string; transpose?: number };
    title?: string[];
  }

  export interface AbcTune {
    lines: { staff?: AbcStaff[] }[];
    metaText: { tempo?: { duration?: number[]; bpm?: number } };
  }

  export default class Parse {
    parse(abc: string, params?: object): void;
    getTune(): AbcTune;
  }
}

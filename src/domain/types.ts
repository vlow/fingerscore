export type InstId = 'xc'|'xbb'|'ssax'|'asax'|'tsax'|'bsax'|'cl'|'rs'|'ra'|'fl'|'picc'|'afl';
export type Mode = 'major' | 'minor';
export type TimeSig = [4,4] | [3,4] | [2,4] | [6,8];
export interface Ev { id: string; m: number; d: number; r: boolean; tie: boolean; l: string }
export interface Bar { cap: number; rs: boolean; re: boolean; volta: '' | '1' | '2'; ev: Ev[] }
export interface ChordSym { raw: string; ok: boolean; pc: number; rest: string; bass: number | null; tk: number }
export interface Doc {
  score: Bar[]; timeSig: TimeSig;
  originalTonicPc: number; originalMode: Mode;     // minor: tonic of the minor key
  tempo: number; inst: InstId; shift: number;
  fingering: Record<string, number>;               // event id → option index
  chords: Record<string, ChordSym>;                // event id → chord
  imported: { lyrics: Record<string, string>; chords: Record<string, string> };   // event id → lyric / chord text as imported
  title: string; subtitle: string;
  chartStyle: 'compact' | 'full'; recorderSystem: 'baroque' | 'german';
  show: { fingerings: boolean; chords: boolean; lyrics: boolean; raiseExtensions: boolean };
  source: { file: string; format: 'MIDI' | 'MusicXML' | 'sample' | 'file' | 'library'; track: string; trackCount: number; simplified: boolean };
}

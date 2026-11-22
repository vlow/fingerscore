import { parseChord } from '../domain/chords';
import { inst } from '../domain/instruments';
import { rankShifts, scoringPitches, type Prefs } from '../domain/transpose';
import type { Doc, Ev, InstId } from '../domain/types';
import { toBars } from './bars';
import { estimateKey } from './keyfind';
import { monophonic, quantise } from './quantise';
import { ImportError, type ParsedSong } from './types';

export interface BuildOptions {
  trackId: string; keep: 'top' | 'bottom'; lyricsFrom: string | null; chordsFrom: string | 'file' | null; instId: InstId; prefs: Prefs;
}

const TPQ = 12;
const LYRIC_REACH = 3; // ticks

interface Placed { ev: Ev; start: number; noteStart: boolean }

function place(score: Doc['score']): Placed[] {
  const out: Placed[] = [];
  let t = 0;
  let prevTied = false;
  for (const bar of score) {
    for (const ev of bar.ev) {
      out.push({ ev, start: t, noteStart: !ev.r && !prevTied });
      t += ev.d;
      prevTied = ev.tie;
    }
  }
  return out;
}

function titleFrom(file: string): string {
  const dot = file.lastIndexOf('.');
  return (dot > 0 ? file.slice(0, dot) : file).replace(/_/g, ' ');
}

export function buildDoc(song: ParsedSong, o: BuildOptions): Doc {
  const track = song.tracks.find(t => t.id === o.trackId);
  if (!track) throw new ImportError('That track is not in the file.');
  if (track.notes.length === 0) throw new ImportError(`"${track.name}" has no notes.`);

  const q = quantise(track.notes);
  const melody = monophonic(q.notes, o.keep);
  const score = toBars(melody, song.timeSig, Math.round(song.pickup * TPQ), song.marks);
  const placed = place(score);

  const lyricTrack = o.lyricsFrom ? song.tracks.find(t => t.id === o.lyricsFrom) : undefined;
  for (const ly of lyricTrack?.lyrics ?? []) {
    const tick = Math.round(ly.at * TPQ);
    let hit: Placed | null = null;
    for (const p of placed) {
      if (!p.noteStart || Math.abs(p.start - tick) > LYRIC_REACH) continue;
      if (!hit || Math.abs(p.start - tick) < Math.abs(hit.start - tick)) hit = p;
    }
    if (hit && !hit.ev.l) hit.ev.l = ly.text;
  }

  const chords: Doc['chords'] = {};
  if (o.chordsFrom === 'file') {
    for (const ch of track.chords) {
      const tick = Math.round(ch.at * TPQ);
      const hit = placed.find(p => p.start <= tick && tick < p.start + p.ev.d);
      if (hit && !hit.ev.c) {
        hit.ev.c = ch.text;
        chords[hit.ev.id] = parseChord(ch.text, 0);
      }
    }
  } // a track id would use detectChords (Task 17); none until then

  const key = song.key ?? estimateKey(melody.map(n => ({ start: n.start / TPQ, dur: n.dur / TPQ, midi: n.midi })));
  const shift = rankShifts(scoringPitches(score), inst(o.instId), key.tonicPc, key.mode, o.prefs)[0].shift;

  return {
    score,
    timeSig: song.timeSig,
    originalTonicPc: key.tonicPc,
    originalMode: key.mode,
    tempo: Math.max(40, Math.min(200, Math.round(song.tempo))),
    inst: o.instId,
    shift,
    fingering: {},
    chords,
    title: titleFrom(song.file),
    subtitle: '',
    chartStyle: 'compact',
    recorderSystem: 'baroque',
    show: { fingerings: true, chords: true, lyrics: true, raiseExtensions: true },
    source: { file: song.file, format: song.format, track: track.name, trackCount: song.tracks.length, simplified: q.simplified },
  };
}

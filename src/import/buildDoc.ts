import { barLabelOf } from '../domain/bars';
import { parseChord } from '../domain/chords';
import { inst } from '../domain/instruments';
import { JUMP_TEXT } from '../domain/jumps';
import { barCap } from '../domain/time';
import { rankShifts, scoringPitches, type Prefs } from '../domain/transpose';
import type { Doc, Ev, InstId } from '../domain/types';
import { toBars } from './bars';
import { detectChords } from './harmony';
import { estimateKey, majorOrRelativeMinor } from './keyfind';
import { monophonic, quantise } from './quantise';
import { ImportError, tooLong, type ParsedMark, type ParsedSong } from './types';
import { MAX_BARS } from '../domain/persistence';

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

/** How many bars the notes fill: the pickup bar, then bars of the meter up to the end of the last note. */
function barCount(song: ParsedSong, notes: ParsedSong['tracks'][number]['notes']): number {
  const barLength = (song.timeSig[0] * 4) / song.timeSig[1];
  const end = notes.reduce((m, n) => Math.max(m, n.start + n.dur), 0);
  const pickup = Number.isFinite(song.pickup) && song.pickup > 0 && song.pickup < barLength ? song.pickup : 0;
  if (end <= pickup) return 1;
  return (pickup > 0 ? 1 : 0) + Math.ceil((end - pickup) / barLength - 1e-6);
}

function titleFrom(file: string): string {
  const dot = file.lastIndexOf('.');
  return (dot > 0 ? file.slice(0, dot) : file).replace(/_/g, ' ');
}

/** The sentences for the jump marks of a bar that lies behind the last note of the chosen track. */
function lostSentences(doc: Doc, m: ParsedMark): string[] {
  const names = [m.segno && 'Segno', m.coda && 'Coda', m.fine && 'Fine', m.toCoda && 'To Coda', m.jump && JUMP_TEXT[m.jump]];
  return names.filter((n): n is string => typeof n === 'string').map(n => `${n} in bar ${barLabelOf(doc, m.bar)} was left out.`);
}

export function buildDoc(song: ParsedSong, o: BuildOptions): Doc {
  const track = song.tracks.find(t => t.id === o.trackId);
  if (!track) throw new ImportError('That track is not in the file.');
  if (track.notes.length === 0) throw new ImportError(`"${track.name}" has no notes.`);
  if (barCount(song, track.notes) > MAX_BARS) throw tooLong(song.file);

  const q = quantise(track.notes);
  const melody = monophonic(q.notes, o.keep);
  const rawPickup = Number.isFinite(song.pickup) ? Math.max(0, song.pickup * TPQ) : 0;
  let pickupTicks = Math.round(rawPickup / 3) * 3;
  if (pickupTicks >= barCap(song.timeSig)) pickupTicks = 0; // a full bar or more is no pickup
  const { bars: score, rounded, lost } = toBars(melody, song.timeSig, pickupTicks, song.marks);
  const simplified = q.simplified || rounded || Math.abs(pickupTicks - rawPickup) > 0.02 * TPQ;
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
  const importedChords: Record<string, string> = {};
  let chordList: { at: number; text: string }[] = [];
  if (o.chordsFrom === 'file') {
    chordList = track.chords;
  } else if (o.chordsFrom) {
    const chordTrack = song.tracks.find(t => t.id === o.chordsFrom);
    const totalTicks = score.reduce((sum, b) => sum + b.cap, 0);
    if (chordTrack) chordList = detectChords(chordTrack.notes, song.timeSig, pickupTicks / TPQ, totalTicks / TPQ);
  }
  for (const ch of chordList) {
    const tick = Math.round(ch.at * TPQ);
    const hit = placed.find(p => p.start <= tick && tick < p.start + p.ev.d);
    if (hit && !(hit.ev.id in importedChords)) {
      importedChords[hit.ev.id] = ch.text;
      chords[hit.ev.id] = parseChord(ch.text, 0);
    }
  }

  const importedLyrics: Record<string, string> = {};
  for (const p of placed) if (p.ev.l) importedLyrics[p.ev.id] = p.ev.l;

  const melodyRaw = melody.map(n => ({ start: n.start / TPQ, dur: n.dur / TPQ, midi: n.midi }));
  const key = !song.key ? estimateKey(melodyRaw)
    : song.key.mode === null ? majorOrRelativeMinor(melodyRaw, song.key.tonicPc)
    : { tonicPc: song.key.tonicPc, mode: song.key.mode };
  const shift = rankShifts(scoringPitches(score), inst(o.instId), key.tonicPc, key.mode, o.prefs)[0].shift;

  const doc: Doc = {
    score,
    timeSig: song.timeSig,
    originalTonicPc: key.tonicPc,
    originalMode: key.mode,
    tempo: Math.max(40, Math.min(200, Math.round(song.tempo))),
    inst: o.instId,
    shift,
    fingering: {},
    chords,
    imported: { lyrics: importedLyrics, chords: importedChords },
    title: titleFrom(song.file),
    subtitle: '',
    chartStyle: 'compact',
    recorderSystem: 'baroque',
    show: { fingerings: true, chords: true, lyrics: true, raiseExtensions: true },
    source: { file: song.file, format: song.format, track: track.name, trackCount: song.tracks.length, simplified },
  };
  const dropped = [...song.dropped, ...lost.flatMap(m => lostSentences(doc, m))];
  if (dropped.length > 0) doc.source.dropped = dropped;
  return doc;
}

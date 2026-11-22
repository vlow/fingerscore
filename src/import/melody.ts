import type { ParsedSong, ParsedTrack } from './types';

export interface TrackInfo {
  id: string; score: number; recommended: boolean; tags: ('Lyrics' | 'Single notes' | 'Chords')[];
  stats: { notes: number; min: number; max: number; maxSimultaneous: number };
}

const GRID = 1e6;     // time keys: quarter notes rounded to 1e-6
const key = (t: number): number => Math.round(t * GRID);
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function usableTracks(song: ParsedSong): ParsedTrack[] {
  return song.tracks.filter(t => !t.percussion && t.notes.length > 0);
}

function maxSimultaneous(track: ParsedTrack): number {
  const events: [number, number][] = [];
  for (const n of track.notes) {
    events.push([key(n.start), 1], [key(n.start + n.dur), -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);     // ends before starts at the same time
  let now = 0;
  let max = 0;
  for (const [, delta] of events) {
    now += delta;
    max = Math.max(max, now);
  }
  return max;
}

function monophonicRatio(track: ParsedTrack): number {
  const onsets = new Map<number, number>();
  for (const n of track.notes) onsets.set(key(n.start), (onsets.get(key(n.start)) ?? 0) + 1);
  let single = 0;
  for (const count of onsets.values()) if (count === 1) single += 1;
  return single / onsets.size;
}

function melodyScore(track: ParsedTrack): number {
  const pitches = track.notes.map(n => n.midi);
  const avg = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const inRange = pitches.filter(p => p >= 55 && p <= 84).length / pitches.length;
  return monophonicRatio(track) * 3 + (track.lyrics.length > 0 ? 2 : 0) + clamp((avg - 55) / 12, 0, 2) + inRange * 2;
}

/** One entry per track, same order as `song.tracks`. Exactly one is recommended unless no track is usable. */
export function analyseTracks(song: ParsedSong): TrackInfo[] {
  const infos = song.tracks.map((t): TrackInfo => {
    const pitches = t.notes.map(n => n.midi);
    const usable = !t.percussion && t.notes.length > 0;
    const maxSim = t.notes.length > 0 ? maxSimultaneous(t) : 0;
    const tags: TrackInfo['tags'] = [];
    if (usable) {
      if (t.lyrics.length > 0) tags.push('Lyrics');
      tags.push(maxSim === 1 ? 'Single notes' : 'Chords');
    }
    return {
      id: t.id,
      score: usable ? melodyScore(t) : 0,
      recommended: false,
      tags,
      stats: {
        notes: t.notes.length,
        min: pitches.length > 0 ? Math.min(...pitches) : 0,
        max: pitches.length > 0 ? Math.max(...pitches) : 0,
        maxSimultaneous: maxSim,
      },
    };
  });
  let best = -1;
  song.tracks.forEach((t, i) => {
    if (t.percussion || t.notes.length === 0) return;
    if (best < 0 || infos[i].score > infos[best].score) best = i;
  });
  if (best >= 0) infos[best].recommended = true;
  return infos;
}

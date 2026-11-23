import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFile } from './index';
import type { ParsedSong, ParsedTrack } from './types';

// Reads the owner's real files from samples/ (git-ignored). The whole file is skipped when the folder is absent.
const DIR = join(process.cwd(), 'samples');
const EXT = /\.(mscz|mscx|abc)$/i;
const SUPPORTED_METERS = ['2/2', '2/4', '3/4', '4/4', '6/8'];
const TOL = 1e-6;

const V1 = 'the-entertainer-scott-joplin.mscz';
const QUARTET_2 = 'canon-in-d-major-for-saxophone-quartet.mscz';
const QUARTET_4 = 'canon-in-d-major-for-saxophone-quartet4.mscz';
const CONCERT = {
  2: 'canon-in-d-major-for-saxophone-quartet-2-concert-pitch.mscz',
  3: 'canon-in-d-major-for-saxophone-quartet-3-concert-pitch.mscz',
  4: 'canon-in-d-major-for-saxophone-quartet4-concert-pitch.mscz',
};
const PICKUP = {
  2: 'canon-in-d-major-for-saxophone-quartet-2-pickup-bar.mscz',
  3: 'canon-in-d-major-for-saxophone-quartet-3-pickup-bar.mscz',
  4: 'canon-in-d-major-for-saxophone-quartet4-concert-pitch-4-pickup-bar.mscz',
};
const DRUMS = {
  2: 'canon-in-d-major-for-saxophone-quartet-2-drums.mscz',
  3: 'canon-in-d-major-for-saxophone-quartet-3-drums.mscz',
  4: 'canon-in-d-major-for-saxophone-quartet4-concert-pitch-4-drums.mscz',
};
const CAPRICE_3 = 'caprice-24-niccolo-paganini-paganini-caprice-24 musescore 3.mscz';
const CAPRICE_4 = 'caprice-24-niccolo-paganini-paganini-caprice-24.mscz';
const ENTERTAINER = {
  2: 'the-entertainer-scott-joplin2.mscz',
  3: 'the-entertainer-scott-joplin3.mscz',
  4: 'the-entertainer-scott-joplin4.mscz',
};
const TUPLETS = 'the-entertainer-scott-joplin2-tuplets.mscz';
const HYMN = { 2: 'the-love-of-god-is-greater-far.mscz', 3: 'the-love-of-god-is-greater-far3.mscz', 4: 'the-love-of-god-is-greater-far4.mscz' };

const sampleFiles = existsSync(DIR)
  ? readdirSync(DIR).filter(n => !n.startsWith('.') && EXT.test(n) && statSync(join(DIR, n)).isFile()).sort()
  : [];
const toFile = (name: string) => new File([readFileSync(join(DIR, name))], name);

// ---- comparison with a readable first difference ----

const meter = (s: ParsedSong) => `${s.timeSig[0]}/${s.timeSig[1]}`;
const where = (s: ParsedSong, at: number) => {
  const barLen = (s.timeSig[0] * 4) / s.timeSig[1];
  return at < s.pickup ? 'bar 0 (pickup)' : `bar ${Math.floor((at - s.pickup) / barLen + TOL) + 1}`;
};
const near = (a: number, b: number) => Math.abs(a - b) <= TOL;

/** First difference between two lists of positioned items, or null. */
function diffList<T extends { at: number } | { start: number }>(
  label: string, song: ParsedSong, a: T[], b: T[], same: (x: T, y: T) => boolean, show: (x: T) => string,
): string | null {
  const pos = (x: T) => ('at' in x ? x.at : x.start);
  if (a.length !== b.length) return `${label}: ${a.length} against ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    if (!same(a[i], b[i])) return `${label} #${i} in ${where(song, pos(a[i]))}: ${show(a[i])} against ${show(b[i])}`;
  }
  return null;
}

function diffTrack(song: ParsedSong, a: ParsedTrack, b: ParsedTrack, chords: boolean): string | null {
  const t = `track "${a.name}"`;
  if (a.name !== b.name) return `${t}: name "${a.name}" against "${b.name}"`;
  if (a.percussion !== b.percussion) return `${t}: percussion ${a.percussion} against ${b.percussion}`;
  return diffList(`${t} notes`, song, a.notes, b.notes,
    (x, y) => x.midi === y.midi && near(x.start, y.start) && near(x.dur, y.dur),
    n => `midi ${n.midi} at ${n.start} for ${n.dur}`)
    ?? diffList(`${t} lyrics`, song, a.lyrics, b.lyrics, (x, y) => x.text === y.text && near(x.at, y.at), l => `"${l.text}" at ${l.at}`)
    ?? (chords
      ? diffList(`${t} chords`, song, a.chords, b.chords, (x, y) => x.text === y.text && near(x.at, y.at), c => `${c.text} at ${c.at}`)
      : null);
}

/** First difference between two songs in tracks, marks, key, pickup, meter and tempo, or null. */
function diffSongs(a: ParsedSong, b: ParsedSong, chords = true): string | null {
  if (meter(a) !== meter(b)) return `meter ${meter(a)} against ${meter(b)}`;
  if (!near(a.tempo, b.tempo)) return `tempo ${a.tempo} against ${b.tempo}`;
  if (!near(a.pickup, b.pickup)) return `pickup ${a.pickup} against ${b.pickup}`;
  if (JSON.stringify(a.key) !== JSON.stringify(b.key)) return `key ${JSON.stringify(a.key)} against ${JSON.stringify(b.key)}`;
  if (JSON.stringify(a.marks) !== JSON.stringify(b.marks)) return `marks ${JSON.stringify(a.marks)} against ${JSON.stringify(b.marks)}`;
  if (a.tracks.length !== b.tracks.length) return `${a.tracks.length} tracks against ${b.tracks.length}`;
  for (let i = 0; i < a.tracks.length; i++) {
    const d = diffTrack(a, a.tracks[i], b.tracks[i], chords);
    if (d) return d;
  }
  return null;
}

const pitched = (s: ParsedSong) => s.tracks.filter(t => !t.percussion);
const percussion = (s: ParsedSong) => s.tracks.filter(t => t.percussion);

describe.skipIf(!existsSync(DIR))('real files in samples/', () => {
  const songs = new Map<string, ParsedSong>();
  const errors = new Map<string, unknown>();
  const song = (name: string) => {
    const s = songs.get(name);
    if (!s) throw new Error(`${name} did not parse: ${String(errors.get(name))}`);
    return s;
  };
  const same = (a: string, b: string, chords = true) => expect(diffSongs(song(a), song(b), chords)).toBeNull();
  /** Pitched track names and count, meter, key and tempo: what the copies of one piece share when their notes differ. */
  const frame = (s: ParsedSong) => ({
    names: pitched(s).map(t => t.name), meter: meter(s), key: s.key, tempo: s.tempo,
  });

  beforeAll(async () => {
    for (const name of sampleFiles) {
      try { songs.set(name, await parseFile(toFile(name))); } catch (e) { errors.set(name, e); }
    }
  }, 120_000);

  it('refuses the version 1 file with the version message', () => {
    expect(sampleFiles).toContain(V1);
    expect((errors.get(V1) as { userMessage?: string }).userMessage).toBe(
      `"${V1}" was saved with a MuseScore version fingerscore does not read. Open it in a current MuseScore and save it again, or export MusicXML.`);
  });

  it.each(sampleFiles.filter(n => n !== V1))('%s parses with a pitched track and a supported meter', name => {
    const s = song(name);
    expect(pitched(s).length).toBeGreaterThan(0);
    for (const t of pitched(s)) expect(t.notes.length).toBeGreaterThan(0);
    expect(SUPPORTED_METERS).toContain(meter(s));
  });

  describe('the same music in another version or state', () => {
    it('quartet: version 2 equals version 4', () => same(QUARTET_2, QUARTET_4));
    it('quartet: each concert-pitch copy equals the plain copy of its version', () => {
      same(CONCERT[2], QUARTET_2);
      same(CONCERT[4], QUARTET_4);
    });
    it('quartet: the version 3 concert-pitch copy equals the plain copies of versions 2 and 4', () => {
      same(CONCERT[3], QUARTET_2);
      same(CONCERT[3], QUARTET_4);
    });
    it('Caprice: version 3 equals version 4', () => same(CAPRICE_3, CAPRICE_4));
    it('Entertainer: versions 2 and 3 are equal', () => same(ENTERTAINER[2], ENTERTAINER[3]));
    it('Entertainer: version 4 equals version 3 in tracks, lyrics, marks, key, pickup, meter and tempo', () => {
      same(ENTERTAINER[4], ENTERTAINER[3], false);
    });
    // The two files differ in content: bar 5 of version 4 holds both chord symbols before the first chord,
    // version 3 puts the second before the fourth chord, and the reader follows each file.
    it('Entertainer: version 4 has 164 chord symbols per track with the chord texts of version 3', () => {
      const texts = (name: string) => song(name).tracks.map(t => t.chords.map(c => c.text).sort());
      for (const t of pitched(song(ENTERTAINER[4]))) expect(t.chords).toHaveLength(164);
      expect(texts(ENTERTAINER[4])).toEqual(texts(ENTERTAINER[3]));
    });
    it('hymn: version 2 equals version 3', () => same(HYMN[2], HYMN[3]));
    it('hymn: version 4 equals version 3 except for the two chord texts the owner changed', () => {
      expect(diffSongs(song(HYMN[4]), song(HYMN[3]), false)).toBeNull();
      for (const [a, b] of song(HYMN[4]).tracks.map((t, i) => [t, song(HYMN[3]).tracks[i]])) {
        expect(a.chords.map(c => c.at)).toEqual(b.chords.map(c => c.at));
        const changed = a.chords.filter((c, i) => c.text !== b.chords[i].text).map(c => c.text);
        expect(changed.sort()).toEqual(['C/D', 'Gm']);
      }
    });
    it('pickup copies share track names, meter, key and tempo across versions', () => {
      for (const v of [2, 3] as const) {
        expect(frame(song(PICKUP[v]))).toEqual(frame(song(PICKUP[4])));
      }
      expect(frame(song(PICKUP[2]))).toEqual(frame(song(QUARTET_2)));
    });
    it('drum copies share the pitched track names, meter, key and tempo across versions', () => {
      for (const v of [2, 3] as const) {
        expect(frame(song(DRUMS[v]))).toEqual(frame(song(DRUMS[4])));
      }
      expect(frame(song(DRUMS[2]))).toEqual(frame(song(QUARTET_2)));
    });
  });

  describe('quartet', () => {
    it('is in D with four tracks named after the saxophones', () => {
      for (const name of [QUARTET_2, QUARTET_4, ...Object.values(CONCERT)]) {
        const s = song(name);
        expect(s.key?.tonicPc).toBe(2);
        expect(s.tracks.map(t => t.name)).toEqual(
          ['Soprano Saxophone', 'Alto Saxophone', 'Tenor Saxophone', 'Baritone Saxophone']);
      }
    });
    it.each(Object.values(PICKUP))('%s has a pickup of 1', name => {
      expect(song(name).pickup).toBe(1);
    });
    it.each(Object.values(DRUMS))('%s: one drum part, all percussion, and no pitched track shares its name', name => {
      const partOf = (t: ParsedTrack) => t.name.replace(/ · voice \d+$/, '');
      const parts = new Set(percussion(song(name)).map(partOf));
      expect(parts.size).toBe(1);
      const sameName = song(name).tracks.filter(t => parts.has(partOf(t)));
      expect(sameName.every(t => t.percussion)).toBe(true);
    });
  });

  describe('Entertainer', () => {
    const copies = [...Object.values(ENTERTAINER), TUPLETS];
    it.each(copies)('%s has four repeat pairs and first and second endings', name => {
      const { marks } = song(name);
      expect(marks.filter(m => m.rs)).toHaveLength(4);
      expect(marks.filter(m => m.re)).toHaveLength(4);
      expect(marks.map(m => m.volta).filter(Boolean)).toContain('1');
      expect(marks.map(m => m.volta).filter(Boolean)).toContain('2');
    });
    it.each(copies)('%s carries 164 chord symbols on every pitched track', name => {
      for (const t of pitched(song(name))) expect(t.chords).toHaveLength(164);
    });
    it('the tuplets copy has a note a third of a quarter long', () => {
      expect(pitched(song(TUPLETS)).some(t => t.notes.some(n => near(n.dur, 1 / 3)))).toBe(true);
    });
  });

  describe('Caprice and hymn', () => {
    it.each([CAPRICE_3, CAPRICE_4])('%s is in 2/4 with tonic pitch class 3', name => {
      const s = song(name);
      expect(meter(s)).toBe('2/4');
      expect(s.key?.tonicPc).toBe(3);
    });
    it.each(Object.values(HYMN))('%s has 22 chord symbols on every track', name => {
      for (const t of song(name).tracks) expect(t.chords).toHaveLength(22);
    });
  });

  describe('ABC', () => {
    it('040-amor-de-cristo.abc', () => {
      const s = song('040-amor-de-cristo.abc');
      expect(meter(s)).toBe('3/4');
      expect(s.tempo).toBe(140);
      expect(s.key).toEqual({ tonicPc: 0, mode: 'major' });
      expect(s.tracks).toHaveLength(1);
      expect(s.tracks[0].lyrics.slice(0, 2).map(l => l.text)).toEqual(['1. Qual', 'gran-']);
      expect(s.tracks[0].chords.slice(0, 4).map(c => c.text)).toEqual(['C', 'Dm/F', 'Dm', 'G']);
    });
    it('b034-the-bonny-greyeyed-morn.abc', () => {
      const s = song('b034-the-bonny-greyeyed-morn.abc');
      expect(meter(s)).toBe('4/4');
      expect(s.key).toEqual({ tonicPc: 10, mode: 'major' });
      expect(s.pickup).toBe(0.5);
      expect(s.tracks[0].notes.slice(0, 2).map(n => n.midi)).toEqual([65, 70]);
    });
  });
});

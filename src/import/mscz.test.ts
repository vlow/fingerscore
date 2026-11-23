import JSZip from 'jszip';
import { afterEach, vi } from 'vitest';
import { parseFile } from './index';
import { parseMuseScore } from './mscz';
import { ImportError } from './types';
import { harmonyText, lyricText } from './mscz/common';

// ---- fixture helpers: a few bars of hand-written MuseScore XML ----

const mscx = (version: string, body: string, style = '') =>
  `<?xml version="1.0" encoding="UTF-8"?><museScore version="${version}"><Score>${style}${body}</Score></museScore>`;
const TS = (n = 4, d = 4) => `<TimeSig><sigN>${n}</sigN><sigD>${d}</sigD></TimeSig>`;
const chord = (type: string, pitches: number[], extra = '') =>
  `<Chord><durationType>${type}</durationType>${extra}${pitches.map(p => `<Note><pitch>${p}</pitch></Note>`).join('')}</Chord>`;
const rest = (type: string) => `<Rest><durationType>${type}</durationType></Rest>`;
const tieStart = (pitch: number) =>
  `<Chord><durationType>quarter</durationType><Note><Spanner type="Tie"><Tie/><next><location><fractions>1/4</fractions></location></next></Spanner><pitch>${pitch}</pitch></Note></Chord>`;
const tieEnd = (pitch: number) =>
  `<Chord><durationType>quarter</durationType><Note><Spanner type="Tie"><prev><location><fractions>-1/4</fractions></location></prev></Spanner><pitch>${pitch}</pitch></Note></Chord>`;
/** One measure; each argument is the content of one voice. */
const bar = (attrs: string, ...voices: string[]) =>
  `<Measure${attrs}>${voices.map(v => `<voice>${v}</voice>`).join('')}</Measure>`;
const staff = (id: number, ...bars: string[]) => `<Staff id="${id}">${bars.join('')}</Staff>`;
interface PartOpts { name?: string; staves?: number[]; transpose?: number; drums?: boolean; staffType?: string; plainStaves?: boolean }
const part = ({ name = 'Flute', staves = [1], transpose, drums, staffType = 'pitched', plainStaves }: PartOpts = {}) =>
  `<Part>${staves.map(s => `<Staff${plainStaves ? '' : ` id="${s}"`}><StaffType group="${staffType}"/></Staff>`).join('')}` +
  `<trackName>${name}</trackName><Instrument id="x"><longName>${name} long</longName><trackName>${name}</trackName>` +
  `${transpose === undefined ? '' : `<transposeChromatic>${transpose}</transposeChromatic>`}${drums ? '<useDrumset>1</useDrumset>' : ''}</Instrument></Part>`;
/** One flute staff of the given measures, in 4/4 unless the first bar says otherwise. */
const simple = (...bars: string[]) => mscx('3.02', part() + staff(1, ...bars));
/** Version 2 form: no <voice> wrapper, the voice is the <track> child. */
const chord2 = (type: string, pitches: number[], extra = '', track?: number) =>
  `<Chord>${track === undefined ? '' : `<track>${track}</track>`}${extra}<durationType>${type}</durationType>` +
  `${pitches.map(p => `<Note>${track === undefined ? '' : `<track>${track}</track>`}<pitch>${p}</pitch></Note>`).join('')}</Chord>`;
const rest2 = (type: string, track?: number) =>
  `<Rest>${track === undefined ? '' : `<track>${track}</track>`}<durationType>${type}</durationType></Rest>`;
const m2 = (content: string, attrs = '') => `<Measure${attrs}>${content}</Measure>`;
const c2 = (type: string, p: number, extra = '', track?: number) => chord2(type, [p], extra, track);

const bytes = (s: string) => new TextEncoder().encode(s);
const parse = (xml: string, file = 'x.mscx') => parseMuseScore(file, bytes(xml));
const rejection = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e; }
  throw new Error('did not throw');
};

afterEach(() => { vi.restoreAllMocks(); });

describe('refusals', () => {

  it('refuses version 1.14', async () => {
    const e = await rejection(parse('<museScore version="1.14"><Score/></museScore>', 'old.mscx'));
    expect(e).toBeInstanceOf(ImportError);
    expect((e as ImportError).userMessage).toBe(
      '"old.mscx" was saved with a MuseScore version fingerscore does not read. Open it in a current MuseScore and save it again, or export MusicXML.');
  });

  it('checks the length after unpacking when the entry declares no size', async () => {
    const entry = { name: 'big.mscx', dir: false, async: vi.fn().mockResolvedValue(new Uint8Array(51 * 1024 * 1024)) };
    vi.spyOn(JSZip, 'loadAsync').mockResolvedValueOnce({ files: { 'big.mscx': entry } } as unknown as JSZip);
    const e = await rejection(parseMuseScore('big.mscz', new Uint8Array([0x50, 0x4b, 3, 4])));
    expect((e as ImportError).userMessage).toBe('"big.mscz" could not be read as a MuseScore file.');
    expect(entry.async).toHaveBeenCalled();
  });

  it('a missing or non-numeric version is unreadable, not too old', async () => {
    for (const root of ['<museScore><Score/></museScore>', '<museScore version=""><Score/></museScore>', '<museScore version="x"><Score/></museScore>']) {
      const e = await rejection(parse(root, 'v.mscx'));
      expect((e as ImportError).userMessage).toBe('"v.mscx" could not be read as a MuseScore file.');
    }
  });

  it('refuses a root other than museScore, and a zip without a score', async () => {
    const other = await rejection(parse('<score-partwise version="3.0"/>', 'x.mscz'));
    expect((other as ImportError).userMessage).toBe('"x.mscz" could not be read as a MuseScore file.');
    const zip = new JSZip();
    zip.file('Thumbnails/thumbnail.png', 'x');
    zip.file('sub/inner.mscx', '<museScore version="3.02"/>');
    const empty = await rejection(parseMuseScore('x.mscz', await zip.generateAsync({ type: 'uint8array' })));
    expect((empty as ImportError).userMessage).toBe('"x.mscz" could not be read as a MuseScore file.');
  });

  it('refuses an entry whose unpacked size is above 50 MB', async () => {
    const entry = { name: 'big.mscx', dir: false, _data: { uncompressedSize: 51 * 1024 * 1024 }, async: vi.fn() };
    vi.spyOn(JSZip, 'loadAsync').mockResolvedValueOnce({ files: { 'big.mscx': entry } } as unknown as JSZip);
    const e = await rejection(parseMuseScore('big.mscz', new Uint8Array([0x50, 0x4b, 3, 4])));
    expect((e as ImportError).userMessage).toBe('"big.mscz" could not be read as a MuseScore file.');
    expect(entry.async).not.toHaveBeenCalled();
  });
});

describe('zip and entry', () => {
  it('reads the first top-level .mscx of a .mscz', async () => {
    const zip = new JSZip();
    zip.file('sub/inner.mscx', '<museScore version="3.02"/>');
    zip.file('score.mscx', simple(bar('', TS() + chord('whole', [60]))));
    const song = await parseMuseScore('a.mscz', await zip.generateAsync({ type: 'uint8array' }));
    expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 4, midi: 60 }]);
  });

  it('parseFile names the format MuseScore', async () => {
    const song = await parseFile(new File([bytes(simple(bar('', TS() + chord('whole', [60]))))], 'a.mscx'));
    expect(song.format).toBe('MuseScore');
  });
});

describe('notes and time', () => {
  it('reads notes, rests, meter, pickup and tempo', async () => {
    const song = await parse(simple(bar('', TS() + chord('quarter', [72]) + rest('eighth') + chord('eighth', [74]) + chord('half', [76]))));
    expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 1, midi: 72 }, { start: 1.5, dur: 0.5, midi: 74 }, { start: 2, dur: 2, midi: 76 }]);
    expect(song).toMatchObject({ format: 'MuseScore', file: 'x.mscx', timeSig: [4, 4], pickup: 0, tempo: 120, marks: [] });
    expect(song.tracks[0]).toMatchObject({ lyrics: [], chords: [] });
  });

  it('dots lengthen a note', async () => {
    const song = await parse(simple(bar('', TS() + chord('quarter', [60], '<dots>1</dots>') + chord('eighth', [62]) + chord('half', [64]))));
    expect(song.tracks[0].notes.map(n => [n.start, n.dur])).toEqual([[0, 1.5], [1.5, 0.5], [2, 2]]);
  });

  it('a chord gives simultaneous notes', async () => {
    const song = await parse(simple(bar('', TS() + chord('whole', [60, 64, 67]))));
    expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 4, midi: 60 }, { start: 0, dur: 4, midi: 64 }, { start: 0, dur: 4, midi: 67 }]);
  });

  it('reads the tempo of the first Tempo mark', async () => {
    const song = await parse(simple(bar('', TS() + '<Tempo><tempo>1.33333</tempo></Tempo>' + chord('whole', [60]))));
    expect(song.tempo).toBe(80);
  });

  it('a short first measure is the pickup and the next bar starts after it', async () => {
    const song = await parse(simple(bar(' len="1/4"', TS() + chord('quarter', [60])), bar('', chord('whole', [62]))));
    expect(song.pickup).toBe(1);
    expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 1, midi: 60 }, { start: 1, dur: 4, midi: 62 }]);
  });

  it('a full-measure rest lasts as long as the measure', async () => {
    const song = await parse(simple(bar('', TS(3, 4) + rest('measure')), bar('', chord('half', [60], '<dots>1</dots>'))));
    expect(song.timeSig).toEqual([3, 4]);
    expect(song.tracks[0].notes).toEqual([{ start: 3, dur: 3, midi: 60 }]);
  });

  it('a triplet of eighths takes a quarter', async () => {
    const triplet = '<Tuplet><normalNotes>2</normalNotes><actualNotes>3</actualNotes><baseNote>eighth</baseNote></Tuplet>';
    const song = await parse(simple(bar('', TS() + triplet + chord('eighth', [60]) + chord('eighth', [62]) + chord('eighth', [64]) + '<endTuplet/>' + chord('half', [65], '<dots>1</dots>'))));
    const n = song.tracks[0].notes;
    expect(n).toHaveLength(4);
    [0, 1 / 3, 2 / 3].forEach((s, i) => { expect(n[i].start).toBeCloseTo(s); expect(n[i].dur).toBeCloseTo(1 / 3); });
    expect(n[3].start).toBeCloseTo(1);
  });

  it('a grace chord does not move the note after it', async () => {
    const song = await parse(simple(bar('', TS() + chord('16th', [62], '<grace16/>') + chord('quarter', [60]) + chord('quarter', [64], '<acciaccatura/>') + chord('quarter', [65]))));
    expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 1, midi: 60 }, { start: 1, dur: 1, midi: 65 }]);
  });

  it('a location gap moves the position', async () => {
    const song = await parse(simple(bar('', TS() + '<location><fractions>1/2</fractions></location>' + chord('half', [60]))));
    expect(song.tracks[0].notes).toEqual([{ start: 2, dur: 2, midi: 60 }]);
  });

  it('refuses a changing meter with the shared message', async () => {
    const e = await rejection(parse(simple(bar('', TS() + chord('whole', [60])), bar('', TS(3, 4) + chord('half', [60], '<dots>1</dots>')))));
    expect((e as ImportError).userMessage).toContain('changes its time signature');
  });
});

describe('ties', () => {
  it('merges two tied quarters of one pitch', async () => {
    const song = await parse(simple(bar('', TS() + tieStart(60) + tieEnd(60) + chord('half', [62]))));
    expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 2, midi: 60 }, { start: 2, dur: 2, midi: 62 }]);
  });

  it('merges across a bar line', async () => {
    const song = await parse(simple(bar('', TS() + chord('half', [62]) + chord('quarter', [64]) + tieStart(60)), bar('', tieEnd(60) + chord('half', [65], '<dots>1</dots>'))));
    expect(song.tracks[0].notes).toEqual([
      { start: 0, dur: 2, midi: 62 }, { start: 2, dur: 1, midi: 64 }, { start: 3, dur: 2, midi: 60 }, { start: 5, dur: 3, midi: 65 },
    ]);
  });

  it('a tie start does not swallow a later note of the same pitch that is not its continuation', async () => {
    const song = await parse(simple(bar('', TS() + tieStart(60) + chord('quarter', [62]) + chord('half', [60]))));
    expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 1, midi: 60 }, { start: 1, dur: 1, midi: 62 }, { start: 2, dur: 2, midi: 60 }]);
  });
});

describe('tracks', () => {
  it('names voices of one staff, and gives each its own times', async () => {
    const xml = mscx('3.02', part() + staff(1,
      bar('', TS() + chord('whole', [72]), chord('quarter', [60])),
      bar('', chord('whole', [74]), chord('whole', [62]))));
    const song = await parse(xml);
    expect(song.tracks.map(t => [t.id, t.name])).toEqual([['1:1', 'Flute · voice 1'], ['1:2', 'Flute · voice 2']]);
    expect(song.tracks[1].notes).toEqual([{ start: 0, dur: 1, midi: 60 }, { start: 4, dur: 4, midi: 62 }]);
  });

  it('an empty voice makes no track and keeps the plain name', async () => {
    const song = await parse(mscx('3.02', part() + staff(1, bar('', TS() + chord('whole', [72]), rest('whole')))));
    expect(song.tracks.map(t => t.name)).toEqual(['Flute']);
  });

  it('a part with two staves names the staves', async () => {
    const xml = mscx('3.02', part({ name: 'Piano', staves: [1, 2] }) +
      staff(1, bar('', TS() + chord('whole', [72]))) + staff(2, bar('', TS() + chord('whole', [48]))));
    const song = await parse(xml);
    expect(song.tracks.map(t => [t.id, t.name, t.instrument])).toEqual([
      ['1:1', 'Piano · staff 1', 'Piano long'], ['2:1', 'Piano · staff 2', 'Piano long'],
    ]);
  });

  it('version 4 parts list staves without ids, in order', async () => {
    const xml = mscx('4.70', part({ name: 'Flute', plainStaves: true }) + part({ name: 'Oboe', plainStaves: true }) +
      staff(1, bar('', TS() + chord('whole', [72]))) + staff(2, bar('', TS() + chord('whole', [60]))));
    const song = await parse(xml);
    expect(song.tracks.map(t => [t.id, t.name])).toEqual([['1:1', 'Flute'], ['2:1', 'Oboe']]);
  });

  it('ignores the staves of a nested excerpt', async () => {
    const excerpt = `<Excerpt><Score>${part({ name: 'Extract' })}${staff(1, bar('', TS() + chord('whole', [50])))}</Score></Excerpt>`;
    const song = await parse(mscx('3.02', part() + staff(1, bar('', TS() + chord('whole', [72]))) + excerpt));
    expect(song.tracks.map(t => t.name)).toEqual(['Flute']);
  });

  it('starts every measure at its own grid position in every voice', async () => {
    const song = await parse(simple(
      bar('', TS() + chord('whole', [72]), chord('quarter', [60])),
      bar('', chord('whole', [74]), chord('quarter', [62]))));
    expect(song.tracks[1].notes).toEqual([{ start: 0, dur: 1, midi: 60 }, { start: 4, dur: 1, midi: 62 }]);
  });

  it('marks percussion by the drumset or by the staff type', async () => {
    const xml = mscx('3.02', part({ name: 'Drums', drums: true }) + part({ name: 'Kit', staves: [2], staffType: 'percussion' }) + part({ name: 'Flute', staves: [3] }) +
      staff(1, bar('', TS() + chord('whole', [36]))) + staff(2, bar('', TS() + chord('whole', [38]))) + staff(3, bar('', TS() + chord('whole', [72]))));
    const song = await parse(xml);
    expect(song.tracks.map(t => [t.name, t.percussion, t.channel])).toEqual([['Drums', true, 10], ['Kit', true, 10], ['Flute', false, null]]);
  });

  it('a score with only a drum part has no melody track', async () => {
    const e = await rejection(parse(mscx('3.02', part({ name: 'Drums', drums: true }) + staff(1, bar('', TS() + chord('whole', [36])))), 'd.mscx'));
    expect((e as ImportError).userMessage).toBe('"d.mscx" has no melody track.');
  });
});

describe('key', () => {
  const keyed = (version: string, sig: string, opts: PartOpts = {}, style = '') =>
    mscx(version, part(opts) + staff(1, bar('', sig + TS() + chord('whole', [72])) + bar('', chord('whole', [72]))), style);

  it('version 3: the written signature shifted by the transposition', async () => {
    const song = await parse(keyed('3.02', '<KeySig><accidental>4</accidental></KeySig>', { transpose: -2 }));
    expect(song.key).toEqual({ tonicPc: 2, mode: null });
  });

  it('version 3: concert pitch style leaves the signature as it is', async () => {
    const song = await parse(keyed('3.02', '<KeySig><accidental>2</accidental></KeySig>', { transpose: -2 }, '<Style><concertPitch>1</concertPitch></Style>'));
    expect(song.key).toEqual({ tonicPc: 2, mode: null });
  });

  it('version 3: no signature on a transposing part is written C', async () => {
    expect((await parse(keyed('3.02', '', { transpose: -9 }))).key).toEqual({ tonicPc: 3, mode: null });
  });

  it('a later key change does not change the key', async () => {
    const bars = Array.from({ length: 5 }, (_, i) => bar('', (i === 0 ? TS() : '') + (i === 4 ? '<KeySig><accidental>3</accidental></KeySig>' : '') + chord('whole', [72])));
    const song = await parse(mscx('3.02', part() + staff(1, ...bars)));
    expect(song.key).toEqual({ tonicPc: 0, mode: null });
  });

  it('version 4: takes the concert key as it is, and ignores eid children', async () => {
    const song = await parse(keyed('4.70', '<KeySig><eid>abc</eid><concertKey>-3</concertKey><actualKey>0</actualKey></KeySig>', { transpose: -9 }));
    expect(song.key).toEqual({ tonicPc: 3, mode: null });
  });

  it('the key comes from the first part that is not percussion', async () => {
    const xml = mscx('3.02', part({ name: 'Drums', drums: true }) + part({ name: 'Flute', staves: [2] }) +
      staff(1, bar('', '<KeySig><accidental>1</accidental></KeySig>' + TS() + chord('whole', [36]))) +
      staff(2, bar('', '<KeySig><accidental>-1</accidental></KeySig>' + TS() + chord('whole', [72]))));
    expect((await parse(xml)).key).toEqual({ tonicPc: 5, mode: null });
  });
});

// ---- lyrics, chord symbols, repeats, endings ----

const lyric = (t: string, syllabic = '', no = '') =>
  `<Lyrics>${no}${syllabic ? `<syllabic>${syllabic}</syllabic>` : ''}<text>${t}</text></Lyrics>`;
const harmony3 = (root: number, extra = '') => `<Harmony><root>${root}</root>${extra}</Harmony>`;
const harmony4 = (root: number, info = '') => `<Harmony><harmonyInfo>${info}<root>${root}</root></harmonyInfo></Harmony>`;
const volta = (endings: string, measures: number) =>
  `<Spanner type="Volta"><Volta><endings>${endings}</endings></Volta><next><location><measures>${measures}</measures></location></next></Spanner>`;
const voltaEnd = '<Spanner type="Volta"><prev><location><measures>-1</measures></location></prev></Spanner>';

describe('harmonyText and lyricText', () => {
  it('writes root, kind and bass', () => {
    expect(harmonyText(15, 'mi', null)).toBe('Gm');
    expect(harmonyText(14, null, 16)).toBe('C/D');
    expect(harmonyText(14, 'o7', null)).toBe('C°7');
    expect(harmonyText(13, '7', 17)).toBe('F7/A');
  });

  it('maps only the short leading tokens of the kind', () => {
    expect(harmonyText(14, 'min7', null)).toBe('Cmin7');
    expect(harmonyText(14, 'maj7', null)).toBe('Cmaj7');
    expect(harmonyText(14, 'mi7', null)).toBe('Cm7');
    expect(harmonyText(14, 'ma7', null)).toBe('Cmaj7');
    expect(harmonyText(14, 'm', null)).toBe('Cm');
    expect(harmonyText(14, '07', null)).toBe('Cø7');
    expect(harmonyText(14, 'o', null)).toBe('C°');
    expect(harmonyText(14, 'mi', null)).toBe('Cm');
    expect(harmonyText(14, 'madd9', null)).toBe('Cmadd9');
    expect(harmonyText(14, 'omit5', null)).toBe('Comit5');
  });

  it('spells root and bass as the tonal pitch class writes them', () => {
    expect(harmonyText(12, null, 11)).toBe('B♭/E♭');
    expect(harmonyText(21, 'mi', null)).toBe('C♯m');
    expect(harmonyText(9, null, 24)).toBe('D♭/A♯');
    expect([harmonyText(13, null, null), harmonyText(19, null, null), harmonyText(20, null, null), harmonyText(7, null, null), harmonyText(6, null, null)])
      .toEqual(['F', 'B', 'F♯', 'C♭', 'F♭']);
    // A double sharp or flat is written as the plain note of the same pitch: the chord parser reads one accidental only.
    expect([harmonyText(28, null, null), harmonyText(0, null, null), harmonyText(-1, null, null), harmonyText(33, null, null)])
      .toEqual(['D', 'B♭', 'E♭', 'D♭']);
    expect(harmonyText(28, 'mi', 0)).toBe('Dm/B♭');
  });

  it('hyphenates begin and middle syllables', () => {
    expect([lyricText('won', 'begin'), lyricText('der', 'end'), lyricText('x', 'middle'), lyricText('a', null)]).toEqual(['won-', 'der', 'x-', 'a']);
  });
});

describe('lyrics', () => {
  it('reads verse 1 at the chord start, with hyphens', async () => {
    const song = await parse(simple(bar('', TS() +
      chord('quarter', [60], lyric('won', 'begin')) + rest('quarter') + chord('half', [62], lyric('der', 'end')))));
    expect(song.tracks[0].lyrics).toEqual([{ at: 0, text: 'won-' }, { at: 2, text: 'der' }]);
  });

  it('skips verse 2, takes <no>0</no> as verse 1 and keeps a verse number in the text', async () => {
    const song = await parse(simple(bar('', TS() +
      chord('half', [60], lyric('1 The', '') + lyric('2 When', '', '<no>1</no>')) +
      chord('half', [62], lyric('only 2', '', '<no>1</no>') + lyric('go', '', '<no>0</no>')))));
    expect(song.tracks[0].lyrics).toEqual([{ at: 0, text: '1 The' }, { at: 2, text: 'go' }]);
  });

  it('puts lyrics on the track of their voice', async () => {
    const song = await parse(simple(bar('', TS() + chord('whole', [72]), chord('whole', [60], lyric('la')))));
    expect(song.tracks.map(t => t.lyrics)).toEqual([[], [{ at: 0, text: 'la' }]]);
  });
});

describe('chord symbols', () => {
  it('version 4: root and name inside harmonyInfo, at the next chord', async () => {
    const song = await parse(mscx('4.70', part() + staff(1, bar('', TS() + chord('half', [60]) + harmony4(15, '<name>m</name>') + chord('half', [62])))));
    expect(song.tracks[0].chords).toEqual([{ at: 2, text: 'Gm' }]);
  });

  it('version 3: root and base directly inside Harmony; extension is ignored', async () => {
    const song = await parse(simple(bar('', TS() + harmony3(14, '<extension>1</extension><base>16</base>') + chord('whole', [60]))));
    expect(song.tracks[0].chords).toEqual([{ at: 0, text: 'C/D' }]);
  });

  it('version 4: bass inside harmonyInfo', async () => {
    const song = await parse(mscx('4.70', part() + staff(1, bar('', TS() + harmony4(14, '<bass>18</bass>') + chord('whole', [60])))));
    expect(song.tracks[0].chords).toEqual([{ at: 0, text: 'C/E' }]);
  });

  it('a symbol before a rest applies at the rest; a Harmony without root is skipped', async () => {
    const song = await parse(simple(bar('', TS() + chord('quarter', [60]) + '<Harmony><name>x</name></Harmony>' + harmony3(15) + rest('quarter') + chord('half', [62]))));
    expect(song.tracks[0].chords).toEqual([{ at: 1, text: 'G' }]);
  });

  it('every pitched track carries the symbols of the whole score; percussion gets none', async () => {
    const xml = mscx('3.02', part({ name: 'Piano', staves: [1, 2] }) + part({ name: 'Flute', staves: [3] }) + part({ name: 'Drums', staves: [4], drums: true }) +
      staff(1, bar('', TS() + harmony3(14) + chord('half', [72]) + chord('half', [74]), chord('whole', [60]))) +
      staff(2, bar('', TS() + harmony3(14) + chord('half', [48]) + harmony3(15) + chord('half', [50]))) +
      staff(3, bar('', TS() + chord('whole', [76]))) +
      staff(4, bar('', TS() + chord('whole', [36]))));
    const song = await parse(xml);
    expect(song.tracks.map(t => t.name)).toEqual(['Piano · staff 1 · voice 1', 'Piano · staff 1 · voice 2', 'Piano · staff 2', 'Flute', 'Drums']);
    for (const t of song.tracks.slice(0, 4)) expect(t.chords).toEqual([{ at: 0, text: 'C' }, { at: 2, text: 'G' }]);
    expect(song.tracks[4].chords).toEqual([]);
  });
});

describe('repeats and endings', () => {
  const withRepeat = (rep: string, voice: string) => `<Measure>${rep}<voice>${voice}</voice></Measure>`;
  const body = (...bars: string[]) => simple(...bars);

  it('reads repeats and endings by bar', async () => {
    const song = await parse(body(
      withRepeat('<startRepeat/>', TS() + chord('whole', [60])),
      bar('', chord('whole', [60])),
      withRepeat('<endRepeat>2</endRepeat>', volta('1', 1) + chord('whole', [60])),
      bar('', voltaEnd + volta('2', 1) + chord('whole', [60])),
      bar('', voltaEnd + chord('whole', [60]))));
    expect(song.marks).toEqual([{ bar: 0, rs: true }, { bar: 2, re: true, volta: '1' }, { bar: 3, volta: '2' }]);
  });

  it('a longer ending covers the following measures', async () => {
    const song = await parse(body(
      bar('', TS() + volta('2', 2) + chord('whole', [60])), bar('', chord('whole', [60])), bar('', voltaEnd + chord('whole', [60]))));
    expect(song.marks).toEqual([{ bar: 0, volta: '2' }, { bar: 1, volta: '2' }]);
  });

  it('an ending that stops inside its bar covers that bar', async () => {
    const half = '<Spanner type="Volta"><Volta><endings>2</endings></Volta><next><location><fractions>1/2</fractions></location></next></Spanner>';
    const song = await parse(body(bar('', TS() + chord('whole', [60])), bar('', half + chord('whole', [60]))));
    expect(song.marks).toEqual([{ bar: 1, volta: '2' }]);
  });

  it('ignores other endings and lists', async () => {
    const song = await parse(body(bar('', TS() + volta('3', 1) + chord('whole', [60])), bar('', volta('1, 2', 1) + chord('whole', [60]))));
    expect(song.marks).toEqual([]);
  });

  it('counts a pickup measure as bar 0', async () => {
    const xml = body(
      bar(' len="1/4"', TS() + chord('quarter', [60])),
      withRepeat('<startRepeat/>', chord('whole', [60])),
      withRepeat('<endRepeat>2</endRepeat>', chord('whole', [60])));
    expect((await parse(xml)).marks).toEqual([{ bar: 1, rs: true }, { bar: 2, re: true }]);
  });
});

describe('edge cases', () => {
  const tupletOpen = '<Tuplet><normalNotes>2</normalNotes><actualNotes>3</actualNotes><baseNote>eighth</baseNote></Tuplet>';

  it('three or more dots lengthen the note', async () => {
    const song = await parse(simple(bar('', TS() + chord('half', [60], '<dots>3</dots>') + chord('eighth', [62], '<dots>3</dots>'))));
    expect(song.tracks[0].notes.map(n => n.dur)).toEqual([3.75, 0.9375]);
  });

  it('a tuplet may hold a rest and a dotted note', async () => {
    const song = await parse(simple(bar('', TS() + tupletOpen + chord('quarter', [60], '<dots>1</dots>') + rest('eighth') + '<endTuplet/>' + chord('half', [62]))));
    const n = song.tracks[0].notes;
    expect(n[0].dur).toBeCloseTo(1);
    expect(n[1].start).toBeCloseTo(1.333333, 5);
  });

  it('a chain of three tied notes is one note', async () => {
    const mid = '<Chord><durationType>quarter</durationType><Note><Spanner type="Tie"><prev/></Spanner><Spanner type="Tie"><Tie/><next/></Spanner><pitch>60</pitch></Note></Chord>';
    const song = await parse(simple(bar('', TS() + tieStart(60) + mid + tieEnd(60) + chord('quarter', [62]))));
    expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 3, midi: 60 }, { start: 3, dur: 1, midi: 62 }]);
  });

  it('in a chord where one note is tied, only that note continues', async () => {
    const first = '<Chord><durationType>half</durationType><Note><Spanner type="Tie"><Tie/><next/></Spanner><pitch>60</pitch></Note><Note><pitch>64</pitch></Note></Chord>';
    const second = '<Chord><durationType>half</durationType><Note><pitch>60</pitch></Note><Note><pitch>64</pitch></Note></Chord>';
    const song = await parse(simple(bar('', TS() + first + second)));
    expect(song.tracks[0].notes).toEqual([
      { start: 0, dur: 4, midi: 60 }, { start: 0, dur: 2, midi: 64 }, { start: 2, dur: 2, midi: 64 },
    ]);
  });

  it('a location gap at the start of voice 2 moves only voice 2', async () => {
    const song = await parse(simple(bar('', TS() + chord('whole', [72]), '<location><fractions>1/4</fractions></location>' + chord('quarter', [60]))));
    expect(song.tracks[1].notes).toEqual([{ start: 1, dur: 1, midi: 60 }]);
  });

  it('a negative location before a Harmony and its positive twin leave later notes in place', async () => {
    const song = await parse(simple(bar('', TS() + chord('quarter', [60]) +
      '<location><fractions>-1/4</fractions></location>' + harmony3(14) + '<location><fractions>1/4</fractions></location>' + chord('quarter', [62]))));
    expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 1, midi: 60 }, { start: 1, dur: 1, midi: 62 }]);
  });

  it('names a part by staff only when more than one of its staves has notes', async () => {
    const xml = mscx('3.02', part({ name: 'Piano', staves: [1, 2] }) +
      staff(1, bar('', TS() + chord('whole', [72]))) + staff(2, bar('', TS() + rest('whole'))));
    expect((await parse(xml)).tracks.map(t => t.name)).toEqual(['Piano']);
    const second = mscx('3.02', part({ name: 'Piano', staves: [1, 2] }) +
      staff(1, bar('', TS() + rest('whole'))) + staff(2, bar('', TS() + chord('whole', [48]))));
    expect((await parse(second)).tracks.map(t => t.name)).toEqual(['Piano']);
  });

  it('a note without pitch is skipped', async () => {
    const song = await parse(simple(bar('', TS() + '<Chord><durationType>half</durationType><Note><tpc>14</tpc></Note></Chord>' + chord('half', [62]))));
    expect(song.tracks[0].notes).toEqual([{ start: 2, dur: 2, midi: 62 }]);
  });

  it('a chord without durationType is reported as unreadable through parseFile', async () => {
    const xml = simple(bar('', TS() + '<Chord><Note><pitch>60</pitch></Note></Chord>'));
    const e = await rejection(parseFile(new File([bytes(xml)], 'cut.mscx')));
    expect((e as ImportError).userMessage).toBe('"cut.mscx" could not be read as a MuseScore file.');
  });

  it('a measure length of zero or below falls back to the meter', async () => {
    for (const len of ['0/4', '-1/4']) {
      const song = await parse(simple(bar(` len="${len}"`, TS() + chord('whole', [60])), bar('', chord('whole', [62]))));
      expect(song.pickup).toBe(0);
      expect(song.tracks[0].notes.map(n => n.start)).toEqual([0, 4]);
    }
  });
});

// ---- version 2: no <voice> wrapper; voices by <track>, positions by <tick> ----

describe('version 2', () => {
  const tick = (n: number) => `<tick>${n}</tick>`;
  const score2 = (staves: string, opts: PartOpts = {}, style = '', division = '<Division>480</Division>') =>
    mscx('2.06', division + style + part(opts) + staves);
  const one = (...bars: string[]) => score2(staff(1, ...bars));
  const harmony2 = (root: number, extra = '') => `<Harmony><root>${root}</root>${extra}</Harmony>`;
  const volta2 = (id: number, endings: string) => `<Volta id="${id}"><endings>${endings}</endings></Volta>`;
  const endSpanner = (id: number) => `<endSpanner id="${id}"/>`;

  it('reads notes, rests, dots, chords, meter and tempo', async () => {
    const song = await parse(one(m2(TS() + '<Tempo><tempo>1.33333</tempo></Tempo>' + chord2('quarter', [72], '<dots>1</dots>') + rest2('eighth') +
      chord2('quarter', [60, 64]) + chord2('quarter', [67]))));
    expect(song.tracks[0].notes).toEqual([
      { start: 0, dur: 1.5, midi: 72 }, { start: 2, dur: 1, midi: 60 }, { start: 2, dur: 1, midi: 64 }, { start: 3, dur: 1, midi: 67 }]);
    expect(song).toMatchObject({ timeSig: [4, 4], tempo: 80, pickup: 0, marks: [] });
  });

  it('a short first measure is the pickup; a measure rest lasts the measure', async () => {
    const song = await parse(one(m2(TS() + chord2('quarter', [60]), ' len="1/4"'), m2(rest2('measure')), m2(chord2('whole', [62]))));
    expect(song.pickup).toBe(1);
    expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 1, midi: 60 }, { start: 5, dur: 4, midi: 62 }]);
  });

  it('a measure length of zero or below falls back to the meter', async () => {
    const song = await parse(one(m2(TS() + chord2('whole', [60]), ' len="0/4"'), m2(chord2('whole', [62]))));
    expect(song.pickup).toBe(0);
    expect(song.tracks[0].notes.map(n => n.start)).toEqual([0, 4]);
  });

  it('merges tied notes: a Tie child starts a tie, across a bar line too', async () => {
    const tied = (pitch: number, start: boolean) =>
      `<Chord><durationType>quarter</durationType><Note>${start ? '<Tie id="1"/>' : '<endSpanner id="1"/>'}<pitch>${pitch}</pitch></Note></Chord>`;
    const song = await parse(one(m2(TS() + chord2('half', [72]) + chord2('quarter', [60]) + tied(62, true)), m2(tied(62, false) + chord2('half', [64]) + chord2('quarter', [62]))));
    expect(song.tracks[0].notes).toEqual([
      { start: 0, dur: 2, midi: 72 }, { start: 2, dur: 1, midi: 60 }, { start: 3, dur: 2, midi: 62 }, { start: 5, dur: 2, midi: 64 }, { start: 7, dur: 1, midi: 62 }]);
  });

  it('marks percussion by the drumset or by the staff type', async () => {
    const xml = mscx('2.06', part({ name: 'Drums', drums: true }) + part({ name: 'Kit', staves: [2], staffType: 'percussion' }) + part({ name: 'Flute', staves: [3] }) +
      staff(1, m2(TS() + chord2('whole', [36]))) + staff(2, m2(TS() + chord2('whole', [38]))) + staff(3, m2(TS() + chord2('whole', [72]))));
    const song = await parse(xml);
    expect(song.tracks.map(t => [t.name, t.percussion, t.channel])).toEqual([['Drums', true, 10], ['Kit', true, 10], ['Flute', false, null]]);
  });

  it('a part with two staves names the staves', async () => {
    const xml = mscx('2.06', part({ name: 'Piano', staves: [1, 2] }) + staff(1, m2(TS() + chord2('whole', [72]))) + staff(2, m2(TS() + chord2('whole', [48]))));
    expect((await parse(xml)).tracks.map(t => [t.id, t.name])).toEqual([['1:1', 'Piano · staff 1'], ['2:1', 'Piano · staff 2']]);
  });

  describe('key', () => {
    const keyed = (sig: string, opts: PartOpts, style = '') => score2(staff(1, m2(sig + TS() + chord2('whole', [72])) + m2(chord2('whole', [72]))), opts, style);
    it('the written signature is shifted by the transposition', async () => {
      expect((await parse(keyed('<KeySig><accidental>4</accidental></KeySig>', { transpose: -2 }))).key).toEqual({ tonicPc: 2, mode: null });
    });
    it('concert pitch style leaves the signature as it is', async () => {
      expect((await parse(keyed('<KeySig><accidental>2</accidental></KeySig>', { transpose: -2 }, '<Style><concertPitch>1</concertPitch></Style>'))).key)
        .toEqual({ tonicPc: 2, mode: null });
    });
    it('no signature on a transposing part is written C', async () => {
      expect((await parse(keyed('', { transpose: -9 }))).key).toEqual({ tonicPc: 3, mode: null });
    });
  });

  describe('voices', () => {
    it('a second voice written as a tick rewind and track 1 gives two tracks', async () => {
      const song = await parse(one(
        m2(TS() + chord2('whole', [72]) + tick(0) + chord2('quarter', [60], '', 1) + chord2('quarter', [62], '', 1) + rest2('half', 1)),
        m2(chord2('whole', [74]) + tick(1920) + chord2('half', [64], '', 1))));
      expect(song.tracks.map(t => [t.id, t.name])).toEqual([['1:1', 'Flute · voice 1'], ['1:2', 'Flute · voice 2']]);
      expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 4, midi: 72 }, { start: 4, dur: 4, midi: 74 }]);
      expect(song.tracks[1].notes).toEqual([{ start: 0, dur: 1, midi: 60 }, { start: 1, dur: 1, midi: 62 }, { start: 4, dur: 2, midi: 64 }]);
    });

    it('track numbers count four per staff: track 5 is voice 2 of staff 2', async () => {
      const xml = mscx('2.06', part({ name: 'Piano', staves: [1, 2] }) +
        staff(1, m2(TS() + chord2('whole', [72], '', 0))) +
        staff(2, m2(TS() + chord2('whole', [48], '', 4) + tick(0) + chord2('whole', [50], '', 5))));
      expect((await parse(xml)).tracks.map(t => [t.name, t.notes[0].midi])).toEqual([
        ['Piano · staff 1', 72], ['Piano · staff 2 · voice 1', 48], ['Piano · staff 2 · voice 2', 50]]);
    });

    it('a voice that ends early does not shift the next measure', async () => {
      const song = await parse(one(
        m2(TS() + chord2('whole', [72]) + tick(0) + chord2('quarter', [60], '', 1)),
        m2(chord2('whole', [74]) + chord2('quarter', [62], '', 1))));
      expect(song.tracks[1].notes).toEqual([{ start: 0, dur: 1, midi: 60 }, { start: 4, dur: 1, midi: 62 }]);
    });

    it('a tick is an absolute position: Division other than 480 scales it', async () => {
      const xml = score2(staff(1, m2(TS() + chord2('whole', [72])), m2(chord2('whole', [74]) + tick(11520) + chord2('quarter', [62], '', 1))), {}, '', '<Division>1920</Division>');
      expect((await parse(xml)).tracks[1].notes).toEqual([{ start: 6, dur: 1, midi: 62 }]);
    });

    it('a missing Division means 480', async () => {
      const xml = score2(staff(1, m2(TS() + chord2('whole', [72]) + tick(960) + chord2('quarter', [62], '', 1))), {}, '', '');
      expect((await parse(xml)).tracks[1].notes).toEqual([{ start: 2, dur: 1, midi: 62 }]);
    });
  });

  describe('tuplets and grace notes', () => {
    const decl = '<Tuplet id="1"><normalNotes>2</normalNotes><actualNotes>3</actualNotes><baseNote>eighth</baseNote></Tuplet>';
    const member = (pitch: number) => `<Chord><Tuplet>1</Tuplet><durationType>eighth</durationType><Note><pitch>${pitch}</pitch></Note></Chord>`;

    it('a triplet by id takes a quarter', async () => {
      const song = await parse(one(m2(TS() + decl + member(60) + member(62) + member(64) + chord2('half', [65], '<dots>1</dots>'))));
      const n = song.tracks[0].notes;
      expect(n).toHaveLength(4);
      [0, 1 / 3, 2 / 3].forEach((s, i) => { expect(n[i].start).toBeCloseTo(s); expect(n[i].dur).toBeCloseTo(1 / 3); });
      expect(n[3].start).toBeCloseTo(1);
    });

    it('a rest inside a tuplet uses the ratio too', async () => {
      const r = '<Rest><Tuplet>1</Tuplet><durationType>eighth</durationType></Rest>';
      const song = await parse(one(m2(TS() + decl + r + member(62) + member(64) + chord2('half', [65]))));
      expect(song.tracks[0].notes[0].start).toBeCloseTo(1 / 3);
    });

    it('a tuplet inside a tuplet multiplies the ratios', async () => {
      const inner = '<Tuplet id="2"><Tuplet>1</Tuplet><normalNotes>2</normalNotes><actualNotes>3</actualNotes><baseNote>eighth</baseNote></Tuplet>';
      const nested = (pitch: number) => `<Chord><Tuplet>2</Tuplet><durationType>eighth</durationType><Note><pitch>${pitch}</pitch></Note></Chord>`;
      const song = await parse(one(m2(TS() + decl + inner + nested(60) + nested(62))));
      expect(song.tracks[0].notes[1].start).toBeCloseTo(0.5 * 4 / 9);
    });

    it('skips acciaccatura, appoggiatura and grace children', async () => {
      const song = await parse(one(m2(TS() + chord2('eighth', [83], '<acciaccatura/>') + chord2('eighth', [84], '<appoggiatura/>') + chord2('16th', [85], '<grace16/>') + chord2('whole', [60]))));
      expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 4, midi: 60 }]);
    });
  });

  it('reads lyrics of verse 1 with hyphens', async () => {
    const song = await parse(one(m2(TS() + chord2('quarter', [60], lyric('won', 'begin')) + rest2('quarter') +
      chord2('half', [62], lyric('der', 'end') + lyric('wan', '', '<no>1</no>')))));
    expect(song.tracks[0].lyrics).toEqual([{ at: 0, text: 'won-' }, { at: 2, text: 'der' }]);
  });

  describe('chord symbols', () => {
    it('reads Gm and C/D from root, name and base directly inside Harmony', async () => {
      const song = await parse(one(m2(TS() + harmony2(15, '<name>m</name>') + chord2('half', [60]) + harmony2(14, '<extension>1</extension><base>16</base>') + chord2('half', [62]))));
      expect(song.tracks[0].chords).toEqual([{ at: 0, text: 'Gm' }, { at: 2, text: 'C/D' }]);
    });

    it('a Harmony after a tick sits at that tick; one without root is skipped', async () => {
      const song = await parse(one(m2(TS() + chord2('whole', [60]) + tick(960) + harmony2(15) + '<Harmony><name>x</name></Harmony>')));
      expect(song.tracks[0].chords).toEqual([{ at: 2, text: 'G' }]);
    });

    it('every pitched track carries the score-wide symbols once; percussion gets none', async () => {
      const xml = mscx('2.06', part({ name: 'Flute' }) + part({ name: 'Drums', staves: [2], drums: true }) +
        staff(1, m2(TS() + harmony2(14) + chord2('half', [72]) + harmony2(15) + chord2('half', [74]) + tick(0) + harmony2(14) + chord2('whole', [60], '', 1))) +
        staff(2, m2(TS() + chord2('whole', [36]))));
      const song = await parse(xml);
      expect(song.tracks.map(t => t.name)).toEqual(['Flute · voice 1', 'Flute · voice 2', 'Drums']);
      for (const t of song.tracks.slice(0, 2)) expect(t.chords).toEqual([{ at: 0, text: 'C' }, { at: 2, text: 'G' }]);
      expect(song.tracks[2].chords).toEqual([]);
    });
  });

  describe('repeats and endings', () => {
    it('reads repeats and endings by Volta id and endSpanner id', async () => {
      const song = await parse(one(
        m2('<startRepeat/>' + TS() + chord2('whole', [60])),
        m2(chord2('whole', [60])),
        m2('<endRepeat>2</endRepeat>' + volta2(1, '1') + chord2('whole', [60])),
        m2(endSpanner(1) + volta2(2, '2') + chord2('whole', [60])),
        m2(endSpanner(2) + chord2('whole', [60]))));
      expect(song.marks).toEqual([{ bar: 0, rs: true }, { bar: 2, re: true, volta: '1' }, { bar: 3, volta: '2' }]);
    });

    it('a longer ending covers every measure up to the one that holds its end', async () => {
      const song = await parse(one(m2(TS() + volta2(2, '2') + chord2('whole', [60])), m2(chord2('whole', [60])), m2(endSpanner(2) + chord2('whole', [60]))));
      expect(song.marks).toEqual([{ bar: 0, volta: '2' }, { bar: 1, volta: '2' }]);
    });

    it('an ending whose end is never found covers its own measure only', async () => {
      const song = await parse(one(m2(TS() + chord2('whole', [60])), m2(volta2(7, '1') + chord2('whole', [60])), m2(chord2('whole', [60]))));
      expect(song.marks).toEqual([{ bar: 1, volta: '1' }]);
    });

    it('ignores other endings and lists; ids do not mix up', async () => {
      const song = await parse(one(m2(TS() + volta2(1, '3') + chord2('whole', [60])), m2(volta2(2, '1, 2') + endSpanner(1) + chord2('whole', [60]))));
      expect(song.marks).toEqual([]);
    });
  });

  it('gives the same tracks, marks, key, pickup and timeSig as the version 3 form of one tune', async () => {
    const v2 = mscx('2.06', '<Division>480</Division>' + part({ transpose: -2 }) + staff(1,
      m2('<startRepeat/>' + '<KeySig><accidental>4</accidental></KeySig>' + TS(3, 4) + harmony2(15, '<name>m</name>') + chord2('quarter', [62], lyric('a', 'begin')) + chord2('eighth', [64]) + chord2('eighth', [65]) +
        tick(0) + chord2('half', [50], '', 1) + chord2('quarter', [52], '', 1), ' len="3/4"'),
      m2('<endRepeat>2</endRepeat>' + volta2(1, '1') + chord2('half', [67], lyric('b', 'end'), 0) + chord2('quarter', [69]), ''),
      m2(endSpanner(1) + volta2(2, '2') + chord2('half', [67], '<dots>1</dots>'))));
    const v3 = mscx('3.02', part({ transpose: -2 }) + staff(1,
      `<Measure len="3/4"><startRepeat/><voice><KeySig><accidental>4</accidental></KeySig>${TS(3, 4)}${harmony3(15, '<name>m</name>')}${chord('quarter', [62], lyric('a', 'begin'))}${chord('eighth', [64])}${chord('eighth', [65])}</voice>` +
        `<voice>${chord('half', [50])}${chord('quarter', [52])}</voice></Measure>`,
      `<Measure><endRepeat>2</endRepeat><voice>${volta('1', 1)}${chord('half', [67], lyric('b', 'end'))}${chord('quarter', [69])}</voice></Measure>`,
      `<Measure><voice>${voltaEnd}${volta('2', 1)}${chord('half', [67], '<dots>1</dots>')}</voice></Measure>`));
    const a = await parse(v2), b = await parse(v3);
    expect(a.tracks).toEqual(b.tracks);
    expect(a.marks).toEqual(b.marks);
    expect([a.key, a.pickup, a.timeSig, a.tempo]).toEqual([b.key, b.pickup, b.timeSig, b.tempo]);
    expect(a.marks).toEqual([{ bar: 0, rs: true }, { bar: 1, re: true, volta: '1' }, { bar: 2, volta: '2' }]);
  });

  it('a chord without durationType is reported as unreadable through parseFile', async () => {
    const xml = one(m2(TS() + '<Chord><Note><pitch>60</pitch></Note></Chord>'));
    const e = await rejection(parseFile(new File([bytes(xml)], 'x.mscx')));
    expect((e as ImportError).userMessage).toBe('"x.mscx" could not be read as a MuseScore file.');
  });
});

describe('chord symbols sit at their own position (versions 3 and 4)', () => {
  const loc = (q: number) => `<location><fractions>${q}/4</fractions></location>`;

  it('a symbol after a negative location with no chord after it keeps that position', async () => {
    const song = await parse(simple(bar('', TS() + chord('half', [60]) + chord('quarter', [62]) + loc(-1) + harmony3(14))));
    expect(song.tracks[0].chords).toEqual([{ at: 2, text: 'C' }]);
  });

  it('a symbol in the middle of a long note lands mid-note and shifts nothing', async () => {
    const song = await parse(simple(bar('', TS() + loc(1) + harmony3(14) + loc(-1) + chord('whole', [60]))));
    expect(song.tracks[0].chords).toEqual([{ at: 1, text: 'C' }]);
    expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 4, midi: 60 }]);
  });

  it('a symbol at the end of a voice with nothing after it is kept at the end', async () => {
    const song = await parse(simple(bar('', TS() + chord('whole', [60]) + harmony3(15))));
    expect(song.tracks[0].chords).toEqual([{ at: 4, text: 'G' }]);
  });

  it('a symbol inside a tuplet sits at the scaled position', async () => {
    const triplet = '<Tuplet><normalNotes>2</normalNotes><actualNotes>3</actualNotes><baseNote>eighth</baseNote></Tuplet>';
    const song = await parse(simple(bar('', TS() + triplet + chord('eighth', [60]) + harmony3(14) + chord('eighth', [62]) + chord('eighth', [64]) + '<endTuplet/>' + chord('half', [65], '<dots>1</dots>'))));
    expect(song.tracks[0].chords).toHaveLength(1);
    expect(song.tracks[0].chords[0].at).toBeCloseTo(1 / 3);
  });

  it('two different symbols at one position are both kept in file order', async () => {
    const song = await parse(simple(bar('', TS() + harmony3(14) + harmony3(15) + chord('whole', [60]))));
    expect(song.tracks[0].chords).toEqual([{ at: 0, text: 'C' }, { at: 0, text: 'G' }]);
  });

  it('removes a repeated symbol of the same position and text across voices, keeping a different text there', async () => {
    const song = await parse(simple(bar('', TS() + harmony3(14) + chord('whole', [72]), harmony3(14) + harmony3(15) + chord('whole', [60]))));
    expect(song.tracks[0].chords).toEqual([{ at: 0, text: 'C' }, { at: 0, text: 'G' }]);
  });
});

describe('edge cases shared by versions 2 and 3', () => {
  const v2 = (...bars: string[]) => mscx('2.06', '<Division>480</Division>' + part() + staff(1, ...bars));

  it('a single syllable is plain text', async () => {
    const a = await parse(simple(bar('', TS() + chord('whole', [60], lyric('la', 'single')))));
    const b = await parse(v2(m2(TS() + c2('whole', 60, lyric('la', 'single')))));
    expect(a.tracks[0].lyrics).toEqual([{ at: 0, text: 'la' }]);
    expect(b.tracks[0].lyrics).toEqual([{ at: 0, text: 'la' }]);
  });

  it('start and end repeat on one measure give both marks', async () => {
    const a = await parse(simple(`<Measure><startRepeat/><endRepeat>2</endRepeat><voice>${TS() + chord('whole', [60])}</voice></Measure>`));
    const b = await parse(v2(m2('<startRepeat/><endRepeat>2</endRepeat>' + TS() + c2('whole', 60))));
    expect(a.marks).toEqual([{ bar: 0, rs: true, re: true }]);
    expect(b.marks).toEqual([{ bar: 0, rs: true, re: true }]);
  });

  it('repeat marks on the second staff only give no marks: the first staff rules', async () => {
    const two = (v: string, s1: string, s2: string) => mscx(v, part({ name: 'Piano', staves: [1, 2] }) + staff(1, s1) + staff(2, s2));
    const a = await parse(two('3.02', bar('', TS() + chord('whole', [72])), `<Measure><startRepeat/><endRepeat>2</endRepeat><voice>${TS() + chord('whole', [48])}</voice></Measure>`));
    const b = await parse(two('2.06', m2(TS() + c2('whole', 72)), m2('<startRepeat/><endRepeat>2</endRepeat>' + TS() + c2('whole', 48))));
    expect(a.marks).toEqual([]);
    expect(b.marks).toEqual([]);
  });

  it('an ending that reaches the end of the score is clamped to the last bar', async () => {
    const a = await parse(simple(bar('', TS() + chord('whole', [60])), bar('', volta('2', 2) + chord('whole', [60]))));
    expect(a.marks).toEqual([{ bar: 1, volta: '2' }]);
    const b = await parse(v2(m2(TS() + c2('whole', 60)), m2('<Volta id="1"><endings>2</endings></Volta>' + c2('whole', 60))));
    expect(b.marks).toEqual([{ bar: 1, volta: '2' }]);
  });

  it('a lyric on a tie continuation stays at its own onset; the merged note keeps its first syllable', async () => {
    const tiedA = '<Chord><durationType>quarter</durationType>' + lyric('a') + '<Note><Spanner type="Tie"><Tie/><next><location><fractions>1/4</fractions></location></next></Spanner><pitch>60</pitch></Note></Chord>';
    const tiedB = '<Chord><durationType>quarter</durationType>' + lyric('b') + '<Note><Spanner type="Tie"><prev><location><fractions>-1/4</fractions></location></prev></Spanner><pitch>60</pitch></Note></Chord>';
    const a = await parse(simple(bar('', TS() + tiedA + tiedB + rest('half'))));
    const t2a = '<Chord><durationType>quarter</durationType>' + lyric('a') + '<Note><Tie id="1"/><pitch>60</pitch></Note></Chord>';
    const t2b = '<Chord><durationType>quarter</durationType>' + lyric('b') + '<Note><endSpanner id="1"/><pitch>60</pitch></Note></Chord>';
    const b = await parse(v2(m2(TS() + t2a + t2b + '<Rest><durationType>half</durationType></Rest>')));
    for (const song of [a, b]) {
      expect(song.tracks[0].notes).toEqual([{ start: 0, dur: 2, midi: 60 }]);
      expect(song.tracks[0].lyrics).toEqual([{ at: 0, text: 'a' }, { at: 1, text: 'b' }]);
    }
  });
});

describe('version 2: fix round 2', () => {
  const one = (...bars: string[]) => mscx('2.06', '<Division>480</Division>' + part() + staff(1, ...bars));
  const volta2 = (id: number, endings: string) => `<Volta id="${id}"><endings>${endings}</endings></Volta>`;
  const end = (id: number) => `<endSpanner id="${id}"/>`;

  it('ignores a negative tick and a tick far past the bar: the voice keeps its position', async () => {
    for (const t of [-480, 48000]) {
      const song = await parse(one(m2(TS() + chord2('whole', [72]) + `<tick>${t}</tick>` + chord2('quarter', [62], '', 1) + chord2('quarter', [64], '', 1))));
      expect(song.tracks[1].notes).toEqual([{ start: 0, dur: 1, midi: 62 }, { start: 1, dur: 1, midi: 64 }]);
    }
  });

  it('a tick before the bar start of a later measure is ignored too', async () => {
    const song = await parse(one(m2(TS() + chord2('whole', [72])), m2(chord2('whole', [74]) + '<tick>480</tick>' + chord2('quarter', [62], '', 1))));
    expect(song.tracks[1].notes).toEqual([{ start: 4, dur: 1, midi: 62 }]);
  });

  it('an end mark after the notes of the last measure ends the ending with that measure', async () => {
    const song = await parse(one(m2(TS() + chord2('whole', [60])), m2(volta2(1, '2') + chord2('whole', [60])), m2(chord2('whole', [60]) + end(1))));
    expect(song.marks).toEqual([{ bar: 1, volta: '2' }, { bar: 2, volta: '2' }]);
  });

  it('an end mark after the notes of its own start measure covers that measure', async () => {
    const song = await parse(one(m2(TS() + volta2(3, '1') + chord2('whole', [60]) + end(3)), m2(chord2('whole', [60]))));
    expect(song.marks).toEqual([{ bar: 0, volta: '1' }]);
  });

  it('an end mark before the notes of a measure ends the ending before it', async () => {
    const song = await parse(one(m2(TS() + volta2(1, '1') + chord2('whole', [60])), m2(chord2('whole', [60])), m2(end(1) + chord2('whole', [60]))));
    expect(song.marks).toEqual([{ bar: 0, volta: '1' }, { bar: 1, volta: '1' }]);
  });

  it('a tie in voice 2 merges within that voice', async () => {
    const tied = (start: boolean) => `<Chord><track>1</track><durationType>quarter</durationType><Note><track>1</track>${start ? '<Tie id="9"/>' : '<endSpanner id="9"/>'}<pitch>60</pitch></Note></Chord>`;
    const song = await parse(one(m2(TS() + chord2('whole', [72]) + '<tick>0</tick>' + tied(true) + tied(false) + chord2('half', [62], '', 1))));
    expect(song.tracks[1].notes).toEqual([{ start: 0, dur: 2, midi: 60 }, { start: 2, dur: 2, midi: 62 }]);
  });

  it('a tuplet id declared again in a later measure uses the later ratio there', async () => {
    const decl = (n: number, a: number) => `<Tuplet id="1"><normalNotes>${n}</normalNotes><actualNotes>${a}</actualNotes><baseNote>16th</baseNote></Tuplet>`;
    const member = (p: number) => `<Chord><Tuplet>1</Tuplet><durationType>16th</durationType><Note><pitch>${p}</pitch></Note></Chord>`;
    const song = await parse(one(
      m2(TS() + decl(2, 3) + member(60) + member(62) + member(64) + chord2('half', [65], '<dots>1</dots>') + chord2('eighth', [66]) + chord2('eighth', [67])),
      m2(decl(4, 5) + member(60) + member(62))));
    const n = song.tracks[0].notes;
    expect(n[n.length - 1].start).toBeCloseTo(4.2);
    expect(n[n.length - 1].dur).toBeCloseTo(0.2);
  });
});

describe('a tuplet ratio that is not positive is ignored (both readers)', () => {
  it.each([['0', '3'], ['-2', '3'], ['2', '0'], ['2', '-3']])('normalNotes %s, actualNotes %s gives ratio 1', async (n, a) => {
    const tup = `<normalNotes>${n}</normalNotes><actualNotes>${a}</actualNotes><baseNote>eighth</baseNote>`;
    const v3 = await parse(simple(bar('', TS() + `<Tuplet>${tup}</Tuplet>` + chord('eighth', [60]) + chord('eighth', [62]) + '<endTuplet/>' + chord('half', [64]))));
    const v2 = await parse(mscx('2.06', part() + staff(1, m2(TS() + `<Tuplet id="1">${tup}</Tuplet>` + chord2('eighth', [60], '<Tuplet>1</Tuplet>') + chord2('eighth', [62], '<Tuplet>1</Tuplet>') + chord2('half', [64])))));
    for (const song of [v3, v2]) expect(song.tracks[0].notes.map(x => [x.start, x.dur])).toEqual([[0, 0.5], [0.5, 0.5], [1, 2]]);
  });
});

describe('version 2: tick and a pickup bar', () => {
  it('a second voice positioned by tick in measure 2 lands in measure 2 after a pickup', async () => {
    const xml = mscx('2.06', '<Division>480</Division>' + part() + staff(1,
      `<Measure len="1/4">${TS()}${chord2('quarter', [60])}</Measure>`,
      `<Measure>${chord2('whole', [72])}<tick>1440</tick>${chord2('quarter', [62], '', 1)}</Measure>`));
    const song = await parse(xml);
    expect(song.pickup).toBe(1);
    expect(song.tracks[1].notes).toEqual([{ start: 3, dur: 1, midi: 62 }]);
  });
});

describe('marks sit on the bar their position falls in (both readers)', () => {
  // Measures: a full bar [0, 4]; len 3/4 with an end repeat [4, 7]; len 1/4 with a start repeat [7, 8]; a full bar with an
  // end repeat [8, 12]; a full bar [12, 16]. The bars lie on a 4/4 grid: bar 1 is [4, 8], bar 2 [8, 12], bar 3 [12, 16].
  // As in MusicXML, an end repeat marks the bar that ends at the measure's end (or contains it), a start repeat the bar
  // that starts at the measure's start (or the next one when the start falls inside a bar): re on bar 1 (ends inside
  // [4, 8]), rs on bar 2 (starts at 7, inside bar 1, so the next bar), re on bar 2 (ends at 12).
  const expected = [{ bar: 1, re: true }, { bar: 2, rs: true, re: true }];

  it('version 3', async () => {
    const song = await parse(simple(
      bar('', TS() + chord('whole', [60])),
      `<Measure len="3/4"><endRepeat>2</endRepeat><voice>${chord('half', [62], '<dots>1</dots>')}</voice></Measure>`,
      `<Measure len="1/4"><startRepeat/><voice>${chord('quarter', [64])}</voice></Measure>`,
      `<Measure><endRepeat>2</endRepeat><voice>${chord('whole', [65])}</voice></Measure>`,
      bar('', chord('whole', [67]))));
    expect(song.marks).toEqual(expected);
  });

  it('version 2', async () => {
    const song = await parse(mscx('2.06', '<Division>480</Division>' + part() + staff(1,
      m2(TS() + c2('whole', 60)),
      m2('<endRepeat>2</endRepeat>' + c2('half', 62, '<dots>1</dots>'), ' len="3/4"'),
      m2('<startRepeat/>' + c2('quarter', 64), ' len="1/4"'),
      m2('<endRepeat>2</endRepeat>' + c2('whole', 65)),
      m2(c2('whole', 67)))));
    expect(song.marks).toEqual(expected);
  });

  it('an ending after a split bar covers the bars its measures fall in', async () => {
    const v3 = await parse(simple(
      bar('', TS() + chord('whole', [60])),
      `<Measure len="3/4"><voice>${chord('half', [62], '<dots>1</dots>')}</voice></Measure>`,
      `<Measure len="1/4"><voice>${chord('quarter', [64])}</voice></Measure>`,
      bar('', volta('1', 1) + chord('whole', [65])),
      bar('', voltaEnd + volta('2', 1) + chord('whole', [67])),
      bar('', voltaEnd + chord('whole', [69]))));
    const volta2 = (id: number, endings: string) => `<Volta id="${id}"><endings>${endings}</endings></Volta>`;
    const v2 = await parse(mscx('2.06', '<Division>480</Division>' + part() + staff(1,
      m2(TS() + c2('whole', 60)),
      m2(c2('half', 62, '<dots>1</dots>'), ' len="3/4"'),
      m2(c2('quarter', 64), ' len="1/4"'),
      m2(volta2(1, '1') + c2('whole', 65)),
      m2('<endSpanner id="1"/>' + volta2(2, '2') + c2('whole', 67)),
      m2('<endSpanner id="2"/>' + c2('whole', 69)))));
    for (const song of [v3, v2]) expect(song.marks).toEqual([{ bar: 2, volta: '1' }, { bar: 3, volta: '2' }]);
  });
});

describe('hardening and limits', () => {
  const v2 = (...bars: string[]) => mscx('2.06', '<Division>480</Division>' + part() + staff(1, ...bars));

  it('a durationType that names an inherited property is unreadable, not NaN (both readers)', async () => {
    for (const xml of [simple(bar('', TS() + chord('constructor', [60]))), v2(m2(TS() + c2('toString', 60)))]) {
      const e = await rejection(parseFile(new File([bytes(xml)], 'x.mscx')));
      expect((e as ImportError).userMessage).toBe('"x.mscx" could not be read as a MuseScore file.');
    }
  });

  it('reads breve, long, 128th and 256th notes', async () => {
    const a = await parse(simple(bar('', TS() + chord('128th', [60]) + chord('256th', [62])), bar('', chord('breve', [64])), bar('', chord('long', [65]))));
    const b = await parse(v2(m2(TS() + c2('128th', 60) + c2('256th', 62)), m2(c2('breve', 64)), m2(c2('long', 65))));
    for (const song of [a, b]) expect(song.tracks[0].notes.map(n => n.dur)).toEqual([1 / 32, 1 / 64, 8, 16]);
  });

  it('a part without a name is Part n, counted among the parts', async () => {
    const unnamed = '<Part><Staff id="2"><StaffType group="pitched"/></Staff><trackName></trackName><Instrument id="x"><trackName> </trackName></Instrument></Part>';
    const xml = mscx('3.02', part({ name: 'Flute' }) + unnamed +
      staff(1, bar('', TS() + chord('whole', [72]))) + staff(2, bar('', TS() + chord('whole', [60]))));
    expect((await parse(xml)).tracks.map(t => t.name)).toEqual(['Flute', 'Part 2']);
  });

  it('refuses a score of more than 4000 measures before reading them', async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => bar('', (i === 0 ? TS() : '') + rest('measure')));
    const e = await rejection(parse(simple(...many(4001)), 'long.mscx'));
    expect((e as ImportError).userMessage).toBe('"long.mscx" is longer than 2000 bars and can\'t be opened.');
    const e2 = await rejection(parse(v2(...Array.from({ length: 4001 }, () => m2(rest2('measure')))), 'long.mscx'));
    expect((e2 as ImportError).userMessage).toBe('"long.mscx" is longer than 2000 bars and can\'t be opened.');
    await expect(parse(simple(...many(4000).slice(0, -1), bar('', chord('whole', [60]))))).resolves.toBeDefined();
  });
});

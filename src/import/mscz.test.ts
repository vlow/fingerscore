import JSZip from 'jszip';
import { vi } from 'vitest';
import { parseFile } from './index';
import { parseMuseScore } from './mscz';
import { ImportError } from './types';

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
const bytes = (s: string) => new TextEncoder().encode(s);
const parse = (xml: string, file = 'x.mscx') => parseMuseScore(file, bytes(xml));
const rejection = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e; }
  throw new Error('did not throw');
};

describe('refusals', () => {
  it('refuses version 1.14', async () => {
    const e = await rejection(parse('<museScore version="1.14"><Score/></museScore>', 'old.mscx'));
    expect(e).toBeInstanceOf(ImportError);
    expect((e as ImportError).userMessage).toBe(
      '"old.mscx" was saved with a MuseScore version fingerscore does not read. Open it in a current MuseScore and save it again, or export MusicXML.');
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
    vi.restoreAllMocks();
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

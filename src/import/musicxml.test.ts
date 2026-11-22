import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { DEFAULT_PREFS } from '../domain/transpose';
import { buildDoc } from './buildDoc';
import { parseMusicXml } from './musicxml';
import { ImportError, type ParsedSong } from './types';

const raw = (name: string) => new Uint8Array(readFileSync(`src/import/fixtures/${name}`));
const load = (name: string) => parseMusicXml(name, raw(name));
const opts = (s: ParsedSong) => ({ trackId: s.tracks[0].id, keep: 'top' as const, lyricsFrom: null, chordsFrom: null, instId: 'asax' as const, prefs: DEFAULT_PREFS });

describe('parseMusicXml', () => {
  it('simple: tracks, pickup, key, lyrics, chords, repeats', async () => {
    const s = await load('simple.musicxml');
    expect(s).toMatchObject({ format: 'MusicXML', timeSig: [4, 4], key: { tonicPc: 0, mode: 'major' }, pickup: 1, tempo: 90 });
    expect(s.tracks).toHaveLength(1);
    expect(s.tracks[0]).toMatchObject({ id: 'P1:1', name: 'Piano' });
    expect(s.tracks[0].lyrics.map(l => l.text)).toEqual(['wat-', 'er']);
    expect(s.tracks[0].lyrics[1].at).toBe(1);
    expect(s.tracks[0].chords).toEqual([{ at: 1, text: 'C' }, { at: 5, text: 'G7' }]);
    expect(s.marks).toEqual(expect.arrayContaining([{ bar: 1, rs: true }, expect.objectContaining({ re: true, volta: '1' }), expect.objectContaining({ volta: '2' })]));
    expect(s.marks).toEqual([{ bar: 1, rs: true }, { bar: 3, re: true, volta: '1' }, { bar: 4, volta: '2' }]);
  });

  it('a tie over the bar line is one note', async () => {
    const s = await load('simple.musicxml');
    const e5 = s.tracks[0].notes.filter(n => n.midi === 76);
    expect(e5).toEqual([{ start: 3, dur: 3, midi: 76 }]);
    expect(s.tracks[0].notes).toHaveLength(8);
  });

  it('two voices → two tracks', async () => {
    const s = await load('two-voices.musicxml');
    expect(s.tracks.map(t => t.id)).toEqual(['P1:1', 'P1:2']);
    expect(s.tracks.map(t => t.name)).toEqual(['Piano', 'Piano · voice 2']);
    expect(s.tracks[1].notes).toEqual([{ start: 0, dur: 4, midi: 60 }]);
    expect(s.tracks[0].notes.map(n => n.start)).toEqual([0, 2]);
  });

  it('3/4 minor with sixteenths becomes a valid sheet', async () => {
    const s = await load('waltz-minor.musicxml');
    expect(s.timeSig).toEqual([3, 4]);
    expect(s.key).toEqual({ tonicPc: 9, mode: 'minor' });
    expect(s.pickup).toBe(0);
    expect(s.tempo).toBe(120);
    const doc = buildDoc(s, opts(s));
    expect(doc.originalMode).toBe('minor');
    expect(doc.score.every(b => b.ev.reduce((a, e) => a + e.d, 0) === b.cap)).toBe(true);
    expect(doc.score.flatMap(b => b.ev).some(e => e.d === 3)).toBe(true);
    expect(doc.source.simplified).toBe(false);
  });

  it('7/8 is refused', async () => {
    await expect(load('seven-eight.musicxml')).rejects.toMatchObject({ userMessage: 'seven-eight.musicxml is in 7/8. fingerscore reads 4/4, 3/4, 2/4 and 6/8 for now.' });
  });

  it('.mxl container', async () => {
    const zip = new JSZip();
    zip.file('META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score/inner.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>');
    zip.file('score/inner.xml', readFileSync('src/import/fixtures/simple.musicxml'));
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const s = await parseMusicXml('simple.mxl', bytes);
    expect(s.tracks).toHaveLength(1);
    expect(s.tracks[0].notes).toHaveLength(8);
  });

  it('broken XML is refused', async () => {
    const run = parseMusicXml('x.musicxml', new TextEncoder().encode('<score'));
    await expect(run).rejects.toBeInstanceOf(ImportError);
    await expect(run).rejects.toMatchObject({ userMessage: '"x.musicxml" could not be read as a MusicXML file.' });
  });

  it('a score-timewise file and a broken zip are refused', async () => {
    const timewise = new TextEncoder().encode('<?xml version="1.0"?><score-timewise version="3.1"/>');
    await expect(parseMusicXml('t.xml', timewise)).rejects.toMatchObject({ userMessage: '"t.xml" could not be read as a MusicXML file.' });
    await expect(parseMusicXml('z.mxl', new Uint8Array([0x50, 0x4b, 1, 2, 3]))).rejects.toBeInstanceOf(ImportError);
  });
});

import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { DEFAULT_PREFS } from '../domain/transpose';
import { buildDoc } from './buildDoc';
import { parseMusicXml } from './musicxml';
import { ImportError, type ParsedSong } from './types';

const raw = (name: string) => new Uint8Array(readFileSync(`src/import/fixtures/${name}`));
const load = (name: string) => parseMusicXml(name, raw(name));
const opts = (s: ParsedSong) => ({ trackId: s.tracks[0].id, keep: 'top' as const, lyricsFrom: null, chordsFrom: null, instId: 'asax' as const, prefs: DEFAULT_PREFS });

const xmlRaw = (measures: string) => new TextEncoder().encode(
  `<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`);
const xml = (measureContent: string) => xmlRaw(`<measure number="1">${measureContent}</measure>`);
const n = (step: string, octave: number, duration: number) =>
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>1</voice></note>`;

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

  it('walks chord notes, forward, grace notes, rests and divisions changes across two parts', async () => {
    const s = await load('multi.musicxml');
    expect(s.tracks.map(t => t.id)).toEqual(['P1:1', 'P2:1']);
    expect(s.tracks[0].notes).toEqual([
      { start: 0, dur: 1, midi: 72 }, { start: 0, dur: 1, midi: 76 }, { start: 2, dur: 0.5, midi: 77 }, { start: 4, dur: 2, midi: 81 },
    ]);
    expect(s.tracks[1].notes).toEqual([{ start: 0, dur: 4, midi: 60 }, { start: 4, dur: 2, midi: 62 }]);
  });

  it('a transposing part is stored at concert pitch', async () => {
    const s = await load('multi.musicxml');
    expect(s.tracks[1].notes[0].midi).toBe(60);   // B-flat clarinet, written D4
    const octave = await parseMusicXml('o.xml', xml('<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><transpose><chromatic>0</chromatic><octave-change>-1</octave-change></transpose></attributes>' + n('C', 5, 4)));
    expect(octave.tracks[0].notes[0].midi).toBe(60);
  });

  it('reads triplets at their sounding length, a tempo from <sound>, and buildDoc reports simplified', async () => {
    const s = await load('triplet.musicxml');
    expect(s.tempo).toBe(100);
    expect(s.tracks[0].notes.map(x => x.start)).toEqual([0, 1 / 3, 2 / 3, 1]);
    expect(s.tracks[0].notes.slice(0, 3).every(x => Math.abs(x.dur - 1 / 3) < 1e-9)).toBe(true);
    const doc = buildDoc(s, opts(s));
    expect(doc.source.simplified).toBe(true);
    expect(doc.tempo).toBe(100);
    expect(doc.score.every(b => b.ev.reduce((a, e) => a + e.d, 0) === b.cap)).toBe(true);
  });

  it('reads harmony with alter, bass, offset and a kind text fallback, and skips rootless harmonies', async () => {
    const s = await load('harmony.musicxml');
    expect(s.tracks[0].chords).toEqual([{ at: 0, text: 'B♭/D' }, { at: 3, text: 'Csus2' }, { at: 4, text: 'F♯m' }]);
  });

  it('a tie written only as <tied> merges', async () => {
    const note = (type: string) => `<note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><notations><tied type="${type}"/></notations></note>`;
    const s = await parseMusicXml('t.xml', xml(`<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${note('start')}${note('stop')}`));
    expect(s.tracks[0].notes).toEqual([{ start: 0, dur: 4, midi: 72 }]);
  });

  const head = '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';
  const cue = (step: string, duration: number, chord = false) =>
    `<note><cue/>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>5</octave></pitch><duration>${duration}</duration></note>`;

  it('a cue note is not played but takes time like a rest', async () => {
    const s = await parseMusicXml('c.xml', xml(`${head}${cue('D', 1)}${n('C', 5, 3)}`));
    expect(s.tracks[0].notes).toEqual([{ start: 1, dur: 3, midi: 72 }]);
  });

  it('a cue note with <chord/> adds no time', async () => {
    const s = await parseMusicXml('c.xml', xml(`${head}${n('C', 5, 1)}${cue('D', 1, true)}${n('E', 5, 2)}`));
    expect(s.tracks[0].notes).toEqual([{ start: 0, dur: 1, midi: 72 }, { start: 1, dur: 2, midi: 76 }]);
  });

  it('a note after a rest starts after it', async () => {
    const s = await parseMusicXml('r.xml', xml(`${head}<note><rest/><duration>2</duration><voice>1</voice></note>${n('C', 5, 2)}`));
    expect(s.tracks[0].notes).toEqual([{ start: 2, dur: 2, midi: 72 }]);
  });

  it('reads ending numbers as lists; only plain 1 and 2 become voltas', async () => {
    const ending = (num: string, bar: number) =>
      `<measure number="${bar}"><barline location="left"><ending number="${num}" type="start"/></barline>${n('C', 5, 4)}<barline location="right"><ending number="${num}" type="stop"/></barline></measure>`;
    const attrs = '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';
    const body = (nums: string[]) => `<measure number="1">${attrs}${n('C', 5, 4)}</measure>` + nums.map((x, i) => ending(x, i + 2)).join('');
    const s = await parseMusicXml('v.xml', xmlRaw(body(['1', '2', '1,2', '1-2', '3'])));
    expect(s.marks).toEqual([{ bar: 1, volta: '1' }, { bar: 2, volta: '2' }]);
  });

  it('skips a harmony without a root', async () => {
    const s = await parseMusicXml('h.xml', xml(`<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><harmony><function>V</function></harmony>${n('C', 5, 4)}`));
    expect(s.tracks[0].chords).toEqual([]);
  });

  it('a transposing part gives concert key, chords and notes', async () => {
    const attrs = '<attributes><divisions>1</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose></attributes>';
    const s = await parseMusicXml('cl.xml', xml(`${attrs}<harmony><root><root-step>D</root-step></root><kind>major</kind><bass><bass-step>F</bass-step><bass-alter>1</bass-alter></bass></harmony><note><pitch><step>D</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>`));
    expect(s.key).toEqual({ tonicPc: 0, mode: null });
    expect(s.tracks[0].chords).toEqual([{ at: 0, text: 'C/E' }]);
    expect(s.tracks[0].notes[0].midi).toBe(60);
  });

  it('the key comes from a non-transposing part, or else the converted first key', async () => {
    const part = (id: string, fifths: number, tr: string) => `<part id="${id}"><measure number="1"><attributes><divisions>1</divisions><key><fifths>${fifths}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>${tr}</attributes>${n('C', 5, 4)}</measure></part>`;
    const list = '<part-list><score-part id="P1"><part-name>A</part-name></score-part><score-part id="P2"><part-name>B</part-name></score-part></part-list>';
    const file = (a: string, b: string) => new TextEncoder().encode(`<?xml version="1.0"?><score-partwise version="3.1">${list}${a}${b}</score-partwise>`);
    const clar = '<transpose><chromatic>-2</chromatic></transpose>';
    const flute = await parseMusicXml('f.xml', file(part('P1', 0, ''), part('P2', 2, clar)));
    expect(flute.key).toEqual({ tonicPc: 0, mode: null });
    const clarFirst = await parseMusicXml('g.xml', file(part('P1', 2, clar), part('P2', 0, '')));
    expect(clarFirst.key).toEqual({ tonicPc: 0, mode: null });
    const both = await parseMusicXml('h.xml', file(part('P1', 2, clar), part('P2', 2, clar)));
    expect(both.key).toEqual({ tonicPc: 0, mode: null });
  });

  it('a measure split by a mid-bar repeat stays on the bar grid', async () => {
    // pickup G | C D E F | G A B :|| (implicit) C ||: D E F G | A B C — the repeat falls on beat 4 of bar 2
    const m = (no: number, body: string, implicit = false) => `<measure number="${no}"${implicit ? ' implicit="yes"' : ''}>${body}</measure>`;
    const attrs = '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';
    const fwd = '<barline location="left"><repeat direction="forward"/></barline>';
    const back = '<barline location="right"><repeat direction="backward"/></barline>';
    const q = (step: string) => n(step, 5, 1);
    const s = await parseMusicXml('split.xml', xmlRaw(
      m(0, attrs + q('G'), true) + m(1, q('C') + q('D') + q('E') + q('F')) + m(2, q('G') + q('A') + q('B') + back)
      + m(3, fwd + q('C'), true) + m(4, q('D') + q('E') + q('F') + q('G')) + m(5, q('A') + q('B') + q('C') + back)));
    expect(s.pickup).toBe(1);
    expect(s.tracks[0].notes.map(x => x.start)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    // bars: 0 = pickup, 1 = [1,5), 2 = [5,9), 3 = [9,13), 4 = [13,17)
    expect(s.marks).toEqual([{ bar: 2, re: true }, { bar: 3, rs: true }, { bar: 4, re: true }]);
    const doc = buildDoc(s, opts(s));
    expect(doc.score).toHaveLength(5);
    expect(doc.score.slice(0, 4).every(b => b.ev.every(e => !e.r))).toBe(true);
  });

  it('an ordinary under-full measure keeps the bar grid', async () => {
    const attrs = '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';
    const s = await parseMusicXml('u.xml', xmlRaw(
      `<measure number="1">${attrs}${n('C', 5, 4)}</measure><measure number="2">${n('D', 5, 3)}</measure><measure number="3">${n('E', 5, 4)}</measure>`));
    expect(s.tracks[0].notes.map(x => x.start)).toEqual([0, 4, 8]);
  });

  describe('a key without <mode>', () => {
    const song = (mode: string, notes: string) => parseMusicXml('k.xml', xmlRaw(
      `<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths>${mode}</key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${notes}</measure>`));
    const aMinor = n('A', 4, 1) + n('C', 5, 1) + n('E', 5, 1) + n('A', 4, 1) + '</measure><measure number="2">' + n('G', 4, 1) + n('B', 4, 1) + n('E', 4, 1) + n('A', 4, 1);
    const cMajor = n('C', 5, 1) + n('E', 5, 1) + n('G', 5, 1) + n('C', 5, 1) + '</measure><measure number="2">' + n('D', 5, 1) + n('G', 4, 1) + n('B', 4, 1) + n('C', 5, 1);

    it('is estimated as A minor for an A-minor melody', async () => {
      const s = await song('', aMinor);
      expect(s.key).toEqual({ tonicPc: 0, mode: null });
      const doc = buildDoc(s, opts(s));
      expect([doc.originalTonicPc, doc.originalMode]).toEqual([9, 'minor']);
    });

    it('is estimated as C major for a C-major melody', async () => {
      const s = await song('', cMajor);
      const doc = buildDoc(s, opts(s));
      expect([doc.originalTonicPc, doc.originalMode]).toEqual([0, 'major']);
    });

    it('an explicit <mode> is honoured', async () => {
      const s = await song('<mode>major</mode>', aMinor);
      expect(s.key).toEqual({ tonicPc: 0, mode: 'major' });
      const doc = buildDoc(s, opts(s));
      expect([doc.originalTonicPc, doc.originalMode]).toEqual([0, 'major']);
    });
  });
});

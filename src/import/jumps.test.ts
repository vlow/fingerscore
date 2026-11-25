import { DEFAULT_PREFS } from '../domain/transpose';
import type { Jump } from '../domain/types';
import { parseAbc } from './abc';
import { buildDoc } from './buildDoc';
import { parseMuseScore } from './mscz';
import { parseMusicXml } from './musicxml';
import type { ParsedSong } from './types';

const enc = (s: string) => new TextEncoder().encode(s);
const build = (song: ParsedSong, trackId = song.tracks[0].id) =>
  buildDoc(song, { trackId, keep: 'top', lyricsFrom: null, chordsFrom: null, instId: 'asax', prefs: DEFAULT_PREFS });
type Mark = ParsedSong['marks'][number];
/** The marks that are jump marks, without repeat marks. */
const jumpMarksOf = (song: ParsedSong): Mark[] => song.marks.filter(m => m.segno || m.coda || m.fine || m.toCoda || m.jump);

const SIX: [Jump, string, string, string][] = [
  ['dc', 'start', 'end', ''],
  ['dcFine', 'start', 'fine', ''],
  ['dcCoda', 'start', 'coda', 'codab'],
  ['ds', 'segno', 'end', ''],
  ['dsFine', 'segno', 'fine', ''],
  ['dsCoda', 'segno', 'coda', 'codab'],
];

// ---- MuseScore ----

const NOTES = (n: number) => ['quarter', 'quarter', 'quarter', 'quarter'].map((t, i) => `<Chord><durationType>${t}</durationType><Note><pitch>${n + i}</pitch></Note></Chord>`).join('');
const marker = (label: string, version: string) =>
  `<Marker>${version.startsWith('4') ? '<eid>A_B</eid><markerType>segno</markerType>' : ''}<style>Repeat</style><label>${label}</label></Marker>`;
const jump = (to: string, until: string, cont: string, version: string, text = '') =>
  `<Jump>${version.startsWith('4') ? '<eid>C_D</eid>' : ''}${version.startsWith('2') ? '<playRepeats>1</playRepeats>' : ''}` +
  `${text ? `<text>${text}</text>` : ''}<jumpTo>${to}</jumpTo><playUntil>${until}</playUntil><continueAt>${cont}</continueAt></Jump>`;
/** Version 2 lists the chords in the measure; versions 3 and 4 wrap them in a voice, and the marks stand beside it. */
const measure = (version: string, base: number, extra = '') => version.startsWith('2')
  ? `<Measure>${NOTES(base)}${extra}</Measure>`
  : `<Measure><voice>${NOTES(base)}</voice>${extra}</Measure>`;
const score = (version: string, ...measures: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><museScore version="${version}"><Score>` +
  `<Part><Staff id="1"><StaffType group="pitched"/></Staff><trackName>Flute</trackName><Instrument id="x"><longName>Flute</longName><trackName>Flute</trackName></Instrument></Part>` +
  `<Staff id="1">${measures.join('')}</Staff></Score></museScore>`;
const scale = (version: string, extras: string[]) => score(version, ...extras.map((e, i) => measure(version, 60 + i, e)));

describe.each(['2.06', '3.02', '4.70'])('MuseScore %s', version => {
  const parse = (extras: string[]) => parseMuseScore('x.mscx', enc(scale(version, extras)));

  it('reads the four markers by their label, the text is not used', async () => {
    const s = await parse([marker('segno', version), marker('codab', version), marker('coda', version), marker('fine', version)]);
    expect(jumpMarksOf(s)).toEqual([{ bar: 0, segno: true }, { bar: 1, coda: true }, { bar: 2, toCoda: true }, { bar: 3, fine: true }]);
    expect(s.dropped).toEqual([]);
  });

  it.each(SIX)('reads the jump %s', async (form, to, until, cont) => {
    const s = await parse(['', jump(to, until, cont, version), '']);
    expect(jumpMarksOf(s)).toEqual([{ bar: 1, jump: form }]);
    expect(s.dropped).toEqual([]);
  });

  it('a jump with another triple sets nothing and is named once', async () => {
    const s = await parse(['', '', jump('segno2', 'end', '', version, 'D.S.S.')]);
    expect(jumpMarksOf(s)).toEqual([]);
    expect(s.dropped).toEqual(['D.S.S. in bar 3 is not supported and was left out.']);
    const plain = await parse(['', jump('start', 'coda', '', version)]);
    expect(plain.dropped).toEqual(['A jump in bar 2 is not supported and was left out.']);
  });

  it('a second sign of a kind is dropped with its printed bar number', async () => {
    const s = await parse([marker('segno', version), '', marker('segno', version), jump('start', 'end', '', version) + jump('segno', 'end', '', version)]);
    expect(jumpMarksOf(s)).toEqual([{ bar: 0, segno: true }, { bar: 3, jump: 'dc' }]);
    expect(s.dropped).toEqual(['A second Segno in bar 3 was left out.', 'A second jump in bar 4 was left out.']);
  });

  it('keeps the marks with the repeat marks of the same bar', async () => {
    const withRepeat = scale(version, ['', marker('fine', version)]).replace('<Measure>', '<Measure><endRepeat>2</endRepeat>');
    const s = await parseMuseScore('x.mscx', enc(withRepeat));
    expect(s.marks).toEqual([{ bar: 0, re: true }, { bar: 1, fine: true }]);
  });
});

// ---- MusicXML ----

const q = (step: string, octave = 4) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>1</duration><voice>1</voice></note>`;
const FOUR = ['C', 'D', 'E', 'F'].map(s => q(s)).join('');
const ATTRS = '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>';
const dir = (inner: string) => `<direction><direction-type>${inner}</direction-type></direction>`;
const xmlMeasure = (n: number, before = '', after = '', notes = FOUR) => `<measure number="${n}">${n === 1 ? ATTRS : ''}${before}${notes}${after}</measure>`;
const xmlScore = (...parts: string[][]) =>
  `<?xml version="1.0"?><score-partwise version="3.1"><part-list>${parts.map((_, i) => `<score-part id="P${i + 1}"><part-name>Part ${i + 1}</part-name></score-part>`).join('')}</part-list>` +
  `${parts.map((ms, i) => `<part id="P${i + 1}">${ms.join('')}</part>`).join('')}</score-partwise>`;
/** Four measures; `at[i]` is [before the notes, after the notes] of measure i + 1. */
const fourBars = (at: Record<number, [string, string]> = {}) =>
  [1, 2, 3, 4].map(n => xmlMeasure(n, at[n]?.[0] ?? '', at[n]?.[1] ?? ''));
const xml = (measures: string[]) => parseMusicXml('x.musicxml', enc(xmlScore(measures)));

describe('MusicXML', () => {
  it('reads sound inside a direction and directly in a measure', async () => {
    const s = await xml(fourBars({
      2: ['', `<direction><direction-type><words>Fine</words></direction-type><sound fine="yes"/></direction>`],
      3: ['', '<sound tocoda="coda1"/>'],
    }));
    expect(jumpMarksOf(s)).toEqual([{ bar: 1, fine: true }, { bar: 2, toCoda: true }]);
    expect(s.dropped).toEqual([]);
  });

  it('reads sound attributes without words', async () => {
    const s = await xml(fourBars({ 1: ['<sound segno="s1"/>', ''], 2: ['<sound coda="c1"/>', ''], 3: ['', '<sound fine="yes"/>'], 4: ['', '<sound tocoda="c1"/>'] }));
    expect(jumpMarksOf(s)).toEqual([{ bar: 0, segno: true }, { bar: 1, coda: true }, { bar: 2, fine: true }, { bar: 3, toCoda: true }]);
  });

  it('reads the segno and coda elements of a direction and of a barline', async () => {
    const s = await xml(fourBars({
      2: [dir('<segno/>'), ''],
      3: [dir('<coda/>'), ''],
    }));
    expect(jumpMarksOf(s)).toEqual([{ bar: 1, segno: true }, { bar: 2, coda: true }]);
    const b = await xml(fourBars({
      2: ['<barline location="left"><segno/></barline>', ''],
      3: ['', '<barline location="right"><coda/></barline>'],
    }));
    expect(jumpMarksOf(b)).toEqual([{ bar: 1, segno: true }, { bar: 3, coda: true }]);
  });

  it('merges the sound and the element of one sign into one mark', async () => {
    const s = await xml(fourBars({ 2: [`<direction><direction-type><segno/></direction-type><sound segno="s1"/></direction>`, ''] }));
    expect(jumpMarksOf(s)).toEqual([{ bar: 1, segno: true }]);
    expect(s.dropped).toEqual([]);
  });

  it('the words decide the jump', async () => {
    const words = (w: string, attr: string) => dir(`<words>${w}</words>`) + `<sound ${attr}/>`;
    const jumpOf = async (w: string, attr: string) => jumpMarksOf(await xml(fourBars({ 4: ['', words(w, attr)] })));
    expect(await jumpOf('D.S. al Coda', 'dalsegno="s1"')).toEqual([{ bar: 3, jump: 'dsCoda' }]);
    expect(await jumpOf('D.S. al Fine', 'dalsegno="s1"')).toEqual([{ bar: 3, jump: 'dsFine' }]);
    expect(await jumpOf('D.S.', 'dalsegno="s1"')).toEqual([{ bar: 3, jump: 'ds' }]);
    expect(await jumpOf('D.C. al Coda', 'dacapo="yes"')).toEqual([{ bar: 3, jump: 'dcCoda' }]);
    expect(await jumpOf('D.C. al Fine', 'dacapo="yes"')).toEqual([{ bar: 3, jump: 'dcFine' }]);
    expect(await jumpOf('Da Capo', 'dacapo="yes"')).toEqual([{ bar: 3, jump: 'dc' }]);
  });

  it('words alone are read: Fine, To Coda and the jumps', async () => {
    const s = await xml(fourBars({ 1: ['', dir('<words>To Coda</words>')], 2: ['', dir('<words>Fine</words>')], 4: ['', dir('<words>D.S. al Coda</words>')] }));
    expect(jumpMarksOf(s)).toEqual([{ bar: 0, toCoda: true }, { bar: 1, fine: true }, { bar: 3, jump: 'dsCoda' }]);
  });

  it('a jump without words is told by the Fine or To Coda of the file', async () => {
    const at = (extra: Record<number, [string, string]>) => fourBars({ 4: ['', '<sound dalsegno="s1"/>'], ...extra });
    expect(jumpMarksOf(await xml(at({ 2: ['', '<sound tocoda="c1"/>'] })))[1]).toEqual({ bar: 3, jump: 'dsCoda' });
    expect(jumpMarksOf(await xml(at({ 2: ['', '<sound fine="yes"/>'] })))[1]).toEqual({ bar: 3, jump: 'dsFine' });
    expect(jumpMarksOf(await xml(at({})))).toEqual([{ bar: 3, jump: 'ds' }]);
    const dc = fourBars({ 3: ['', '<sound fine="yes"/>'], 4: ['', '<sound dacapo="yes"/>'] });
    expect(jumpMarksOf(await xml(dc))[1]).toEqual({ bar: 3, jump: 'dcFine' });
  });

  it('a mark in the middle of a bar goes to its edge', async () => {
    const half = (inner: string) => `<measure number="2">${q('C')}${q('D')}${inner}${q('E')}${q('F')}</measure>`;
    const s = await xml([xmlMeasure(1), half(dir('<segno/>')), xmlMeasure(3), xmlMeasure(4)]);
    expect(jumpMarksOf(s)).toEqual([{ bar: 1, segno: true }]);
    const t = await xml([xmlMeasure(1), half(dir('<words>D.C. al Fine</words>') + '<sound dacapo="yes"/>'), xmlMeasure(3), xmlMeasure(4)]);
    expect(jumpMarksOf(t)).toEqual([{ bar: 1, jump: 'dcFine' }]);
    const u = await xml([xmlMeasure(1), half(dir('<coda/>')), xmlMeasure(3), xmlMeasure(4)]);
    expect(jumpMarksOf(u)).toEqual([{ bar: 1, coda: true }]);
  });

  it('marks in part 1 only: the marks are the same when part 2 is played', async () => {
    const part1 = fourBars({ 1: [dir('<segno/>'), ''], 3: ['', dir('<words>Fine</words>')], 4: ['', dir('<words>D.S. al Fine</words>')] });
    const part2 = fourBars();
    const s = await parseMusicXml('x.musicxml', enc(xmlScore(part1, part2)));
    expect(jumpMarksOf(s)).toEqual([{ bar: 0, segno: true }, { bar: 2, fine: true }, { bar: 3, jump: 'dsFine' }]);
    const doc = build(s, s.tracks[1].id);
    expect(doc.source.track).toBe('Part 2');
    expect(doc.score.map(b => [b.segno, b.fine, b.jump])).toEqual([
      [true, undefined, undefined], [undefined, undefined, undefined], [undefined, true, undefined], [undefined, undefined, 'dsFine'],
    ]);
  });

  it('the same sign in two parts is one sign', async () => {
    const part = fourBars({ 1: [dir('<segno/>'), ''] });
    const s = await parseMusicXml('x.musicxml', enc(xmlScore(part, part)));
    expect(jumpMarksOf(s)).toEqual([{ bar: 0, segno: true }]);
    expect(s.dropped).toEqual([]);
  });

  it('drops a second sign of a kind and a jump outside the six', async () => {
    const s = await xml(fourBars({
      1: [dir('<segno/>'), ''], 3: [dir('<segno/>'), ''],
      4: ['', dir('<words>D.S.S. al Coda</words>') + '<sound dalsegno="s1"/>'],
    }));
    expect(jumpMarksOf(s)).toEqual([{ bar: 0, segno: true }]);
    expect(s.dropped).toEqual(['A second Segno in bar 3 was left out.', 'D.S.S. al Coda in bar 4 is not supported and was left out.']);
  });

  it('counts a pickup bar as bar 0 in the sentences', async () => {
    const pick = `<measure number="0">${ATTRS}${q('C')}</measure>`;
    const s = await xml([pick, xmlMeasure(2, dir('<segno/>')), xmlMeasure(3, dir('<segno/>'))]);
    expect(s.pickup).toBe(1);
    expect(s.dropped).toEqual(['A second Segno in bar 2 was left out.']);
  });
});

// ---- ABC ----

const abc = (body: string) => parseAbc('t.abc', enc(`X:1\nM:4/4\nL:1/4\nK:C\n${body}\n`));

describe('ABC', () => {
  it.each<[string, Partial<Mark>]>([
    ['segno', { segno: true }], ['coda', { coda: true }], ['fine', { fine: true }], ['dacoda', { toCoda: true }],
    ['D.C.', { jump: 'dc' }], ['dacapo', { jump: 'dc' }], ['D.C.alfine', { jump: 'dcFine' }], ['D.C.alcoda', { jump: 'dcCoda' }],
    ['D.S.', { jump: 'ds' }], ['D.S.alfine', { jump: 'dsFine' }], ['D.S.alcoda', { jump: 'dsCoda' }],
  ])('reads !%s! on a note: the bar of the note', async (name, expected) => {
    const s = await abc(`CDEF|!${name}!GABc|cBAG|`);
    expect(jumpMarksOf(s)).toEqual([{ bar: 1, ...expected }]);
    expect(s.dropped).toEqual([]);
  });

  it('a decoration on a bar line: Segno and Coda to the next bar, the others to the bar before', async () => {
    const s = await abc('CDEF !segno!|GABc !fine!|cBAG !coda!|cdef !D.S.alcoda!|cBAG !dacoda!|c4|');
    expect(jumpMarksOf(s)).toEqual([
      { bar: 1, segno: true, fine: true },
      { bar: 3, coda: true, jump: 'dsCoda' },
      { bar: 4, toCoda: true },
    ]);
  });

  it('quoted text is not read', async () => {
    const s = await abc('CDEF|"^D.S. al Coda"GABc|"Fine"cBAG|');
    expect(jumpMarksOf(s)).toEqual([]);
    expect(s.dropped).toEqual([]);
  });

  it('keeps each mark on its music when a pickup inside the tune is realigned', async () => {
    // "de" is a short bar inside the tune: its content moves right and the music after it moves one bar on
    const s = await abc('CDEF|GABc|de|!segno!fgab|c4 !fine!|');
    expect(jumpMarksOf(s)).toEqual([{ bar: 3, segno: true }, { bar: 4, fine: true }]);
  });

  it('drops a second sign of a kind with the printed bar number', async () => {
    const s = await abc('!segno!CDEF|!segno!GABc|!D.C.!cBAG|!D.S.!c4|');
    expect(jumpMarksOf(s)).toEqual([{ bar: 0, segno: true }, { bar: 2, jump: 'dc' }]);
    expect(s.dropped).toEqual(['A second Segno in bar 2 was left out.', 'A second jump in bar 4 was left out.']);
  });
});

// ---- from the parsed song to the sheet ----

describe('buildDoc', () => {
  it('puts the marks on the bars of the sheet and the sentences into the source', async () => {
    const s = await abc('!segno!CDEF|!coda!GABc|!fine!cBAG|!D.S.alcoda!c4|');
    const doc = build(s);
    expect(doc.score.map(b => [b.segno, b.coda, b.fine, b.toCoda, b.jump])).toEqual([
      [true, undefined, undefined, undefined, undefined],
      [undefined, true, undefined, undefined, undefined],
      [undefined, undefined, true, undefined, undefined],
      [undefined, undefined, undefined, undefined, 'dsCoda'],
    ]);
    expect(doc.source.dropped).toBeUndefined();
    const second = build(await abc('!segno!CDEF|!segno!GABc|c4|'));
    expect(second.source.dropped).toEqual(['A second Segno in bar 2 was left out.']);
  });

  it('a bar without a mark has no mark fields at all', async () => {
    const doc = build(await abc('CDEF|!fine!GABc|'));
    expect(Object.keys(doc.score[0]).sort()).toEqual(['cap', 'ev', 're', 'rs', 'volta']);
    expect(Object.keys(doc.score[1]).sort()).toEqual(['cap', 'ev', 'fine', 're', 'rs', 'volta']);
  });

  it('a mark behind the last note is dropped with a sentence', async () => {
    const s = await xml(fourBars({ 4: ['', '<barline location="right"><segno/></barline>'] }));
    const doc = build(s);
    expect(doc.score).toHaveLength(4);
    expect(doc.source.dropped).toEqual(['Segno in bar 5 was left out.']);
    const shortTrack = await parseMusicXml('x.musicxml', enc(xmlScore(fourBars({ 4: ['', dir('<words>Fine</words>')] }), [xmlMeasure(1), xmlMeasure(2)])));
    const two = build(shortTrack, shortTrack.tracks[1].id);
    expect(two.source.dropped).toEqual(['Fine in bar 4 was left out.']);
  });

  it('keeps the sentences of the importer before those of the sheet', async () => {
    const s = await xml(fourBars({ 1: [dir('<segno/>'), ''], 2: [dir('<segno/>'), ''], 4: ['', '<barline location="right"><coda/></barline>'] }));
    expect(build(s).source.dropped).toEqual(['A second Segno in bar 2 was left out.', 'Coda in bar 5 was left out.']);
  });
});

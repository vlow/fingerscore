import { derive } from '../domain/derive';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { bare, withC6, withChords, withEndings, withLyrics, withMarks } from '../test/bandSheets';
import { BAND_HEIGHT, MIN_HEADROOM, SHEET } from './layout';
import { layoutSheet, type BandForce } from './sheetLayout';

const layoutOf = (doc: Doc, force?: BandForce) => layoutSheet(doc, derive(doc, DEFAULT_PREFS), force);
const bandsOf = (doc: Doc, force?: BandForce) => layoutOf(doc, force).stack.bands;
const noMarks = (doc: Doc) => doc;

describe('the heights of the bands, from the lanes of the old layout', () => {
  it('chords 22, lyrics 24, endings 14, headroom 15, marks 30: together 75 above the staff without marks', () => {
    expect(BAND_HEIGHT).toEqual({ marks: 30, chords: 22, lyrics: 24, endings: 14 });
    expect(MIN_HEADROOM).toBe(15);
    expect(BAND_HEIGHT.chords + BAND_HEIGHT.lyrics + BAND_HEIGHT.endings + MIN_HEADROOM).toBe(SHEET.staffTop);
  });
});

describe('which bands a sheet stacks', () => {
  const all = (): Doc => withEndings(withChords(withLyrics(bare())));
  const cases: [string, () => Doc, BandForce | undefined, { marks: number; chords: number; lyrics: number; endings: number }][] = [
    ['a bare sheet', bare, undefined, { marks: 0, chords: 0, lyrics: 0, endings: 0 }],
    ['a chord symbol', () => withChords(bare()), undefined, { marks: 0, chords: 22, lyrics: 0, endings: 0 }],
    ['a lyric', () => withLyrics(bare()), undefined, { marks: 0, chords: 0, lyrics: 24, endings: 0 }],
    ['an ending', () => withEndings(bare()), undefined, { marks: 0, chords: 0, lyrics: 0, endings: 14 }],
    ['a jump mark', () => withMarks(bare()), undefined, { marks: 30, chords: 0, lyrics: 0, endings: 0 }],
    ['everything', () => withMarks(all()), undefined, { marks: 30, chords: 22, lyrics: 24, endings: 14 }],
    ['chord symbols with their Show switch off', () => { const d = withChords(bare()); d.show.chords = false; return d; }, undefined, { marks: 0, chords: 0, lyrics: 0, endings: 0 }],
    ['lyrics with their Show switch off', () => { const d = withLyrics(bare()); d.show.lyrics = false; return d; }, undefined, { marks: 0, chords: 0, lyrics: 0, endings: 0 }],
    ['Lyrics mode on a bare sheet', bare, { lyrics: true }, { marks: 0, chords: 0, lyrics: 24, endings: 0 }],
    ['Chords mode on a bare sheet', bare, { chords: true }, { marks: 0, chords: 22, lyrics: 0, endings: 0 }],
    ['Lyrics mode, lyrics present and their switch off', () => { const d = withLyrics(bare()); d.show.lyrics = false; return d; }, { lyrics: true }, { marks: 0, chords: 0, lyrics: 24, endings: 0 }],
    ['Lyrics mode, switch on, no lyric', () => noMarks(bare()), { lyrics: true, chords: false }, { marks: 0, chords: 0, lyrics: 24, endings: 0 }],
    ['both modes off', bare, { lyrics: false, chords: false }, { marks: 0, chords: 0, lyrics: 0, endings: 0 }],
  ];
  it.each(cases)('%s', (_, make, force, want) => {
    const { headroom, ...heights } = bandsOf(make(), force);
    expect(heights).toEqual(want);
    expect(headroom).toBe(MIN_HEADROOM);
  });

  it('a lyric on a rest is not drawn, so it does not make the band', () => {
    const doc = bare();
    doc.score[0].ev[0].r = true; doc.score[0].ev[0].m = 0; doc.score[0].ev[0].l = 'la';
    expect(bandsOf(doc).lyrics).toBe(0);
  });
});

describe('the stack of a system', () => {
  it('a sheet that uses every band and has no high note: today\'s positions to the pixel', () => {
    const { stack, systemHeight, systems } = layoutOf(withEndings(withChords(withLyrics(bare()))));
    expect(stack).toMatchObject({
      bands: { marks: 0, chords: 22, lyrics: 24, endings: 14, headroom: 15 }, staffTop: 75, shift: 0, systemHeight: 290, chartTop: 166, pillY: 256,
      frame: { columnTop: 0, chordY: 2, lyricY: 22, voltaY: 46 },
    });
    expect(systemHeight).toBe(290);
    expect(systems.map(s => s.y)).toEqual([0, 290]);
  });

  it('the same sheet with marks: 30 px more, all of it moved down (as in the marks row of before)', () => {
    const { stack } = layoutOf(withMarks(withEndings(withChords(withLyrics(bare())))));
    expect(stack).toMatchObject({ staffTop: 105, shift: 30, systemHeight: 320, chartTop: 196, pillY: 286, frame: { columnTop: 0, chordY: 2, lyricY: 22, voltaY: 46 } });
  });

  it('a bare sheet is shorter by the heights of the absent bands: 230 instead of 290', () => {
    const { stack, height } = layoutOf(bare());
    expect(stack).toMatchObject({ bands: { marks: 0, chords: 0, lyrics: 0, endings: 0, headroom: 15 }, staffTop: 15, shift: -60, systemHeight: 230, chartTop: 106, pillY: 196 });
    expect(height).toBe(2 * 230);
    expect(290 - 230).toBe(BAND_HEIGHT.chords + BAND_HEIGHT.lyrics + BAND_HEIGHT.endings);
  });

  it.each([
    ['lyrics only', () => withLyrics(bare()), 24],
    ['chords and lyrics', () => withChords(withLyrics(bare())), 46],
    ['chords, lyrics, endings', () => withEndings(withChords(withLyrics(bare()))), 60],
  ])('%s: the system is shorter than the full one by the absent bands', (_, make, present) => {
    expect(layoutOf(make()).systemHeight).toBe(230 + present);
  });

  it('a bare sheet with marks: the marks stand directly above the headroom, 45 px above the staff top at most', () => {
    const { stack } = layoutOf(withMarks(bare()));
    expect(stack.systemHeight).toBe(260);
    expect(stack.staffTop).toBe(45);
    expect(stack.bands.marks).toBe(30);
    expect(stack.staffTop - stack.bands.headroom).toBe(stack.bands.marks);     // the row ends where the headroom begins
  });

  it('the bands sit one above the other in the order marks, chords, lyrics, endings, headroom', () => {
    const { stack } = layoutOf(withMarks(withEndings(withChords(withLyrics(bare())))));
    const { bands: b } = stack;
    expect(stack.staffTop).toBe(b.marks + b.chords + b.lyrics + b.endings + b.headroom);
    expect(stack.frame.columnTop + stack.shift).toBe(b.marks);
    expect(stack.frame.chordY + stack.shift).toBe(b.marks + 2);
    expect(stack.frame.lyricY + stack.shift).toBe(b.marks + b.chords);
    expect(stack.frame.voltaY + stack.shift).toBe(b.marks + b.chords + b.lyrics);
  });

  it.each([
    ['bare', bare], ['lyrics', () => withLyrics(bare())], ['all with marks', () => withMarks(withEndings(withChords(withLyrics(bare()))))],
    ['a note at C6', () => withC6(withLyrics(bare()))],
  ])('%s: everything below the staff keeps its distance to the staff', (_, make) => {
    const { stack } = layoutOf(make());
    expect(stack.systemHeight - stack.staffTop).toBe(290 - SHEET.staffTop);
    expect(stack.chartTop - stack.staffTop).toBe(SHEET.chartY - SHEET.staffTop);
    expect(stack.pillY - stack.chartTop).toBe(SHEET.altButtonDy);
    expect(stack.shift).toBe(stack.staffTop - SHEET.staffTop);
  });

  it('every system of a sheet has the same stack and the same height', () => {
    const L = layoutOf(withMarks(withLyrics(bare())));
    expect(L.systems).toHaveLength(2);
    for (const s of L.systems) { expect(s.stack).toBe(L.stack); expect(s.height).toBe(L.systemHeight); }
  });
});

describe('the headroom', () => {
  it('never less than 15 px: ordinary notes (G4 quarters, stems down or up) need less', () => {
    expect(bandsOf(bare()).headroom).toBe(15);
  });

  it('a note at C6 (head top at 50): 25 px of ink above the staff top plus 4 px, so 29', () => {
    const doc = withC6(bare());
    expect(derive(doc, DEFAULT_PREFS).events.filter(e => !e.rest).map(e => e.pos)).toContain(12);
    expect(bandsOf(doc).headroom).toBe(29);
  });

  it('A5 on its ledger line (head top at 60) needs 19; B4 (pos 6, nothing above 62) stays at the minimum', () => {
    const doc = bare(); doc.score[2].ev[0].m = 81;
    expect(bandsOf(doc).headroom).toBe(19);
    const low = bare(); low.score[2].ev[0].m = 71;
    expect(bandsOf(low).headroom).toBe(15);
  });

  it('a sheet with all bands and a high note is taller than today: 290 + 14 = 304', () => {
    const { systemHeight, stack } = layoutOf(withEndings(withChords(withLyrics(withC6(bare())))));
    expect(stack.bands.headroom).toBe(29);
    expect(systemHeight).toBe(304);
  });

  it('is one number for the whole sheet: a high note in one system lifts every system', () => {
    const L = layoutOf(withC6(bare()));       // the note is in bar 4, the second system
    expect(L.systems.map(s => s.height)).toEqual([L.systemHeight, L.systemHeight]);
    expect(L.stack.bands.headroom).toBe(29);
  });

  it('the headroom comes below the bands, and the marks row above them: marks on a sheet with a high note', () => {
    const { stack } = layoutOf(withMarks(withC6(bare())));
    expect(stack.staffTop).toBe(30 + 29);
  });
});

describe('Lyrics and Chords mode', () => {
  it('Lyrics mode on a sheet without lyrics: every system is 24 px taller; leaving the mode takes it back', () => {
    const doc = bare();
    const before = layoutOf(doc).systemHeight;
    expect(layoutOf(doc, { lyrics: true }).systemHeight).toBe(before + 24);
    expect(layoutOf(doc, { lyrics: false }).systemHeight).toBe(before);
  });

  it('Chords mode: 22 px; both: 46', () => {
    const doc = bare();
    const before = layoutOf(doc).systemHeight;
    expect(layoutOf(doc, { chords: true }).systemHeight).toBe(before + 22);
    expect(layoutOf(doc, { lyrics: true, chords: true }).systemHeight).toBe(before + 46);
  });

  it('on a sheet that has lyrics the mode changes nothing', () => {
    const doc = withLyrics(bare());
    expect(layoutOf(doc, { lyrics: true }).systemHeight).toBe(layoutOf(doc).systemHeight);
  });

  it('PDF, print and play mode call layoutSheet without the mode: the same height as the plain layout', () => {
    const doc = bare();
    expect(layoutOf(doc).systemHeight).toBe(230);
  });
});

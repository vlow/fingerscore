import { chordParts, chordText, parseChord, prettyChord } from './chords';
import { sampleDoc } from './fixture';

describe('chords', () => {
  it('check 7: pretty accidentals', () => {
    expect(prettyChord('Bb')).toBe('B♭');
    expect(prettyChord('F#m7b5/C#')).toBe('F♯m7♭5/C♯');
  });
  it('parts for raised extensions', () => {
    expect(chordParts('F♯m7♭5/C♯')).toEqual({ root: 'F♯', quality: 'm', ext: '7♭5', bass: 'C♯' });
    expect(chordParts('C7')).toEqual({ root: 'C', quality: '', ext: '7', bass: null });
    expect(chordParts('B♭Δ7')).toEqual({ root: 'B♭', quality: '', ext: 'Δ7', bass: null });
  });
  it('transposes with the key', () => {
    const c = parseChord('Am', 3);
    expect(c).toMatchObject({ ok: true, pc: 6, rest: 'm', bass: null, tk: 3 });
    expect(chordText(c, 3, -1)).toBe('Am');
    expect(chordText(c, 5, 1)).toBe('Bm');
    expect(chordText(parseChord('F', 3), 4, -6)).toBe('G♭');
  });
  it('transposes the bass note too', () => {
    expect(chordText(parseChord('D/F#', 0), 2, 0)).toBe('E/G♯');
  });
  it('invalid text is kept and not transposed', () => {
    const c = parseChord('N.C.', 0);
    expect(c.ok).toBe(false);
    expect(chordText(c, 5, 0)).toBe('N.C.');
  });
  it('fixture chords', () => {
    const d = sampleDoc('xc');
    expect(Object.keys(d.chords).length).toBeGreaterThan(0);
    expect(d.chords[d.score[0].ev[0].id]).toMatchObject({ raw: 'Am', tk: 3 });
  });
});

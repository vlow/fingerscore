import { readNote } from './noteText';

// An alto sax's written range: B♭3 (58) to F♯6 (90).
const read = (text: string, near = 72) => readNote(text, near, 58, 90);

describe('readNote', () => {
  it('reads English names with an octave', () => {
    expect(read('C5')).toEqual({ pitch: 72 });
    expect(read('Bb4')).toEqual({ pitch: 70 });
    expect(read('B♭4')).toEqual({ pitch: 70 });
    expect(read('f#5')).toEqual({ pitch: 78 });
    expect(read('F♯5')).toEqual({ pitch: 78 });
    expect(read('C♮5')).toEqual({ pitch: 72 });
    expect(read('Fx4')).toEqual({ pitch: 67 });
    expect(read('Ebb5')).toEqual({ pitch: 74 });
  });

  it('reads German names: -is, -es, s, and H for B natural', () => {
    expect(read('Fis5')).toEqual({ pitch: 78 });
    expect(read('Es5')).toEqual({ pitch: 75 });
    expect(read('As4')).toEqual({ pitch: 68 });
    expect(read('Bes4')).toEqual({ pitch: 70 });
    expect(read('H4')).toEqual({ pitch: 71 });
    expect(read('Cisis5')).toEqual({ pitch: 74 });
  });

  it('takes the note nearest the current one when no octave is typed', () => {
    expect(read('D', 72)).toEqual({ pitch: 74 });
    expect(read('A', 72)).toEqual({ pitch: 69 });
    expect(read('c#', 60)).toEqual({ pitch: 61 });
    expect(read('Db', 88)).toEqual({ pitch: 85 });
  });

  it('ignores case and spaces around and inside the name', () => {
    expect(read('  bb 4 ')).toEqual({ pitch: 70 });
    expect(read('FIS5')).toEqual({ pitch: 78 });
  });

  it('says when a name cannot be read or has no pitch in range', () => {
    expect(read('')).toEqual({ error: 'unknown' });
    expect(read('X4')).toEqual({ error: 'unknown' });
    expect(read('C#5x')).toEqual({ error: 'unknown' });
    expect(read('C3')).toEqual({ error: 'range' });
    expect(read('G6')).toEqual({ error: 'range' });
    expect(readNote('C', 60, 61, 70)).toEqual({ error: 'range' });
  });
});

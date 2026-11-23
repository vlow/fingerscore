import { describe, expect, it } from 'vitest';
import { buildScale, keyChips } from '../domain/scales';
import { fileName, slug } from '../domain/persistence';
import { scalePdfName, sheetPdfName } from './names';

describe('sheetPdfName', () => {
  it('title and instrument without its key', () => {
    expect(sheetPdfName('Auld Lang Syne', 'Alto sax (E♭)')).toBe('auld-lang-syne-alto-sax.pdf');
  });
  it('an untitled sheet is "sheet"', () => expect(sheetPdfName('', 'Alto sax')).toBe('sheet-alto-sax.pdf'));
  it('runs outside a-z0-9 become one hyphen, trimmed', () => expect(sheetPdfName('Ça ira!', 'Flute')).toBe('ca-ira-flute.pdf'));
  it('a title of only symbols counts as empty', () => expect(sheetPdfName('♭♯', 'Flute')).toBe('sheet-flute.pdf'));
  it('uses the same slug rule as the JSON file name', () => {
    const t = 'Ça ira! 2';
    expect(fileName(t)).toBe('ca-ira-2.fingerscore.json');
    expect(sheetPdfName(t, '')).toBe('ca-ira-2.pdf');
  });
});

describe('accents', () => {
  it('become plain letters', () => expect(sheetPdfName('Žluťoučký kůň', 'Flute')).toBe('zlutoucky-kun-flute.pdf'));
  it('each part is cut at 80 characters', () => {
    expect(sheetPdfName('t'.repeat(100), 'Flute')).toBe(`${'t'.repeat(80)}-flute.pdf`);
  });
});

describe('scalePdfName', () => {
  it('key, scale and instrument', () => expect(scalePdfName('C', 'major', 'Alto sax')).toBe('c-major-alto-sax.pdf'));
  it('keeps "in C" of a Xaphoon and writes a sharp as a word', () => {
    expect(scalePdfName('F♯', 'harmonic minor', 'Xaphoon in C')).toBe('f-sharp-harmonic-minor-xaphoon-in-c.pdf');
  });
  it('F♯ major and F major, G♭ major and G major, get different names', () => {
    expect(scalePdfName('F♯', 'major', 'Alto sax')).toBe('f-sharp-major-alto-sax.pdf');
    expect(scalePdfName('F', 'major', 'Alto sax')).toBe('f-major-alto-sax.pdf');
    expect(scalePdfName('G♭', 'major', 'Alto sax')).toBe('g-flat-major-alto-sax.pdf');
    expect(scalePdfName('G', 'major', 'Alto sax')).toBe('g-major-alto-sax.pdf');
  });
  it('the 13 keys of the Scales page give 13 different names for one scale and instrument', () => {
    const chips = keyChips('fl', 'maj', 'read');
    expect(chips).toHaveLength(13);
    const names = chips.map(c => {
      const { tonic } = buildScale({ inst: 'fl', scale: 'maj', tonicPc: c.writtenPc, sharp: c.sharp, range: 'one', direction: 'up' });
      return scalePdfName(tonic, 'major', 'Flute');
    });
    expect(new Set(names).size).toBe(13);
  });
  it('drops empty parts', () => expect(scalePdfName('', 'major', 'Alto sax (E♭)')).toBe('major-alto-sax.pdf'));
});

describe('sharps and flats in file names', () => {
  it('slug writes ♯ and # after a letter A–G as -sharp, ♭ as -flat, 𝄪 and 𝄫 as double', () => {
    expect(slug('F♯ major')).toBe('f-sharp-major');
    expect(slug('C# minor')).toBe('c-sharp-minor');
    expect(slug('Xaphoon in B♭')).toBe('xaphoon-in-b-flat');
    expect(slug('B♭ Blues')).toBe('b-flat-blues');
    expect(slug('F𝄪')).toBe('f-double-sharp');
    expect(slug('B𝄫 major')).toBe('b-double-flat-major');
  });
  it('a b after a letter is not a flat; only the sign counts', () => {
    expect(slug('Abba')).toBe('abba');
    expect(slug('Bb')).toBe('bb');
  });
  it('a sign that does not follow a letter A–G is dropped as before', () => {
    expect(slug('Song ♯1')).toBe('song-1');
    expect(slug('Cm7♭5')).toBe('cm7-5');
  });
  it('apply to the JSON file name and the sheet PDF name', () => {
    expect(fileName('B♭ Blues')).toBe('b-flat-blues.fingerscore.json');
    expect(sheetPdfName('B♭ Blues', 'Xaphoon in B♭')).toBe('b-flat-blues-xaphoon-in-b-flat.pdf');
  });
});

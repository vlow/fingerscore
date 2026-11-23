import { describe, expect, it } from 'vitest';
import { fileName } from '../domain/persistence';
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
  it('keeps "in C" of a Xaphoon and drops a sharp', () => {
    expect(scalePdfName('F♯', 'harmonic minor', 'Xaphoon in C')).toBe('f-harmonic-minor-xaphoon-in-c.pdf');
  });
  it('drops empty parts', () => expect(scalePdfName('', 'major', 'Alto sax (E♭)')).toBe('major-alto-sax.pdf'));
});

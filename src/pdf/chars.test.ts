import { describe, expect, it } from 'vitest';
import { SYMBOLS, fontFor, runs, unsupported } from './chars';
import { PDF_FAILED, PdfError, unsupportedMessage } from './errors';

describe('fontFor', () => {
  it('knows eleven symbols, each drawn as outline', () => {
    expect([...SYMBOLS]).toHaveLength(11);
    for (const s of SYMBOLS) expect(fontFor(s)).toBe('symbol');
  });
  it('Latin letters', () => expect(fontFor('é')).toBe('latin'));
  it.each(['ł', 'ő', 'č'])('%s needs the extended file', c => expect(fontFor(c)).toBe('latinExt'));
  it.each(['Ж', '中', '😀'])('%s is not supported', c => expect(fontFor(c)).toBeNull());
  it('space, line break and no-break space are always supported', () => {
    for (const c of [' ', '\n', ' ']) expect(fontFor(c)).toBe('latin');
  });
  it('a combining mark is supported only when a font file has it', () => {
    expect(fontFor('̂')).toBeNull(); // not in either file
    expect(fontFor('́')).toBe('latin'); // the font has U+0301
  });
});

describe('runs', () => {
  it('splits by font file; a space counts as latin', () => {
    expect(runs('Łódź in B♭')).toEqual([
      { kind: 'latinExt', text: 'Ł' }, { kind: 'latin', text: 'ód' }, { kind: 'latinExt', text: 'ź' },
      { kind: 'latin', text: ' in B' }, { kind: 'symbol', text: '♭' },
    ]);
  });
  it('keeps a double flat whole', () => {
    expect(runs('B𝄫')).toEqual([{ kind: 'latin', text: 'B' }, { kind: 'symbol', text: '𝄫' }]);
  });
  it('an empty text has no runs', () => expect(runs('')).toEqual([]));
});

describe('unsupported', () => {
  it('lists distinct characters in order of first appearance', () => {
    expect(unsupported(['Жук', 'a中', 'ok'])).toEqual(['Ж', 'у', 'к', '中']);
  });
  it('keeps a surrogate pair whole and lists it once', () => {
    expect(unsupported(['😀a😀'])).toEqual(['😀']);
  });
  it('is empty for supported texts', () => expect(unsupported(['Auld Lang Syne', 'B♭m7 𝄪'])).toEqual([]));
});

describe('errors', () => {
  it('names up to 12 characters', () => {
    expect(unsupportedMessage(['Ж', 'у', 'к'])).toBe("The PDF can't show these characters: Ж, у, к. Use Print instead.");
  });
  it('lists 12 and counts the rest', () => {
    const chars = Array.from({ length: 14 }, (_, i) => String.fromCharCode(0x410 + i));
    expect(unsupportedMessage(chars)).toBe(
      `The PDF can't show these characters: ${chars.slice(0, 12).join(', ')} and 2 more. Use Print instead.`,
    );
  });
  it('exactly 12 lists all', () => {
    const chars = Array.from({ length: 12 }, (_, i) => String.fromCharCode(0x410 + i));
    expect(unsupportedMessage(chars)).not.toContain('more');
  });
  it('PdfError carries the user message', () => {
    const e = new PdfError(PDF_FAILED);
    expect(e).toBeInstanceOf(Error);
    expect(e.userMessage).toBe('The PDF could not be made. Use Print instead.');
  });
});

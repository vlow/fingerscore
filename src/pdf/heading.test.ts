import { describe, expect, it, vi } from 'vitest';
import { headingText } from './engine';

// The engine imports the PDF libraries, which need a real browser; headingText touches neither.
vi.mock('jspdf', () => ({ jsPDF: class {} }));
vi.mock('svg2pdf.js', () => ({ svg2pdf: async () => {} }));

describe('headingText', () => {
  it('collapses every run of white space, CR, LF and tab included, into one space', () => {
    expect(headingText('A\nB\r\nC\tD')).toBe('A B C D');
    expect(headingText('  S \r\n\t T  ')).toBe('S T');
  });
  it('keeps the first 300 characters, counted by code point', () => {
    expect(headingText('x'.repeat(301))).toBe('x'.repeat(300));
    expect([...headingText('𝄞'.repeat(400))]).toHaveLength(300);
  });
  it('does not leave a space at the cut', () => {
    expect(headingText(`${'x'.repeat(299)} y`)).toBe('x'.repeat(299));
  });
  it('leaves a short text as it is', () => expect(headingText('Auld Lang Syne')).toBe('Auld Lang Syne'));
});

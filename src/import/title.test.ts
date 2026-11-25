import { fileTitle } from './title';

describe('fileTitle', () => {
  it('takes the first candidate with text, folding whitespace runs to one space', () => {
    expect(fileTitle(undefined, '  ', '  Morning\n  Has\tBroken ', 'Other')).toBe('Morning Has Broken');
  });
  it('is empty when no candidate has text', () => {
    expect(fileTitle()).toBe('');
    expect(fileTitle(null, undefined, ' \n ')).toBe('');
  });
});

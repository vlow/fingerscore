import { LYRIC_FONT_PX, TEXT_EM_PER_CHAR, placeLyrics, type LyricItem } from './lyrics';

const est = (text: string, fontPx = LYRIC_FONT_PX) => text.length * TEXT_EM_PER_CHAR * fontPx;

/** Box of a placed syllable: textLength when condensed, else the estimate. */
function boxes(items: LyricItem[], fontPx = LYRIC_FONT_PX) {
  return placeLyrics(items, 0, 860, fontPx).map((p, i) => {
    const w = p.textLength ?? est(items[i].text, fontPx);
    return { id: p.id, left: p.x - w / 2, right: p.x + w / 2, note: items[i].x, w, textLength: p.textLength };
  });
}

function expectOverNote(b: { left: number; right: number; note: number }) {
  expect(b.left).toBeLessThanOrEqual(b.note - 2 + 1e-9);
  expect(b.right).toBeGreaterThanOrEqual(b.note + 2 - 1e-9);
}

describe('placeLyrics', () => {
  it('leaves syllables with room centred on their notes', () => {
    const items = [{ id: 'a', x: 100, text: 'Should' }, { id: 'b', x: 180, text: 'auld' }];
    expect(placeLyrics(items, 0, 860)).toEqual([{ id: 'a', x: 100 }, { id: 'b', x: 180 }]);
  });

  it('"ac-" and "quain-" 20px apart: no overlap, each still over its note', () => {
    const [a, b] = boxes([{ id: 'a', x: 200, text: 'ac-' }, { id: 'b', x: 220, text: 'quain-' }]);
    expect(b.left - a.right).toBeGreaterThanOrEqual(1);
    expectOverNote(a);
    expectOverNote(b);
  });

  it('shifts the pair evenly when both have room', () => {
    const [a, b] = boxes([{ id: 'a', x: 200, text: 'er' }, { id: 'b', x: 225, text: 'brought' }]);
    expect(b.left - a.right).toBeCloseTo(4);
    expect(200 - (a.left + a.right) / 2).toBeCloseTo((b.left + b.right) / 2 - 225);
  });

  it('the same run at 20px cannot keep 4px gaps: condensed, never overlapping', () => {
    const items = [
      { id: 'a', x: 100, text: 'Should' }, { id: 'b', x: 120, text: 'auld' },
      { id: 'c', x: 140, text: 'ac-' }, { id: 'd', x: 160, text: 'quain-' },
    ];
    const placed = boxes(items);
    for (let i = 1; i < placed.length; i++) expect(placed[i].left - placed[i - 1].right).toBeGreaterThanOrEqual(1);
    placed.forEach(expectOverNote);
  });

  it('a run of four close syllables: 4px gaps, each over its note, pushing the chain left', () => {
    const items = [
      { id: 'a', x: 100, text: 'Should' }, { id: 'b', x: 124, text: 'auld' },
      { id: 'c', x: 148, text: 'ac-' }, { id: 'd', x: 172, text: 'quain-' },
    ];
    const placed = boxes(items);
    for (let i = 1; i < placed.length; i++) expect(placed[i].left - placed[i - 1].right).toBeGreaterThanOrEqual(4 - 1e-9);
    placed.forEach(expectOverNote);
    expect(placed.every(p => p.textLength === undefined)).toBe(true);
  });

  it('condenses with textLength, not below 80%, when shifting cannot clear', () => {
    // "together" must fit between "it" and "is", 25px apart each side: only ~38px for ~53px of text
    const items = [{ id: 'a', x: 300, text: 'it' }, { id: 'b', x: 325, text: 'together' }, { id: 'c', x: 350, text: 'is' }];
    const placed = boxes(items);
    expect(placed[1].textLength).toBeDefined();
    placed.forEach((p, i) => { if (p.textLength !== undefined) expect(p.textLength).toBeGreaterThanOrEqual(0.8 * est(items[i].text) - 1e-9); });
    placed.forEach(expectOverNote);
  });

  it('condenses only as far as needed for the 4px gap', () => {
    const items = [{ id: 'a', x: 300, text: 'it' }, { id: 'b', x: 322, text: 'gether' }, { id: 'c', x: 344, text: 'is' }];
    const placed = boxes(items);
    expect(placed[1].textLength).toBeDefined();
    expect(placed[1].textLength!).toBeGreaterThan(0.8 * est('gether'));
    expect(placed[1].left - placed[0].right).toBeCloseTo(4);
    expect(placed[2].left - placed[1].right).toBeCloseTo(4);
  });

  it('a syllable at the right edge stays inside maxX', () => {
    const placed = placeLyrics([{ id: 'a', x: 850, text: 'again' }], 0, 860);
    expect(placed[0].x + est('again') / 2).toBeLessThanOrEqual(860);
  });

  it('a syllable at the left edge stays right of minX', () => {
    const placed = placeLyrics([{ id: 'a', x: 70, text: 'Should' }], 64, 860);
    expect(placed[0].x - est('Should') / 2).toBeGreaterThanOrEqual(64);
  });

  it('works for the chord band with its own font size', () => {
    const [a, b] = boxes([{ id: 'a', x: 200, text: 'F♯m7♭5' }, { id: 'b', x: 240, text: 'B♭maj7' }], 13);
    expect(b.left - a.right).toBeGreaterThanOrEqual(1);
  });
});

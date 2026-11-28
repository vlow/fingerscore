import { capacity, CELL, clampStart, follow, pageStep } from './strip';
import { naturalAt, posAt, posOfPitch, shownPositions } from './staff';

describe('range strip window', () => {
  it('fits whole notes of 36 px, at least three, never more than there are; all while unmeasured', () => {
    expect(CELL).toBe(36);
    expect(capacity(360, 33)).toBe(10);
    expect(capacity(2000, 33)).toBe(33);
    expect(capacity(50, 33)).toBe(3);
    expect(capacity(0, 33)).toBe(33);
  });

  it('keeps the window inside the notes', () => {
    expect(clampStart(-4, 10, 33)).toBe(0);
    expect(clampStart(30, 10, 33)).toBe(23);
    expect(clampStart(5, 40, 33)).toBe(0);
  });

  it('follows the chosen note, moving as little as possible', () => {
    expect(follow(0, 4, 10, 33)).toBe(0);
    expect(follow(0, 12, 10, 33)).toBe(3);
    expect(follow(10, 4, 10, 33)).toBe(4);
    expect(follow(20, 32, 10, 33)).toBe(23);
  });

  it('pages by a screenful minus two notes', () => {
    expect(pageStep(10)).toBe(8);
    expect(pageStep(3)).toBe(1);
    expect(pageStep(1)).toBe(1);
  });
});

describe('staff picker geometry', () => {
  it('places pitches on lines and spaces, flats on their letter', () => {
    expect(posOfPitch(64)).toBe(0); // E4, bottom line
    expect(posOfPitch(77)).toBe(8); // F5, top line
    expect(posOfPitch(60)).toBe(-2); // C4, first ledger line below
    expect(posOfPitch(70)).toBe(4); // B♭4 on the B line
    expect(posOfPitch(66)).toBe(2); // G♭4 on the G line
  });

  it('names the natural note of each line and space', () => {
    expect(naturalAt(0)).toBe(64);
    expect(naturalAt(-2)).toBe(60);
    expect(naturalAt(-3)).toBe(59);
    expect(naturalAt(8)).toBe(77);
    expect(naturalAt(14)).toBe(88);
  });

  it('shows the range with a step of margin, and the whole staff at least', () => {
    expect(shownPositions(58, 90)).toEqual({ low: -4, high: 17 }); // alto sax: B♭3 … G♭6
    expect(shownPositions(65, 72)).toEqual({ low: -1, high: 9 });
  });

  it('finds the nearest line or space under the pointer', () => {
    expect(posAt(115, 115)).toBe(0);
    expect(posAt(113, 115)).toBe(0);
    expect(posAt(112, 115)).toBe(1);
    expect(posAt(130, 115)).toBe(-3);
  });
});

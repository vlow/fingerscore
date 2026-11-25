import { describe, expect, it } from 'vitest';
import { mkDoc } from '../../test/helpers';
import { setBarMark, setJump } from '../../domain/edit';
import { barAnnouncement } from './barAnnouncement';

const tune = () => mkDoc(Array.from({ length: 4 }, () => ({ ev: [[60, 48] as [number, number]] })));

describe('barAnnouncement', () => {
  it('names the bar and the mark that was set', () => {
    expect(barAnnouncement(tune(), setBarMark(tune(), 2, 'segno', true))).toBe('Bar 3: Segno');
    expect(barAnnouncement(tune(), setJump(tune(), 3, 'dsCoda'))).toBe('Bar 4: D.S. al Coda');
    expect(barAnnouncement(tune(), setBarMark(tune(), 1, 'toCoda', true))).toBe('Bar 2: To Coda');
  });

  it('says a mark was removed', () => {
    const before = setBarMark(tune(), 1, 'toCoda', true);
    expect(barAnnouncement(before, setBarMark(before, 1, 'toCoda', false))).toBe('Bar 2: To Coda removed');
    const jumped = setJump(tune(), 3, 'dc');
    expect(barAnnouncement(jumped, setJump(jumped, 3, null))).toBe('Bar 4: D.C. removed');
  });

  it('says where a moved mark came from', () => {
    const before = setBarMark(tune(), 1, 'fine', true);
    expect(barAnnouncement(before, setBarMark(before, 3, 'fine', true))).toBe('Bar 4: Fine moved from bar 2');
  });

  it('counts a pickup as bar 0', () => {
    const pickup = mkDoc([{ ev: [[60, 24]] }, { ev: [[60, 48]] }, { ev: [[60, 48]] }]);
    expect(barAnnouncement(pickup, setBarMark(pickup, 0, 'coda', true))).toBe('Bar 0: Coda');
  });

  it('is null when no mark changed or the number of bars changed', () => {
    const d = tune();
    expect(barAnnouncement(d, d)).toBeNull();
    expect(barAnnouncement(d, { ...d, score: d.score.slice(1) })).toBeNull();
  });
});

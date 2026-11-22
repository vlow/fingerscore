import { describe, expect, it } from 'vitest';
import { timeAgo } from './timeAgo';

const now = new Date('2026-11-22T12:00:00Z');
const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms).toISOString(), now);

describe('timeAgo', () => {
  it('time ago', () => {
    expect(ago(20_000)).toBe('just now');
    expect(ago(5 * 60_000)).toBe('5 min ago');
    expect(ago(3 * 3_600_000)).toBe('3 h ago');
    expect(ago(30 * 3_600_000)).toBe('yesterday');
    expect(ago(4 * 86_400_000)).toBe('4 days ago');
    expect(ago(60 * 86_400_000)).toBe('23 Sep 2026');
    expect(timeAgo('garbage', now)).toBe('');
  });

  it('switches to the date at 30 days and treats a future time as just now', () => {
    expect(ago(29 * 86_400_000)).toBe('29 days ago');
    expect(ago(30 * 86_400_000)).toBe('23 Oct 2026');
    expect(ago(-5 * 60_000)).toBe('just now');
  });
});

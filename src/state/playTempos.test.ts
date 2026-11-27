import { adoptUnsavedTempo, forgetUnsavedTempo, readPlayTempo, writePlayTempo } from './playTempos';

const KEY = 'fingerscore.playtempo';

beforeEach(() => { window.localStorage.clear(); forgetUnsavedTempo(); });

describe('Play mode tempos', () => {
  it('keeps one tempo per saved sheet', () => {
    writePlayTempo('a', 96, new Set(['a', 'b']));
    writePlayTempo('b', 70, new Set(['a', 'b']));
    expect(readPlayTempo('a')).toBe(96);
    expect(readPlayTempo('b')).toBe(70);
    expect(readPlayTempo('c')).toBeNull();
  });

  it('drops tempos of sheets no longer in the library when it writes', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ a: 96, gone: 80 }));
    writePlayTempo('b', 70, new Set(['a', 'b']));
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({ a: 96, b: 70 });
  });

  it('keeps the written sheet even when the library does not list it yet', () => {
    writePlayTempo('fresh', 70, new Set());
    expect(readPlayTempo('fresh')).toBe(70);
  });

  it('keeps an unsaved sheet’s tempo in memory, and moves it under the id on save', () => {
    writePlayTempo(null, 88, new Set());
    expect(readPlayTempo(null)).toBe(88);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    adoptUnsavedTempo('new');
    expect(readPlayTempo('new')).toBe(88);
    expect(readPlayTempo(null)).toBeNull();
  });

  it('adopts nothing when the unsaved sheet has no tempo', () => {
    adoptUnsavedTempo('new');
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it.each(['not json', '[]', 'null', '{"a":"x"}', '{"a":null}'])('reads nothing from stored %s', raw => {
    window.localStorage.setItem(KEY, raw);
    expect(readPlayTempo('a')).toBeNull();
  });
});

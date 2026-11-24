import { describe, expect, it } from 'vitest';
import type { Family } from './instruments';
import { familyCounts, viewEntries, type Listed, type ViewOptions } from './libraryView';

const sheet = (title: string, inst: string, fam: Family, minute: number): Listed =>
  ({ title, inst, fam, savedAt: new Date(Date.UTC(2026, 10, 22, 10, minute)).toISOString() });

// Newest first, as the library stores them.
const LIB = [
  sheet('Scarborough Fair', 'Flute in C', 'Flute', 5),
  sheet('amazing grace', 'Alto sax in E♭', 'Saxophone', 4),
  sheet('Greensleeves', 'Clarinet in B♭', 'Clarinet', 3),
  sheet('Étude 10', 'Tenor sax in B♭', 'Saxophone', 2),
  sheet('Etude 2', 'Alto sax in E♭', 'Saxophone', 1),
];
const view = (o: Partial<ViewOptions> = {}) => viewEntries(LIB, { query: '', fam: null, sort: 'recent', ...o }).map(e => e.title);

describe('familyCounts', () => {
  it('lists only the families that have sheets, in family order, with their counts', () => {
    expect(familyCounts(LIB)).toEqual([{ fam: 'Saxophone', count: 3 }, { fam: 'Clarinet', count: 1 }, { fam: 'Flute', count: 1 }]);
    expect(familyCounts([])).toEqual([]);
  });
});

describe('viewEntries', () => {
  it('recent: newest first, whatever order the entries come in', () => {
    expect(view()).toEqual(LIB.map(e => e.title));
    expect(viewEntries([...LIB].reverse(), { query: '', fam: null, sort: 'recent' })).toEqual(LIB);
  });

  it('title: A–Z without regard to case or accents, numbers by value', () => {
    expect(view({ sort: 'title' })).toEqual(['amazing grace', 'Etude 2', 'Étude 10', 'Greensleeves', 'Scarborough Fair']);
  });

  it('title: equal titles keep the newest first', () => {
    const twins = [sheet('Same', 'Flute in C', 'Flute', 1), sheet('Same', 'Alto sax in E♭', 'Saxophone', 9)];
    expect(viewEntries(twins, { query: '', fam: null, sort: 'title' }).map(e => e.inst)).toEqual(['Alto sax in E♭', 'Flute in C']);
  });

  it('instrument: by instrument name, then by title', () => {
    expect(view({ sort: 'instrument' })).toEqual(['amazing grace', 'Etude 2', 'Greensleeves', 'Scarborough Fair', 'Étude 10']);
  });

  it('filters by one instrument family', () => {
    expect(view({ fam: 'Saxophone' })).toEqual(['amazing grace', 'Étude 10', 'Etude 2']);
    expect(view({ fam: 'Recorder' })).toEqual([]);
  });

  it('searches titles and instrument names, ignoring case and outer spaces', () => {
    expect(view({ query: 'GRACE' })).toEqual(['amazing grace']);
    expect(view({ query: '  alto ' })).toEqual(['amazing grace', 'Etude 2']);
    expect(view({ query: 'nothing' })).toEqual([]);
  });

  it('combines search, filter and sort', () => {
    expect(view({ query: 'tude', fam: 'Saxophone', sort: 'title' })).toEqual(['Etude 2', 'Étude 10']);
    expect(view({ query: 'flute', fam: 'Saxophone' })).toEqual([]);
  });

  it('leaves the given list as it is', () => {
    const before = [...LIB];
    view({ sort: 'title' });
    expect(LIB).toEqual(before);
  });
});

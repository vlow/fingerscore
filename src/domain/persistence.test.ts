import { describe, expect, it, vi } from 'vitest';
import { sampleDoc } from './fixture';
import { inst } from './instruments';
import { optionsFor } from './fingerings';
import { derive } from './derive';
import { DEFAULT_PREFS } from './transpose';
import {
  canonical, fileName, importedMessage, importMessage, LIBRARY_FILE_NAME, MAX_FILE_BYTES, MAX_LIBRARY_BYTES, MAX_LIBRARY_SHEETS, parseFile, parseFileText,
  parseImport, parseImportText, readImport, readSheet, serializeFile, serializeLibrary, toFile, type LibrarySheet,
} from './persistence';
import { listEntries, saveEntry } from '../state/library';
import type { Doc, Ev } from './types';

const doc = () => sampleDoc('asax');

function findAltEvent(d: Doc): Ev {
  for (const bar of d.score) {
    for (const e of bar.ev) {
      if (!e.r && optionsFor(d.inst, e.m + d.shift + inst(d.inst).off, d.recorderSystem).length >= 2) return e;
    }
  }
  throw new Error('no event with two fingering options');
}

describe('sheet file', () => {
  it('round-trips a document exactly', () => {
    const r = parseFileText(serializeFile(doc(), new Date('2026-11-22T12:00:00Z')));
    expect(r.ok && canonical(r.doc)).toBe(canonical(doc()));
    expect(r.ok && r.title).toBe('The Water Is Wide');
  });

  it('envelope', () => {
    const f = toFile(doc(), new Date('2026-11-22T12:00:00Z'));
    expect(f).toMatchObject({ app: 'fingerscore', format: 1, savedAt: '2026-11-22T12:00:00.000Z', title: 'The Water Is Wide' });
  });

  it.each([['null', null], ['array', []], ['package.json', { name: 'x', version: '1.0.0' }], ['other app', { app: 'other', format: 1, doc: {} }],
    ['other format', { app: 'fingerscore', format: 2, doc: {} }], ['no doc', { app: 'fingerscore', format: 1 }]])(
    'refuses %s as not a sheet', (_n, v) => { expect(parseFile(v)).toEqual({ ok: false, reason: 'not-a-sheet' }); });

  it('refuses unparseable text as not a sheet', () => {
    expect(parseFileText('{oops')).toEqual({ ok: false, reason: 'not-a-sheet' });
  });

  const broken = (mutate: (d: any) => void) => {
    const f: any = JSON.parse(serializeFile(doc()));
    mutate(f.doc);
    return parseFile(f);
  };

  it.each([
    ['bar does not sum to cap', (d: any) => { d.score[1].ev[0].d = 3; }],
    ['duration not allowed', (d: any) => { d.score[1].ev[0].d = 5; d.score[1].ev[1].d += 1; }],
    ['unknown instrument', (d: any) => { d.inst = 'oboe'; }],
    ['shift out of range', (d: any) => { d.shift = 40; }],
    ['unsupported meter', (d: any) => { d.timeSig = [5, 4]; }],
    ['duplicate event id', (d: any) => { d.score[1].ev[1].id = d.score[1].ev[0].id; }],
    ['empty score', (d: any) => { d.score = []; }],
    ['pitch out of range', (d: any) => { d.score[0].ev[0].m = 200; }],
    ['bad volta', (d: any) => { d.score[0].volta = '3'; }],
    ['bad mode', (d: any) => { d.originalMode = 'ionian'; }],
    ['cap above the meter', (d: any) => { d.score[0].cap = 60; }],
    ['cap not on the grid', (d: any) => { d.score[0].cap = 4; }],
  ])('refuses a damaged document: %s', (_n, m) => {
    expect(broken(m)).toEqual({ ok: false, reason: 'damaged' });
  });

  describe('triplets', () => {
    // Replaces bar 1 (a full 4/4 bar) with the given lengths.
    const withBar = (lengths: number[]) => (d: any) => {
      d.score[1].ev = lengths.map((len, k) => ({ id: `tr${k}`, m: 60, d: len, r: false, tie: false, l: '' }));
      d.chords = {};
      d.fingering = {};
      d.imported = { lyrics: {}, chords: {} };
    };

    it('accepts a bar with a triplet group and round-trips it', () => {
      const f: any = JSON.parse(serializeFile(doc()));
      withBar([4, 4, 4, 12, 24])(f.doc);
      const r = parseFile(f);
      expect(r.ok).toBe(true);
      const back = parseFileText(serializeFile((r as any).doc));
      expect(back.ok && canonical(back.doc)).toBe(canonical((r as any).doc));
      expect(back.ok && back.doc.score[1].ev.map(e => e.d)).toEqual([4, 4, 4, 12, 24]);
    });

    it.each([
      ['a lone 4 and a lone 8', [4, 12, 8, 24]],
      ['a group starting at tick 3', [3, 4, 4, 4, 12, 24]],
      ['a length of 5', [5, 7, 12, 24]],
    ])('refuses %s as damaged', (_n, lengths) => {
      const f: any = JSON.parse(serializeFile(doc()));
      withBar(lengths)(f.doc);
      expect(parseFile(f)).toEqual({ ok: false, reason: 'damaged' });
    });
  });

  it('accepts a modal originalMode', () => {
    expect(broken(d => { d.originalMode = 'dorian'; }).ok).toBe(true);
  });

  it('refuses a score with more than 2000 bars as damaged; 2000 bars are fine', () => {
    const grow = (n: number) => (d: any) => {
      const full = d.score[1];
      d.score = Array.from({ length: n }, (_, k) => ({ ...full, ev: full.ev.map((e: any) => ({ ...e, id: `b${k}-${e.id}` })) }));
      d.chords = {};
    };
    expect(broken(grow(2000)).ok).toBe(true);
    expect(broken(grow(2001))).toEqual({ ok: false, reason: 'damaged' });
  });

  it('refuses a bar with more than 64 events as damaged', () => {
    expect(broken(d => {
      d.score[1].ev = Array.from({ length: 65 }, (_, k) => ({ id: `x${k}`, m: 60, d: 3, r: false, tie: false, l: '' }));
    })).toEqual({ ok: false, reason: 'damaged' });
  });

  it('readSheet refuses a file larger than 5 MB without reading it', async () => {
    const big = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.fingerscore.json');
    const text = vi.spyOn(big, 'text');
    expect(await readSheet(big)).toEqual({ ok: false, reason: 'not-a-sheet' });
    expect(text).not.toHaveBeenCalled();
    const ok = new File([serializeFile(doc())], 'ok.fingerscore.json');
    expect((await readSheet(ok)).ok).toBe(true);
  });

  it.each(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty'])('refuses the event id %s as damaged', id => {
    const f: any = JSON.parse(serializeFile(doc()));
    const old = f.doc.score[0].ev[0].id;
    f.doc.score[0].ev[0].id = id;
    f.doc.chords = { [id]: { ...f.doc.chords[old] ?? { raw: 'C', ok: true, pc: 0, rest: '', bass: null, tk: 0 } } };
    const r = parseFileText(JSON.stringify(f));   // JSON.parse makes "__proto__" an own key, as a real file would
    expect(r).toEqual({ ok: false, reason: 'damaged' });
  });

  it('accepts cut time', () => {
    expect(broken(d => { d.timeSig = [2, 2]; }).ok).toBe(true);   // the sample's bars already hold 48 ticks
  });
  it('accepts a pickup bar shorter than the meter', () => {
    const r = broken(d => {
      const bar = d.score[0];
      bar.ev = [{ ...bar.ev[0], d: 12 }];
      bar.cap = 12;
    });
    expect(r.ok).toBe(true);
  });

  it.each(['MuseScore', 'ABC'])('keeps the import format %s', format => {
    const r = broken(d => { d.source = { file: 'x', format, track: '1', trackCount: 2, simplified: false }; });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.source.format).toBe(format);
  });

  it('repairs what can be repaired', () => {
    const r = broken(d => {
      delete d.title; delete d.show; d.chartStyle = 'fancy'; d.extra = 1; d.tempo = 999;
      d.fingering = { nope: 1, [d.score[0].ev[0].id]: 99 };
      d.chords = { nope: { raw: 'C', ok: true, pc: 0, rest: '', bass: null, tk: 0 } };
      delete d.source;
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc).toMatchObject({ title: '', chartStyle: 'compact', tempo: 200, fingering: {}, chords: {},
      show: { fingerings: true, chords: true, lyrics: true, raiseExtensions: true } });
    expect('extra' in r.doc).toBe(false);
    expect(r.doc.source.format).toBe('file');
  });

  it('opens a document without imported maps and with stray c fields, with empty maps', () => {
    const r = broken(d => {
      delete d.imported;
      for (const bar of d.score) for (const e of bar.ev) e.c = 'C';
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.imported).toEqual({ lyrics: {}, chords: {} });
    expect('c' in r.doc.score[0].ev[0]).toBe(false);
  });

  it('keeps imported texts of existing events only', () => {
    const r = broken(d => {
      const [a, b] = [d.score[0].ev[0].id, d.score[0].ev[1].id];
      d.imported = { lyrics: { [a]: 'la', nope: 'x', [b]: 3 }, chords: 'bad' };
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.imported).toEqual({ lyrics: { [r.doc.score[0].ev[0].id]: 'la' }, chords: {} });
  });

  it('the sample keeps its lyrics and chord texts as imported', () => {
    const d = doc();
    const first = d.score.flatMap(b => b.ev).find(e => e.l)!;
    expect(d.imported.lyrics[first.id]).toBe(first.l);
    expect(Object.keys(d.imported.chords)).toEqual(Object.keys(d.chords));
    expect(Object.values(d.imported.chords)).toEqual(Object.values(d.chords).map(c => c.raw));
  });

  it('keeps a valid override and drops one that no longer fits', () => {
    const d = doc();
    const withAlt = findAltEvent(d);
    const f: any = JSON.parse(serializeFile({ ...d, fingering: { [withAlt.id]: 1 } }));
    expect((parseFile(f) as any).doc.fingering).toEqual({ [withAlt.id]: 1 });
    f.doc.fingering[withAlt.id] = 57;
    expect((parseFile(f) as any).doc.fingering).toEqual({});
  });

  it.each([
    ['fractional pc', { pc: 0.5, tk: 7 }],
    ['pc above 11', { pc: 12 }],
    ['negative tk', { tk: -1 }],
    ['fractional bass', { bass: 2.5, tk: 7 }],
    ['bass above 11', { bass: 12 }],
    ['ok not boolean', { ok: 1 }],
    ['raw not a string', { raw: 3 }],
  ])('drops a chord with a bad shape (%s) and still opens the document', (_n, patch) => {
    const r = broken(d => {
      const [a, b] = [d.score[0].ev[0].id, d.score[0].ev[1].id];
      d.chords = { [a]: { raw: 'C', ok: true, pc: 0, rest: '', bass: null, tk: 0, ...patch }, [b]: { raw: 'G/B', ok: true, pc: 7, rest: '', bass: 11, tk: 0 } };
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.doc.chords)).toEqual([r.doc.score[0].ev[1].id]);
    expect(() => derive(r.doc, DEFAULT_PREFS)).not.toThrow();
  });

  it('canonical ignores key order', () => {
    const d = doc();
    const shuffled = JSON.parse(JSON.stringify(d, Object.keys(d).reverse())) as Doc;
    expect(canonical({ ...shuffled, score: d.score, fingering: d.fingering, chords: d.chords, imported: d.imported, show: d.show, source: d.source })).toBe(canonical(d));
  });

  it('canonical sees every change', () => {
    const d = doc();
    expect(canonical({ ...d, tempo: d.tempo + 1 })).not.toBe(canonical(d));
    expect(canonical({ ...d, show: { ...d.show, lyrics: false } })).not.toBe(canonical(d));
    expect(canonical({ ...d, source: { ...d.source, file: 'x' } })).not.toBe(canonical(d));
  });

  it('file names', () => {
    expect(fileName('Auld Lang Syne')).toBe('auld-lang-syne.fingerscore.json');
    expect(fileName('  Ça va?! ')).toBe('ca-va.fingerscore.json');
    expect(fileName('Žluťoučký kůň')).toBe('zlutoucky-kun.fingerscore.json');
    expect(fileName('Łódź Øl Straße Æon Œuvre Đ')).toBe('lodz-ol-strasse-aeon-oeuvre-d.fingerscore.json');
    expect(fileName('Işık')).toBe('isik.fingerscore.json');
    expect(fileName('þórður Ðı Ħ Ŧ Ŋ')).toBe('thordur-di-h-t-n.fingerscore.json');
    expect(fileName('ﬁne ＡＢＣ')).toBe('fine-abc.fingerscore.json');
    expect(fileName('a'.repeat(79) + ' b')).toBe(`${'a'.repeat(79)}.fingerscore.json`);
    expect(fileName('x'.repeat(100))).toBe(`${'x'.repeat(80)}.fingerscore.json`);
    expect(fileName('')).toBe('sheet.fingerscore.json');
  });

  it('messages', () => {
    expect(importMessage('a.json', 'not-a-sheet')).toBe('"a.json" isn\'t a fingerscore sheet.');
    expect(importMessage('a.json', 'damaged')).toBe('"a.json" is damaged and can\'t be opened.');
  });
});

describe('library file', () => {
  const sheets = (...titles: string[]): LibrarySheet[] =>
    titles.map((title, i) => ({ title, inst: 'Alto sax in E♭', key: 'G major', fam: 'Saxophone', savedAt: `2026-11-2${i + 1}T10:00:00.000Z`, doc: { ...sampleDoc('asax'), title } }));

  it('envelope: kind "library" and one object per sheet', () => {
    const file = JSON.parse(serializeLibrary(sheets('A', 'B'), new Date('2026-11-23T12:00:00Z')));
    expect(file).toMatchObject({ app: 'fingerscore', format: 1, kind: 'library', savedAt: '2026-11-23T12:00:00.000Z' });
    expect(file.sheets.map((sh: LibrarySheet) => Object.keys(sh))).toEqual([['title', 'inst', 'key', 'fam', 'savedAt', 'doc'], ['title', 'inst', 'key', 'fam', 'savedAt', 'doc']]);
    expect(LIBRARY_FILE_NAME).toBe('fingerscore-library.json');
  });

  it('leaves out what a library entry holds besides the listed fields (its id)', () => {
    const entry = { ...sheets('A')[0], id: 'secret-id' };
    expect(serializeLibrary([entry])).not.toContain('secret-id');
  });

  it('round-trips every document and its save time', () => {
    const r = parseImportText(serializeLibrary(sheets('A', 'B')));
    expect(r).toMatchObject({ ok: true, kind: 'library', skipped: 0 });
    if (!r.ok || r.kind !== 'library') return;
    expect(r.sheets.map(sh => sh.doc)).toEqual(sheets('A', 'B').map(sh => sh.doc));
    expect(r.sheets.map(sh => sh.savedAt)).toEqual(['2026-11-21T10:00:00.000Z', '2026-11-22T10:00:00.000Z']);
  });

  it('a single sheet file is still read as a sheet', () => {
    expect(parseImportText(serializeFile({ ...sampleDoc('fl'), title: 'One' }))).toMatchObject({ ok: true, kind: 'sheet', title: 'One' });
    expect(parseImportText('{"name":"x"}')).toEqual({ ok: false, reason: 'not-a-sheet' });
    expect(parseImportText('not json')).toEqual({ ok: false, reason: 'not-a-sheet' });
  });

  it('skips damaged sheets and counts them; an unusable save time becomes null', () => {
    const file = JSON.parse(serializeLibrary(sheets('A', 'B', 'C')));
    file.sheets[1].doc.score = [];
    file.sheets[2].savedAt = 'yesterday';
    file.sheets.push(null, { title: 'no doc' });
    const r = parseImport(file);
    expect(r).toMatchObject({ ok: true, kind: 'library', skipped: 3 });
    if (!r.ok || r.kind !== 'library') return;
    expect(r.sheets.map(sh => [sh.doc.title, sh.savedAt])).toEqual([['A', '2026-11-21T10:00:00.000Z'], ['C', null]]);
  });

  it('refuses a library without sheets, with only damaged sheets, of another format, or with too many sheets', () => {
    const base = { app: 'fingerscore', format: 1, kind: 'library', savedAt: '' };
    expect(parseImport({ ...base, sheets: [] })).toEqual({ ok: false, reason: 'empty-library' });
    expect(parseImport({ ...base, sheets: [{ doc: {} }] })).toEqual({ ok: false, reason: 'damaged' });
    expect(parseImport({ ...base })).toEqual({ ok: false, reason: 'not-a-sheet' });
    expect(parseImport({ ...base, format: 2, sheets: sheets('A') })).toEqual({ ok: false, reason: 'not-a-sheet' });
    expect(parseImport({ ...base, app: 'other', sheets: sheets('A') })).toEqual({ ok: false, reason: 'not-a-sheet' });
    expect(parseImport({ ...base, sheets: Array.from({ length: MAX_LIBRARY_SHEETS + 1 }, () => null) })).toEqual({ ok: false, reason: 'damaged' });
  });

  it('a library file is not a sheet for "Open JSON file…"', () => {
    expect(parseFileText(serializeLibrary(sheets('A')))).toEqual({ ok: false, reason: 'not-a-sheet' });
  });

  it('readImport reads a library of more than 5 MB but refuses a single sheet of that size, and anything over 20 MB unread', async () => {
    const sized = (text: string, size: number) => { const f = new File([text], 'x.json'); Object.defineProperty(f, 'size', { value: size }); return f; };
    expect((await readImport(sized(serializeLibrary(sheets('A')), MAX_FILE_BYTES + 1))).ok).toBe(true);
    expect(await readImport(sized(serializeFile(sampleDoc('asax')), MAX_FILE_BYTES + 1))).toEqual({ ok: false, reason: 'not-a-sheet' });
    const huge = sized('{}', MAX_LIBRARY_BYTES + 1);
    const text = vi.spyOn(huge, 'text');
    expect(await readImport(huge)).toEqual({ ok: false, reason: 'not-a-sheet' });
    expect(text).not.toHaveBeenCalled();
  });

  it('messages', () => {
    expect(importMessage('a.json', 'empty-library')).toBe('"a.json" holds no sheets.');
    expect(importedMessage(1, 0)).toBe('1 sheet added to your sheets');
    expect(importedMessage(3, 0)).toBe('3 sheets added to your sheets');
    expect(importedMessage(3, 1)).toBe('3 sheets added to your sheets · 1 damaged sheet skipped');
    expect(importedMessage(2, 2)).toBe('2 sheets added to your sheets · 2 damaged sheets skipped');
  });
});

describe('jump marks', () => {
  const marked = (): Doc => {
    const d = doc();
    d.score = d.score.map((b, i) => (i === 1 ? { ...b, segno: true, coda: true, fine: true, toCoda: true, jump: 'dsCoda' as const } : b));
    d.source = { ...d.source, dropped: ['Jump to Coda', 'a second Segno'] };
    return d;
  };

  it('a sheet saved without the fields loads without them', () => {
    const r = parseFileText(serializeFile(doc()));
    if (!r.ok) throw new Error('not ok');
    for (const bar of r.doc.score) for (const k of ['segno', 'coda', 'fine', 'toCoda', 'jump']) expect(k in bar).toBe(false);
    expect('dropped' in r.doc.source).toBe(false);
  });

  it('every field round-trips through serialize and parse', () => {
    const r = parseFileText(serializeFile(marked()));
    expect(r.ok && canonical(r.doc)).toBe(canonical(marked()));
    expect(r.ok && r.doc.score[1]).toMatchObject({ segno: true, coda: true, fine: true, toCoda: true, jump: 'dsCoda' });
    expect(r.ok && r.doc.source.dropped).toEqual(['Jump to Coda', 'a second Segno']);
  });

  it('every field round-trips through the library store and the library file', () => {
    localStorage.clear();
    const saved = saveEntry(marked(), null);
    if (!saved.ok) throw new Error('not saved');
    expect(canonical(listEntries()[0].doc)).toBe(canonical(marked()));
    const sheet: LibrarySheet = { title: 't', inst: 'i', key: 'k', fam: 'f', savedAt: '2026-11-25T00:00:00.000Z', doc: marked() };
    const r = parseImportText(serializeLibrary([sheet]));
    expect(r.ok && r.kind === 'library' && canonical(r.sheets[0].doc)).toBe(canonical(marked()));
  });

  it.each(['dc', 'dcFine', 'dcCoda', 'ds', 'dsFine', 'dsCoda'])('keeps the jump %s', jump => {
    const d = doc();
    d.score[0] = { ...d.score[0], jump: jump as 'dc' };
    const r = parseFileText(serializeFile(d));
    expect(r.ok && r.doc.score[0].jump).toBe(jump);
  });

  it('drops an unknown jump and a sign that is not true, and keeps the bar', () => {
    const file = JSON.parse(serializeFile(doc()));
    Object.assign(file.doc.score[0], { jump: 'coda', segno: false, coda: 'yes', fine: 1, toCoda: null });
    Object.assign(file.doc.score[1], { jump: 7, segno: true });
    const r = parseFile(file);
    if (!r.ok) throw new Error('not ok');
    for (const k of ['jump', 'segno', 'coda', 'fine', 'toCoda']) expect(k in r.doc.score[0]).toBe(false);
    expect('jump' in r.doc.score[1]).toBe(false);
    expect(r.doc.score[1].segno).toBe(true);
  });

  it('keeps the strings of dropped and leaves the field out when the list is empty or holds no strings', () => {
    const withList = (dropped: unknown) => {
      const file = JSON.parse(serializeFile(doc()));
      file.doc.source.dropped = dropped;
      const r = parseFile(file);
      if (!r.ok) throw new Error('not ok');
      return r.doc.source;
    };
    expect(withList(['a', 3, 'b']).dropped).toEqual(['a', 'b']);
    expect('dropped' in withList([])).toBe(false);
    expect('dropped' in withList([1, null])).toBe(false);
    expect('dropped' in withList('a')).toBe(false);
  });
});

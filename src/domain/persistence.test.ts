import { describe, expect, it } from 'vitest';
import { sampleDoc } from './fixture';
import { inst } from './instruments';
import { optionsFor } from './fingerings';
import { derive } from './derive';
import { DEFAULT_PREFS } from './transpose';
import { canonical, fileName, importMessage, MAX_FILE_BYTES, parseFile, parseFileText, readSheet, serializeFile, toFile } from './persistence';
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
    ['bad mode', (d: any) => { d.originalMode = 'dorian'; }],
    ['cap above the meter', (d: any) => { d.score[0].cap = 60; }],
    ['cap not on the grid', (d: any) => { d.score[0].cap = 4; }],
  ])('refuses a damaged document: %s', (_n, m) => {
    expect(broken(m)).toEqual({ ok: false, reason: 'damaged' });
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
      d.score[1].ev = Array.from({ length: 65 }, (_, k) => ({ id: `x${k}`, m: 60, d: 3, r: false, tie: false, l: '', c: '' }));
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

  it('accepts a pickup bar shorter than the meter', () => {
    const r = broken(d => {
      const bar = d.score[0];
      bar.ev = [{ ...bar.ev[0], d: 12 }];
      bar.cap = 12;
    });
    expect(r.ok).toBe(true);
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
    expect(canonical({ ...shuffled, score: d.score, fingering: d.fingering, chords: d.chords, show: d.show, source: d.source })).toBe(canonical(d));
  });

  it('canonical sees every change', () => {
    const d = doc();
    expect(canonical({ ...d, tempo: d.tempo + 1 })).not.toBe(canonical(d));
    expect(canonical({ ...d, show: { ...d.show, lyrics: false } })).not.toBe(canonical(d));
    expect(canonical({ ...d, source: { ...d.source, file: 'x' } })).not.toBe(canonical(d));
  });

  it('file names', () => {
    expect(fileName('Auld Lang Syne')).toBe('auld-lang-syne.fingerscore.json');
    expect(fileName('  Ça va?! ')).toBe('a-va.fingerscore.json');
    expect(fileName('')).toBe('sheet.fingerscore.json');
  });

  it('messages', () => {
    expect(importMessage('a.json', 'not-a-sheet')).toBe('"a.json" isn\'t a fingerscore sheet.');
    expect(importMessage('a.json', 'damaged')).toBe('"a.json" is damaged and can\'t be opened.');
  });
});

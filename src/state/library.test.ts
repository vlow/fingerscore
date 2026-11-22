import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleDoc } from '../domain/fixture';
import { optionsFor } from '../domain/fingerings';
import { inst, ORDER } from '../domain/instruments';
import { canonical, serializeFile, validateDoc } from '../domain/persistence';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { buildDoc } from '../import/buildDoc';
import { defaultBuildOptions } from '../import';
import { parseMidi } from '../import/midi';
import { parseMusicXml } from '../import/musicxml';
import type { ParsedSong } from '../import/types';
import { BLOCKED_MESSAGE, FULL_MESSAGE, INCONSISTENT_MESSAGE, deleteEntry, getEntry, listEntries, restoreEntry, saveEntry, writeFailureMessage } from './library';

beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
const T = (s: string) => new Date(s);

describe('library', () => {
  it('saves, lists newest first and updates in place', () => {
    const a = saveEntry(sampleDoc('asax'), null, T('2026-11-22T10:00:00Z'));
    const b = saveEntry({ ...sampleDoc('cl'), title: 'B' }, null, T('2026-11-22T11:00:00Z'));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(listEntries().map(e => e.title)).toEqual(['B', 'The Water Is Wide']);
    expect(listEntries()[1]).toMatchObject({ inst: 'Alto sax in E♭', savedAt: '2026-11-22T10:00:00.000Z' });
    const again = saveEntry({ ...sampleDoc('asax'), tempo: 80 }, a.entry.id, T('2026-11-22T12:00:00Z'));
    expect(again.ok && again.entry.id).toBe(a.entry.id);
    expect(listEntries().map(e => e.id)).toEqual([a.entry.id, b.entry.id]);
    expect(listEntries()).toHaveLength(2);
    expect(getEntry(a.entry.id)!.doc.tempo).toBe(80);
    expect(getEntry('nope')).toBeNull();
  });

  it('untitled sheets get a name', () => {
    const r = saveEntry({ ...sampleDoc('fl'), title: '  ' }, null);
    expect(r.ok && r.entry.title).toBe('Untitled sheet');
  });

  it('an unknown id creates a new entry (deleted in another tab)', () => {
    const r = saveEntry(sampleDoc('fl'), 'gone');
    expect(r.ok && r.entry.id).not.toBe('gone');
    expect(listEntries()).toHaveLength(1);
  });

  it('delete returns the entry and restore puts it back in order', () => {
    const a = saveEntry(sampleDoc('asax'), null, T('2026-11-22T10:00:00Z')) as any;
    const b = saveEntry(sampleDoc('cl'), null, T('2026-11-22T11:00:00Z')) as any;
    const removed = deleteEntry(a.entry.id)!;
    expect(listEntries().map(e => e.id)).toEqual([b.entry.id]);
    expect(restoreEntry(removed)).toBe(true);
    expect(listEntries().map(e => e.id)).toEqual([b.entry.id, a.entry.id]);
    expect(deleteEntry('nope')).toBeNull();
  });

  it('skips corrupt entries and survives corrupt storage', () => {
    const good = saveEntry(sampleDoc('asax'), null) as any;
    const raw = JSON.parse(localStorage.getItem('fingerscore.library.v1')!);
    raw.push({ id: 'x', title: 'bad', inst: '?', savedAt: 'x', doc: { score: 'no' } }, 42);
    localStorage.setItem('fingerscore.library.v1', JSON.stringify(raw));
    expect(listEntries().map(e => e.id)).toEqual([good.entry.id]);
    localStorage.setItem('fingerscore.library.v1', '{oops');
    expect(listEntries()).toEqual([]);
    localStorage.setItem('fingerscore.library.v1', '{"a":1}');
    expect(listEntries()).toEqual([]);
  });

  it('reports full storage', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, _k: string, v: string) {
      if (v.length > 200) throw new DOMException('quota');
    });
    expect(saveEntry(sampleDoc('asax'), null)).toEqual({ ok: false, message: FULL_MESSAGE });
    spy.mockRestore();
    expect(listEntries()).toEqual([]);
  });

  it('reports blocked storage', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    expect(saveEntry(sampleDoc('asax'), null)).toEqual({ ok: false, message: BLOCKED_MESSAGE });
    spy.mockRestore();
  });

  it('leaves no probe key behind', () => {
    saveEntry(sampleDoc('asax'), null);
    expect(localStorage.length).toBe(1);
  });

  it('writeFailureMessage tells blocked storage from full storage', () => {
    expect(writeFailureMessage()).toBe(FULL_MESSAGE);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    expect(writeFailureMessage()).toBe(BLOCKED_MESSAGE);
    spy.mockRestore();
  });
});

describe('saveEntry refuses what the library could not read back', () => {
  it('an inconsistent sheet is not written', () => {
    const d = sampleDoc('asax');
    const bad: Doc = { ...d, score: d.score.map((bar, k) => (k === 1 ? { ...bar, cap: bar.cap - 3 } : bar)) };   // events no longer sum to cap
    expect(saveEntry(bad, null)).toEqual({ ok: false, message: INCONSISTENT_MESSAGE });
    expect(INCONSISTENT_MESSAGE).toBe("This sheet can't be saved: its data is inconsistent.");
    expect(localStorage.getItem('fingerscore.library.v1')).toBeNull();
  });

  it("every sheet the app builds survives the file round trip (12 instruments × 2 recorder systems × every fixture, overrides on every note with alternates)", async () => {
    const songs: ParsedSong[] = [parseMidi('Auld_Lang_Syne.mid', new Uint8Array(readFileSync('public/demo/Auld_Lang_Syne.mid')))];
    const dir = 'src/import/fixtures';
    for (const name of readdirSync(dir).filter(n => n.endsWith('.musicxml')).sort()) {
      try {
        songs.push(await parseMusicXml(name, new Uint8Array(readFileSync(`${dir}/${name}`))));
      } catch {
        expect(name).toBe('seven-eight.musicxml');   // the one fixture the importer refuses (7/8)
      }
    }
    expect(songs).toHaveLength(7);
    expect(ORDER).toHaveLength(12);
    let checked = 0;
    let overrides = 0;
    for (const song of songs) {
      for (const instId of ORDER) {
        for (const recorderSystem of ['baroque', 'german'] as const) {
          const built = { ...buildDoc(song, defaultBuildOptions(song, instId, DEFAULT_PREFS)), recorderSystem };
          const fingering: Doc['fingering'] = {};
          for (const bar of built.score) for (const e of bar.ev) {
            if (e.r) continue;
            const n = optionsFor(instId, e.m + built.shift + inst(instId).off, recorderSystem).length;
            if (n >= 2) fingering[e.id] = n - 1;
          }
          overrides += Object.keys(fingering).length;
          const doc: Doc = { ...built, fingering };
          const back = validateDoc(JSON.parse(serializeFile(doc)).doc);
          expect(back && canonical(back), `${song.file} · ${instId} · ${recorderSystem}`).toBe(canonical(doc));
          checked++;
        }
      }
    }
    expect(checked).toBe(7 * 12 * 2);
    expect(overrides).toBeGreaterThan(0);
  });
});

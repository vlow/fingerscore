import { inst, ORDER } from './instruments';
import { optionsFor, legend, hasSatellites, coverageGaps, documentedGaps, rawGaps, meta, LAYOUT, SATS } from './fingerings';

it('xaphoon covers C4–C6 from the official chart', () => {
  for (let w = 60; w <= 84; w++) expect(optionsFor('xc', w, 'baroque').length, String(w)).toBeGreaterThan(0);
  expect(optionsFor('xc', 60, 'baroque')[0].h).toEqual([1,1,1,1,1,1,1,1,1]);
  expect(optionsFor('xc', 61, 'baroque')[0].h).toEqual([1,1,1,1,1,1,1,1,0.5]);
  expect(optionsFor('xc', 71, 'baroque')[0].h).toEqual([1,1,0,1,1,1,0,0,1]);
  expect(optionsFor('xc', 74, 'baroque')[0].h).toEqual([1,0,0,0,0,0,0,0,1]);
  expect(optionsFor('xbb', 74, 'baroque')).toEqual(optionsFor('xc', 74, 'baroque'));
});

it('xaphoon upper register as re-read from the official chart', () => {
  expect(optionsFor('xc', 80, 'baroque')[0].h).toEqual([0,1,1,1,1,1,1,1,0.5]);
  expect(optionsFor('xc', 81, 'baroque')[0].h).toEqual([0,1,1,1,1,1,1,1,0]);
  expect(optionsFor('xc', 82, 'baroque')[0].h).toEqual([1,1,1,1,1,1,1,0,0]);
  expect(optionsFor('xc', 83, 'baroque')[0].h).toEqual([1,1,1,1,1,1,0,0,0]);
  expect(optionsFor('xc', 84, 'baroque')[0].h).toEqual([1,1,1,1,1,0,0,0,0]);
});

it('option arrays match the layout', () => {
  for (const id of ORDER) for (let w = inst(id).lo; w <= inst(id).ext; w++)
    for (const o of optionsFor(id, w, 'baroque')) {
      expect(o.h).toHaveLength(LAYOUT[inst(id).kind].length);
      for (const k of o.x) expect(SATS[inst(id).kind as 'sax'][k], `${id} ${w} ${k}`).toBeDefined();
    }
});

const gapKey = (g: { inst: string; pitch: number; system: string }) => `${g.inst}:${g.pitch}:${g.system}`;

it('every gap is documented, in both recorder systems', () => {
  const doc = new Set(documentedGaps().map(gapKey));
  expect(coverageGaps().filter(g => !doc.has(gapKey(g)))).toEqual([]);
  expect(coverageGaps().some(g => g.system === 'german')).toBe(true);
});

it('no documented gap has data', () => {
  for (const g of documentedGaps()) expect(optionsFor(g.inst, g.pitch, g.system), gapKey(g)).toEqual([]);
});

it('a German gap entry is a real German gap: the baroque table has data there', () => {
  for (const g of documentedGaps().filter(g => g.system === 'german')) {
    expect(inst(g.inst).kind, gapKey(g)).toBe('rec');
    expect(optionsFor(g.inst, g.pitch, 'baroque').length, gapKey(g)).toBeGreaterThan(0);
  }
});

async function withGaps(gaps: unknown[], run: (m: typeof import('./fingerings')) => void) {
  const path = '../data/fingering-gaps.json';
  vi.resetModules();
  vi.doMock(path, () => ({ default: { gaps } }));
  try { run(await import('./fingerings')); } finally { vi.doUnmock(path); vi.resetModules(); }
}

it('a kind entry in the gap list expands to every instrument of that kind', async () => {
  await withGaps([{ kind: 'sax', pitch: 80, note: 'test', checked: [] }], m => {
    expect(m.documentedGaps().map(g => g.inst).sort()).toEqual(['asax', 'bsax', 'ssax', 'tsax']);
  });
});

it('a kind entry skips instruments whose range does not reach the pitch', async () => {
  await withGaps([{ kind: 'fl', pitch: 95, note: 'test', checked: [] }, { kind: 'fl', pitch: 61, note: 'test', checked: [] }], m => {
    expect(m.documentedGaps().map(g => `${g.inst}:${g.pitch}`).sort()).toEqual(['afl:61', 'fl:61', 'fl:95', 'picc:95']);
  });
});

it('recorder systems', () => {
  expect(optionsFor('rs', 65, 'german')[0].h).not.toEqual(optionsFor('rs', 65, 'baroque')[0].h);   // F differs
  expect(optionsFor('ra', 70, 'german')[0].h).toEqual(optionsFor('rs', 65, 'german')[0].h);        // same index 5
  expect(optionsFor('rs', 60, 'german')).toEqual(optionsFor('rs', 60, 'baroque'));                  // C does not differ
});

it('returns no options outside the table', () => {
  expect(optionsFor('xc', 59, 'baroque')).toEqual([]);
  expect(optionsFor('rs', 59, 'baroque')).toEqual([]);
});

it('override wins over the kind table', async () => {
  const path = '../data/fingerings.json';
  const real = (await vi.importActual<{ default: Record<string, unknown> }>(path)).default;
  const own = { h: [0, 1, 1, 1, 1, 1, 1], x: [], n: 'test override', p: 0 };
  vi.resetModules();
  vi.doMock(path, () => ({ default: { ...real, overrides: { tsax: { '70': [own] } } } }));
  try {
    const m = await import('./fingerings');
    expect(m.optionsFor('tsax', 70, 'baroque')).toEqual([own]);
    expect(m.optionsFor('asax', 70, 'baroque')).toEqual(optionsFor('asax', 70, 'baroque'));
    expect(m.optionsFor('asax', 70, 'baroque')).not.toEqual([own]);
  } finally {
    vi.doUnmock(path);
    vi.resetModules();
  }
});

it('legend carries the draft suffix until reviewed', () => { expect(legend('xc')).toMatch(/ · fingering data: draft$/); });

it('satellite keys exist for sax, clarinet and flute only', () => {
  expect(['xaph', 'sax', 'cl', 'fl', 'rec'].filter(k => hasSatellites(k as 'sax'))).toEqual(['sax', 'cl', 'fl']);
});

// Normal-range gaps where the charts disagree; each waits for an owner decision (docs/fingering-gaps.md, "Waiting for the owner").
const OWNER_PENDING = [
  'ra:87:baroque', 'fl:60:baroque', 'afl:60:baroque',
  'rs:66:german', 'rs:68:german', 'rs:77:german', 'rs:78:german',
  'ra:71:german', 'ra:73:german', 'ra:82:german', 'ra:83:german',
];

it('gap list is short and sourced', () => {
  const gaps = documentedGaps();
  for (const g of rawGaps()) expect(g.checked.length, `${g.inst ?? g.kind}:${g.pitch}`).toBeGreaterThanOrEqual(2);
  const inRange = gaps.filter(g => g.pitch <= inst(g.inst).hi).map(gapKey);
  expect(inRange.filter(k => !OWNER_PENDING.includes(k))).toEqual([]);     // nothing else missing inside the normal range
  expect([...inRange].sort()).toEqual([...OWNER_PENDING].sort());          // every pending entry is still a real gap
});

it('named alternates exist', () => {
  expect(optionsFor('asax', 70, 'baroque').map(o => o.x.join())).toEqual(expect.arrayContaining(['bis', 'sBb']));
  expect(optionsFor('asax', 72, 'baroque').length).toBeGreaterThanOrEqual(2);
  expect(optionsFor('cl', 52, 'baroque').map(o => o.x.join())).toEqual(expect.arrayContaining(['lpE', 'rpE']));
  expect(optionsFor('fl', 70, 'baroque').length).toBeGreaterThanOrEqual(2);
});

it('every kind records two sources', () => { for (const k of ['xaph','sax','cl','fl','rec'] as const) expect(meta(k).sources.length).toBeGreaterThanOrEqual(2); });

it('an empty German entry shows no chart instead of the baroque fingering', () => {
  expect(optionsFor('rs', 66, 'baroque').length).toBeGreaterThan(0);
  expect(optionsFor('rs', 66, 'german')).toEqual([]);
});

it('an empty override hides the kind table for one instrument only', () => {
  expect(optionsFor('asax', 95, 'baroque').length).toBeGreaterThan(0);
  expect(optionsFor('tsax', 95, 'baroque')).toEqual([]);
});

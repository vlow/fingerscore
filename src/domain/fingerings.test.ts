import { inst, ORDER } from './instruments';
import { optionsFor, legend, hasSatellites, coverageGaps, documentedGaps, LAYOUT, SATS } from './fingerings';

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

it('every gap is documented', () => {
  const doc = new Set(documentedGaps().map(g => `${g.inst}:${g.pitch}`));
  expect(coverageGaps().filter(g => !doc.has(`${g.inst}:${g.pitch}`))).toEqual([]);
});

it('no documented gap has data', () => {
  for (const g of documentedGaps()) expect(optionsFor(g.inst, g.pitch, 'baroque'), `${g.inst}:${g.pitch}`).toEqual([]);
});

it('a kind entry in the gap list expands to every instrument of that kind', () => {
  const sax = documentedGaps().filter(g => g.pitch === 80).map(g => g.inst).sort();
  expect(sax).toEqual(expect.arrayContaining(['asax', 'bsax', 'ssax', 'tsax']));
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

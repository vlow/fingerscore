import { derive } from './derive';
import { sampleDoc } from './fixture';
import { DEFAULT_PREFS } from './transpose';
import { mkDoc } from '../test/helpers';

describe('derive', () => {
  it('derive: alto sax header and counts', () => {
    const d = derive(sampleDoc('asax'), DEFAULT_PREFS);
    expect(d.headerKeys).toBe('you read G major · sounds B♭ major');
    expect(d.isSuggested).toBe(true); expect(d.counts).toMatchObject({ notes: 41, bad: 0 });
  });
  it('derive: unplayable notes have no chart', () => {
    const doc = { ...sampleDoc('xc'), shift: 0 }; const d = derive(doc, DEFAULT_PREFS);
    expect(d.counts.bad).toBe(8);
    expect(d.events.filter(e => e.state === 'bad').every(e => e.chosen === null)).toBe(true);
  });
  it('derive: minor songs are named minor', () => {
    const d = derive({ ...sampleDoc('fl'), originalTonicPc: 9, originalMode: 'minor', shift: 0 }, DEFAULT_PREFS);
    expect(d.writtenKey).toBe('A minor'); expect(d.sig).toBe(0);
  });
  it('non-transposing header is the written key alone', () => {
    const d = derive(sampleDoc('xc'), DEFAULT_PREFS);
    expect(d.headerKeys).toBe('F major');
    expect(d.originalKey).toBe('D major');
  });
  it('tied continuations carry no accidental, chart or count', () => {
    const doc = mkDoc([{ ev: [[66, 24, { tie: true }], [66, 24]] }]);   // F♯4 tied over, C major
    const d = derive(doc, DEFAULT_PREFS);
    const [a, b] = d.events;
    expect(a.accidental).toBe('sharp'); expect(a.tieTo).toBe(true);
    expect(b.tiedFrom).toBe(true); expect(b.accidental).toBeNull();
    expect(b.options).toEqual([]); expect(b.chosen).toBeNull();
    expect(d.counts.notes).toBe(1);
  });
  it('a valid override wins, an invalid one is ignored', () => {
    const doc = mkDoc([{ ev: [[67, 24], [67, 24]] }]);
    const n = derive(doc, DEFAULT_PREFS).events[0].options.length;
    const d = derive({ ...doc, fingering: { t1: n - 1, t2: 99 } }, DEFAULT_PREFS);
    expect(d.byId.t1.chosen).toBe(n - 1); expect(d.byId.t1.overridden).toBe(true);
    expect(d.byId.t2.chosen).toBe(d.byId.t2.auto); expect(d.byId.t2.overridden).toBe(false);
    expect(d.counts.overridden).toBe(1);
  });
  it('no notes: min and max are 0', () => {
    const d = derive(mkDoc([{ ev: [[0, 48]] }]), DEFAULT_PREFS);
    expect([d.min, d.max, d.counts.notes]).toEqual([0, 0, 0]);
  });
});

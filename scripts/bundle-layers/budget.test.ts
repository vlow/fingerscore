import { evaluate, propose, type Budget, type Row } from './budget';
import type { LayerReport } from './layers';

const REPORT: LayerReport = {
  shell: { files: ['assets/index.js', 'assets/index.css'], outside: [] },
  routes: { '/': { entry: 'assets/Start.js', files: ['assets/Start.js'] }, '/about': { entry: 'assets/About.js', files: ['assets/About.js'] } },
  features: { 'src/ui/PlayMode.tsx': { entry: 'assets/PlayMode.js', files: ['assets/PlayMode.js'] } },
};
const SIZES = {
  'assets/index.js': { raw: 150_000, brotli: 50_000 },
  'assets/index.css': { raw: 20_000, brotli: 4_000 },
  'assets/Start.js': { raw: 40_000, brotli: 12_000 },
  'assets/About.js': { raw: 3_000, brotli: 1_000 },
  'assets/PlayMode.js': { raw: 9_000, brotli: 3_500 },
};
const BUDGET: Budget = { shell: 60_000, routeDefault: 2_000, featureDefault: 4_000, routes: { '/': 15_000 }, features: {} };

describe('evaluate', () => {
  it('passes within limits', () => {
    const { rows, failures } = evaluate(REPORT, SIZES, BUDGET);
    expect(failures).toEqual([]);
    expect(rows[0]).toEqual({ layer: 'shell', files: 2, raw: 170_000, brotli: 54_000, limit: 60_000 });
    expect(rows.map(r => r.layer)).toEqual(['shell', 'route /', 'route /about', 'feature src/ui/PlayMode.tsx']);
  });

  it('fails a layer over its limit', () => {
    const { failures } = evaluate(REPORT, SIZES, { ...BUDGET, shell: 50_000 });
    expect(failures).toEqual(['shell is 54000 bytes brotli, over its 50000 byte limit']);
  });

  it('falls back to routeDefault and featureDefault for unnamed layers', () => {
    const { rows, failures } = evaluate(REPORT, SIZES, { ...BUDGET, routeDefault: 900, featureDefault: 3_000 });
    expect(rows.find(r => r.layer === 'route /about')!.limit).toBe(900);
    expect(rows.find(r => r.layer === 'feature src/ui/PlayMode.tsx')!.limit).toBe(3_000);
    expect(failures).toEqual([
      'route /about is 1000 bytes brotli, over its 900 byte limit',
      'feature src/ui/PlayMode.tsx is 3500 bytes brotli, over its 3000 byte limit',
    ]);
  });

  it('fails on a shell module outside the allowlist', () => {
    const report = { ...REPORT, shell: { ...REPORT.shell, outside: [{ module: 'src/state/store.ts', chain: ['src/shell/main.tsx', 'src/shell/App.tsx', 'src/state/store.ts'] }] } };
    expect(evaluate(report, SIZES, BUDGET).failures).toEqual([
      'the shell holds src/state/store.ts, imported via src/shell/main.tsx → src/shell/App.tsx → src/state/store.ts',
    ]);
  });
});

describe('propose', () => {
  const row = (layer: string, brotli: number): Row => ({ layer, files: 1, raw: brotli * 3, brotli, limit: 0 });

  it('rounds up', () => {
    const b = propose([row('shell', 50_000), row('route /', 10_000)]);
    expect(b.shell).toBe(55_296);
    expect(b.routes['/']).toBe(13_312);
    expect(b.routeDefault).toBe(13_312);
  });

  it('leaves library features out of featureDefault', () => {
    const b = propose([row('shell', 1_000), row('feature src/pdf/sheetPdf.ts', 150_000), row('feature src/ui/PlayMode.tsx', 3_500)]);
    expect(b.features['src/pdf/sheetPdf.ts']).toBe(188_416);
    expect(b.features['src/ui/PlayMode.tsx']).toBe(5_120);
    expect(b.featureDefault).toBe(5_120);
  });
});

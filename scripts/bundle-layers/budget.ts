// The size budget per layer, in brotli bytes (bundle-budget.json), and its check. Pure, so budget.test.ts needs no build.
import type { LayerReport } from './layers';

export interface Budget {
  shell: number;
  /** For a route or feature without its own entry below. */
  routeDefault: number;
  featureDefault: number;
  routes: Record<string, number>;
  features: Record<string, number>;
}

export interface Row { layer: string; files: number; raw: number; brotli: number; limit: number }

/** Features that are a large library by nature; they keep their own limits and do not set the default for new features. */
export const LIBRARY_FEATURES = ['src/pdf/sheetPdf.ts', 'src/pdf/scalePdf.ts', 'src/import/abc.ts', 'src/import/mscz.ts', 'src/import/midi.ts'];

/** Room on top of a measured size: the owner's decision of 25 Nov 2026 (design section 7). */
const SHELL_ROOM = 1.10;
const LAYER_ROOM = 1.25;

export function evaluate(report: LayerReport, sizes: Record<string, { raw: number; brotli: number }>, budget: Budget): { rows: Row[]; failures: string[] } {
  const row = (layer: string, files: string[], limit: number): Row => ({
    layer,
    files: files.length,
    raw: files.reduce((n, f) => n + sizes[f].raw, 0),
    brotli: files.reduce((n, f) => n + sizes[f].brotli, 0),
    limit,
  });
  const rows = [
    row('shell', report.shell.files, budget.shell),
    ...Object.entries(report.routes).map(([path, r]) => row(`route ${path}`, r.files, budget.routes[path] ?? budget.routeDefault)),
    ...Object.entries(report.features).map(([name, f]) => row(`feature ${name}`, f.files, budget.features[name] ?? budget.featureDefault)),
  ];
  const failures = [
    ...rows.filter(r => r.brotli > r.limit).map(r => `${r.layer} is ${r.brotli} bytes brotli, over its ${r.limit} byte limit`),
    ...report.shell.outside.map(o => `the shell holds ${o.module}, imported via ${o.chain.join(' → ')}`),
  ];
  return { rows, failures };
}

const roundUp = (n: number) => Math.ceil(n / 1024) * 1024;

/** Limits from measured sizes: shell plus 10 %, every route and feature plus 25 %, each rounded up to whole KB. */
export function propose(rows: Row[]): Budget {
  const budget: Budget = { shell: 0, routeDefault: 0, featureDefault: 0, routes: {}, features: {} };
  for (const r of rows) {
    if (r.layer === 'shell') budget.shell = roundUp(r.brotli * SHELL_ROOM);
    else if (r.layer.startsWith('route ')) budget.routes[r.layer.slice('route '.length)] = roundUp(r.brotli * LAYER_ROOM);
    else if (r.layer.startsWith('feature ')) budget.features[r.layer.slice('feature '.length)] = roundUp(r.brotli * LAYER_ROOM);
  }
  budget.routeDefault = Math.max(0, ...Object.values(budget.routes));
  budget.featureDefault = Math.max(0, ...Object.entries(budget.features).filter(([name]) => !LIBRARY_FEATURES.includes(name)).map(([, n]) => n));
  return budget;
}

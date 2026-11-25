import { computeLayers, preloadMap, preloadScript, type ChunkNode, type LayerReport } from './layers';

const chunk = (file: string, o: Partial<ChunkNode> = {}): ChunkNode =>
  ({ file, isEntry: false, facadeModuleId: null, imports: [], dynamicImports: [], css: [], moduleIds: [], ...o });

const GRAPH: ChunkNode[] = [
  chunk('assets/index.js', {
    isEntry: true, facadeModuleId: 'src/shell/main.tsx', moduleIds: ['src/shell/main.tsx', 'node_modules/react/index.js'],
    imports: ['assets/react.js'], dynamicImports: ['assets/Start.js', 'assets/SheetPage.js', 'assets/store.js'], css: ['assets/index.css'],
  }),
  chunk('assets/react.js', { moduleIds: ['node_modules/react-dom/index.js'] }),
  chunk('assets/Start.js', { facadeModuleId: 'src/pages/Start.tsx', moduleIds: ['src/pages/Start.tsx'], imports: ['assets/store.js', 'assets/react.js'], css: ['assets/Start.css'] }),
  chunk('assets/SheetPage.js', { facadeModuleId: 'src/pages/SheetPage.tsx', moduleIds: ['src/pages/SheetPage.tsx'], imports: ['assets/store.js'], dynamicImports: ['assets/pdf.js'] }),
  chunk('assets/store.js', { moduleIds: ['src/state/store.ts'] }),
  chunk('assets/pdf.js', { facadeModuleId: 'src/pdf/sheetPdf.ts', moduleIds: ['src/pdf/sheetPdf.ts'], imports: ['assets/store.js', 'assets/jspdf.js'] }),
  chunk('assets/jspdf.js', { moduleIds: ['node_modules/jspdf/dist/jspdf.es.min.js'] }),
];
const ROUTES = { '/': 'src/pages/Start.tsx', '/sheet': 'src/pages/SheetPage.tsx' };
const noImporters = () => [];

describe('computeLayers', () => {
  it('splits shell, routes and features', () => {
    const r = computeLayers(GRAPH, ROUTES, noImporters);
    expect(r.shell.files).toEqual(['assets/index.css', 'assets/index.js', 'assets/react.js']);
    expect(r.shell.outside).toEqual([]);
    expect(r.routes['/']).toEqual({ entry: 'assets/Start.js', files: ['assets/Start.css', 'assets/Start.js', 'assets/store.js'] });
    expect(r.routes['/sheet']).toEqual({ entry: 'assets/SheetPage.js', files: ['assets/SheetPage.js', 'assets/store.js'] });
    expect(r.features).toEqual({ 'src/pdf/sheetPdf.ts': { entry: 'assets/pdf.js', files: ['assets/jspdf.js', 'assets/pdf.js'] } });
  });

  it('reports a module outside the shell with its chain', () => {
    const graph = GRAPH.map(c => (c.isEntry ? { ...c, moduleIds: [...c.moduleIds, 'src/state/store.ts'] } : c));
    const importers: Record<string, string[]> = { 'src/state/store.ts': ['src/shell/App.tsx'], 'src/shell/App.tsx': ['src/shell/main.tsx'] };
    const r = computeLayers(graph, ROUTES, id => importers[id] ?? []);
    expect(r.shell.outside).toEqual([{ module: 'src/state/store.ts', chain: ['src/shell/main.tsx', 'src/shell/App.tsx', 'src/state/store.ts'] }]);
  });

  it('allows the listed packages and files', () => {
    const allowed = ['node_modules/react-router/dist/index.js', 'node_modules/@remix-run/router/dist/router.js', 'node_modules/zustand/esm/vanilla.mjs',
      'node_modules/scheduler/index.js', 'src/styles/global.css', 'src/styles/tokens.css', 'src/content/repository.ts', '\0vite/preload-helper.js', 'index.html'];
    const graph = GRAPH.map(c => (c.isEntry ? { ...c, moduleIds: [...c.moduleIds, ...allowed] } : c));
    expect(computeLayers(graph, ROUTES, noImporters).shell.outside).toEqual([]);
  });

  it('a package outside the list is outside, also under a nested node_modules path', () => {
    const graph = GRAPH.map(c => (c.isEntry ? { ...c, moduleIds: [...c.moduleIds, 'node_modules/jszip/dist/jszip.min.js'] } : c));
    expect(computeLayers(graph, ROUTES, noImporters).shell.outside.map(o => o.module)).toEqual(['node_modules/jszip/dist/jszip.min.js']);
  });

  it('a chunk one route imports statically is a feature of a route that loads it by import()', () => {
    const graph = [
      ...GRAPH.map(c => (c.file === 'assets/SheetPage.js' ? { ...c, dynamicImports: [...c.dynamicImports, 'assets/popover.js'] } : c)),
      chunk('assets/Scales.js', { facadeModuleId: 'src/pages/Scales.tsx', moduleIds: ['src/pages/Scales.tsx'], imports: ['assets/popover.js'] }),
      // Shared by two pages, the chunk has no facade module: the key is its first own module, never the hashed file name.
      chunk('assets/popover.js', { moduleIds: ['src/ui/AltFingeringPopover.module.css', 'src/ui/AltFingeringPopover.tsx'] }),
    ];
    const r = computeLayers(graph, { ...ROUTES, '/scales': 'src/pages/Scales.tsx' }, noImporters);
    expect(r.features['src/ui/AltFingeringPopover.tsx']).toEqual({ entry: 'assets/popover.js', files: ['assets/popover.js'] });
    expect(r.routes['/scales'].files).toContain('assets/popover.js');
  });

  it('a bundler stub loaded by import() is no feature', () => {
    const graph = [...GRAPH.map(c => (c.file === 'assets/jspdf.js' ? { ...c, dynamicImports: ['assets/stub.js'] } : c)),
      chunk('assets/stub.js', { facadeModuleId: '\0stubbed-unused-pdf-library', moduleIds: ['\0stubbed-unused-pdf-library'] })];
    expect(Object.keys(computeLayers(graph, ROUTES, noImporters).features)).toEqual(['src/pdf/sheetPdf.ts']);
  });
});

describe('preloadScript', () => {
  const report: LayerReport = computeLayers(GRAPH, ROUTES, noImporters);
  const run = (url: string) => {
    document.head.innerHTML = '';
    history.replaceState({}, '', url);
    new Function(preloadScript(preloadMap(report)))();
    return [...document.head.querySelectorAll('link')].map(l => `${l.rel} ${l.getAttribute('href')} ${l.getAttribute('crossorigin')}`);
  };

  it('preloadMap prefixes each file with /', () => {
    expect(preloadMap(report)['/sheet']).toEqual(['/assets/SheetPage.js', '/assets/store.js']);
  });

  it('falls back to /', () => {
    expect(run('/nope')).toEqual(['stylesheet /assets/Start.css ', 'modulepreload /assets/Start.js ', 'modulepreload /assets/store.js ']);
  });

  it('normalises a trailing slash and ignores the query', () => {
    expect(run('/sheet/?play=1')).toEqual(['modulepreload /assets/SheetPage.js ', 'modulepreload /assets/store.js ']);
  });

  it('sets crossorigin and the rel by extension', () => {
    const links = [...(run('/'), document.head.querySelectorAll('link'))];
    expect(links.map(l => [l.rel, l.hasAttribute('crossorigin')])).toEqual([['stylesheet', true], ['modulepreload', true], ['modulepreload', true]]);
  });
});

// Which built files belong to which layer: the shell every visitor loads, each route's page, and each lazy feature.
// Pure functions over the bundle graph, so they can be tested without a build (layers.test.ts). plugin.ts feeds them.

/** One output chunk. `file` as in the bundle (`assets/x.js`); module IDs relative to the repository root. */
export interface ChunkNode {
  file: string;
  isEntry: boolean;
  facadeModuleId: string | null;
  imports: string[];
  dynamicImports: string[];
  css: string[];
  moduleIds: string[];
}

export interface LayerFiles { entry: string; files: string[] }

export interface LayerReport {
  shell: { files: string[]; outside: { module: string; chain: string[] }[] };
  routes: Record<string, LayerFiles>;
  features: Record<string, LayerFiles>;
}

/** Code the shell may hold: its own folder, the files below, and the framework packages. */
// index.html is the build's entry module; it carries no code of its own.
const SHELL_FILES = ['index.html', 'src/styles/global.css', 'src/styles/tokens.css', 'src/content/repository.ts'];
const SHELL_PACKAGES = ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom', '@remix-run/router', 'zustand', '@fontsource/atkinson-hyperlegible'];
const SHELL_ENTRY = 'src/shell/main.tsx';

/** The package a module ID belongs to, from its last node_modules segment; null for the app's own code. */
function packageOf(id: string): string | null {
  const at = id.lastIndexOf('node_modules/');
  if (at < 0) return null;
  const parts = id.slice(at + 'node_modules/'.length).split('/');
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

export function allowedInShell(id: string): boolean {
  if (id.startsWith('\0')) return true;   // the bundler's own helpers
  const pkg = packageOf(id);
  if (pkg !== null) return SHELL_PACKAGES.includes(pkg);
  return id.startsWith('src/shell/') || SHELL_FILES.includes(id);
}

/** One import chain from the shell's entry to `id`, by a breadth-first search over importers. */
function chainTo(id: string, importersOf: (id: string) => string[]): string[] {
  const back = new Map<string, string | null>([[id, null]]);
  const queue = [id];
  while (queue.length > 0) {
    const at = queue.shift()!;
    if (at === SHELL_ENTRY) {
      const chain: string[] = [];
      for (let x: string | null = at; x !== null; x = back.get(x) ?? null) chain.push(x);
      return chain;
    }
    for (const from of importersOf(at)) {
      if (!back.has(from)) { back.set(from, at); queue.push(from); }
    }
  }
  return [id];
}

export function computeLayers(chunks: ChunkNode[], routeModules: Record<string, string>, importersOf: (id: string) => string[]): LayerReport {
  const byFile = new Map(chunks.map(c => [c.file, c]));
  /** A chunk, its static imports transitively, and their CSS. */
  const closure = (start: ChunkNode): Set<string> => {
    const out = new Set<string>();
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length > 0) {
      const c = queue.shift()!;
      if (seen.has(c.file)) continue;
      seen.add(c.file);
      out.add(c.file);
      for (const css of c.css) out.add(css);
      for (const f of c.imports) { const next = byFile.get(f); if (next) queue.push(next); }
    }
    return out;
  };
  const byName = (x: string, y: string) => x.localeCompare(y);
  const minus = (a: Set<string>, ...bs: Set<string>[]) => [...a].filter(f => !bs.some(b => b.has(f))).sort(byName);

  const entry = chunks.find(c => c.isEntry);
  if (!entry) throw new Error('bundle-layers: the bundle has no entry chunk.');
  const shell = closure(entry);
  const shellModules = chunks.filter(c => shell.has(c.file)).flatMap(c => c.moduleIds);
  // Only where a chain leaves the shell: what that module imports in turn follows from it and would only repeat it.
  const outside = shellModules.filter(id => !allowedInShell(id)).map(module => ({ module, chain: chainTo(module, importersOf) }))
    .filter(o => o.chain.length < 2 || allowedInShell(o.chain[o.chain.length - 2]));

  const routes: Record<string, LayerFiles> = {};
  const routeSets = new Map<string, Set<string>>();
  for (const [path, moduleId] of Object.entries(routeModules)) {
    const page = chunks.find(c => c.facadeModuleId === moduleId);
    if (!page) throw new Error(`bundle-layers: no chunk for ${moduleId} (route ${path}).`);
    const set = closure(page);
    routeSets.set(path, set);
    routes[path] = { entry: page.file, files: minus(set, shell) };
  }

  // A feature is code that a chunk outside the shell loads by import(). What only the shell loads that way (the route
  // pages, the store they share) belongs to the routes.
  const features: Record<string, LayerFiles> = {};
  for (const c of chunks) {
    if (shell.has(c.file) || c.facadeModuleId?.startsWith('\0')) continue;   // \0: a bundler stub (vite.config.ts)
    const importers = chunks.filter(i => !shell.has(i.file) && i.dynamicImports.includes(c.file));
    if (importers.length === 0) continue;
    const loaders = [...routeSets.values()].filter(set => importers.some(i => set.has(i.file)));
    features[featureKey(c)] = { entry: c.file, files: minus(closure(c), shell, ...loaders) };
  }

  return { shell: { files: [...shell].sort(byName), outside }, routes, features };
}

/** A stable name for a feature: its facade module, else its first own script module (a chunk shared by two pages). */
function featureKey(c: ChunkNode): string {
  return c.facadeModuleId ?? c.moduleIds.find(id => packageOf(id) === null && /\.tsx?$/.test(id)) ?? c.file;
}

/** Route path → the URLs its page needs beyond the shell. */
export function preloadMap(report: LayerReport): Record<string, string[]> {
  return Object.fromEntries(Object.entries(report.routes).map(([path, r]) => [path, r.files.map(f => `/${f}`)]));
}

/**
 * The inline script of index.html: preloads the current route's files while the shell loads. A pathname is matched as
 * src/shell/routes.tsx matches it (one trailing slash ignored; an unknown path is /, where the router sends it).
 */
export function preloadScript(map: Record<string, string[]>): string {
  return `(function(m){var p=location.pathname;if(p.length>1&&p.charAt(p.length-1)==="/")p=p.slice(0,-1);`
    + `var f=Object.prototype.hasOwnProperty.call(m,p)?m[p]:m["/"];`
    + `for(var i=0;i<f.length;i++){var l=document.createElement("link");`
    + `l.rel=/\\.css$/.test(f[i])?"stylesheet":"modulepreload";l.setAttribute("crossorigin","");l.setAttribute("href",f[i]);`
    + `document.head.appendChild(l)}})(${JSON.stringify(map)})`;
}

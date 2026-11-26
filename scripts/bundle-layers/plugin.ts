// Build only. Writes build-report/layers.json (read by scripts/check-bundle.ts) and inlines a script in index.html that
// preloads the current route's files while the shell loads. The report lives outside dist/, so it is never deployed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { OutputBundle, OutputChunk } from 'rolldown';
import type { Plugin, ResolvedConfig } from 'vite';
import { ROUTE_PAGES } from '../../src/shell/routePages';
import { computeLayers, preloadMap, preloadScript, type ChunkNode } from './layers';

export const REPORT_DIR = 'build-report';

export function bundleLayers(): Plugin {
  let root = process.cwd();
  const rel = (id: string) => (id.startsWith('\0') ? id : relative(root, id).split(sep).join('/'));
  const routeModules = Object.fromEntries(Object.entries(ROUTE_PAGES).map(([path, page]) => [path, `src/pages/${page}.tsx`]));

  const nodes = (bundle: OutputBundle): ChunkNode[] =>
    Object.values(bundle).filter((o): o is OutputChunk => o.type === 'chunk').map(c => ({
      file: c.fileName,
      isEntry: c.isEntry,
      facadeModuleId: c.facadeModuleId === null ? null : rel(c.facadeModuleId),
      imports: c.imports,
      dynamicImports: c.dynamicImports,
      css: [...(c.viteMetadata?.importedCss ?? [])],
      moduleIds: c.moduleIds.map(rel),
    }));

  return {
    name: 'bundle-layers',
    apply: 'build',
    configResolved(config: ResolvedConfig) { root = config.root; },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return;
        const report = computeLayers(nodes(ctx.bundle), routeModules, () => []);
        // At the end of <head>, after Vite's own stylesheet link: a route's CSS then follows the global CSS, as it would
        // when the route loads later. The links still go out while the entry script downloads.
        return [{ tag: 'script', children: preloadScript(preloadMap(report)), injectTo: 'head' }];
      },
    },
    writeBundle(_options, bundle) {
      const importersOf = (id: string) => {
        const info = this.getModuleInfo(join(root, id));
        return (info?.importers ?? []).map(rel);
      };
      const report = computeLayers(nodes(bundle), routeModules, importersOf);
      mkdirSync(join(root, REPORT_DIR), { recursive: true });
      writeFileSync(join(root, REPORT_DIR, 'layers.json'), `${JSON.stringify(report, null, 2)}\n`);
    },
  };
}

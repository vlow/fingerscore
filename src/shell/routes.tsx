import type { ComponentType } from 'react';
import { intentProps, lazyModule, lazyView, type IntentProps, type LazyModule } from './lazy';
import { ROUTE_PAGES, type PageName, type RoutePath } from './routePages';

/** The document store, read from browser storage once, when the first page that uses it loads. */
export const storeReady: LazyModule<true> = lazyModule(() => import('../state/store').then(m => { m.hydrate(); return true as const; }));

type Page = { default: ComponentType };
const withStore = (page: () => Promise<Page>) => () =>
  Promise.all([page(), storeReady.load()]).then(([m]) => m.default);
const plain = (page: () => Promise<Page>) => () => page().then(m => m.default);

// Every page is its own chunk. TypeScript rejects a page of ROUTE_PAGES without a loader here, and a loader without a page.
const LOADERS: Record<PageName, () => Promise<ComponentType>> = {
  Start: withStore(() => import('../pages/Start')),
  SheetPage: withStore(() => import('../pages/SheetPage')),
  Tracks: withStore(() => import('../pages/Tracks')),
  Scales: withStore(() => import('../pages/Scales')),
  Terms: plain(() => import('../pages/Terms')),
  Imprint: plain(() => import('../pages/Imprint')),
  Privacy: plain(() => import('../pages/Privacy')),
  About: plain(() => import('../pages/About')),
};

const PATHS = Object.keys(ROUTE_PAGES) as RoutePath[];
const MODULES = Object.fromEntries(PATHS.map(p => [p, lazyModule(LOADERS[ROUTE_PAGES[p]])])) as Record<RoutePath, LazyModule<ComponentType>>;

/** The route a pathname shows: one trailing slash is ignored; an unknown path is the start page, where the router sends it. */
export function routePath(pathname: string): RoutePath {
  const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return (PATHS as string[]).includes(p) ? (p as RoutePath) : '/';
}

export function routeModule(pathname: string): LazyModule<ComponentType> {
  return MODULES[routePath(pathname)];
}

/** Starts loading a route's page when the pointer enters or focus arrives on a link to it. */
export function routeIntent(pathname: string): IntentProps {
  return intentProps(routeModule(pathname));
}

const fallback = <div aria-busy="true" />;
export const ROUTE_VIEWS = Object.fromEntries(PATHS.map(p => [p, lazyView(MODULES[p], { fallback })])) as Record<RoutePath, ComponentType>;

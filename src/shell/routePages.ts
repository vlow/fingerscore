// The routes and the page each one shows. Plain data: vite.config.ts reads it to preload a route's chunks
// (scripts/bundle-layers), and src/shell/routes.tsx maps each page to its loader.
export const ROUTE_PAGES = {
  '/': 'Start',
  '/sheet': 'SheetPage',
  '/tracks': 'Tracks',
  '/scales': 'Scales',
  '/fingerings': 'Fingerings',
  '/terms': 'Terms',
  '/imprint': 'Imprint',
  '/privacy': 'Privacy',
  '/about': 'About',
} as const;

export type RoutePath = keyof typeof ROUTE_PAGES;
export type PageName = (typeof ROUTE_PAGES)[RoutePath];

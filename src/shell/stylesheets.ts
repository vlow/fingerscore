/**
 * Resolves when every stylesheet link in the document has loaded or failed. The preload script of index.html inserts
 * the current page's stylesheets; a stylesheet inserted by script does not block the first paint, so main.tsx waits
 * for them before it renders, and the page never shows unstyled. A failed stylesheet does not hold the page.
 */
export function stylesheetsReady(): Promise<void> {
  const pending = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].filter(l => l.sheet === null);
  return Promise.all(pending.map(l => new Promise<void>(done => {
    l.addEventListener('load', () => done(), { once: true });
    l.addEventListener('error', () => done(), { once: true });
  }))).then(() => {});
}

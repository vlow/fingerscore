import { readFileSync } from 'node:fs';

/**
 * The inline script of index.html puts a chosen theme on <html> before the first paint (dark mode design 4.2). The app
 * sets the same attribute when it starts, so only a test of the script itself fails when the script is lost or wrong.
 */
const html = readFileSync('index.html', 'utf8');
const inline = Array.from(html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g), m => m[1]);

function run(stored: string | null | Error): string | undefined {
  delete document.documentElement.dataset.theme;
  const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    if (stored instanceof Error) throw stored;
    return stored;
  });
  try {
    new Function(inline[0])(); // NOSONAR the script under test, read from index.html
    expect(stored instanceof Error || getItem.mock.calls.some(c => c[0] === 'fingerscore.theme')).toBe(true);
  } finally {
    getItem.mockRestore();
  }
  return document.documentElement.dataset.theme;
}

describe('the theme script of index.html', () => {
  it('is the only inline script and comes before the app and every stylesheet', () => {
    expect(inline).toHaveLength(1);
    const at = html.indexOf(inline[0]);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(html.indexOf('type="module"'));
    expect(html.slice(0, at)).not.toMatch(/rel="stylesheet"/);
  });

  it.each(['dark', 'light'])('puts a stored %s on <html>', theme => {
    expect(run(theme)).toBe(theme);
  });

  it.each([null, '', 'system', 'banana', '"dark"', 'DARK'])('leaves <html> alone for the stored value %j', stored => {
    expect(run(stored)).toBeUndefined();
  });

  it('throws nothing when storage is blocked', () => {
    expect(run(new DOMException('blocked', 'SecurityError'))).toBeUndefined();
  });
});

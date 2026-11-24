import { act, renderHook } from '@testing-library/react';
import { initTheme, usePaper, useTheme } from './theme';

/** A system colour scheme the test controls: `set(true)` switches the system to dark and tells the listeners. */
function mockSystem(dark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const query = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, f: (e: { matches: boolean }) => void) => listeners.add(f),
    removeEventListener: (_: string, f: (e: { matches: boolean }) => void) => listeners.delete(f),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  return {
    set(next: boolean) { query.matches = next; listeners.forEach(f => f({ matches: next })); },
    listeners,
  };
}

const html = () => document.documentElement;
const metas = () => Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'), m => m.content);

beforeEach(() => {
  localStorage.clear();
  delete html().dataset.theme;
  document.head.innerHTML = '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#FFFFFF">'
    + '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#171A1F">';
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('theme', () => {
  it('is System when nothing is stored, and follows the system', () => {
    mockSystem(true);
    initTheme();
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    expect(result.current.effective).toBe('dark');
    expect(html().dataset.theme).toBeUndefined();
  });

  it('is light under System on a light system', () => {
    mockSystem(false);
    initTheme();
    expect(renderHook(() => useTheme()).result.current.effective).toBe('light');
  });

  it('reads a stored Dark and a stored Light', () => {
    mockSystem(false);
    localStorage.setItem('fingerscore.theme', 'dark');
    initTheme();
    const { result } = renderHook(() => useTheme());
    expect(result.current).toMatchObject({ theme: 'dark', effective: 'dark' });
    expect(html().dataset.theme).toBe('dark');

    localStorage.setItem('fingerscore.theme', 'light');
    act(() => initTheme());
    expect(result.current).toMatchObject({ theme: 'light', effective: 'light' });
    expect(html().dataset.theme).toBe('light');
  });

  it.each(['banana', '"dark"', '', 'system', 'DARK'])('takes the stored value %j as System', stored => {
    mockSystem(false);
    localStorage.setItem('fingerscore.theme', stored);
    html().dataset.theme = 'dark'; // as if an earlier choice were still on the page
    initTheme();
    expect(renderHook(() => useTheme()).result.current.theme).toBe('system');
    expect(html().dataset.theme).toBeUndefined();
  });

  it('switches between all three and stores the choice as a plain string', () => {
    mockSystem(false);
    initTheme();
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setTheme('dark'));
    expect(result.current).toMatchObject({ theme: 'dark', effective: 'dark' });
    expect(localStorage.getItem('fingerscore.theme')).toBe('dark');
    expect(html().dataset.theme).toBe('dark');

    act(() => result.current.setTheme('light'));
    expect(result.current).toMatchObject({ theme: 'light', effective: 'light' });
    expect(localStorage.getItem('fingerscore.theme')).toBe('light');
    expect(html().dataset.theme).toBe('light');

    act(() => result.current.setTheme('system'));
    expect(result.current).toMatchObject({ theme: 'system', effective: 'light' });
    expect(localStorage.getItem('fingerscore.theme')).toBeNull();
    expect(html().dataset.theme).toBeUndefined();

    act(() => result.current.setTheme('dark'));
    expect(result.current.theme).toBe('dark');
  });

  it('follows a change of the system live under System', () => {
    const system = mockSystem(false);
    initTheme();
    const { result } = renderHook(() => useTheme());
    act(() => system.set(true));
    expect(result.current.effective).toBe('dark');
    act(() => system.set(false));
    expect(result.current.effective).toBe('light');
  });

  it('ignores a change of the system while Light or Dark is chosen', () => {
    const system = mockSystem(false);
    initTheme();
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('light'));
    act(() => system.set(true));
    expect(result.current.effective).toBe('light');
    expect(html().dataset.theme).toBe('light');
    act(() => result.current.setTheme('dark'));
    act(() => system.set(false));
    expect(result.current.effective).toBe('dark');
  });

  it('listens to the system once, however often it starts', () => {
    const system = mockSystem(false);
    initTheme();
    initTheme();
    expect(system.listeners.size).toBe(1);
  });

  it('sets the browser bar colour to the chosen theme and gives it back to the system', () => {
    mockSystem(false);
    initTheme();
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));
    expect(metas()).toEqual(['#171A1F', '#171A1F']);
    act(() => result.current.setTheme('light'));
    expect(metas()).toEqual(['#FFFFFF', '#FFFFFF']);
    act(() => result.current.setTheme('system'));
    expect(metas()).toEqual(['#FFFFFF', '#171A1F']);
  });

  it('works without matchMedia: System is light', () => {
    vi.stubGlobal('matchMedia', undefined);
    initTheme();
    expect(renderHook(() => useTheme()).result.current).toMatchObject({ theme: 'system', effective: 'light' });
  });

  it('applies a choice for the session when storage is blocked', () => {
    mockSystem(false);
    initTheme();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    const theme = renderHook(() => useTheme());
    const paper = renderHook(() => usePaper());
    act(() => theme.result.current.setTheme('dark'));
    act(() => paper.result.current.setPaper('dimmed'));
    expect(theme.result.current).toMatchObject({ theme: 'dark', effective: 'dark' });
    expect(html().dataset.theme).toBe('dark');
    expect(paper.result.current.paper).toBe('dimmed');
  });

  it('starts as System when storage cannot be read', () => {
    mockSystem(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    initTheme();
    expect(renderHook(() => useTheme()).result.current).toMatchObject({ theme: 'system', effective: 'dark' });
    expect(renderHook(() => usePaper()).result.current.paper).toBe('night');
  });
});

describe('paper', () => {
  it('is Night when nothing is stored', () => {
    initTheme();
    expect(renderHook(() => usePaper()).result.current.paper).toBe('night');
  });

  it('stores a choice as a plain string and reads it back', () => {
    initTheme();
    const { result } = renderHook(() => usePaper());
    act(() => result.current.setPaper('sepia'));
    expect(result.current.paper).toBe('sepia');
    expect(localStorage.getItem('fingerscore.paper')).toBe('sepia');
    act(() => initTheme());
    expect(result.current.paper).toBe('sepia');
    act(() => result.current.setPaper('night'));
    expect(localStorage.getItem('fingerscore.paper')).toBe('night');
  });

  it.each(['banana', '"sepia"', ''])('takes the stored value %j as Night', stored => {
    localStorage.setItem('fingerscore.paper', stored);
    initTheme();
    expect(renderHook(() => usePaper()).result.current.paper).toBe('night');
  });
});

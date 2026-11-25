import { create } from 'zustand';
import { readText, remove, writeText } from './storage';

/**
 * The colour theme and the paper of the sheet in dark mode (dark mode design 4.2, 4.3). Both are kept per device and are
 * no part of a document or of its undo history. The theme is on <html> as data-theme="light|dark"; without the
 * attribute the page follows the system (src/styles/tokens.css). The inline script of index.html sets the attribute
 * before the first paint, from the same key.
 */
export type Theme = 'system' | 'light' | 'dark';
export type Effective = 'light' | 'dark';
export type PaperTheme = 'night' | 'dimmed' | 'sepia';

const THEME_KEY = 'fingerscore.theme';
const PAPER_KEY = 'fingerscore.paper';
const PAPERS: readonly PaperTheme[] = ['night', 'dimmed', 'sepia'];

interface State { theme: Theme; systemDark: boolean; paper: PaperTheme }
const useStore = create<State>(() => ({ theme: 'system', systemDark: false, paper: 'night' }));

function storedTheme(): Theme {
  const raw = readText('local', THEME_KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

function storedPaper(): PaperTheme {
  const raw = readText('local', PAPER_KEY);
  return PAPERS.find(p => p === raw) ?? 'night';
}

/** Puts the theme on the page: the attribute on <html> and the colour of the browser bar. */
function apply(theme: Theme): void {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  for (const { meta, own } of bars) meta.content = barColour[theme === 'system' ? own : theme] ?? meta.content;
}

/**
 * The browser bar: index.html holds one theme-color meta per colour scheme. A chosen theme gives both its colour;
 * System gives each its own back.
 */
let bars: { meta: HTMLMetaElement; own: Effective }[] = [];
let barColour: Partial<Record<Effective, string>> = {};

function findBars(): void {
  const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][media]'));
  // The same tags as last time: their content may be a chosen theme's by now, so the colours read earlier stay.
  if (metas.length === bars.length && metas.every((m, k) => m === bars[k].meta)) return;
  bars = metas.map(meta => ({ meta, own: meta.getAttribute('media')!.includes('dark') ? 'dark' : 'light' }));
  barColour = Object.fromEntries(bars.map(b => [b.own, b.meta.content]));
}

let stopListening: (() => void) | null = null;

/** Reads both settings, applies the theme and follows the system's colour scheme. Called once before the app renders. */
export function initTheme(): void {
  stopListening?.();
  stopListening = null;
  const system = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (system) {
    const onChange = (e: { matches: boolean }) => useStore.setState({ systemDark: e.matches });
    system.addEventListener('change', onChange);
    stopListening = () => system.removeEventListener('change', onChange);
  }
  findBars();
  const theme = storedTheme();
  useStore.setState({ theme, systemDark: system?.matches ?? false, paper: storedPaper() });
  apply(theme);
}

function setTheme(theme: Theme): void {
  // A blocked storage keeps the choice for this visit only.
  if (theme === 'system') remove('local', THEME_KEY);
  else writeText('local', THEME_KEY, theme);
  useStore.setState({ theme });
  apply(theme);
}

function setPaper(paper: PaperTheme): void {
  writeText('local', PAPER_KEY, paper);
  useStore.setState({ paper });
}

/** The chosen theme and the one in effect: under System that is the system's. */
export function useTheme(): { theme: Theme; effective: Effective; setTheme(t: Theme): void } {
  const theme = useStore(s => s.theme);
  const systemDark = useStore(s => s.systemDark);
  return { theme, effective: theme === 'system' ? (systemDark ? 'dark' : 'light') : theme, setTheme };
}

/** The paper of the sheet in dark mode. It has no effect in light mode. */
export function usePaper(): { paper: PaperTheme; setPaper(p: PaperTheme): void } {
  return { paper: useStore(s => s.paper), setPaper };
}

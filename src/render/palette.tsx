import { createContext, useContext, type ReactNode } from 'react';

/**
 * The colours of the sheet's drawing (dark mode design 4.3). On screen they are references to the tokens of
 * src/styles/tokens.css, so the drawing follows the theme and the paper. The PDF draws with LIGHT: it reads fills from
 * the SVG and can resolve no variable, and it must not follow the theme.
 */
export interface Palette {
  paper: string;
  /** Notation, chart outlines and closed holes. */
  ink: string;
  /** The five staff lines. */
  staff: string;
  chord: string;
  lyric: string;
  /** Labels in the drawing: note names, option names. */
  text: string;
  /** Bar numbers. */
  muted: string;
  warning: string;
  warningBg: string;
  error: string;
  errorBg: string;
  ghostKey: string;
  /** Fill of the "alt" badge. */
  badgeBg: string;
  /** The column under the playback position. */
  playing: string;
  /** The fill of the selected column's marker. */
  selection: string;
}

const token = (name: string) => `var(--c-${name})`;
const over = (name: string, percent: number) => `color-mix(in srgb, ${token(name)} ${percent}%, transparent)`;

export const SCREEN: Palette = {
  paper: token('paper'),
  ink: token('ink'),
  staff: token('lyric'),
  chord: token('chord'),
  lyric: token('lyric'),
  text: token('lyric'),
  muted: token('muted'),
  warning: token('warning'),
  warningBg: token('warning-bg'),
  error: token('error'),
  errorBg: token('error-bg'),
  ghostKey: token('ghost-key'),
  badgeBg: token('bg'),
  // From the paper's chord colour, so both show on every paper (the page's accent-tint is dark under Dimmed's dark page).
  playing: over('chord', 14),
  selection: over('chord', 20),
};

/** The light column of the handoff's tokens.json. Staff lines keep the colour the PDF always had. */
export const LIGHT: Palette = {
  paper: '#FFFFFF',
  ink: '#15171C',
  staff: '#2A2D33',
  chord: '#0E6E68',
  lyric: '#2A2D33',
  text: '#2A2D33',
  muted: '#5B616E',
  warning: '#B45309',
  warningBg: '#FFF7ED',
  error: '#B91C1C',
  errorBg: '#FEF2F2',
  ghostKey: '#C3C7CE',
  badgeBg: '#F3F4F6',
  playing: 'rgba(14,110,104,0.14)',
  selection: '#E3F4F2',
};

/** What SVG paints a shape with when nothing sets its fill. */
export const SVG_DEFAULT_FILL = '#000';

/** The border colour of the PDF's rules; on screen, borders come from the stylesheets. */
export const LIGHT_BORDER = '#E2E4E8';

const Context = createContext<Palette>(SCREEN);

export function PaletteProvider(p: { value: Palette; children: ReactNode }): JSX.Element {
  return <Context.Provider value={p.value}>{p.children}</Context.Provider>;
}

export function usePalette(): Palette {
  return useContext(Context);
}

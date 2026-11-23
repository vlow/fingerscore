/** How bars lie over a song: a pickup bar of `pickup` quarter notes (0 = none), then bars of `barLength`. Positions are quarter notes. */
export interface Grid { pickup: number; barLength: number }

const EPS = 1e-9;

/** Index of the bar (incl. pickup bar) that contains time t. */
export function barAt(g: Grid, t: number): number {
  if (g.pickup > 0 && t < g.pickup - EPS) return 0;
  return Math.floor((t - g.pickup) / g.barLength + EPS) + (g.pickup > 0 ? 1 : 0);
}

export const onBarLine = (g: Grid, t: number): boolean => {
  const k = (t - g.pickup) / g.barLength;
  return t < EPS || Math.abs(k - Math.round(k)) < EPS;
};

/** The bar a start repeat at t marks: the bar starting at t; when t falls inside a bar, the next bar. */
export const barStartingAt = (g: Grid, t: number): number => barAt(g, t) + (onBarLine(g, t) ? 0 : 1);

/** The bar an end repeat at t marks: the bar ending at t; when t falls inside a bar, that bar. */
export const barEndingAt = (g: Grid, t: number): number => barAt(g, t) - (onBarLine(g, t) ? 1 : 0);

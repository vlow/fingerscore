/** The width of an alternate-fingering pill in px. */
export const PILL_WIDTH = 26;

/** A note draws a pill when it has more than one fingering. The pill and the spacing of pills share this. */
export const hasPill = (ev: { options: readonly unknown[] }): boolean => ev.options.length >= 2;

/**
 * Whole-pixel centres for the pills under the charts at `xs` (ascending), no closer than `gap`, none outside 0..`width`.
 * Notes can sit 20 px apart and a pill is 26 px wide, so neighbouring pills would cover each other and their click areas
 * overlap. A run of pills that are too close moves apart around the middle of its notes, so no pill drifts further than
 * the run needs; at an edge the run stops at the edge and spreads the other way.
 */
export function spreadPills(xs: readonly number[], width: number, gap: number = PILL_WIDTH): number[] {
  const lo = gap / 2;
  const hi = width - gap / 2;
  // A block is a run of pills laid out `gap` apart from `start`; it sits where it is closest to its notes, inside the bounds.
  const blocks: { first: number; count: number; start: number }[] = [];
  const block = (first: number, count: number) => {
    let sum = 0;
    for (let k = 0; k < count; k++) sum += xs[first + k]! - k * gap;
    return { first, count, start: Math.round(Math.max(lo, Math.min(hi - (count - 1) * gap, sum / count))) };
  };
  xs.forEach((_, i) => {
    blocks.push(block(i, 1));
    for (;;) {
      const last = blocks[blocks.length - 1]!;
      const before = blocks[blocks.length - 2];
      if (!before || before.start + before.count * gap <= last.start) break;
      blocks.splice(blocks.length - 2, 2, block(before.first, before.count + last.count));
    }
  });
  return blocks.flatMap(b => Array.from({ length: b.count }, (_, k) => b.start + k * gap));
}

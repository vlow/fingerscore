/** The width of an alternate-fingering pill in px. */
export const PILL_WIDTH = 26;

/**
 * The room one pill takes along the staff: its 36 px click area (see AltPill.module.css). The pill is drawn 26 px wide;
 * pills closer than 36 px would let the later one take the clicks on the earlier one's edge.
 */
export const PILL_SPACING = 36;

/** A note draws a pill when it has more than one fingering. The pill and the spacing of pills share this. */
export const hasPill = (ev: { options: readonly unknown[] }): boolean => ev.options.length >= 2;

/**
 * Whole-pixel centres for the pills under the charts at `xs` (ascending), no closer than `gap`, none outside 0..`width`.
 * Notes can sit 20 px apart and a pill takes 36 px of click area, so neighbouring pills would overlap.
 * A run of pills that are too close moves apart around the middle of its notes, so no pill drifts further than
 * the run needs; at an edge the run stops at the edge and spreads the other way.
 */
export function spreadPills(xs: readonly number[], width: number, gap: number = PILL_SPACING): number[] {
  const lo = gap / 2;
  const hi = width - gap / 2;
  // Too many pills for the room: they share it evenly, closer than the gap, in order and inside the bounds.
  if ((xs.length - 1) * gap > hi - lo) {
    const step = hi > lo ? (hi - lo) / (xs.length - 1) : 0;
    return xs.map((_, i) => Math.round(hi > lo ? lo + i * step : width / 2));
  }
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

/** Where the pills go: the centre of each note that draws one, by event id. Notes without a pill take no room. */
export function pillCentres(notes: readonly { id: string; x: number; options: readonly unknown[] }[], width: number): Map<string, number> {
  const withPill = notes.filter(hasPill);
  return new Map(spreadPills(withPill.map(n => n.x), width).map((x, i) => [withPill[i]!.id, x]));
}

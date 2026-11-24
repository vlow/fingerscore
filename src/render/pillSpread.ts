/** The width of an alternate-fingering pill in px. */
export const PILL_WIDTH = 26;

/**
 * Centres for the pills under the charts at `xs` (ascending), no closer than `gap`. Notes can sit 20 px apart and a pill is
 * 26 px wide, so neighbouring pills would cover each other and their click areas overlap. A run of pills that are too
 * close moves apart around the middle of its notes, so no pill drifts further than the run needs.
 */
export function spreadPills(xs: readonly number[], gap: number = PILL_WIDTH): number[] {
  // A block is a run of pills laid out `gap` apart from `start`; it is placed where it sits closest to its notes.
  const blocks: { first: number; count: number; start: number }[] = [];
  const startOf = (first: number, count: number) => {
    let sum = 0;
    for (let k = 0; k < count; k++) sum += xs[first + k]! - k * gap;
    return sum / count;
  };
  xs.forEach((_, i) => {
    blocks.push({ first: i, count: 1, start: xs[i]! });
    for (;;) {
      const last = blocks[blocks.length - 1]!;
      const before = blocks[blocks.length - 2];
      if (!before || before.start + before.count * gap <= last.start) break;
      blocks.splice(blocks.length - 2, 2, { first: before.first, count: before.count + last.count, start: startOf(before.first, before.count + last.count) });
    }
  });
  return blocks.flatMap(b => Array.from({ length: b.count }, (_, k) => b.start + k * gap));
}

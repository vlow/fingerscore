import { FINGER, type FingeringOption } from './fingerings';

export interface ChooserNote { id: string; written: number; options: FingeringOption[] }
export type ChooserItem = ChooserNote | null;

const BIS_PENALTY = 2;
const SAME_FINGER_PENALTY = 3;
const B_NATURAL_PC = 11;

export function transitionCost(a: FingeringOption, b: FingeringOption): number {
  let cost = 0;
  const len = Math.max(a.h.length, b.h.length);
  for (let i = 0; i < len; i++) if (a.h[i] !== b.h[i]) cost++;
  for (const k of a.x) if (!b.x.includes(k)) cost++;
  for (const k of b.x) if (!a.x.includes(k)) cost++;
  for (const ka of a.x) {
    for (const kb of b.x) {
      if (ka !== kb && FINGER[ka] === FINGER[kb]) cost += SAME_FINGER_PENALTY;
    }
  }
  return cost;
}

function isBNatural(n: ChooserNote | undefined): boolean {
  return n !== undefined && ((n.written % 12) + 12) % 12 === B_NATURAL_PC;
}

function nodeCost(run: ChooserNote[], i: number, opt: FingeringOption): number {
  const bisClash = opt.x.includes('bis') && (isBNatural(run[i - 1]) || isBNatural(run[i + 1]));
  return opt.p + (bisClash ? BIS_PENALTY : 0);
}

function candidates(note: ChooserNote, overrides: Record<string, number>): number[] {
  const pinned = overrides[note.id];
  if (pinned !== undefined && Number.isInteger(pinned) && pinned >= 0 && pinned < note.options.length) return [pinned];
  return note.options.map((_, i) => i);
}

function solveRun(run: ChooserNote[], overrides: Record<string, number>, out: Record<string, number>): void {
  const cands = run.map(n => candidates(n, overrides));
  let cost = cands[0].map(j => nodeCost(run, 0, run[0].options[j]));
  const back: number[][] = [];
  for (let i = 1; i < run.length; i++) {
    const next: number[] = [];
    const from: number[] = [];
    for (const j of cands[i]) {
      const opt = run[i].options[j];
      let best = Infinity;
      let bestK = 0;
      cands[i - 1].forEach((pj, k) => {
        const c = cost[k] + transitionCost(run[i - 1].options[pj], opt);
        if (c < best) { best = c; bestK = k; }
      });
      next.push(best + nodeCost(run, i, opt));
      from.push(bestK);
    }
    cost = next;
    back.push(from);
  }
  let k = 0;
  for (let q = 1; q < cost.length; q++) if (cost[q] < cost[k]) k = q;
  for (let i = run.length - 1; i >= 0; i--) {
    out[run[i].id] = cands[i][k];
    if (i > 0) k = back[i - 1][k];
  }
}

/** Viterbi over each run of consecutive notes that have options. Returns id → option index. */
export function chooseFingerings(items: ChooserItem[], overrides: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let run: ChooserNote[] = [];
  const flush = () => {
    if (run.length) solveRun(run, overrides, out);
    run = [];
  };
  for (const it of items) {
    if (it && it.options.length > 0) run.push(it);
    else flush();
  }
  flush();
  return out;
}

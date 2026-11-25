import { barLabelOf } from './bars';
import { walkRepeats } from './repeats';
import type { Bar, Doc, Jump } from './types';

/** The texts drawn on the sheet and used in notices. */
export const JUMP_TEXT: Record<Jump, string> = {
  dc: 'D.C.', dcFine: 'D.C. al Fine', dcCoda: 'D.C. al Coda', ds: 'D.S.', dsFine: 'D.S. al Fine', dsCoda: 'D.S. al Coda',
};

/** The four marks that are a flag on a bar; the jump is a value. */
export type BarMark = 'segno' | 'coda' | 'fine' | 'toCoda';

const MARK_NAME: Record<BarMark, string> = { segno: 'Segno', coda: 'Coda', fine: 'Fine', toCoda: 'To Coda' };
const MARKS: BarMark[] = ['segno', 'coda', 'fine', 'toCoda'];

export const isJump = (v: unknown): v is Jump => typeof v === 'string' && Object.prototype.hasOwnProperty.call(JUMP_TEXT, v);

export function hasJumpMarks(doc: Doc): boolean {
  return doc.score.some(b => b.segno || b.coda || b.fine || b.toCoda || b.jump);
}

/** `bar` is a bar index; `text` is the notice, with the printed bar number. */
export interface JumpProblem { bar: number; text: string }

/**
 * For every bar the ending it belongs to is skipped after a jump: in a run of consecutive bars with a volta,
 * only the highest ending present is played.
 */
export function skippedEndings(bars: Bar[]): boolean[] {
  const skipped = bars.map(() => false);
  let from = 0;
  while (from < bars.length) {
    if (bars[from].volta === '') { from++; continue; }
    let to = from;
    while (to < bars.length && bars[to].volta !== '') to++;
    const last = bars.slice(from, to).some(b => b.volta === '2') ? '2' : '1';
    for (let k = from; k < to; k++) skipped[k] = bars[k].volta !== last;
    from = to;
  }
  return skipped;
}

const IGNORED = 'Playback ignores the jump.';

function listBars(labels: number[]): string {
  const head = labels.slice(0, -1).join(', ');
  return `bars ${head} and ${labels[labels.length - 1]}`;
}

/** Where marks of one kind stand, as bar indices. */
function where(bars: Bar[], pick: (b: Bar) => unknown): number[] {
  const out: number[] = [];
  bars.forEach((b, i) => { if (pick(b)) out.push(i); });
  return out;
}

/**
 * The marks that do not add up, one entry each. Marks without a jump are not listed: nothing plays from them.
 * A document with a problem plays without its jump.
 */
export function jumpProblems(doc: Doc): JumpProblem[] {
  const bars = doc.score;
  const jumps = where(bars, b => b.jump);
  if (jumps.length === 0) return [];
  const label = (i: number) => barLabelOf(doc, i);
  const problem = (bar: number, sentence: string): JumpProblem => ({ bar, text: `${sentence} ${IGNORED}` });
  const out: JumpProblem[] = [];

  const places: Record<BarMark, number[]> = {
    segno: where(bars, b => b.segno), coda: where(bars, b => b.coda), fine: where(bars, b => b.fine), toCoda: where(bars, b => b.toCoda),
  };
  if (jumps.length > 1) out.push(problem(jumps[1], `There is more than one jump, in ${listBars(jumps.map(label))}.`));
  for (const m of MARKS) {
    if (places[m].length > 1) out.push(problem(places[m][1], `There is more than one ${MARK_NAME[m]}, in ${listBars(places[m].map(label))}.`));
  }
  if (out.length > 0) return out;

  const at = jumps[0];
  const jump = bars[at].jump as Jump;
  const name = `${JUMP_TEXT[jump]} in bar ${label(at)}`;
  const [segno, coda, fine, toCoda] = MARKS.map(m => places[m][0] as number | undefined);
  const isDs = jump.startsWith('ds');

  if (isDs && segno === undefined) out.push(problem(at, `${name} needs a Segno.`));
  if (jump.endsWith('Coda')) {
    if (toCoda === undefined) out.push(problem(at, `${name} needs a To Coda.`));
    if (coda === undefined) out.push(problem(at, `${name} needs a Coda.`));
    if (toCoda !== undefined && coda !== undefined && coda === toCoda) {
      out.push(problem(at, `The Coda and the To Coda cannot share bar ${label(coda)}.`));
    } else if (toCoda !== undefined && coda !== undefined && coda < toCoda) {
      out.push(problem(at, `${name} needs the Coda after the To Coda, but the Coda is in bar ${label(coda)} and the To Coda in bar ${label(toCoda)}.`));
    } else if (coda !== undefined && coda <= at) {
      out.push(problem(coda, `The Coda in bar ${label(coda)} must come after ${name}.`));
    }
  }
  if (jump.endsWith('Fine') && fine === undefined) out.push(problem(at, `${name} needs a Fine.`));

  const placed: [BarMark, number | undefined][] = [['segno', segno], ['fine', fine], ['toCoda', toCoda]];
  for (const [m, i] of placed) {
    if (i === undefined) continue;
    const mark = `The ${MARK_NAME[m]} in bar ${label(i)}`;
    if (i > at) out.push(problem(i, `${mark} comes after ${name}.`));
    else if (i === at && m !== 'segno') out.push(problem(i, `${mark} shares its bar with the jump (${JUMP_TEXT[jump]}).`));
  }
  if (isDs && segno !== undefined) {
    const before = (m: BarMark, i: number | undefined) => {
      if (i !== undefined && i < segno) {
        out.push(problem(i, `The ${MARK_NAME[m]} in bar ${label(i)} comes before the Segno in bar ${label(segno)}, which ${name} returns to.`));
      }
    };
    before('fine', fine);
    if (jump === 'dsCoda') before('toCoda', toCoda);
  }
  const skipped = skippedEndings(bars);
  // Only the bars up to the jump bar are replayed with the last ending alone; after it endings play as written.
  // A Coda before the jump bar is named above ("must come after"), so it is not named again here.
  for (const [m, i] of placed) {
    if (i !== undefined && i <= at && skipped[i]) {
      out.push(problem(i, `The ${MARK_NAME[m]} in bar ${label(i)} stands in an ending that is skipped after the jump.`));
    }
  }
  if (out.length > 0) return out;
  const walk = walkRepeats(doc, at);
  if (!walk.fired) {
    const place = { '1': 'a first ending', '2': 'a second ending', '': 'a repeated section' }[bars[at].volta];
    out.push(problem(at, `${name} stands in ${place} and is never taken.`));
    return out;
  }
  const open = walkRepeats(doc, -1).repeats.find(r => r.end > at && r.start <= at);
  if (open) out.push(problem(at, `${name} stands inside a repeated section, before its end in bar ${label(open.end)}.`));
  return out;
}

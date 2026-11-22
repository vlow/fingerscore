/** Lyric line font size on the sheet (px). */
export const LYRIC_FONT_PX = 12;
/** Estimated advance per character in Atkinson Hyperlegible, in em. */
export const TEXT_EM_PER_CHAR = 0.55;

const GAP = 4;            // wanted space between neighbouring syllables
const NOTE_OVERLAP = 2;   // a syllable's box keeps at least this much over its own note
const MIN_CONDENSE = 0.8; // textLength never goes below this share of the estimated width

export interface LyricItem { id: string; x: number; text: string }
export interface PlacedLyric { id: string; x: number; textLength?: number }

interface Box { id: string; note: number; est: number; w: number; c: number }

const left = (b: Box) => b.c - b.w / 2;
const right = (b: Box) => b.c + b.w / 2;
const slack = (b: Box) => Math.max(0, b.w / 2 - NOTE_OVERLAP); // how far the centre may leave its note

/**
 * Place centred text items (syllables or chord symbols) of one system so neighbours keep a 4px gap.
 * Items must be sorted by x. A collision first moves the left item (pushing its own left neighbours
 * if needed) and the right item apart, evenly where possible, each staying over its note; what is
 * left is taken up by condensing (textLength, at least 80%), and any remainder is accepted.
 */
export function placeLyrics(items: LyricItem[], minX: number, maxX: number, fontPx = LYRIC_FONT_PX): PlacedLyric[] {
  const boxes: Box[] = items.map(it => {
    const est = it.text.length * TEXT_EM_PER_CHAR * fontPx;
    const c = Math.min(Math.max(it.x, minX + est / 2), maxX - est / 2);
    return { id: it.id, note: it.x, est, w: est, c };
  });

  const gapLeft = (k: number) => left(boxes[k]) - (k > 0 ? right(boxes[k - 1]) + GAP : minX);
  const leftRoom = (k: number): number => {
    const b = boxes[k];
    const byNote = b.c - (b.note - slack(b));
    const byNeighbour = Math.max(0, gapLeft(k)) + (k > 0 ? leftRoom(k - 1) : 0);
    return Math.max(0, Math.min(byNote, byNeighbour));
  };
  const pushLeft = (k: number, amount: number) => {
    const free = Math.max(0, gapLeft(k));
    boxes[k].c -= amount;
    if (amount > free && k > 0) pushLeft(k - 1, amount - free);
  };

  for (let i = 1; i < boxes.length; i++) {
    const prev = boxes[i - 1];
    const cur = boxes[i];
    let deficit = right(prev) + GAP - left(cur);
    if (deficit <= 0) continue;

    const roomPrev = leftRoom(i - 1);
    const roomCur = Math.max(0, Math.min(cur.note + slack(cur) - cur.c, maxX - right(cur)));
    let moveCur = Math.min(roomCur, deficit / 2);
    const movePrev = Math.min(roomPrev, deficit - moveCur);
    moveCur = Math.min(roomCur, deficit - movePrev);
    if (movePrev > 0) pushLeft(i - 1, movePrev);
    cur.c += moveCur;
    deficit -= movePrev + moveCur;
    if (deficit <= 0) continue;

    // Condense: prev keeps its left edge, cur its right edge; each stays over its note.
    const capPrev = Math.max(0, Math.min(prev.w - MIN_CONDENSE * prev.est, right(prev) - (prev.note + NOTE_OVERLAP)));
    const capCur = Math.max(0, Math.min(cur.w - MIN_CONDENSE * cur.est, cur.note - NOTE_OVERLAP - left(cur)));
    let shrinkCur = Math.min(capCur, deficit / 2);
    const shrinkPrev = Math.min(capPrev, deficit - shrinkCur);
    shrinkCur = Math.min(capCur, deficit - shrinkPrev);
    prev.w -= shrinkPrev; prev.c -= shrinkPrev / 2;
    cur.w -= shrinkCur; cur.c += shrinkCur / 2;
    // Whatever deficit remains is accepted: the gap may shrink towards 1px.
  }

  return boxes.map(b => (b.w < b.est - 1e-9 ? { id: b.id, x: b.c, textLength: b.w } : { id: b.id, x: b.c }));
}

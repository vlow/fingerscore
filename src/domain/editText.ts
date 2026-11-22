import { parseChord } from './chords';
import { eventOrder, locate } from './edit';
import type { ChordSym, Doc, Ev } from './types';

/** Pure lyric and chord edits. Each returns a new document, or null when nothing changes. */

/** Ids of the notes that are tied continuations (a note after a tied note). */
function continuations(all: Ev[]): Set<string> {
  const out = new Set<string>();
  all.forEach((e, k) => { if (k > 0 && !e.r && all[k - 1].tie) out.add(e.id); });
  return out;
}

/** A note that can carry a syllable: not a rest, not a tied continuation. */
export function carriesLyric(doc: Doc, id: string): boolean {
  const all = eventOrder(doc);
  const k = all.findIndex(e => e.id === id);
  return k >= 0 && !all[k].r && !(k > 0 && all[k - 1].tie);
}

/** The next (dir 1) or previous (dir -1) note that can carry a syllable; from null: the first or the last. */
export function nextLyricNote(doc: Doc, id: string | null, dir: 1 | -1): string | null {
  const all = eventOrder(doc);
  const cont = continuations(all);
  const k = id === null ? (dir === 1 ? -1 : all.length) : all.findIndex(e => e.id === id);
  if (id !== null && k < 0) return null;
  for (let j = k + dir; j >= 0 && j < all.length; j += dir) if (!all[j].r && !cont.has(all[j].id)) return all[j].id;
  return null;
}

function withLyrics(doc: Doc, lyric: (e: Ev) => string): Doc | null {
  let changed = false;
  const score = doc.score.map(bar => {
    let barChanged = false;
    const ev = bar.ev.map(e => {
      const l = lyric(e);
      if (l === e.l) return e;
      barChanged = true;
      return { ...e, l };
    });
    if (!barChanged) return bar;
    changed = true;
    return { ...bar, ev };
  });
  return changed ? { ...doc, score } : null;
}

export function setLyric(doc: Doc, id: string, text: string): Doc | null {
  const at = locate(doc, id);
  if (!at || at.ev.l === text) return null;
  return withLyrics(doc, e => (e.id === id ? text : e.l));
}

/** Whitespace separates words; inner hyphens split a word into syllables ("wat-er" → "wat-", "er"); "_" is an empty syllable. */
export function splitVerse(text: string): string[] {
  return text.split(/\s+/).filter(w => w !== '').flatMap(w => (w === '_' ? [''] : syllables(w)));
}

/** "beau-ti-ful" → "beau-", "ti-", "ful": a break after each run of hyphens that follows a letter and precedes one. */
function syllables(word: string): string[] {
  const out: string[] = [];
  let current = '';
  for (let k = 0; k < word.length; k++) {
    current += word[k];
    const breaks = word[k] === '-' && k + 1 < word.length && word[k + 1] !== '-' && /[^-]/.test(current);
    if (breaks) { out.push(current); current = ''; }
  }
  out.push(current);
  return out;
}

/**
 * Puts the verse's syllables on the notes that can carry one, from the given note (or the next one that can) or
 * from the first; extra syllables are dropped, notes beyond the text keep theirs.
 */
export function fillLyrics(doc: Doc, text: string, fromId: string | null): Doc | null {
  const syllables = splitVerse(text);
  if (syllables.length === 0) return null;
  let id = fromId !== null && carriesLyric(doc, fromId) ? fromId : nextLyricNote(doc, fromId, 1);
  const put = new Map<string, string>();
  for (const syllable of syllables) {
    if (id === null) break;
    put.set(id, syllable);
    id = nextLyricNote(doc, id, 1);
  }
  return withLyrics(doc, e => put.get(e.id) ?? e.l);
}

export function clearLyrics(doc: Doc): Doc | null {
  return withLyrics(doc, () => '');
}

export function clearChords(doc: Doc): Doc | null {
  return Object.keys(doc.chords).length === 0 ? null : { ...doc, chords: {} };
}

/** True when the stored chord is not what the imported text (spelled in the original key) means. */
function chordDiffers(c: ChordSym | undefined, imported: string | undefined): boolean {
  if (c === undefined || imported === undefined) return c !== imported;
  const p = parseChord(imported, 0);
  if (c.ok !== p.ok) return true;
  return c.ok ? c.pc !== p.pc || c.rest !== p.rest || c.bass !== p.bass : c.raw !== p.raw;
}

/** Events whose lyric or chord differs from the imported state. */
export function editCount(doc: Doc): number {
  const { lyrics, chords } = doc.imported;
  return eventOrder(doc).filter(e => e.l !== (lyrics[e.id] ?? '') || chordDiffers(doc.chords[e.id], chords[e.id])).length;
}

/** False for a sheet imported before lyrics and chords were kept, or a file that had none: there is nothing to restore. */
export function hasImported(doc: Doc): boolean {
  return Object.keys(doc.imported.lyrics).length > 0 || Object.keys(doc.imported.chords).length > 0;
}

/** Lyrics and chords of every surviving event back to the imported state; null when nothing differs or nothing was imported. */
export function restoreFromFile(doc: Doc): Doc | null {
  if (!hasImported(doc) || editCount(doc) === 0) return null;
  const { lyrics, chords: texts } = doc.imported;
  const chords: Doc['chords'] = {};
  for (const e of eventOrder(doc)) if (texts[e.id] !== undefined) chords[e.id] = parseChord(texts[e.id], 0);
  return { ...(withLyrics(doc, e => lyrics[e.id] ?? '') ?? doc), chords };
}

/** Sets an event's chord from text spelled at tk; an empty text removes it. Invalid text is kept as it is. */
export function setChord(doc: Doc, id: string, text: string, tk: number): Doc | null {
  if (!locate(doc, id)) return null;
  const old = doc.chords[id];
  if (text === '') {
    if (old === undefined) return null;
    const chords = { ...doc.chords };
    delete chords[id];
    return { ...doc, chords };
  }
  if (old !== undefined && old.raw === text && old.tk === tk) return null;
  return { ...doc, chords: { ...doc.chords, [id]: parseChord(text, tk) } };
}

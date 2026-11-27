import type { Mode } from './ModeSwitch';

/**
 * Every keyboard shortcut of the app, in one list. The shortcuts panel on the sheet page, the Play mode card and the
 * hint line under the mode switch read it. A new shortcut is added here as well as to its handler (CLAUDE.md).
 */

/** One key combination: keys pressed together, with an optional caption under the key (the length digits). */
export interface Combo { keys: string[]; cap?: string }
/** A combination, or a word between two of them. */
export type Part = Combo | 'or' | '/' | '–';

export interface Shortcut {
  id: string;
  label: string;
  /** Extra words the search finds the row by. */
  syn: string;
  keys: Part[];
  /** The keys on Apple devices, where they differ. */
  macKeys?: Part[];
}

export type GroupId = 'sheet' | 'move' | 'notes' | 'text' | 'play';

export interface Group {
  id: GroupId;
  title: string;
  /** Where the group applies. */
  sub: string;
  /** A line under the rows; Shift is the platform's name for the key. */
  note?(shift: string): string;
  rows: Shortcut[];
}

const k = (...keys: string[]): Combo => ({ keys });

export const GROUPS: Group[] = [
  { id: 'sheet', title: 'Sheet page', sub: 'anywhere', rows: [
    { id: 'save', label: 'Save', syn: 'store keep', keys: [k('Mod', 'S')] },
    { id: 'undo', label: 'Undo', syn: 'back revert', keys: [k('Mod', 'Z')] },
    { id: 'redo', label: 'Redo', syn: 'again', keys: [k('Mod', 'Y'), 'or', k('Mod', 'Shift', 'Z')], macKeys: [k('Mod', 'Shift', 'Z')] },
    { id: 'help', label: 'Show or hide this list', syn: 'help shortcuts keys', keys: [k('?')] },
  ] },
  { id: 'move', title: 'Move and listen', sub: 'every mode', rows: [
    { id: 'lr', label: 'Previous or next note or rest', syn: 'arrow left right select', keys: [k('←'), '/', k('→')] },
    { id: 'he', label: 'First or last note or rest', syn: 'start beginning end', keys: [k('Home'), '/', k('End')] },
    { id: 'listen', label: 'Listen from the selection, or stop', syn: 'play audio sound', keys: [k('Enter'), 'or', k('Space')] },
    { id: 'esc', label: 'Clear the selection', syn: 'escape deselect', keys: [k('Esc')] },
  ] },
  { id: 'notes', title: 'Edit notes', sub: 'note selected',
    note: shift => `On AZERTY the digits and the dot work with ${shift}. On layouts without Latin letters, keys follow their position.`,
    rows: [
      { id: 'semi', label: 'Semitone up or down', syn: 'pitch higher lower arrow', keys: [k('↑'), '/', k('↓')] },
      { id: 'oct', label: 'Octave up or down', syn: 'pitch octave', keys: [k('Mod', '↑'), '/', k('Mod', '↓')] },
      { id: 'letter', label: 'Jump to that note name', syn: 'pitch letter name', keys: [k('A'), '–', k('G')] },
      { id: 'len', label: 'Length', syn: 'duration sixteenth eighth quarter half whole',
        keys: [{ keys: ['2'], cap: '16th' }, { keys: ['3'], cap: '8th' }, { keys: ['4'], cap: '¼' }, { keys: ['5'], cap: '½' }, { keys: ['6'], cap: '1' }] },
      { id: 'dot', label: 'Dot', syn: 'dotted', keys: [k('.')] },
      { id: 'trip', label: 'Triplet, or undo the group', syn: 'tuplet three', keys: [k('P')] },
      { id: 'rest', label: 'Note ↔ rest', syn: 'pause silence', keys: [k('R')] },
      { id: 'tie', label: 'Tie to the next note', syn: 'slur bind', keys: [k('T')] },
      { id: 'del', label: 'Turn into a rest', syn: 'delete remove backspace', keys: [k('Del'), 'or', k('Bksp')], macKeys: [k('Bksp')] },
    ] },
  { id: 'text', title: 'Lyrics and Chords', sub: 'note selected', rows: [
    { id: 'tabin', label: 'Into the Lyric or Chord field', syn: 'type text', keys: [k('Tab')] },
    { id: 'next', label: 'Next note (Lyrics) or event (Chords)', syn: 'forward', keys: [k('Enter'), 'or', k('Tab')] },
    { id: 'prev', label: 'Previous · at the first, back to the sheet', syn: 'back', keys: [k('Shift', 'Tab')] },
    { id: 'tesc', label: 'Clear the selection', syn: 'escape', keys: [k('Esc')] },
  ] },
  { id: 'play', title: 'Play mode', sub: 'full screen', rows: [
    { id: 'pn', label: 'Next page', syn: 'turn pedal forward', keys: [k('→'), 'or', k('Space'), 'or', k('PgDn')] },
    { id: 'pp', label: 'Previous page', syn: 'turn pedal back', keys: [k('←'), 'or', k('PgUp')] },
    { id: 'edge', label: 'First or last page', syn: 'start beginning end top bottom skip go to', keys: [k('Home'), '/', k('End')] },
    { id: 'auto', label: 'Auto-scroll on or off', syn: 'scroll speed', keys: [k('A')] },
    { id: 'zoom', label: 'Larger or smaller (like A+ and A−)', syn: 'zoom size bigger plus minus equals', keys: [k('+'), '/', k('−')] },
    { id: 'phelp', label: 'Show or hide these keys', syn: 'help shortcuts', keys: [k('?')] },
    { id: 'pesc', label: 'Leave Play mode', syn: 'exit escape', keys: [k('Esc')] },
  ] },
];

/** Apple keyboards name the modifier ⌘; everyone else Ctrl. */
export function isApple(): boolean {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const platform = (nav as (Navigator & { userAgentData?: { platform?: string } }) | null)?.userAgentData?.platform ?? nav?.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

const APPLE_NAMES: Record<string, string> = { Mod: '⌘', Shift: '⇧', Bksp: '⌫' };
const OTHER_NAMES: Record<string, string> = { Mod: 'Ctrl', Shift: 'Shift', Bksp: 'Backspace' };

/** The name a key cap shows on this platform. */
export function keyName(key: string, apple: boolean): string {
  return (apple ? APPLE_NAMES : OTHER_NAMES)[key] ?? key;
}

/** The keys of a row on this platform. */
export function keysOf(row: Shortcut, apple: boolean): Part[] {
  return apple && row.macKeys ? row.macKeys : row.keys;
}

/** True when every word of the query is in the row's label, synonyms, group title or key names. */
export function matches(row: Shortcut, group: Group, query: string, apple: boolean): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const keys = keysOf(row, apple).flatMap(p => (typeof p === 'string' ? [] : p.keys.flatMap(x => [x, keyName(x, apple)])));
  const hay = [row.label, row.syn, group.title, ...keys].join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
}

/** The group that applies in a mode of the sheet page. */
export function nowGroup(mode: Mode): GroupId {
  if (mode === 'notes') return 'notes';
  if (mode === 'lyrics' || mode === 'chords') return 'text';
  return 'move';
}

/** A hint line piece: a key cap or words. */
export type Hint = { key: string } | { text: string };

/** The hint line under the mode switch: the three most useful keys of the mode, then "? all keys". */
export function modeHints(mode: Mode): Hint[] {
  const tail: Hint[] = [{ key: '?' }, { text: 'all keys' }];
  switch (mode) {
    case 'notes':
      return [{ key: '↑' }, { key: '↓' }, { text: 'pitch ·' }, { key: '2' }, { text: '–' }, { key: '6' }, { text: 'length ·' }, { key: 'T' }, { text: 'tie ·' }, ...tail];
    case 'lyrics':
      return [{ key: 'Tab' }, { text: 'type ·' }, { key: 'Enter' }, { text: 'next note ·' }, ...tail];
    case 'chords':
      return [{ key: 'Tab' }, { text: 'type ·' }, { key: 'Enter' }, { text: 'next event ·' }, ...tail];
    default:
      return [{ key: '←' }, { key: '→' }, { text: 'note ·' }, { key: 'Space' }, { text: 'listen ·' }, ...tail];
  }
}

/** Where a key press came from on the sheet page. */
export type KeyPlace = 'sheet' | 'field' | 'other';

const MOVE_KEYS: Record<string, string> = { ArrowLeft: 'lr', ArrowRight: 'lr', Home: 'he', End: 'he', Enter: 'listen', ' ': 'listen' };
const NOTE_KEYS: Record<string, string> = { '.': 'dot', p: 'trip', r: 'rest', t: 'tie', delete: 'del', backspace: 'del' };

function chordRow(e: KeyboardEvent): string | null {
  const key = e.key.toLowerCase();
  if (key === 's' && !e.shiftKey) return 'save';
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  return key === 'y' && e.ctrlKey ? 'redo' : null;
}

function fieldRow(e: KeyboardEvent): string | null {
  if (e.key === 'Escape') return 'tesc';
  if (e.key === 'Tab' && e.shiftKey) return 'prev';
  return e.key === 'Enter' || e.key === 'Tab' ? 'next' : null;
}

function noteRow(e: KeyboardEvent, octave: boolean): string | null {
  const key = e.key.toLowerCase();
  if (key === 'arrowup' || key === 'arrowdown') return octave ? 'oct' : 'semi';
  if (octave) return null;
  if (/^[a-g]$/.test(key)) return 'letter';
  if (/^[2-6]$/.test(key)) return 'len';
  return NOTE_KEYS[key] ?? null;
}

/**
 * The row a key press on the sheet page belongs to, so the panel can light it up; null for any other key.
 * It names the row, not whether the key did anything (a length key with nothing selected still lights its row).
 */
export function rowFor(e: KeyboardEvent, mode: Mode, place: KeyPlace): string | null {
  if (e.altKey) return null;
  if (e.ctrlKey || e.metaKey) {
    const chord = chordRow(e);
    if (chord !== null || place !== 'sheet' || mode !== 'notes') return chord;
    return noteRow(e, true);
  }
  if (place === 'field') return fieldRow(e);
  if (place !== 'sheet') return null;
  if (e.key === 'Escape') return mode === 'lyrics' || mode === 'chords' ? 'tesc' : 'esc';
  if (e.key === 'Tab' && !e.shiftKey && (mode === 'lyrics' || mode === 'chords')) return 'tabin';
  if (mode === 'notes') {
    const row = noteRow(e, false);
    if (row !== null) return row;
  }
  return MOVE_KEYS[e.key] ?? null;
}

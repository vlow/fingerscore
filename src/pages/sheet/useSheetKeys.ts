import type { KeyboardEvent, RefObject } from 'react';
import type { Derived } from '../../domain/derive';
import { BASE_LENGTHS, setLength, setLetter, shiftPitch, toggleDotted, toggleRest, toggleTie } from '../../domain/edit';
import type { Doc } from '../../domain/types';
import type { Mode } from '../../ui/ModeSwitch';

/** Keys pressed here keep their own meaning: the title inputs, the pills and the alternate-fingering popover. */
const OWN_KEYS = 'input, textarea, select, button, a, [role="dialog"]';
/** While one of these is open, editing keys on the sheet do nothing. */
const OPEN_LAYERS = '[role="dialog"], [role="menu"]';
/** Letter keys in the order setLetter numbers them (0 = C … 6 = B). */
const LETTERS = 'cdefgab';
/**
 * The Edit notes key a key press means: e.key when it is a Latin letter, a digit or ".", else the physical key from
 * e.code (KeyA–KeyZ, Digit0–Digit9, Period), so Cyrillic, Greek or Hebrew letters and AZERTY's shifted digits work.
 */
function editKey(e: KeyboardEvent<HTMLElement>): string {
  if (e.key.length !== 1) return e.key;
  const key = e.key.toLowerCase();
  if (/^[a-z0-9.]$/.test(key)) return key;
  const letter = /^Key([A-Z])$/.exec(e.code);
  if (letter) return letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(e.code);
  if (digit) return digit[1];
  return e.code === 'Period' ? '.' : key;
}

interface SheetKeys {
  doc: Doc;
  derived: Derived;
  mode: Mode;
  selectedId: string | null;
  /** The event whose alternate-fingering popover is open. */
  openAlt: string | null;
  stops: { id: string; k: number }[];
  paperRef: RefObject<HTMLDivElement | null>;
  select(picked: string | null, byKeyboard?: boolean): void;
  applyNoteEdit(next: Doc | null, selectId?: string): void;
  togglePlay(): void;
}

/** The sheet's keys in every mode: arrows, Home/End, Esc, Enter/Space, Tab into the panel field, and the Edit notes keys. */
export function useSheetKeys(p: SheetKeys) {
  const { doc, derived, mode, selectedId, openAlt, stops, paperRef, select, applyNoteEdit, togglePlay } = p;

  /** The Edit notes keys; true when the key is one of them (handled, or doing nothing because its edit is disabled). */
  function noteKey(e: KeyboardEvent<HTMLDivElement>): boolean {
    if (mode !== 'notes' || selectedId === null || e.altKey || e.nativeEvent.isComposing) return false;
    if (openAlt !== null || document.querySelector(OPEN_LAYERS)) return false;
    const id = selectedId;
    const octave = e.ctrlKey || e.metaKey;
    const key = editKey(e);
    // French AZERTY needs Shift for digits and the dot; Shift with any other key does nothing.
    if (e.shiftKey && !/^[0-9.]$/.test(key)) return false;
    let next: Doc | null;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      next = shiftPitch(doc, id, (key === 'ArrowUp' ? 1 : -1) * (octave ? 12 : 1));
    } else if (octave) {
      return false;
    } else if (key.length === 1 && LETTERS.includes(key)) {
      next = setLetter(doc, id, LETTERS.indexOf(key), 'nearest');
    } else if (key >= '2' && key <= '6' && key.length === 1) {
      next = setLength(doc, id, BASE_LENGTHS[Number(key) - 2]);
    } else if (key === '.') {
      next = toggleDotted(doc, id);
    } else if (key === 'r') {
      next = toggleRest(doc, id);
    } else if (key === 't') {
      next = toggleTie(doc, id);
    } else if (key === 'Delete' || key === 'Backspace') {
      next = derived.byId[id].rest ? null : toggleRest(doc, id);
    } else {
      return false;
    }
    e.preventDefault();
    applyNoteEdit(next);
    return true;
  }

  function onSheetKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target instanceof Element && e.target.closest(OWN_KEYS)) return;
    if (noteKey(e)) return;
    // Tab from the sheet goes into the open Lyric or Chord field (the keyboard path after arrow keys). Only the current
    // mode's panel counts: while its chunk loads, the previous mode's panel can stay in the DOM, hidden by Suspense.
    const field = e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey
      ? paperRef.current?.querySelector<HTMLInputElement>(`[data-panel="${mode}"] input`) : null;
    if (field) { e.preventDefault(); field.focus(); return; }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (stops.length === 0) return;
    const at = selectedId === null ? -1 : derived.events.indexOf(derived.byId[selectedId]);
    const after = stops.find(st => st.k > at);
    const before = [...stops].reverse().find(st => st.k < at);
    let next: string;
    switch (e.key) {
      case 'ArrowRight': next = (after ?? stops[stops.length - 1]).id; break;
      case 'ArrowLeft': next = (selectedId === null ? stops[stops.length - 1] : before ?? stops[0]).id; break;
      case 'Home': next = stops[0].id; break;
      case 'End': next = stops[stops.length - 1].id; break;
      case 'Escape':
        if (selectedId === null) return;
        e.preventDefault();
        select(null);
        return;
      case 'Enter':
      case ' ':
        e.preventDefault();
        togglePlay();
        return;
      default:
        return;
    }
    e.preventDefault();
    if (next !== selectedId) select(next, true);
  }

  function onToolbarKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Escape' || e.defaultPrevented || selectedId === null) return;
    e.preventDefault();
    select(null);
  }

  return { onSheetKey, onToolbarKey };
}

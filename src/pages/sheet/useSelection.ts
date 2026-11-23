import { useEffect, useMemo, useRef, useState } from 'react';
import type { Derived, DerivedEvent } from '../../domain/derive';
import { lengthName } from '../../domain/edit';
import { barCap } from '../../domain/time';
import type { Doc } from '../../domain/types';
import { useApp } from '../../state/store';
import type { Mode } from '../../ui/ModeSwitch';

/** A note that can carry a syllable: not a rest, not a tied continuation. */
const takesSyllable = (ev: DerivedEvent) => !ev.rest && !ev.tiedFrom;

/**
 * The sheet's mode and selection: which event is selected, where the keyboard stops in each mode, which Lyric or Chord
 * field takes focus, and the aria-live announcement of selections and edits.
 */
export function useSelection(doc: Doc, derived: Derived) {
  // Selection: one event, UI state only. Ids are stable across instrument, key and tempo changes;
  // an id the document no longer has counts as no selection, and loading another sheet clears it.
  const [mode, setMode] = useState<Mode>('view');
  const [selection, setSelection] = useState<string | null>(null);
  /**
   * The event whose Lyric or Chord field takes focus, and a count that re-focuses it: a click on the sheet (also one
   * that lands on the selected note again), a switch to Lyrics or Chords mode, Enter/Tab in the field. Arrow keys on
   * the sheet clear it, so the arrows keep working.
   */
  const [fieldFocus, setFieldFocus] = useState<{ id: string; n: number } | null>(null);
  const focusField = (id: string) => setFieldFocus(f => ({ id, n: (f?.n ?? 0) + 1 }));
  const [announcement, setAnnouncement] = useState('');
  const selectedId = selection !== null && derived.byId[selection] ? selection : null;
  const paperRef = useRef<HTMLDivElement | null>(null);
  const scrollToSelection = useRef(false);
  const sheetGen = useApp(st => st.sheetGen);
  useEffect(() => { setSelection(null); setAnnouncement(''); }, [sheetGen]);
  const firstBar = doc.score.length > 0 && doc.score[0].cap < barCap(doc.timeSig) ? 0 : 1;

  /** In Lyrics mode a rest or tied continuation hands the selection to the next note that can carry a syllable. */
  function landing(id: string, m: Mode): string {
    if (m !== 'lyrics' || takesSyllable(derived.byId[id])) return id;
    const k = derived.events.indexOf(derived.byId[id]);
    const notes = derived.events.flatMap((ev, j) => (takesSyllable(ev) ? [{ id: ev.id, j }] : []));
    // At the end of the song there is no next note: the nearest earlier one takes the syllable.
    const to = notes.find(n => n.j > k) ?? notes.filter(n => n.j < k).pop();
    return to ? to.id : id;
  }

  const barLabel = (ev: DerivedEvent) => (ev.bar + firstBar === 0 ? 'pickup bar' : `bar ${ev.bar + firstBar}`);

  function select(picked: string | null, byKeyboard = false) {
    const id = picked === null ? null : landing(picked, mode);
    setSelection(id);
    if (byKeyboard || id === null) setFieldFocus(null);
    else focusField(id);
    scrollToSelection.current = byKeyboard && id !== null;
    if (id === null) { setAnnouncement('Selection cleared'); return; }
    const ev = derived.byId[id];
    setAnnouncement(`Selected: ${ev.rest ? 'rest' : ev.spelled.name}, ${barLabel(ev)}`);
  }

  useEffect(() => {
    if (!scrollToSelection.current || selectedId === null) return;
    scrollToSelection.current = false;
    const paper = paperRef.current;
    const el = paper?.querySelector(`[data-hit="${selectedId}"]`);
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    // A bar edit can move the panel to another system; the clicked button is gone, so the sheet takes the keys again.
    if (paper && !paper.contains(document.activeElement)) paper.focus({ preventScroll: true });
  }, [selectedId]);

  // Edits from the Edit notes panel and keys (design 4.3). The edited event is announced once the document has changed.
  const announceEdit = useRef<string | null>(null);
  useEffect(() => {
    const id = announceEdit.current;
    announceEdit.current = null;
    const ev = id === null ? undefined : derived.byId[id];
    if (ev) setAnnouncement(`${ev.rest ? 'rest' : ev.spelled.name}, ${lengthName(ev.d)}, ${barLabel(ev)}`);
  }, [derived]);

  function applyNoteEdit(next: Doc | null, selectId?: string) {
    if (selectedId === null || !useApp.getState().applyEdit(next)) return;
    if (selectId !== undefined) {
      setSelection(selectId);
      scrollToSelection.current = true;
    }
    announceEdit.current = selectId ?? selectedId;
  }

  /** A click on Lyrics or Chords focuses the field of the selected note; arrow keys leave the focus on the switch. */
  function changeMode(m: Mode, byClick: boolean) {
    setMode(m);
    if (selectedId === null) return;
    const id = landing(selectedId, m);
    if (id !== selectedId) select(id);
    if (byClick && (m === 'lyrics' || m === 'chords')) focusField(id);
    else setFieldFocus(null);
  }

  // Keyboard order: every event in score order. Edit notes and Chords mode include tied continuations
  // (they can be edited); View skips them; Lyrics mode stops only on notes that can carry a syllable.
  // Positions are indices into derived.events, so a clicked continuation still has neighbours.
  const stops = useMemo(() => derived.events.flatMap((ev, k) => {
    const stop = mode === 'notes' || mode === 'chords' ? true : mode === 'lyrics' ? takesSyllable(ev) : !ev.tiedFrom;
    return stop ? [{ id: ev.id, k }] : [];
  }), [derived, mode]);

  return {
    mode, selection, setSelection, selectedId, fieldFocus, focusField, announcement, setAnnouncement, paperRef, firstBar,
    select, applyNoteEdit, changeMode, stops,
  };
}

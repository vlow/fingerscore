import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
import type { Derived } from '../../domain/derive';
import type { Doc } from '../../domain/types';
import { SHEET, type SheetLayout } from '../../render/layout';
import { LoadBoundary } from '../../ui/LoadBoundary';
import type { Mode } from '../../ui/ModeSwitch';
import s from '../SheetPage.module.css';

// The panels load on demand: the first switch into an edit mode fetches its panel (see preloadPanel).
const loaders = {
  notes: () => import('../../ui/NotePanel'),
  lyrics: () => import('../../ui/LyricPanel'),
  chords: () => import('../../ui/ChordPanel'),
};
const NotePanel = lazy(loaders.notes);
const LyricPanel = lazy(loaders.lyrics);
const ChordPanel = lazy(loaders.chords);

/** Starts loading a mode's panel, so the first click on a note does not wait on the network. */
export function preloadPanel(mode: Mode): void {
  if (mode !== 'view') loaders[mode]().catch(() => {});   // a failed load shows the reload notice when the panel renders
}

const PANEL: Record<Exclude<Mode, 'view'>, string> = { notes: 'Edit notes panel', lyrics: 'Lyrics panel', chords: 'Chords panel' };
/** Width of an editing panel under a system (prototype .edp). */
const PANEL_WIDTH = 360;

interface PanelSlot {
  doc: Doc;
  derived: Derived;
  layout: SheetLayout;
  mode: Mode;
  selectedId: string | null;
  fieldFocus: { id: string; n: number } | null;
  paperRef: RefObject<HTMLDivElement | null>;
  select(picked: string | null, byKeyboard?: boolean): void;
  focusField(id: string): void;
  applyNoteEdit(next: Doc | null, selectId?: string): void;
  applyTextEdit(next: Doc | null, coalesceKey?: string): void;
}

/** The editing panel of the current mode under the selected event's system, and how the focus moves into and out of it. */
export function useEditPanelSlot(p: PanelSlot) {
  const { doc, derived, layout, mode, selectedId, fieldFocus, paperRef, select, focusField, applyNoteEdit, applyTextEdit } = p;

  // Where each event sits: its system and its x in system coordinates, for the editing panel.
  const place = useMemo(() => {
    const m = new Map<string, { system: number; x: number }>();
    for (const system of layout.systems) for (const bar of system.bars) for (const e of bar.events) m.set(e.id, { system: system.index, x: e.x });
    return m;
  }, [layout]);

  /** Enter or Tab in a panel's field: the selection moves and the field keeps the focus. */
  function moveField(id: string) {
    select(id, true);
    focusField(id);
  }

  const focusSheet = useCallback(() => paperRef.current?.focus({ preventScroll: true }), []);

  /** Esc in a panel's field clears the selection; the sheet takes the keys again. */
  function closePanel() {
    select(null);
    paperRef.current?.focus({ preventScroll: true });
  }

  // Panel buttons never take the focus from a click: it stays on the sheet (Edit notes keys keep working) or in the
  // Lyric/Chord field. A button reached by Tab keeps it; Esc there clears the selection like on the sheet.
  function keepFocusOffButtons(e: MouseEvent<HTMLDivElement>) {
    if (e.target instanceof Element && e.target.closest('button')) e.preventDefault();
  }

  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Escape' || e.defaultPrevented || !(e.target instanceof Element && e.target.closest('button'))) return;
    e.preventDefault();
    closePanel();
  }

  // A focused panel button that became disabled or disappeared hands the focus to the sheet. Focus that moves
  // anywhere else (a click outside, Tab) ends the watch.
  const panelFocus = useRef(false);
  const gone = (el: EventTarget) => el instanceof HTMLButtonElement && (el.disabled || !el.isConnected);
  useEffect(() => {
    if (!panelFocus.current) return;
    const a = document.activeElement;
    const lost = a === null || a === document.body || !a.isConnected || (a instanceof HTMLButtonElement && a.disabled);
    if (!lost) return;
    panelFocus.current = false;
    paperRef.current?.focus({ preventScroll: true });
  });

  // The editing panel of the current mode, directly under the system that holds the selected event.
  // Esc closes a panel by clearing the selection. While the panel's code is loading an invisible box of the panel's
  // min-height holds its place, so the systems below do not jump; the Lyric and Chord fields take the focus when they
  // mount, so a click before the code arrived still lands in the field. A chunk that fails to load shows a reload
  // notice in the panel's place (one boundary per mode); the sheet stays usable.
  const renderUnderSystem = (systemIndex: number) => {
    const at = selectedId === null ? undefined : place.get(selectedId);
    if (mode === 'view' || selectedId === null || !at || at.system !== systemIndex) return null;
    const left = Math.round(Math.max(0, Math.min(SHEET.systemWidth - PANEL_WIDTH, at.x - PANEL_WIDTH / 2)));
    return (
      <LoadBoundary compact key={mode}>
        <Suspense fallback={<div className={s.panel} style={{ left, visibility: 'hidden' }} aria-hidden="true" />}>
          <div role="group" aria-label={PANEL[mode]} data-panel={mode} className={s.panel} style={{ left }}
            onMouseDown={keepFocusOffButtons} onKeyDown={onPanelKey} onFocus={() => { panelFocus.current = true; }}
            onBlur={e => { if (!gone(e.target)) panelFocus.current = false; }}>
            {mode === 'notes' && <NotePanel doc={doc} derived={derived} id={selectedId} onEdit={applyNoteEdit} />}
            {mode === 'chords' && (
              <ChordPanel doc={doc} derived={derived} id={selectedId} focusKey={fieldFocus?.id === selectedId ? fieldFocus.n : null}
                onEdit={applyTextEdit} onMove={moveField} onClose={closePanel} onExit={focusSheet} />
            )}
            {mode === 'lyrics' && (
              <LyricPanel doc={doc} id={selectedId} focusKey={fieldFocus?.id === selectedId ? fieldFocus.n : null} onEdit={applyTextEdit} onMove={moveField} onClose={closePanel} onExit={focusSheet} />
            )}
          </div>
        </Suspense>
      </LoadBoundary>
    );
  };

  return { renderUnderSystem, focusSheet };
}

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { createPlayer, type Player } from '../audio/player';
import { derive, type DerivedEvent } from '../domain/derive';
import { BASE_LENGTHS, locate, setLength, setLetter, shiftPitch, toggleRest, toggleTie } from '../domain/edit';
import { hasSatellites } from '../domain/fingerings';
import { FAMILIES, familyMembers } from '../domain/instruments';
import { keySignature, spell } from '../domain/keys';
import { fileName, importMessage, readSheet, serializeFile } from '../domain/persistence';
import { buildSchedule, firstTickOf, sliceSchedule } from '../domain/playback';
import { barCap } from '../domain/time';
import type { Doc } from '../domain/types';
import { usableTracks } from '../import/melody';
import { SHEET, layoutSheet } from '../render/layout';
import { Paper } from '../render/Paper';
import { deleteWithUndo } from '../state/deleteWithUndo';
import { listEntries } from '../state/library';
import { canRedo, canUndo, saveStatus, useApp } from '../state/store';
import AltFingeringPopover, { popoverWidth } from '../ui/AltFingeringPopover';
import Banners from '../ui/Banners';
import ChordPanel from '../ui/ChordPanel';
import BulkCard from '../ui/BulkCard';
import { downloadText } from '../ui/download';
import FileMenu from '../ui/FileMenu';
import KeyBridge from '../ui/KeyBridge';
import LyricPanel from '../ui/LyricPanel';
import { ModeSwitch, type Mode } from '../ui/ModeSwitch';
import NotePanel, { lengthName, toggleDotted } from '../ui/NotePanel';
import PageBar from '../ui/PageBar';
import RangeMeter from '../ui/RangeMeter';
import SaveControls from '../ui/SaveControls';
import ShowToggles from '../ui/ShowToggles';
import Steps from '../ui/Steps';
import Transport from '../ui/Transport';
import { UndoRedo } from '../ui/UndoRedo';
import { useSheetShortcuts } from '../ui/useSheetShortcuts';
import '../styles/print.css';
import s from './SheetPage.module.css';

const SIMPLIFIED = 'Rhythm simplified: triplets and notes shorter than a sixteenth were rounded.';
const SHEET_LABEL = 'Sheet music. Arrow keys select a note, Enter plays from it.';
/** Keys pressed here keep their own meaning: the title inputs, the pills and the alternate-fingering popover. */
const OWN_KEYS = 'input, textarea, select, button, a, [role="dialog"]';
/** While one of these is open, editing keys on the sheet do nothing. */
const OPEN_LAYERS = '[role="dialog"], [role="menu"]';
/** Letter keys in the order setLetter numbers them (0 = C … 6 = B). */
const LETTERS = 'cdefgab';
const MISSING = 'That sheet is no longer saved in this browser.';
/** Sources that went through the import steps; a sheet opened from a file or the library did not. */
const IMPORTED: Doc['source']['format'][] = ['MIDI', 'MusicXML', 'sample'];
const PANEL: Record<Exclude<Mode, 'view'>, string> = { notes: 'Edit notes panel', lyrics: 'Lyrics panel', chords: 'Chords panel' };
/** Width of an editing panel under a system (prototype .edp). */
const PANEL_WIDTH = 360;
/** A note that can carry a syllable: not a rest, not a tied continuation. */
const takesSyllable = (ev: DerivedEvent) => !ev.rest && !ev.tiedFrom;

export default function SheetPage() {
  const doc = useApp(st => st.doc);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const id = params.get('id');

  // /sheet?id=… opens a saved sheet, then drops the query; an unknown id goes to the start page.
  useEffect(() => {
    if (id === null) return;
    if (useApp.getState().openEntry(id)) navigate('/sheet', { replace: true });
    else navigate('/', { replace: true, state: { missingSheet: true } });
  }, [id, navigate]);

  if (id !== null) return null;
  if (!doc) return <Navigate to="/" replace />;
  return <Sheet doc={doc} />;
}

function Card(p: { heading: ReactNode; badge?: ReactNode; children: ReactNode; labelledBy?: string }) {
  return (
    <section className={s.card} aria-labelledby={p.labelledBy}>
      <div className={s.cardHead}>{p.heading}{p.badge}</div>
      {p.children}
    </section>
  );
}

function Toggle<T extends string>(p: { label: string; options: { value: T; name: string; sub?: string }[]; value: T; onPick(v: T): void }) {
  return (
    <div role="group" aria-label={p.label} className={s.segment}>
      {p.options.map(o => (
        <button key={o.value} type="button" className={s.segButton} aria-pressed={p.value === o.value}
          aria-describedby={o.sub ? `seg-${o.value}` : undefined} onClick={() => p.onPick(o.value)}>
          {o.name}
          {o.sub && <span id={`seg-${o.value}`} className={s.segSub} aria-hidden="true">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

function Sheet({ doc }: { doc: Doc }) {
  const song = useApp(st => st.song);
  const prefs = useApp(st => st.prefs);
  const setInstrument = useApp(st => st.setInstrument);
  const setShift = useApp(st => st.setShift);
  const patchDoc = useApp(st => st.patchDoc);
  const setFingering = useApp(st => st.setFingering);
  const resetFingerings = useApp(st => st.resetFingerings);
  const libraryId = useApp(st => st.libraryId);
  const undoable = useApp(canUndo);
  const redoable = useApp(canRedo);
  const savedSnapshot = useApp(st => st.savedSnapshot);
  const saveError = useApp(st => st.saveError);
  const navigate = useNavigate();

  const derived = useMemo(() => derive(doc, prefs), [doc, prefs]);
  const layout = useMemo(() => layoutSheet(doc, derived), [doc, derived]);
  const i = derived.inst;

  // Selection: one event, UI state only. Ids are stable across instrument, key and tempo changes;
  // an id the document no longer has counts as no selection, and loading another sheet clears it.
  const [mode, setMode] = useState<Mode>('view');
  const [selection, setSelection] = useState<string | null>(null);
  /** The event whose Lyric or Chord field takes focus: set by a click on the sheet and by Enter/Tab in the field. */
  const [fieldFocus, setFieldFocus] = useState<string | null>(null);
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
    setFieldFocus(byKeyboard ? null : id);
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

  /** The Edit notes keys; true when the key is one of them (handled, or doing nothing because its edit is disabled). */
  function noteKey(e: KeyboardEvent<HTMLDivElement>): boolean {
    if (mode !== 'notes' || selectedId === null || e.altKey || e.shiftKey || e.nativeEvent.isComposing) return false;
    if (openAlt !== null || document.querySelector(OPEN_LAYERS)) return false;
    const id = selectedId;
    const octave = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let next: Doc | null;
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      next = shiftPitch(doc, id, (key === 'ArrowUp' ? 1 : -1) * (octave ? 12 : 1));
    } else if (octave) {
      return false;
    } else if (LETTERS.includes(key)) {
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

  function changeMode(m: Mode) {
    setMode(m);
    if (m === 'lyrics' && selectedId !== null && landing(selectedId, m) !== selectedId) {
      select(landing(selectedId, m));
      setFieldFocus(null);   // the mode switch keeps the focus
    }
  }

  // Keyboard order: every event in score order. Edit notes and Chords mode include tied continuations
  // (they can be edited); View skips them; Lyrics mode stops only on notes that can carry a syllable.
  // Positions are indices into derived.events, so a clicked continuation still has neighbours.
  const stops = useMemo(() => derived.events.flatMap((ev, k) => {
    const stop = mode === 'notes' || mode === 'chords' ? true : mode === 'lyrics' ? takesSyllable(ev) : !ev.tiedFrom;
    return stop ? [{ id: ev.id, k }] : [];
  }), [derived, mode]);

  function onSheetKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target instanceof Element && e.target.closest(OWN_KEYS)) return;
    if (noteKey(e)) return;
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

  // Playback. The player (and its AudioContext) is created on the first Play.
  const playerRef = useRef<Player | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playError, setPlayError] = useState(false);
  useEffect(() => () => playerRef.current?.stop(), [doc.score, doc.shift, doc.inst, doc.tempo]);

  function togglePlay() {
    const current = playerRef.current;
    if (playing && current) {
      current.stop();
      setPlaying(false);
      setPlayingId(null);
      return;
    }
    try {
      const player = current ?? createPlayer();
      playerRef.current = player;
      const from = selectedId === null ? null : firstTickOf(doc, selectedId);
      const full = buildSchedule(doc);
      player.play(from === null ? full : sliceSchedule(full, from), doc, id => {
        setPlayingId(id);
        setPlaying(player.playing);
      });
      setPlayError(false);
      setPlaying(true);
    } catch {
      setPlayError(true);
      setPlaying(false);
      setPlayingId(null);
    }
  }

  function print() {
    playerRef.current?.stop();
    window.print();
  }

  // Saving and files (design 4.4). fileError is the line under the page bar; the next successful action clears it.
  const status = useMemo(() => saveStatus({ doc, libraryId, savedSnapshot }), [doc, libraryId, savedSnapshot]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [libraryChanged, setLibraryChanged] = useState(0);
  // The menu reads the library each time it opens, and again after a save, open, delete or undo here.
  const entries = useMemo(() => listEntries(), [libraryId, savedSnapshot, libraryChanged]);

  const save = useCallback(() => {
    if (useApp.getState().saveSheet()) setFileError(null);
  }, []);

  // Undo and redo leave the selection alone unless its event is gone from the document they bring back.
  function travel(step: 'undo' | 'redo') {
    const st = useApp.getState();
    st[step]();
    const now = useApp.getState().doc;
    if (selection !== null && (!now || locate(now, selection) === null)) setSelection(null);
  }

  useSheetShortcuts({ onSave: save, onUndo: () => travel('undo'), onRedo: () => travel('redo') });

  function download() {
    downloadText(fileName(doc.title), serializeFile(doc));
    setFileError(null);
  }

  async function openFile(file: File) {
    const r = await readSheet(file);
    if (!r.ok) { setFileError(importMessage(file.name, r.reason)); return; }
    const opened = useApp.getState().openImported(r.doc, file.name);
    setFileError(opened.saved ? null : opened.message);
  }

  function openSaved(id: string) {
    if (useApp.getState().openEntry(id)) { setFileError(null); return; }
    setFileError(MISSING);
    setLibraryChanged(n => n + 1);
  }

  function deleteSaved(id: string) {
    deleteWithUndo(id, {
      onChanged: () => setLibraryChanged(n => n + 1),
      onDeleted: () => setFileError(null),
      onFailed: setFileError,
    });
  }

  // Alternate fingerings: one popover at a time, anchored to its pill.
  const [openAlt, setOpenAlt] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const closeAlt = useCallback((focusAnchor: boolean) => {
    if (focusAnchor) anchorRef.current?.focus();
    setOpenAlt(null);
  }, []);
  useEffect(() => setOpenAlt(null), [doc.shift, doc.inst]);

  const renderUnderChart = (ev: DerivedEvent, x: number, y: number, _system: number, lastSystem: boolean) => {
    if (ev.options.length < 2) return null;
    const open = openAlt === ev.id;
    const width = popoverWidth(ev.options.length);
    const tone = open ? s.pillOpen : ev.overridden ? s.pillChanged : '';
    return (
      <>
        <button type="button" className={`${s.pill} ${tone}`} data-print-hide="" style={{ left: x - 13, top: y }}
          aria-haspopup="dialog" aria-expanded={open} aria-label={`⇅ ${ev.options.length} alternate fingerings for ${ev.spelled.name}`}
          onClick={e => {
            if (open) { closeAlt(false); return; }
            anchorRef.current = e.currentTarget;
            setOpenAlt(ev.id);
          }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" />
          </svg>
          {ev.options.length}
        </button>
        {open && (
          <AltFingeringPopover ev={ev} bar={ev.bar + firstBar} kind={i.kind} chartStyle={doc.chartStyle}
            left={Math.round(Math.max(0, Math.min(SHEET.systemWidth - width, x - width / 2)))}
            top={lastSystem ? SHEET.chartY - 148 : SHEET.chartY + 112}
            anchor={anchorRef.current}
            onPick={k => { setFingering(ev.id, k === ev.auto ? null : k); closeAlt(true); }}
            onClose={closeAlt} />
        )}
      </>
    );
  };

  // Where each event sits: its system and its x in system coordinates, for the editing panel.
  const place = useMemo(() => {
    const m = new Map<string, { system: number; x: number }>();
    for (const system of layout.systems) for (const bar of system.bars) for (const e of bar.events) m.set(e.id, { system: system.index, x: e.x });
    return m;
  }, [layout]);

  /** Enter or Tab in a panel's field: the selection moves and the field keeps the focus. */
  function moveField(id: string) {
    select(id, true);
    setFieldFocus(id);
  }

  /** Esc in a panel's field clears the selection; the sheet takes the keys again. */
  function closePanel() {
    select(null);
    paperRef.current?.focus({ preventScroll: true });
  }

  const applyTextEdit = (next: Doc | null, coalesceKey?: string) => { useApp.getState().applyEdit(next, coalesceKey); };

  // The editing panel of the current mode, directly under the system that holds the selected event.
  // Esc closes a panel by clearing the selection.
  const renderUnderSystem = (systemIndex: number) => {
    const at = selectedId === null ? undefined : place.get(selectedId);
    if (mode === 'view' || selectedId === null || !at || at.system !== systemIndex) return null;
    const left = Math.round(Math.max(0, Math.min(SHEET.systemWidth - PANEL_WIDTH, at.x - PANEL_WIDTH / 2)));
    return (
      <div role="group" aria-label={PANEL[mode]} className={s.panel} style={{ left }}>
        {mode === 'notes' && <NotePanel doc={doc} derived={derived} id={selectedId} onEdit={applyNoteEdit} />}
        {mode === 'chords' && (
          <ChordPanel doc={doc} derived={derived} id={selectedId} focus={fieldFocus === selectedId}
            onEdit={applyTextEdit} onMove={moveField} onClose={closePanel} />
        )}
        {mode === 'lyrics' && (
          <LyricPanel doc={doc} id={selectedId} focus={fieldFocus === selectedId} onEdit={applyTextEdit} onMove={moveField} onClose={closePanel} />
        )}
      </div>
    );
  };

  function onToolbarKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Escape' || e.defaultPrevented || selectedId === null) return;
    e.preventDefault();
    select(null);
  }

  const sounding = doc.score.flatMap(b => b.ev).filter(e => !e.r).map(e => e.m);
  const origSig = keySignature(doc.originalTonicPc, doc.originalMode);
  const origRange = sounding.length
    ? `${spell(Math.min(...sounding), origSig).name} – ${spell(Math.max(...sounding), origSig).name}` : '—';
  const changeTrack = song !== null && usableTracks(song).length > 1;
  const { withAlternates, overridden } = derived.counts;

  return (
    <div className={s.page}>
      <div data-print-hide="">
        <PageBar
          left={
            IMPORTED.includes(doc.source.format) ? (
              <>
                <Steps current="sheet" />
                <div className={s.chip}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                  <span className={s.chipFile}>{doc.source.file}</span>
                  <span className={s.chipMeta}>
                    {`${doc.source.format} · track ${doc.source.track} of ${doc.source.trackCount} · ${derived.counts.notes} notes`}
                  </span>
                  {changeTrack && <Link to="/tracks" className={s.chipLink}>Change track</Link>}
                </div>
              </>
            ) : (
              <div className={s.chip}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" />
                </svg>
                <span className={s.chipSaved}>
                  {doc.source.format === 'file'
                    ? `${doc.source.file} · fingerscore sheet · ${derived.counts.notes} notes`
                    : `${doc.title.trim() || 'Untitled sheet'} · saved in this browser · ${derived.counts.notes} notes`}
                </span>
              </div>
            )
          }
          right={
            <div className={s.barRight}>
              <UndoRedo canUndo={undoable} canRedo={redoable} onUndo={() => travel('undo')} onRedo={() => travel('redo')} />
              <SaveControls status={status} error={saveError} onSave={save} />
              <FileMenu entries={entries} currentId={libraryId} onPrint={print} onDownload={download}
                onOpenFile={file => void openFile(file)} onNew={() => navigate('/')} onOpen={openSaved} onDelete={deleteSaved}
                onOpenMenu={() => setLibraryChanged(n => n + 1)} />
            </div>
          }
        />
        {fileError && <p role="alert" className={s.fileError}>{fileError}</p>}
      </div>

      <div className={s.body}>
        <aside className={s.side} data-print-hide="">
          <Card heading={<h2 id="detected-h" className={s.cardTitle}>Detected in file</h2>} labelledBy="detected-h">
            <dl className={s.facts}>
              <div><dt>Key (concert)</dt><dd>{derived.originalKey}</dd></div>
              <div><dt>Range</dt><dd>{origRange}</dd></div>
              <div><dt>Time</dt><dd>{doc.timeSig[0]}/{doc.timeSig[1]}</dd></div>
              <div><dt>Tempo</dt><dd>♩ = {doc.tempo}</dd></div>
              <div><dt>Track</dt><dd>{doc.source.track}</dd></div>
            </dl>
            {doc.source.simplified && <p className={s.notice}>{SIMPLIFIED}</p>}
          </Card>

          <Card heading={<label htmlFor="inst" className={s.cardTitle}>Fingerings for</label>}>
            <select id="inst" className={s.select} value={doc.inst} onChange={e => setInstrument(e.target.value as Doc['inst'])}>
              {FAMILIES.map(f => (
                <optgroup key={f} label={f}>
                  {familyMembers(f).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              ))}
            </select>
            {hasSatellites(i.kind) && (
              <Toggle label="Fingering chart style" value={doc.chartStyle} onPick={v => patchDoc({ chartStyle: v })}
                options={[{ value: 'compact', name: 'Compact', sub: 'only keys in use' }, { value: 'full', name: 'Full key map', sub: 'every key, ghosted' }]} />
            )}
            {i.kind === 'rec' && (
              <Toggle label="Recorder fingering system" value={doc.recorderSystem} onPick={v => patchDoc({ recorderSystem: v })}
                options={[{ value: 'baroque', name: 'Baroque fingering' }, { value: 'german', name: 'German fingering' }]} />
            )}
            {withAlternates > 0 && doc.show.fingerings && (
              <div className={s.alts}>
                <span>
                  {withAlternates} {withAlternates === 1 ? 'note has' : 'notes have'} alternate fingerings · {overridden} changed by you
                </span>
                {overridden > 0 && (
                  <button type="button" className={s.small} onClick={() => { closeAlt(false); resetFingerings(); }}>Reset all to auto</button>
                )}
              </div>
            )}
          </Card>

          <Card heading={<h2 id="key-h" className={s.cardTitle}>Key &amp; transposition</h2>} labelledBy="key-h"
            badge={derived.isSuggested && <span className={s.badge}>Suggested</span>}>
            <KeyBridge doc={doc} derived={derived} onShift={setShift} />
          </Card>

          <Card heading={<h2 id="range-h" className={s.cardTitle}>Range check</h2>} labelledBy="range-h">
            <RangeMeter derived={derived} />
          </Card>

          <Card heading={<h2 id="text-h" className={s.cardTitle}>Lyrics &amp; chords</h2>} labelledBy="text-h">
            <BulkCard doc={doc} selectedId={selectedId} onEdit={applyTextEdit} />
          </Card>

          <Card heading={<h2 id="show-h" className={s.cardTitle}>Show on sheet</h2>} labelledBy="show-h">
            <ShowToggles show={doc.show} onChange={show => patchDoc({ show })} />
          </Card>
        </aside>

        <div className={s.main}>
          <div data-print-hide="" className={s.banners}>
            <Banners doc={doc} derived={derived} onShift={setShift} />
          </div>
          <div className={s.toolbar} data-print-hide="" onKeyDown={onToolbarKey}>
            <ModeSwitch mode={mode} onMode={changeMode} />
            <div className={s.toolbarEnd}>
              {playError && <p role="alert" className={s.playError}>Playback is not available in this browser.</p>}
              <Transport playing={playing} fromSelected={selectedId !== null} tempo={doc.tempo} onToggle={togglePlay} onTempo={tempo => patchDoc({ tempo }, 'tempo')} />
            </div>
          </div>
          <div ref={paperRef} className={s.paperScroll} data-print-paper="" tabIndex={0} role="group" aria-label={SHEET_LABEL}
            onKeyDown={onSheetKey}>
            <p className={s.srOnly} aria-live="polite">{announcement}</p>
            <Paper doc={doc} derived={derived} layout={layout} playingId={playingId}
              selectedId={selectedId} onSelect={id => select(id)}
              onTitle={title => patchDoc({ title }, 'title')} onSubtitle={subtitle => patchDoc({ subtitle }, 'subtitle')}
              renderUnderChart={renderUnderChart}
              forceShow={{ lyrics: mode === 'lyrics', chords: mode === 'chords' }} renderUnderSystem={renderUnderSystem} />
          </div>
        </div>
      </div>
    </div>
  );
}

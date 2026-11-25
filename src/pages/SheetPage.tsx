import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { derive } from '../domain/derive';
import { locate } from '../domain/edit';
import { hasSatellites } from '../domain/fingerings';
import { FAMILIES, familyMembers } from '../domain/instruments';
import { jumpProblems } from '../domain/jumps';
import { keySignature, spell } from '../domain/keys';
import type { Doc } from '../domain/types';
import { usableTracks } from '../import/melody';
import { layoutSheet } from '../render/layout';
import { Paper } from '../render/Paper';
import { canRedo, canUndo, useApp } from '../state/store';
import Banners from '../ui/Banners';
import FileMenu from '../ui/FileMenu';
import JumpNotice from '../ui/JumpNotice';
import KeyBridge from '../ui/KeyBridge';
import { LoadBoundary } from '../ui/LoadBoundary';
import { ModeSwitch } from '../ui/ModeSwitch';
import PageBar from '../ui/PageBar';
import RangeMeter from '../ui/RangeMeter';
import SaveControls from '../ui/SaveControls';
import PaperChoice from '../ui/PaperChoice';
import ShowToggles from '../ui/ShowToggles';
import Steps from '../ui/Steps';
import Transport from '../ui/Transport';
import { UndoRedo } from '../ui/UndoRedo';
import { useSheetShortcuts } from '../ui/useSheetShortcuts';
import Card from './sheet/Card';
import Toggle from './sheet/Toggle';
import { useAltFingering } from './sheet/useAltFingering';
import { preloadPanel, useEditPanelSlot } from './sheet/useEditPanelSlot';
import { useFileActions } from './sheet/useFileActions';
import { paperDescription } from './sheet/paperDescription';
import { usePlayback } from './sheet/usePlayback';
import { PLAY_MODE_LOAD_FAILED, usePlayModeLoad } from './sheet/usePlayModeLoad';
import { useSelection } from './sheet/useSelection';
import { useSheetKeys } from './sheet/useSheetKeys';
import '../styles/print.css';
import s from './SheetPage.module.css';

// The bulk card loads on demand; the side column shows nothing in its place until it has arrived, and a reload
// notice when it cannot arrive.
const BulkCard = lazy(() => import('../ui/BulkCard'));

const SIMPLIFIED = 'Rhythm simplified: notes shorter than a sixteenth and tuplets other than triplets were rounded.';
const SHEET_LABEL = 'Sheet music. Arrow keys select a note, Enter listens from it.';
/** Sources that went through the import steps; a sheet opened from a file or the library did not. */
const IMPORTED: Doc['source']['format'][] = ['MIDI', 'MusicXML', 'MuseScore', 'ABC', 'sample'];

export default function SheetPage() {
  const doc = useApp(st => st.doc);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const id = params.get('id');

  const play = params.get('mode') === 'play';

  // /sheet?id=… opens a saved sheet, then drops the query; an unknown id goes to the start page.
  // &mode=play (▶ Play in the library) opens the sheet in Play mode.
  useEffect(() => {
    if (id === null) return;
    if (useApp.getState().openEntry(id)) navigate('/sheet', { replace: true, state: play ? { playMode: true } : null });
    else navigate('/', { replace: true, state: { missingSheet: true } });
  }, [id, play, navigate]);

  if (id !== null) return null;
  if (!doc) return <Navigate to="/" replace />;
  return <Sheet doc={doc} />;
}

function Sheet({ doc }: { doc: Doc }) {
  const song = useApp(st => st.song);
  const prefs = useApp(st => st.prefs);
  const setInstrument = useApp(st => st.setInstrument);
  const setShift = useApp(st => st.setShift);
  const patchDoc = useApp(st => st.patchDoc);
  const resetFingerings = useApp(st => st.resetFingerings);
  const undoable = useApp(canUndo);
  const redoable = useApp(canRedo);
  const saveError = useApp(st => st.saveError);
  const navigate = useNavigate();

  const derived = useMemo(() => derive(doc, prefs), [doc, prefs]);
  const layout = useMemo(() => layoutSheet(doc, derived), [doc, derived]);
  const problems = useMemo(() => jumpProblems(doc), [doc]);
  const i = derived.inst;

  const {
    mode, selection, setSelection, selectedId, fieldFocus, focusField, announcement, setAnnouncement, paperRef, firstBar,
    select, applyNoteEdit, changeMode, stops,
  } = useSelection(doc, derived);
  const { playerRef, playing, playingId, playError, togglePlay, stopPlay } = usePlayback(doc, selectedId);
  const { openAlt, closeAlt, renderUnderChart } = useAltFingering(doc, firstBar, i.kind);
  const { onSheetKey, onToolbarKey } = useSheetKeys({
    doc, derived, mode, selectedId, openAlt, stops, paperRef, select, applyNoteEdit, togglePlay,
  });

  const {
    libraryId, status, fileError, entries, setLibraryChanged, save, print, pdfBusy, downloadPdf, download, openFile, openSaved, deleteSaved,
  } = useFileActions(doc, playerRef, setAnnouncement);

  // Undo and redo leave the selection alone unless its event is gone from the document they bring back.
  function travel(step: 'undo' | 'redo') {
    const st = useApp.getState();
    if (step === 'undo' ? !canUndo(st) : !canRedo(st)) return;
    st[step]();
    // The same word twice in a row would leave the live region unchanged, and a screen reader
    // would stay silent on the second press: a zero-width space makes the repeat a new text.
    const word = step === 'undo' ? 'Undone' : 'Redone';
    setAnnouncement(prev => (prev === word ? `${word}\u200B` : word));
    const now = useApp.getState().doc;
    if (selection !== null && (!now || locate(now, selection) === null)) setSelection(null);
  }

  // Play mode (SPEC §11a) covers the page: no audio, no edit mode, no selection, and nothing that changes the document.
  // Its code loads on first use; until it has arrived the sheet stays as it is, and a failed load shows a notice.
  // A sheet opened with ▶ Play starts there, once: the history entry loses that state, so a reload shows the editor.
  const location = useLocation();
  const startsInPlayMode = (location.state as { playMode?: boolean } | null)?.playMode === true;
  const [performing, setPerforming] = useState(false);
  const descriptionId = useId();
  const playModeButton = useRef<HTMLButtonElement>(null);
  const { View: PlayMode, failed: playModeFailed, request: enterPlayMode } = usePlayModeLoad(() => {
    stopPlay();
    closeAlt(false);
    changeMode('view', false);
    select(null);
    setPerforming(true);
  });
  useEffect(() => {
    if (!startsInPlayMode) return;
    navigate(location.pathname, { replace: true, state: null });
    enterPlayMode();
  }, [startsInPlayMode, location.pathname, navigate, enterPlayMode]);
  const wasPerforming = useRef(false);
  useEffect(() => {
    if (wasPerforming.current && !performing) playModeButton.current?.focus();
    wasPerforming.current = performing;
  }, [performing]);

  useSheetShortcuts({
    onSave: () => { if (!performing) save(); },
    onUndo: () => { if (!performing) travel('undo'); },
    onRedo: () => { if (!performing) travel('redo'); },
  });

  const applyTextEdit = (next: Doc | null, coalesceKey?: string) => { useApp.getState().applyEdit(next, coalesceKey); };

  const { renderUnderSystem, focusSheet } = useEditPanelSlot({
    doc, derived, layout, mode, selectedId, fieldFocus, paperRef, select, focusField, applyNoteEdit, applyTextEdit,
  });

  const sounding = doc.score.flatMap(b => b.ev).filter(e => !e.r).map(e => e.m);
  const origSig = keySignature(doc.originalTonicPc, doc.originalMode);
  const origRange = sounding.length
    ? `${spell(Math.min(...sounding), origSig).name} – ${spell(Math.max(...sounding), origSig).name}` : '—';
  const changeTrack = song !== null && usableTracks(song).length > 1;
  const { withAlternates, overridden } = derived.counts;

  return (
    <div className={s.page}>
      {performing && PlayMode && <PlayMode doc={doc} derived={derived} layout={layout} onExit={() => setPerforming(false)} />}
      <div data-print-hide="">
        <PageBar
          left={
            IMPORTED.includes(doc.source.format) ? (
              <>
                <Steps current="sheet" />
                <div className={s.chip}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
              <UndoRedo canUndo={undoable} canRedo={redoable} onUndo={() => travel('undo')} onRedo={() => travel('redo')}
                onFocusLost={focusSheet} />
              <SaveControls status={status} error={saveError} onSave={save} />
              <FileMenu entries={entries} currentId={libraryId} onPdf={() => void downloadPdf()} pdfBusy={pdfBusy} onPrint={print} onDownload={download}
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

          <Card heading={<label htmlFor="inst" className={`${s.cardTitle} ${s.cardLabel}`}>Fingerings for</label>}>
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
            <LoadBoundary compact>
              <Suspense fallback={null}>
                <BulkCard doc={doc} selectedId={selectedId} onEdit={applyTextEdit} />
              </Suspense>
            </LoadBoundary>
          </Card>

          <Card heading={<h2 id="show-h" className={s.cardTitle}>Show on sheet</h2>} labelledBy="show-h">
            <ShowToggles show={doc.show} onChange={show => patchDoc({ show })} />
            <PaperChoice variant="card" />
          </Card>
        </aside>

        <div className={s.main}>
          <div data-print-hide="" className={s.banners}>
            <Banners doc={doc} derived={derived} onShift={setShift} />
          </div>
          {/* The handler catches keys that bubble up from the controls inside; the div itself is not a control. */}
          <div role="presentation" className={s.toolbar} data-print-hide="" onKeyDown={onToolbarKey}>
            <ModeSwitch mode={mode} onMode={(m, byClick) => { preloadPanel(m); changeMode(m, byClick); }} />
            <div className={s.toolbarEnd}>
              {playError && <p role="alert" className={s.playError}>Playback is not available in this browser.</p>}
              {playModeFailed && <p role="alert" className={s.playError}>{PLAY_MODE_LOAD_FAILED}</p>}
              <Transport playing={playing} fromSelected={selectedId !== null} tempo={doc.tempo} onToggle={togglePlay} onTempo={tempo => patchDoc({ tempo }, 'tempo')}
                onPlayMode={enterPlayMode} playModeRef={playModeButton} />
            </div>
          </div>
          {!performing && <JumpNotice problems={problems} dropped={doc.source.dropped ?? []} />}
          {/* Outside the group it describes: a description inside its own element is read twice. */}
          <p id={descriptionId} className={s.srOnly}>{paperDescription(doc, derived)}</p>
          {/* Focusable on purpose: a scrolling area must be reachable by keyboard, and the sheet keys act from here. */}
          <div ref={paperRef} className={s.paperScroll} data-print-paper="" tabIndex={0} role="group" aria-label={SHEET_LABEL} // NOSONAR typescript:S6845
            aria-describedby={descriptionId} onKeyDown={onSheetKey}>
            <p role="status" className={s.srOnly} aria-live="polite">{announcement}</p>
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

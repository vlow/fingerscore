import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { createPlayer, type Player } from '../audio/player';
import { derive, type DerivedEvent } from '../domain/derive';
import { hasSatellites } from '../domain/fingerings';
import { FAMILIES, familyMembers } from '../domain/instruments';
import { keySignature, spell } from '../domain/keys';
import { buildSchedule } from '../domain/playback';
import { barCap } from '../domain/time';
import type { Doc } from '../domain/types';
import { usableTracks } from '../import/melody';
import { SHEET, layoutSheet } from '../render/layout';
import { Paper } from '../render/Paper';
import { useApp } from '../state/store';
import AltFingeringPopover, { popoverWidth } from '../ui/AltFingeringPopover';
import Banners from '../ui/Banners';
import KeyBridge from '../ui/KeyBridge';
import PageBar from '../ui/PageBar';
import RangeMeter from '../ui/RangeMeter';
import ShowToggles from '../ui/ShowToggles';
import Steps from '../ui/Steps';
import Transport from '../ui/Transport';
import '../styles/print.css';
import s from './SheetPage.module.css';

const SIMPLIFIED = 'Rhythm simplified: triplets and notes shorter than a sixteenth were rounded.';

export default function SheetPage() {
  const doc = useApp(st => st.doc);
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

  const derived = useMemo(() => derive(doc, prefs), [doc, prefs]);
  const layout = useMemo(() => layoutSheet(doc, derived), [doc, derived]);
  const i = derived.inst;

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
      player.play(buildSchedule(doc), doc, id => {
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

  // Alternate fingerings: one popover at a time, anchored to its pill.
  const [openAlt, setOpenAlt] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const closeAlt = useCallback((focusAnchor: boolean) => {
    if (focusAnchor) anchorRef.current?.focus();
    setOpenAlt(null);
  }, []);
  useEffect(() => setOpenAlt(null), [doc.shift, doc.inst]);

  const firstBar = doc.score.length > 0 && doc.score[0].cap < barCap(doc.timeSig) ? 0 : 1;

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
          }
          right={
            <button type="button" className={s.print} onClick={print}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" />
              </svg>
              Print
            </button>
          }
        />
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

          <Card heading={<h2 id="show-h" className={s.cardTitle}>Show on sheet</h2>} labelledBy="show-h">
            <ShowToggles show={doc.show} onChange={show => patchDoc({ show })} />
          </Card>
        </aside>

        <div className={s.main}>
          <div data-print-hide="" className={s.banners}>
            <Banners doc={doc} derived={derived} onShift={setShift} />
          </div>
          <div className={s.toolbar} data-print-hide="">
            {playError && <p role="alert" className={s.playError}>Playback is not available in this browser.</p>}
            <Transport playing={playing} tempo={doc.tempo} onToggle={togglePlay} onTempo={tempo => patchDoc({ tempo })} />
          </div>
          <div className={s.paperScroll} data-print-paper="">
            <Paper doc={doc} derived={derived} layout={layout} playingId={playingId}
              onTitle={title => patchDoc({ title })} onSubtitle={subtitle => patchDoc({ subtitle })}
              renderUnderChart={renderUnderChart} />
          </div>
        </div>
      </div>
    </div>
  );
}

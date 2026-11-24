import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Derived } from '../domain/derive';
import { SPEED, ZOOM, beatsPerLine, pageCount, pageNumber, scrollSpeed, speedLabel, stepZoom, turnTarget } from '../domain/playMode';
import type { Doc } from '../domain/types';
import type { SheetLayout } from '../render/layout';
import { Paper } from '../render/Paper';
import { readPlayModePrefs, writePlayModePrefs } from '../state/playModePrefs';
import s from './PlayMode.module.css';

interface Props { doc: Doc; derived: Derived; layout: SheetLayout; onExit(): void }

/** The scroll has reached the end when less than this many pixels are left. */
const END_SLACK = 2;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Keeps the screen on while mounted, where the browser can; a refusal is not an error. */
function useWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const request = () => {
      if (!('wakeLock' in navigator) || lock !== null) return;
      try {
        navigator.wakeLock.request('screen').then(got => {
          if (gone) { void got.release().catch(() => {}); return; }
          lock = got;
          // The browser lets go of the lock when the tab is hidden; ask again when it is back.
          got.addEventListener?.('release', () => { if (lock === got) lock = null; });
        }, () => {});
      } catch {
        // an old or locked-down browser: the screen dims as usual
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') request(); };
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', onVisible);
      const held = lock;
      lock = null;
      try { void held?.release().catch(() => {}); } catch { /* already released */ }
    };
  }, []);
}

/**
 * Play mode (SPEC §11a): the sheet alone on the whole screen, for playing from it. Pages turn with the toolbar,
 * the screen edges, the arrow keys, Page Up/Down and Space (a page-turner pedal sends those); the sheet can scroll
 * by itself at the speed of the music. Nothing here changes the document.
 */
export default function PlayMode({ doc, derived, layout, onExit }: Props): JSX.Element {
  const [prefs, setPrefs] = useState(readPlayModePrefs);
  const [auto, setAuto] = useState(false);
  const [page, setPage] = useState({ n: 1, of: 1 });
  const regionRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const beats = beatsPerLine(doc, layout.systems.length);
  // The running scroll reads its speed here, so the slider, the zoom and the tempo apply without a restart.
  const speedRef = useRef(0);
  speedRef.current = scrollSpeed(beats, doc.tempo, prefs.speed, prefs.zoom);

  useWakeLock();

  const change = (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    if (next.zoom === prefs.zoom && next.speed === prefs.speed) return;
    setPrefs(next);
    writePlayModePrefs(next);
  };

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = { n: pageNumber(el.scrollTop, el.scrollHeight, el.clientHeight), of: pageCount(el.scrollHeight, el.clientHeight) };
    setPage(prev => (prev.n === next.n && prev.of === next.of ? prev : next));
  }, []);

  // The page count depends on the zoom, the sheet and the window.
  useLayoutEffect(measure, [measure, prefs.zoom, layout]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // The keys work from the first moment, and everything else on the page is out of reach while play mode is open.
  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    region.focus();
    const others = [...document.body.children].filter(el => el !== region && !el.hasAttribute('inert'));
    others.forEach(el => el.setAttribute('inert', ''));
    return () => others.forEach(el => el.removeAttribute('inert'));
  }, []);

  useEffect(() => {
    if (!auto) return;
    let id = 0;
    let last: number | null = null;
    let carry = 0;
    const step = (ts: number) => {
      const el = scrollerRef.current;
      if (!el) return;
      if (last !== null) {
        carry += (speedRef.current * (ts - last)) / 1000;
        const px = Math.floor(carry);
        if (px >= 1) { el.scrollTop += px; carry -= px; }
      }
      last = ts;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - END_SLACK) { setAuto(false); return; }
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [auto]);

  function turn(dir: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const top = turnTarget(el.scrollTop, el.scrollHeight, el.clientHeight, dir);
    if (top === el.scrollTop) return;
    el.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); onExit(); return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const from = e.target instanceof Element ? e.target : null;
    // The slider keeps its own keys; a focused button keeps Space and Enter.
    if (from?.closest('input')) return;
    const onButton = !!from?.closest('button');
    switch (e.key) {
      case ' ':
        if (onButton) return;
        turn(1);
        break;
      case 'Enter':
        return;
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': turn(1); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': turn(-1); break;
      case 'a': case 'A': setAuto(on => !on); break;
      case '+': case '=': change({ zoom: stepZoom(prefs.zoom, 1) }); break;
      case '-': case '−': change({ zoom: stepZoom(prefs.zoom, -1) }); break;
      default: return;
    }
    e.preventDefault();
  }

  return createPortal(
    <div ref={regionRef} role="region" aria-label="Play mode" tabIndex={-1} className={s.overlay} data-print-hide="" onKeyDown={onKey}>
      <div ref={scrollerRef} data-testid="play-scroller" className={s.scroller} onScroll={measure}>
        <div className={s.pad}>
          <div data-testid="play-zoom" className={s.zoomed} style={{ zoom: prefs.zoom / 100 }}>
            <Paper doc={doc} derived={derived} layout={layout} playingId={null} readOnly />
          </div>
        </div>
      </div>
      {/* The screen edges turn pages for a finger or a mouse; the toolbar buttons are the same thing for everyone else. */}
      <div aria-hidden="true" data-turn="prev" className={`${s.zone} ${s.zonePrev}`} onClick={() => turn(-1)} />
      <div aria-hidden="true" data-turn="next" className={`${s.zone} ${s.zoneNext}`} onClick={() => turn(1)} />
      {/* A− and A+ at their limit stay focusable (aria-disabled): a disabled button would drop the focus, and the keys with it. */}
      <div role="toolbar" aria-label="Play mode controls" className={s.bar}>
        <button type="button" className={s.btn} aria-label="Exit play mode (Esc)" title="Exit (Esc)" onClick={onExit}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          Exit
        </button>
        <span aria-hidden="true" className={s.rule} />
        <button type="button" className={s.btn} aria-label="Previous page" title="Previous page (←, Page Up)" onClick={() => turn(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <span aria-live="polite" className={s.page}>Page {page.n} / {page.of}</span>
        <button type="button" className={s.btn} aria-label="Next page" title="Next page (→, Space, Page Down)" onClick={() => turn(1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
        <span aria-hidden="true" className={s.rule} />
        <button type="button" className={`${s.btn} ${auto ? s.on : ''}`} aria-pressed={auto} title="Auto-scroll (A)" onClick={() => setAuto(on => !on)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></svg>
          {auto ? 'Pause' : 'Auto-scroll'}
        </button>
        <label className={s.speed}>
          Speed
          <input type="range" className={s.slider} aria-label="Auto-scroll speed" min={SPEED.min} max={SPEED.max} step={SPEED.step}
            value={prefs.speed} onChange={e => change({ speed: Number(e.target.value) })} />
          <span className={s.readout}>{speedLabel(beats, doc.tempo, prefs.speed)}</span>
        </label>
        <span aria-hidden="true" className={s.rule} />
        <button type="button" className={s.btn} aria-label="Smaller" title="Smaller (−)" aria-disabled={prefs.zoom <= ZOOM.min}
          onClick={() => change({ zoom: stepZoom(prefs.zoom, -1) })}>A−</button>
        <button type="button" className={s.btn} aria-label="Larger" title="Larger (+)" aria-disabled={prefs.zoom >= ZOOM.max}
          onClick={() => change({ zoom: stepZoom(prefs.zoom, 1) })}>A+</button>
      </div>
    </div>,
    document.body,
  );
}

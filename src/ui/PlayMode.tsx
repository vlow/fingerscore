import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Derived } from '../domain/derive';
import {
  READ_AT, SPEED, ZOOM, fitZoom, fullLineBeats, leadIn, pageCount, pageNumber, scrollSpeed, shownZoom, speedLabel, stepZoom, systemAt,
  systemBeats, turnTarget, zoomBelow,
} from '../domain/playMode';
import type { Doc } from '../domain/types';
import { SHEET, type SheetLayout } from '../render/layout';
import { Paper } from '../render/Paper';
import { readPlayModePrefs, writePlayModePrefs } from '../state/playModePrefs';
import s from './PlayMode.module.css';

interface Props { doc: Doc; derived: Derived; layout: SheetLayout; onExit(): void }

/** The scroll has reached the end when less than this many pixels are left. */
const END_SLACK = 2;
/** A smooth page turn is over after this long at the latest, whatever became of it. */
const TURN_MS = 1000;
/** A tap on the outer part of the screen on either side turns the page. */
const EDGE = 0.12;
/** The longest time one frame of auto-scroll counts for: frames stop while the tab is hidden, and the sheet must not jump on return. */
const MAX_FRAME_MS = 100;
/** Keys a range input needs for itself; every other key works from the slider as from anywhere. */
const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

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
      void (async () => {
        try {
          const got = await navigator.wakeLock.request('screen');
          if (gone) { void got.release().catch(() => {}); return; }
          lock = got;
          // The browser lets go of the lock when the tab is hidden; ask again when it is back.
          got.addEventListener?.('release', () => { if (lock === got) lock = null; });
        } catch {
          // a refusal, or an old or locked-down browser: the screen dims as usual
        }
      })();
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
  // The paper is never wider than the screen: the chosen zoom is kept, a narrow screen shows less of it.
  const [fit, setFit] = useState(Infinity);
  const zoom = shownZoom(prefs.zoom, fit);
  const canGrow = prefs.zoom < ZOOM.max && prefs.zoom < fit;
  const canShrink = zoom > ZOOM.min;
  const regionRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const beats = useMemo(() => systemBeats(doc, layout.systems), [doc, layout]);
  // The running scroll reads its pace here, so the slider, the zoom and the tempo apply without a restart.
  const pace = useRef({ beats, tempo: doc.tempo, speed: prefs.speed, zoom });
  pace.current = { beats, tempo: doc.tempo, speed: prefs.speed, zoom };
  // Where the lines are in the scrolled content: the top of the first one and the distance to the next.
  const lines = useRef({ firstTop: 0, pitch: 0 });
  // Auto-scroll waits while the music comes down from the top of the screen to the reading line: how far it has
  // come (CSS pixels), and the seconds left for the readout.
  const travelled = useRef(0);
  const [startsIn, setStartsIn] = useState<number | null>(null);

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
    const systems = el.querySelectorAll('[data-testid="system"]');
    if (systems.length > 0) {
      const top = (sys: Element) => sys.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
      const firstTop = top(systems[0]);
      lines.current = { firstTop, pitch: systems.length > 1 ? (top(systems[systems.length - 1]) - firstTop) / (systems.length - 1) : 0 };
    }
    const next = { n: pageNumber(el.scrollTop, el.scrollHeight, el.clientHeight), of: pageCount(el.scrollHeight, el.clientHeight) };
    setPage(prev => (prev.n === next.n && prev.of === next.of ? prev : next));
  }, []);

  // The page count depends on the zoom, the sheet and the window.
  useLayoutEffect(measure, [measure, zoom, layout]);
  // The width to fit depends on the window alone, and is read only when the window changes: the zoom it leads to
  // must never be a reason to read it again. (The scroller always shows its scrollbar, so the zoom cannot change
  // the width either; a width that followed the zoom would flip between two sizes without end.)
  useLayoutEffect(() => {
    const onResize = () => {
      const el = scrollerRef.current;
      if (el) setFit(fitZoom(el.clientWidth));
      measure();
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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
    travelled.current = 0;
    const step = (ts: number) => {
      const el = scrollerRef.current;
      if (!el) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - END_SLACK) { setAuto(false); return; }
      // The pace of the line the player reads: every line passes in the time its own beats take.
      const p = pace.current;
      const pitch = lines.current.pitch > 0 ? lines.current.pitch : (SHEET.systemHeight * p.zoom) / 100;
      const at = systemAt(el.scrollTop + READ_AT * el.clientHeight, lines.current.firstTop, pitch, p.beats.length);
      const speed = scrollSpeed(p.beats[at] ?? 0, p.tempo, p.speed, p.zoom);
      const moved = last === null ? 0 : (speed * Math.min(ts - last, MAX_FRAME_MS)) / 1000;
      last = ts;
      const wait = leadIn(el.clientHeight) - travelled.current;
      if (wait > 0 && speed > 0) {
        travelled.current += moved;
        const left = Math.ceil(Math.max(0, wait - moved) / speed);
        setStartsIn(left > 0 ? left : null);
      } else {
        setStartsIn(null);
        carry += moved;
        const px = Math.floor(carry);
        if (px >= 1) { el.scrollTop += px; carry -= px; }
      }
      id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(id); setStartsIn(null); };
  }, [auto]);

  // Where a page turn is scrolling to. A second turn before it arrives (a pedal pressed twice) counts from there,
  // not from wherever the smooth scroll happens to be.
  const goingTo = useRef<{ top: number; since: number } | null>(null);

  function onScroll() {
    const el = scrollerRef.current;
    if (el && goingTo.current && Math.abs(el.scrollTop - goingTo.current.top) < 1) goingTo.current = null;
    measure();
  }

  function turn(dir: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    // While auto-scroll runs the turn is a jump: the next auto-scroll frame would cancel a smooth scroll.
    const smooth = !auto && !prefersReducedMotion();
    const pending = goingTo.current;
    const from = pending && smooth && performance.now() - pending.since < TURN_MS ? pending.top : el.scrollTop;
    const top = turnTarget(from, el.scrollHeight, el.clientHeight, dir);
    if (top === from) return;
    goingTo.current = smooth ? { top, since: performance.now() } : null;
    // After a turn the player reads from the top of the new page: auto-scroll waits again.
    travelled.current = 0;
    el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }

  /**
   * A tap or click on the left or right edge of the screen turns the page. The scroller itself takes the click, so
   * nothing lies over the sheet and a wheel or a finger scrolls at the edges as anywhere.
   */
  function onTap(e: MouseEvent<HTMLDivElement>) {
    const x = e.clientX / window.innerWidth;
    if (x < EDGE) turn(-1);
    else if (x > 1 - EDGE) turn(1);
  }

  /**
   * A mouse or finger on the toolbar hands the keyboard back to the region: a pedal that sends Space must turn the
   * page, not press the button last touched. A keyboard press (detail 0) keeps the focus where it is.
   */
  function onBarClick(e: MouseEvent<HTMLDivElement>) {
    if (e.detail > 0) regionRef.current?.focus();
  }

  function larger() { if (canGrow) change({ zoom: stepZoom(prefs.zoom, 1) }); }
  function smaller() { if (canShrink) change({ zoom: zoomBelow(zoom) }); }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') { e.preventDefault(); onExit(); return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const from = e.target instanceof Element ? e.target : null;
    // The slider keeps its arrows; a focused button keeps Space and Enter.
    if (from?.closest('input') && SLIDER_KEYS.has(e.key)) return;
    const onButton = !!from?.closest('button');
    const handled = ['ArrowRight', 'ArrowDown', 'PageDown', 'ArrowLeft', 'ArrowUp', 'PageUp', 'a', 'A', '+', '=', '-', '−'];
    // A held key, or a foot resting on the pedal, counts once.
    if (e.repeat && (handled.includes(e.key) || (e.key === ' ' && !onButton))) { e.preventDefault(); return; }
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
      case '+': case '=': larger(); break;
      case '-': case '−': smaller(); break;
      default: return;
    }
    e.preventDefault();
  }

  return createPortal(
    <div ref={regionRef} role="region" aria-label="Play mode" tabIndex={-1} className={s.overlay} data-print-hide="" onKeyDown={onKey}>
      {/* A tap is a pointer shortcut; the keys on the region above do the same. The scroller is not a control. */}
      <div ref={scrollerRef} role="presentation" data-testid="play-scroller" className={s.scroller} onScroll={onScroll}
        onWheel={() => { goingTo.current = null; }} onTouchMove={() => { goingTo.current = null; }} onClick={onTap}>
        <div className={s.pad}>
          <div data-testid="play-zoom" className={s.zoomed} style={{ zoom: zoom / 100 }}>
            <Paper doc={doc} derived={derived} layout={layout} playingId={null} readOnly />
          </div>
        </div>
      </div>
      {/* A− and A+ at their limit stay focusable (aria-disabled): a disabled button would drop the focus, and the keys with it. */}
      <div role="toolbar" aria-label="Play mode controls" className={s.bar} onClick={onBarClick}>
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
          <span className={s.readout}>{speedLabel(fullLineBeats(beats), doc.tempo, prefs.speed, startsIn)}</span>
        </label>
        <span aria-hidden="true" className={s.rule} />
        <button type="button" className={s.btn} aria-label="Smaller" title="Smaller (−)" aria-disabled={!canShrink}
          onClick={smaller}>A−</button>
        <button type="button" className={s.btn} aria-label="Larger" title="Larger (+)" aria-disabled={!canGrow}
          onClick={larger}>A+</button>
      </div>
    </div>,
    document.body,
  );
}

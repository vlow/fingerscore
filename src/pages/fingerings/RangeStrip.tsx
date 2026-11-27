import { useEffect, useLayoutEffect, useRef, useState, type TouchEvent, type WheelEvent } from 'react';
import { noteNameFlat } from '../../domain/instruments';
import s from '../Fingerings.module.css';
import { capacity, CELL, clampStart, follow, pageStep } from './strip';

/** A sideways wheel or trackpad move of this many pixels moves the strip by one note. */
const WHEEL_STEP = 40;

/**
 * The instrument's whole written range in one row (design 4.2). A dot marks notes with more than one fingering; extended
 * notes are shaded. When not all notes fit, the line under the row names the hidden ones as buttons that page the row,
 * and a sideways swipe, trackpad swipe or Shift+wheel moves it by one note. Choosing a note elsewhere moves the row just
 * enough to show it.
 */
export function RangeStrip(p: {
  notes: number[]; current: number; onPick(pitch: number): void;
  hasAlternates(pitch: number): boolean; extended(pitch: number): boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [start, setStart] = useState(0);
  const wheel = useRef(0);
  const touchX = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const total = p.notes.length;
  const shown = capacity(width, total);
  const index = p.notes.indexOf(p.current);
  // Choosing a note, here or elsewhere, moves the window just enough to show it.
  useEffect(() => {
    if (index >= 0) setStart(x => follow(x, index, shown, total));
  }, [index, shown, total]);

  const first = clampStart(start, shown, total);
  const move = (by: number) => setStart(clampStart(first + by, shown, total));
  const visible = p.notes.slice(first, first + shown);
  const before = p.notes.slice(0, first);
  const after = p.notes.slice(first + shown);
  const span = (list: number[]) => `${noteNameFlat(list[0])} – ${noteNameFlat(list[list.length - 1])}`;

  const onWheel = (e: WheelEvent) => {
    let delta = 0;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) delta = e.deltaX;
    else if (e.shiftKey) delta = e.deltaY;
    wheel.current += delta;
    const steps = Math.trunc(wheel.current / WHEEL_STEP);
    if (steps === 0) return;
    wheel.current -= steps * WHEEL_STEP;
    move(steps);
  };
  const onTouchStart = (e: TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchMove = (e: TouchEvent) => {
    if (touchX.current === null) return;
    const steps = Math.trunc((touchX.current - e.touches[0].clientX) / CELL);
    if (steps === 0) return;
    touchX.current -= steps * CELL;
    move(steps);
  };

  return (
    <section className={s.strip} aria-labelledby="range-strip-title">
      <p className={s.stripHead}>
        <span id="range-strip-title" className={s.cardTitle}>Whole range</span>
        <span className={s.muted}>click a note · a dot marks notes with more than one fingering</span>
      </p>
      {/* Sideways swipes move the row; the notes inside are the controls. */}
      <div ref={row} className={s.stripRow} role="group" aria-label="Notes of the range" onWheel={onWheel}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { touchX.current = null; }}>
        {visible.map(n => {
          const multi = p.hasAlternates(n);
          const ext = p.extended(n);
          const name = noteNameFlat(n);
          let label = name;
          if (multi) label += ', more than one fingering';
          if (ext) label += ', extended';
          return (
            <button key={n} type="button" className={`${s.stripNote} ${ext ? s.stripExt : ''}`} aria-pressed={n === p.current}
              aria-label={label} onClick={() => p.onPick(n)}>
              <span>{name}</span>
              <span className={multi ? s.dot : s.noDot} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {(before.length > 0 || after.length > 0) && (
        <div className={s.stripPages}>
          {before.length > 0 ? (
            <button type="button" className={s.pageButton} aria-label={`Show lower notes, ${span(before)}`} onClick={() => move(-pageStep(shown))}>
              ‹ {span(before)}
            </button>
          ) : <span />}
          {after.length > 0 && (
            <button type="button" className={s.pageButton} aria-label={`Show higher notes, ${span(after)}`} onClick={() => move(pageStep(shown))}>
              {span(after)} ›
            </button>
          )}
        </div>
      )}
    </section>
  );
}

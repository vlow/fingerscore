import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { fullLineBeats, scrollSpeed, sheetLines, speedLabel, systemBeats, tempoRange } from '../domain/playMode';
import { forgetUnsavedTempo, readPlayTempo } from '../state/playTempos';
import { WARMUP_SECONDS } from '../audio/metronome';
import { FakeAudioContext, type FakeNode } from '../test/fakeAudio';
import { DEFAULT_PREFS } from '../domain/transpose';
import { Paper } from '../render/Paper';
import { layoutSheet } from '../render/sheetLayout';
import { initTheme } from '../shell/theme';
import PlayMode from './PlayMode';

const KEY = 'fingerscore.playmode';
const TEMPO_KEY = 'fingerscore.playtempo';

/** Animation frames run by hand: frame(ms) calls the callbacks queued so far with that timestamp. */
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
function frame(ts: number) {
  const due = [...frames.values()];
  frames = new Map();
  act(() => due.forEach(cb => cb(ts)));
}
/** A clock for auto-scroll: run(ms) plays that much time in frames of 100 ms. */
let now = 0;
function run(ms: number) {
  for (let t = 0; t < ms; t += 100) frame(now += 100);
}

/** The last audio context Play mode made, for the metronome tests. */
let audio: FakeAudioContext | null = null;
class RecordingContext extends FakeAudioContext {
  constructor() { super(); audio = this; }
}

beforeEach(() => {
  window.localStorage.clear();
  forgetUnsavedTempo();
  audio = null;
  vi.stubGlobal('AudioContext', RecordingContext);
  frames = new Map();
  now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(nextFrame, cb); return nextFrame++; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'wakeLock');
});

function open(onExit = vi.fn(), sheetId: string | null = null) {
  const doc = sampleDoc('asax');
  const derived = derive(doc, DEFAULT_PREFS);
  const layout = layoutSheet(doc, derived);
  const lines = sheetLines(doc, layout.systems, layout.systemHeight);
  const view = render(
    <PlayMode lines={lines} tempo={doc.tempo} timeSig={doc.timeSig} sheetId={sheetId} onExit={onExit}>
      <Paper doc={doc} derived={derived} layout={layout} playingId={null} readOnly />
    </PlayMode>,
  );
  const region = screen.getByRole('region', { name: 'Play mode' });
  const scroller = screen.getByTestId('play-scroller');
  const scrollTo = vi.fn();
  scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;
  return { ...view, doc, layout, region, scroller, scrollTo, onExit };
}

/** jsdom has no layout: give the scroller a size and tell the component it scrolled. */
function size(scroller: HTMLElement, scrollHeight: number, clientHeight: number, scrollTop = 0) {
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: clientHeight });
  Object.defineProperty(scroller, 'scrollTop', { configurable: true, writable: true, value: scrollTop });
  fireEvent.scroll(scroller);
}

const zoomOf = () => screen.getByTestId('play-zoom').style.zoom;
const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as unknown;

describe('PlayMode', () => {
  it('shows the sheet as text only, on page 1 of 1, with the keyboard focus', () => {
    const { region } = open();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Water Is Wide');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(region.querySelectorAll('[data-hit]')).toHaveLength(0);
    expect(screen.getByText('Page 1 / 1')).toBeInTheDocument();
    expect(region).toHaveFocus();
  });

  it('has a named scroll region that the keyboard reaches, and its keys work from there', async () => {
    const { region, scroller, scrollTo, onExit } = open();
    size(scroller, 2760, 1000);
    const sheet = screen.getByRole('region', { name: 'Sheet music' });
    expect(sheet).toBe(scroller);
    expect(sheet).toHaveAttribute('tabindex', '0');
    await userEvent.tab();
    expect(sheet).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(scrollTo).toHaveBeenCalledWith({ top: 880, behavior: 'smooth' });
    await userEvent.keyboard('{Escape}');
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(region).toContainElement(sheet);
  });

  it('shows A− and A+ as text and names each button after its visible text, then what it does', () => {
    open();
    for (const [name, text] of [['A− Smaller', 'A−'], ['A+ Larger', 'A+']]) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveTextContent(text);
      expect(name.startsWith(button.textContent!)).toBe(true);
    }
  });

  it('turns a page of 88 % with → and shows the page it is on', () => {
    const { region, scroller, scrollTo } = open();
    size(scroller, 2760, 1000);
    expect(screen.getByText('Page 1 / 3')).toBeInTheDocument();
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(scrollTo).toHaveBeenCalledWith({ top: 880, behavior: 'smooth' });
    size(scroller, 2760, 1000, 880);
    expect(screen.getByText('Page 2 / 3')).toBeInTheDocument();
  });

  it('shows the new page number as soon as a turn starts, in both directions', () => {
    const { region, scroller } = open();
    size(scroller, 2760, 1000);
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(screen.getByText('Page 2 / 3')).toBeInTheDocument();
    size(scroller, 2760, 1000, 300);   // on its way to 880
    expect(screen.getByText('Page 2 / 3')).toBeInTheDocument();
    size(scroller, 2760, 1000, 880);   // arrived
    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(screen.getByText('Page 1 / 3')).toBeInTheDocument();
    size(scroller, 2760, 1000, 500);   // on its way to 0
    expect(screen.getByText('Page 1 / 3')).toBeInTheDocument();
  });

  it('shows the page under the scroll again once a wheel stops a turn', () => {
    const { region, scroller } = open();
    size(scroller, 2760, 1000);
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    size(scroller, 2760, 1000, 300);
    fireEvent.wheel(scroller);
    size(scroller, 2760, 1000, 320);
    expect(screen.getByText('Page 1 / 3')).toBeInTheDocument();
  });

  it.each(['ArrowDown', 'PageDown', ' '])('turns forward with %j', key => {
    const { region, scroller, scrollTo } = open();
    size(scroller, 2760, 1000);
    fireEvent.keyDown(region, { key });
    expect(scrollTo).toHaveBeenCalledWith({ top: 880, behavior: 'smooth' });
  });

  it.each(['ArrowLeft', 'ArrowUp', 'PageUp'])('turns back with %j, and stops at the top', key => {
    const { region, scroller, scrollTo } = open();
    size(scroller, 2760, 1000, 100);
    fireEvent.keyDown(region, { key });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('counts a second quick turn from where the first one is going, not from where the scroll is', () => {
    const { region, scroller, scrollTo } = open();
    size(scroller, 5000, 1000);
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    size(scroller, 5000, 1000, 300);   // the smooth scroll is on its way
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1760, behavior: 'smooth' });
    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('counts from the scroll position again once the turn has arrived, or the player scrolls by hand', () => {
    const { region, scroller, scrollTo } = open();
    size(scroller, 5000, 1000);
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    size(scroller, 5000, 1000, 880);   // arrived
    size(scroller, 5000, 1000, 1000);  // then scrolled on by hand
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1760, behavior: 'smooth' });   // the next page start
    size(scroller, 5000, 1000, 1500);  // on its way to 1760
    fireEvent.wheel(scroller);
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    // from 1500, not from 1760: that would be 2640
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1760, behavior: 'smooth' });
  });

  it('turns with the toolbar buttons and the tap zones', async () => {
    const user = userEvent.setup();
    const { region, scroller, scrollTo } = open();
    size(scroller, 2760, 1000, 880);
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(region).toHaveFocus();   // a click hands the keys back: a pedal's Space must not press the button again
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1760, behavior: 'smooth' });
    size(scroller, 2760, 1000, 1760);
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 880, behavior: 'smooth' });
    size(scroller, 2760, 1000, 880);
    // The screen edges: the outer 12 % on each side (jsdom's window is 1024 px wide).
    fireEvent.click(scroller, { clientX: 100 });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
    size(scroller, 2760, 1000, 0);
    fireEvent.click(scroller, { clientX: 950 });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 880, behavior: 'smooth' });
    scrollTo.mockClear();
    fireEvent.click(scroller, { clientX: 500 });
    expect(scrollTo).not.toHaveBeenCalled();
    // Nothing lies over the sheet's edges, so a wheel or a finger scrolls there too.
    expect(region.querySelector('[data-turn]')).toBeNull();
  });

  it('goes to the first and the last page with Home, End and the toolbar, and marks the button at its end', async () => {
    const user = userEvent.setup();
    const { region, scroller, scrollTo } = open();
    size(scroller, 2760, 1000, 880);
    const first = screen.getByRole('button', { name: 'First page' });
    const last = screen.getByRole('button', { name: 'Last page' });
    expect(first).toHaveAttribute('aria-keyshortcuts', 'Home');
    expect(last).toHaveAttribute('aria-keyshortcuts', 'End');
    expect(first).toHaveAttribute('aria-disabled', 'false');
    expect(last).toHaveAttribute('aria-disabled', 'false');
    fireEvent.keyDown(region, { key: 'End' });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1760, behavior: 'smooth' });
    expect(screen.getByText('Page 3 / 3')).toBeInTheDocument();
    size(scroller, 2760, 1000, 1760);
    expect(last).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(region, { key: 'Home' });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
    size(scroller, 2760, 1000, 0);
    expect(first).toHaveAttribute('aria-disabled', 'true');
    scrollTo.mockClear();
    await user.click(first);
    expect(scrollTo).not.toHaveBeenCalled();
    await user.click(last);
    expect(region).toHaveFocus();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1760, behavior: 'smooth' });
    size(scroller, 2760, 1000, 1760);
    await user.click(first);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('keeps Home and End for the tempo slider', () => {
    const { scroller, scrollTo } = open();
    size(scroller, 2760, 1000, 880);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Tempo' }), { key: 'End' });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does nothing on a turn when the sheet fits the screen', () => {
    const { region, scroller, scrollTo } = open();
    size(scroller, 900, 1000);
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.getByText('Page 1 / 1')).toBeInTheDocument();
  });

  it('exits with Esc and with the Exit button', async () => {
    const user = userEvent.setup();
    const { region, onExit } = open();
    fireEvent.keyDown(region, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Exit play mode (Esc)' }));
    expect(onExit).toHaveBeenCalledTimes(2);
  });

  it('starts at 125 %, zooms with + and −, and remembers the size', async () => {
    const user = userEvent.setup();
    const { region } = open();
    expect(zoomOf()).toBe('1.25');
    fireEvent.keyDown(region, { key: '+' });
    expect(zoomOf()).toBe('1.5');
    expect(stored()).toEqual({ zoom: 150 });
    fireEvent.keyDown(region, { key: '-' });
    fireEvent.keyDown(region, { key: '-' });
    expect(zoomOf()).toBe('1');
    await user.click(screen.getByRole('button', { name: 'A+ Larger' }));
    expect(zoomOf()).toBe('1.25');
    await user.click(screen.getByRole('button', { name: 'A− Smaller' }));
    expect(stored()).toEqual({ zoom: 100 });
  });

  it('keeps A+ focusable at the largest size, so the keys go on working', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(KEY, JSON.stringify({ zoom: 175 }));
    const { onExit } = open();
    const larger = screen.getByRole('button', { name: 'A+ Larger' });
    await user.click(larger);
    expect(zoomOf()).toBe('2');
    expect(larger).toHaveAttribute('aria-disabled', 'true');
    larger.focus();
    await user.keyboard('{Enter}');
    expect(larger).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('never shows the paper wider than the screen', async () => {
    const user = userEvent.setup();
    const { scroller, region } = open();
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 1024 });
    fireEvent(window, new Event('resize'));
    expect(Number(zoomOf())).toBeCloseTo(1000 / 940, 3);
    const larger = screen.getByRole('button', { name: 'A+ Larger' });
    expect(larger).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(region, { key: '+' });
    expect(stored()).toBeNull();
    // Smaller steps from what is on screen, to the next size on the grid.
    await user.click(screen.getByRole('button', { name: 'A− Smaller' }));
    expect(zoomOf()).toBe('1');
    expect(stored()).toEqual({ zoom: 100 });
    expect(larger).toHaveAttribute('aria-disabled', 'false');
    // A wider screen shows the chosen size again.
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 1600 });
    fireEvent(window, new Event('resize'));
    fireEvent.keyDown(region, { key: '+' });
    expect(zoomOf()).toBe('1.25');
  });

  it('settles on one size when a scrollbar comes and goes with the zoom', () => {
    // A classic scrollbar takes 15 px of width when the sheet is taller than the screen. If the fit followed that
    // width, a window at the tipping point would flip between two sizes for ever.
    const { scroller } = open();
    Object.defineProperty(scroller, 'clientWidth', {
      configurable: true,
      get: () => (Number(zoomOf()) >= 1.05 ? 1000 : 1015),
    });
    fireEvent(window, new Event('resize'));
    fireEvent(window, new Event('resize'));
    expect(screen.getByRole('region', { name: 'Play mode' })).toBeInTheDocument();
    expect(Number(zoomOf())).toBeGreaterThan(1);
  });

  it('opens with the stored size', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ zoom: 175 }));
    open();
    expect(zoomOf()).toBe('1.75');
  });

  it.each(['{"zoom":999}', 'not json', '[]', 'null'])('falls back to the default size for stored %s', raw => {
    window.localStorage.setItem(KEY, raw);
    open();
    expect(zoomOf()).toBe('1.25');
  });

  it('opens at the sheet’s tempo when the sheet has none stored', () => {
    const { doc } = open(vi.fn(), 's1');
    expect(screen.getByRole('slider', { name: 'Tempo' })).toHaveValue(String(doc.tempo));
    expect(readout()).toMatch(new RegExp(`^♩ = ${doc.tempo} · 100% · `));
  });

  it('opens at the stored tempo of this sheet, kept in the sheet’s range', () => {
    window.localStorage.setItem(TEMPO_KEY, JSON.stringify({ s1: 999, s2: 70 }));
    const { doc } = open(vi.fn(), 's1');
    expect(screen.getByRole('slider', { name: 'Tempo' })).toHaveValue(String(tempoRange(doc.tempo).max));
  });

  it('stores a tempo change for this sheet and leaves the sheet alone', () => {
    const { doc } = open(vi.fn(), 's1');
    const before = JSON.stringify(doc);
    const bpm = Math.round(doc.tempo * 0.8);
    fireEvent.change(screen.getByRole('slider', { name: 'Tempo' }), { target: { value: String(bpm) } });
    expect(readPlayTempo('s1')).toBe(bpm);
    expect(readout()).toMatch(new RegExp(`^♩ = ${bpm} · 80% · `));
    expect(JSON.stringify(doc)).toBe(before);
  });

  /** Starts auto-scroll on a tall sheet and returns the pace (px/s at 100 %) of the first two lines, slowest first. */
  function startAuto(o: ReturnType<typeof open>) {
    size(o.scroller, 50000, 1000);
    fireEvent.keyDown(o.region, { key: 'a' });
    frame(now);
    const beats = systemBeats(o.doc, o.layout.systems);
    const pace = beats.slice(0, 2).map(b => scrollSpeed(b, o.doc.tempo, 125, o.layout.systemHeight)).sort((a, b) => a - b);
    return { beats, slow: pace[0], fast: pace[1] };
  }
  const readout = () => screen.getByRole('slider', { name: 'Tempo' }).nextElementSibling!.textContent!;

  it('waits until the music is 35 % down the screen, then scrolls at the pace of the music', () => {
    const o = open();
    const { slow, fast } = startAuto(o);
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
    // 350 px of a 1000 px screen: the music takes 350 / pace seconds to get there. Nothing moves before.
    const wait = 350 / fast;
    run(Math.floor(wait - 1) * 1000);
    expect(o.scroller.scrollTop).toBe(0);
    expect(readout()).toMatch(/^♩ = 100 · 100% · starts in \d+ s$/);
    run(Math.ceil(350 / slow - Math.floor(wait - 1)) * 1000);
    expect(readout()).toMatch(/^♩ = 100 · 100% · 1 line \/ \d+ s$/);
    // From here the sheet moves as fast as the music: 3 s of it.
    const from = o.scroller.scrollTop;
    run(3000);
    expect(o.scroller.scrollTop - from).toBeGreaterThanOrEqual(Math.floor(slow * 3) - 1);
    expect(o.scroller.scrollTop - from).toBeLessThanOrEqual(Math.ceil(fast * 3) + 1);
  });

  it('paces every line by its own beats: a short last line does not hurry the others', () => {
    const o = open();
    const { beats } = startAuto(o);
    // Put the reading line in the fourth line (lines are the layout's system height × 1.25 apart; jsdom measures nothing).
    run(15000);   // past the wait
    o.scroller.scrollTop = 1000 - 350 + 100;
    const from = o.scroller.scrollTop;
    const at = Math.floor((from + 350) / (o.layout.systemHeight * 1.25));
    run(1000);
    const expected = scrollSpeed(beats[at], o.doc.tempo, 125, o.layout.systemHeight);
    expect(Math.abs(o.scroller.scrollTop - from - expected)).toBeLessThanOrEqual(1.5);
    expect(beats[beats.length - 1]).toBeLessThan(beats[at]);   // the sample ends on a short line
  });

  it('stops at the end of the sheet', () => {
    const o = open();
    startAuto(o);
    o.scroller.scrollTop = 49000;
    run(100);
    expect(screen.getByRole('button', { name: 'Auto-scroll' })).toHaveAttribute('aria-pressed', 'false');
    expect(frames.size).toBe(0);
  });

  it('waits again after a page turn: the player reads from the top of the new page', () => {
    const o = open();
    startAuto(o);
    run(60000);
    expect(readout()).toMatch(/1 line/);
    fireEvent.keyDown(o.region, { key: 'ArrowRight' });
    const from = o.scroller.scrollTop;
    run(1000);
    expect(readout()).toMatch(/starts in/);
    expect(o.scroller.scrollTop).toBe(from);
  });

  it('switches auto-scroll off at once when the sheet fits the screen', () => {
    const { region, scroller } = open();
    size(scroller, 900, 1000);
    fireEvent.keyDown(region, { key: 'A' });
    frame(0);
    expect(screen.getByRole('button', { name: 'Auto-scroll' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('pauses auto-scroll with the button', async () => {
    const user = userEvent.setup();
    const { scroller } = open();
    size(scroller, 5000, 1000);
    await user.click(screen.getByRole('button', { name: 'Auto-scroll' }));
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(frames.size).toBe(0);
    expect(screen.getByRole('button', { name: 'Auto-scroll' })).toBeInTheDocument();
  });

  it('shows the time of a full line and follows the tempo slider', () => {
    const o = open();
    const full = fullLineBeats(systemBeats(o.doc, o.layout.systems));
    const half = o.doc.tempo / 2;
    expect(readout()).toBe(speedLabel(full, o.doc.tempo, o.doc.tempo));
    const slider = screen.getByRole('slider', { name: 'Tempo' });
    expect(slider).toHaveAttribute('min', String(tempoRange(o.doc.tempo).min));
    expect(slider).toHaveAttribute('max', String(tempoRange(o.doc.tempo).max));
    // A running scroll takes the new speed without a restart.
    startAuto(o);
    run(60000);
    let from = o.scroller.scrollTop;
    run(2000);
    const before = o.scroller.scrollTop - from;
    fireEvent.change(slider, { target: { value: String(half) } });
    expect(readout()).toBe(speedLabel(full, half, o.doc.tempo));
    expect(readPlayTempo(null)).toBe(half);
    from = o.scroller.scrollTop;
    run(2000);
    expect(Math.abs((o.scroller.scrollTop - from) * 2 - before)).toBeLessThanOrEqual(4);
  });

  it('leaves the arrow keys to the tempo slider, and Space to a focused button', () => {
    const { scroller, scrollTo } = open();
    size(scroller, 2760, 1000);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Tempo' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'A+ Larger' }), { key: ' ' });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('turns with Page Down and Space from the slider: a pedal works wherever the focus is', () => {
    const { scroller, scrollTo } = open();
    size(scroller, 2760, 1000);
    const slider = screen.getByRole('slider', { name: 'Tempo' });
    fireEvent.keyDown(slider, { key: 'PageDown' });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 880, behavior: 'smooth' });
    fireEvent.keyDown(slider, { key: 'a' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('turns one page for a held key', () => {
    const { region, scroller, scrollTo } = open();
    size(scroller, 5000, 1000);
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    fireEvent.keyDown(region, { key: 'ArrowRight', repeat: true });
    fireEvent.keyDown(region, { key: 'ArrowRight', repeat: true });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(region, { key: 'a', repeat: true });
    expect(screen.getByRole('button', { name: 'Auto-scroll' })).toBeInTheDocument();
  });

  it('turns at once while auto-scroll runs, and auto-scroll goes on from the new place', () => {
    const { region, scroller, scrollTo } = open();
    size(scroller, 5000, 1000);
    fireEvent.keyDown(region, { key: 'a' });
    frame(0);
    // A smooth scroll would be cancelled by the next auto-scroll frame.
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 880, behavior: 'auto' });
    size(scroller, 5000, 1000, 880);
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1760, behavior: 'auto' });
  });

  it('does not jump after the tab was hidden: a long gap between frames counts as a short one', () => {
    const o = open();
    startAuto(o);
    run(60000);
    const from = o.scroller.scrollTop;
    frame(now += 30000);
    expect(o.scroller.scrollTop - from).toBeLessThan(10);
  });

  describe('metronome', () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }); });
    afterEach(() => { vi.useRealTimers(); });

    const button = () => screen.getByRole('button', { name: 'Metronome' });
    const clicks = (): FakeNode[] => audio?.of('oscillator') ?? [];
    /** Plays `seconds` of audio-clock time; the metronome's scheduler runs as it would. */
    function advance(seconds: number) {
      for (let t = 0; t < seconds - 1e-9; t += 0.005) {
        if (audio) audio.currentTime += 0.005;
        act(() => { vi.advanceTimersByTime(5); });
      }
    }

    it('turns on and off with the button and with M, once per press', async () => {
      const { region } = open();
      expect(button()).toHaveAttribute('aria-pressed', 'false');
      expect(button()).toHaveAttribute('aria-keyshortcuts', 'M');
      expect(button()).toHaveAttribute('title', 'Metronome (M)');
      fireEvent.click(button());
      expect(button()).toHaveAttribute('aria-pressed', 'true');
      advance(WARMUP_SECONDS + 0.05);
      expect(clicks().length).toBeGreaterThan(0);
      fireEvent.keyDown(region, { key: 'm' });
      expect(button()).toHaveAttribute('aria-pressed', 'false');
      fireEvent.keyDown(region, { key: 'M' });
      expect(button()).toHaveAttribute('aria-pressed', 'true');
      fireEvent.keyDown(region, { key: 'M', repeat: true });
      expect(button()).toHaveAttribute('aria-pressed', 'true');
    });

    it('turns on with M from the tempo slider and from a focused button', () => {
      open();
      fireEvent.keyDown(screen.getByRole('slider', { name: 'Tempo' }), { key: 'm' });
      expect(button()).toHaveAttribute('aria-pressed', 'true');
      fireEvent.keyDown(screen.getByRole('button', { name: 'A+ Larger' }), { key: 'm' });
      expect(button()).toHaveAttribute('aria-pressed', 'false');
    });

    it('clicks at the Play mode tempo and takes a change at the next beat', () => {
      const { region, doc } = open();
      fireEvent.keyDown(region, { key: 'm' });
      const beat = 60 / doc.tempo;
      advance(WARMUP_SECONDS + 0.03 + beat + 0.01);
      const starts = () => clicks().map(o => o.start.mock.calls[0][0] as number);
      expect(starts()[1] - starts()[0]).toBeCloseTo(beat, 3);
      const half = doc.tempo / 2;
      fireEvent.change(screen.getByRole('slider', { name: 'Tempo' }), { target: { value: String(half) } });
      advance(2 * beat + 0.2);
      expect(starts()[2] - starts()[1]).toBeCloseTo(2 * beat, 3);
    });

    it('falls silent when Play mode closes', () => {
      const { region, unmount } = open();
      fireEvent.keyDown(region, { key: 'm' });
      const made = clicks().length;
      unmount();
      for (const o of clicks()) expect(o.stop).toHaveBeenCalledWith();
      advance(2);
      expect(clicks()).toHaveLength(made);
    });

    it('closes its audio context when Play mode closes', () => {
      const { region, unmount } = open();
      fireEvent.keyDown(region, { key: 'm' });
      unmount();
      expect(audio!.close).toHaveBeenCalledTimes(1);
    });

    it('lists M in the Play mode keys card', () => {
      const { region } = open();
      fireEvent.keyDown(region, { key: '?' });
      const card = screen.getByRole('dialog', { name: 'Play mode keys' });
      expect(card).toHaveTextContent('Metronome on or off');
    });
  });

  it('exits with Esc from the slider too', () => {
    const { onExit } = open();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Tempo' }), { key: 'Escape' });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('makes the rest of the page inert while it is open', () => {
    const other = document.createElement('div');
    document.body.append(other);
    const { unmount, region } = open();
    expect(other).toHaveAttribute('inert');
    expect(region.closest('[inert]')).toBeNull();
    unmount();
    expect(other).not.toHaveAttribute('inert');
    other.remove();
  });

  it('opens in a browser without a wake lock, and in one that refuses it', async () => {
    open().unmount();
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => Promise.reject(new Error('no')) } });
    open();
    await act(async () => {});
    expect(screen.getByRole('region', { name: 'Play mode' })).toBeInTheDocument();
  });

  it('keeps the screen awake while open and lets go on exit', async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve({ release }));
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
    const { unmount, region, scroller } = open();
    await act(async () => {});
    expect(request).toHaveBeenCalledWith('screen');
    size(scroller, 5000, 1000);
    fireEvent.keyDown(region, { key: 'a' });
    expect(frames.size).toBe(1);
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });
});

describe('PlayMode paper', () => {
  function openIn(theme: 'light' | 'dark') {
    window.localStorage.setItem('fingerscore.theme', theme);
    initTheme();
    return open();
  }
  const paper = () => screen.getByTestId('paper');

  it('shows no paper choice in light mode', () => {
    openIn('light');
    expect(screen.queryByRole('button', { name: /^Paper:/ })).toBeNull();
  });

  it('draws on Night paper in dark mode and changes it from the toolbar', async () => {
    const user = userEvent.setup();
    openIn('dark');
    expect(paper()).toHaveAttribute('data-paper', 'night');
    await user.click(screen.getByRole('button', { name: 'Paper: Night' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Sepia' }));
    expect(paper()).toHaveAttribute('data-paper', 'sepia');
    expect(screen.getByRole('button', { name: 'Paper: Sepia' })).toBeInTheDocument();
    expect(window.localStorage.getItem('fingerscore.paper')).toBe('sepia');
  });

  it('keeps the keys of the open paper menu: arrows turn no page and Escape closes the menu, not play mode', async () => {
    const user = userEvent.setup();
    const { scroller, scrollTo, onExit } = openIn('dark');
    size(scroller, 3000, 800);
    await user.click(screen.getByRole('button', { name: 'Paper: Night' }));
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}');
    expect(scrollTo).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('hands the keyboard back to play mode after a choice by mouse', async () => {
    const user = userEvent.setup();
    const { region } = openIn('dark');
    await user.click(screen.getByRole('button', { name: 'Paper: Night' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Dimmed' }));
    expect(region).toHaveFocus();
  });
});

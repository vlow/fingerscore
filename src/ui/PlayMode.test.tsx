import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { speedLabel, beatsPerLine } from '../domain/playMode';
import { DEFAULT_PREFS } from '../domain/transpose';
import { layoutSheet } from '../render/layout';
import PlayMode from './PlayMode';

const KEY = 'fingerscore.playmode';

/** Animation frames run by hand: frame(ms) calls the callbacks queued so far with that timestamp. */
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
function frame(ts: number) {
  const due = [...frames.values()];
  frames = new Map();
  act(() => due.forEach(cb => cb(ts)));
}

beforeEach(() => {
  window.localStorage.clear();
  frames = new Map();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(nextFrame, cb); return nextFrame++; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'wakeLock');
});

function open(onExit = vi.fn()) {
  const doc = sampleDoc('asax');
  const derived = derive(doc, DEFAULT_PREFS);
  const layout = layoutSheet(doc, derived);
  const view = render(<PlayMode doc={doc} derived={derived} layout={layout} onExit={onExit} />);
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

  it('turns a page of 88 % with → and shows the page it is on', () => {
    const { region, scroller, scrollTo } = open();
    size(scroller, 2760, 1000);
    expect(screen.getByText('Page 1 / 3')).toBeInTheDocument();
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(scrollTo).toHaveBeenCalledWith({ top: 880, behavior: 'smooth' });
    size(scroller, 2760, 1000, 880);
    expect(screen.getByText('Page 2 / 3')).toBeInTheDocument();
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
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1880, behavior: 'smooth' });
    size(scroller, 5000, 1000, 1500);  // on its way to 1880
    fireEvent.wheel(scroller);
    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 2380, behavior: 'smooth' });
  });

  it('turns with the toolbar buttons and the tap zones', async () => {
    const user = userEvent.setup();
    const { region, scroller, scrollTo } = open();
    size(scroller, 2760, 1000, 880);
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1760, behavior: 'smooth' });
    size(scroller, 2760, 1000, 1760);
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 880, behavior: 'smooth' });
    size(scroller, 2760, 1000, 880);
    await user.click(region.querySelector('[data-turn="prev"]')!);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
    size(scroller, 2760, 1000, 0);
    await user.click(region.querySelector('[data-turn="next"]')!);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 880, behavior: 'smooth' });
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
    expect(stored()).toEqual({ zoom: 150, speed: 100 });
    fireEvent.keyDown(region, { key: '-' });
    fireEvent.keyDown(region, { key: '-' });
    expect(zoomOf()).toBe('1');
    await user.click(screen.getByRole('button', { name: 'Larger' }));
    expect(zoomOf()).toBe('1.25');
    await user.click(screen.getByRole('button', { name: 'Smaller' }));
    expect(stored()).toEqual({ zoom: 100, speed: 100 });
  });

  it('keeps the focus on A+ at the largest size, so the keys go on working', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(KEY, JSON.stringify({ zoom: 175, speed: 100 }));
    const { onExit } = open();
    const larger = screen.getByRole('button', { name: 'Larger' });
    await user.click(larger);
    expect(zoomOf()).toBe('2');
    expect(larger).toHaveAttribute('aria-disabled', 'true');
    expect(larger).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('opens with the stored size and speed', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ zoom: 175, speed: 60 }));
    open();
    expect(zoomOf()).toBe('1.75');
    expect(screen.getByRole('slider', { name: 'Auto-scroll speed' })).toHaveValue('60');
  });

  it.each(['{"zoom":999,"speed":"x"}', 'not json', '[]', 'null'])('falls back to the defaults for stored %s', raw => {
    window.localStorage.setItem(KEY, raw);
    open();
    expect(zoomOf()).toBe('1.25');
    expect(screen.getByRole('slider', { name: 'Auto-scroll speed' })).toHaveValue('100');
  });

  it('auto-scrolls at the speed of the music and stops at the end', () => {
    const { region, scroller, doc, layout } = open();
    size(scroller, 5000, 1000);
    fireEvent.keyDown(region, { key: 'a' });
    const toggle = screen.getByRole('button', { name: 'Pause' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    frame(0);
    frame(1000);
    // One zoomed system (290 px × 1.25) per line time.
    const beats = beatsPerLine(doc, layout.systems.length);
    const perSecond = (290 * 1.25) / ((beats * 60) / doc.tempo);
    expect(scroller.scrollTop).toBe(Math.floor(perSecond));
    scroller.scrollTop = 4000;
    frame(1016);
    expect(screen.getByRole('button', { name: 'Auto-scroll' })).toHaveAttribute('aria-pressed', 'false');
    expect(frames.size).toBe(0);
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

  it('shows the line time and follows the speed slider', () => {
    const { doc, layout, scroller, region } = open();
    const beats = beatsPerLine(doc, layout.systems.length);
    expect(screen.getByText(speedLabel(beats, doc.tempo, 100))).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: 'Auto-scroll speed' });
    fireEvent.change(slider, { target: { value: '200' } });
    expect(screen.getByText(speedLabel(beats, doc.tempo, 200))).toBeInTheDocument();
    expect(stored()).toEqual({ zoom: 125, speed: 200 });
    // A running scroll takes the new speed without a restart.
    size(scroller, 50000, 1000);
    fireEvent.keyDown(region, { key: 'a' });
    frame(0);
    frame(1000);
    expect(scroller.scrollTop).toBe(Math.floor((2 * 290 * 1.25) / ((beats * 60) / doc.tempo)));
  });

  it('leaves the arrow keys to the speed slider, and Space to a focused button', () => {
    const { scroller, scrollTo } = open();
    size(scroller, 2760, 1000);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Auto-scroll speed' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Larger' }), { key: ' ' });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('exits with Esc from the slider too', () => {
    const { onExit } = open();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Auto-scroll speed' }), { key: 'Escape' });
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

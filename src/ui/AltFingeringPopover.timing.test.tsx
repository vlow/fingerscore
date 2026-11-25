import { StrictMode, useEffect, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FingeringOption } from '../domain/fingerings';
import AltFingeringPopover from './AltFingeringPopover';

const OPTIONS: FingeringOption[] = [
  { h: [1, 1, 1, 0, 0, 0], x: [], n: 'standard', p: 0 },
  { h: [1, 1, 0, 0, 0, 0], x: [], n: 'second', p: 1 },
];

// These tests mount without `act`, so that effects run when React runs them: layout effects in the commit, passive
// effects later. A key pressed between the two must still reach the popover.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

const later = () => new Promise(resolve => setTimeout(resolve, 60));

let host: HTMLElement;
let root: Root;
let pill: HTMLButtonElement;
beforeEach(() => {
  host = document.body.appendChild(document.createElement('div'));
  pill = host.appendChild(document.createElement('button'));
  pill.focus();
  root = createRoot(host.appendChild(document.createElement('div')));
});
// Each test starts with React's scheduler queue empty, so that nothing left from the one before runs inside its window.
afterEach(async () => { root.unmount(); host.remove(); await later(); });

/**
 * A passive effect somewhere in the tree, as in the app: with none, React's development mode runs the second pass of the
 * effects inside the commit; with one, it runs it at the late passive flush, which is where the focus was taken back.
 */
function Passive() { useEffect(() => {}); return null; }

const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

/**
 * Renders the popover and calls `inWindow` in the commit that puts it in the page, after the popover's own layout effects
 * and before any passive effect: a sibling's layout effect runs there, deterministically (a DOM observer or a timer would
 * leave it to the scheduler, which may run the passive effects right after the commit). That is the moment a key pressed
 * on a slow machine can arrive in.
 */
async function popover(onClose: (focusAnchor: boolean) => void, inWindow: () => void, strict = false, chosen: number | null = null) {
  const el = <AltFingeringPopover note={{ name: 'C5', options: OPTIONS, chosen, auto: 0 }} kind="sax" chartStyle="compact" left={0} top={0}
    anchor={pill} onPick={() => {}} onClose={onClose} />;
  let called = false;
  const Window = () => { useLayoutEffect(() => { if (!called) { called = true; inWindow(); } }, []); return null; };
  const tree = <>{el}<Window /><Passive /></>;
  root.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  await later();
}

describe('the popover handles Escape from the moment it is in the page', () => {
  it('Escape right after the commit, before any passive effect has run, closes it with the focus returning to the pill', async () => {
    const onClose = vi.fn();
    await popover(onClose, escape);
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('an outside click right after the commit closes it too', async () => {
    const onClose = vi.fn();
    const outside = host.appendChild(document.createElement('p'));
    await popover(onClose, () => outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('the effects that React runs a second time in development do not take the focus back from the pill after Escape', async () => {
    const onClose = vi.fn(() => pill.focus());          // what the sheet does: focus the pill, then drop the popover
    await popover(onClose, escape, true, 1);      // an option is chosen: the focus effect has a button to focus
    expect(document.activeElement).toBe(pill);
    await later();                                      // the late passive flush, with its second run of the effects
    expect(document.activeElement).toBe(pill);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

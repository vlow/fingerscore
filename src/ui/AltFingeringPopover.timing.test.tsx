import { StrictMode } from 'react';
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

let host: HTMLElement;
let root: Root;
let pill: HTMLButtonElement;
beforeEach(() => {
  host = document.body.appendChild(document.createElement('div'));
  pill = host.appendChild(document.createElement('button'));
  pill.focus();
  root = createRoot(host.appendChild(document.createElement('div')));
});
afterEach(() => { root.unmount(); host.remove(); });

const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const later = () => new Promise(resolve => setTimeout(resolve, 60));

/**
 * Renders the popover and calls `inWindow` in the first moment the dialog is in the page: the observer runs right after the
 * DOM change, before React's passive effects (a scheduled task) can run, as a key pressed on a slow machine arrives.
 */
async function popover(onClose: (focusAnchor: boolean) => void, inWindow: () => void, strict = false) {
  const el = <AltFingeringPopover note={{ name: 'C5', options: OPTIONS, chosen: null, auto: 0 }} kind="sax" chartStyle="compact" left={0} top={0}
    anchor={pill} onPick={() => {}} onClose={onClose} />;
  const shown = new Promise<void>(resolve => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[role=dialog]')) return;
      observer.disconnect();
      inWindow();
      resolve();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  root.render(strict ? <StrictMode>{el}</StrictMode> : el);
  await shown;
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
    await popover(onClose, escape, true);
    expect(document.activeElement).toBe(pill);
    await later();                                      // the late passive flush, with its second run of the effects
    expect(document.activeElement).toBe(pill);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

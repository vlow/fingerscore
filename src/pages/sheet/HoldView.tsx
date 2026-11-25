import { Component, type RefObject } from 'react';

interface Props {
  /** The element that holds the systems. */
  paper: RefObject<HTMLElement | null>;
  /** The layout's system height: a change of it is a change of every system's height. */
  systemHeight: number;
  selectedId: string | null;
}

interface Anchor { id: string | null; system: number; columnTop: number; systemTop: number }

const SYSTEMS = 'svg[data-testid="system"]';
const onScreen = (r: DOMRect) => r.bottom > 0 && r.top < window.innerHeight;

/**
 * Keeps what the reader looks at in place when the systems change height, whatever the cause: Lyrics or Chords mode, a
 * Show switch, undo, an edit that adds or removes the first or last chord, lyric, ending or mark, a high note.
 * It renders nothing. React calls `getSnapshotBeforeUpdate` before it touches the DOM of the commit in which the height
 * changed, so the anchor (the selected note's column if it is on screen, else the first system on screen) is measured
 * in the old layout; `componentDidUpdate` finds it again by its id or index, because the drawing may have been
 * remounted, and scrolls by what it moved. A commit without a height change measures nothing and keeps nothing.
 */
export default class HoldView extends Component<Props> {
  getSnapshotBeforeUpdate(prev: Props): Anchor | null {
    const { paper, systemHeight } = this.props;
    const root = paper.current;
    if (!root || prev.systemHeight === systemHeight) return null;
    const systems = Array.from(root.querySelectorAll(SYSTEMS));
    const column = prev.selectedId === null ? null : root.querySelector(`[data-hit="${prev.selectedId}"]`);
    const columnRect = column?.getBoundingClientRect();
    const system = Math.max(0, systems.findIndex(s => s.getBoundingClientRect().bottom > 0));
    const systemTop = systems[system]?.getBoundingClientRect().top;
    if (systemTop === undefined) return null;
    return { id: columnRect && onScreen(columnRect) ? prev.selectedId : null, system, columnTop: columnRect?.top ?? 0, systemTop };
  }

  componentDidUpdate(_prev: Props, _state: unknown, anchor: Anchor | null): void {
    const root = this.props.paper.current;
    if (!anchor || !root) return;
    const column = anchor.id === null ? null : root.querySelector(`[data-hit="${anchor.id}"]`);
    const now = column ? column.getBoundingClientRect().top - anchor.columnTop
      : (root.querySelectorAll(SYSTEMS)[anchor.system]?.getBoundingClientRect().top ?? anchor.systemTop) - anchor.systemTop;
    if (now !== 0) window.scrollBy(0, now);
  }

  render(): null { return null; }
}

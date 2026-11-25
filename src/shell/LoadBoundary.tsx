import { Component, type ReactNode } from 'react';
import { LOAD_FAILED } from './loadFailed';
import s from './LoadBoundary.module.css';

export { LOAD_FAILED };

/**
 * Catches a render error of its subtree, chiefly a lazy chunk whose import failed (a stale hash after a redeploy,
 * a dropped connection), and shows a reload notice in its place instead of unmounting the whole app.
 * compact: a small box for a part of a page (an editing panel, a card), not a page.
 */
export class LoadBoundary extends Component<{ children: ReactNode; compact?: boolean }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className={`${s.box} ${this.props.compact ? s.compact : ''}`}>
        <span>{LOAD_FAILED}</span>
        <button type="button" className={s.reload} onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}

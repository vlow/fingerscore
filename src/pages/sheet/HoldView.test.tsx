import { render } from '@testing-library/react';
import { useRef } from 'react';
import HoldView from './HoldView';

const SYSTEMS = 6;
/** The page's scroll offset the test pretends: system n's top is n * height - scroll. */
const view = { scroll: 0 };

function Page(p: { height: number; selected?: string | null; remount?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <HoldView paper={ref} systemHeight={p.height} selectedId={p.selected ?? null} />
      {/* `key` remounts every system when `remount` changes, as a changed element type at the shift's slot does */}
      <div key={String(p.remount ?? false)}>
        {Array.from({ length: SYSTEMS }, (_, n) => (
          <div key={n}>
            <svg data-testid="system" data-n={n} data-h={p.height} />
            <rect data-hit={`n${n}`} data-n={n} data-h={p.height} data-inside="60" />
          </div>
        ))}
      </div>
    </div>
  );
}

let scrollBy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  view.scroll = 0;
  scrollBy = vi.fn((_x: number, y: number) => { view.scroll += y; });
  window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const n = Number(this.getAttribute('data-n') ?? 0);
    const h = Number(this.getAttribute('data-h') ?? 0);
    const top = n * h - view.scroll + Number(this.getAttribute('data-inside') ?? 0);
    return { top, bottom: top + h, left: 0, right: 0, width: 0, height: h, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  };
});

describe('HoldView', () => {
  it('holds the first system on screen: the systems above it grew, the page scrolls by what they added', () => {
    view.scroll = 3 * 230 + 50;            // system 3 is the first one on screen
    const v = render(<Page height={230} />);
    v.rerender(<Page height={254} />);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith(0, 3 * 24);
  });

  it('holds the selected note\'s column when it is on screen', () => {
    view.scroll = 2 * 230 + 20;
    const v = render(<Page height={230} selected="n2" />);
    v.rerender(<Page height={254} selected="n2" />);
    expect(scrollBy).toHaveBeenCalledWith(0, 2 * 24);
  });

  it('finds the anchor again when the drawing was remounted in the same commit', () => {
    view.scroll = 2 * 230 + 20;
    const v = render(<Page height={230} selected="n2" />);
    v.rerender(<Page height={254} selected="n2" remount />);
    expect(scrollBy).toHaveBeenCalledWith(0, 2 * 24);
    expect(view.scroll).toBe(2 * 230 + 20 + 48);
  });

  it('a selected note off screen is not the anchor: the first system on screen is', () => {
    view.scroll = 1 * 230 + 10;
    const v = render(<Page height={230} selected="n5" />);
    v.rerender(<Page height={254} selected="n5" />);
    expect(scrollBy).toHaveBeenCalledWith(0, 24);
  });

  it('does nothing when the height stays, and keeps nothing for a later change', () => {
    view.scroll = 3 * 230 + 50;
    const v = render(<Page height={230} selected="n3" />);
    v.rerender(<Page height={230} selected="n3" />);
    view.scroll += 200;                     // the player scrolls on
    v.rerender(<Page height={230} selected="n3" />);
    expect(scrollBy).not.toHaveBeenCalled();
    const before = view.scroll;
    v.rerender(<Page height={254} selected="n3" />);       // a later change holds what is on screen then
    expect(view.scroll).toBeGreaterThan(before);
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });
});

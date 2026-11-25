import { render } from '@testing-library/react';
import { useRef } from 'react';
import { useHoldView } from './useHoldView';

/** Systems whose tops the test sets: jsdom measures nothing. */
const tops = { value: [100, 400] };
let hold: () => void = () => {};

function Page(p: { height: number; selected?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  hold = useHoldView(ref, p.height, p.selected ?? null);
  return (
    <div ref={ref}>
      <svg data-testid="system" /><svg data-testid="system" />
      <rect data-hit="a" />
    </div>
  );
}

let scrollBy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  scrollBy = vi.fn();
  window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
  tops.value = [100, 400];
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const systems = Array.from(document.querySelectorAll('svg[data-testid="system"]'));
    const top = this instanceof SVGSVGElement ? tops.value[systems.indexOf(this)] : this.getAttribute('data-hit') === 'a' ? tops.value[1] + 60 : 0;
    return { top, bottom: top + 200, left: 0, right: 0, width: 0, height: 200, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  };
});

describe('useHoldView', () => {
  it('a first system that stays in place needs no scroll', () => {
    const view = render(<Page height={230} />);
    hold();
    tops.value = [100, 424];        // the second system moved down by the band's 24 px; the first stayed
    view.rerender(<Page height={254} />);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('holds the first system on screen: the reader has scrolled past the first one', () => {
    tops.value = [-400, -100];      // the first system's bottom (-200) is above the viewport
    const view = render(<Page height={230} />);
    hold();
    tops.value = [-400, -76];       // the system under the reader's eyes moved down by 24 px
    view.rerender(<Page height={254} />);
    expect(scrollBy).toHaveBeenCalledWith(0, 24);
  });

  it('scrolls by what the selected column moved', () => {
    const view = render(<Page height={230} selected="a" />);
    hold();
    tops.value = [100, 424];
    view.rerender(<Page height={254} selected="a" />);
    expect(scrollBy).toHaveBeenCalledWith(0, 24);
  });

  it('does nothing when no change was announced, or when the height stays', () => {
    const view = render(<Page height={230} selected="a" />);
    tops.value = [100, 424];
    view.rerender(<Page height={254} selected="a" />);
    expect(scrollBy).not.toHaveBeenCalled();
    hold();
    view.rerender(<Page height={254} selected="a" />);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('a held view is used once', () => {
    const view = render(<Page height={230} selected="a" />);
    hold();
    tops.value = [100, 424];
    view.rerender(<Page height={254} selected="a" />);
    tops.value = [100, 448];
    view.rerender(<Page height={278} selected="a" />);
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });
});

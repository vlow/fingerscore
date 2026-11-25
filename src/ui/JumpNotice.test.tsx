import { render, screen } from '@testing-library/react';
import JumpNotice from './JumpNotice';

const IGNORED = 'Playback ignores the jump.';

describe('JumpNotice', () => {
  it('keeps an empty status region without a problem or a dropped sentence', () => {
    render(<JumpNotice problems={[]} dropped={[]} />);
    expect(screen.getByRole('status', { name: 'Jump marks' })).toBeEmptyDOMElement();
  });

  it('the region it keeps receives the text later, as the same element', () => {
    const { rerender } = render(<JumpNotice problems={[]} dropped={[]} />);
    const region = screen.getByRole('status');
    rerender(<JumpNotice problems={[{ bar: 1, text: `A. ${IGNORED}` }]} dropped={[]} />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('A.');
  });

  it('lists the same dropped sentence twice without a key warning', () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<JumpNotice problems={[]} dropped={['Left out.', 'Left out.']} />);
    expect(screen.getAllByText('Left out.')).toHaveLength(2);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('is a status region that lists each problem', () => {
    render(<JumpNotice problems={[
      { bar: 3, text: `D.S. in bar 4 needs a Segno. ${IGNORED}` },
      { bar: 5, text: `There is more than one Fine, in bars 2 and 6. ${IGNORED}` },
    ]} dropped={[]} />);
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('D.S. in bar 4 needs a Segno.');
    expect(region).toHaveTextContent('There is more than one Fine, in bars 2 and 6.');
  });

  it('says that playback ignores the jump once, at the end', () => {
    render(<JumpNotice problems={[{ bar: 1, text: `A. ${IGNORED}` }, { bar: 2, text: `B. ${IGNORED}` }]} dropped={[]} />);
    const text = screen.getByRole('status').textContent!;
    expect(text.split(IGNORED)).toHaveLength(2);
    expect(text.endsWith(IGNORED)).toBe(true);
  });

  it('lists dropped sentences as plain lines, without the closing sentence when there is no problem', () => {
    render(<JumpNotice problems={[]} dropped={['The repeat sign in bar 3 was left out.']} />);
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('The repeat sign in bar 3 was left out.');
    expect(region).not.toHaveTextContent(IGNORED);
  });
});

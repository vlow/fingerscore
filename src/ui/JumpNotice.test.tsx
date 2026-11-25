import { render, screen } from '@testing-library/react';
import JumpNotice from './JumpNotice';

const IGNORED = 'Playback ignores the jump.';

describe('JumpNotice', () => {
  it('shows nothing without a problem or a dropped sentence', () => {
    const { container } = render(<JumpNotice problems={[]} dropped={[]} />);
    expect(container).toBeEmptyDOMElement();
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

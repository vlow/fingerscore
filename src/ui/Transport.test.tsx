import { fireEvent, render, screen } from '@testing-library/react';
import Transport from './Transport';

describe('Transport', () => {
  it('says what play mode does and recommends dark mode on stage', () => {
    render(<Transport playing={false} tempo={100} onToggle={() => {}} onTempo={() => {}} onPlayMode={() => {}} />);
    expect(screen.getByRole('button', { name: 'Play mode' })).toHaveAttribute('title',
      'Show only the score, with page turning and auto-scroll. Dark mode is easier on the eyes on stage.');
  });
});

it('focusing Play mode calls playModeIntent.onFocus', () => {
  const playModeIntent = { onFocus: vi.fn(), onPointerEnter: vi.fn() };
  render(<Transport playing={false} tempo={100} onToggle={() => {}} onTempo={() => {}} onPlayMode={() => {}} playModeIntent={playModeIntent} />);
  fireEvent.focus(screen.getByRole('button', { name: /Play mode/ }));
  expect(playModeIntent.onFocus).toHaveBeenCalledTimes(1);
});

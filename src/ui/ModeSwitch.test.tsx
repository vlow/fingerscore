import { fireEvent, render, screen } from '@testing-library/react';
import { ModeSwitch } from './ModeSwitch';

it('pointer enter on Lyrics calls onIntent(\'lyrics\')', () => {
  const onIntent = vi.fn();
  render(<ModeSwitch mode="view" onMode={() => {}} onIntent={onIntent} />);
  fireEvent.pointerEnter(screen.getByRole('radio', { name: 'Lyrics' }));
  expect(onIntent).toHaveBeenCalledWith('lyrics');
});

it('focus on Edit notes calls onIntent(\'notes\')', () => {
  const onIntent = vi.fn();
  render(<ModeSwitch mode="view" onMode={() => {}} onIntent={onIntent} />);
  fireEvent.focus(screen.getByRole('radio', { name: 'Edit notes' }));
  expect(onIntent).toHaveBeenCalledWith('notes');
});

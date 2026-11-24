import { render, screen } from '@testing-library/react';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import NotePanel from './NotePanel';

function panel() {
  const doc = sampleDoc('asax');
  const derived = derive(doc, DEFAULT_PREFS);
  render(<NotePanel doc={doc} derived={derived} id={doc.score[0].ev[0].id} onEdit={() => {}} />);
}

describe('NotePanel', () => {
  // WCAG 2.5.3: a button's name starts with its visible text, then says what it does.
  it.each([['−8 Octave down', '−8'], ['−1 Semitone down', '−1'], ['+1 Semitone up', '+1'], ['+8 Octave up', '+8']])(
    '%s: the visible text %s is real text and the name starts with it',
    (name, text) => {
      panel();
      const button = screen.getByRole('button', { name });
      expect(button).toHaveTextContent(text);
      expect(button.querySelector('[aria-hidden="true"]')).toBeNull();
      expect(name.startsWith(button.textContent!)).toBe(true);
    },
  );

  it('keeps the 3 of the triplet button as text in the drawing and in the name', () => {
    panel();
    const button = screen.getByRole('button', { name: '3 Triplet' });
    expect(button.querySelector('svg text')).toHaveTextContent('3');
  });
});

import { render, screen } from '@testing-library/react';
import { chooseFingerings, type ChooserItem } from '../domain/chooser';
import { optionsFor } from '../domain/fingerings';
import { buildScale, type ScaleResult } from '../domain/scales';
import type { InstId } from '../domain/types';
import { ScaleStaff } from './ScaleStaff';

const draw = (o: Partial<Parameters<typeof ScaleStaff>[0]> & { scale: ScaleResult; inst: InstId }) =>
  render(<ScaleStaff chartStyle="compact" recorderSystem="baroque" showNames showAlternates={false} {...o} />);

it('one line for an octave: notes, names, charts, end barline', () => {
  const scale = buildScale({ inst: 'fl', scale: 'maj', tonicPc: 0, range: 'one', direction: 'up' });
  const { container } = draw({ inst: 'fl', scale });
  expect(container.querySelectorAll('[data-testid="scale-line"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-note]')).toHaveLength(8);
  expect([...container.querySelectorAll('[data-name]')].map(e => e.textContent)).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
  expect(container.querySelectorAll('[data-chart]').length + container.querySelectorAll('[data-missing]').length).toBe(8);
  expect(container.querySelectorAll('[data-end]')).toHaveLength(1);
  expect(screen.getByText('C4, D4, E4, F4, G4, A4, B4, C5')).toBeInTheDocument();
  expect(container.querySelector('[data-testid="scale-line"]')).toHaveAttribute('aria-hidden', 'true');
});

it('breaks lines at 15 notes', () => {
  const scale = buildScale({ inst: 'fl', scale: 'chrom', tonicPc: 0, range: 'one', direction: 'updown' });   // 25 notes
  const { container } = draw({ inst: 'fl', scale });
  const lines = container.querySelectorAll('[data-testid="scale-line"]');
  expect(lines).toHaveLength(2);
  expect(lines[0].querySelectorAll('[data-note]')).toHaveLength(15);
  expect(lines[1].querySelectorAll('[data-note]')).toHaveLength(10);
  expect(lines[1].querySelectorAll('[data-clef]')).toHaveLength(1);
  expect(lines[0].querySelectorAll('[data-end]')).toHaveLength(0);
  expect(lines[1].querySelectorAll('[data-end]')).toHaveLength(1);
});

it('accidentals and double sharp glyph (review focus 1)', () => {
  const scale = buildScale({ inst: 'fl', scale: 'hmin', tonicPc: 8, range: 'one', direction: 'up' });
  const { container } = draw({ inst: 'fl', scale });
  expect(container.querySelectorAll('[data-acc="doubleSharp"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-keysig] [data-acc]').length).toBe(5);
  expect([...container.querySelectorAll('[data-name]')].map(e => e.textContent)[6]).toBe('F𝄪5');
});

it('extended notes are amber', () => {
  const scale = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 7, range: 'two', direction: 'up' });
  const { container } = draw({ inst: 'asax', scale });
  const ext = container.querySelectorAll('[data-state="ext"]');
  expect(ext.length).toBe(scale.notes.filter(n => n.state === 'ext').length);
  expect(ext.length).toBeGreaterThan(0);
  for (const g of ext) expect(g.querySelector('[data-head]')).toHaveAttribute('stroke', '#B45309');
  expect(container.querySelector('[data-state="ok"] [data-head]')).toHaveAttribute('stroke', '#15171C');
});

it('a note without a sourced fingering shows a box (review focus 4)', () => {
  // No scale the builder makes reaches the open sax gaps (written 94/95), so append such a note by hand.
  const scale = buildScale({ inst: 'tsax', scale: 'maj', tonicPc: 0, range: 'one', direction: 'up' });
  const last = scale.notes[scale.notes.length - 1];
  const gap = { ...last, written: 95, state: 'ext' as const, spelled: { letter: 6, alter: 0 as const, octave: 6, name: 'B6' }, accidental: null };
  expect(optionsFor('tsax', 95, 'baroque')).toEqual([]);   // still a documented gap; if this fails, pick another gap from fingering-gaps.json
  const { container } = draw({ inst: 'tsax', scale: { ...scale, notes: [...scale.notes, gap, { ...last }] } });
  expect(container.querySelectorAll('[data-missing]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-chart]')).toHaveLength(9);
});

it('names can be hidden; alternates can be shown', () => {
  const scale = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 5, range: 'one', direction: 'up' });   // F major: B♭4 has bis / 1+1 / side
  const a = draw({ inst: 'asax', scale, showNames: false });
  expect(a.container.querySelectorAll('[data-name]')).toHaveLength(0);
  expect(a.container.querySelectorAll('[data-alt]')).toHaveLength(0);
  a.unmount();
  const b = draw({ inst: 'asax', scale, showAlternates: true });
  expect(b.container.querySelectorAll('[data-alt]').length).toBeGreaterThanOrEqual(2);
  expect(b.container.textContent).toContain('side B♭');
});

it('alternates: every further option of a note is stacked below the chosen one, in option order', () => {
  const scale = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 5, range: 'one', direction: 'up' });
  const { container } = draw({ inst: 'asax', scale, showAlternates: true });
  const notes = [...container.querySelectorAll('[data-note]')];
  scale.notes.forEach((n, i) => {
    const options = optionsFor('asax', n.written, 'baroque');
    const chosen = Number(notes[i].querySelector('[data-chart]')!.getAttribute('data-option'));
    const alts = [...notes[i].querySelectorAll('[data-alt]')].map(e => Number(e.getAttribute('data-option')));
    expect(alts).toEqual(options.map((_, j) => j).filter(j => j !== chosen));
  });
  const bb = notes[3];
  const texts = [...bb.querySelectorAll('[data-option-name]')].map(e => e.textContent);
  expect(texts).toHaveLength(4);
});

it('the automatic choice matches the sheet\'s chooser', () => {
  const scale = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 5, range: 'two', direction: 'updown' });
  const items: ChooserItem[] = scale.notes.map((n, i) => ({ id: `n${i}`, written: n.written, options: optionsFor('asax', n.written, 'baroque') }));
  const want = chooseFingerings(items, {});
  const { container } = draw({ inst: 'asax', scale });
  const got = [...container.querySelectorAll('[data-note]')].map(g => Number(g.querySelector('[data-chart]')!.getAttribute('data-option')));
  expect(got).toEqual(scale.notes.map((_, i) => want[`n${i}`]));
  expect(new Set(got).size).toBeGreaterThan(0);
});

it('the chooser runs over the whole sequence, not per line', () => {
  const scale = buildScale({ inst: 'asax', scale: 'chrom', tonicPc: 10, range: 'two', direction: 'up' });   // 25 notes over 2 lines
  const items: ChooserItem[] = scale.notes.map((n, i) => ({ id: `n${i}`, written: n.written, options: optionsFor('asax', n.written, 'baroque') }));
  const want = chooseFingerings(items, {});
  const { container } = draw({ inst: 'asax', scale });
  expect(container.querySelectorAll('[data-testid="scale-line"]')).toHaveLength(2);
  const got = [...container.querySelectorAll('[data-note]')].map(g => {
    const chart = g.querySelector('[data-chart]');
    return chart ? Number(chart.getAttribute('data-option')) : undefined;
  });
  expect(got).toEqual(scale.notes.map((_, i) => want[`n${i}`]));
});

it('recorder system and chart style reach the charts', () => {
  const rs = buildScale({ inst: 'rs', scale: 'maj', tonicPc: 5, range: 'one', direction: 'up' });   // F major: F differs between systems
  const holes = (system: 'baroque' | 'german') => {
    const { container, unmount } = draw({ inst: 'rs', scale: rs, recorderSystem: system });
    const first = container.querySelector('[data-note] [data-chart]')!;
    const states = [...first.querySelectorAll('[data-hole]')].map(e => e.getAttribute('data-hole')).join(',');
    unmount();
    return states;
  };
  expect(holes('baroque')).not.toBe(holes('german'));

  const as = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 5, range: 'one', direction: 'up' });
  const sats = (style: 'compact' | 'full') => {
    const { container, unmount } = draw({ inst: 'asax', scale: as, chartStyle: style });
    const n = container.querySelectorAll('[data-sat]').length;
    unmount();
    return n;
  };
  expect(sats('full')).toBeGreaterThan(sats('compact'));
});

it('line height grows with the tallest stack of alternates', () => {
  const scale = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 5, range: 'one', direction: 'up' });
  const h = (showAlternates: boolean) => {
    const { container, unmount } = draw({ inst: 'asax', scale, showAlternates });
    const v = Number(container.querySelector('[data-testid="scale-line"]')!.getAttribute('height'));
    unmount();
    return v;
  };
  expect(h(true)).toBeGreaterThan(h(false) + 3 * 90);
});

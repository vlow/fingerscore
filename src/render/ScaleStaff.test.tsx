import { render, screen } from '@testing-library/react';
import { chooseFingerings, type ChooserItem } from '../domain/chooser';
import { optionsFor } from '../domain/fingerings';
import { buildScale, type ScaleResult } from '../domain/scales';
import type { InstId } from '../domain/types';
import { pathBox } from './pathBox';
import { ScaleStaff, scaleLines } from './ScaleStaff';

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

it('accidentals: a natural replaces the double sharp (review focus 1)', () => {
  const scale = buildScale({ inst: 'fl', scale: 'hmin', tonicPc: 8, range: 'one', direction: 'up' });
  const { container } = draw({ inst: 'fl', scale });
  expect(container.querySelectorAll('[data-acc="doubleSharp"]')).toHaveLength(0);
  expect(container.querySelectorAll('[data-acc="natural"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-keysig] [data-acc]').length).toBe(5);
  expect([...container.querySelectorAll('[data-name]')].map(e => e.textContent)[6]).toBe('G5');
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
  // The chooser run breaks at the gap: the notes before it are chosen as a run of their own, the note after as a new run.
  const options = (w: number) => optionsFor('tsax', w, 'baroque');
  const before = chooseFingerings(scale.notes.map((n, i) => ({ id: `n${i}`, written: n.written, options: options(n.written) })), {});
  const after = chooseFingerings([{ id: 'a', written: last.written, options: options(last.written) }], {});
  const got = [...container.querySelectorAll('[data-note]')].map(g => g.querySelector('[data-chart]')?.getAttribute('data-option'));
  expect(got.slice(0, 8)).toEqual(scale.notes.map((_, i) => String(before[`n${i}`])));
  expect(got[8]).toBeUndefined();
  expect(got[9]).toBe(String(after.a));
});

it('the text alternative marks notes in the extended range', () => {
  const scale = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 7, range: 'two', direction: 'up' });   // written G4–G6: F♯6 and G6 are above hi
  draw({ inst: 'asax', scale });
  const text = scale.notes.map(n => n.spelled.name + (n.state === 'ext' ? ' (extended)' : '')).join(', ');
  expect(text).toContain('(extended)');
  expect(screen.getByText(text)).toBeInTheDocument();
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

describe('chosen fingerings (overrides)', () => {
  const scale = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 5, range: 'two', direction: 'updown' });   // F major: B♭ has bis / 1+1 / side
  const items: ChooserItem[] = scale.notes.map((n, i) => ({ id: String(i), written: n.written, options: optionsFor('asax', n.written, 'baroque') }));
  const charts = (c: HTMLElement) => [...c.querySelectorAll('[data-note]')].map(g => Number(g.querySelector('[data-chart]')!.getAttribute('data-option')));
  const free = chooseFingerings(items, {});

  // A pick that moves a neighbour's automatic choice, found in the real data.
  const found = (() => {
    for (let i = 0; i < items.length; i++) for (let k = 0; k < items[i]!.options.length; k++) {
      if (k === free[String(i)]) continue;
      const pinned = chooseFingerings(items, { [String(i)]: k });
      const moved = items.findIndex((_, j) => j !== i && pinned[String(j)] !== free[String(j)]);
      if (moved >= 0) return { i, k, pinned };
    }
    return null;
  })();

  it('an override sets that note\'s chart and is a fixed point for its neighbours', () => {
    expect(found).not.toBeNull();
    const { i, k, pinned } = found!;
    const { container } = draw({ inst: 'asax', scale, overrides: { [i]: k } });
    expect(charts(container)).toEqual(scale.notes.map((_, j) => pinned[String(j)]));
    expect(charts(container)[i]).toBe(k);
    const marked = container.querySelectorAll('[data-chart][data-overridden="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0].closest('[data-note]')).toBe(container.querySelectorAll('[data-note]')[i]);
  });

  it('an invalid override is ignored', () => {
    const { container } = draw({ inst: 'asax', scale, overrides: { 0: 99, 1: -1, 2: 0.5 } });
    expect(charts(container)).toEqual(scale.notes.map((_, j) => free[String(j)]));
    expect(container.querySelectorAll('[data-overridden]')).toHaveLength(0);
  });

  it('with alternates shown, the stack under a note holds every option except the chosen one', () => {
    const { i, k } = found!;
    const { container } = draw({ inst: 'asax', scale, overrides: { [i]: k }, showAlternates: true });
    const note = container.querySelectorAll('[data-note]')[i];
    expect(note.querySelector('[data-chart]')).toHaveAttribute('data-option', String(k));
    const alts = [...note.querySelectorAll('[data-alt]')].map(e => Number(e.getAttribute('data-option')));
    expect(alts).toEqual(items[i]!.options.map((_, j) => j).filter(j => j !== k));
  });

  it('the chart slot is called for notes with two or more options only, with their choice', () => {
    const seen: { index: number; name: string; chosen: number; auto: number; overridden: boolean; n: number }[] = [];
    draw({
      inst: 'asax', scale, overrides: { [found!.i]: found!.k },
      renderUnderChart: (note) => { seen.push({ index: note.index, name: note.name, chosen: note.chosen, auto: note.auto, overridden: note.overridden, n: note.options.length }); return null; },
    });
    const multi = items.flatMap((it, j) => (it!.options.length >= 2 ? [j] : []));
    expect(seen.map(s => s.index)).toEqual(multi);
    const picked = seen.find(s => s.index === found!.i)!;
    expect(picked).toMatchObject({ chosen: found!.k, auto: free[String(found!.i)], overridden: true, name: scale.notes[found!.i].spelled.name });
    expect(seen.filter(s => s.overridden)).toHaveLength(1);
  });

  it('slot content is rendered beside the line', () => {
    const { container } = draw({ inst: 'asax', scale, renderUnderChart: note => <button type="button">pill {note.index}</button> });
    expect(screen.getAllByRole('button', { name: /^pill / }).length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="scale-line"] button')).toBeNull();
  });
});

describe('scaleLines', () => {
  const heights = (container: HTMLElement) => [...container.querySelectorAll('[data-testid="scale-line"]')].map(e => Number(e.getAttribute('height')));

  it.each([false, true])('gives the lines and heights the page draws (alternates %s)', showAlternates => {
    const scale = buildScale({ inst: 'asax', scale: 'chrom', tonicPc: 0, range: 'one', direction: 'updown' });
    const props = { inst: 'asax' as const, scale, chartStyle: 'compact' as const, recorderSystem: 'baroque' as const, showNames: true, showAlternates };
    const lines = scaleLines(props);
    const { container } = draw(props);
    expect(lines).toHaveLength(2);
    expect(lines.map(l => l.height)).toEqual(heights(container));
    expect(lines.reduce((sum, l) => sum + l.height, 0)).toBe(heights(container).reduce((sum, h) => sum + h, 0));
  });

  it('renders one line at a time, without the pill slot when none is given', () => {
    const scale = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 0, range: 'all', direction: 'updown' });
    const lines = scaleLines({ inst: 'asax', scale, chartStyle: 'compact', recorderSystem: 'baroque', showNames: true, showAlternates: true });
    expect(lines.length).toBeGreaterThan(1);
    const { container } = render(lines[1].render());
    expect(container.querySelectorAll('[data-testid="scale-line"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-clef]')).toHaveLength(1);
    expect(Number(container.querySelector('[data-testid="scale-line"]')!.getAttribute('height'))).toBe(lines[1].height);
  });

  it('a slot adds room under the first chart, so the line is taller', () => {
    const scale = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 0, range: 'one', direction: 'up' });
    const base = { inst: 'asax' as const, scale, chartStyle: 'compact' as const, recorderSystem: 'baroque' as const, showNames: true, showAlternates: true };
    expect(scaleLines({ ...base, renderUnderChart: () => null })[0].height).toBeGreaterThan(scaleLines(base)[0].height);
  });

  it('the reported height holds every drawn element of a tall stack', () => {
    // Alto sax, whole range, alternates shown: lines with long stacks of wrapped option names.
    const scale = buildScale({ inst: 'asax', scale: 'maj', tonicPc: 0, range: 'all', direction: 'updown' });
    const props = { inst: 'asax' as const, scale, chartStyle: 'compact' as const, recorderSystem: 'baroque' as const, showNames: true, showAlternates: true };
    const NUM = '-?\\d+(?:\\.\\d+)?(?:e-?\\d+)?';
    const attr = (e: Element, name: string) => Number(e.getAttribute(name) ?? 0);
    /** Vertical offset of the group translations around an element, inside the svg. */
    const offset = (e: Element) => {
      let y = 0;
      for (let g = e.parentElement; g && g.tagName !== 'svg'; g = g.parentElement) {
        const m = g.getAttribute('transform')?.match(new RegExp(`translate\\((${NUM})[ ,]+(${NUM})\\)`));
        if (m) y += Number(m[2]);
      }
      return y;
    };
    /** [top, bottom] of one drawn element from its emitted attributes (text: the baselines of the text and of each tspan). */
    const extent = (e: Element): [number, number][] => {
      const o = offset(e);
      switch (e.tagName) {
        case 'rect': return [[attr(e, 'y') + o, attr(e, 'y') + attr(e, 'height') + o]];
        case 'circle': return [[attr(e, 'cy') - attr(e, 'r') + o, attr(e, 'cy') + attr(e, 'r') + o]];
        case 'ellipse': { const r = Math.max(attr(e, 'rx'), attr(e, 'ry')); return [[attr(e, 'cy') - r + o, attr(e, 'cy') + r + o]]; }
        case 'path': {
          const b = pathBox(e.getAttribute('d')!);
          const t = e.getAttribute('transform')?.match(new RegExp(`translate\\((${NUM})[ ,]+(${NUM})\\) scale\\((${NUM})[ ,]+(${NUM})\\)`));
          if (!t) return [[b.y1 + o, b.y2 + o]];
          const [ty, s] = [Number(t[2]), Number(t[3])];
          return [[ty - b.y2 * s + o, ty - b.y1 * s + o]];
        }
        case 'text': {
          let y = attr(e, 'y');
          const out: [number, number][] = [[y + o, y + o]];
          for (const span of e.querySelectorAll('tspan')) {
            if (span.hasAttribute('y')) y = attr(span, 'y');
            y += attr(span, 'dy');
            out.push([y + o, y + o]);
          }
          return out;
        }
        default: return [];
      }
    };
    let tallest = 0;
    scaleLines(props).forEach((line, i) => {
      const { container, unmount } = render(line.render());
      const svg = container.querySelector('[data-testid="scale-line"]')!;
      const viewTop = Number(svg.getAttribute('viewBox')!.split(' ')[1]);
      const all = Array.from(svg.querySelectorAll('rect, circle, ellipse, path, text'), extent).flat();
      expect(all.length, `line ${i + 1} has drawn elements`).toBeGreaterThan(50);
      const top = Math.min(...all.map(x => x[0]));
      const bottom = Math.max(...all.map(x => x[1]));
      expect(top, `line ${i + 1}: highest element inside the box`).toBeGreaterThanOrEqual(viewTop);
      expect(bottom, `line ${i + 1}: lowest element inside the reported height`).toBeLessThanOrEqual(viewTop + line.height);
      // The box is not much taller than the drawing: the bottom pad is 16, a label's baseline sits 4 above its block's end.
      expect(viewTop + line.height - bottom, `line ${i + 1}: no large empty band`).toBeLessThanOrEqual(24);
      tallest = Math.max(tallest, svg.querySelectorAll('tspan').length);
      unmount();
    });
    expect(tallest, 'precondition (fingerings): a line with many wrapped label lines').toBeGreaterThanOrEqual(20);
  });
});

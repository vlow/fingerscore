import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FingeringChart, MissingChart } from './FingeringChart';
import { Glyph, TimeSigDigits, type GlyphName } from './Glyph';
import { SATS } from '../domain/fingerings';
import type { TimeSig } from '../domain/types';

const opt = (h: number[], x: string[] = []) => ({ h, x, n: '', p: 0 });

describe('FingeringChart', () => {
  it('xaphoon: closed, open and half holes', () => {
    const { container } = render(<svg><FingeringChart kind="xaph" style="compact" x={0} y={0} option={opt([1,1,1,1,1,1,1,0,0.5])} /></svg>);
    expect(container.querySelectorAll('[data-hole]')).toHaveLength(9);
    expect(container.querySelectorAll('[data-hole="closed"]')).toHaveLength(7);
    expect(container.querySelectorAll('[data-hole="open"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-hole="half"]')).toHaveLength(1);
  });

  it('compact: a plain sax note draws no satellites', () => {
    const { container } = render(<svg><FingeringChart kind="sax" style="compact" x={0} y={0} option={opt([0,1,1,1,0,0,0])} /></svg>);
    expect(container.querySelectorAll('[data-sat]')).toHaveLength(0);
  });

  it('compact: only the cluster of a pressed key, neighbours ghosted', () => {
    const { container } = render(<svg><FingeringChart kind="sax" style="compact" x={0} y={0} option={opt([0,1,0,0,0,0,0], ['sBb'])} /></svg>);
    expect(container.querySelectorAll('[data-sat]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-sat="pressed"]')).toHaveLength(1);
  });

  it('full key map: every satellite drawn', () => {
    const { container } = render(<svg><FingeringChart kind="sax" style="full" x={0} y={0} option={opt([0,1,0,0,0,0,0], ['bis'])} /></svg>);
    expect(Object.keys(SATS.sax)).toHaveLength(16);
    expect(container.querySelectorAll('[data-sat]')).toHaveLength(16);
    expect(container.querySelectorAll('[data-sat="pressed"]')).toHaveLength(1);
  });

  it('recorder double holes', () => {
    const { container } = render(<svg><FingeringChart kind="rec" style="compact" x={0} y={0} option={opt([1,1,1,1,1,1,0.5,0])} /></svg>);
    expect(container.querySelectorAll('[data-double]')).toHaveLength(2);
  });

  it('positions and scales the chart group', () => {
    const { container } = render(<svg><FingeringChart kind="xaph" style="compact" x={40} y={170} scale={0.5} option={opt([1,1,1,1,1,1,1,1,1])} /></svg>);
    expect(container.querySelector('g')).toHaveAttribute('transform', 'translate(40, 170) scale(0.5)');
  });

  it('missing chart labels', () => {
    const { container } = render(<svg><MissingChart type="bad" x={0} y={0} /><MissingChart type="ext" x={0} y={0} /><MissingChart type="alt" x={0} y={0} /></svg>);
    expect([...container.querySelectorAll('text')].map(t => t.textContent)).toEqual(['!', 'ext', 'alt']);
  });
});

describe('Glyph', () => {
  it('renders a path with the SMuFL placement transform', () => {
    const { container } = render(<svg><Glyph name="restQuarter" x={10} y={100} /></svg>);
    const path = container.querySelector('path')!;
    expect(path.getAttribute('d')).toMatch(/^M/);
    expect(path.getAttribute('transform')).toBe('translate(10, 80) scale(0.04, -0.04)');   // origin on the middle line
  });

  it('puts the clef origin on the G line, the whole rest on the 4th line, accidentals on the note', () => {
    const t = (name: GlyphName, y: number) =>
      render(<svg><Glyph name={name} x={0} y={y} /></svg>).container.querySelector('path')!.getAttribute('transform');
    expect(t('trebleClef', 115)).toBe('translate(0, 105) scale(0.04, -0.04)');
    expect(t('restWhole', 115)).toBe('translate(0, 85) scale(0.04, -0.04)');
    expect(t('restHalf', 115)).toBe('translate(0, 95) scale(0.04, -0.04)');
    expect(t('flat', 90)).toBe('translate(0, 90) scale(0.04, -0.04)');
  });

  it('has a sixteenth rest', () => {
    const { container } = render(<svg><Glyph name="restSixteenth" x={0} y={0} /></svg>);
    expect(container.querySelector('path')!.getAttribute('d')).toContain('Z');
  });

  it('time signature digits sit on the 4th and 2nd lines', () => {
    const { container } = render(<svg><TimeSigDigits ts={[6, 8]} x={5} y={115} /></svg>);
    const digits = [...container.querySelectorAll('[data-timesig="6/8"] path')];
    expect(digits.map(e => e.getAttribute('data-digit'))).toEqual(['digit6', 'digit8']);
    expect(digits.map(e => e.getAttribute('transform')!.match(/translate\([^,]+, ([^)]+)\)/)![1])).toEqual(['85', '105']);
  });

  it('two-digit numbers draw one path per digit', () => {
    const { container } = render(<svg><TimeSigDigits ts={[12, 8] as unknown as TimeSig} x={5} y={115} /></svg>);
    expect([...container.querySelectorAll('path')].map(e => e.getAttribute('data-digit'))).toEqual(['digit1', 'digit2', 'digit8']);
  });
});

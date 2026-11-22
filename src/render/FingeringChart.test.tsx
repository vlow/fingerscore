import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FingeringChart, MissingChart } from './FingeringChart';
import { Glyph, TimeSigDigits } from './Glyph';
import { SATS } from '../domain/fingerings';

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
  it('renders a path with the placement transform', () => {
    const { container } = render(<svg><Glyph name="restQuarter" x={10} y={100} /></svg>);
    const path = container.querySelector('path')!;
    expect(path.getAttribute('d')).toMatch(/^M/);
    expect(path.getAttribute('transform')).toBe('translate(10, 96.7) scale(0.0467,-0.0467)');
  });

  it('has a sixteenth rest', () => {
    const { container } = render(<svg><Glyph name="restSixteenth" x={0} y={0} /></svg>);
    expect(container.querySelector('path')!.getAttribute('d')).toContain('Z');
  });

  it('time signature digits sit on the middle and bottom lines', () => {
    const { container } = render(<svg><TimeSigDigits ts={[6, 8]} x={5} y={115} /></svg>);
    const t = [...container.querySelectorAll('text')];
    expect(t.map(e => [e.textContent, e.getAttribute('y')])).toEqual([['6', '95'], ['8', '115']]);
  });
});

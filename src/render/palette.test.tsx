import { render } from '@testing-library/react';
import { FingeringChart } from './FingeringChart';
import { LIGHT, PaletteProvider, SCREEN, type Palette } from './palette';

describe('palette', () => {
  it('LIGHT holds the light colours of the handoff, with the staff lines the PDF always had', () => {
    expect(LIGHT).toMatchObject({
      paper: '#FFFFFF', ink: '#15171C', staff: '#2A2D33', chord: '#0E6E68', lyric: '#2A2D33', text: '#2A2D33', muted: '#5B616E',
      warning: '#B45309', warningBg: '#FFF7ED', error: '#B91C1C', errorBg: '#FEF2F2', ghostKey: '#C3C7CE', badgeBg: '#F3F4F6',
      selection: '#E3F4F2',
    } satisfies Partial<Palette>);
  });

  it('SCREEN holds only references to tokens', () => {
    for (const [role, value] of Object.entries(SCREEN)) expect(value, role).toMatch(/var\(--c-[a-z0-9-]+\)/);
    for (const value of Object.values(SCREEN)) expect(value).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });

  it('has the same roles in both', () => {
    expect(Object.keys(SCREEN).sort()).toEqual(Object.keys(LIGHT).sort());
  });

  it('highlights derive from the chord colour of the paper', () => {
    expect(SCREEN.playing).toBe('color-mix(in srgb, var(--c-chord) 14%, transparent)');
    expect(SCREEN.selection).toBe('color-mix(in srgb, var(--c-chord) 20%, transparent)');
  });
});

describe('a chart under a palette', () => {
  const option = { h: [1, 1, 1, 1, 1, 1, 1, 0, 0.5], x: [], n: '', p: 0 };
  const fills = (root: HTMLElement) => new Set(Array.from(root.querySelectorAll('circle, rect, path'), e => e.getAttribute('fill')));
  const chart = <svg><FingeringChart kind="xaph" style="compact" option={option} x={0} y={0} /></svg>;

  it('draws with token references on screen', () => {
    const { container } = render(chart);
    expect(fills(container)).toEqual(new Set(['var(--c-ink)', 'var(--c-paper)']));
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it('draws with the light colours where the provider says so, as the PDF does', () => {
    const { container } = render(<PaletteProvider value={LIGHT}>{chart}</PaletteProvider>);
    expect(fills(container)).toEqual(new Set(['#15171C', '#FFFFFF']));
    expect(container.innerHTML).not.toContain('var(--');
  });
});

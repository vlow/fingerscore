import { render } from '@testing-library/react';
import { derive } from '../domain/derive';
import { DEFAULT_PREFS } from '../domain/transpose';
import type { Doc } from '../domain/types';
import { bare, withChords, withEndings, withLyrics, withMarks } from '../test/bandSheets';
import { BAR_NUMBER } from './layout';
import { Paper } from './Paper';
import { layoutSheet, type BandForce } from './sheetLayout';

function draw(doc: Doc, force?: BandForce, selectedId: string | null = null) {
  const d = derive(doc, DEFAULT_PREFS);
  const layout = layoutSheet(doc, d, force);
  const { container } = render(<Paper doc={doc} derived={d} layout={layout} playingId={null} selectedId={selectedId} forceShow={force} />);
  const svg = container.querySelector('svg[data-testid="system"]')!;
  const frame = Array.from(svg.children).find(c => c.localName === 'g' && c.getAttribute('transform')?.startsWith('translate(0 '));
  const shift = frame ? Number(/translate\(0 (-?[\d.]+)\)/.exec(frame.getAttribute('transform')!)![1]) : 0;
  return { container, svg, layout, shift, frame };
}
const num = (el: Element, name: string) => Number(el.getAttribute(name));

describe('the drawing follows the stack', () => {
  it('the system is as high as the layout says, its svg and its box', () => {
    for (const doc of [bare(), withLyrics(bare()), withMarks(withEndings(withChords(withLyrics(bare()))))]) {
      const { container, svg, layout } = draw(doc);
      expect(num(svg, 'height')).toBe(layout.systemHeight);
      expect(svg.getAttribute('viewBox')).toBe(`0 0 860 ${layout.systemHeight}`);
      expect((container.querySelector('svg[data-testid="system"]')!.parentElement as HTMLElement).style.height).toBe(`${layout.systemHeight}px`);
    }
  });

  it('the staff is drawn at the stack\'s staff top: the shifted drawing, no wrapper when the shift is 0', () => {
    const full = draw(withEndings(withChords(withLyrics(bare()))));
    expect(full.frame).toBeUndefined();
    expect(full.layout.stack.staffTop).toBe(75);
    for (const doc of [bare(), withLyrics(bare()), withMarks(bare())]) {
      const { svg, layout, shift } = draw(doc);
      expect(shift).toBe(layout.stack.shift);
      const top = Array.from(svg.querySelectorAll('rect')).find(r => r.getAttribute('fill') !== 'transparent' && num(r, 'height') === 1 && num(r, 'width') > 100)!;
      expect(num(top, 'y') + shift).toBe(layout.stack.staffTop);
    }
  });

  it('chord symbols, lyrics and ending brackets stand in their bands', () => {
    const doc = withMarks(withEndings(withChords(withLyrics(bare()))));
    const { container, layout, shift } = draw(doc);
    const { bands: b } = layout.stack;
    const chord = container.querySelector('[data-chord] text')!;
    expect(num(chord, 'y') + shift).toBe(b.marks + 2 + 13);
    expect(num(container.querySelector('[data-lyric]')!, 'y') + shift).toBe(b.marks + b.chords + 12);
    const volta = container.querySelector('[data-volta] path')!.getAttribute('d')!;
    expect(Number(/^M[\d.]+ ([\d.]+)/.exec(volta)![1]) + shift).toBe(b.marks + b.chords + b.lyrics + 14);
  });

  it('lyrics alone stand directly under the marks row, the endings absent', () => {
    const { container, layout, shift } = draw(withLyrics(withMarks(bare())));
    expect(num(container.querySelector('[data-lyric]')!, 'y') + shift).toBe(layout.stack.bands.marks + 12);
  });

  it('the jump marks stay in the row at the top of the system, whatever else the sheet uses', () => {
    for (const doc of [withMarks(bare()), withMarks(withEndings(withChords(withLyrics(bare()))))]) {
      const { container, svg } = draw(doc);
      const text = container.querySelector('text[data-jump="jump"]')!;
      expect(num(text, 'y')).toBe(19);
      expect(Array.from(svg.children).filter(c => c.hasAttribute('data-jump')).length).toBeGreaterThan(0);
    }
  });

  it('a band forced by the mode is drawn with its band: Lyrics mode on a bare sheet', () => {
    const { layout, container } = draw(bare(), { lyrics: true });
    expect(layout.stack.bands.lyrics).toBe(24);
    expect(container.querySelector('[data-forced-lyrics]')).toBeNull();      // the switch is on: nothing is shown only because of the mode
    expect(num(container.querySelector('svg[data-testid="system"]')!, 'height')).toBe(254);
    const off = bare(); off.show.lyrics = false; withLyrics(off);
    expect(draw(off, { lyrics: true }).container.querySelector('[data-forced-lyrics]')).not.toBeNull();
  });

  it('click columns and the selection marker start at the top of the chord band; the playing highlight too', () => {
    const doc = withMarks(withLyrics(bare()));
    const id = doc.score[0].ev[1].id;
    const d = derive(doc, DEFAULT_PREFS);
    const layout = layoutSheet(doc, d);
    const { container } = render(<Paper doc={doc} derived={d} layout={layout} playingId={id} selectedId={id} />);
    const frame = container.querySelector('svg[data-testid="system"] > g[transform]')!;
    const shift = layout.stack.shift;
    const { bands: b } = layout.stack;
    expect(num(container.querySelector('[data-hit]')!, 'y') + shift).toBe(b.marks + 2);
    expect(num(container.querySelector('[data-mark="selected"]')!, 'y') + shift).toBe(b.marks + 0.75);
    const playing = container.querySelector('[data-mark="playing"]')!;
    expect(num(playing, 'y') + shift).toBe(b.marks);
    expect(num(playing, 'y') + num(playing, 'height') + shift).toBe(150 + shift);
    expect(frame).not.toBeNull();
  });

  it('the bar number of the second system lies inside the system\'s box on a bare sheet, and nothing changes where a band is present', () => {
    for (const [doc, bareSheet] of [[bare(), true], [withLyrics(bare()), false]] as const) {
      const { container, layout, shift } = draw(doc);
      const text = container.querySelectorAll('svg[data-testid="system"]')[1].querySelector('[data-bar-number]')!;
      const top = num(text, 'y') - num(text, 'font-size') * BAR_NUMBER.rise + shift;
      expect(top).toBeGreaterThanOrEqual(0);
      if (bareSheet) expect(top).toBeLessThan(1);                         // as high as the system allows
      else expect(layout.stack.bands.headroom).toBe(15);
    }
  });
});

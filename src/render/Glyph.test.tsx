import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import glyphs from '../data/glyphs.json';
import { Glyph, TimeSigDigits, glyphInk, type GlyphName } from './Glyph';
import { placedBox, pathBox, type Box } from './pathBox';
import { HEADER, SHEET } from './layout';
import type { TimeSig } from '../domain/types';

// Staff: lines at B, B-10, ..., B-40 (y down).
const B = SHEET.staffBottom;
const TOP = SHEET.staffTop;
const PATHS = glyphs.paths as Record<string, string>;

const ALL = {
  trebleClef: 1, flat: 1, sharp: 1, natural: 1, doubleSharp: 1, doubleFlat: 1,
  restWhole: 1, restHalf: 1, restQuarter: 1, restEighth: 1, restSixteenth: 1,
} satisfies Record<GlyphName, 1>;
const NAMES = Object.keys(ALL) as GlyphName[];

/** Sheet-pixel box of a rendered <path> with transform translate(x, y) scale(s, -s). */
function boxOf(el: Element, d = el.getAttribute('d')!): Box {
  const m = el.getAttribute('transform')!.match(/^translate\(([-\d.]+), ([-\d.]+)\) scale\(([-\d.]+), -([-\d.]+)\)$/);
  if (!m) throw new Error(`unexpected transform ${el.getAttribute('transform')}`);
  return placedBox(d, Number(m[1]), Number(m[2]), Number(m[3]));
}

function placed(name: GlyphName, x: number, y: number): { box: Box; el: Element } {
  const el = render(<svg><Glyph name={name} x={x} y={y} /></svg>).container.querySelector('path')!;
  return { box: boxOf(el), el };
}

describe('glyphs.json', () => {
  it('every GlyphName and digit has a non-empty Bravura path', () => {
    for (const name of [...NAMES, ...Array.from({ length: 10 }, (_, d) => `digit${d}`)]) {
      expect(PATHS[name], name).toMatch(/^M[\s\S]*Z/);
      const b = pathBox(PATHS[name]);
      expect(b.x2 - b.x1, name).toBeGreaterThan(50);
    }
  });

  it('the sixteenth rest is its own glyph, not the eighth rest', () => {
    expect(PATHS.restSixteenth).not.toBe(PATHS.restEighth);
    expect(PATHS.restSixteenth.includes(PATHS.restEighth)).toBe(false);
  });

  it('stored ink boxes match the paths', () => {
    const bbox = glyphs.bbox as Record<string, number[]>;
    for (const name of Object.keys(PATHS)) {
      const b = pathBox(PATHS[name]);
      [b.x1, b.y1, b.x2, b.y2].forEach((v, i) => expect(v, name).toBeCloseTo(bbox[name][i], 0));
    }
  });
});

describe('glyph geometry in sheet pixels', () => {
  it('treble clef: G line origin, ink 15-20px below the bottom line and above the top line', () => {
    const { box } = placed('trebleClef', HEADER.clefInset, B);
    expect(box.y2 - B).toBeGreaterThan(15);
    expect(box.y2 - B).toBeLessThan(20);
    expect(TOP - box.y1).toBeGreaterThan(12);   // Bravura: 13.9px; the previous clef reached 12.3px
    expect(TOP - box.y1).toBeLessThan(25);
    expect(box.x1).toBeGreaterThanOrEqual(0);
    expect(box.x2).toBeLessThanOrEqual(HEADER.clef);
  });

  it.each(['flat', 'sharp', 'natural'] as const)('%s: counter centred on the note, ink right edge 9px left of it', name => {
    const noteX = 200, noteY = 90;
    const { el, box } = placed(name, noteX - 9 - glyphInk(name).right, noteY);
    const counter = boxOf(el, PATHS[name].split(/(?=M)/)[1]);   // inner contour: the bowl of the flat, the box of sharp and natural
    expect((counter.y1 + counter.y2) / 2).toBeCloseTo(noteY, 0);
    expect(box.x2).toBeCloseTo(noteX - 9, 5);
  });

  it('double sharp: ink centred on the note, right edge 9px left of it', () => {
    const noteX = 200, noteY = 90;
    const { box } = placed('doubleSharp', noteX - 9 - glyphInk('doubleSharp').right, noteY);
    expect((box.y1 + box.y2) / 2).toBeCloseTo(noteY, 0);
    expect(box.x2).toBeCloseTo(noteX - 9, 5);
  });

  it('double flat: bowls centred on the note like the flat, right edge 9px left of it', () => {
    const noteX = 200, noteY = 90;
    const { el, box } = placed('doubleFlat', noteX - 9 - glyphInk('doubleFlat').right, noteY);
    const bowls = PATHS.doubleFlat.split(/(?=M)/).slice(1).map(d => boxOf(el, d));
    expect(bowls.length).toBeGreaterThan(0);
    for (const b of bowls) expect((b.y1 + b.y2) / 2).toBeCloseTo(noteY, 0);
    expect(box.x2).toBeCloseTo(noteX - 9, 5);
  });

  it('whole rest hangs from the 4th line, between the 3rd and 4th line', () => {
    const { box } = placed('restWhole', 0, B);
    expect(box.y1).toBeGreaterThan(B - 30 - 0.5);
    expect(box.y1).toBeLessThan(B - 30 + 0.5);
    expect(box.y2).toBeLessThan(B - 20);
  });

  it('half rest sits on the middle line, between the 3rd and 4th line', () => {
    const { box } = placed('restHalf', 0, B);
    expect(box.y2).toBeGreaterThan(B - 20 - 0.5);
    expect(box.y2).toBeLessThan(B - 20 + 0.5);
    expect(box.y1).toBeGreaterThan(B - 30);
  });

  it.each(['restQuarter', 'restEighth', 'restSixteenth'] as const)('%s stays inside the staff, around the middle line', name => {
    const { box } = placed(name, 0, B);
    expect(box.y1).toBeGreaterThanOrEqual(TOP - 0.5);
    expect(box.y2).toBeLessThanOrEqual(B + 0.5);
    expect(box.y1).toBeLessThan(B - 20);
    expect(box.y2).toBeGreaterThan(B - 20);
  });

  it('time signature digits are 20px tall, numerator in the upper half, denominator in the lower half', () => {
    for (const ts of [[4, 4], [3, 4], [2, 4], [6, 8], [2, 2]] as TimeSig[]) {
      const { container } = render(<svg><TimeSigDigits ts={ts} x={50} y={B} /></svg>);
      const [num, den] = [...container.querySelectorAll('path')].map(el => boxOf(el));
      for (const [b, top] of [[num, TOP], [den, TOP + 20]] as const) {
        expect(b.y2 - b.y1).toBeGreaterThan(19.5);
        expect(b.y2 - b.y1).toBeLessThan(20.8);
        expect(b.y1).toBeCloseTo(top, 0);
        expect(b.y2).toBeCloseTo(top + 20, 0);
        expect((b.x1 + b.x2) / 2).toBeCloseTo(50, 5);
      }
    }
  });
});

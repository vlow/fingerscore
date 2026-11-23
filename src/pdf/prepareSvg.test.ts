import { readFileSync } from 'node:fs';
import { textWidth } from './drawText';
import { FONT_KEYS, FONT_NAME, setFontMetrics, type FontKey } from './fontMetrics';
import { prepareSvg } from './prepareSvg';

const FILE: Record<FontKey, string> = {
  'latin-400': 'latin-400-normal', 'latin-700': 'latin-700-normal', 'latin-700i': 'latin-700-italic',
  'ext-400': 'latin-ext-400-normal', 'ext-700': 'latin-ext-700-normal', 'ext-700i': 'latin-ext-700-italic',
};

beforeAll(() => {
  for (const key of FONT_KEYS) {
    const bytes = readFileSync(`src/pdf/fonts/atkinson-hyperlegible-${FILE[key]}.ttf`);
    setFontMetrics(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  }
});

function svgOf(inner: string): SVGSVGElement {
  const host = document.createElement('div');
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="860" height="290" viewBox="0 0 860 290">${inner}</svg>`;
  return host.querySelector('svg')!;
}

const FONT = `font-family="'Atkinson Hyperlegible', system-ui, sans-serif"`;

describe('prepareSvg', () => {
  it('removes the click areas, the selection and playback marks and what is not printed; lets ink outside the box show', () => {
    const svg = svgOf(`
      <rect data-mark="selected" x="0" y="0" width="10" height="10" fill="#E3F4F2"/>
      <rect data-mark="playing" x="0" y="0" width="10" height="10" fill="rgba(14,110,104,0.14)"/>
      <g data-print-hide=""><rect x="0" y="0" width="5" height="5"/></g>
      <rect data-hit="e1" x="0" y="2" width="20" height="250" fill="transparent"/>
      <g data-missing="bad"><title>Unplayable note</title><rect x="0" y="0" width="26" height="84" fill="#FEF2F2"/></g>
      <rect data-keep="" x="0" y="75" width="860" height="1" fill="#2A2D33"/>`);
    prepareSvg(svg);
    expect(svg.querySelectorAll('[data-mark], [data-print-hide], [fill="transparent"], title')).toHaveLength(0);
    expect(svg.querySelector('[data-keep]')).not.toBeNull();
    expect(svg.querySelector('[data-missing] rect')).not.toBeNull();
    expect(svg.getAttribute('overflow')).toBe('visible');
  });

  it('replaces a text with a symbol by text pieces in the right font file and the symbol outline, centred as anchored', () => {
    const svg = svgOf(`<text data-lyric="" x="100" y="40" text-anchor="middle" font-size="13" font-weight="700" ${FONT} fill="#0E6E68">B♭m</text>`);
    prepareSvg(svg);
    const g = svg.querySelector('g[data-lyric]')!;
    expect(g.getAttribute('fill')).toBe('#0E6E68');
    const texts = [...g.querySelectorAll('text')];
    expect(texts.map(t => t.textContent)).toEqual(['B', 'm']);
    expect(texts.map(t => t.getAttribute('font-family'))).toEqual([FONT_NAME['latin-700'], FONT_NAME['latin-700']]);
    expect(texts.every(t => t.getAttribute('font-weight') === '400' && t.getAttribute('text-anchor') === 'start')).toBe(true);
    expect(g.querySelectorAll('path')).toHaveLength(1);
    const width = textWidth('B♭m', 13, 700);
    expect(g.getAttribute('transform')).toBe(`translate(${100 - width / 2} 40)`);
    // the symbol's advance separates the two pieces
    expect(Number(texts[1].getAttribute('x'))).toBeCloseTo(textWidth('B♭', 13, 700), 6);
    expect(textWidth('B♭', 13, 700)).toBeGreaterThan(textWidth('B', 13, 700));
  });

  it('replaces a plain text too: its family is registered under the file\'s own name, which the CSS stack does not name', () => {
    const svg = svgOf(`<text data-bar-number="" x="0" y="65" font-size="11" ${FONT} fill="#5B616E">12</text>`);
    prepareSvg(svg);
    const t = svg.querySelector('[data-bar-number] text')!;
    expect(t.textContent).toBe('12');
    expect(t.getAttribute('font-family')).toBe(FONT_NAME['latin-400']);
    expect(svg.querySelector('[data-bar-number]')!.getAttribute('transform')).toBe('translate(0 65)');
  });

  it('draws extended-Latin letters from the extended file', () => {
    const svg = svgOf(`<text x="0" y="40" font-size="12" ${FONT}>Łódź</text>`);
    prepareSvg(svg);
    expect([...svg.querySelectorAll('text')].map(t => [t.textContent, t.getAttribute('font-family')])).toEqual([
      ['Ł', FONT_NAME['ext-400']], ['ód', FONT_NAME['latin-400']], ['ź', FONT_NAME['ext-400']],
    ]);
  });

  it('squeezes a text to its textLength by scaling the group', () => {
    const svg = svgOf(`<text x="100" y="34" text-anchor="middle" font-size="12" ${FONT} textLength="40" lengthAdjust="spacingAndGlyphs">everyone</text>`);
    prepareSvg(svg);
    const k = 40 / textWidth('everyone', 12, 400);
    expect(svg.querySelector('g')!.getAttribute('transform')).toBe(`translate(80 34) scale(${k} 1)`);
  });

  it('places a raised extension as its own piece, smaller and higher, and the bass back on the baseline', () => {
    const svg = svgOf(`<text x="200" y="15" text-anchor="middle" font-size="13" font-weight="700" ${FONT}>C<tspan data-ext="" dy="-6" dx="1" font-size="9">maj7</tspan><tspan dy="6">/E</tspan></text>`);
    prepareSvg(svg);
    const texts = [...svg.querySelectorAll('text')];
    expect(texts.map(t => [t.textContent, t.getAttribute('y'), t.getAttribute('font-size')])).toEqual([['C', '0', '13'], ['maj7', '-6', '9'], ['/E', '0', '13']]);
    expect(Number(texts[1].getAttribute('x'))).toBeCloseTo(textWidth('C', 13, 700) + 1, 6);
  });

  it('turns a white halo into a rounded white rectangle around the digit\'s ink, under the one digit', () => {
    const svg = svgOf(`<text x="50" y="60" text-anchor="middle" font-size="12" font-weight="700" font-style="italic" ${FONT} fill="#15171C" stroke="#fff" stroke-width="3" stroke-linejoin="round" paint-order="stroke">3</text>`);
    prepareSvg(svg);
    expect(svg.querySelectorAll('g')).toHaveLength(1);
    const g = svg.querySelector('g')!;
    expect([g.getAttribute('fill'), g.getAttribute('stroke')]).toEqual(['#15171C', 'none']);
    const [rect, digit] = [...g.children];
    expect(rect.localName).toBe('rect');
    expect(rect.getAttribute('fill')).toBe('#fff');
    expect(rect.getAttribute('rx')).toBe('1.5');
    expect(digit.localName).toBe('text');
    expect(digit.textContent).toBe('3');
    expect(digit.getAttribute('font-family')).toBe(FONT_NAME['latin-700i']);
    // the rectangle stands 1.5 units (half the stroke) around the ink: about the size of a digit at 12 units
    const [w, h] = [Number(rect.getAttribute('width')), Number(rect.getAttribute('height'))];
    expect(w).toBeGreaterThan(3 + 5);
    expect(w).toBeLessThan(3 + 9);
    expect(h).toBeGreaterThan(3 + 7.5);
    expect(h).toBeLessThan(3 + 10);
    expect(Number(rect.getAttribute('y')) + h - 1.5).toBeGreaterThanOrEqual(-0.5);   // ink bottom near the baseline
    expect(svg.querySelector('[paint-order]')).toBeNull();
  });

  it('squeezes a text with a symbol as a whole: the outline sits inside the scaled group', () => {
    const svg = svgOf(`<text x="100" y="15" text-anchor="middle" font-size="13" font-weight="700" ${FONT} textLength="20" lengthAdjust="spacingAndGlyphs">B♭m7</text>`);
    prepareSvg(svg);
    const g = svg.querySelector('g')!;
    const k = 20 / textWidth('B♭m7', 13, 700);
    expect(k).toBeLessThan(1);
    expect(g.getAttribute('transform')).toBe(`translate(90 15) scale(${k} 1)`);
    expect(g.querySelectorAll('path')).toHaveLength(1);
    expect(g.querySelector('path')!.parentElement).toBe(g);
  });

  it('a text without a font size is an error', () => {
    expect(() => prepareSvg(svgOf(`<text x="0" y="10">x</text>`))).toThrow(/no font size/);
  });
});

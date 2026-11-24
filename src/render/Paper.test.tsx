import { render, screen, fireEvent } from '@testing-library/react';
import { Paper } from './Paper';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import { SHEET, layoutSheet } from './layout';
import { pathBox } from './pathBox';
import { hasPill, spreadPills } from './pillSpread';
import { missingType } from './NoteView';
import { LYRIC_FONT_PX, TEXT_EM_PER_CHAR } from './lyrics';
import { mkDoc, type BarSpec, type EvSpec } from '../test/helpers';
import type { DerivedEvent } from '../domain/derive';
import type { Doc, InstId } from '../domain/types';

function renderDoc(doc: Doc, playingId: string | null = null, extra: Partial<Parameters<typeof Paper>[0]> = {}) {
  const derived = derive(doc, DEFAULT_PREFS);
  return render(
    <Paper doc={doc} derived={derived} layout={layoutSheet(doc, derived)} playingId={playingId}
      selectedId={null} onSelect={() => {}} onTitle={() => {}} onSubtitle={() => {}} {...extra} />,
  );
}

const setup = (id: InstId, patch: Partial<Doc> = {}, extra: Partial<Parameters<typeof Paper>[0]> = {}) =>
  renderDoc({ ...sampleDoc(id), ...patch }, null, extra);

describe('Paper', () => {
  it('readOnly draws plain headings and nothing to click', () => {
    let underCalls = 0;
    const { container } = setup('asax', { subtitle: '' }, { readOnly: true, renderUnderChart: () => { underCalls += 1; return null; } });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The Water Is Wide');
    expect(container.querySelectorAll('[data-hit]')).toHaveLength(0);
    expect(container.querySelector('[data-subtitle]')).toBeNull();
    expect(underCalls).toBe(0);
  });

  it('readOnly shows a subtitle as text', () => {
    const { container } = setup('asax', { subtitle: 'Traditional' }, { readOnly: true });
    expect(container.querySelector('[data-subtitle]')).toHaveTextContent('Traditional');
  });

  it('renders title, tempo, header keys, legend', () => {
    setup('asax');
    expect(screen.getByDisplayValue('The Water Is Wide')).toBeInTheDocument();
    expect(screen.getByText('♩ = 100')).toBeInTheDocument();
    expect(screen.getByText(/you read G major · sounds B♭ major/)).toBeInTheDocument();
    expect(screen.getByText(/fingering data: draft/)).toBeInTheDocument();
    expect(screen.getByText('fingerscore.eu')).toBeInTheDocument();
  });

  it('is an article of 940px with one 860 × 290 svg per system', () => {
    const { container } = setup('xc');
    const paper = screen.getByTestId('paper');
    expect(paper.tagName).toBe('ARTICLE');
    expect(paper).toHaveClass('paper');
    const svg = container.querySelector('[data-testid="system"]')!;
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg).toHaveAttribute('width', '860');
    expect(svg).toHaveAttribute('height', '290');
  });

  it('one chart per sounding note that is not a tied continuation', () => {
    const { container } = setup('xc');
    expect(container.querySelectorAll('[data-testid="system"]')).toHaveLength(5);
    expect(container.querySelectorAll('[data-chart]')).toHaveLength(41);
  });

  it('check 2: unplayable notes are red with "!" boxes', () => {
    const { container } = setup('xc', { shift: 0 });
    // Brief asserted 8 on [data-state="bad"]; the fixture has 8 bad attacks plus 2 tied
    // continuations of them, which are the same unplayable pitch and also drawn red.
    expect(container.querySelectorAll('[data-state="bad"]:not([data-tied])')).toHaveLength(8);
    expect(container.querySelectorAll('[data-state="bad"]')).toHaveLength(10);
    expect(container.querySelectorAll('[data-missing="bad"]')).toHaveLength(8);
    const head = container.querySelector('[data-state="bad"] [data-head]')!;
    expect(head).toHaveAttribute('fill', '#B91C1C');
  });

  it('show toggles hide bands', () => {
    const { container } = setup('xc', { show: { fingerings: false, chords: false, lyrics: false, raiseExtensions: true } });
    expect(container.querySelectorAll('[data-chart]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-missing]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-chord]')).toHaveLength(0);
    expect(screen.queryByText('wat-')).toBeNull();
  });

  it('lyrics and chords are drawn', () => {
    const { container } = setup('xc');
    expect(screen.getByText('wat-')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-chord]').length).toBeGreaterThan(0);
  });

  it('forceShow draws lyrics or chords whose toggles are off, and marks them for print', () => {
    const off = { fingerings: true, chords: false, lyrics: false, raiseExtensions: true };
    const { container, unmount } = renderDoc({ ...sampleDoc('xc'), show: off }, null, { forceShow: { lyrics: true } });
    expect(screen.getByText('wat-')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-chord]')).toHaveLength(0);
    expect(screen.getByTestId('paper')).toHaveAttribute('data-forced-lyrics');
    expect(screen.getByTestId('paper')).not.toHaveAttribute('data-forced-chords');
    unmount();
    const second = renderDoc({ ...sampleDoc('xc'), show: off }, null, { forceShow: { chords: true } });
    expect(second.container.querySelectorAll('[data-chord]').length).toBeGreaterThan(0);
    expect(screen.queryByText('wat-')).toBeNull();
    expect(screen.getByTestId('paper')).toHaveAttribute('data-forced-chords');
  });

  it('forceShow on a band that is already shown marks nothing', () => {
    setup('xc');
    expect(screen.getByTestId('paper')).not.toHaveAttribute('data-forced-lyrics');
    const doc = sampleDoc('xc');
    renderDoc(doc, null, { forceShow: { lyrics: true, chords: true } });
    expect(screen.getAllByTestId('paper')[1]).not.toHaveAttribute('data-forced-lyrics');
    expect(screen.getAllByTestId('paper')[1]).not.toHaveAttribute('data-forced-chords');
  });

  it('renderUnderSystem puts HTML directly below its system, hidden in print', () => {
    const under = vi.fn((i: number) => (i === 1 ? <p>under one</p> : null));
    renderDoc(sampleDoc('xc'), null, { renderUnderSystem: under });
    const systems = screen.getAllByTestId('system');
    expect(under.mock.calls.map(c => c[0])).toEqual(systems.map((_, i) => i));
    const slot = screen.getByText('under one').parentElement!;
    expect(systems[1].parentElement!.nextElementSibling).toBe(slot);
    expect(slot).toHaveAttribute('data-print-hide');
    expect(document.querySelectorAll('[data-under-system]')).toHaveLength(1);
  });

  it('playing note is highlighted', () => {
    const doc = sampleDoc('xc');
    const first = doc.score[0].ev[0].id;
    const { container } = renderDoc(doc, first);
    const playing = container.querySelectorAll('[data-playing="true"]');
    expect(playing).toHaveLength(1);
    expect(playing[0]).toHaveAttribute('data-ev', first);
  });

  it('nothing is highlighted when nothing plays', () => {
    const { container } = setup('xc');
    expect(container.querySelectorAll('[data-playing="true"]')).toHaveLength(0);
  });

  it('title and subtitle inputs report edits', () => {
    const onTitle = vi.fn();
    const onSubtitle = vi.fn();
    renderDoc(sampleDoc('xc'), null, { onTitle, onSubtitle });
    fireEvent.change(screen.getByRole('textbox', { name: 'Sheet title' }), { target: { value: 'New' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Sheet subtitle' }), { target: { value: 'Trad.' } });
    expect(onTitle).toHaveBeenCalledWith('New');
    expect(onSubtitle).toHaveBeenCalledWith('Trad.');
    expect(screen.getByPlaceholderText('Add a title')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add a subtitle (composer, arranger…)')).toBeInTheDocument();
  });

  it('a 2/2 document draws the digits 2 over 2', () => {
    const { container } = renderDoc(mkDoc([{ ev: [[60, 48]] }], [2, 2]));
    const digits = [...container.querySelectorAll('[data-timesig="2/2"] path')];
    expect(digits.map(e => e.getAttribute('data-digit'))).toEqual(['digit2', 'digit2']);
  });

  it('first system shows the time signature, later systems a bar number', () => {
    const { container } = setup('xc');
    const systems = container.querySelectorAll('[data-testid="system"]');
    expect(systems[0].querySelector('[data-timesig="4/4"]')).not.toBeNull();
    expect(systems[1].querySelector('[data-timesig]')).toBeNull();
    expect(systems[1].querySelector('[data-bar-number]')).not.toBeNull();
    expect(systems[0].querySelector('[data-bar-number]')).toBeNull();
  });

  it('volta brackets read "1." and "2."', () => {
    const { container } = setup('xc');
    const labels = [...container.querySelectorAll('[data-volta]')].map(v => v.textContent);
    expect(labels).toEqual(['1.', '2.']);
  });

  it('a two-bar first ending has one label and one continuous bracket', () => {
    const doc = mkDoc([
      { rs: true, ev: [[67, 48]] },
      { volta: '1', ev: [[67, 48]] },
      { volta: '1', re: true, ev: [[67, 48]] },
      { volta: '2', ev: [[67, 48]] },
    ]);
    const { container } = renderDoc(doc);
    const voltas = [...container.querySelectorAll('[data-volta]')];
    expect(voltas.map(v => v.textContent)).toEqual(['1.', '', '2.']);
    const [first, cont] = voltas.map(v => v.querySelector('path')!.getAttribute('d')!);
    expect(first).toMatch(/^M[\d.]+ \d+V/);          // the ending's start has a hook
    expect(cont).not.toMatch(/V/);                   // the continuation is a plain line
    const endX = (d: string) => Number(/H([\d.]+)$/.exec(d)![1]);
    const startX = (d: string) => Number(/^M([\d.]+)/.exec(d)![1]);
    expect(endX(first)).toBeGreaterThanOrEqual(startX(cont));   // open towards the next bar
  });

  it('repeat barlines have dots and the last bar a final barline', () => {
    const { container } = setup('xc');
    expect(container.querySelectorAll('[data-repeat="start"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-repeat="end"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-final]')).toHaveLength(1);
  });

  it('renderUnderChart is called once per chart, below it', () => {
    const calls: [string, number, number][] = [];
    const { container } = renderDoc(sampleDoc('xc'), null, {
      renderUnderChart: (ev, x, y) => { calls.push([ev.id, x, y]); return null; },
    });
    expect(calls).toHaveLength(container.querySelectorAll('[data-chart]').length);
    expect(calls.every(([, , y]) => y === 166 + 90)).toBe(true);
  });

  it('renderUnderChart gets pill centres that leave out the notes without a pill', () => {
    const calls: { system: number; x: number; pillX: number; pill: boolean }[] = [];
    renderDoc(sampleDoc('asax'), null, {
      renderUnderChart: (ev, x, _y, system, _last, pillX) => { calls.push({ system, x, pillX, pill: hasPill(ev) }); return null; },
    });
    // The sample has charts with one fingering between charts with several.
    expect(calls.some(c => !c.pill)).toBe(true);
    expect(calls.filter(c => c.pill).length).toBeGreaterThan(1);
    for (const system of new Set(calls.map(c => c.system))) {
      const pills = calls.filter(c => c.system === system && c.pill);
      expect(pills.map(c => c.pillX)).toEqual(spreadPills(pills.map(c => c.x), SHEET.systemWidth));
    }
    for (const c of calls.filter(c => !c.pill)) expect(c.pillX).toBe(c.x);
  });

  it('invalid chords are red', () => {
    const doc = sampleDoc('xc');
    const id = doc.score[1].ev[0].id;
    doc.chords = { [id]: { raw: 'Hm7', ok: false, pc: 0, rest: '', bass: null, tk: 0 } };
    const { container } = renderDoc(doc);
    const chord = container.querySelector(`[data-ev="${id}"] [data-chord]`)!;
    expect(chord).toHaveAttribute('data-chord', 'bad');
    expect(chord.querySelector('text')).toHaveAttribute('fill', '#B91C1C');
  });

  it('extensions are raised when asked, inline otherwise', () => {
    const doc = sampleDoc('xc');
    const id = doc.score[1].ev[0].id;
    doc.chords = { [id]: { raw: 'C7', ok: true, pc: 0, rest: '7', bass: null, tk: doc.shift } };
    const raised = renderDoc(doc).container.querySelector(`[data-ev="${id}"] [data-ext]`)!;
    expect(raised).toHaveAttribute('dy', '-6');
    const flat = renderDoc({ ...doc, show: { ...doc.show, raiseExtensions: false } })
      .container.querySelector(`[data-ev="${id}"] [data-ext]`)!;
    expect(flat).not.toHaveAttribute('dy');
  });
});

describe('selection', () => {
  const hit = (c: HTMLElement, id: string) => c.querySelector(`[data-hit="${id}"]`)!;

  it('every event has a hit area; clicking one selects it', () => {
    const doc = sampleDoc('xc');
    const onSelect = vi.fn();
    const { container } = renderDoc(doc, null, { onSelect });
    const events = doc.score.flatMap(b => b.ev);
    expect(container.querySelectorAll('[data-hit]')).toHaveLength(events.length);
    const id = doc.score[2].ev[1].id;
    fireEvent.click(hit(container, id));
    expect(onSelect).toHaveBeenCalledWith(id);
  });

  it('hit areas span chord band to chart, at least 16px, without overlapping in a bar', () => {
    const doc = mkDoc([{ ev: [[67, 3], [67, 3], [67, 6], [0, 12], [67, 24]] }]);
    const { container } = renderDoc(doc);
    const rects = [...container.querySelectorAll('[data-hit]')].map(r => ({
      x: Number(r.getAttribute('x')), w: Number(r.getAttribute('width')),
      y: Number(r.getAttribute('y')), h: Number(r.getAttribute('height')),
    }));
    expect(rects).toHaveLength(5);
    for (const r of rects) {
      expect(r.w).toBeGreaterThanOrEqual(16);
      expect(r.y).toBeLessThanOrEqual(2);
      expect(r.y + r.h).toBeGreaterThan(166 + 80);
    }
    for (let k = 1; k < rects.length; k++) expect(rects[k].x).toBeGreaterThanOrEqual(rects[k - 1].x + rects[k - 1].w - 1e-6);
  });

  it('clicking the selected event clears the selection', () => {
    const doc = sampleDoc('xc');
    const id = doc.score[1].ev[0].id;
    const onSelect = vi.fn();
    const { container } = renderDoc(doc, null, { selectedId: id, onSelect });
    fireEvent.click(hit(container, id));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('the selected event shows a teal marker; playing stays on top', () => {
    const doc = sampleDoc('xc');
    const id = doc.score[1].ev[0].id;
    const { container } = renderDoc(doc, id, { selectedId: id });
    const selected = container.querySelectorAll('[data-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveAttribute('data-ev', id);
    const marks = [...container.querySelectorAll('[data-mark]')];
    expect(marks.map(m => m.getAttribute('data-mark'))).toEqual(['selected', 'playing']);   // document order: playing on top
    expect(marks[1].parentElement).toBe(selected[0]);
    const svg = selected[0].closest('svg')!;
    expect(marks[0].parentElement).toBe(svg);
    expect(svg.firstElementChild).toBe(marks[0]);                                           // beneath the staff lines
    expect(marks[0]).toHaveAttribute('fill', '#E3F4F2');
    expect(marks[0]).toHaveAttribute('stroke', '#0E6E68');
    expect(marks[0]).toHaveAttribute('stroke-width', '1.5');
    expect(marks[0]).toHaveAttribute('rx', '6');
  });

  it('no marker without a selection', () => {
    const { container } = setup('xc');
    expect(container.querySelectorAll('[data-selected]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-mark="selected"]')).toHaveLength(0);
  });

  it('clicking the alternate-fingering pill does not select', () => {
    const onSelect = vi.fn();
    renderDoc(sampleDoc('asax'), null, {
      onSelect,
      renderUnderChart: ev => <button type="button">pill {ev.id}</button>,
    });
    fireEvent.click(screen.getAllByRole('button', { name: /^pill / })[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('SystemView symbols', () => {
  const draw = (doc: Doc) => renderDoc(doc).container;

  it('sixteenths are beamed with two beams, a lone eighth keeps one flag', () => {
    const c = draw(mkDoc([{ ev: [[67, 3], [67, 3], [67, 3], [67, 3], [67, 6], [0, 6], [67, 24]] }]));
    expect(c.querySelectorAll('[data-beam]')).toHaveLength(2);
    expect(c.querySelectorAll('[data-flag]')).toHaveLength(1);
  });

  it('a dotted eighth and a sixteenth: full beam and a stub', () => {
    const c = draw(mkDoc([{ ev: [[67, 9], [67, 3], [67, 36]] }]));
    expect(c.querySelectorAll('[data-beam]')).toHaveLength(1);
    expect(c.querySelectorAll('[data-beam-stub]')).toHaveLength(1);
    expect(c.querySelectorAll('[data-dot]')).toHaveLength(2);
  });

  it('a lone sixteenth gets two flags; a whole note has no stem', () => {
    const c = draw(mkDoc([{ ev: [[67, 3], [0, 9], [0, 12], [0, 24]] }, { ev: [[67, 48]] }]));
    expect(c.querySelectorAll('[data-flag]')).toHaveLength(2);
    expect(c.querySelectorAll('[data-stem]')).toHaveLength(1);
  });

  it('a full-bar rest of 36 ticks in 3/4 is a centred whole rest', () => {
    const c = draw(mkDoc([{ ev: [[67, 36]] }, { ev: [[0, 36]] }], [3, 4]));
    expect(c.querySelectorAll('[data-rest="restWhole"]')).toHaveLength(1);
    expect(c.querySelectorAll('[data-dot]')).toHaveLength(1); // the dotted half note only
  });

  it('dotted rests get a dot', () => {
    const c = draw(mkDoc([{ ev: [[0, 18], [0, 6], [67, 24]] }]));
    expect(c.querySelectorAll('[data-rest="restQuarter"]')).toHaveLength(1);
    expect(c.querySelectorAll('[data-dot]')).toHaveLength(1);
  });

  it('close syllables do not overlap on the lyric line', () => {
    const doc = mkDoc([{ ev: [[67, 6], [67, 12], [67, 6], [67, 24]] }]);
    doc.score[0].ev[0].l = 'ac-';
    doc.score[0].ev[1].l = 'quain-';
    const c = draw(doc);
    const [a, b] = [...c.querySelectorAll('[data-lyric]')];
    const width = (t: string) => t.length * TEXT_EM_PER_CHAR * LYRIC_FONT_PX;
    const right = Number(a.getAttribute('x')) + width('ac-') / 2;
    const left = Number(b.getAttribute('x')) - width('quain-') / 2;
    expect(left - right).toBeGreaterThanOrEqual(1);
  });

  it('ledger lines below the staff', () => {
    // C4 on the C xaphoon at shift 0 is written C4: pos -2, one ledger line
    const c = draw(mkDoc([{ ev: [[60, 48]] }]));
    expect(c.querySelectorAll('[data-ledger]')).toHaveLength(1);
  });

  it('ties across systems are drawn as two halves', () => {
    const bars = Array.from({ length: 5 }, () => ({ ev: [[67, 48]] as [number, number][] }));
    const doc = mkDoc(bars);
    doc.score[3].ev[0].tie = true;
    const c = draw(doc);
    const systems = c.querySelectorAll('[data-testid="system"]');
    expect(systems).toHaveLength(2);
    expect(systems[0].querySelectorAll('[data-tie]')).toHaveLength(1);
    expect(systems[1].querySelectorAll('[data-tie]')).toHaveLength(1);
  });

});

describe('missingType', () => {
  const ev = (state: DerivedEvent['state'], written: number) => ({ state, written, options: [] }) as unknown as DerivedEvent;

  it('unplayable → "!" box', () => {
    expect(missingType(ev('bad', 40), 'xaph')).toBe('bad');
  });
  it('playable without data → "ext" box', () => {
    expect(missingType(ev('ext', 80), 'sax')).toBe('ext');
    expect(missingType(ev('ok', 70), 'fl')).toBe('ext');
  });
  it('clarinet above written C6 without data → "alt" box', () => {
    expect(missingType(ev('ext', 85), 'cl')).toBe('alt');
    expect(missingType(ev('ok', 84), 'cl')).toBe('ext');
    expect(missingType(ev('bad', 100), 'cl')).toBe('bad');
  });
});

describe('triplets', () => {
  const N = 67;
  const bar = (...specs: (number | 'r')[]): BarSpec => ({ ev: specs.map((d): EvSpec => d === 'r' ? [0, 4] : [N, d]) });
  const ev = (c: HTMLElement, id: string) => c.querySelector(`[data-ev="${id}"]`)!;

  it('draws a lone triplet eighth with one flag and a beamed one with none', () => {
    const { container } = renderDoc(mkDoc([bar(8, 4, 12, 24), bar(4, 4, 4, 12, 24)]));
    expect(ev(container, 't2').querySelectorAll('[data-flag]')).toHaveLength(1);
    for (const id of ['t5', 't6', 't7']) expect(ev(container, id).querySelectorAll('[data-flag]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-beam-group]')).toHaveLength(1);
  });
  it('a member of 8 is a filled head with a stem and no flag; a member of 16 is open', () => {
    const { container } = renderDoc(mkDoc([bar(8, 4, 12, 24), bar(16, 8, 24)]));
    const q = ev(container, 't1');
    expect(q.querySelector('[data-head="filled"]')).not.toBeNull();
    expect(q.querySelectorAll('[data-stem]')).toHaveLength(1);
    expect(q.querySelectorAll('[data-flag]')).toHaveLength(0);
    expect(ev(container, 't5').querySelector('[data-head="open"]')).not.toBeNull();
    expect(ev(container, 't6').querySelector('[data-head="filled"]')).not.toBeNull();
  });
  it('a pickup of 15 ticks with an off-beat group [3,4,4,4]: one mark, one beam over the three members', () => {
    const doc = mkDoc([bar(3, 4, 4, 4), bar(12, 12, 24)]);
    expect(doc.score[0].cap).toBe(15);
    const { container } = renderDoc(doc);
    const marks = container.querySelectorAll('[data-tuplet]');
    expect(marks).toHaveLength(1);
    expect(marks[0].querySelector('[data-tuplet-bracket]')).toBeNull();
    const beams = [...container.querySelectorAll('[data-beam-group]')].map(g => g.getAttribute('data-beam-group'));
    expect(beams).toEqual(['t2 t3 t4']);
  });
  it('a triplet eighth rest is the eighth rest glyph; no dots inside a group', () => {
    const { container } = renderDoc(mkDoc([bar(4, 'r', 4, 12, 24)]));
    expect(ev(container, 't2').querySelector('[data-rest="restEighth"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-dot]')).toHaveLength(0);
  });
  it('one mark per group with the text 3; a bracket for [8,4] and none for [4,4,4]', () => {
    const { container } = renderDoc(mkDoc([bar(8, 4, 12, 24), bar(4, 4, 4, 12, 24)]));
    const marks = container.querySelectorAll('[data-tuplet]');
    expect(marks).toHaveLength(2);
    expect([...marks].map(m => m.querySelector('text')!.textContent)).toEqual(['3', '3']);
    expect(marks[0].querySelector('[data-tuplet-bracket]')).not.toBeNull();
    expect(marks[1].querySelector('[data-tuplet-bracket]')).toBeNull();
    expect([...marks].map(m => m.getAttribute('data-tuplet-side'))).toEqual(['above', 'above']);
  });
  it('under an ending bracket with notes above the staff, the mark goes below; clear of all bands', () => {
    const high: BarSpec = { ev: [[81, 8], [81, 4], [81, 12], [81, 24]], volta: '1' };
    const doc = mkDoc([high, { ev: [[81, 4], [81, 4], [81, 4], [81, 12], [81, 24]], volta: '1' }]);
    const { container } = renderDoc(doc);
    expect(derive(doc, DEFAULT_PREFS).events[0].pos).toBeGreaterThan(9);
    const marks = [...container.querySelectorAll('[data-tuplet]')];
    expect(marks.map(m => m.getAttribute('data-tuplet-side'))).toEqual(['below', 'below']);
    for (const m of marks) expectClear(m, true);
  });
  it('the mark stays clear of chord, lyric and ending lines in ordinary bars', () => {
    const doc = mkDoc([
      bar(8, 4, 12, 24), bar(4, 4, 4, 12, 24), bar(8, 8, 8, 24), bar(2, 2, 2, 6, 12, 24),
    ]);
    doc.score[0].ev[0].l = 'la'; doc.score[0].ev[0].m = 74;
    const { container } = renderDoc(doc);
    const marks = [...container.querySelectorAll('[data-tuplet]')];
    expect(marks).toHaveLength(4);
    for (const m of marks) { expect(m.getAttribute('data-tuplet-side')).toBe('above'); expectClear(m, false); }
  });
});

describe('triplet marks keep clear of neighbouring ink', () => {
  const N = 67;
  const specs = (...ds: number[]): EvSpec[] => ds.map(d => [N, d]);
  const solo = (ev: EvSpec[], volta: Doc['score'][number]['volta'] = '') => {
    const doc = mkDoc([{ ev, volta }]);          // one bar: the last system, not stretched
    const r = renderDoc(doc);
    return { doc, ...r };
  };
  const marksOf = (c: HTMLElement) => [...c.querySelectorAll('[data-tuplet]')];

  it('[8,4,4,8,24] at the least width: the second bracket clears the flag of the first group', () => {
    // A is high with its stem up, B low: B's bracket sits at the height of A's flag.
    const { doc, container } = solo([[69, 8], [69, 4], [64, 4], [64, 8], [67, 24]]);
    const d = derive(doc, DEFAULT_PREFS);
    const L = layoutSheet(doc, d).systems[0].bars[0].events;
    expect(L[2].x - L[1].x).toBeCloseTo(20, 6);
    const marks = marksOf(container);
    expect(marks).toHaveLength(2);
    marks.forEach((m, i) => expectNeighboursClear(container, m, i === 0 ? ['t1', 't2'] : ['t3', 't4']));
  });
  it('[4,8,8,4,24] at the least width', () => {
    const { container } = solo([[69, 4], [69, 8], [64, 8], [64, 4], [67, 24]]);
    const marks = marksOf(container);
    expect(marks).toHaveLength(2);
    marks.forEach((m, i) => expectNeighboursClear(container, m, i === 0 ? ['t1', 't2'] : ['t3', 't4']));
  });
  it('a plain flagged eighth directly before and after a bracketed group', () => {
    const { container } = solo([[69, 6], [64, 8], [64, 4], [69, 6], [67, 24]]);
    const marks = marksOf(container);
    expect(marks).toHaveLength(1);
    expectNeighboursClear(container, marks[0], ['t2', 't3']);
  });
  it('stems down: flags point left and the next note may sit close', () => {
    const { container } = solo([[81, 8], [81, 4], [81, 4], [81, 8], [81, 24]]);
    marksOf(container).forEach((m, i) => expectNeighboursClear(container, m, i === 0 ? ['t1', 't2'] : ['t3', 't4']));
  });
  it('a group next to plain notes on ledger lines', () => {
    const { container, doc } = solo([[57, 6], [67, 8], [67, 4], [57, 6], [67, 24]]);
    expect(derive(doc, DEFAULT_PREFS).events[0].pos).toBeLessThan(-2);
    const marks = marksOf(container);
    expect(marks).toHaveLength(1);
    expectNeighboursClear(container, marks[0], ['t2', 't3']);
    const high = solo([[88, 6], [75, 8], [75, 4], [88, 6], [75, 24]]);
    marksOf(high.container).forEach(m => expectNeighboursClear(high.container, m, ['t2', 't3']));
  });
  it('a bracketed group of high notes in a bar without an ending: below, clear of the bands and of its own notes', () => {
    const { container, doc } = solo([[81, 8], [83, 4], [81, 12], [81, 24]]);
    expect(derive(doc, DEFAULT_PREFS).events[0].pos).toBeGreaterThan(9);
    const [m] = marksOf(container);
    expect(m.getAttribute('data-tuplet-side')).toBe('below');
    expectClear(m, false);
    expectNeighboursClear(container, m, ['t1', 't2']);
  });
  it('a group with a very low and a very high note keeps out of the chart row: above, giving up the upper limit', () => {
    const { container, doc } = solo([[52, 8], [84, 4], [67, 12], [67, 24]]);
    expect(derive(doc, DEFAULT_PREFS).events[0].pos).toBeLessThanOrEqual(-6);
    const [m] = marksOf(container);
    expect(m.getAttribute('data-tuplet-side')).toBe('above');
    expect(markBox(m).y2).toBeLessThan(SHEET.chartY);
    expectNeighboursClear(container, m, ['t1', 't2']);
  });
  it('a beamed group with stems down and the space above taken: the number stays out of the chart row', () => {
    const { container, doc } = solo([[53, 4], [84, 4], [84, 4], [67, 12], [67, 24]]);
    expect(derive(doc, DEFAULT_PREFS).events.slice(0, 3).map(e => e.pos)).toEqual([-6, 12, 12]);
    const [m] = marksOf(container);
    expect(m.querySelector('[data-tuplet-bracket]')).toBeNull();
    expect(m.getAttribute('data-tuplet-side')).toBe('below');
    expect(markBox(m).y2).toBeLessThan(SHEET.chartY);
  });
  it('a beamed number stands at its beam, on the stem side', () => {
    const up = solo(specs(4, 4, 4, 12, 24));
    const [mu] = marksOf(up.container);
    expect(mu.getAttribute('data-tuplet-side')).toBe('above');
    const beamUp = Number(up.container.querySelector('[data-beam]')!.getAttribute('y'));
    expect(markBox(mu).y2).toBeLessThan(beamUp);
    expect(markBox(mu).y2).toBeGreaterThan(beamUp - 12);
    const down = solo([[75, 4], [75, 4], [75, 4], [75, 12], [75, 24]]);
    const [md] = marksOf(down.container);
    expect(md.getAttribute('data-tuplet-side')).toBe('below');
    const beamDown = Number(down.container.querySelector('[data-beam]')!.getAttribute('y')) + 4;
    expect(markBox(md).y1).toBeGreaterThan(beamDown);
    expect(markBox(md).y1).toBeLessThan(beamDown + 12);
  });
  it('a number over a staff line has a white halo; a bracket never lies on a staff line', () => {
    const { container } = renderDoc(mkDoc([{ ev: specs(8, 4, 12, 24) }, { ev: [[69, 8], [71, 4], [72, 12], [74, 24]] }, { ev: [[64, 8], [64, 4], [64, 12], [64, 24]] }]));
    for (const t of container.querySelectorAll('[data-tuplet] text')) {
      expect(t.getAttribute('stroke')).toBe('#fff');
      expect(t.getAttribute('paint-order')).toBe('stroke');
    }
    for (const path of container.querySelectorAll('[data-tuplet-bracket]')) {
      const line = Number(path.getAttribute('d')!.match(/V(-?[\d.]+)H/)![1]);
      for (let i = 0; i < 5; i++) expect(Math.abs(line - (SHEET.staffTop + 10 * i + 0.5))).toBeGreaterThanOrEqual(1.5);
    }
  });
  it('a bar whose triplet lengths sit in no group draws without a mark and does not throw', () => {
    const { container } = solo([[67, 4], [67, 44]]);
    expect(marksOf(container)).toHaveLength(0);
  });
});

interface InkBox { x1: number; x2: number; y1: number; y2: number; owner: string[] }

/** Ink of everything drawn in the mark's system, from the emitted attributes. */
function inkBoxes(m: Element): InkBox[] {
  const svg = m.closest('svg')!;
  const n = (e: Element, a: string) => Number(e.getAttribute(a));
  const ownerOf = (e: Element): string[] => {
    const ev = e.closest('[data-ev]');
    if (ev) return [ev.getAttribute('data-ev')!];
    const g = e.closest('[data-beam-group]');
    return g ? g.getAttribute('data-beam-group')!.split(' ') : [];
  };
  const out: InkBox[] = [];
  for (const e of svg.querySelectorAll('[data-head]')) out.push({ x1: n(e, 'cx') - 6, x2: n(e, 'cx') + 6, y1: n(e, 'cy') - 5, y2: n(e, 'cy') + 5, owner: ownerOf(e) });
  for (const e of svg.querySelectorAll('[data-stem],[data-ledger],[data-beam],[data-beam-stub]')) {
    out.push({ x1: n(e, 'x'), x2: n(e, 'x') + n(e, 'width'), y1: n(e, 'y'), y2: n(e, 'y') + n(e, 'height'), owner: ownerOf(e) });
  }
  for (const e of svg.querySelectorAll('[data-flag]')) {
    const b = pathBox(e.getAttribute('d')!);
    out.push({ x1: b.x1 - 1, x2: b.x2 + 1, y1: b.y1, y2: b.y2, owner: ownerOf(e) });
  }
  for (const e of svg.querySelectorAll('[data-rest]')) {
    const ev = e.closest('[data-ev]')!;
    out.push({ x1: -1e6, x2: 1e6, y1: 0, y2: 0, owner: [ev.getAttribute('data-ev')!] });
  }
  return out;
}

const gap = (a: { x1: number; x2: number; y1: number; y2: number }, b: { x1: number; x2: number; y1: number; y2: number }) => ({
  x: Math.max(a.x1 - b.x2, b.x1 - a.x2), y: Math.max(a.y1 - b.y2, b.y1 - a.y2),
});

/** The mark's bracket and number touch none of the group's own ink and keep 3 units from all other ink and marks. */
function expectNeighboursClear(container: HTMLElement, m: Element, members: string[]) {
  const t = m.querySelector('text')!;
  const x = Number(t.getAttribute('x')), y = Number(t.getAttribute('y'));
  const mine = [{ x1: x - 5, x2: x + 5, y1: y - 9, y2: y }];
  for (const p of m.querySelectorAll('[data-tuplet-bracket]')) mine.push(pathBox(p.getAttribute('d')!));
  for (const box of inkBoxes(m)) {
    if (box.x1 === -1e6) continue;       // rests: drawn as glyphs; their box is checked through the group's own notes
    const own = box.owner.some(id => members.includes(id));
    for (const b of mine) {
      const g = gap(b, box);
      if (own) expect(g.x > 0 || g.y > 0).toBe(true);
      else expect(g.x >= 3 || g.y >= 3).toBe(true);
    }
  }
  for (const other of container.querySelectorAll('[data-tuplet]')) {
    if (other === m) continue;
    const tt = other.querySelector('text')!;
    const boxes = [{ x1: Number(tt.getAttribute('x')) - 5, x2: Number(tt.getAttribute('x')) + 5, y1: Number(tt.getAttribute('y')) - 9, y2: Number(tt.getAttribute('y')) }];
    for (const p of other.querySelectorAll('[data-tuplet-bracket]')) boxes.push(pathBox(p.getAttribute('d')!));
    for (const a of mine) for (const b of boxes) { const g = gap(a, b); expect(g.x >= 3 || g.y >= 3).toBe(true); }
  }
}

/** Box of a mark from its attributes: the number's text and the bracket path. */
function markBox(m: Element) {
  const t = m.querySelector('text')!;
  const x = Number(t.getAttribute('x')), y = Number(t.getAttribute('y')), fs = Number(t.getAttribute('font-size'));
  const boxes = [{ x1: x - fs * 0.3, x2: x + fs * 0.3, y1: y - fs * 0.75, y2: y }];
  for (const p of m.querySelectorAll('[data-tuplet-bracket]')) boxes.push(pathBox(p.getAttribute('d')!));
  return { y1: Math.min(...boxes.map(b => b.y1)), y2: Math.max(...boxes.map(b => b.y2)) };
}

function expectClear(m: Element, volta: boolean) {
  const { y1, y2 } = markBox(m);
  const bands: [number, number][] = [[SHEET.chordY, SHEET.chordY + 15], [SHEET.lyricY, SHEET.lyricY + 16]];
  if (volta) bands.push([SHEET.voltaY, SHEET.voltaY + 14]);
  for (const [a, b] of bands) expect(y2 < a || y1 > b).toBe(true);
}

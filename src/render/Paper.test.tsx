import { render, screen, fireEvent } from '@testing-library/react';
import { Paper } from './Paper';
import { derive } from '../domain/derive';
import { sampleDoc } from '../domain/fixture';
import { DEFAULT_PREFS } from '../domain/transpose';
import { layoutSheet } from './layout';
import { missingType } from './NoteView';
import { LYRIC_FONT_PX, TEXT_EM_PER_CHAR } from './lyrics';
import { mkDoc } from '../test/helpers';
import type { DerivedEvent } from '../domain/derive';
import type { Doc, InstId } from '../domain/types';

function renderDoc(doc: Doc, playingId: string | null = null, extra: Partial<Parameters<typeof Paper>[0]> = {}) {
  const derived = derive(doc, DEFAULT_PREFS);
  return render(
    <Paper doc={doc} derived={derived} layout={layoutSheet(doc, derived)} playingId={playingId}
      onTitle={() => {}} onSubtitle={() => {}} {...extra} />,
  );
}

const setup = (id: InstId, patch: Partial<Doc> = {}) => renderDoc({ ...sampleDoc(id), ...patch });

describe('Paper', () => {
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

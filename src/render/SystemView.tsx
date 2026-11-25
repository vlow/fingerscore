import { Fragment, type ReactNode } from 'react';
import type { Derived, DerivedEvent } from '../domain/derive';
import { barCap } from '../domain/time';
import { notatedLength } from '../domain/triplets';
import type { Doc } from '../domain/types';
import { Glyph, TimeSigDigits } from './Glyph';
import { JumpMarks } from './JumpMarks';
import { HEADER, markDrop, SHEET, type BarLayout, type BeamGroup, type SheetLayout, type SystemLayout, type TupletMark } from './layout';
import { placeLyrics, type LyricItem } from './lyrics';
import { CHORD_FONT_PX, COLUMN_BOTTOM, FONT, NoteView, SelectedMarker, STEM, stemUp, yOfPos, type TextSpot } from './NoteView';
import styles from './Paper.module.css';
import { pillCentres } from './pillSpread';
import { beamGeometry, Tuplet, type Placed } from './TupletMark';
import { usePalette } from './palette';

const { staffTop, staffBottom } = SHEET;
const STAFF_H = staffBottom - staffTop + 1;
const DOT_YS = [90, 100];                       // repeat dots sit in the two middle spaces
export const SHARP_POS = [8, 5, 9, 6, 3, 7, 4];        // key-signature staff positions, prototype order
export const FLAT_POS = [4, 7, 3, 6, 2, 5, 1];

/** The slot under a chart: x is the chart's centre, pillX the centre of its pill (moved apart from the pills beside it). */
export type UnderChart = (ev: DerivedEvent, x: number, y: number, systemIndex: number, lastSystem: boolean, pillX: number) => ReactNode;

export interface TieSegment { x1: number; x2: number; y: number; below: boolean }

/** Right end of a system's staff: the end of its last bar. */
function systemEnd(s: SystemLayout): number {
  const last = s.bars[s.bars.length - 1];
  return last ? last.x + last.width : s.headerWidth;
}

/** Tie arcs per system; a tie into the next system is drawn as two halves (prototype geometry). */
export function tieSegments(d: Derived, layout: SheetLayout): TieSegment[][] {
  const placed = new Map<string, { x: number; y: number; system: SystemLayout }>();
  for (const system of layout.systems) for (const bar of system.bars) for (const e of bar.events) placed.set(e.id, { ...e, system });
  const out: TieSegment[][] = layout.systems.map(() => []);
  d.events.forEach((ev, i) => {
    const next = d.events[i + 1];
    if (!ev.tieTo || !next || next.rest) return;
    const a = placed.get(ev.id);
    const b = placed.get(next.id);
    if (!a || !b) return;
    const below = stemUp(ev);
    const yA = below ? a.y + 5 : a.y - 12;
    if (a.system === b.system) {
      out[a.system.index].push({ x1: a.x + 6, x2: a.x + 6 + Math.max(6, b.x - a.x - 12), y: yA, below });
      return;
    }
    out[a.system.index].push({ x1: a.x + 6, x2: a.x + 6 + Math.max(6, systemEnd(a.system) - a.x - 8), y: yA, below });
    const start = b.system.headerWidth - 4;
    out[b.system.index].push({ x1: start, x2: start + Math.max(6, b.x - b.system.headerWidth - 2), y: below ? b.y + 5 : b.y - 12, below });
  });
  return out;
}

function Tie(p: TieSegment) {
  const pal = usePalette();
  const rx = (p.x2 - p.x1) / 2;
  const d = p.below
    ? `M${p.x1} ${p.y + 2}A${rx} 5 0 0 0 ${p.x2} ${p.y + 2}`
    : `M${p.x1} ${p.y + 5}A${rx} 5 0 0 1 ${p.x2} ${p.y + 5}`;
  return <path data-tie="" d={d} fill="none" stroke={pal.ink} strokeWidth={1.5} />;
}

const barline = (ink: string) => (x: number, w: number) => <rect x={x} y={staffTop} width={w} height={STAFF_H} fill={ink} />;
const repeatDots = (ink: string) => (x: number) => DOT_YS.map(y => <circle key={y} cx={x} cy={y} r={2} fill={ink} />);

function Barlines(p: { bar: BarLayout; doc: Doc }) {
  const pal = usePalette();
  const line = barline(pal.ink);
  const dots = repeatDots(pal.ink);
  const b = p.doc.score[p.bar.bar];
  const x0 = p.bar.x;
  const x1 = x0 + p.bar.width;
  const last = p.bar.bar === p.doc.score.length - 1;
  // An ending over several bars: hook and label on its first bar only; open on the right where it continues.
  const voltaStarts = p.doc.score[p.bar.bar - 1]?.volta !== b.volta;
  const voltaEnd = p.doc.score[p.bar.bar + 1]?.volta === b.volta ? x1 : x0 + p.bar.width - 10;
  return (
    <>
      {b.rs && <g data-repeat="start">{line(x0 - 1, 4)}{line(x0 + 6, 1)}{dots(x0 + 12)}</g>}
      {b.re ? <g data-repeat="end">{dots(x1 - 13)}{line(x1 - 9, 1)}{line(x1 - 4, 4)}</g>
        : last ? <g data-final="">{line(x1 - 9, 1)}{line(x1 - 4, 4)}</g>
          : line(x1 - 1, 1)}
      {b.volta !== '' && (
        <g data-volta="">
          <path d={voltaStarts ? `M${x0 + 2.5} ${SHEET.voltaY + 14}V${SHEET.voltaY + 0.5}H${voltaEnd}` : `M${x0} ${SHEET.voltaY + 0.5}H${voltaEnd}`}
            fill="none" stroke={pal.ink} strokeWidth={1} />
          {voltaStarts && <text x={x0 + 7} y={SHEET.voltaY + 11} fontSize={11} fontWeight={700} fontFamily={FONT} fill={pal.ink}>{b.volta}.</text>}
        </g>
      )}
    </>
  );
}

/** Smallest hit area, so short notes stay an easy target. */
const MIN_HIT = 16;

/**
 * Click columns for one bar's events: each reaches halfway to its neighbours, the first and last
 * to the bar's edges, so the columns tile the bar without overlapping. A column narrower than
 * MIN_HIT is widened around the event.
 */
export function hitColumns(bar: BarLayout): { id: string; x: number; width: number }[] {
  const evs = bar.events;
  return evs.map((e, j) => {
    const left = j === 0 ? bar.x : (evs[j - 1].x + e.x) / 2;
    const right = j === evs.length - 1 ? bar.x + bar.width : (e.x + evs[j + 1].x) / 2;
    return right - left >= MIN_HIT ? { id: e.id, x: left, width: right - left } : { id: e.id, x: e.x - MIN_HIT / 2, width: MIN_HIT };
  });
}

const BEAM_ATTR = { 'data-beam': '' };

/** Horizontal beams over a group's stems; direction by the group's average staff position. */
function Beams(p: { group: BeamGroup; notes: Placed[] }) {
  const pal = usePalette();
  const { notes } = p;
  const { up, tip } = beamGeometry(notes);
  const sx = (n: Placed) => n.x + (up ? STEM.upDx : STEM.downDx);
  const level = (k: number) => (up ? tip + 6 * k : tip - 4 - 6 * k);
  const beam = (from: number, to: number, k: number, key: string, attr: object = BEAM_ATTR) => (
    <rect key={key} {...attr} x={from} y={level(k)} width={to - from} height={4} fill={pal.ink} />
  );
  const span = (i: number, j: number, k: number) => beam(sx(notes[i]), sx(notes[j]) + STEM.width, k, `${k}-${i}`);

  const second: JSX.Element[] = [];
  if (p.group.beams === 2) second.push(span(0, notes.length - 1, 1));
  if (p.group.beams === 'mixed') {
    // second beam over each run of sixteenths; a lone sixteenth gets a stub towards its neighbour
    let i = 0;
    while (i < notes.length) {
      if (notatedLength(notes[i].ev.d) !== 3) { i++; continue; }
      let j = i;
      while (j + 1 < notes.length && notatedLength(notes[j + 1].ev.d) === 3) j++;
      if (j > i) second.push(span(i, j, 1));
      else {
        const x = sx(notes[i]);
        const left = i === notes.length - 1;
        second.push(beam(left ? x - 8 : x, left ? x + STEM.width : x + 8, 1, `stub-${i}`, { 'data-beam-stub': '' }));
      }
      i = j + 1;
    }
  }
  return (
    <g data-beam-group={p.group.ids.join(' ')}>
      {notes.map(n => (
        <rect key={n.ev.id} data-stem="" x={sx(n)} y={up ? tip : n.y} width={STEM.width} height={Math.abs(n.y - tip)} fill={pal.ink} />
      ))}
      {span(0, notes.length - 1, 0)}
      {second}
    </g>
  );
}

export interface SystemViewProps {
  doc: Doc; derived: Derived; system: SystemLayout; beams: BeamGroup[][]; tuplets: TupletMark[][]; ties: TieSegment[];
  /** What to draw; defaults to doc.show (Paper widens it in Lyrics and Chords mode). */
  show?: Doc['show'];
  playingId: string | null; lastSystem: boolean; renderUnderChart?: UnderChart;
  selectedId: string | null; onSelect?(id: string | null): void;
  /** Play mode: no hit areas. */
  readOnly?: boolean;
}

/** One system: staff, header, bars, notes, beams, ties, and the slot under each chart. */
export function SystemView(p: SystemViewProps): JSX.Element {
  const pal = usePalette();
  const { doc, derived, system } = p;
  const show = p.show ?? doc.show;
  const end = systemEnd(system);
  const nAcc = Math.abs(derived.sig);
  const accPos = derived.sig > 0 ? SHARP_POS : FLAT_POS;
  const placed: Placed[] = system.bars.flatMap(bar => bar.events.map(e => ({ ev: derived.byId[e.id], x: e.x, y: e.y })));
  const byId = new Map(placed.map(n => [n.ev.id, n]));
  const groups = system.bars.flatMap(bar => p.beams[bar.bar] ?? []);
  const beamOf = new Map(groups.flatMap(g => g.ids.map(id => [id, g] as const)));
  const full = barCap(doc.timeSig);
  const fullBarRest = (bar: BarLayout) => {
    const evs = doc.score[bar.bar].ev;
    return evs.length === 1 && evs[0].r && evs[0].d === full && doc.score[bar.bar].cap === full;
  };
  const charted = (ev: DerivedEvent) => show.fingerings && !ev.rest && !ev.tiedFrom && ev.options.length > 0;
  const under = p.renderUnderChart;
  const band = (items: LyricItem[], fontPx?: number) =>
    new Map<string, TextSpot>(placeLyrics(items, 0, end, fontPx).map(({ id, ...spot }) => [id, spot]));
  const lyrics = band(show.lyrics ? placed.filter(n => !n.ev.rest && n.ev.lyric !== '').map(n => ({ id: n.ev.id, x: n.x, text: n.ev.lyric })) : []);
  const columns = system.bars.flatMap(hitColumns);
  const selectedColumn = columns.find(c => c.id === p.selectedId);
  const selectedPlaced = selectedColumn && byId.get(selectedColumn.id);
  const row = system.markRow;
  const height = system.height;
  const chords = band(show.chords ? placed.filter(n => n.ev.chord !== null).map(n => ({ id: n.ev.id, x: n.x, text: n.ev.chord! })) : [], CHORD_FONT_PX);

  // With a mark row the drawing of the system moves down as a whole, so every distance inside it stays as it was.
  const drawing = (
    <>
      {selectedColumn && selectedPlaced && <SelectedMarker x={selectedPlaced.x} columnWidth={selectedColumn.width} />}
      {[0, 1, 2, 3, 4].map(i => <rect key={i} x={0} y={staffTop + 10 * i} width={end} height={1} fill={pal.staff} />)}
      <Glyph name="trebleClef" x={HEADER.clefInset} y={staffBottom} />
      {Array.from({ length: nAcc }, (_, k) => (
        <Glyph key={k} name={derived.sig > 0 ? 'sharp' : 'flat'} x={HEADER.clef + k * HEADER.accidental} y={yOfPos(accPos[k])} />
      ))}
      {system.showTimeSig && <TimeSigDigits ts={doc.timeSig} x={HEADER.clef + nAcc * HEADER.accidental + HEADER.timeSig / 2} y={staffBottom} />}
      {system.barNumber !== null && (
        <text data-bar-number="" x={0} y={65} fontSize={11} fontFamily={FONT} fill={pal.muted}>{system.barNumber}</text>
      )}
      {barline(pal.ink)(0, 1)}
      {system.bars.map(bar => <g key={bar.bar} data-bar={bar.bar}><Barlines bar={bar} doc={doc} /></g>)}
      {system.bars.map(bar => bar.events.map(e => (
        <NoteView key={e.id} ev={derived.byId[e.id]} x={e.x} y={e.y} lyricAt={lyrics.get(e.id)} chordAt={chords.get(e.id)} inst={derived.inst} chartStyle={doc.chartStyle}
          show={show} playing={p.playingId === e.id} selected={p.selectedId === e.id}
          beamed={beamOf.has(e.id)} fullBarRest={fullBarRest(bar)} />
      )))}
      {groups.map(g => <Beams key={g.ids[0]} group={g} notes={g.ids.map(id => byId.get(id)!)} />)}
      {system.bars.map(bar => {
        const marks = p.tuplets[bar.bar] ?? [];
        const barIds = bar.events.map(e => e.id);
        return marks.map(m => (
          <Tuplet key={m.ids[0]} mark={m} byId={byId} beamOf={beamOf} marks={marks} barIds={barIds} volta={doc.score[m.bar].volta !== ''} />
        ));
      })}
      {p.ties.map((t, i) => <Tie key={i} {...t} />)}
      {!p.readOnly && columns.map(c => (
        <rect key={c.id} data-hit={c.id} className={styles.hit} x={c.x} y={SHEET.chordY} width={c.width} height={COLUMN_BOTTOM - SHEET.chordY}
          fill="transparent" onClick={() => p.onSelect?.(p.selectedId === c.id ? null : c.id)} />
      ))}
    </>
  );

  return (
    <div className={styles.system} style={row > 0 ? { height } : undefined}>
      <svg data-testid="system" width={SHEET.systemWidth} height={height}
        viewBox={`0 0 ${SHEET.systemWidth} ${height}`} aria-hidden="true">
        {row > 0 && <JumpMarks system={system} score={doc.score} drop={markDrop(derived.events, show)} />}
        {row > 0 ? <g transform={`translate(0 ${row})`}>{drawing}</g> : drawing}
      </svg>
      {under && (() => {
        const charts = placed.filter(n => charted(n.ev));
        const pillXs = pillCentres(charts.map(n => ({ id: n.ev.id, x: n.x, options: n.ev.options })), SHEET.systemWidth);
        return charts.map(n => (
          <Fragment key={n.ev.id}>{under(n.ev, n.x, SHEET.chartY + SHEET.altButtonDy + row, system.index, p.lastSystem, pillXs.get(n.ev.id) ?? n.x)}</Fragment>
        ));
      })()}
    </div>
  );
}

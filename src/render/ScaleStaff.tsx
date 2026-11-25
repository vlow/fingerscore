import { Fragment, type ReactNode } from 'react';
import type { FingeringOption, RecorderSystem } from '../domain/fingerings';
import { inst as instrument, type Instrument } from '../domain/instruments';
import { staffPos } from '../domain/keys';
import { scaleFingerings, type ScaleNote, type ScaleResult } from '../domain/scales';
import { TPQ } from '../domain/time';
import type { InstId } from '../domain/types';
import { FingeringChart, MissingChart } from './FingeringChart';
import { Glyph, glyphInk } from './Glyph';
import { HEADER, headerWidth, SHEET } from './layout';
import { TEXT_EM_PER_CHAR } from './lyrics';
import { ACCIDENTAL_GAP, FONT, LedgerLines, missingType, NoteHead, yOfPos } from './NoteView';
import styles from './ScaleStaff.module.css';
import { FLAT_POS, SHARP_POS } from './SystemView';
import { usePalette } from './palette';

export const NOTES_PER_LINE = 15;

const WHOLE = 4 * TPQ;                              // ticks of a whole note
const { systemWidth: WIDTH, staffTop, staffBottom } = SHEET;
const STAFF_H = staffBottom - staffTop + 1;
const CLEF_REACH = 20;                              // Bravura clef ink: about 14px above the top line, 18px below the bottom line
const HEAD_REACH = 6;                               // notehead half height plus stroke
const NAME_PX = 12;
const NAME_GAP = 16;                                // from the lowest ink to the name's baseline
const CHART_GAP = 10;
const CHART_H = 88;                                 // tallest chart (clarinet satellites) and the missing box
const LABEL_PX = 10;
const LABEL_LINE = 12;
const BLOCK_GAP = 12;
const BOTTOM_PAD = 16;
const PILL_SPACE = 24;                              // room under the chosen chart for the slot (the alternatives pill)

interface Placed { note: ScaleNote; index: number; options: FingeringOption[]; chosen: number | undefined; auto: number | undefined; overridden: boolean }

/** A note with two or more fingerings, as the chart slot sees it. */
export interface ScaleChartNote { index: number; name: string; options: FingeringOption[]; chosen: number; auto: number; overridden: boolean }
/**
 * Where the slot sits, in the coordinates of its line's box ([data-line-box]): x of the note, y just under the chosen
 * chart; line is the line index, lastLine whether it is the last.
 */
export interface ChartSlotPlace { x: number; y: number; line: number; lastLine: boolean }
export type ScaleChartSlot = (note: ScaleChartNote, at: ChartSlotPlace) => ReactNode;

/** Greedy word wrap of an option name into lines of at most `max` characters. */
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 1 + word.length <= max) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return lines;
}

function OptionName(p: { text: string; x: number; y: number; maxChars: number }) {
  const pal = usePalette();
  return (
    <text data-option-name="" x={p.x} y={p.y} textAnchor="middle" fontSize={LABEL_PX} fontFamily={FONT} fill={pal.text}>
      {wrap(p.text, p.maxChars).map((l, i) => <tspan key={i} x={p.x} dy={i === 0 ? 0 : LABEL_LINE}>{l}</tspan>)}
    </text>
  );
}

interface LineProps {
  notes: Placed[]; sig: number; last: boolean; kind: Instrument['kind']; chartStyle: 'compact' | 'full';
  showNames: boolean; showAlternates: boolean; line: number; renderUnderChart?: ScaleChartSlot;
}

/** Where everything of one scale line sits, in the line's own coordinates; `height` is the line's drawn height in units. */
function layoutLine(p: LineProps) {
  const header = headerWidth(p.sig, false);
  const step = (WIDTH - header) / NOTES_PER_LINE;
  const end = p.last ? header + step * p.notes.length : WIDTH;
  const xOf = (k: number) => header + step * (k + 0.5);
  const ys = p.notes.map(n => yOfPos(staffPos(n.note.spelled)));
  const top = Math.floor(Math.min(staffTop - CLEF_REACH, ...ys.map(y => y - HEAD_REACH - 4)));
  const below = Math.max(staffBottom + CLEF_REACH, ...ys.map(y => y + HEAD_REACH));
  const nameY = below + NAME_GAP;
  const chartY = (p.showNames ? nameY : below) + CHART_GAP;
  const maxChars = Math.max(4, Math.floor((step - 4) / (LABEL_PX * TEXT_EM_PER_CHAR)));
  const labelH = (text: string) => wrap(text, maxChars).length * LABEL_LINE;
  const pillSpace = p.renderUnderChart ? PILL_SPACE : 0;

  // Stack under each note: the chosen chart first, then (when shown) every further option.
  const stacks = p.notes.map(n => {
    if (n.chosen === undefined) return { blocks: [], bottom: chartY + CHART_H };
    const order = p.showAlternates ? [n.chosen, ...n.options.map((_, j) => j).filter(j => j !== n.chosen)] : [n.chosen];
    let y = chartY;
    const blocks = order.map((j, i) => {
      const room = i === 0 ? pillSpace : 0;
      const block = { option: j, y, labelY: y + CHART_H + room + LABEL_LINE };
      y += CHART_H + room + (p.showAlternates ? labelH(n.options[j].n) + 4 : 0) + BLOCK_GAP;
      return block;
    });
    return { blocks, bottom: y - BLOCK_GAP };
  });
  const bottom = Math.max(...stacks.map(s => s.bottom)) + BOTTOM_PAD;
  return { header, step, end, xOf, ys, top, nameY, chartY, maxChars, stacks, height: bottom - top };
}

/** One scale line: clef, key signature, up to 15 whole notes, and under each its name and fingering stack. */
function ScaleLine(p: LineProps) {
  const pal = usePalette();
  const { end, xOf, ys, top, nameY, chartY, maxChars, stacks, height } = layoutLine(p);
  const nAcc = Math.abs(p.sig);
  const sigPos = p.sig > 0 ? SHARP_POS : FLAT_POS;

  const slot = p.renderUnderChart;
  return (
    <div className={styles.lineBox} data-line-box="" style={{ width: WIDTH, height }}>
      <p className={styles.srOnly}>{p.notes.map(n => n.note.spelled.name + (n.note.state === 'ext' ? ' (extended)' : '')).join(', ')}</p>
      <svg data-testid="scale-line" aria-hidden="true" className={styles.line}
        width={WIDTH} height={height} viewBox={`0 ${top} ${WIDTH} ${height}`}>
        {[0, 1, 2, 3, 4].map(i => <rect key={i} x={0} y={staffTop + 10 * i} width={end} height={1} fill={pal.staff} />)}
        <rect x={0} y={staffTop} width={1} height={STAFF_H} fill={pal.ink} />
        <g data-clef=""><Glyph name="trebleClef" x={HEADER.clefInset} y={staffBottom} /></g>
        <g data-keysig="">
          {Array.from({ length: nAcc }, (_, k) => (
            <g key={k} data-acc={p.sig > 0 ? 'sharp' : 'flat'}>
              <Glyph name={p.sig > 0 ? 'sharp' : 'flat'} x={HEADER.clef + k * HEADER.accidental} y={yOfPos(sigPos[k])} />
            </g>
          ))}
        </g>
        {p.notes.map((n, k) => {
          const x = xOf(k);
          const y = ys[k];
          const ext = n.note.state === 'ext';
          const color = ext ? pal.warning : pal.ink;
          const acc = n.note.accidental;
          return (
            <g key={n.index} data-note="" data-state={n.note.state}>
              <LedgerLines pos={staffPos(n.note.spelled)} x={x} />
              <NoteHead d={WHOLE} x={x} y={y} color={color} />
              {acc && <g data-acc={acc}><Glyph name={acc} x={x - ACCIDENTAL_GAP - glyphInk(acc).right} y={y} fill={color} /></g>}
              {p.showNames && (
                <text data-name="" x={x} y={nameY} textAnchor="middle" fontSize={NAME_PX} fontWeight={700} fontFamily={FONT}
                  fill={ext ? pal.warning : pal.text}>{n.note.spelled.name}</text>
              )}
              {n.chosen === undefined
                ? <MissingChart type={missingType(n.note, p.kind)} x={x} y={chartY} />
                : stacks[k].blocks.map((b, i) => (
                  <g key={b.option} {...(i === 0 ? { 'data-chart': '' } : { 'data-alt': '' })} data-option={b.option}
                    {...(i === 0 && n.overridden ? { 'data-overridden': 'true' } : {})}>
                    <FingeringChart kind={p.kind} option={n.options[b.option]} style={p.chartStyle} x={x} y={b.y} />
                    {p.showAlternates && <OptionName text={n.options[b.option].n} x={x} y={b.labelY} maxChars={maxChars} />}
                  </g>
                ))}
            </g>
          );
        })}
        {p.last && (
          <g data-end="">
            <rect x={end - 5} y={staffTop} width={1} height={STAFF_H} fill={pal.ink} />
            <rect x={end - 1} y={staffTop} width={1} height={STAFF_H} fill={pal.ink} />
          </g>
        )}
      </svg>
      {slot && p.notes.map((n, k) => n.options.length >= 2 && n.chosen !== undefined && n.auto !== undefined && (
        <Fragment key={n.index}>
          {slot(
            { index: n.index, name: n.note.spelled.name, options: n.options, chosen: n.chosen, auto: n.auto, overridden: n.overridden },
            { x: xOf(k), y: chartY + CHART_H + 4 - top, line: p.line, lastLine: p.last },
          )}
        </Fragment>
      ))}
    </div>
  );
}

export interface ScaleStaffProps {
  inst: InstId; scale: ScaleResult; chartStyle: 'compact' | 'full'; recorderSystem: RecorderSystem; showNames: boolean; showAlternates: boolean;
  /** The player's picks: note index → option index; invalid entries are ignored. */
  overrides?: Record<number, number>;
  /** HTML under each chart whose note has two or more fingerings (the alternatives pill); positioned in line coordinates. */
  renderUnderChart?: ScaleChartSlot;
}

/** The lines of a scale in order, each with its drawn height in units and a function that renders it; the page and the PDF both use these. */
export function scaleLines(p: ScaleStaffProps): { height: number; render(): JSX.Element }[] {
  const kind = instrument(p.inst).kind;
  // The sheet's chooser over the whole sequence, the picks as fixed points; a note without options breaks the run.
  const fingerings = scaleFingerings(p.inst, p.scale.notes, p.recorderSystem, p.overrides ?? {});
  const placed: Placed[] = p.scale.notes.map((note, index) => ({ note, index, ...fingerings[index] }));
  const lines: { height: number; render(): JSX.Element }[] = [];
  for (let i = 0; i < placed.length; i += NOTES_PER_LINE) {
    const line = lines.length;
    const props: LineProps = {
      notes: placed.slice(i, i + NOTES_PER_LINE), sig: p.scale.sig, last: i + NOTES_PER_LINE >= placed.length, kind, chartStyle: p.chartStyle,
      showNames: p.showNames, showAlternates: p.showAlternates, line, renderUnderChart: p.renderUnderChart,
    };
    lines.push({ height: layoutLine(props).height, render: () => <ScaleLine {...props} /> });
  }
  return lines;
}

/** A scale as lines of whole notes, each with its name and fingering chart (design 4.3, 4.4 "Notation"). */
export function ScaleStaff(p: ScaleStaffProps): JSX.Element {
  return (
    <div className={styles.staff}>
      {scaleLines(p).map((line, i) => <Fragment key={i}>{line.render()}</Fragment>)}
    </div>
  );
}

import { chooseFingerings } from '../domain/chooser';
import { optionsFor, type FingeringOption, type RecorderSystem } from '../domain/fingerings';
import { inst as instrument, type Instrument } from '../domain/instruments';
import { staffPos } from '../domain/keys';
import type { ScaleNote, ScaleResult } from '../domain/scales';
import type { InstId } from '../domain/types';
import { FingeringChart, MissingChart } from './FingeringChart';
import { Glyph, glyphInk } from './Glyph';
import { HEADER, headerWidth, SHEET } from './layout';
import { TEXT_EM_PER_CHAR } from './lyrics';
import { ACCIDENTAL_GAP, FONT, INK, LedgerLines, missingType, NoteHead, WARN, yOfPos } from './NoteView';
import styles from './ScaleStaff.module.css';
import { FLAT_POS, SHARP_POS, STAFF } from './SystemView';

export const NOTES_PER_LINE = 15;

const WHOLE = 48;                                   // ticks of a whole note
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
const TEXT_COLOR = '#2A2D33';

interface Placed { note: ScaleNote; index: number; options: FingeringOption[]; chosen: number | undefined }

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
  return (
    <text data-option-name="" x={p.x} y={p.y} textAnchor="middle" fontSize={LABEL_PX} fontFamily={FONT} fill={TEXT_COLOR}>
      {wrap(p.text, p.maxChars).map((l, i) => <tspan key={i} x={p.x} dy={i === 0 ? 0 : LABEL_LINE}>{l}</tspan>)}
    </text>
  );
}

interface LineProps {
  notes: Placed[]; sig: number; last: boolean; kind: Instrument['kind']; chartStyle: 'compact' | 'full';
  showNames: boolean; showAlternates: boolean;
}

/** One scale line: clef, key signature, up to 15 whole notes, and under each its name and fingering stack. */
function ScaleLine(p: LineProps) {
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

  // Stack under each note: the chosen chart first, then (when shown) every further option.
  const stacks = p.notes.map(n => {
    if (n.chosen === undefined) return { blocks: [], bottom: chartY + CHART_H };
    const order = p.showAlternates ? [n.chosen, ...n.options.map((_, j) => j).filter(j => j !== n.chosen)] : [n.chosen];
    let y = chartY;
    const blocks = order.map(j => {
      const block = { option: j, y, labelY: y + CHART_H + LABEL_LINE };
      y += CHART_H + (p.showAlternates ? labelH(n.options[j].n) + 4 : 0) + BLOCK_GAP;
      return block;
    });
    return { blocks, bottom: y - BLOCK_GAP };
  });
  const bottom = Math.max(...stacks.map(s => s.bottom)) + BOTTOM_PAD;
  const height = bottom - top;
  const nAcc = Math.abs(p.sig);
  const sigPos = p.sig > 0 ? SHARP_POS : FLAT_POS;

  return (
    <>
      <p className={styles.srOnly}>{p.notes.map(n => n.note.spelled.name).join(', ')}</p>
      <svg data-testid="scale-line" aria-hidden="true" className={styles.line}
        width={WIDTH} height={height} viewBox={`0 ${top} ${WIDTH} ${height}`}>
        {[0, 1, 2, 3, 4].map(i => <rect key={i} x={0} y={staffTop + 10 * i} width={end} height={1} fill={STAFF} />)}
        <rect x={0} y={staffTop} width={1} height={STAFF_H} fill={INK} />
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
          const color = ext ? WARN : INK;
          const acc = n.note.accidental;
          return (
            <g key={n.index} data-note="" data-state={n.note.state}>
              <LedgerLines pos={staffPos(n.note.spelled)} x={x} />
              <NoteHead d={WHOLE} x={x} y={y} color={color} />
              {acc && <g data-acc={acc}><Glyph name={acc} x={x - ACCIDENTAL_GAP - glyphInk(acc).right} y={y} fill={color} /></g>}
              {p.showNames && (
                <text data-name="" x={x} y={nameY} textAnchor="middle" fontSize={NAME_PX} fontWeight={700} fontFamily={FONT}
                  fill={ext ? WARN : TEXT_COLOR}>{n.note.spelled.name}</text>
              )}
              {n.chosen === undefined
                ? <MissingChart type={missingType(n.note, p.kind)} x={x} y={chartY} />
                : stacks[k].blocks.map((b, i) => (
                  <g key={b.option} {...(i === 0 ? { 'data-chart': '' } : { 'data-alt': '' })} data-option={b.option}>
                    <FingeringChart kind={p.kind} option={n.options[b.option]} style={p.chartStyle} x={x} y={b.y} />
                    {p.showAlternates && <OptionName text={n.options[b.option].n} x={x} y={b.labelY} maxChars={maxChars} />}
                  </g>
                ))}
            </g>
          );
        })}
        {p.last && (
          <g data-end="">
            <rect x={end - 5} y={staffTop} width={1} height={STAFF_H} fill={INK} />
            <rect x={end - 1} y={staffTop} width={1} height={STAFF_H} fill={INK} />
          </g>
        )}
      </svg>
    </>
  );
}

/** A scale as lines of whole notes, each with its name and fingering chart (design 4.3, 4.4 "Notation"). */
export function ScaleStaff(p: {
  inst: InstId; scale: ScaleResult; chartStyle: 'compact' | 'full'; recorderSystem: RecorderSystem; showNames: boolean; showAlternates: boolean;
}): JSX.Element {
  const kind = instrument(p.inst).kind;
  const options = p.scale.notes.map(n => optionsFor(p.inst, n.written, p.recorderSystem));
  // The sheet's chooser over the whole sequence; a note without options breaks the run.
  const chosen = chooseFingerings(p.scale.notes.map((n, i) => ({ id: String(i), written: n.written, options: options[i] })), {});
  const placed: Placed[] = p.scale.notes.map((note, index) => ({ note, index, options: options[index], chosen: chosen[String(index)] }));
  const lines: Placed[][] = [];
  for (let i = 0; i < placed.length; i += NOTES_PER_LINE) lines.push(placed.slice(i, i + NOTES_PER_LINE));
  return (
    <div className={styles.staff}>
      {lines.map((notes, i) => (
        <ScaleLine key={i} notes={notes} sig={p.scale.sig} last={i === lines.length - 1} kind={kind} chartStyle={p.chartStyle}
          showNames={p.showNames} showAlternates={p.showAlternates} />
      ))}
    </div>
  );
}

import { chordParts } from '../domain/chords';
import type { DerivedEvent } from '../domain/derive';
import type { Instrument } from '../domain/instruments';
import type { Doc } from '../domain/types';
import { FingeringChart, MissingChart } from './FingeringChart';
import { Glyph, type GlyphName } from './Glyph';
import { SHEET } from './layout';
import { LYRIC_FONT_PX, TEXT_EM_PER_CHAR } from './lyrics';

export const INK = '#15171C';
const BAD = '#B91C1C';
const WARN = '#B45309';
const TEAL = '#0E6E68';
const TEXT = '#2A2D33';
export const CHORD_FONT_PX = 13;
export const FONT = "'Atkinson Hyperlegible', system-ui, sans-serif";

/** Stem geometry from the prototype: 1.4px wide, 33px long, right of the head going up, left going down. */
export const STEM = { width: 1.4, length: 33, upDx: 4.6, downDx: -6 } as const;

/** Staff y of a staff position (0 = bottom line). */
export const yOfPos = (pos: number) => SHEET.staffBottom - 5 * pos;

export const stemUp = (ev: DerivedEvent) => ev.pos < 4;

const CLARINET_ALTISSIMO = 84; // written C6

/** Which dashed box replaces a missing chart. */
export function missingType(ev: DerivedEvent, kind: Instrument['kind']): 'bad' | 'ext' | 'alt' {
  if (ev.state === 'bad') return 'bad';
  return kind === 'cl' && ev.written > CLARINET_ALTISSIMO ? 'alt' : 'ext';
}

const DOTTED = new Set([9, 18, 36]);

/** Rest glyph for a duration; a rest filling a whole full bar is a whole rest. */
function restGlyph(d: number, fullBar: boolean): { name: GlyphName; dotted: boolean } {
  if (fullBar) return { name: 'restWhole', dotted: false };
  const base: Record<number, GlyphName> = { 3: 'restSixteenth', 6: 'restEighth', 12: 'restQuarter', 24: 'restHalf', 48: 'restWhole' };
  const dotted = DOTTED.has(d);
  return { name: base[dotted ? (d * 2) / 3 : d], dotted };
}

function noteColor(ev: DerivedEvent): string {
  return ev.state === 'bad' ? BAD : ev.state === 'ext' ? WARN : INK;
}

/** Ellipse rotated −22°: filled up to a dotted quarter, open from a half, the whole note larger. */
function NoteHead(p: { ev: DerivedEvent; x: number; y: number; color: string }) {
  const whole = p.ev.d === 48;
  const open = p.ev.d >= 24;
  const [rx, ry] = whole ? [7, 5] : [6, 4.5];
  const rotate = `rotate(-22 ${p.x} ${p.y})`;
  return open
    ? <ellipse data-head="open" cx={p.x} cy={p.y} rx={rx - 1} ry={ry - 1} transform={rotate} fill="none" stroke={p.color} strokeWidth={2} />
    : <ellipse data-head="filled" cx={p.x} cy={p.y} rx={rx} ry={ry} transform={rotate} fill={p.color} />;
}

function LedgerLines(p: { pos: number; x: number }) {
  const lines: number[] = [];
  for (let q = -2; q >= p.pos; q -= 2) lines.push(q);
  for (let q = 10; q <= p.pos; q += 2) lines.push(q);
  return <>{lines.map(q => <rect key={q} data-ledger="" x={p.x - 10} y={yOfPos(q)} width={20} height={1.3} fill={INK} />)}</>;
}

/** Flags hang from the stem tip: one for an eighth (plain or dotted), two for a sixteenth. */
function Flags(p: { count: number; x: number; y: number; up: boolean }) {
  const flags = Array.from({ length: p.count }, (_, i) => {
    if (p.up) {
      const t = p.y - STEM.length + i * 7;
      return `M${p.x + 5} ${t + 1}A7 7 0 0 1 ${p.x + 12} ${t + 8}V${t + 15}`;
    }
    const b = p.y + STEM.length - i * 7;
    return `M${p.x - 5.5} ${b - 1}A7 7 0 0 0 ${p.x + 1.5} ${b - 8}V${b - 15}`;
  });
  return <>{flags.map(d => <path key={d} data-flag="" d={d} fill="none" stroke={INK} strokeWidth={2} />)}</>;
}

function Dot(p: { x: number; y: number }) {
  return <circle data-dot="" cx={p.x} cy={p.y} r={2} fill={INK} />;
}

/** Wavy underline of the given width under a chord we cannot read. */
function wavy(x: number, y: number, width: number): string {
  const half = Math.max(8, width / 2);
  let d = `M${x - half} ${y}`;
  for (let i = 0; i < Math.ceil((2 * half) / 4); i++) d += 'q1 -1.5 2 0q1 1.5 2 0';
  return d;
}

function Chord(p: { text: string; ok: boolean; x: number; textLength?: number; raise: boolean }) {
  const y = SHEET.chordY + 13;
  const common = {
    x: p.x, y, textAnchor: 'middle' as const, fontSize: CHORD_FONT_PX, fontWeight: 700, fontFamily: FONT,
    ...(p.textLength === undefined ? {} : { textLength: p.textLength, lengthAdjust: 'spacingAndGlyphs' as const }),
  };
  if (!p.ok) {
    return (
      <g data-chord="bad">
        <text {...common} fill={BAD}>{p.text}</text>
        <path d={wavy(p.x, y + 3, p.textLength ?? p.text.length * TEXT_EM_PER_CHAR * CHORD_FONT_PX)} fill="none" stroke={BAD} strokeWidth={1} />
      </g>
    );
  }
  const c = chordParts(p.text);
  const raised = p.raise && c.ext !== '';
  return (
    <g data-chord="ok">
      <text {...common} fill={TEAL}>
        {c.root}{c.quality}
        {c.ext !== '' && <tspan data-ext="" dy={raised ? -6 : undefined} dx={raised ? 1 : undefined} fontSize={raised ? 9 : undefined}>{c.ext}</tspan>}
        {c.bass !== null && <tspan dy={raised ? 6 : undefined}>/{c.bass}</tspan>}
      </text>
    </g>
  );
}

/** Where the band placement put a lyric or chord: centre x and, when condensed, its textLength. */
export interface TextSpot { x: number; textLength?: number }

export interface NoteViewProps {
  ev: DerivedEvent; x: number; y: number; lyricAt?: TextSpot; chordAt?: TextSpot;
  inst: Instrument; chartStyle: Doc['chartStyle']; show: Doc['show'];
  playing: boolean; beamed: boolean; fullBarRest: boolean;
}

/** One event: highlight, chord, lyric, note or rest with its marks, and its fingering chart. */
export function NoteView(p: NoteViewProps): JSX.Element {
  const { ev, x, show } = p;
  return (
    <g data-ev={ev.id} data-state={ev.state} data-tied={ev.tiedFrom ? '' : undefined} data-playing={p.playing ? 'true' : undefined}>
      {p.playing && <rect x={x - 12} y={0} width={24} height={150} rx={6} fill="rgba(14,110,104,0.14)" />}
      {show.chords && ev.chord !== null && (
        <Chord text={ev.chord} ok={ev.chordOk} x={p.chordAt?.x ?? x} textLength={p.chordAt?.textLength} raise={show.raiseExtensions} />
      )}
      {show.lyrics && !ev.rest && ev.lyric !== '' && (
        <text data-lyric="" x={p.lyricAt?.x ?? x} y={SHEET.lyricY + 12} textAnchor="middle" fontSize={LYRIC_FONT_PX} fontFamily={FONT} fill={TEXT}
          {...(p.lyricAt?.textLength === undefined ? {} : { textLength: p.lyricAt.textLength, lengthAdjust: 'spacingAndGlyphs' })}>
          {ev.lyric}
        </text>
      )}
      {ev.rest ? <Rest ev={ev} x={x} fullBar={p.fullBarRest} /> : <Note {...p} />}
      {show.fingerings && !ev.rest && !ev.tiedFrom && (
        ev.options.length > 0
          ? <g data-chart=""><FingeringChart kind={p.inst.kind} option={ev.options[ev.chosen ?? 0]} style={p.chartStyle} x={x} y={SHEET.chartY} /></g>
          : <MissingChart type={missingType(ev, p.inst.kind)} x={x} y={SHEET.chartY} />
      )}
    </g>
  );
}

function Rest(p: { ev: DerivedEvent; x: number; fullBar: boolean }) {
  const { name, dotted } = restGlyph(p.ev.d, p.fullBar);
  return (
    <g data-rest={name}>
      <Glyph name={name} x={p.x - 8} y={SHEET.staffBottom} />
      {dotted && <Dot x={p.x + 12} y={90} />}
    </g>
  );
}

function Note(p: NoteViewProps) {
  const { ev, x, y } = p;
  const color = noteColor(ev);
  const up = stemUp(ev);
  const flags = p.beamed ? 0 : ev.d === 3 ? 2 : ev.d === 6 || ev.d === 9 ? 1 : 0;
  return (
    <>
      <LedgerLines pos={ev.pos} x={x} />
      <NoteHead ev={ev} x={x} y={y} color={color} />
      {ev.d < 48 && !p.beamed && (
        <rect data-stem="" x={x + (up ? STEM.upDx : STEM.downDx)} y={up ? y - STEM.length : y} width={STEM.width} height={STEM.length} fill={INK} />
      )}
      {flags > 0 && <Flags count={flags} x={x} y={y} up={up} />}
      {DOTTED.has(ev.d) && <Dot x={x + 12} y={ev.pos % 2 === 0 ? y - 5 : y} />}
      {ev.accidental && <Glyph name={ev.accidental} x={x - 19} y={y} fill={color} />}
    </>
  );
}

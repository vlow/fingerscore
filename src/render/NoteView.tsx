import { chordParts } from '../domain/chords';
import type { DerivedEvent } from '../domain/derive';
import type { Instrument } from '../domain/instruments';
import type { Doc } from '../domain/types';
import { FingeringChart, MissingChart } from './FingeringChart';
import { Glyph, glyphInk, type GlyphName } from './Glyph';
import { notatedLength } from '../domain/triplets';
import { SHEET } from './layout';
import { LYRIC_FONT_PX, TEXT_EM_PER_CHAR } from './lyrics';
import { usePalette, type Palette } from './palette';


/** Bottom of an event's column: just below the fingering chart, above the alternate-fingering pill. */
export const COLUMN_BOTTOM = SHEET.chartY + 88;
/** Widest the selected-column marker gets; narrower when the event's hit area is narrower. */
const MARKER_MAX = 30;

/**
 * The selected event's column: light teal with a teal outline. SystemView draws it beneath the
 * staff so staff lines and glyphs stay visible; the playing highlight is drawn above it.
 */
export function SelectedMarker(p: { x: number; columnWidth: number }): JSX.Element {
  const pal = usePalette();
  const w = Math.min(MARKER_MAX, p.columnWidth);
  return <rect data-mark="selected" x={p.x - w / 2} y={0.75} width={w} height={COLUMN_BOTTOM - 0.75} rx={6}
    fill={pal.selection} stroke={pal.chord} strokeWidth={1.5} />;
}
export const CHORD_FONT_PX = 13;
export const FONT = "'Atkinson Hyperlegible', system-ui, sans-serif";

/** Stem geometry from the prototype: 1.4px wide, 33px long, right of the head going up, left going down. */
export const STEM = { width: 1.4, length: 33, upDx: 4.6, downDx: -6 } as const;

/** Staff y of a staff position (0 = bottom line). */
export const yOfPos = (pos: number) => SHEET.staffBottom - 5 * pos;

export const stemUp = (ev: DerivedEvent) => ev.pos < 4;

const CLARINET_ALTISSIMO = 84; // written C6

/** Which dashed box replaces a missing chart. */
export function missingType(ev: Pick<DerivedEvent, 'state' | 'written'>, kind: Instrument['kind']): 'bad' | 'ext' | 'alt' {
  if (ev.state === 'bad') return 'bad';
  return kind === 'cl' && ev.written > CLARINET_ALTISSIMO ? 'alt' : 'ext';
}

const DOTTED = new Set([9, 18, 36]);

/** Rest glyph for a duration as written (a triplet member passes its notated value); a rest filling a whole full bar is a whole rest. */
function restGlyph(d: number, fullBar: boolean): { name: GlyphName; dotted: boolean } {
  if (fullBar) return { name: 'restWhole', dotted: false };
  const base: Record<number, GlyphName> = { 3: 'restSixteenth', 6: 'restEighth', 12: 'restQuarter', 24: 'restHalf', 48: 'restWhole' };
  const dotted = DOTTED.has(d);
  return { name: base[dotted ? (d * 2) / 3 : d], dotted };
}

function noteColor(ev: DerivedEvent, pal: Palette): string {
  return ev.state === 'bad' ? pal.error : ev.state === 'ext' ? pal.warning : pal.ink;
}

/** Ellipse rotated −22°: filled up to a dotted quarter, open from a half, the whole note larger. d = duration in ticks (48 = whole). */
export function NoteHead(p: { d: number; x: number; y: number; color: string }) {
  const whole = p.d === 48;
  const open = p.d >= 24;
  const [rx, ry] = whole ? [7, 5] : [6, 4.5];
  const rotate = `rotate(-22 ${p.x} ${p.y})`;
  return open
    ? <ellipse data-head="open" cx={p.x} cy={p.y} rx={rx - 1} ry={ry - 1} transform={rotate} fill="none" stroke={p.color} strokeWidth={2} />
    : <ellipse data-head="filled" cx={p.x} cy={p.y} rx={rx} ry={ry} transform={rotate} fill={p.color} />;
}

export function LedgerLines(p: { pos: number; x: number }) {
  const pal = usePalette();
  const lines: number[] = [];
  for (let q = -2; q >= p.pos; q -= 2) lines.push(q);
  for (let q = 10; q <= p.pos; q += 2) lines.push(q);
  return <>{lines.map(q => <rect key={q} data-ledger="" x={p.x - 10} y={yOfPos(q)} width={20} height={1.3} fill={pal.ink} />)}</>;
}

/** Flags hang from the stem tip: one for an eighth (plain or dotted), two for a sixteenth. */
function Flags(p: { count: number; x: number; y: number; up: boolean }) {
  const pal = usePalette();
  const flags = Array.from({ length: p.count }, (_, i) => {
    if (p.up) {
      const t = p.y - STEM.length + i * 7;
      return `M${p.x + 5} ${t + 1}A7 7 0 0 1 ${p.x + 12} ${t + 8}V${t + 15}`;
    }
    const b = p.y + STEM.length - i * 7;
    return `M${p.x - 5.5} ${b - 1}A7 7 0 0 0 ${p.x + 1.5} ${b - 8}V${b - 15}`;
  });
  return <>{flags.map(d => <path key={d} data-flag="" d={d} fill="none" stroke={pal.ink} strokeWidth={2} />)}</>;
}

function Dot(p: { x: number; y: number }) {
  const pal = usePalette();
  return <circle data-dot="" cx={p.x} cy={p.y} r={2} fill={pal.ink} />;
}

/** Wavy underline of the given width under a chord we cannot read. */
function wavy(x: number, y: number, width: number): string {
  const half = Math.max(8, width / 2);
  let d = `M${x - half} ${y}`;
  for (let i = 0; i < Math.ceil((2 * half) / 4); i++) d += 'q1 -1.5 2 0q1 1.5 2 0';
  return d;
}

function Chord(p: { text: string; ok: boolean; x: number; textLength?: number; raise: boolean }) {
  const pal = usePalette();
  const y = SHEET.chordY + 13;
  const common = {
    x: p.x, y, textAnchor: 'middle' as const, fontSize: CHORD_FONT_PX, fontWeight: 700, fontFamily: FONT,
    ...(p.textLength === undefined ? {} : { textLength: p.textLength, lengthAdjust: 'spacingAndGlyphs' as const }),
  };
  if (!p.ok) {
    return (
      <g data-chord="bad">
        <text {...common} fill={pal.error}>{p.text}</text>
        <path d={wavy(p.x, y + 3, p.textLength ?? p.text.length * TEXT_EM_PER_CHAR * CHORD_FONT_PX)} fill="none" stroke={pal.error} strokeWidth={1} />
      </g>
    );
  }
  const c = chordParts(p.text);
  const raised = p.raise && c.ext !== '';
  return (
    <g data-chord="ok">
      <text {...common} fill={pal.chord}>
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
  playing: boolean; selected: boolean; beamed: boolean; fullBarRest: boolean;
}

/** One event: highlight, chord, lyric, note or rest with its marks, and its fingering chart. */
export function NoteView(p: NoteViewProps): JSX.Element {
  const pal = usePalette();
  const { ev, x, show } = p;
  return (
    <g data-ev={ev.id} data-state={ev.state} data-tied={ev.tiedFrom ? '' : undefined}
      data-playing={p.playing ? 'true' : undefined} data-selected={p.selected ? 'true' : undefined}>
      {p.playing && <rect data-mark="playing" x={x - 12} y={0} width={24} height={150} rx={6} fill={pal.playing} />}
      {show.chords && ev.chord !== null && (
        <Chord text={ev.chord} ok={ev.chordOk} x={p.chordAt?.x ?? x} textLength={p.chordAt?.textLength} raise={show.raiseExtensions} />
      )}
      {show.lyrics && !ev.rest && ev.lyric !== '' && (
        <text data-lyric="" x={p.lyricAt?.x ?? x} y={SHEET.lyricY + 12} textAnchor="middle" fontSize={LYRIC_FONT_PX} fontFamily={FONT} fill={pal.lyric}
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

/** Right ink edge of an accidental sits this far left of the notehead centre. */
export const ACCIDENTAL_GAP = 9;

function Rest(p: { ev: DerivedEvent; x: number; fullBar: boolean }) {
  const { name, dotted } = restGlyph(notatedLength(p.ev.d), p.fullBar);
  const ink = glyphInk(name);
  return (
    <g data-rest={name}>
      <Glyph name={name} x={p.x - (ink.left + ink.right) / 2} y={SHEET.staffBottom} />
      {dotted && <Dot x={p.x + 12} y={90} />}
    </g>
  );
}

function Note(p: NoteViewProps) {
  const pal = usePalette();
  const { ev, x, y } = p;
  const color = noteColor(ev, pal);
  const up = stemUp(ev);
  const d = notatedLength(ev.d);   // a triplet member is drawn as its notated value
  const flags = p.beamed ? 0 : d === 3 ? 2 : d === 6 || d === 9 ? 1 : 0;
  return (
    <>
      <LedgerLines pos={ev.pos} x={x} />
      <NoteHead d={d} x={x} y={y} color={color} />
      {d < 48 && !p.beamed && (
        <rect data-stem="" x={x + (up ? STEM.upDx : STEM.downDx)} y={up ? y - STEM.length : y} width={STEM.width} height={STEM.length} fill={pal.ink} />
      )}
      {flags > 0 && <Flags count={flags} x={x} y={y} up={up} />}
      {DOTTED.has(d) && <Dot x={x + 12} y={ev.pos % 2 === 0 ? y - 5 : y} />}
      {ev.accidental && <Glyph name={ev.accidental} x={x - ACCIDENTAL_GAP - glyphInk(ev.accidental).right} y={y} fill={color} />}
    </>
  );
}

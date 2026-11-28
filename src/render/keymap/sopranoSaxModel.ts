import {
  UP, around, bandEdges, lerp, line, rod, rounded, upright, uprightFrame, type InstrumentModel, type ModelKey, type Pad,
} from './model';
import { v3 } from './project';
import { SAX_KEY_SPECS } from './saxModel';

/**
 * Straight soprano saxophone in B♭. It shares the saxophone chart, so it has the same keys in the same places around
 * the body as the alto, at depths scaled to its shorter body. Depth s runs down from the neck socket: a straight body
 * of 42 cm widening from 19 to 42 mm, then a bell flaring to 100 mm that opens downwards. A short straight neck and the
 * mouthpiece continue the body upwards.
 *
 * Views: with no bent bell in the way, from the front and a little from the right the pearls, side and right-pinky
 * keys show; from behind and a little from the left, the octave, palm and left-pinky keys and the thumb rests.
 */

const SCALE = 0.78;
const BODY_END = 420;
const BELL_END = 560;
const NECK_TOP = 62;
const MOUTH_LENGTH = 72;

const radius = (s: number): number => {
  if (s < 0) return lerp(9.5, 8.5, -s / NECK_TOP); // neck
  if (s <= BODY_END) return 9.5 + (11.5 * s) / BODY_END;
  return 21 + 29 * ((s - BODY_END) / (BELL_END - BODY_END)) ** 2.4; // bell
};

const body = upright(-NECK_TOP, BELL_END, radius);
const mouthY = (u: number) => NECK_TOP + u * MOUTH_LENGTH;
const mouthpiece = rounded(u => v3(-2 * u ** 3, mouthY(u), 0), u => (u < 0.6 ? 10 : 10 - ((u - 0.6) / 0.4) ** 1.3 * 5), MOUTH_LENGTH);

const at = (s: number, angle: number, lift: number) => uprightFrame(s, angle, radius(s), lift);
const pad = (s: number, angle: number, r: number): Pad => ({ c: at(s, angle, 2).c, n: around(angle), r });
const scaled = (s: number) => s * SCALE;

const KEYS: ModelKey[] = SAX_KEY_SPECS.map(k => ({
  id: k.id, name: k.name, finger: k.finger, shape: k.shape, layer: 'body',
  // Touch pieces keep their size on the smaller instrument, a little smaller than the alto's.
  w: k.w * 0.9, h: k.h * 0.9,
  frame: at(scaled(k.s), k.angle, k.lift * 0.85),
}));

const HINGE = 42;
const CUPS = SAX_KEY_SPECS.filter(k => k.shape === 'cup').map(k => scaled(k.s));

export const SOPRANO_SAX: InstrumentModel = {
  name: 'Soprano saxophone',
  views: [
    { id: 'front', label: 'Front, from the right', yaw: 60, elev: 12 },
    { id: 'back', label: 'Back, from the left', yaw: -120, elev: 12 },
  ],
  tilt: [-30, 0],
  distance: 1300,
  outline: [body],
  layers: [{
    id: 'body',
    anchor: v3(0, 0, 0),
    tubes: [body],
    dark: [mouthpiece],
    edges: [
      ...bandEdges(-4, 3, 11), // neck socket
      ...bandEdges(BODY_END - 3, BODY_END + 3, 22), // body-bell ring
      ...bandEdges(BELL_END - 5, BELL_END - 5, 50.5), // bell rim bead
      ...[0.3, 0.38, 0.5, 0.58].map(u => ({ c: v3(0, mouthY(u), 0), n: UP, r: 10.9, onDark: true })), // ligature
    ],
    rods: [
      rod(line(at(scaled(96), HINGE, 4).c, at(scaled(196), HINGE, 4).c), 1.3, around(HINGE)),
      rod(line(at(scaled(244), HINGE, 4).c, at(scaled(346), HINGE, 4).c), 1.3, around(HINGE)),
      ...CUPS.map(s => rod(line(at(s, 14, 3).c, at(s - 4, HINGE, 4).c), 1.1, around(28))),
      rod(u => at(scaled(428) + 22 * Math.sin(u * Math.PI), lerp(-30, 78, u), 13).c, 1.1, around(20)), // key guard
      rod(line(at(-30, 172, 4).c, at(scaled(56), 172, 4).c), 1.2, around(172)), // octave rod
      rod(line(at(scaled(236), -112, 4).c, at(BODY_END + 40, -112, 4).c), 1.3, around(-112)), // table rods
      rod(u => at(scaled(80) + 14 * u, 190, 1 + 4 * Math.sin(u * Math.PI)).c, 1.7, around(190), 'Left thumb rest'),
      rod(u => at(scaled(262) + 16 * u, 180, 1 + 8 * Math.sin(u * Math.PI)).c, 1.7, around(180), 'Right thumb hook'),
    ],
    pads: [
      pad(scaled(40), -68, 5), pad(scaled(58), -70, 5), // palm-key pads
      pad(scaled(198), -40, 6.5), // G♯
      pad(scaled(272), 64, 6.5), pad(scaled(296), 64, 6.5), // side keys
      pad(scaled(412), 60, 9), pad(scaled(438), 12, 12), // low E♭, low C
      pad(455, -125, 9), pad(478, -150, 11), pad(505, -150, 13), // low C♯, B, B♭ on the bell
      pad(-35, 180, 4), // neck octave pad
    ],
    rings: [{ c: at(scaled(150), 176, 8).c, n: around(176), r: 4.5, title: 'Strap ring' }],
    rims: [{ c: v3(0, -BELL_END, 0), n: v3(0, -1, 0), r: radius(BELL_END) }],
  }],
  keys: KEYS,
};

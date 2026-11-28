import {
  UP, around, bandEdges, line, rod, rounded, upright, uprightFrame, type InstrumentModel, type ModelKey, type Pad,
  type Shape,
} from './model';
import { v3 } from './project';

/**
 * B♭ clarinet, Boehm system, about 66 cm. Depth s runs down from the top of the upper joint; the barrel and the
 * mouthpiece sit above it (negative s). The tone holes face forward, away from the player; the thumb hole and the
 * register key sit behind. The side trill keys are on the right of the upper joint, the left-pinky keys low on its
 * left, the right-pinky keys low on the lower joint's right. The bell opens downwards.
 *
 * Views: from the front, a little from the right, every key but the thumb's shows; from behind, the thumb hole and
 * register key.
 */

const BARREL_TOP = -70;
const UPPER_END = 225;
const LOWER_END = 455;
const BELL_END = 575;

const radius = (s: number): number => {
  if (s < 0) return 15 + 0.6 * Math.sin((Math.PI * (s - BARREL_TOP)) / -BARREL_TOP); // barrel, a little fuller mid-way
  if (s <= UPPER_END) return 13.5;
  if (s <= LOWER_END) return 13.5 + (s - UPPER_END) / (LOWER_END - UPPER_END);
  return 15 + 17.5 * ((s - LOWER_END) / (BELL_END - LOWER_END)) ** 3;
};

const body = upright(BARREL_TOP, BELL_END, radius);
// Mouthpiece: from the barrel up, tapering to the tip, which bends a little back towards the player.
const mouthpiece = rounded(
  u => v3(-4 * u ** 3, -BARREL_TOP + u * 92, 0),
  u => (u < 0.55 ? 12.5 : 12.5 - ((u - 0.55) / 0.45) ** 1.3 * 6.5), 92);
const mouthY = (u: number) => -BARREL_TOP + u * 92;

const pad = (s: number, angle: number, r: number): Pad =>
  ({ c: uprightFrame(s, angle, radius(s), 2).c, n: around(angle), r });

const key = (id: string, name: string, finger: string, shape: Shape, s: number, angle: number,
  w: number, h: number, lift: number): ModelKey =>
  ({ id, name, finger, shape, w, h, layer: 'body', frame: uprightFrame(s, angle, radius(s), lift) });

const HOLES = [80, 110, 142, 268, 298, 330];
const FINGERS = ['left index', 'left middle', 'left ring', 'right index', 'right middle', 'right ring'];

const KEYS: ModelKey[] = [
  key('h0', 'Register key', 'left thumb', 'lever', 34, 168, 13, 6, 4),
  key('h1', 'Thumb hole', 'left thumb', 'hole', 50, 180, 8, 8, 0.5),
  ...HOLES.map((s, i) => key(`h${i + 2}`, `Hole ${i + 1}`, FINGERS[i], 'hole', s, 0, 8.5, 8.5, 0.5)),

  key('kA', 'A key', 'left index', 'spatula', 28, 6, 11, 7, 4),
  key('kGs', 'G♯ key', 'left index', 'spatula', 44, 32, 9, 6, 4),
  key('slEb', 'Sliver key E♭/B♭', 'left ring', 'sliver', 126, 26, 4, 10, 3),

  key('s1', 'Side key 1', 'right index, side', 'side', 165, 75, 6, 12, 5),
  key('s2', 'Side key 2', 'right index, side', 'side', 180, 75, 6, 12, 5),
  key('s3', 'Side key 3', 'right index, side', 'side', 195, 75, 6, 12, 5),
  key('s4', 'Side key 4', 'right index, side', 'side', 210, 75, 6, 12, 5),

  key('lpCs', 'Left pinky C♯/G♯', 'left pinky', 'table', 182, -62, 10, 8, 5),
  key('lpE', 'Left pinky E/B', 'left pinky', 'table', 195, -62, 10, 8, 5),
  key('lpF', 'Left pinky F/C', 'left pinky', 'table', 208, -62, 10, 8, 5),
  key('lpFs', 'Left pinky F♯/C♯', 'left pinky', 'table', 221, -62, 10, 8, 5),

  key('slB', 'Sliver key B/F♯', 'right ring', 'sliver', 314, 26, 4, 10, 3),
  key('rpE', 'Right pinky E/B', 'right pinky', 'table', 362, 55, 10, 8, 5),
  key('rpF', 'Right pinky F/C', 'right pinky', 'table', 375, 55, 10, 8, 5),
  key('rpGs', 'Right pinky G♯/D♯', 'right pinky', 'table', 388, 55, 10, 8, 5),
  key('rpFs', 'Right pinky F♯/C♯', 'right pinky', 'table', 401, 55, 10, 8, 5),
];

export const CLARINET: InstrumentModel = {
  name: 'B♭ clarinet',
  views: [
    { id: 'front', label: 'Front', yaw: 80, elev: 10 },
    { id: 'back', label: 'Back', yaw: -100, elev: 10 },
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
      ...bandEdges(BARREL_TOP, BARREL_TOP + 5, 15.6), // barrel's top ring
      ...bandEdges(-3, 3, 15.2), ...bandEdges(UPPER_END - 4, UPPER_END + 4, 15), // tenon rings
      ...bandEdges(LOWER_END - 5, LOWER_END + 2, 16), ...bandEdges(BELL_END - 6, BELL_END, 33.5), // bell rings
      ...[0.32, 0.4, 0.52, 0.6].map(u => ({ c: v3(0, mouthY(u), 0), n: UP, r: 13.4, onDark: true })), // ligature
    ],
    rods: [
      rod(line(uprightFrame(60, 44, 13.5, 4).c, uprightFrame(215, 44, 13.5, 4).c), 1.4, around(44)),
      rod(line(uprightFrame(70, -44, 13.5, 4).c, uprightFrame(222, -44, 13.5, 4).c), 1.4, around(-44)),
      rod(line(uprightFrame(250, 44, 14, 4).c, uprightFrame(420, 44, 14.4, 4).c), 1.4, around(44)),
      // Right thumb rest on the back of the lower joint.
      rod(u => uprightFrame(292 + 16 * u, 180, 14, 1 + 6 * Math.sin(u * Math.PI)).c, 2, around(180), 'Right thumb rest'),
    ],
    pads: [
      pad(58, -24, 6), pad(64, 40, 6), // A and G♯ pads
      pad(172, 62, 5), pad(190, 62, 5), // trill pads
      pad(236, -40, 7), pad(410, 20, 8), pad(430, -30, 8), pad(440, 30, 8), // pinky-key pads
    ],
    rims: [{ c: v3(0, -BELL_END, 0), n: v3(0, -1, 0), r: radius(BELL_END) }],
  }],
  keys: KEYS,
};

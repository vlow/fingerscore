import { UP, bandEdges, rounded, upright, uprightFrame, type InstrumentModel, type ModelKey } from './model';
import { v3 } from './project';

/**
 * Xaphoon in C, about 42 cm with its mouthpiece: a straight, widening tube with a saxophone-style mouthpiece and a
 * small flare at the foot. Depth s runs down from where the mouthpiece meets the tube.
 *
 * Holes, in chart order: the top hole, then the thumb hole, the only hole on the back (the chart draws it offset to
 * the left, as it draws a recorder's thumb hole), then holes 3 to 9. The top hole and holes 3 to 9 face forward: eight
 * in a row. The chart's gap after hole 5 splits the hands: the left hand covers the top hole and holes 3 to 5, the
 * right hand holes 6 to 9 ("right little finger on hole 9", as the fingering notes say).
 *
 * Views: from the front, a little from the right, the eight front holes; from behind, the thumb hole.
 */

const TUBE_END = 330;
const MOUTH_LENGTH = 78;

const radius = (s: number): number => {
  if (s < 0) return 12.5;
  if (s < TUBE_END - 30) return 12 + (3.5 * s) / (TUBE_END - 30);
  return 15.5 + 6 * ((s - (TUBE_END - 30)) / 30) ** 2; // flare
};

const tube = upright(-8, TUBE_END, radius);
const mouthY = (u: number) => 8 + u * MOUTH_LENGTH;
const mouthpiece = rounded(u => v3(-3 * u ** 3, mouthY(u), 0), u => (u < 0.6 ? 11.5 : 11.5 - ((u - 0.6) / 0.4) ** 1.3 * 5.5), MOUTH_LENGTH);

const hole = (id: string, name: string, finger: string, s: number, angle: number, d: number): ModelKey =>
  ({ id, name, finger, shape: 'hole', w: d, h: d, layer: 'body', frame: uprightFrame(s, angle, radius(s), 0.3) });

const FRONT = [70, 95, 120, 165, 190, 215, 240];
const FINGERS = ['left middle', 'left ring', 'left little', 'right index', 'right middle', 'right ring', 'right little'];

const KEYS: ModelKey[] = [
  hole('h0', 'Top hole', 'left index', 40, 0, 8.5),
  hole('h1', 'Thumb hole', 'left thumb', 60, 180, 9),
  ...FRONT.map((s, i) => hole(`h${i + 2}`, `Hole ${i + 3}`, FINGERS[i], s, 0, 9.5)),
];

export const XAPHOON: InstrumentModel = {
  name: 'Xaphoon',
  views: [
    { id: 'front', label: 'Front', yaw: 80, elev: 10 },
    { id: 'back', label: 'Back', yaw: -100, elev: 10 },
  ],
  tilt: [-30, 0],
  distance: 1000,
  outline: [tube],
  layers: [{
    id: 'body',
    anchor: v3(0, 0, 0),
    tubes: [tube],
    dark: [mouthpiece],
    edges: [
      ...bandEdges(-8, -2, 13),
      ...[0.3, 0.38].map(u => ({ c: v3(0, mouthY(u), 0), n: UP, r: 12.4, onDark: true })), // ligature
    ],
    rims: [{ c: v3(0, -TUBE_END, 0), n: v3(0, -1, 0), r: radius(TUBE_END) }],
  }],
  keys: KEYS,
};

import { bandEdges, upright, uprightFrame, type InstrumentModel, type ModelKey } from './model';
import { v3 } from './project';

/**
 * Soprano recorder, about 32 cm (the alto shares its chart). Depth s runs down from the tip of the beak. The window and
 * the finger holes face forward, the thumb hole sits behind. Holes 6 and 7 are double holes; hole 7, on the foot,
 * turns a little to the right, towards the little finger. The foot opens downwards.
 *
 * Views: from the front, a little from the right, every hole but the thumb's; from behind, the thumb hole.
 */

const HEAD_END = 105;
const BODY_END = 262;
const FOOT_END = 318;

const radius = (s: number): number => {
  if (s < 30) return 8 + 5.5 * Math.sin(((Math.PI / 2) * s) / 30); // the beak rounds out into the head
  if (s < HEAD_END) return 13.5 + (s > HEAD_END - 14 ? 0.6 : 0); // head, with the socket of the body joint
  if (s < BODY_END) return 11.5 - (2 * (s - HEAD_END)) / (BODY_END - HEAD_END); // body narrows downwards
  const u = (s - BODY_END) / (FOOT_END - BODY_END);
  return 12.6 + 0.8 * Math.sin(u * Math.PI); // foot joint
};

const tube = upright(0, FOOT_END, radius);

const hole = (id: string, name: string, finger: string, s: number, angle: number, d: number): ModelKey =>
  ({ id, name, finger, shape: 'hole', w: d, h: d, layer: 'body', frame: uprightFrame(s, angle, radius(s), 0.3) });
const double = (id: string, name: string, finger: string, s: number, angle: number, big: number, small: number): ModelKey =>
  ({ id, name, finger, shape: 'double', w: big, h: small, layer: 'body', frame: uprightFrame(s, angle, radius(s), 0.3) });

const KEYS: ModelKey[] = [
  hole('h0', 'Thumb hole', 'left thumb', 128, 180, 7),
  hole('h1', 'Hole 1', 'left index', 140, 0, 7),
  hole('h2', 'Hole 2', 'left middle', 160, 0, 7),
  hole('h3', 'Hole 3', 'left ring', 180, 0, 7),
  hole('h4', 'Hole 4', 'right index', 207, 0, 7),
  hole('h5', 'Hole 5', 'right middle', 226, 0, 6.5),
  double('h6', 'Hole 6 (double)', 'right ring', 245, 0, 5.5, 3.5),
  double('h7', 'Hole 7 (double)', 'right pinky', 290, 24, 5, 3.2),
];

export const RECORDER: InstrumentModel = {
  name: 'Recorder',
  views: [
    { id: 'front', label: 'Front', yaw: 80, elev: 10 },
    { id: 'back', label: 'Back', yaw: -100, elev: 10 },
  ],
  distance: 900,
  outline: [tube],
  layers: [{
    id: 'body',
    anchor: v3(0, 0, 0),
    tubes: [tube],
    edges: [...bandEdges(HEAD_END - 14, HEAD_END, 14.1), ...bandEdges(BODY_END, BODY_END + 4, 12.8)],
    plates: [{ frame: uprightFrame(62, 0, radius(62), 0.2), w: 9, h: 6, kind: 'window' }],
    rims: [{ c: v3(0, -FOOT_END, 0), n: v3(0, -1, 0), r: radius(FOOT_END) }],
  }],
  keys: KEYS,
};

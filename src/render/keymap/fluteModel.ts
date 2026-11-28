import {
  around, bandEdges, lerp, line, rod, rounded, uprightFrame, type InstrumentModel, type ModelKey, type Pad, type Shape,
} from './model';
import { v3 } from './project';

/**
 * Concert flute in C, about 67 cm (piccolo and alto flute share its chart). Built upright like the other models, head
 * joint on top, and drawn on its side (roll -90°) so the head points left, as the flute is held. "Forward" here is
 * where the keys face: up, when it is played. The thumb keys sit underneath, facing the player. Depth s runs from the
 * joint between head and body; the head joint is above it (negative s), the foot joint below the body.
 *
 * Views: from above, a little from the player's side, the six main keys, the G♯, trill, E♭ and foot keys; from below,
 * the two thumb keys.
 */

const HEAD_TOP = -200;
const BODY_END = 330;
const FOOT_END = 445;

const radius = (s: number): number => {
  if (s < HEAD_TOP + 10) return 11.2; // crown
  if (s < 0) return 10.2 + 0.4 * ((s - HEAD_TOP) / -HEAD_TOP); // head joint, slightly tapered towards the crown
  return 9.5;
};

// Spheres, not cross-sections: the views look across the flute's axis, where cross-sections would thin to lines.
const tube = rounded(u => v3(0, -lerp(HEAD_TOP, FOOT_END, u), 0), u => radius(lerp(HEAD_TOP, FOOT_END, u)), FOOT_END - HEAD_TOP, 1);

const key = (id: string, name: string, finger: string, shape: Shape, s: number, angle: number,
  w: number, h: number, lift: number): ModelKey =>
  ({ id, name, finger, shape, w, h, layer: 'body', frame: uprightFrame(s, angle, radius(s), lift) });

const CUPS = [62, 118, 150, 230, 262, 296];
const NAMES = ['C key', 'A key', 'G key', 'F key', 'E key', 'D key'];
const FINGERS = ['left index', 'left middle', 'left ring', 'right index', 'right middle', 'right ring'];
const HINGE = -55;

const KEYS: ModelKey[] = [
  key('h0', 'B thumb key', 'left thumb', 'small', 82, 180, 11, 11, 3),
  ...CUPS.map((s, i) => key(`h${i + 1}`, NAMES[i], FINGERS[i], 'cup', s, 0, 6, 17, 4)),
  key('fBb', 'B♭ thumb lever', 'left thumb', 'lever', 84, 152, 6, 14, 3),
  key('fGs', 'G♯ key', 'left pinky', 'spatula', 168, -62, 12, 7, 4),
  key('tD', 'D trill key', 'right index, side', 'side', 196, 52, 5, 10, 4),
  key('tDs', 'D♯ trill key', 'right index, side', 'side', 210, 52, 5, 10, 4),
  key('fEb', 'E♭ key', 'right pinky', 'spatula', 318, 46, 13, 7, 4),
  key('fCs', 'Low C♯ roller', 'right pinky', 'spatula', 384, 46, 14, 6, 4),
  key('fC', 'Low C roller', 'right pinky', 'spatula', 402, 46, 14, 6, 4),
];

const pad = (s: number, angle: number, r: number): Pad => ({ c: uprightFrame(s, angle, radius(s), 2).c, n: around(angle), r });

export const FLUTE: InstrumentModel = {
  name: 'Flute',
  views: [
    { id: 'top', label: 'From above', yaw: 72, elev: 0, roll: -90 },
    { id: 'bottom', label: 'From below', yaw: -108, elev: 0, roll: -90 },
  ],
  tilt: [15, 60],
  distance: 1300,
  outline: [tube],
  layers: [{
    id: 'body',
    anchor: v3(0, 0, 0),
    tubes: [tube],
    edges: [
      ...bandEdges(HEAD_TOP + 10, HEAD_TOP + 10, 11.2), // crown
      ...bandEdges(-6, 0, 10.8), // head-joint socket
      ...bandEdges(BODY_END, BODY_END + 6, 10.4), ...bandEdges(FOOT_END - 4, FOOT_END - 4, 10), // foot joint
    ],
    plates: [{ frame: uprightFrame(-150, 0, radius(-150), 1), w: 25, h: 33, kind: 'lip' }],
    rods: [
      rod(line(uprightFrame(48, HINGE, 9.5, 4).c, uprightFrame(310, HINGE, 9.5, 4).c), 1.5, around(HINGE)),
      ...CUPS.map(s => rod(line(uprightFrame(s, -20, 9.5, 3).c, uprightFrame(s - 4, HINGE, 9.5, 4).c), 1.2, around(-38))),
      rod(line(uprightFrame(345, 70, 9.5, 4).c, uprightFrame(430, 70, 9.5, 4).c), 1.5, around(70)),
    ],
    pads: [pad(370, 20, 8), pad(392, 20, 8), pad(412, 20, 8), pad(325, 15, 7)], // foot-joint and E♭ cups
  }],
  keys: KEYS,
};

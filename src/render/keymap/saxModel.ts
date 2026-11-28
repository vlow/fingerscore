import {
  UP, acrossAt, around, bezier, lerp, line, rod, rounded, sweep, type Edge, type InstrumentModel, type ModelKey, type Pad,
  type Shape,
} from './model';
import { add, cross, mul, norm, sub, v3, type Tube, type Vec3 } from './project';

/**
 * Alto saxophone (all four saxes share one chart). The body hangs down the y axis from the neck socket (y = 0). The bow
 * turns forward into the bell, which rises in front of the body and leans further forward as it rises, so body, bow
 * and bell lie in one plane with the neck, which bends back so the mouthpiece points at the player. The pearls face
 * forward, towards the bell; the thumbs sit behind.
 *
 * Sizes follow a typical alto: body 470 mm from socket to bow, 28 mm across at the socket and 62 mm at the bow, bell
 * axis 84 mm in front of the body axis, 120 mm rim leaning 40 mm forward.
 *
 * Views: from the player's right, 40° towards the front, the bell stands clear of every key on that side (from about
 * 50° its flare starts to cover the D and F cups); from the left, a little behind, the bell is behind the body and the
 * thumb, palm and left-pinky keys face you.
 */

const BODY_LENGTH = 470;
const BOW_RADIUS = 42;
const BELL_X = 2 * BOW_RADIUS;
const RIM_Y = -235;
const RIM_RADIUS = 60;
const BELL_LEAN = 40;
const CUP_DIAMETER = 23;

const bodyRadius = (s: number): number => 14 + (17 * s) / BODY_LENGTH;
const bellRadiusAt = (y: number): number => {
  const u = (y + BODY_LENGTH) / (RIM_Y + BODY_LENGTH);
  return 35 + 5 * u + 20 * Math.max(0, (u - 0.7) / 0.3) ** 2.2;
};
const onBody = (s: number, angle: number, lift: number): Vec3 =>
  add(v3(0, -s, 0), mul(around(angle), bodyRadius(s) + lift));
/** The bell's centre line at u (0 at the bow, 1 at the rim): upright at the bow, leaning forward as it rises. */
const bellAxis = (u: number): Vec3 => v3(BELL_X + BELL_LEAN * u * u, lerp(-BODY_LENGTH, RIM_Y, u), 0);
const onBell = (y: number, angle: number, lift: number): Vec3 =>
  add(bellAxis((y + BODY_LENGTH) / (RIM_Y + BODY_LENGTH)), mul(around(angle), bellRadiusAt(y) + lift));

// --- Tubes -----------------------------------------------------------------------------------------------------------

const body: Tube = { mode: 'disk', samples: sweep(u => v3(0, -u * BODY_LENGTH, 0), u => bodyRadius(u * BODY_LENGTH), BODY_LENGTH) };
const bow = rounded(
  u => v3(BOW_RADIUS - BOW_RADIUS * Math.cos(u * Math.PI), -BODY_LENGTH - BOW_RADIUS * Math.sin(u * Math.PI), 0),
  u => lerp(31, 35, u), Math.PI * BOW_RADIUS);
const bellSamples = sweep(bellAxis, u => bellRadiusAt(lerp(-BODY_LENGTH, RIM_Y, u)), RIM_Y + BODY_LENGTH);
const bell: Tube = { mode: 'disk', samples: bellSamples };

const NECK = [v3(0, -4, 0), v3(0, 55, 0), v3(-30, 108, 0), v3(-100, 104, 0)] as const;
const neckCurve = bezier(...NECK);
const neck = rounded(neckCurve, u => lerp(13.5, 9, u), 170);
const mouthDir = norm(sub(NECK[3], NECK[2]));
const MOUTH_LENGTH = 82;
const mouthAt = (u: number) => add(NECK[3], mul(mouthDir, u * MOUTH_LENGTH));
const mouthRadius = (u: number) => (u < 0.62 ? 11.5 : 11.5 - ((u - 0.62) / 0.38) ** 1.4 * 6);
const mouthpiece = rounded(mouthAt, mouthRadius, MOUTH_LENGTH);

const ligature = (u: number): Edge => ({ c: mouthAt(u), n: mouthDir, r: mouthRadius(u) + 0.9, onDark: true });
const ring = (c: Vec3, r: number): Edge => ({ c, n: UP, r });

// --- Mechanism and fittings ------------------------------------------------------------------------------------------

const HINGE_ANGLE = 42;
const CUP_ARM_ANGLE = 14;
const CUPS = [108, 146, 184, 256, 294, 332];

const bodyPad = (s: number, angle: number, r: number): Pad => ({ c: onBody(s, angle, 2), n: around(angle), r });
const bellPad = (y: number, angle: number, r: number): Pad => ({ c: onBell(y, angle, 2), n: around(angle), r });

/** The neck's octave pad on top of the neck. */
const neckPad: Pad = (() => {
  const u = 0.55;
  const c = neckCurve(u);
  const t = norm(sub(neckCurve(u + 0.01), neckCurve(u - 0.01)));
  let n = norm(cross(t, v3(0, 0, 1)));
  if (n.y < 0) n = mul(n, -1);
  return { c: add(c, mul(n, lerp(13.5, 9, u) + 2)), n, r: 5 };
})();

// --- Keys ------------------------------------------------------------------------------------------------------------

/**
 * The saxophone's keys as placed on the alto: s = depth below the neck socket, angle around the body, touch-piece
 * size, and how far it stands off the tube. The soprano places the same keys, scaled to its shorter body.
 */
export interface SaxKeySpec { id: string; name: string; finger: string; shape: Shape; s: number; angle: number; w: number; h: number; lift: number }

const spec = (id: string, name: string, finger: string, shape: Shape, s: number, angle: number,
  w: number, h: number, lift: number): SaxKeySpec => ({ id, name, finger, shape, s, angle, w, h, lift });

export const SAX_KEY_SPECS: SaxKeySpec[] = [
  spec('h0', 'Octave key', 'left thumb', 'lever', 62, 180, 15, 7, 3),
  ...(['B key', 'A key', 'G key', 'F key', 'E key', 'D key'] as const).map((name, i) =>
    spec(`h${i + 1}`, name, ['left index', 'left middle', 'left ring', 'right index', 'right middle', 'right ring'][i],
      'cup', CUPS[i], 0, 13, CUP_DIAMETER, 4)),

  spec('pD', 'Palm D', 'left palm', 'palm', 46, -95, 8, 15, 7),
  spec('pEb', 'Palm E♭', 'left palm', 'palm', 64, -110, 8, 15, 9),
  spec('pF', 'Palm F', 'left palm', 'palm', 82, -95, 8, 15, 7),
  spec('fF', 'Front F', 'left index', 'front', 90, 18, 8, 11, 4),
  spec('bis', 'Bis B♭', 'left index', 'small', 127, 0, 6, 6, 3),

  spec('tGs', 'G♯ key', 'left pinky', 'table', 214, -55, 10, 9, 6),
  spec('tCs', 'Low C♯', 'left pinky', 'table', 212, -80, 10, 9, 6),
  spec('tB', 'Low B', 'left pinky', 'table', 228, -80, 10, 9, 6),
  spec('tBb', 'Low B♭', 'left pinky', 'table', 230, -55, 10, 9, 6),

  spec('hFs', 'High F♯', 'right index, side', 'side', 240, 62, 7, 15, 5),
  spec('sE', 'Side E', 'right index, side', 'side', 264, 76, 7, 17, 6),
  spec('sC', 'Side C', 'right index, side', 'side', 285, 76, 7, 17, 6),
  spec('sBb', 'Side B♭', 'right index, side', 'side', 306, 76, 7, 17, 6),
  spec('aFs', 'Alternate F♯', 'right ring', 'small', 314, 24, 7, 7, 4),

  spec('rEb', 'Low E♭', 'right pinky', 'spatula', 372, 48, 16, 8, 5),
  spec('rC', 'Low C', 'right pinky', 'spatula', 388, 52, 16, 8, 5),
];

const KEYS: ModelKey[] = SAX_KEY_SPECS.map(k => ({
  id: k.id, name: k.name, finger: k.finger, shape: k.shape, w: k.w, h: k.h, layer: 'column',
  frame: { c: onBody(k.s, k.angle, k.lift), n: around(k.angle), across: acrossAt(k.angle) },
}));

export const SAX: InstrumentModel = {
  name: 'Alto saxophone',
  views: [
    { id: 'right', label: 'Right side, from the front', yaw: 40, elev: 12 },
    { id: 'left', label: 'Left side, from behind', yaw: -150, elev: 12 },
  ],
  tilt: [-15, 10],
  distance: 1200,
  outline: [body, bow, bell, neck],
  layers: [
    {
      id: 'column',
      // On the body's axis at the bell's mid height: compared with the bell's anchor, it tells which is nearer.
      anchor: v3(0, (RIM_Y - BODY_LENGTH) / 2, 0),
      tubes: [body, neck],
      dark: [mouthpiece],
      edges: [
        ring(v3(0, 4, 0), 15.5), ring(v3(0, -6, 0), 15.5), // neck socket
        ring(v3(0, -BODY_LENGTH + 6, 0), 31.5), ring(v3(0, -BODY_LENGTH, 0), 31.5), // body-bow joint
        ligature(0.3), ligature(0.37), ligature(0.5), ligature(0.57),
      ],
      rods: [
        // Hinge rods of the upper and lower stack, between the pearls and the side keys, with an arm to each cup.
        rod(line(onBody(96, HINGE_ANGLE, 4), onBody(196, HINGE_ANGLE, 4)), 1.5, around(HINGE_ANGLE)),
        rod(line(onBody(244, HINGE_ANGLE, 4), onBody(346, HINGE_ANGLE, 4)), 1.5, around(HINGE_ANGLE)),
        ...CUPS.map(s => rod(line(onBody(s, CUP_ARM_ANGLE, 3), onBody(s - 5, HINGE_ANGLE, 4)), 1.3, around(28))),
        // Wire guard over the low C and E♭ pads.
        rod(u => onBody(428 + 30 * Math.sin(u * Math.PI), lerp(-30, 78, u), 15), 1.3, around(20)),
        // Octave rod down the back from the neck to the thumb key; the left-pinky table's rods down the left side.
        rod(line(onBody(2, 172, 4), onBody(56, 172, 4)), 1.4, around(172)),
        rod(line(onBody(236, -112, 4), onBody(410, -112, 4)), 1.5, around(-112)),
        // Left thumb rest: a low bump below the octave key. Right thumb hook: a U standing off the back.
        rod(u => onBody(80 + 18 * u, 190, 1 + 5 * Math.sin(u * Math.PI)), 2, around(190), 'Left thumb rest'),
        rod(u => onBody(262 + 20 * u, 180, 1 + 9 * Math.sin(u * Math.PI)), 2, around(180), 'Right thumb hook'),
      ],
      pads: [
        bodyPad(40, -68, 6), bodyPad(58, -70, 6), // palm-key pads
        bodyPad(198, -40, 8), // G♯
        bodyPad(272, 64, 8), bodyPad(296, 64, 8), // side keys
        bodyPad(412, 60, 11), bodyPad(438, 12, 15), // low E♭, low C
        { c: v3(0, 0, 19.5), n: v3(0, 0, 1), r: 3.2 }, // neck screw
        neckPad,
      ],
      rings: [{ c: onBody(150, 176, 9), n: around(176), r: 5, title: 'Strap ring' }],
    },
    {
      id: 'bell',
      anchor: bellAxis(0.5),
      tubes: [bell],
      edges: [ring(bellAxis(0), 35.5), ring(bellAxis(6 / (RIM_Y + BODY_LENGTH)), 35.5)],
      rods: [rod(line(onBody(400, 0, -2), onBell(-400, 180, -2)), 3, v3(0, 0, 1), 'Bell brace')],
      pads: [bellPad(-425, 180, 11), bellPad(-386, 180, 11), bellPad(-452, -130, 9)], // low B, B♭, C♯
      // The rim sits square on the bell's centre line, so it tilts forward with the lean.
      rims: [{ c: bellSamples[bellSamples.length - 1].c, n: bellSamples[bellSamples.length - 1].t, r: RIM_RADIUS }],
    },
  ],
  keys: KEYS,
};

/** Exact ink box of an SVG path (M/L/H/V/Q/T/C/S/Z, absolute or relative), curve extrema included. Used by the glyph geometry tests. */
export interface Box { x1: number; y1: number; x2: number; y2: number }

export function pathBox(d: string): Box {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const box: Box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  const add = (x: number, y: number) => {
    box.x1 = Math.min(box.x1, x); box.x2 = Math.max(box.x2, x);
    box.y1 = Math.min(box.y1, y); box.y2 = Math.max(box.y2, y);
  };
  // Extrema of a 1-D Bezier with control values v (length 3 or 4) on t in (0, 1).
  const extrema = (v: number[]): number[] => {
    if (v.length === 3) {
      const den = v[0] - 2 * v[1] + v[2];
      return den === 0 ? [] : [(v[0] - v[1]) / den];
    }
    const a = -v[0] + 3 * v[1] - 3 * v[2] + v[3], b = 2 * (v[0] - 2 * v[1] + v[2]), c = v[1] - v[0];
    if (Math.abs(a) < 1e-12) return b === 0 ? [] : [-c / b];
    const disc = b * b - 4 * a * c;
    if (disc < 0) return [];
    const r = Math.sqrt(disc);
    return [(-b + r) / (2 * a), (-b - r) / (2 * a)];
  };
  const bez = (v: number[], t: number): number => v.length === 3
    ? (1 - t) ** 2 * v[0] + 2 * (1 - t) * t * v[1] + t * t * v[2]
    : (1 - t) ** 3 * v[0] + 3 * (1 - t) ** 2 * t * v[1] + 3 * (1 - t) * t * t * v[2] + t ** 3 * v[3];
  const curve = (xs: number[], ys: number[]) => {
    add(xs[xs.length - 1], ys[ys.length - 1]);
    for (const t of [...extrema(xs), ...extrema(ys)]) if (t > 0 && t < 1) add(bez(xs, t), bez(ys, t));
  };

  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': x = ox + num(); y = oy + num(); sx = x; sy = y; add(x, y); cmd = rel ? 'l' : 'L'; cx = x; cy = y; break;
      case 'L': x = ox + num(); y = oy + num(); add(x, y); cx = x; cy = y; break;
      case 'H': x = ox + num(); add(x, y); cx = x; cy = y; break;
      case 'V': y = oy + num(); add(x, y); cx = x; cy = y; break;
      case 'Q': { const qx = ox + num(), qy = oy + num(), ex = ox + num(), ey = oy + num(); curve([x, qx, ex], [y, qy, ey]); cx = qx; cy = qy; x = ex; y = ey; break; }
      case 'T': { const qx = 2 * x - cx, qy = 2 * y - cy, ex = ox + num(), ey = oy + num(); curve([x, qx, ex], [y, qy, ey]); cx = qx; cy = qy; x = ex; y = ey; break; }
      case 'C': { const ax = ox + num(), ay = oy + num(), bx = ox + num(), by = oy + num(), ex = ox + num(), ey = oy + num(); curve([x, ax, bx, ex], [y, ay, by, ey]); cx = bx; cy = by; x = ex; y = ey; break; }
      case 'S': { const ax = 2 * x - cx, ay = 2 * y - cy, bx = ox + num(), by = oy + num(), ex = ox + num(), ey = oy + num(); curve([x, ax, bx, ex], [y, ay, by, ey]); cx = bx; cy = by; x = ex; y = ey; break; }
      case 'A': { num(); num(); num(); num(); num(); x = ox + num(); y = oy + num(); add(x, y); cx = x; cy = y; break; }   // endpoint only: exact for the quarter arcs of flags
      case 'Z': x = sx; y = sy; cx = x; cy = y; break;
      default: throw new Error(`unsupported path command ${cmd}`);
    }
  }
  return box;
}

/** Box of a path drawn with translate(tx, ty) scale(s, -s), in sheet pixels (y down). */
export function placedBox(d: string, tx: number, ty: number, s: number): Box {
  const b = pathBox(d);
  return { x1: tx + b.x1 * s, x2: tx + b.x2 * s, y1: ty - b.y2 * s, y2: ty - b.y1 * s };
}

// Pure map data for Firewall Defense: the circuit trace attackers follow and the build pads
// beside it. Coordinates are canvas pixels on the 1920×1080 stage.

export interface Pt {
  x: number;
  y: number;
}

/** The trace, from INTERNET (left) to the SERVER (right). Segments are axis-aligned. */
export const WAYPOINTS: readonly Pt[] = [
  { x: 140, y: 300 },
  { x: 520, y: 300 },
  { x: 520, y: 780 },
  { x: 960, y: 780 },
  { x: 960, y: 300 },
  { x: 1400, y: 300 },
  { x: 1400, y: 780 },
  { x: 1640, y: 780 },
  { x: 1640, y: 540 },
  { x: 1800, y: 540 },
];

/** Build pad centres. None of them overlaps the trace (see PAD_CLEAR). */
export const PADS: readonly Pt[] = [
  { x: 330, y: 180 },
  { x: 330, y: 420 },
  { x: 740, y: 420 },
  { x: 740, y: 660 },
  { x: 740, y: 900 },
  { x: 1180, y: 180 },
  { x: 1180, y: 420 },
  { x: 1180, y: 660 },
  { x: 1560, y: 420 },
  { x: 1560, y: 660 },
  { x: 1560, y: 900 },
  { x: 1780, y: 420 },
];

/** Pad radius plus half the trace width: every pad centre is at least this far from the trace. */
export const PAD_CLEAR = 70;

const SEG_LENGTHS = WAYPOINTS.slice(1).map((p, i) => Math.hypot(p.x - WAYPOINTS[i].x, p.y - WAYPOINTS[i].y));

/** Total length of the trace in pixels. */
export const PATH_LENGTH = SEG_LENGTHS.reduce((a, b) => a + b, 0);

/** The point `d` pixels along the trace, clamped to its ends. */
export function pointAt(d: number): Pt {
  let left = Math.max(0, d);
  for (let i = 0; i < SEG_LENGTHS.length; i++) {
    const len = SEG_LENGTHS[i];
    if (left <= len || i === SEG_LENGTHS.length - 1) {
      const a = WAYPOINTS[i];
      const b = WAYPOINTS[i + 1];
      const t = Math.min(1, left / len);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= len;
  }
  return { ...WAYPOINTS[WAYPOINTS.length - 1] };
}

/** Shortest distance from `p` to the trace. */
export function distToPath(p: Pt): number {
  let best = Infinity;
  for (let i = 1; i < WAYPOINTS.length; i++) {
    const a = WAYPOINTS[i - 1];
    const b = WAYPOINTS[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}

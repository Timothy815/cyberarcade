import { describe, expect, it } from 'vitest';
import { distToPath, PAD_CLEAR, PADS, PATH_LENGTH, pointAt, WAYPOINTS } from '../../src/games/defense/path';

describe('defense path', () => {
  it('has the expected total length', () => {
    expect(PATH_LENGTH).toBe(3340);
  });

  it('pointAt hits every waypoint at its cumulative distance', () => {
    let d = 0;
    WAYPOINTS.forEach((w, i) => {
      if (i > 0) d += Math.hypot(w.x - WAYPOINTS[i - 1].x, w.y - WAYPOINTS[i - 1].y);
      const p = pointAt(d);
      expect(p.x).toBeCloseTo(w.x, 6);
      expect(p.y).toBeCloseTo(w.y, 6);
    });
  });

  it('pointAt interpolates and clamps to the ends', () => {
    expect(pointAt(190)).toEqual({ x: 330, y: 300 });
    expect(pointAt(-50)).toEqual({ x: 140, y: 300 });
    expect(pointAt(PATH_LENGTH + 500)).toEqual({ x: 1800, y: 540 });
  });

  it('has 12 pads, none overlapping the trace, all within firewall reach of it', () => {
    expect(PADS).toHaveLength(12);
    for (const p of PADS) {
      expect(distToPath(p)).toBeGreaterThanOrEqual(PAD_CLEAR);
      expect(distToPath(p)).toBeLessThanOrEqual(230);
    }
  });
});

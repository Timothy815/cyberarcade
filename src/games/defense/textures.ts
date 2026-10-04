import type * as Phaser from 'phaser';
import { hexToInt, palette } from '../../core/theme';
import { bake, neonCircle, neonPoly, type G, type Pt } from '../phaser-util';
import type { TowerKind } from './logic';

// Every sprite is drawn in code once, at scene start, and baked into a texture.

const CYAN = hexToInt(palette.cyan);
const PINK = hexToInt(palette.pink);
const YELLOW = hexToInt(palette.yellow);
const OK = hexToInt(palette.ok);
const DANGER = hexToInt(palette.danger);
const GREY = hexToInt(palette.grey);
const WHITE = 0xffffff;

/** Each tower's color, also used for its range ring and slow field. */
export const TOWER_COLOR: Record<TowerKind, number> = { firewall: CYAN, ids: OK, honeypot: YELLOW, limiter: PINK };

/** A regular polygon with `n` corners, the first one pointing up. */
function ring(cx: number, cy: number, n: number, r: number, turn = 0): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + turn) / n) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function glyph(g: G, kind: TowerKind): void {
  g.lineStyle(5, WHITE, 1);
  g.fillStyle(WHITE, 1);
  if (kind === 'firewall') {
    // A brick wall.
    for (const y of [36, 48, 60]) g.lineBetween(30, y, 66, y);
    g.lineBetween(48, 36, 48, 48);
    g.lineBetween(39, 48, 39, 60);
    g.lineBetween(57, 48, 57, 60);
  } else if (kind === 'ids') {
    // An eye.
    g.strokeEllipse(48, 48, 40, 24);
    g.fillCircle(48, 48, 7);
  } else if (kind === 'honeypot') {
    // A honey pot.
    g.strokeRoundedRect(32, 40, 32, 24, 8);
    g.lineBetween(36, 36, 60, 36);
  } else {
    // A speed gauge.
    g.beginPath();
    g.arc(48, 56, 20, Math.PI, 0);
    g.strokePath();
    g.lineBetween(48, 56, 60, 42);
  }
}

/** Makes every texture the scene uses. */
export function makeTextures(scene: Phaser.Scene): void {
  // Towers: 96 × 96 hexagon badges with a white glyph.
  for (const [kind, color] of Object.entries(TOWER_COLOR) as [TowerKind, number][]) {
    bake(scene, `tower-${kind}`, 96, 96, (g) => {
      neonPoly(g, ring(48, 48, 6, 36), color, 0.3);
      glyph(g, kind);
    });
  }

  // Level-2 pip: a small star shown on upgraded towers.
  bake(scene, 'pip', 28, 28, (g) => {
    g.fillStyle(YELLOW, 1);
    g.fillPoints(ring(14, 14, 4, 11).flatMap((p, i, all) => [p, mid(p, all[(i + 1) % all.length], 14, 14)]), true);
  });

  // Empty pad: a dashed-looking socket.
  bake(scene, 'pad', 96, 96, (g) => {
    g.lineStyle(10, CYAN, 0.08);
    g.strokePoints(ring(48, 48, 6, 36), true, true);
    g.lineStyle(3, CYAN, 0.55);
    g.strokePoints(ring(48, 48, 6, 36), true, true);
    g.fillStyle(CYAN, 0.6);
    g.fillRect(44, 36, 8, 24);
    g.fillRect(36, 44, 24, 8);
  });

  // Attackers.
  bake(scene, 'malware', 64, 64, (g) => {
    neonPoly(g, ring(32, 32, 8, 18).flatMap((p, i, all) => [p, mid(p, all[(i + 1) % all.length], 32, 32, 0.55)]), PINK);
    g.fillStyle(WHITE, 1);
    g.fillCircle(26, 30, 3);
    g.fillCircle(38, 30, 3);
  });
  bake(scene, 'stealth', 64, 64, (g) => {
    neonPoly(g, [{ x: 32, y: 12 }, { x: 50, y: 44 }, { x: 32, y: 36 }, { x: 14, y: 44 }], GREY, 0.2);
  });
  bake(scene, 'brute', 76, 76, (g) => {
    neonPoly(g, ring(38, 38, 4, 24, 0.5), DANGER, 0.45);
    g.lineStyle(4, WHITE, 1);
    g.lineBetween(30, 30, 46, 46);
    g.lineBetween(46, 30, 30, 46);
  });
  bake(scene, 'ddos', 40, 40, (g) => {
    neonCircle(g, 20, 20, 9, YELLOW, 0.7);
  });

  // Server core at the end of the trace.
  bake(scene, 'server', 140, 160, (g) => {
    neonPoly(g, [{ x: 30, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 140 }, { x: 30, y: 140 }], OK, 0.2);
    g.fillStyle(OK, 1);
    for (const y of [44, 76, 108]) {
      g.fillRect(46, y, 48, 8);
      g.fillCircle(100, y + 4, 3);
    }
  });

  // Soft white dot for particles (tinted per burst).
  bake(scene, 'spark', 16, 16, (g) => {
    g.fillStyle(WHITE, 0.3);
    g.fillCircle(8, 8, 8);
    g.fillStyle(WHITE, 1);
    g.fillCircle(8, 8, 4);
  });
}

/** The point between two star tips, pulled toward the center (cx, cy) by `k`. */
function mid(a: Pt, b: Pt, cx: number, cy: number, k = 0.45): Pt {
  return { x: cx + ((a.x + b.x) / 2 - cx) * k, y: cy + ((a.y + b.y) / 2 - cy) * k };
}

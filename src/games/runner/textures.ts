import type * as Phaser from 'phaser';
import { hexToInt, palette } from '../../core/theme';
import { bake, GLOW, neonCircle, neonPoly } from '../phaser-util';

// Texture sizes are world sizes at the packet's plane (z = 0); the scene scales them by depth.
// Every texture is drawn with its bottom edge on the floor (origin 0.5, 1).

const CYAN = hexToInt(palette.cyan);
const PINK = hexToInt(palette.pink);
const YELLOW = hexToInt(palette.yellow);
const OK = hexToInt(palette.ok);
const DANGER = hexToInt(palette.danger);
const WHITE = 0xffffff;

/** Width and height of the gate arch texture. */
const ARCH_W = 1300;
const ARCH_H = 720;
/** Height of the label panels' centres above the floor. */
export const LABEL_Y = 520;

export function makeTextures(scene: Phaser.Scene): void {
  // The packet: a cyan arrowhead pointing down the tunnel, with a bright core.
  bake(scene, 'packet', 160, 120, (g) => {
    neonPoly(g, [{ x: 80, y: 14 }, { x: 146, y: 104 }, { x: 80, y: 82 }, { x: 14, y: 104 }], CYAN, 0.45);
    g.fillStyle(WHITE, 0.95);
    g.fillTriangle(80, 34, 98, 74, 62, 74);
  });

  // DDoS flood: a red wall of jagged traffic, one lane wide.
  bake(scene, 'flood', 340, 260, (g) => {
    neonPoly(g, [
      { x: 14, y: 250 }, { x: 14, y: 40 }, { x: 60, y: 14 }, { x: 110, y: 46 }, { x: 170, y: 12 },
      { x: 230, y: 46 }, { x: 280, y: 14 }, { x: 326, y: 40 }, { x: 326, y: 250 },
    ], DANGER, 0.5);
    g.lineStyle(4, PINK, 0.9);
    for (const y of [90, 140, 190]) g.lineBetween(40, y, 300, y);
  });

  // Corrupted node: a glitchy magenta block.
  bake(scene, 'node', 200, 200, (g) => {
    neonPoly(g, [{ x: 20, y: 30 }, { x: 180, y: 20 }, { x: 186, y: 186 }, { x: 14, y: 180 }], PINK, 0.4);
    g.fillStyle(YELLOW, 0.9);
    g.fillRect(40, 60, 70, 10);
    g.fillRect(90, 100, 70, 10);
    g.fillRect(50, 140, 50, 10);
  });

  // ACK token: a green ring with a tick.
  bake(scene, 'ack', 110, 110, (g) => {
    neonCircle(g, 55, 55, 38, OK, 0.25);
    g.lineStyle(8, OK, 1);
    g.beginPath();
    g.moveTo(36, 56);
    g.lineTo(50, 70);
    g.lineTo(76, 40);
    g.strokePath();
  });

  // Router gate: an arch across all three lanes with one label panel per lane.
  bake(scene, 'arch', ARCH_W, ARCH_H, (g) => {
    const posts = [{ x: 14, y: ARCH_H }, { x: 14, y: 14 }, { x: ARCH_W - 14, y: 14 }, { x: ARCH_W - 14, y: ARCH_H }];
    for (const [w, a] of GLOW) {
      g.lineStyle(w, YELLOW, a);
      g.strokePoints(posts, false);
    }
    g.lineStyle(6, YELLOW, 1);
    g.strokePoints(posts, false);
    const cy = ARCH_H - LABEL_Y;
    for (let lane = 0; lane < 3; lane++) {
      const cx = ARCH_W / 2 + (lane - 1) * 360;
      neonPoly(g, [{ x: cx - 170, y: cy - 45 }, { x: cx + 170, y: cy - 45 }, { x: cx + 170, y: cy + 45 }, { x: cx - 170, y: cy + 45 }], CYAN, 0.15);
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

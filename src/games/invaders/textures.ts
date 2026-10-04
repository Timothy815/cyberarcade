import type * as Phaser from 'phaser';
import { hexToInt, palette } from '../../core/theme';
import { mulberry32 } from '../../core/random';
import { bake, GLOW, neonCircle, neonPoly, type G, type Pt } from '../phaser-util';

// Every sprite is drawn in code once, at scene start, and baked into a texture.
// Neon glow is faked with wide, faint strokes under a bright core line, so it costs nothing per frame.

const CYAN = hexToInt(palette.cyan);
const PINK = hexToInt(palette.pink);
const YELLOW = hexToInt(palette.yellow);
const OK = hexToInt(palette.ok);
const DANGER = hexToInt(palette.danger);
const GREY = hexToInt(palette.grey);
const WHITE = 0xffffff;

/** A star outline with `n` points: vertices alternate between radius r1 (tips) and r2 (dips). */
function star(cx: number, cy: number, n: number, r1: number, r2: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function eyes(g: G, cx: number, cy: number, gap: number, r: number): void {
  g.fillStyle(WHITE, 1);
  g.fillCircle(cx - gap, cy, r);
  g.fillCircle(cx + gap, cy, r);
}

/** Makes every texture the scene uses. Texture size = sprite size + room for the glow. */
export function makeTextures(scene: Phaser.Scene): void {
  // Player: a cyan delta-wing fighter.
  bake(scene, 'player', 120, 84, (g) => {
    neonPoly(g, [
      { x: 60, y: 10 }, { x: 74, y: 40 }, { x: 104, y: 60 }, { x: 104, y: 72 },
      { x: 70, y: 66 }, { x: 60, y: 74 }, { x: 50, y: 66 }, { x: 16, y: 72 },
      { x: 16, y: 60 }, { x: 46, y: 40 },
    ], CYAN);
    g.fillStyle(WHITE, 0.9);
    g.fillTriangle(60, 26, 66, 46, 54, 46);
  });

  // Virus: a pink spiky blob with eyes.
  bake(scene, 'virus', 96, 84, (g) => {
    neonPoly(g, star(48, 42, 9, 34, 24), PINK);
    eyes(g, 48, 40, 9, 5);
  });

  // Worm: a chain of green segments with a head.
  bake(scene, 'worm', 104, 76, (g) => {
    for (const [x, r] of [[22, 11], [40, 13], [60, 14]] as const) neonCircle(g, x, 38, r, OK, 0.3);
    neonCircle(g, 82, 38, 16, OK, 0.5);
    eyes(g, 82, 34, 6, 4);
  });

  // Wormlet: half a worm, after a split.
  bake(scene, 'wormlet', 68, 56, (g) => {
    neonCircle(g, 22, 28, 9, OK, 0.3);
    neonCircle(g, 42, 28, 12, OK, 0.5);
    eyes(g, 42, 25, 5, 3);
  });

  // Trojan, revealed: an angular red horse-head mask with yellow eyes.
  bake(scene, 'trojan', 96, 88, (g) => {
    neonPoly(g, [
      { x: 30, y: 12 }, { x: 40, y: 24 }, { x: 56, y: 24 }, { x: 66, y: 12 },
      { x: 80, y: 40 }, { x: 70, y: 76 }, { x: 48, y: 64 }, { x: 26, y: 76 }, { x: 16, y: 40 },
    ], DANGER, 0.4);
    g.fillStyle(YELLOW, 1);
    g.fillTriangle(30, 40, 44, 44, 32, 50);
    g.fillTriangle(66, 40, 52, 44, 64, 50);
  });

  // Trojan, disguised: an innocent-looking document icon.
  bake(scene, 'disguise', 96, 88, (g) => {
    neonPoly(g, [{ x: 26, y: 12 }, { x: 58, y: 12 }, { x: 72, y: 26 }, { x: 72, y: 76 }, { x: 26, y: 76 }], GREY, 0.15);
    g.lineStyle(3, GREY, 1);
    g.strokePoints([{ x: 58, y: 12 }, { x: 58, y: 26 }, { x: 72, y: 26 }], false);
    g.fillStyle(GREY, 0.8);
    for (const y of [38, 48, 58]) g.fillRect(34, y, 30, 4);
  });

  // Ransomware boss: a giant padlock.
  bake(scene, 'boss', 340, 230, (g) => {
    for (const [w, a] of GLOW) {
      g.lineStyle(w + 10, YELLOW, a);
      g.beginPath();
      g.arc(170, 92, 62, Math.PI, 0);
      g.strokePath();
    }
    g.lineStyle(16, YELLOW, 1);
    g.beginPath();
    g.arc(170, 92, 62, Math.PI, 0);
    g.strokePath();
    neonPoly(g, [{ x: 40, y: 88 }, { x: 300, y: 88 }, { x: 300, y: 210 }, { x: 40, y: 210 }], PINK, 0.45);
    g.fillStyle(YELLOW, 1);
    g.fillCircle(170, 136, 18);
    g.fillTriangle(162, 140, 178, 140, 170, 184);
  });

  // Player shot: a cyan bolt.
  bake(scene, 'shot', 22, 40, (g) => {
    g.fillStyle(CYAN, 0.25);
    g.fillRoundedRect(1, 1, 20, 38, 10);
    g.fillStyle(WHITE, 1);
    g.fillRoundedRect(7, 6, 8, 28, 4);
  });

  // Enemy bomb: a hot-pink diamond.
  bake(scene, 'bomb', 36, 36, (g) => {
    neonPoly(g, [{ x: 18, y: 4 }, { x: 30, y: 18 }, { x: 18, y: 32 }, { x: 6, y: 18 }], DANGER, 0.9);
  });

  // Power-ups: round badges with a glyph.
  bake(scene, 'patch', 76, 76, (g) => {
    neonCircle(g, 38, 38, 26, YELLOW, 0.25);
    g.lineStyle(5, YELLOW, 1);
    g.lineBetween(38, 52, 38, 24);
    g.lineBetween(38, 52, 26, 28);
    g.lineBetween(38, 52, 50, 28);
  });
  bake(scene, 'antivirus', 76, 76, (g) => {
    neonCircle(g, 38, 38, 26, OK, 0.25);
    g.fillStyle(OK, 1);
    g.fillPoints([{ x: 38, y: 20 }, { x: 52, y: 26 }, { x: 50, y: 44 }, { x: 38, y: 56 }, { x: 26, y: 44 }, { x: 24, y: 26 }], true);
  });
  bake(scene, 'backup', 76, 76, (g) => {
    neonCircle(g, 38, 38, 26, CYAN, 0.25);
    g.fillStyle(CYAN, 1);
    g.fillRect(34, 22, 8, 32);
    g.fillRect(22, 34, 32, 8);
  });

  // Shield bubble drawn around the player while Antivirus is active.
  bake(scene, 'shield', 150, 120, (g) => {
    for (const [w, a] of GLOW) {
      g.lineStyle(w, OK, a);
      g.strokeEllipse(75, 60, 130, 100);
    }
    g.fillStyle(OK, 0.08);
    g.fillEllipse(75, 60, 130, 100);
    g.lineStyle(3, OK, 0.9);
    g.strokeEllipse(75, 60, 130, 100);
  });

  // Soft white dot for particles (tinted per explosion).
  bake(scene, 'spark', 16, 16, (g) => {
    g.fillStyle(WHITE, 0.3);
    g.fillCircle(8, 8, 8);
    g.fillStyle(WHITE, 1);
    g.fillCircle(8, 8, 4);
  });

  // Starfield tile, scrolled in two parallax layers.
  bake(scene, 'stars', 512, 512, (g) => {
    const rng = mulberry32(7);
    for (let i = 0; i < 70; i++) {
      g.fillStyle(rng() < 0.2 ? CYAN : WHITE, 0.3 + rng() * 0.6);
      g.fillCircle(rng() * 512, rng() * 512, rng() < 0.85 ? 1.2 : 2.2);
    }
  });
}

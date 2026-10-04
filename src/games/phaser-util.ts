import type * as Phaser from 'phaser';
import { hexToInt, palette } from '../core/theme';

// Helpers shared by the Phaser games (Malware Invaders, Packet Runner).

const MAX_CONTEXT_WAIT_FRAMES = 60;

/**
 * Destroys a Phaser game completely. Phaser's destroy() runs on the game's next frame and never
 * releases the WebGL context, and Chrome only allows ~16 live contexts, so a kiosk that starts
 * hundreds of runs a day must free each one by hand once Phaser has finished with it.
 */
export function destroyGame(game: Phaser.Game): void {
  const gl = (game.renderer as Partial<Phaser.Renderer.WebGL.WebGLRenderer> | null)?.gl ?? null;
  game.destroy(true);
  if (!gl) return;
  // pendingDestroy is public in Phaser's source but missing from its typings.
  const pending = () => (game as unknown as { pendingDestroy: boolean }).pendingDestroy;
  let frames = 0;
  const release = () => {
    if (pending() && ++frames < MAX_CONTEXT_WAIT_FRAMES) {
      requestAnimationFrame(release);
      return;
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  requestAnimationFrame(release);
}

// Every sprite is drawn in code once, at scene start, and baked into a texture.
// Neon glow is faked with wide, faint strokes under a bright core line, so it costs nothing per frame.

export type G = Phaser.GameObjects.Graphics;
export type Pt = { x: number; y: number };

const DEEP = hexToInt(palette.deep);

export const GLOW: [width: number, alpha: number][] = [
  [16, 0.06],
  [10, 0.12],
  [6, 0.25],
];

/** Draws a closed neon outline: soft glow passes, a dark fill, then a crisp core line. */
export function neonPoly(g: G, pts: Pt[], color: number, fillAlpha = 0.35): void {
  for (const [w, a] of GLOW) {
    g.lineStyle(w, color, a);
    g.strokePoints(pts, true, true);
  }
  g.fillStyle(DEEP, 0.9);
  g.fillPoints(pts, true, true);
  g.fillStyle(color, fillAlpha);
  g.fillPoints(pts, true, true);
  g.lineStyle(3, color, 1);
  g.strokePoints(pts, true, true);
}

export function neonCircle(g: G, x: number, y: number, r: number, color: number, fillAlpha = 0.35): void {
  for (const [w, a] of GLOW) {
    g.lineStyle(w, color, a);
    g.strokeCircle(x, y, r);
  }
  g.fillStyle(DEEP, 0.9);
  g.fillCircle(x, y, r);
  g.fillStyle(color, fillAlpha);
  g.fillCircle(x, y, r);
  g.lineStyle(3, color, 1);
  g.strokeCircle(x, y, r);
}

export function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

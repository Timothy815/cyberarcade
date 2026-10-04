import * as Phaser from 'phaser';
import { fonts, hexToInt, palette } from '../../core/theme';
import { HONEYPOT_SLOW, type GameEvent, type World } from './logic';
import { PADS, WAYPOINTS } from './path';
import { makeTextures, TOWER_COLOR } from './textures';

export const W = 1920;
export const H = 1080;

/** What the DOM overlay shares with the scene: the pad under the mouse and the selected pad. */
export interface View {
  selected: number | null;
  hover: number | null;
}

export interface SceneHooks {
  /** Called every frame with what happened, after the scene has drawn it. */
  onEvents(events: GameEvent[], world: World): void;
}

const CYAN = hexToInt(palette.cyan);
const OK = hexToInt(palette.ok);
const DANGER = hexToInt(palette.danger);
const GRID = 60;
const BEAM_S = 0.12; // how long a firewall beam stays on screen
const HP_W = 44;

type Burst = 'pink' | 'ok' | 'danger';
const BURST_COLOR: Record<Burst, string> = { pink: palette.pink, ok: palette.ok, danger: palette.danger };

type Beam = { x1: number; y1: number; x2: number; y2: number; left: number };

/**
 * Draws the World. All game rules live in logic.ts; this class mirrors the towers and attackers
 * every frame and turns events into effects.
 */
export class DefenseScene extends Phaser.Scene {
  private readonly attackers = new Map<number, Phaser.GameObjects.Image>();
  private readonly towers: Phaser.GameObjects.Image[] = [];
  private readonly pips: Phaser.GameObjects.Image[] = [];
  private readonly bursts = new Map<Burst, Phaser.GameObjects.Particles.ParticleEmitter>();
  private beams: Beam[] = [];
  private fields!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;

  constructor(
    private readonly world: World,
    private readonly view: View,
    private readonly hooks: SceneHooks,
  ) {
    super('defense');
  }

  create(): void {
    makeTextures(this);
    this.drawBoard();
    this.fields = this.add.graphics().setDepth(1);
    PADS.forEach((p) => {
      this.towers.push(this.add.image(p.x, p.y, 'pad').setDepth(2));
      this.pips.push(this.add.image(p.x + 30, p.y - 30, 'pip').setDepth(3).setVisible(false));
    });
    this.fx = this.add.graphics().setDepth(6);
    for (const [name, hex] of Object.entries(BURST_COLOR) as [Burst, string][]) {
      const emitter = this.add.particles(0, 0, 'spark', {
        speed: { min: 80, max: 360 },
        lifespan: { min: 250, max: 600 },
        scale: { start: 1.1, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: hexToInt(hex),
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      });
      emitter.setDepth(7);
      this.bursts.set(name, emitter);
    }
  }

  update(time: number, delta: number): void {
    const events = this.world.step(delta / 1000);
    this.draw(time / 1000, delta / 1000);
    for (const e of events) this.effect(e);
    this.hooks.onEvents(events, this.world);
  }

  /** The static board: circuit grid, the trace from INTERNET to SERVER, and the end labels. */
  private drawBoard(): void {
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(1, CYAN, 0.07);
    for (let x = 0; x <= W; x += GRID) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += GRID) g.lineBetween(0, y, W, y);
    const trace = [...WAYPOINTS]; // strokePoints wants a mutable array
    for (const [w, a] of [[60, 0.06], [40, 0.1], [24, 0.18]] as const) {
      g.lineStyle(w, CYAN, a);
      g.strokePoints(trace);
    }
    g.lineStyle(4, CYAN, 0.9);
    g.strokePoints(trace);
    for (const p of WAYPOINTS) {
      g.fillStyle(CYAN, 1);
      g.fillCircle(p.x, p.y, 6);
    }
    const start = WAYPOINTS[0];
    const end = WAYPOINTS[WAYPOINTS.length - 1];
    this.add.image(end.x + 30, end.y, 'server').setDepth(0);
    const label = (x: number, y: number, text: string, color: string) =>
      this.add
        .text(x, y, text, { fontFamily: fonts.display, fontSize: '28px', color })
        .setOrigin(0.5)
        .setShadow(0, 0, color, 10, false, true);
    label(start.x, start.y - 60, 'INTERNET', palette.pink);
    label(end.x + 30, end.y + 110, 'SERVER', palette.ok);
  }

  private draw(t: number, dt: number): void {
    const w = this.world;

    // Towers and the slow fields of honeypots and rate limiters.
    const f = this.fields;
    f.clear();
    w.towers.forEach((tower, pad) => {
      const img = this.towers[pad];
      img.setTexture(tower ? `tower-${tower.kind}` : 'pad');
      this.pips[pad].setVisible(tower?.level === 2);
      if (tower && (tower.kind === 'honeypot' || tower.kind === 'limiter')) {
        const color = TOWER_COLOR[tower.kind];
        f.fillStyle(color, tower.kind === 'honeypot' ? HONEYPOT_SLOW * 0.2 : 0.08);
        f.fillCircle(PADS[pad].x, PADS[pad].y, w.range(pad));
      }
    });
    for (const pad of [this.view.hover, this.view.selected]) {
      const tower = pad === null ? null : w.towers[pad];
      if (pad === null || !tower) continue;
      f.lineStyle(3, TOWER_COLOR[tower.kind], 0.8);
      f.strokeCircle(PADS[pad].x, PADS[pad].y, w.range(pad));
    }
    if (this.view.selected !== null) {
      const p = PADS[this.view.selected];
      f.lineStyle(4, 0xffffff, 0.9);
      f.strokeCircle(p.x, p.y, 46);
    }

    // Attackers: stealth shimmers until an IDS reveals it; held bots glow yellow.
    const fx = this.fx;
    fx.clear();
    const seen = new Set<number>();
    for (const a of w.attackers) {
      seen.add(a.id);
      let img = this.attackers.get(a.id);
      if (!img) {
        img = this.add.image(a.x, a.y, a.kind).setDepth(4);
        this.attackers.set(a.id, img);
      }
      img.setPosition(a.x, a.y);
      img.setAlpha(a.revealed ? 1 : 0.2 + 0.15 * Math.sin(t * 14 + a.id));
      if (a.held) img.setTint(hexToInt(palette.yellow));
      else img.clearTint();
      if (a.kind === 'malware') img.setAngle(t * 90);
      if (a.hp < a.maxHp && a.revealed) {
        fx.fillStyle(0x000000, 0.6);
        fx.fillRect(a.x - HP_W / 2, a.y - 40, HP_W, 6);
        fx.fillStyle(a.hp / a.maxHp > 0.4 ? OK : DANGER, 1);
        fx.fillRect(a.x - HP_W / 2, a.y - 40, HP_W * (a.hp / a.maxHp), 6);
      }
    }
    for (const [id, img] of this.attackers) {
      if (!seen.has(id)) {
        img.destroy();
        this.attackers.delete(id);
      }
    }

    // Firewall beams fade out over BEAM_S.
    this.beams = this.beams.filter((b) => (b.left -= dt) > 0);
    for (const b of this.beams) {
      const k = b.left / BEAM_S;
      fx.lineStyle(10, CYAN, 0.25 * k);
      fx.lineBetween(b.x1, b.y1, b.x2, b.y2);
      fx.lineStyle(3, 0xffffff, k);
      fx.lineBetween(b.x1, b.y1, b.x2, b.y2);
    }
  }

  private effect(e: GameEvent): void {
    switch (e.type) {
      case 'shot': {
        const p = PADS[e.pad];
        this.beams.push({ x1: p.x, y1: p.y, x2: e.x, y2: e.y, left: BEAM_S });
        break;
      }
      case 'kill':
        this.burst(e.kind === 'ddos' ? 'pink' : 'ok', e.kind === 'ddos' ? 10 : 24, e.x, e.y);
        this.float(`+${e.credits}`, e.x, e.y - 30, palette.yellow, 28);
        break;
      case 'leak': {
        const end = WAYPOINTS[WAYPOINTS.length - 1];
        this.burst('danger', 30, end.x, end.y);
        this.cameras.main.shake(200, 0.008);
        break;
      }
      case 'breach':
        this.cameras.main.flash(300, 255, 59, 92);
        break;
      case 'win':
        this.cameras.main.flash(300, 61, 255, 154);
        break;
      default:
        break;
    }
  }

  private burst(kind: Burst, count: number, x: number, y: number): void {
    this.bursts.get(kind)!.explode(count, x, y);
  }

  /** A short text that drifts up and fades: +5, +10, ... */
  private float(text: string, x: number, y: number, color: string, size: number): void {
    const label = this.add
      .text(x, y, text, { fontFamily: fonts.display, fontSize: `${size}px`, color })
      .setOrigin(0.5)
      .setDepth(10)
      .setShadow(0, 0, color, 12, false, true);
    this.tweens.add({
      targets: label,
      y: y - 60,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }
}

import * as Phaser from 'phaser';
import { fonts, hexToInt, palette } from '../../core/theme';
import { SPAWN_Z, type GameEvent, type Thing, type World } from './logic';
import { LABEL_Y, makeTextures } from './textures';

export interface SceneHooks {
  /** Called every frame with what happened, after the scene has drawn it. */
  onEvents(events: GameEvent[], world: World): void;
}

// Perspective: a point `z` units ahead of the packet is drawn at scale s = F / (z + F),
// shrinking toward the vanishing point (VX, VY). World x is lanes × LANE_W; world y is height above the floor.
const VX = 960;
const VY = 380;
const F = 700;
const LANE_W = 360;
const FLOOR_Y = 600; // the floor sits this far below the vanishing point at s = 1
const PACKET_Y = VY + FLOOR_Y; // 980
const RING_GAP = 600;
const RING_HALF_W = 640;
const RING_TOP = 200; // ring top edge, world units above the vanishing point
const FADE_Z = SPAWN_Z * 0.8; // things fade in over the far 20% of the spawn distance
const LANE_EASE = 14; // packet slide speed between lanes (≈120 ms)

type Burst = 'pink' | 'cyan' | 'ok' | 'danger';
const BURST_COLOR: Record<Burst, string> = { pink: palette.pink, cyan: palette.cyan, ok: palette.ok, danger: palette.danger };

type GateView = { arch: Phaser.GameObjects.Image; labels: Phaser.GameObjects.Text[] };

const scaleAt = (z: number) => F / (z + F);
const laneX = (lane: number, s: number) => VX + (lane - 1) * LANE_W * s;
const floorY = (s: number) => VY + FLOOR_Y * s;

/**
 * Draws the World. All game rules live in logic.ts; this class only mirrors the world's
 * things as images every frame and turns events into effects.
 */
export class RunnerScene extends Phaser.Scene {
  private readonly pool = new Map<string, Phaser.GameObjects.Image>();
  private readonly gates = new Map<number, GateView>();
  private readonly seen = new Set<string>();
  private readonly bursts = new Map<Burst, Phaser.GameObjects.Particles.ParticleEmitter>();
  private tunnel!: Phaser.GameObjects.Graphics;
  private packet!: Phaser.GameObjects.Image;
  private shownLane = 1;

  constructor(
    private readonly world: World,
    private readonly hooks: SceneHooks,
  ) {
    super('runner');
  }

  create(): void {
    makeTextures(this);
    this.tunnel = this.add.graphics().setDepth(-SPAWN_Z - 10);
    this.packet = this.add.image(VX, PACKET_Y, 'packet').setOrigin(0.5, 1).setDepth(5);
    this.shownLane = this.world.lane;
    for (const [name, hex] of Object.entries(BURST_COLOR) as [Burst, string][]) {
      const emitter = this.add.particles(0, 0, 'spark', {
        speed: { min: 120, max: 560 },
        lifespan: { min: 300, max: 800 },
        scale: { start: 1.3, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: hexToInt(hex),
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      });
      emitter.setDepth(8);
      this.bursts.set(name, emitter);
    }
  }

  update(time: number, delta: number): void {
    const events = this.world.step(delta / 1000);
    this.draw(time / 1000, delta / 1000);
    for (const e of events) this.effect(e);
    this.hooks.onEvents(events, this.world);
  }

  private draw(t: number, dt: number): void {
    const w = this.world;
    this.drawTunnel(w.distance);

    this.seen.clear();
    for (const thing of w.things) {
      if (thing.kind === 'gate') this.drawGate(thing);
      else if (!thing.gone) for (const lane of thing.lanes) this.drawThing(thing, lane, t);
    }
    for (const [key, img] of this.pool) {
      if (!this.seen.has(key)) {
        img.destroy();
        this.pool.delete(key);
      }
    }
    for (const [id, view] of this.gates) {
      if (!this.seen.has(`gate:${id}`)) {
        view.arch.destroy();
        for (const label of view.labels) label.destroy();
        this.gates.delete(id);
      }
    }

    // The packet slides toward its lane, bobs, flickers while invulnerable and vanishes at game over.
    this.shownLane += (w.lane - this.shownLane) * Math.min(1, dt * LANE_EASE);
    this.packet.setPosition(laneX(this.shownLane, 1), PACKET_Y + Math.sin(t * 6) * 6);
    this.packet.setVisible(!w.over && (w.invuln === 0 || Math.floor(t * 12) % 2 === 0));
  }

  /** Neon rings streaming toward the camera, plus the lane lines on the floor. */
  private drawTunnel(distance: number): void {
    const g = this.tunnel;
    g.clear();
    const first = Math.floor(distance / RING_GAP);
    for (let idx = first + 12; idx >= first; idx--) {
      const z = idx * RING_GAP - distance;
      if (z > SPAWN_Z * 1.1 || z < -F * 0.5) continue;
      const s = scaleAt(z);
      const alpha = 0.85 * Math.min(1, Math.max(0, 1 - z / (SPAWN_Z * 1.1)));
      g.lineStyle(3, idx % 2 === 0 ? hexToInt(palette.cyan) : hexToInt(palette.pink), alpha);
      g.strokeRect(VX - RING_HALF_W * s, VY - RING_TOP * s, RING_HALF_W * 2 * s, (RING_TOP + FLOOR_Y) * s);
    }
    const far = scaleAt(SPAWN_Z);
    g.lineStyle(2, hexToInt(palette.cyan), 0.35);
    for (const x of [-540, -180, 180, 540]) g.lineBetween(VX + x, floorY(1), VX + x * far, floorY(far));
  }

  private drawThing(thing: Thing, lane: number, t: number): void {
    const key = `${thing.id}:${lane}`;
    this.seen.add(key);
    let img = this.pool.get(key);
    if (!img) {
      img = this.add.image(0, 0, thing.kind).setOrigin(0.5, 1);
      this.pool.set(key, img);
    }
    const s = scaleAt(thing.z);
    const pulse = thing.kind === 'ack' ? 1 + Math.sin(t * 8 + thing.id) * 0.08 : 1;
    img.setPosition(laneX(lane, s), floorY(s)).setScale(s * pulse).setDepth(-thing.z);
    img.setAlpha(Math.min(1, (SPAWN_Z - thing.z) / (SPAWN_Z - FADE_Z)));
    if (thing.kind === 'node') img.setAngle(Math.sin(t * 5 + thing.id) * 6);
  }

  private drawGate(thing: Thing): void {
    const gate = thing.gate!;
    this.seen.add(`gate:${thing.id}`);
    let view = this.gates.get(thing.id);
    if (!view) {
      view = {
        arch: this.add.image(0, 0, 'arch').setOrigin(0.5, 1),
        labels: gate.labels.map((label) =>
          this.add
            .text(0, 0, label, { fontFamily: fonts.mono, fontSize: '34px', fontStyle: 'bold', color: palette.yellow })
            .setOrigin(0.5),
        ),
      };
      this.gates.set(thing.id, view);
    }
    const s = scaleAt(thing.z);
    const alpha = Math.min(1, (SPAWN_Z - thing.z) / (SPAWN_Z - FADE_Z), 1 + thing.z / 300);
    view.arch.setPosition(VX, floorY(s)).setScale(s).setDepth(-thing.z).setAlpha(alpha);
    view.labels.forEach((label, lane) =>
      label.setPosition(laneX(lane, s), VY + (FLOOR_Y - LABEL_Y) * s).setScale(s).setDepth(-thing.z + 0.5).setAlpha(alpha),
    );
  }

  /** Colors the labels of gate `n` once it resolves: the right one green, a wrong pick red. */
  private markGate(n: number, correct: number, picked: number): void {
    const thing = this.world.things.find((th) => th.kind === 'gate' && th.n === n);
    const view = thing && this.gates.get(thing.id);
    if (!view) return;
    view.labels[correct].setColor(palette.ok);
    if (picked !== correct) view.labels[picked].setColor(palette.danger);
  }

  private effect(e: GameEvent): void {
    switch (e.type) {
      case 'hit':
        this.burst('danger', 40, laneX(e.lane, 1), PACKET_Y - 60);
        this.cameras.main.shake(250, 0.012);
        break;
      case 'ack':
        this.burst('cyan', 16, laneX(e.lane, 1), PACKET_Y - 60);
        this.float('+10', laneX(e.lane, 1), PACKET_Y - 140, palette.cyan, 30);
        break;
      case 'gateRight':
        this.markGate(e.n, e.lane, e.lane);
        this.burst('ok', 50, laneX(e.lane, 1), PACKET_Y - 60);
        this.float(`+${e.points.toLocaleString('en-US')}`, laneX(e.lane, 1), PACKET_Y - 160, palette.ok, 44);
        break;
      case 'gateWrong':
        this.markGate(e.n, e.correct, e.lane);
        this.cameras.main.flash(250, 255, 59, 92);
        break;
      case 'gameOver':
        this.burst('pink', 90, laneX(this.world.lane, 1), PACKET_Y - 60);
        break;
      default:
        break;
    }
  }

  private burst(kind: Burst, count: number, x: number, y: number): void {
    this.bursts.get(kind)!.explode(count, x, y);
  }

  /** A short text that drifts up and fades: +10, +200, ... */
  private float(text: string, x: number, y: number, color: string, size: number): void {
    const label = this.add
      .text(x, y, text, { fontFamily: fonts.display, fontSize: `${size}px`, color })
      .setOrigin(0.5)
      .setDepth(10)
      .setShadow(0, 0, color, 12, false, true);
    this.tweens.add({
      targets: label,
      y: y - 70,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }
}

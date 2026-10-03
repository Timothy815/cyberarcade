import * as Phaser from 'phaser';
import { fonts, hexToInt, palette } from '../../core/theme';
import { H, PLAYER_Y, W, type Controls, type EnemyKind, type GameEvent, type World } from './logic';
import { makeTextures } from './textures';

export interface SceneHooks {
  /** Read every frame: which keys are held right now. */
  controls(): Controls;
  /** Called every frame with what happened, after the scene has drawn it. */
  onEvents(events: GameEvent[], world: World): void;
}

type Entity = { id: number; x: number; y: number };
type Pool = Map<number, Phaser.GameObjects.Image>;
type Burst = 'pink' | 'cyan' | 'yellow' | 'ok' | 'danger';

const BURST_COLOR: Record<Burst, string> = {
  pink: palette.pink,
  cyan: palette.cyan,
  yellow: palette.yellow,
  ok: palette.ok,
  danger: palette.danger,
};
const KILL_BURST: Record<EnemyKind, Burst> = { virus: 'pink', worm: 'ok', wormlet: 'ok', trojan: 'danger', boss: 'yellow' };

/**
 * Draws the World. All game rules live in logic.ts; this class only mirrors the
 * world's entities as images every frame and turns events into effects.
 */
export class InvadersScene extends Phaser.Scene {
  private readonly enemyPool: Pool = new Map();
  private readonly shotPool: Pool = new Map();
  private readonly bombPool: Pool = new Map();
  private readonly powerPool: Pool = new Map();
  private readonly seen = new Set<number>();
  private readonly bursts = new Map<Burst, Phaser.GameObjects.Particles.ParticleEmitter>();
  private starsNear!: Phaser.GameObjects.TileSprite;
  private starsFar!: Phaser.GameObjects.TileSprite;
  private player!: Phaser.GameObjects.Image;
  private shield!: Phaser.GameObjects.Image;

  constructor(
    private readonly world: World,
    private readonly hooks: SceneHooks,
  ) {
    super('invaders');
  }

  create(): void {
    makeTextures(this);
    this.starsFar = this.add.tileSprite(W / 2, H / 2, W, H, 'stars').setAlpha(0.45).setTileScale(0.6);
    this.starsNear = this.add.tileSprite(W / 2, H / 2, W, H, 'stars').setAlpha(0.8);
    this.player = this.add.image(this.world.player.x, PLAYER_Y, 'player').setDepth(5);
    this.shield = this.add.image(0, 0, 'shield').setDepth(6).setVisible(false);
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
    const events = this.world.step(delta / 1000, this.hooks.controls());
    this.draw(time / 1000, delta / 1000);
    for (const e of events) this.effect(e);
    this.hooks.onEvents(events, this.world);
  }

  private draw(t: number, dt: number): void {
    const w = this.world;
    this.starsFar.tilePositionY -= 40 * dt;
    this.starsNear.tilePositionY -= 110 * dt;

    // Blink while invulnerable after a hit; hide entirely once the game is over.
    this.player.setPosition(w.player.x, PLAYER_Y);
    this.player.setVisible(w.lives > 0 && (w.player.invuln === 0 || Math.floor(t * 12) % 2 === 0));
    this.shield.setVisible(w.player.shield && w.lives > 0);
    this.shield.setPosition(w.player.x, PLAYER_Y).setScale(1 + Math.sin(t * 6) * 0.04);

    this.sync(w.enemies, this.enemyPool, (e) => (e.kind === 'trojan' && e.disguised ? 'disguise' : e.kind), 3);
    for (const e of w.enemies) {
      const img = this.enemyPool.get(e.id)!;
      if (e.kind === 'boss') img.setAngle(Math.sin(t * 2) * 3);
      else img.setScale(1 + Math.sin(t * 7 + e.id) * 0.06);
    }
    this.sync(w.shots, this.shotPool, () => 'shot', 4);
    this.sync(w.bombs, this.bombPool, () => 'bomb', 4);
    this.sync(w.powerups, this.powerPool, (p) => p.kind, 4);
    for (const p of w.powerups) this.powerPool.get(p.id)!.setAngle(Math.sin(t * 4 + p.id) * 15);
  }

  /** Makes the pool hold exactly one image per entity, at its position, with the right texture. */
  private sync<T extends Entity>(items: T[], pool: Pool, texture: (item: T) => string, depth: number): void {
    this.seen.clear();
    for (const item of items) {
      this.seen.add(item.id);
      const key = texture(item);
      const img = pool.get(item.id);
      if (!img) {
        pool.set(item.id, this.add.image(item.x, item.y, key).setDepth(depth));
      } else {
        img.setPosition(item.x, item.y);
        if (img.texture.key !== key) img.setTexture(key);
      }
    }
    for (const [id, img] of pool) {
      if (!this.seen.has(id)) {
        img.destroy();
        pool.delete(id);
      }
    }
  }

  private effect(e: GameEvent): void {
    switch (e.type) {
      case 'hit':
        this.burst('yellow', 6, e.x, e.y);
        break;
      case 'kill':
        this.burst(KILL_BURST[e.kind], e.kind === 'boss' ? 120 : 22, e.x, e.y);
        this.float(`+${e.points.toLocaleString('en-US')}`, e.x, e.y, palette.yellow, e.kind === 'boss' ? 64 : 30);
        if (e.kind === 'boss') this.cameras.main.shake(600, 0.02);
        break;
      case 'split':
        this.burst('ok', 14, e.x, e.y);
        break;
      case 'reveal':
        this.burst('danger', 10, e.x, e.y);
        this.float('TROJAN!', e.x, e.y - 40, palette.danger, 28);
        break;
      case 'playerHit':
        if (e.shielded) {
          this.burst('ok', 30, e.x, e.y);
        } else {
          this.burst('cyan', 50, e.x, e.y);
          this.cameras.main.shake(300, 0.015);
        }
        break;
      case 'landed':
        this.burst('danger', 30, e.x, e.y);
        this.float('INFECTED!', e.x, e.y - 40, palette.danger, 36);
        this.cameras.main.flash(250, 255, 59, 92);
        break;
      case 'powerup':
        this.burst('cyan', 18, e.x, e.y);
        this.float(e.kind === 'patch' ? 'PATCH!' : e.kind === 'antivirus' ? 'ANTIVIRUS!' : 'BACKUP +1', e.x, e.y - 50, palette.cyan, 30);
        break;
      default:
        break;
    }
  }

  private burst(kind: Burst, count: number, x: number, y: number): void {
    this.bursts.get(kind)!.explode(count, x, y);
  }

  /** A short text that drifts up and fades: +100, TROJAN!, ... */
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

import type { ZzfxParams } from 'zzfx';
import type { Music } from './music';
import { safeLocalStorage, type KeyValueStore } from './storage';

export type SfxName = 'move' | 'select' | 'back' | 'error' | 'coin' | 'hit' | 'explode' | 'score' | 'type';

// ZzFX parameter lists (design new ones at https://killedbyapixel.github.io/ZzFX/).
export const SFX: Record<SfxName, ZzfxParams> = {
  move: [0.5, 0, 320, 0.01, 0.01, 0.04, 1, 1.6, , , , , , , , , , 0.5],
  select: [0.9, 0, 520, 0.02, 0.08, 0.2, 1, 1.8, , , 260, 0.06, , , , , , 0.7],
  back: [0.6, 0, 260, 0.01, 0.03, 0.08, 1, 1.2, -8],
  error: [0.9, 0, 140, 0.01, 0.1, 0.2, 2, 2.5, , , , , , 4],
  coin: [0.9, 0, 1200, , 0.04, 0.25, 1, 1.6, , , 500, 0.06],
  hit: [0.9, 0, 400, , 0.02, 0.12, 4, 2.4, , , , , , 1.5],
  explode: [1.1, 0, 80, 0.01, 0.2, 0.5, 4, 2.8, , , , , , 1.2, , 0.4],
  score: [0.9, 0, 700, 0.02, 0.1, 0.3, 1, 1.5, , , 300, 0.08, 0.05],
  type: [0.3, 0, 900, , 0.005, 0.02, 1, 1.2],
};

export const MUTE_KEY = 'cyberarcade.muted';
const SFX_VOLUME = 0.3;

export interface Audio {
  readonly muted: boolean;
  readonly unlocked: boolean;
  /** Must be called from a user gesture (the start splash). Loads ZzFX and resumes the AudioContext. */
  unlock(): Promise<void>;
  sfx(name: SfxName): void;
  playMusic(): void;
  stopMusic(): void;
  setMuted(muted: boolean): void;
  toggleMute(): boolean;
}

type Zzfx = (typeof import('zzfx'))['ZZFX'];

export function createAudio(store: KeyValueStore | null = safeLocalStorage()): Audio {
  let muted = false;
  try {
    muted = store?.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false;
  }
  let zz: Zzfx | null = null;
  let music: Music | null = null;
  let wantMusic = false;
  let unlocking: Promise<void> | null = null;
  const samples = new Map<SfxName, number[]>();

  const persist = () => {
    try {
      store?.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // ignore
    }
  };

  return {
    get muted() {
      return muted;
    },
    get unlocked() {
      return zz !== null;
    },
    async unlock() {
      unlocking ??= (async () => {
        // ZzFX creates its AudioContext at import time, so import only after a user gesture.
        const [{ ZZFX }, { createMusic }] = await Promise.all([import('zzfx'), import('./music')]);
        zz = ZZFX;
        zz.volume = SFX_VOLUME;
        music = createMusic(zz.audioContext);
        music.setMuted(muted);
      })();
      await unlocking;
      if (zz!.audioContext.state !== 'running') await zz!.audioContext.resume().catch(() => {});
      if (wantMusic) music?.start();
    },
    sfx(name) {
      if (muted || !zz) return;
      try {
        let s = samples.get(name);
        if (!s) {
          s = zz.buildSamples(...SFX[name]);
          samples.set(name, s);
        }
        zz.playSamples([s]);
      } catch {
        // Audio must never break a game.
      }
    },
    playMusic() {
      wantMusic = true;
      music?.start();
    },
    stopMusic() {
      wantMusic = false;
      music?.stop();
    },
    setMuted(m) {
      muted = m;
      music?.setMuted(m);
      persist();
    },
    toggleMute() {
      this.setMuted(!muted);
      return muted;
    },
  };
}

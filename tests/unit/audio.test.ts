import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAudio, MUTE_KEY, SFX } from '../../src/core/audio';
import type { KeyValueStore } from '../../src/core/storage';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

// Mock modules for testing concurrent unlock behavior
const createMusicSpy = vi.fn().mockReturnValue({
  playing: false,
  start: vi.fn(),
  stop: vi.fn(),
  setMuted: vi.fn(),
});

vi.mock('../../src/core/music', () => ({
  createMusic: createMusicSpy,
}));

vi.mock('zzfx', () => {
  const mockCtx = {
    state: 'suspended',
    resume: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn(),
    createDynamicsCompressor: vi.fn(),
    createDelay: vi.fn(),
    createBuffer: vi.fn(),
    createBufferSource: vi.fn(),
    createOscillator: vi.fn(),
    createBiquadFilter: vi.fn(),
    destination: {},
    currentTime: 0,
    sampleRate: 44100,
  };
  return {
    ZZFX: {
      volume: 0,
      sampleRate: 44100,
      audioContext: mockCtx,
      buildSamples: vi.fn().mockReturnValue([]),
      playSamples: vi.fn(),
    },
  };
});

describe('audio (before unlock)', () => {
  it('reads the saved mute setting', () => {
    expect(createAudio(memoryStore({ [MUTE_KEY]: '1' })).muted).toBe(true);
    expect(createAudio(memoryStore()).muted).toBe(false);
  });

  it('toggles and persists mute', () => {
    const store = memoryStore();
    const audio = createAudio(store);
    expect(audio.toggleMute()).toBe(true);
    expect(store.getItem(MUTE_KEY)).toBe('1');
    expect(createAudio(store).muted).toBe(true);
    expect(audio.toggleMute()).toBe(false);
    expect(store.getItem(MUTE_KEY)).toBe('0');
  });

  it('is a silent no-op before unlock', () => {
    const audio = createAudio(memoryStore());
    expect(audio.unlocked).toBe(false);
    expect(() => {
      audio.sfx('select');
      audio.playMusic();
      audio.stopMusic();
    }).not.toThrow();
  });

  it('works without storage', () => {
    const audio = createAudio(null);
    expect(audio.toggleMute()).toBe(true);
  });

  it('defines every sound effect', () => {
    for (const params of Object.values(SFX)) expect(params.length).toBeGreaterThan(3);
  });
});

describe('audio (concurrent unlock)', () => {
  beforeEach(() => {
    createMusicSpy.mockClear();
  });

  it('concurrent unlock() calls create only one music instance', async () => {
    const audio = createAudio(null);
    await Promise.all([audio.unlock(), audio.unlock()]);
    expect(createMusicSpy).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createAudio } from '../../src/core/audio';
import { createInput, type RootInput } from '../../src/core/input';
import { createScores } from '../../src/core/scores';
import { createShell, type Shell } from '../../src/core/shell';
import type { GameCabinet, GameContext, GameModule } from '../../src/core/types';

interface FakeGame extends GameModule {
  ctx?: GameContext;
  unmounts: number;
}

function fakeGame(mountImpl?: (ctx: GameContext) => void): FakeGame {
  const g: FakeGame = {
    unmounts: 0,
    mount(container, ctx) {
      g.ctx = ctx;
      container.append(Object.assign(document.createElement('p'), { className: 'fake' }));
      mountImpl?.(ctx);
    },
    unmount() {
      g.unmounts++;
    },
  };
  return g;
}

const cabFor = (game: GameModule): GameCabinet => ({
  kind: 'game',
  id: 'fake',
  title: 'Fake',
  tagline: '',
  category: 'arcade',
  controls: [['X', 'Y']],
  load: () => Promise.resolve(game),
});
const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key }));

describe('shell', () => {
  let input: RootInput;
  let layer: HTMLElement;
  let onExit: Mock<() => void>;
  let shell: Shell;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    input = createInput(window);
    layer = document.createElement('div');
    document.body.append(layer);
    onExit = vi.fn<() => void>();
    shell = createShell({ layer, audio: createAudio(null), input, scores: createScores(null), onExit });
  });
  afterEach(() => {
    input.destroy();
    layer.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounts the game in a game root and Esc returns to the hub cleanly', async () => {
    const game = fakeGame();
    const done = shell.launch(cabFor(game), true);
    expect(layer.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(shell.state).toBe('playing');
    expect(layer.querySelector('.game-root .fake')).not.toBeNull();
    press('Escape');
    await done;
    expect(game.unmounts).toBe(1);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(layer.hidden).toBe(true);
    expect(layer.children).toHaveLength(0);
    expect(input.handlerCount()).toBe(0);
    expect(shell.state).toBe('idle');
  });

  it('shows the title card first unless skipped', async () => {
    const game = fakeGame();
    const done = shell.launch(cabFor(game));
    expect(shell.state).toBe('title');
    expect(layer.querySelector('.title-card')).not.toBeNull();
    press('Escape');
    await done;
    expect(game.ctx).toBeUndefined();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('a throwing mount shows SYSTEM ERROR, then returns to the hub', async () => {
    const game = fakeGame(() => {
      throw new Error('boom');
    });
    const done = shell.launch(cabFor(game), true);
    await vi.advanceTimersByTimeAsync(0);
    expect(shell.state).toBe('error');
    expect(layer.querySelector('.system-error')).not.toBeNull();
    expect(game.unmounts).toBe(1);
    await vi.advanceTimersByTimeAsync(2_500);
    await done;
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('a runtime window error while playing triggers the crash guard', async () => {
    const game = fakeGame();
    const done = shell.launch(cabFor(game), true);
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('late') }));
    await vi.advanceTimersByTimeAsync(0);
    expect(shell.state).toBe('error');
    await vi.advanceTimersByTimeAsync(2_500);
    await done;
    expect(game.unmounts).toBe(1);
  });

  it('endRun tears the game down once and runs the results flow', async () => {
    const game = fakeGame();
    const done = shell.launch(cabFor(game), true);
    await vi.advanceTimersByTimeAsync(0);
    game.ctx!.endRun(0);
    game.ctx!.endRun(999);
    expect(game.unmounts).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(shell.state).toBe('results');
    expect(layer.querySelector('.game-over')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(5_000); // game over auto-continues; score 0 never qualifies
    expect(layer.querySelector('.leaderboard')).not.toBeNull();
    press('Escape');
    await done;
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('a qualifying score asks for initials and saves them', async () => {
    const scores = createScores(null);
    shell = createShell({ layer, audio: createAudio(null), input, scores, onExit });
    const game = fakeGame();
    const done = shell.launch(cabFor(game), true);
    await vi.advanceTimersByTimeAsync(0);
    game.ctx!.endRun(1500);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(layer.querySelector('.initials')).not.toBeNull();
    for (const k of ['z', 'a', 'k', 'Enter']) press(k);
    await vi.advanceTimersByTimeAsync(0);
    expect(layer.querySelector('li.me')?.textContent).toContain('ZAK');
    expect(scores.top('fake')[0]).toMatchObject({ initials: 'ZAK', score: 1500 });
    press('Escape');
    await done;
  });

  it('leaving the game idle for 60 s returns to the hub', async () => {
    const game = fakeGame();
    const done = shell.launch(cabFor(game), true);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    await done;
    expect(game.unmounts).toBe(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('ignores a second launch while one is running', async () => {
    const game = fakeGame();
    const done = shell.launch(cabFor(game), true);
    await shell.launch(cabFor(fakeGame()), true);
    await vi.advanceTimersByTimeAsync(0);
    expect(layer.querySelectorAll('.game-root')).toHaveLength(1);
    press('Escape');
    await done;
  });
});

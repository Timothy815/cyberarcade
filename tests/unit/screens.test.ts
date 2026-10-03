import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio } from '../../src/core/audio';
import { createInput, type RootInput } from '../../src/core/input';
import { gameOver, initialsEntry, leaderboard, titleCard, type ScreenDeps } from '../../src/core/ui/screens';
import type { GameCabinet } from '../../src/core/types';

const cab: GameCabinet = {
  kind: 'game',
  id: 'invaders',
  title: 'Malware Invaders',
  tagline: 't',
  category: 'arcade',
  controls: [['SPACE', 'Fire']],
};
const press = (key: string, repeat = false) => window.dispatchEvent(new KeyboardEvent('keydown', { key, repeat }));

describe('shared screens', () => {
  let input: RootInput;
  let deps: ScreenDeps;
  let ac: AbortController;
  beforeEach(() => {
    vi.useFakeTimers();
    input = createInput(window);
    ac = new AbortController();
    deps = { host: document.body, input, audio: createAudio(null), signal: ac.signal };
  });
  afterEach(() => {
    input.destroy();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('title card starts on Enter, ignores key repeat, and removes itself', async () => {
    const p = titleCard(deps, cab);
    expect(document.querySelector('.title-card')?.textContent).toContain('Malware Invaders');
    press('Enter', true);
    press('Enter');
    await expect(p).resolves.toBe('start');
    expect(document.querySelector('.screen')).toBeNull();
    expect(input.handlerCount()).toBe(0);
  });

  it('title card goes back after 30 s idle', async () => {
    const p = titleCard(deps, cab);
    vi.advanceTimersByTime(30_000);
    await expect(p).resolves.toBe('back');
  });

  it('aborting resolves null and cleans up', async () => {
    const p = titleCard(deps, cab);
    ac.abort();
    await expect(p).resolves.toBeNull();
    expect(document.querySelector('.screen')).toBeNull();
    expect(input.handlerCount()).toBe(0);
  });

  it('game over ignores keys for the first second, then continues', async () => {
    const p = gameOver(deps, 1234);
    let settled = false;
    p.then(() => (settled = true));
    press('x');
    await Promise.resolve();
    expect(settled).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(document.querySelector('.final-score')?.textContent).toBe('1,234');
    press('x');
    await p;
    expect(settled).toBe(true);
  });

  it('initials entry flags text entry and returns typed letters', async () => {
    const p = initialsEntry(deps, 500);
    expect(document.body.dataset.textEntry).toBe('1');
    for (const k of ['z', 'a', 'k', 'Enter']) press(k);
    await expect(p).resolves.toBe('ZAK');
    expect(document.body.dataset.textEntry).toBeUndefined();
  });

  it('leaderboard highlights the new entry and returns again/hub', async () => {
    const entries = [
      { initials: 'AAA', score: 900, date: '' },
      { initials: 'ZAK', score: 500, date: '' },
    ];
    const p = leaderboard(deps, cab, entries, 1);
    expect(document.querySelector('li.me')?.textContent).toContain('ZAK');
    press('Enter');
    await expect(p).resolves.toBe('again');
    const p2 = leaderboard(deps, cab, [], -1);
    expect(document.querySelector('li.empty')).not.toBeNull();
    vi.advanceTimersByTime(15_000);
    await expect(p2).resolves.toBe('hub');
  });
});

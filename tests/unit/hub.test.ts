import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio, type Audio } from '../../src/core/audio';
import { createInput, type RootInput } from '../../src/core/input';
import { createScores, type Scores } from '../../src/core/scores';
import type { Cabinet, GameCabinet } from '../../src/core/types';
import { createHub, type Hub } from '../../src/hub/hub';

const game = (id: string, load = true): GameCabinet => ({
  kind: 'game',
  id,
  title: id,
  tagline: '',
  category: 'arcade',
  controls: [],
  load: load ? () => Promise.reject(new Error('not used')) : undefined,
});
const cabinets: Cabinet[] = [
  game('one'),
  game('soon', false),
  game('three'),
  { kind: 'link', id: 'classic', title: 'C', tagline: '', category: 'classic', href: 'https://example.com/', note: 'n' },
];
const press = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));
const selected = () => document.querySelector('.cabinet.is-center')?.getAttribute('data-id');

describe('hub', () => {
  let input: RootInput;
  let layer: HTMLElement;
  let scores: Scores;
  let hub: Hub;
  let audio: Audio;
  let onLaunch: ReturnType<typeof vi.fn<(cab: GameCabinet) => void>>;
  let assign: ReturnType<typeof vi.fn<(url: string) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    input = createInput(window);
    layer = document.createElement('div');
    document.body.append(layer);
    scores = createScores(null);
    onLaunch = vi.fn();
    assign = vi.fn();
    audio = createAudio(null);
    hub = createHub({ layer, cabinets, audio, input, scores, onLaunch, nav: { assign } });
    hub.show();
  });
  afterEach(() => {
    hub.hide();
    input.destroy();
    layer.remove();
    vi.useRealTimers();
  });

  it('rotates with the arrow keys', () => {
    expect(selected()).toBe('one');
    press('ArrowRight');
    expect(selected()).toBe('soon');
    press('ArrowLeft');
    press('ArrowLeft');
    expect(selected()).toBe('classic');
  });

  it('launches a playable game and hides itself', () => {
    press('Enter');
    expect(onLaunch).toHaveBeenCalledWith(cabinets[0]);
    expect(hub.visible).toBe(false);
    expect(layer.hidden).toBe(true);
    expect(input.handlerCount()).toBe(0);
  });

  it('does not launch a COMING SOON cabinet', () => {
    press('ArrowRight');
    press('Enter');
    expect(onLaunch).not.toHaveBeenCalled();
    expect(document.querySelector('[data-id="soon"]')?.classList.contains('shake')).toBe(true);
  });

  it('navigates for link cabinets', () => {
    press('ArrowLeft');
    press('Enter');
    expect(assign).toHaveBeenCalledWith('https://example.com/');
  });

  it('enters attract mode after 30 s and auto-advances', () => {
    vi.advanceTimersByTime(30_000);
    expect(hub.attract).toBe(true);
    vi.advanceTimersByTime(4_000);
    expect(selected()).toBe('soon');
  });

  it('the key that wakes attract mode does nothing else', () => {
    vi.advanceTimersByTime(30_000);
    press('Enter');
    expect(hub.attract).toBe(false);
    expect(onLaunch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(29_000);
    expect(hub.attract).toBe(false);
  });

  it('Ctrl+Alt+X asks before clearing scores', () => {
    scores.add('one', 'ZAK', 900);
    press('x', { ctrlKey: true, altKey: true, code: 'KeyX' });
    expect(document.querySelector<HTMLElement>('.confirm')!.hidden).toBe(false);
    press('n');
    expect(scores.top('one')).toHaveLength(1);
    press('x', { ctrlKey: true, altKey: true, code: 'KeyX' });
    press('y');
    expect(scores.top('one')).toHaveLength(0);
    expect(document.querySelector('[data-id="one"] .cab-score')?.textContent).toContain('NO SCORES');
  });

  it('the Ctrl+Alt+X confirm closes when attract mode starts', () => {
    press('x', { ctrlKey: true, altKey: true, code: 'KeyX' });
    expect(document.querySelector<HTMLElement>('.confirm')!.hidden).toBe(false);
    vi.advanceTimersByTime(30_000); // hub idle timeout -> attract mode
    expect(hub.attract).toBe(true);
    expect(document.querySelector<HTMLElement>('.confirm')!.hidden).toBe(true);
  });

  it('the Ctrl+Alt+X confirm auto-cancels after 10 s', () => {
    press('x', { ctrlKey: true, altKey: true, code: 'KeyX' });
    expect(document.querySelector<HTMLElement>('.confirm')!.hidden).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(document.querySelector<HTMLElement>('.confirm')!.hidden).toBe(true);
  });

  it('attract-mode auto-advance does not play the move sound', () => {
    const sfx = vi.spyOn(audio, 'sfx');
    vi.advanceTimersByTime(30_000); // enters attract mode
    sfx.mockClear();
    vi.advanceTimersByTime(4_000); // one auto-advance step
    expect(selected()).toBe('soon');
    expect(sfx).not.toHaveBeenCalledWith('move');
  });

  it('manual navigation still plays the move sound', () => {
    const sfx = vi.spyOn(audio, 'sfx');
    press('ArrowRight');
    expect(sfx).toHaveBeenCalledWith('move');
  });

  it('removes the shake class once the shake animation ends, so cab-float can resume', () => {
    press('ArrowRight');
    press('Enter');
    const card = document.querySelector('[data-id="soon"]')!;
    expect(card.classList.contains('shake')).toBe(true);
    card.dispatchEvent(new Event('animationend'));
    expect(card.classList.contains('shake')).toBe(false);
  });
});

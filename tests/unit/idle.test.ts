import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdleTimer } from '../../src/core/idle';

describe('idle timer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once after the timeout', () => {
    const onIdle = vi.fn();
    const t = createIdleTimer(1000, onIdle);
    t.start();
    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(t.running).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('reset pushes the deadline back', () => {
    const onIdle = vi.fn();
    const t = createIdleTimer(1000, onIdle);
    t.start();
    vi.advanceTimersByTime(800);
    t.reset();
    vi.advanceTimersByTime(800);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('reset does nothing when stopped', () => {
    const onIdle = vi.fn();
    const t = createIdleTimer(1000, onIdle);
    t.reset();
    vi.advanceTimersByTime(2000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('stop cancels the countdown', () => {
    const onIdle = vi.fn();
    const t = createIdleTimer(1000, onIdle);
    t.start();
    t.stop();
    vi.advanceTimersByTime(2000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});

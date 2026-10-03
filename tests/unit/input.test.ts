import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInput, createScopedInput, isTextEntry, type RootInput } from '../../src/core/input';

const key = (type: 'keydown' | 'keyup', k: string, code = k) => {
  const e = new KeyboardEvent(type, { key: k, code, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};

describe('input', () => {
  let input: RootInput;
  beforeEach(() => {
    input = createInput(window);
  });
  afterEach(() => {
    input.destroy();
    delete document.body.dataset.textEntry;
  });

  it('delivers keydown to handlers until unsubscribed', () => {
    const h = vi.fn();
    const off = input.onKey(h);
    key('keydown', 'Enter');
    off();
    key('keydown', 'Enter');
    expect(h).toHaveBeenCalledTimes(1);
    expect(h.mock.calls[0][0].key).toBe('Enter');
  });

  it('tracks held keys by code', () => {
    key('keydown', 'ArrowLeft');
    expect(input.isDown('ArrowLeft')).toBe(true);
    key('keyup', 'ArrowLeft');
    expect(input.isDown('ArrowLeft')).toBe(false);
  });

  it('clears held keys on window blur', () => {
    key('keydown', ' ', 'Space');
    window.dispatchEvent(new Event('blur'));
    expect(input.isDown('Space')).toBe(false);
  });

  it('suppresses default for arrows and space', () => {
    expect(key('keydown', 'ArrowDown').defaultPrevented).toBe(true);
    expect(key('keydown', 'a', 'KeyA').defaultPrevented).toBe(false);
  });

  it('reports any input for keys and pointer events', () => {
    const h = vi.fn();
    input.onAny(h);
    key('keydown', 'x', 'KeyX');
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('wheel'));
    expect(h).toHaveBeenCalledTimes(3);
  });

  it('a handler added during dispatch does not receive the same event', () => {
    const late = vi.fn();
    input.onKey(() => input.onKey(late));
    key('keydown', 'Enter');
    expect(late).not.toHaveBeenCalled();
  });

  it('a throwing handler does not stop a later handler, or the crash guard', () => {
    vi.useFakeTimers(); // the fallback schedules a real throw; never advance past it in this test
    const after = vi.fn();
    input.onKey(() => {
      throw new Error('boom');
    });
    input.onKey(after);
    expect(() => key('keydown', 'Enter')).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('counts handlers', () => {
    const off = input.onKey(() => {});
    input.onAny(() => {});
    expect(input.handlerCount()).toBe(2);
    off();
    expect(input.handlerCount()).toBe(1);
  });

  it('scoped input removes all of its handlers on dispose', () => {
    const scoped = createScopedInput(input);
    const h = vi.fn();
    scoped.onKey(h);
    scoped.onAny(h);
    scoped.onKeyUp(h);
    expect(input.handlerCount()).toBe(3);
    scoped.dispose();
    expect(input.handlerCount()).toBe(0);
    key('keydown', 'Enter');
    expect(h).not.toHaveBeenCalled();
    scoped.onKey(h); // late subscribe after dispose is ignored
    expect(input.handlerCount()).toBe(0);
  });

  it('detects text entry from the body flag or a focused input', () => {
    const e = new KeyboardEvent('keydown', { key: 'm' });
    expect(isTextEntry(e)).toBe(false);
    document.body.dataset.textEntry = '1';
    expect(isTextEntry(e)).toBe(true);
    delete document.body.dataset.textEntry;
    const field = document.createElement('input');
    document.body.append(field);
    const typed = new KeyboardEvent('keydown', { key: 'm', bubbles: true });
    let seen = false;
    field.addEventListener('keydown', (ev) => (seen = isTextEntry(ev)));
    field.dispatchEvent(typed);
    expect(seen).toBe(true);
    field.remove();
  });
});

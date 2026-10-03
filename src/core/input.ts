export type KeyHandler = (e: KeyboardEvent) => void;
export type AnyHandler = (e: Event) => void;

export interface Input {
  /** keydown handler. Returns an unsubscribe function. Menus should read e.key. */
  onKey(handler: KeyHandler): () => void;
  onKeyUp(handler: KeyHandler): () => void;
  /** Any keydown, pointerdown, pointermove or wheel. Used for idle timers and attract mode. */
  onAny(handler: AnyHandler): () => void;
  /** Held-key state by e.code ('ArrowLeft', 'Space', 'KeyA'). Used by action games. */
  isDown(code: string): boolean;
  /** Number of live handlers. Used by leak tests. */
  handlerCount(): number;
}

export interface RootInput extends Input {
  destroy(): void;
}

export interface ScopedInput extends Input {
  /** Removes every handler registered through this scope. */
  dispose(): void;
}

// Keys whose browser default (scrolling, activating a focused button) we always suppress.
const SUPPRESS = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** True while the player is typing (text field focused, or a screen set data-text-entry on <body>). */
export function isTextEntry(e: Event): boolean {
  return document.body.dataset.textEntry === '1' || isEditable(e.target);
}

export function createInput(target: Window = window): RootInput {
  const keyHandlers = new Set<KeyHandler>();
  const keyUpHandlers = new Set<KeyHandler>();
  const anyHandlers = new Set<AnyHandler>();
  const down = new Set<string>();

  const emit = <T>(set: Set<(e: T) => void>, e: T) => {
    for (const h of [...set]) h(e);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (SUPPRESS.has(e.key) && !isEditable(e.target)) e.preventDefault();
    down.add(e.code);
    emit(anyHandlers, e);
    emit(keyHandlers, e);
  };
  const onKeyUpEvt = (e: KeyboardEvent) => {
    down.delete(e.code);
    emit(keyUpHandlers, e);
  };
  const onOther = (e: Event) => emit(anyHandlers, e);
  const onBlur = () => down.clear();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUpEvt);
  target.addEventListener('pointerdown', onOther);
  target.addEventListener('pointermove', onOther);
  target.addEventListener('wheel', onOther);
  target.addEventListener('blur', onBlur);

  const sub = <T>(set: Set<T>, h: T) => {
    set.add(h);
    return () => void set.delete(h);
  };

  return {
    onKey: (h) => sub(keyHandlers, h),
    onKeyUp: (h) => sub(keyUpHandlers, h),
    onAny: (h) => sub(anyHandlers, h),
    isDown: (code) => down.has(code),
    handlerCount: () => keyHandlers.size + keyUpHandlers.size + anyHandlers.size,
    destroy() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUpEvt);
      target.removeEventListener('pointerdown', onOther);
      target.removeEventListener('pointermove', onOther);
      target.removeEventListener('wheel', onOther);
      target.removeEventListener('blur', onBlur);
      keyHandlers.clear();
      keyUpHandlers.clear();
      anyHandlers.clear();
      down.clear();
    },
  };
}

/** Wraps an Input so everything a game subscribes can be removed in one call. */
export function createScopedInput(parent: Input): ScopedInput {
  const offs = new Set<() => void>();
  let disposed = false;
  const track = (off: () => void) => {
    if (disposed) {
      off();
      return () => {};
    }
    offs.add(off);
    return () => {
      off();
      offs.delete(off);
    };
  };
  return {
    onKey: (h) => track(parent.onKey(h)),
    onKeyUp: (h) => track(parent.onKeyUp(h)),
    onAny: (h) => track(parent.onAny(h)),
    isDown: (code) => !disposed && parent.isDown(code),
    handlerCount: () => offs.size,
    dispose() {
      disposed = true;
      for (const off of offs) off();
      offs.clear();
    },
  };
}

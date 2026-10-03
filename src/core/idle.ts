export interface IdleTimer {
  readonly running: boolean;
  /** Starts (or restarts) the countdown. */
  start(): void;
  /** Restarts the countdown if it is running; does nothing otherwise. */
  reset(): void;
  stop(): void;
}

export function createIdleTimer(timeoutMs: number, onIdle: () => void): IdleTimer {
  let handle: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const clear = () => {
    if (handle !== undefined) clearTimeout(handle);
    handle = undefined;
  };
  const schedule = () => {
    clear();
    handle = setTimeout(() => {
      running = false;
      handle = undefined;
      onIdle();
    }, timeoutMs);
  };

  return {
    get running() {
      return running;
    },
    start() {
      running = true;
      schedule();
    },
    reset() {
      if (running) schedule();
    },
    stop() {
      running = false;
      clear();
    },
  };
}

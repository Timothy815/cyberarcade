/**
 * Shows a full-stage screen until build() calls done(result), or the signal aborts (result null).
 * build() returns a cleanup function that removes its timers and handlers.
 */
export function runScreen<R>(
  host: HTMLElement,
  className: string,
  signal: AbortSignal,
  build: (root: HTMLElement, done: (result: R) => void) => () => void,
): Promise<R | null> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(null);
    const root = document.createElement('div');
    root.className = `screen ${className}`;
    host.append(root);
    let finished = false;
    let cleanup: () => void = () => {};
    const finish = (result: R | null) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', onAbort);
      cleanup();
      root.remove();
      resolve(result);
    };
    const onAbort = () => finish(null);
    signal.addEventListener('abort', onAbort);
    cleanup = build(root, finish);
    if (finished) cleanup();
  });
}

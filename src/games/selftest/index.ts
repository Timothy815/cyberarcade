import type { GameContext, GameModule } from '../../core/types';

// Hidden diagnostics game (?selftest). Lets Playwright drive the whole shell flow:
// END RUN → results flow, THROW → crash guard, EXIT → hub. Counts mounts/unmounts for leak tests.

declare global {
  interface Window {
    __selftest?: { mounts: number; unmounts: number };
  }
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let offKey: (() => void) | null = null;
  let throwTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const stats = (window.__selftest ??= { mounts: 0, unmounts: 0 });
      stats.mounts++;
      root = document.createElement('div');
      root.className = 'selftest';
      root.innerHTML = `
        <h1>SELF TEST</h1>
        <p>keys: <span data-test="keys">0</span></p>
        <button data-test="end">END RUN</button>
        <button data-test="throw">THROW</button>
        <button data-test="exit">EXIT</button>`;
      container.append(root);
      const keys = root.querySelector<HTMLElement>('[data-test="keys"]')!;
      let count = 0;
      offKey = ctx.input.onKey(() => (keys.textContent = String(++count)));
      root.querySelector('[data-test="end"]')!.addEventListener('click', () => ctx.endRun(4242));
      root.querySelector('[data-test="exit"]')!.addEventListener('click', () => ctx.exit());
      root.querySelector('[data-test="throw"]')!.addEventListener('click', () => {
        throwTimer = setTimeout(() => {
          throw new Error('selftest crash');
        });
      });
    },
    unmount() {
      if (!root) return;
      window.__selftest!.unmounts++;
      clearTimeout(throwTimer);
      offKey?.();
      root.remove();
      root = null;
    },
  };
}

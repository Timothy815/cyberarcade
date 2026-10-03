// A fixed 1920×1080 design surface, scaled to fit its parent (letterboxed).
// Every HTML screen is laid out in stage pixels, so 1366×768 looks identical to 1920×1080.

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export function fitScale(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.min(width / STAGE_W, height / STAGE_H);
}

export interface Stage {
  el: HTMLElement;
  fit(): void;
  dispose(): void;
}

export function createStage(parent: HTMLElement, className = ''): Stage {
  const el = document.createElement('div');
  el.className = `stage ${className}`.trim();
  parent.append(el);
  const fit = () => {
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    el.style.setProperty('--stage-scale', String(fitScale(w, h)));
  };
  fit();
  window.addEventListener('resize', fit);
  return {
    el,
    fit,
    dispose() {
      window.removeEventListener('resize', fit);
      el.remove();
    },
  };
}

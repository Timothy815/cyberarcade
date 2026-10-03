// Single source of truth for colors, fonts and timings.
// HTML/CSS reads these through CSS custom properties (applyTheme); Phaser games use hexToInt().

export const palette = {
  cyan: '#00f0ff',
  pink: '#ff2e88',
  yellow: '#ffe259',
  deep: '#0e0020',
  purple: '#2a0750',
  ink: '#ffffff',
  inkDim: '#ffd1f0',
  grey: '#b9b9d0',
  danger: '#ff3b5c',
  ok: '#3dff9a',
} as const;

export const fonts = {
  display: "'Audiowide', sans-serif",
  ui: "'Space Grotesk', sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

export const timing = {
  hubIdleMs: 30_000, // hub → attract mode
  gameIdleMs: 60_000, // game → hub
  attractStepMs: 4_000,
  titleIdleMs: 30_000,
  gameOverMinMs: 1_000,
  gameOverAutoMs: 5_000,
  initialsIdleMs: 30_000,
  leaderboardMs: 15_000,
  errorScreenMs: 2_500,
} as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function cssVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(palette)) vars[`--c-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(fonts)) vars[`--f-${kebab(k)}`] = v;
  return vars;
}

export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(cssVars())) root.style.setProperty(k, v);
}

export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

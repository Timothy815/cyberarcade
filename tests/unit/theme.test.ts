import { describe, expect, it } from 'vitest';
import { applyTheme, cssVars, hexToInt, palette } from '../../src/core/theme';

describe('theme', () => {
  it('exposes palette and fonts as kebab-case CSS variables', () => {
    const vars = cssVars();
    expect(vars['--c-cyan']).toBe('#00f0ff');
    expect(vars['--c-ink-dim']).toBe(palette.inkDim);
    expect(vars['--f-display']).toContain('Audiowide');
    expect(vars['--f-mono']).toContain('JetBrains Mono');
  });

  it('applies variables to an element', () => {
    const el = document.createElement('div');
    applyTheme(el);
    expect(el.style.getPropertyValue('--c-pink')).toBe('#ff2e88');
  });

  it('converts hex colors to Phaser integers', () => {
    expect(hexToInt('#00f0ff')).toBe(0x00f0ff);
    expect(hexToInt('ff2e88')).toBe(0xff2e88);
  });
});

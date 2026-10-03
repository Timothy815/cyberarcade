import { describe, expect, it } from 'vitest';
import { createStage, fitScale } from '../../src/core/stage';

describe('fitScale', () => {
  it('is 1 at the design resolution', () => {
    expect(fitScale(1920, 1080)).toBe(1);
  });
  it('scales down to 1366x768', () => {
    expect(fitScale(1366, 768)).toBeCloseTo(0.7111, 3);
  });
  it('letterboxes by the tighter dimension', () => {
    expect(fitScale(1920, 1200)).toBe(1);
    expect(fitScale(2560, 1080)).toBe(1);
  });
  it('falls back to 1 for a zero-size parent', () => {
    expect(fitScale(0, 0)).toBe(1);
  });
});

describe('createStage', () => {
  it('appends a stage element and removes it on dispose', () => {
    const parent = document.createElement('div');
    const stage = createStage(parent, 'extra');
    expect(parent.querySelector('.stage.extra')).toBe(stage.el);
    expect(stage.el.style.getPropertyValue('--stage-scale')).not.toBe('');
    stage.dispose();
    expect(parent.children.length).toBe(0);
  });
});

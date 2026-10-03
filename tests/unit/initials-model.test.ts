import { describe, expect, it } from 'vitest';
import { initialInitials, reduceInitials, type InitialsState } from '../../src/core/ui/initials-model';

const run = (keys: string[], s: InitialsState = initialInitials()) => keys.reduce(reduceInitials, s);

describe('initials model', () => {
  it('starts at AAA on the first slot', () => {
    expect(initialInitials()).toEqual({ letters: ['A', 'A', 'A'], slot: 0, done: false });
  });

  it('cycles letters with up/down and wraps', () => {
    expect(run(['ArrowUp', 'ArrowUp']).letters[0]).toBe('C');
    expect(run(['ArrowDown']).letters[0]).toBe('Z');
  });

  it('moves between slots and clamps at the ends', () => {
    expect(run(['ArrowRight', 'ArrowRight', 'ArrowRight']).slot).toBe(2);
    expect(run(['ArrowLeft']).slot).toBe(0);
    expect(run(['ArrowRight', 'Backspace']).slot).toBe(0);
  });

  it('typing a letter sets it and advances', () => {
    expect(run(['z', 'a', 'k'])).toEqual({ letters: ['Z', 'A', 'K'], slot: 2, done: false });
  });

  it('Enter finishes, and later keys are ignored', () => {
    const s = run(['b', 'Enter']);
    expect(s.done).toBe(true);
    expect(reduceInitials(s, 'c')).toBe(s);
  });

  it('returns the same object for keys that change nothing', () => {
    const s = initialInitials();
    expect(reduceInitials(s, 'Shift')).toBe(s);
    expect(reduceInitials(s, '1')).toBe(s);
    expect(reduceInitials(s, 'ArrowLeft')).toBe(s);
  });
});

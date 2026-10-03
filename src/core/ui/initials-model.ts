// Pure state machine for the 3-letter initials picker (arcade style: ↑↓ letters, ←→ slot, or just type).

export interface InitialsState {
  letters: [string, string, string];
  slot: 0 | 1 | 2;
  done: boolean;
}

const A = 'A'.charCodeAt(0);
const shift = (ch: string, d: number) => String.fromCharCode(A + ((ch.charCodeAt(0) - A + d + 26) % 26));

export function initialInitials(): InitialsState {
  return { letters: ['A', 'A', 'A'], slot: 0, done: false };
}

export function reduceInitials(s: InitialsState, key: string): InitialsState {
  if (s.done) return s;
  const setLetter = (ch: string): InitialsState['letters'] => {
    const l = [...s.letters] as InitialsState['letters'];
    l[s.slot] = ch;
    return l;
  };
  const move = (d: number) => Math.max(0, Math.min(2, s.slot + d)) as InitialsState['slot'];
  switch (key) {
    case 'ArrowUp':
      return { ...s, letters: setLetter(shift(s.letters[s.slot], 1)) };
    case 'ArrowDown':
      return { ...s, letters: setLetter(shift(s.letters[s.slot], -1)) };
    case 'ArrowLeft':
    case 'Backspace':
      return s.slot === 0 ? s : { ...s, slot: move(-1) };
    case 'ArrowRight':
      return s.slot === 2 ? s : { ...s, slot: move(1) };
    case 'Enter':
      return { ...s, done: true };
  }
  if (/^[a-z]$/i.test(key)) return { ...s, letters: setLetter(key.toUpperCase()), slot: move(1) };
  return s;
}

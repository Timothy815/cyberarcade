import { describe, expect, it } from 'vitest';
import { highlight } from '../../src/games/bughunt/highlight';
import { SNIPPETS } from '../../src/games/bughunt/snippets';

const kinds = (line: string) => highlight(line).filter((t) => t.kind !== 'ws').map((t) => [t.kind, t.text]);

describe('bug hunt highlighter', () => {
  it('colours keywords, builtins, names, numbers and operators', () => {
    expect(kinds('def area(w, h):')).toEqual([
      ['kw', 'def'], ['name', 'area'], ['op', '('], ['name', 'w'], ['op', ','], ['name', 'h'], ['op', ')'], ['op', ':'],
    ]);
    expect(kinds('if len(x) >= 10.5:')).toEqual([
      ['kw', 'if'], ['builtin', 'len'], ['op', '('], ['name', 'x'], ['op', ')'], ['op', '>='], ['num', '10.5'], ['op', ':'],
    ]);
  });

  it('keeps strings and comments whole', () => {
    expect(kinds('print("a # b")  # say it')).toEqual([
      ['builtin', 'print'], ['op', '('], ['str', '"a # b"'], ['op', ')'], ['com', '# say it'],
    ]);
    expect(kinds("x = 'it\\'s'")).toEqual([['name', 'x'], ['op', '='], ['str', "'it\\'s'"]]);
  });

  it('copes with an unclosed string (a syntax-bug snippet)', () => {
    expect(kinds('print("hi)')).toEqual([['builtin', 'print'], ['op', '('], ['str', '"hi)']]);
  });

  it('round-trips every line of every snippet', () => {
    for (const s of SNIPPETS) {
      for (const line of [...s.code, s.fix]) {
        expect(highlight(line).map((t) => t.text).join('')).toBe(line);
      }
    }
  });
});

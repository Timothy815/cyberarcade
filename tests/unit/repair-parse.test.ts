import { describe, expect, it } from 'vitest';
import { parse, ParseError, type Expr } from '../../src/games/repair/parse';

/** The expression on the right of `x = <src>`. */
const expr = (src: string): Expr => {
  const [s] = parse([`x = ${src}`]);
  if (s.k !== 'assign') throw new Error('not an assignment');
  return s.e;
};

/** Renders an expression with full brackets, so precedence is easy to assert. */
const show = (e: Expr): string => {
  switch (e.k) {
    case 'num':
      return String(e.v);
    case 'var':
      return e.name;
    case 'read':
      return `read(${e.port})`;
    case 'un':
      return e.op === 'not' ? `(not ${show(e.e)})` : `(-${show(e.e)})`;
    case 'bin':
      return `(${show(e.a)} ${e.op} ${show(e.b)})`;
  }
};

const lineOf = (src: string[]): number => {
  try {
    parse(src);
  } catch (err) {
    if (err instanceof ParseError) return err.line;
    throw err;
  }
  throw new Error('parsed without error');
};

describe('repair parser', () => {
  it('parses every statement form', () => {
    const prog = parse([
      '# a comment',
      'n = 0',
      'while True:',
      '    x = read(UP)   # trailing comment',
      '',
      '    if x > 3:',
      '        write(DOWN, x)',
      '    elif x == 0:',
      '        pass',
      '    else:',
      '        n = n + 1',
    ]);
    expect(prog.map((s) => s.k)).toEqual(['assign', 'while']);
    const loop = prog[1];
    if (loop.k !== 'while') throw new Error();
    expect(loop.line).toBe(2);
    expect(loop.body.map((s) => s.k)).toEqual(['assign', 'if']);
    const branch = loop.body[1];
    if (branch.k !== 'if') throw new Error();
    expect(branch.branches.map((b) => b.line)).toEqual([5, 7]);
    expect(branch.branches[0].body[0]).toMatchObject({ k: 'write', line: 6, port: 'DOWN' });
    expect(branch.branches[1].body[0]).toMatchObject({ k: 'pass', line: 8 });
    expect(branch.orelse?.[0]).toMatchObject({ k: 'assign', line: 10, name: 'n' });
  });

  it('parses every expression form', () => {
    expect(show(expr('read(LEFT)'))).toBe('read(LEFT)');
    expect(show(expr('True'))).toBe('1');
    expect(show(expr('False'))).toBe('0');
    expect(show(expr('-x'))).toBe('(-x)');
    expect(show(expr('not x'))).toBe('(not x)');
    expect(show(expr('(a + b) * c'))).toBe('((a + b) * c)');
    for (const op of ['+', '-', '*', '//', '%', '^', '==', '!=', '<', '>', '<=', '>=', 'and', 'or']) {
      expect(show(expr(`a ${op} b`))).toBe(`(a ${op} b)`);
    }
  });

  it('follows Python precedence', () => {
    expect(show(expr('a + b * c'))).toBe('(a + (b * c))');
    expect(show(expr('a - b - c'))).toBe('((a - b) - c)');
    expect(show(expr('-a * b'))).toBe('((-a) * b)');
    expect(show(expr('a ^ b + c'))).toBe('(a ^ (b + c))');
    expect(show(expr('a < b ^ c'))).toBe('(a < (b ^ c))');
    expect(show(expr('not a == b'))).toBe('(not (a == b))');
    expect(show(expr('a or b and c'))).toBe('(a or (b and c))');
    expect(show(expr('not a and b'))).toBe('((not a) and b)');
    expect(show(expr('a % b // c'))).toBe('((a % b) // c)');
  });

  it('rejects mistakes with the right line number', () => {
    expect(lineOf(['x = 1', '  y = 2'])).toBe(1); // not a multiple of 4
    expect(lineOf(['while True:', '\tx = 1'])).toBe(1); // tab
    expect(lineOf(['x = 1', 'x = 2', '    y = 3'])).toBe(2); // unexpected indent
    expect(lineOf(['x = 1', 'print(x)'])).toBe(1); // unknown statement
    expect(lineOf(['x = UP'])).toBe(0); // port used as a value
    expect(lineOf(['x = 1', 'UP = 2'])).toBe(1); // port assigned
    expect(lineOf(['x = 1', 'while True', '    x = 2'])).toBe(1); // missing colon
    expect(lineOf(['if x:', 'y = 1'])).toBe(0); // missing block
    expect(lineOf(['x = 1', 'else:', '    x = 2'])).toBe(1); // else without if
    expect(lineOf(['x = read(UP) + read(LEFT)'])).toBe(0); // two reads
    expect(lineOf(['x = a < b < c'])).toBe(0); // chained comparison
    expect(lineOf(['x = 1 $ 2'])).toBe(0); // unknown character
    expect(lineOf(['write(SIDEWAYS, 1)'])).toBe(0); // bad port
  });

  it('shows 1-based line numbers in messages', () => {
    expect(() => parse(['x = 1', 'print(x)'])).toThrow('line 2: unknown statement');
  });
});

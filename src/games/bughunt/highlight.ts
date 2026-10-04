export type TokenKind = 'kw' | 'builtin' | 'str' | 'num' | 'com' | 'op' | 'name' | 'ws';

export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  'and', 'as', 'break', 'continue', 'def', 'elif', 'else', 'False', 'for', 'if', 'import',
  'in', 'is', 'None', 'not', 'or', 'pass', 'return', 'True', 'while',
]);
const BUILTINS = new Set(['int', 'len', 'list', 'print', 'range', 'sorted', 'str', 'sum', 'max', 'min']);

// Order matters: comments and strings first so their contents are never split up.
const RULES: [TokenKind, RegExp][] = [
  ['ws', /^\s+/],
  ['com', /^#.*/],
  ['str', /^"(?:[^"\\]|\\.)*"?|^'(?:[^'\\]|\\.)*'?/],
  ['num', /^\d+(?:\.\d+)?/],
  ['name', /^[A-Za-z_]\w*/],
  ['op', /^(?:\/\/|\*\*|[=!<>+\-*/%]=?|[()[\]{}:,.])/],
];

/** Splits one line of Python into coloured tokens. Joining the texts always gives back the line. */
export function highlight(line: string): Token[] {
  const out: Token[] = [];
  let rest = line;
  while (rest.length > 0) {
    let kind: TokenKind = 'op';
    let text = rest[0]; // anything unrecognised becomes a one-character token
    for (const [k, re] of RULES) {
      const m = re.exec(rest);
      if (m) {
        kind = k;
        text = m[0];
        break;
      }
    }
    if (kind === 'name') kind = KEYWORDS.has(text) ? 'kw' : BUILTINS.has(text) ? 'builtin' : 'name';
    out.push({ kind, text });
    rest = rest.slice(text.length);
  }
  return out;
}

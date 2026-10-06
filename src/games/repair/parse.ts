// Parser for Router Repair's tiny Python subset. Pure: lines of source in, a statement tree out.

export type Port = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export const PORTS: readonly Port[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

export type BinOp = 'or' | 'and' | '==' | '!=' | '<' | '>' | '<=' | '>=' | '^' | '+' | '-' | '*' | '//' | '%';

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'read'; port: Port }
  | { k: 'un'; op: '-' | 'not'; e: Expr }
  | { k: 'bin'; op: BinOp; a: Expr; b: Expr };

/** `line` is the 0-based index into the source lines, so a trace can point at it. */
export type Stmt =
  | { k: 'assign'; line: number; name: string; e: Expr }
  | { k: 'write'; line: number; port: Port; e: Expr }
  | { k: 'pass'; line: number }
  | { k: 'if'; branches: { line: number; cond: Expr; body: Stmt[] }[]; orelse: Stmt[] | null }
  | { k: 'while'; line: number; cond: Expr; body: Stmt[] };

export type Program = Stmt[];

export class ParseError extends Error {
  /** 0-based source line. The message shows it 1-based. */
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(`line ${line + 1}: ${message}`);
    this.name = 'ParseError';
  }
}

const KEYWORDS = new Set(['if', 'elif', 'else', 'while', 'pass', 'not', 'and', 'or', 'True', 'False', 'read', 'write']);
const COMPARE = new Set(['==', '!=', '<', '>', '<=', '>=']);
const TOKEN = /\s*(?:(\d+)|([A-Za-z_]\w*)|(\/\/|==|!=|<=|>=|[-+*%^<>=():,]))/y;

interface Line {
  line: number;
  level: number;
  toks: string[];
}

function tokenize(text: string, line: number): string[] {
  const toks: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    if (text.slice(TOKEN.lastIndex).trim() === '') break;
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(text);
    if (!m) throw new ParseError(line, `unexpected character '${text.slice(at).trim()[0]}'`);
    toks.push(m[1] ?? m[2] ?? m[3]);
  }
  return toks;
}

function splitLines(src: string[]): Line[] {
  const out: Line[] = [];
  src.forEach((raw, line) => {
    const hash = raw.indexOf('#');
    const text = hash >= 0 ? raw.slice(0, hash) : raw;
    if (text.trim() === '') return;
    const lead = /^[ \t]*/.exec(text)![0];
    if (lead.includes('\t')) throw new ParseError(line, 'use 4 spaces to indent, not tabs');
    if (lead.length % 4 !== 0) throw new ParseError(line, 'indentation must be a multiple of 4 spaces');
    out.push({ line, level: lead.length / 4, toks: tokenize(text, line) });
  });
  return out;
}

/** Expression parser over one line's tokens. Precedence climbs from `or` (loosest) to atoms. */
class ExprParser {
  private i = 0;
  reads = 0;

  constructor(
    private readonly toks: string[],
    private readonly line: number,
  ) {}

  peek(): string | undefined {
    return this.toks[this.i];
  }

  next(): string | undefined {
    return this.toks[this.i++];
  }

  expect(tok: string): void {
    const got = this.next();
    if (got !== tok) throw new ParseError(this.line, got === undefined ? `expected '${tok}'` : `expected '${tok}' but found '${got}'`);
  }

  atEnd(): boolean {
    return this.i >= this.toks.length;
  }

  port(): Port {
    const t = this.next();
    if (!PORTS.includes(t as Port)) throw new ParseError(this.line, `expected a port (UP, DOWN, LEFT, RIGHT) but found '${t ?? 'end of line'}'`);
    return t as Port;
  }

  expr(): Expr {
    return this.or();
  }

  private or(): Expr {
    let a = this.and();
    while (this.peek() === 'or') {
      this.next();
      a = { k: 'bin', op: 'or', a, b: this.and() };
    }
    return a;
  }

  private and(): Expr {
    let a = this.not();
    while (this.peek() === 'and') {
      this.next();
      a = { k: 'bin', op: 'and', a, b: this.not() };
    }
    return a;
  }

  private not(): Expr {
    if (this.peek() === 'not') {
      this.next();
      return { k: 'un', op: 'not', e: this.not() };
    }
    return this.compare();
  }

  private compare(): Expr {
    const a = this.xor();
    const op = this.peek();
    if (op === undefined || !COMPARE.has(op)) return a;
    this.next();
    const b = this.xor();
    const again = this.peek();
    if (again !== undefined && COMPARE.has(again)) throw new ParseError(this.line, 'chained comparisons are not supported');
    return { k: 'bin', op: op as BinOp, a, b };
  }

  private xor(): Expr {
    let a = this.sum();
    while (this.peek() === '^') {
      this.next();
      a = { k: 'bin', op: '^', a, b: this.sum() };
    }
    return a;
  }

  private sum(): Expr {
    let a = this.term();
    for (let op = this.peek(); op === '+' || op === '-'; op = this.peek()) {
      this.next();
      a = { k: 'bin', op, a, b: this.term() };
    }
    return a;
  }

  private term(): Expr {
    let a = this.unary();
    for (let op = this.peek(); op === '*' || op === '//' || op === '%'; op = this.peek()) {
      this.next();
      a = { k: 'bin', op, a, b: this.unary() };
    }
    return a;
  }

  private unary(): Expr {
    if (this.peek() === '-') {
      this.next();
      return { k: 'un', op: '-', e: this.unary() };
    }
    return this.atom();
  }

  private atom(): Expr {
    const t = this.next();
    if (t === undefined) throw new ParseError(this.line, 'expected a value');
    if (/^\d+$/.test(t)) return { k: 'num', v: Number(t) };
    if (t === 'True') return { k: 'num', v: 1 };
    if (t === 'False') return { k: 'num', v: 0 };
    if (t === '(') {
      const e = this.expr();
      this.expect(')');
      return e;
    }
    if (t === 'read') {
      this.expect('(');
      const port = this.port();
      this.expect(')');
      if (++this.reads > 1) throw new ParseError(this.line, 'only one read() per line');
      return { k: 'read', port };
    }
    if (PORTS.includes(t as Port)) throw new ParseError(this.line, `${t} is a port: use it only inside read() or write()`);
    if (/^[A-Za-z_]/.test(t) && !KEYWORDS.has(t)) return { k: 'var', name: t };
    throw new ParseError(this.line, `unexpected '${t}'`);
  }
}

/** Parses a whole condition or value: every token must be used. */
function fullExpr(p: ExprParser, line: number): Expr {
  const e = p.expr();
  if (!p.atEnd()) throw new ParseError(line, `unexpected '${p.peek()}'`);
  return e;
}

/** `if x:` style header: keyword, condition, then a final ':'. */
function header(l: Line): Expr {
  if (l.toks[l.toks.length - 1] !== ':') throw new ParseError(l.line, `expected ':' at the end of the ${l.toks[0]} line`);
  return fullExpr(new ExprParser(l.toks.slice(1, -1), l.line), l.line);
}

function simple(l: Line): Stmt {
  const [first, second] = l.toks;
  if (first === 'pass') {
    if (l.toks.length > 1) throw new ParseError(l.line, `unexpected '${second}'`);
    return { k: 'pass', line: l.line };
  }
  if (first === 'write' && second === '(') {
    const p = new ExprParser(l.toks.slice(2), l.line);
    const port = p.port();
    p.expect(',');
    const e = p.expr();
    p.expect(')');
    if (!p.atEnd()) throw new ParseError(l.line, `unexpected '${p.peek()}'`);
    return { k: 'write', line: l.line, port, e };
  }
  if (second === '=' && /^[A-Za-z_]\w*$/.test(first)) {
    if (PORTS.includes(first as Port)) throw new ParseError(l.line, `${first} is a port: use it only inside read() or write()`);
    if (KEYWORDS.has(first)) throw new ParseError(l.line, `can't assign to '${first}'`);
    return { k: 'assign', line: l.line, name: first, e: fullExpr(new ExprParser(l.toks.slice(2), l.line), l.line) };
  }
  throw new ParseError(l.line, 'unknown statement');
}

function block(lines: Line[], at: { i: number }, level: number): Stmt[] {
  const out: Stmt[] = [];
  while (at.i < lines.length) {
    const l = lines[at.i];
    if (l.level < level) break;
    if (l.level > level) throw new ParseError(l.line, 'unexpected indent');
    const kw = l.toks[0];
    if (kw === 'elif' || kw === 'else') throw new ParseError(l.line, `'${kw}' without a matching 'if'`);
    at.i++;
    if (kw === 'while') {
      out.push({ k: 'while', line: l.line, cond: header(l), body: body(lines, at, l) });
    } else if (kw === 'if') {
      const branches = [{ line: l.line, cond: header(l), body: body(lines, at, l) }];
      let orelse: Stmt[] | null = null;
      while (at.i < lines.length && lines[at.i].level === level) {
        const n = lines[at.i];
        if (n.toks[0] === 'elif') {
          at.i++;
          branches.push({ line: n.line, cond: header(n), body: body(lines, at, n) });
        } else if (n.toks[0] === 'else') {
          at.i++;
          if (n.toks.length !== 2 || n.toks[1] !== ':') throw new ParseError(n.line, "expected 'else:'");
          orelse = body(lines, at, n);
          break;
        } else break;
      }
      out.push({ k: 'if', branches, orelse });
    } else {
      out.push(simple(l));
    }
  }
  return out;
}

/** The indented block after a header line. It must exist and sit exactly one level deeper. */
function body(lines: Line[], at: { i: number }, head: Line): Stmt[] {
  const n = lines[at.i];
  if (!n || n.level !== head.level + 1) throw new ParseError(head.line, `expected an indented block after '${head.toks[0]}'`);
  return block(lines, at, head.level + 1);
}

/** Parses a node's source. Throws ParseError (with a 0-based line) on anything outside the subset. */
export function parse(src: string[]): Program {
  const lines = splitLines(src);
  const at = { i: 0 };
  if (lines.length > 0 && lines[0].level !== 0) throw new ParseError(lines[0].line, 'unexpected indent');
  return block(lines, at, 0);
}

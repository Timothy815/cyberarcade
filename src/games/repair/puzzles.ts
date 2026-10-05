// Router Repair's puzzles. Task 3 fills PUZZLES.

export interface Puzzle {
  id: string;
  tier: 1 | 2 | 3;
  title: string;
  goal: string;
  display: 'num' | 'letter';
  cols: 1 | 2 | 3;
  rows: 1 | 2;
  inCol: number;
  outCol: number;
  nodes: { col: number; row: number; code: string[] }[];
  /** Index into nodes, then into that node's code. code[line] holds the indentation plus `glitch`. */
  broken: { node: number; line: number };
  glitch: string;
  /** Candidate replacement lines, without indentation. */
  options: [string, string, string];
  answer: 0 | 1 | 2;
  hints: [string, string, string];
  inputs: number[];
}

export const PUZZLES: Puzzle[] = [];

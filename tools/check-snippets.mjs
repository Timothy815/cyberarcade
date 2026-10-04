// Proves every Bug Hunt snippet is honest: with the fix its check passes, with the bug it fails.
// Run: npm run check:snippets   (needs python3; Node strips the TypeScript types itself)
import { spawnSync } from 'node:child_process';
import { SNIPPETS } from '../src/games/bughunt/snippets.ts';

// print() output is swallowed so the checks run quietly.
const PRELUDE = 'import builtins\nbuiltins.print = lambda *a, **k: None\n';

function passes(lines, check) {
  const program = PRELUDE + lines.join('\n') + '\n' + check + '\n';
  return spawnSync('python3', ['-c', program], { encoding: 'utf8' }).status === 0;
}

let bad = 0;
for (const s of SNIPPETS) {
  const fixed = s.code.map((line, i) => (i === s.bug ? s.fix : line));
  const problems = [];
  if (!passes(fixed, s.check)) problems.push('fixed code fails its check');
  if (passes(s.code, s.check)) problems.push('buggy code passes its check');
  if (problems.length) {
    bad++;
    console.log(`✖ ${s.id}: ${problems.join('; ')}`);
  }
}
console.log(bad ? `${bad} of ${SNIPPETS.length} snippets are wrong` : `all ${SNIPPETS.length} snippets check out`);
process.exit(bad ? 1 : 0);

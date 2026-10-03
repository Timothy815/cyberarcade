import zxcvbn from 'zxcvbn';

// Scoring for Password Smash. All analysis happens in the page: passwords are never sent or stored.

export const ROUND_SECONDS = 30;
export const MAX_INPUT = 64;
const GUESSES_PER_SECOND_LOG10 = 4; // a slow online attack: 10,000 guesses per second
const YEAR = 31_557_600;

export interface Round {
  name: string;
  /** Shown on screen, e.g. 'MAX 10 CHARACTERS'. */
  rule: string;
  maxLength?: number;
  pattern?: RegExp;
  /** log10(guesses) needed to survive. */
  target: number;
  targetLabel: string;
}

export const ROUNDS: Round[] = [
  { name: 'WARM-UP', rule: 'ANY PASSWORD', target: 9, targetLabel: '1 DAY' },
  { name: 'SHORT', rule: 'MAX 10 CHARACTERS', maxLength: 10, target: 9.8, targetLabel: '1 WEEK' },
  { name: 'PASSPHRASE', rule: 'LOWERCASE AND SPACES ONLY', pattern: /^[a-z ]+$/, target: 14.5, targetLabel: '1,000 YEARS' },
  { name: 'FORTRESS', rule: 'MAX 16 CHARACTERS', maxLength: 16, target: 14.5, targetLabel: '1,000 YEARS' },
  { name: 'VAULT', rule: 'ANY PASSWORD', target: 17.5, targetLabel: '1 MILLION YEARS' },
];

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 'S'}`;

/** Human crack time for log10(guesses), assuming 10^4 guesses per second. */
export function formatCrackTime(guessesLog10: number): string {
  const seconds = 10 ** (guessesLog10 - GUESSES_PER_SECOND_LOG10);
  if (seconds < 1) return 'INSTANTLY';
  if (seconds < 60) return plural(Math.floor(seconds), 'SECOND');
  if (seconds < 3600) return plural(Math.floor(seconds / 60), 'MINUTE');
  if (seconds < 86_400) return plural(Math.floor(seconds / 3600), 'HOUR');
  if (seconds < YEAR) return plural(Math.floor(seconds / 86_400), 'DAY');
  const years = seconds / YEAR;
  if (years < 1e3) return plural(Math.floor(years), 'YEAR');
  if (years >= 1e15) return 'FOREVER';
  const [value, word] = years >= 1e12 ? [1e12, 'TRILLION'] : years >= 1e9 ? [1e9, 'BILLION'] : years >= 1e6 ? [1e6, 'MILLION'] : [1e3, 'THOUSAND'];
  return `${Math.floor(years / value).toLocaleString('en-US')} ${word} YEARS`;
}

/** The first rule the password breaks in this round, or null. */
export function brokenRule(password: string, round: Round): string | null {
  if (password.length === 0) return 'EMPTY';
  if (round.maxLength !== undefined && password.length > round.maxLength) return `MAX ${round.maxLength} CHARACTERS`;
  if (round.pattern && !round.pattern.test(password)) return round.rule;
  return null;
}

export interface Chip {
  label: string;
  good: boolean;
}

interface Match {
  pattern: string;
  token: string;
  dictionary_name?: string;
  l33t?: boolean;
}

/** Short feedback labels describing what the cracker found. */
export function chipsFor(password: string, sequence: readonly Match[]): Chip[] {
  const labels = new Map<string, boolean>();
  const bad = (label: string) => labels.set(label, false);
  for (const m of sequence) {
    switch (m.pattern) {
      case 'dictionary':
        if (m.dictionary_name === 'passwords') bad(m.token.length === password.length ? 'COMMON PASSWORD' : 'DICTIONARY WORD');
        else if (m.dictionary_name?.includes('names')) bad('NAME');
        else bad('DICTIONARY WORD');
        if (m.l33t) bad('L33T SWAP');
        break;
      case 'spatial': bad('KEYBOARD PATTERN'); break;
      case 'repeat': bad('REPEATS'); break;
      case 'sequence': bad('SEQUENCE'); break;
      case 'date': bad('DATE'); break;
      case 'regex': bad('YEAR'); break;
    }
  }
  if (password.length > 0 && password.length < 8) bad('TOO SHORT');
  if (password.length >= 16) labels.set('LONG', true);
  if (sequence.length > 0 && sequence.every((m) => m.pattern === 'bruteforce')) labels.set('NO PATTERNS FOUND', true);
  return [...labels].map(([label, good]) => ({ label, good }));
}

export interface Verdict {
  guessesLog10: number;
  crackTime: string;
  chips: Chip[];
  /** zxcvbn's one-line warning, '' if none. */
  warning: string;
  broken: string | null;
  survived: boolean;
  points: number;
}

export function judge(password: string, round: Round): Verdict {
  const broken = brokenRule(password, round);
  if (broken === 'EMPTY') return { guessesLog10: 0, crackTime: 'INSTANTLY', chips: [], warning: '', broken, survived: false, points: 0 };
  const result = zxcvbn(password.slice(0, MAX_INPUT));
  const g = result.guesses_log10;
  const survived = broken === null && g >= round.target;
  const points = broken ? 0 : Math.min(2000, Math.round(g * 100)) + (survived ? 500 : 0);
  return {
    guessesLog10: g,
    crackTime: formatCrackTime(g),
    chips: chipsFor(password, result.sequence as unknown as Match[]),
    warning: result.feedback.warning ?? '',
    broken,
    survived,
    points,
  };
}

import { describe, expect, it } from 'vitest';
import { brokenRule, chipsFor, formatCrackTime, judge, ROUNDS } from '../../src/games/password/logic';

const labels = (pw: string) => judge(pw, ROUNDS[0]).chips.map((c) => c.label);

describe('formatCrackTime', () => {
  it('formats each range', () => {
    expect(formatCrackTime(0.5)).toBe('INSTANTLY');
    expect(formatCrackTime(4)).toBe('1 SECOND');
    expect(formatCrackTime(5)).toBe('10 SECONDS');
    expect(formatCrackTime(6)).toBe('1 MINUTE');
    expect(formatCrackTime(8)).toBe('2 HOURS');
    expect(formatCrackTime(11.4)).toBe('290 DAYS');
    expect(formatCrackTime(11.5)).toBe('1 YEAR');
    expect(formatCrackTime(14)).toBe('316 YEARS');
    expect(formatCrackTime(14.5)).toBe('1 THOUSAND YEARS');
    expect(formatCrackTime(17.5)).toBe('1 MILLION YEARS');
    expect(formatCrackTime(20.33)).toBe('677 MILLION YEARS');
    expect(formatCrackTime(22.341)).toBe('69 BILLION YEARS');
    expect(formatCrackTime(30)).toBe('FOREVER');
  });
});

describe('round rules', () => {
  it('reports the broken rule', () => {
    expect(brokenRule('', ROUNDS[0])).toBe('EMPTY');
    expect(brokenRule('anything goes', ROUNDS[0])).toBeNull();
    expect(brokenRule('elevenchars', ROUNDS[1])).toBe('MAX 10 CHARACTERS');
    expect(brokenRule('tenchars!!', ROUNDS[1])).toBeNull();
    expect(brokenRule('Purple monkey', ROUNDS[2])).toBe('LOWERCASE AND SPACES ONLY');
    expect(brokenRule('purple monkey', ROUNDS[2])).toBeNull();
  });
});

describe('judge', () => {
  it('weak passwords crack instantly and score little', () => {
    const v = judge('password', ROUNDS[0]);
    expect(v.crackTime).toBe('INSTANTLY');
    expect(v.survived).toBe(false);
    expect(v.points).toBe(48);
    expect(v.chips).toContainEqual({ label: 'COMMON PASSWORD', good: false });
    expect(v.warning).not.toBe('');
  });

  it('passphrases survive the passphrase round and earn the bonus', () => {
    const v = judge('correct horse battery staple', ROUNDS[2]);
    expect(v.crackTime).toBe('677 MILLION YEARS');
    expect(v.survived).toBe(true);
    expect(v.points).toBe(2000 + 500);
  });

  it('breaking the rule scores zero even for a strong password', () => {
    const v = judge('kT9$wQ3&zM8^bNx', ROUNDS[1]);
    expect(v.broken).toBe('MAX 10 CHARACTERS');
    expect(v.points).toBe(0);
    expect(v.survived).toBe(false);
  });

  it('15 random characters survive FORTRESS', () => {
    const v = judge('kT9$wQ3&zM8^bNx', ROUNDS[3]);
    expect(v.survived).toBe(true);
    expect(v.points).toBe(1500 + 500);
  });

  it('empty input is a broken rule, no analysis', () => {
    expect(judge('', ROUNDS[0])).toMatchObject({ broken: 'EMPTY', points: 0, chips: [] });
  });

  it('labels the patterns the cracker found', () => {
    expect(labels('P@ssw0rd')).toEqual(expect.arrayContaining(['COMMON PASSWORD', 'L33T SWAP']));
    expect(labels('aaaaaaaa')).toContain('REPEATS');
    expect(labels('abcdefgh')).toContain('SEQUENCE');
    expect(labels('Tim2009')).toEqual(expect.arrayContaining(['NAME', 'YEAR', 'TOO SHORT']));
    expect(labels('Xq7#vL2!pR')).toEqual(['NO PATTERNS FOUND']);
    expect(labels('neon taco wizard galaxy 77!')).toContain('LONG');
  });

  it('dedupes chips and marks a partial password match as a dictionary word', () => {
    const chips = chipsFor('dragonfly', [
      { pattern: 'dictionary', token: 'dragon', dictionary_name: 'passwords' },
      { pattern: 'dictionary', token: 'fly', dictionary_name: 'english_wikipedia' },
    ]);
    expect(chips).toEqual([{ label: 'DICTIONARY WORD', good: false }]);
  });
});

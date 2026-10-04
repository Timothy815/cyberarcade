import { pick, shuffle, type Rng } from '../../core/random';

export interface Trivia {
  q: string;
  choices: [string, string, string, string];
  /** Index of the right choice. */
  answer: 0 | 1 | 2 | 3;
}

export const TRIVIA: Trivia[] = [
  { q: 'What does the S in HTTPS stand for?', choices: ['Secure', 'Simple', 'Server', 'Speed'], answer: 0 },
  { q: 'What is MFA?', choices: ['Multi-factor authentication', 'Main file access', 'Malware found alert', 'Many fast apps'], answer: 0 },
  { q: 'Which is the strongest password?', choices: ['Pepper2010!', 'P@ssw0rd', 'purple tractor moonlight', 'qwerty123'], answer: 2 },
  { q: 'A text says your package is stuck and links to a strange site. This is…', choices: ['A delivery update', 'Smishing (SMS phishing)', 'A firewall alert', 'A software update'], answer: 1 },
  { q: 'Which email sender is most likely a phish?', choices: ['support@apple.com', 'no-reply@amazon.com', 'security@paypa1-help.com', 'news@nytimes.com'], answer: 2 },
  { q: 'Why install software updates?', choices: ['They fix security holes', 'They change the colours', 'They free up battery', 'They delete viruses you have'], answer: 0 },
  { q: 'Malware that locks your files and demands payment is…', choices: ['Adware', 'Spyware', 'Ransomware', 'A worm'], answer: 2 },
  { q: 'Malware disguised as a useful program is a…', choices: ['Trojan', 'Worm', 'Cookie', 'Firewall'], answer: 0 },
  { q: 'Malware that spreads by itself across a network is a…', choices: ['Trojan', 'Worm', 'Keylogger', 'Patch'], answer: 1 },
  { q: 'A keylogger records…', choices: ['Your screen brightness', 'Every key you type', 'Your Wi-Fi speed', 'Your battery level'], answer: 1 },
  { q: 'What does a firewall do?', choices: ['Cools the computer', 'Filters network traffic', 'Speeds up downloads', 'Backs up files'], answer: 1 },
  { q: 'Which port does HTTPS usually use?', choices: ['21', '23', '80', '443'], answer: 3 },
  { q: 'Which port is plain, unencrypted web traffic (HTTP)?', choices: ['80', '443', '22', '3389'], answer: 0 },
  { q: 'SSH, for secure remote logins, uses port…', choices: ['22', '25', '53', '110'], answer: 0 },
  { q: 'Public Wi-Fi at a café is risky because…', choices: ['It is always slow', 'Others on it may see your traffic', 'It drains your battery', 'It needs a password'], answer: 1 },
  { q: 'What is phishing?', choices: ['Tricking people into giving up info', 'Fixing a slow network', 'Testing a firewall', 'Encrypting files'], answer: 0 },
  { q: 'A password manager helps you…', choices: ['Use one password everywhere', 'Use a unique strong password for every site', 'Share passwords with friends', 'Skip passwords'], answer: 1 },
  { q: 'Reusing one password on many sites is risky because…', choices: ['Sites charge more', 'One leak unlocks all your accounts', 'It is hard to type', 'It expires faster'], answer: 1 },
  { q: 'Social engineering attacks target…', choices: ['Hardware', 'People', 'Cables', 'Printers'], answer: 1 },
  { q: 'Which is personal info you should NOT post publicly?', choices: ['Your favourite colour', 'Your home address', 'A meme', 'A sunset photo'], answer: 1 },
  { q: 'What does VPN stand for?', choices: ['Virtual private network', 'Very public network', 'Verified password number', 'Video play node'], answer: 0 },
  { q: 'Encryption turns data into…', choices: ['A bigger file', 'Unreadable code without the key', 'A printed page', 'A virus'], answer: 1 },
  { q: 'A "brute force" attack…', choices: ['Breaks the screen', 'Tries every possible password', 'Sends spam email', 'Unplugs the router'], answer: 1 },
  { q: 'A "dictionary attack" tries…', choices: ['Only numbers', 'Common words and passwords', 'Random symbols only', 'Your fingerprint'], answer: 1 },
  { q: 'Which makes a password hardest to crack?', choices: ['Adding !', 'Swapping o for 0', 'Making it much longer', 'Capitalising the first letter'], answer: 2 },
  { q: 'A pop-up says "Your PC has 5 viruses! Call now!" You should…', choices: ['Call the number', 'Close it, it is a scam', 'Pay to fix it', 'Download its cleaner'], answer: 1 },
  { q: 'What is a "zero-day"?', choices: ['A holiday', 'A flaw with no fix yet', 'A new computer', 'A deleted file'], answer: 1 },
  { q: 'The padlock icon in your browser means…', choices: ['The site is safe and honest', 'The connection is encrypted', 'The site is government run', 'Pop-ups are blocked'], answer: 1 },
  { q: 'Which is a sign of a phishing email?', choices: ['Urgent "act now" pressure', 'Your correct name', 'A known sender', 'No links at all'], answer: 0 },
  { q: 'A DDoS attack tries to…', choices: ['Steal one password', 'Flood a site so nobody can use it', 'Fix broken links', 'Encrypt backups'], answer: 1 },
  { q: 'What is a "patch"?', choices: ['A fix for software', 'A type of virus', 'A network cable', 'A backup drive'], answer: 0 },
  { q: 'An attacker posing as IT on the phone asking for your password is…', choices: ['Normal', 'Vishing (voice phishing)', 'A firewall test', 'Encryption'], answer: 1 },
  { q: 'Why back up your files?', choices: ['To recover from ransomware or loss', 'To make them load faster', 'To hide them', 'To share them'], answer: 0 },
  { q: 'A strong passphrase is…', choices: ['Your pet and birth year', 'Several random words', 'One dictionary word', '123456'], answer: 1 },
  { q: 'Which is one of the three classic authentication factors?', choices: ['Something you know', 'Your screen size', 'Your browser colour', 'Your typing speed'], answer: 0 },
  { q: 'An app asks for your contacts, camera and location just to be a flashlight. You…', choices: ['Allow all', 'Deny, it does not need them', 'Share it with friends', 'Turn off updates'], answer: 1 },
  { q: 'What does a "white hat" hacker do?', choices: ['Steals data', 'Finds flaws with permission to fix them', 'Spreads worms', 'Sells passwords'], answer: 1 },
  { q: 'Telnet (port 23) is unsafe because…', choices: ['It is too fast', 'It sends everything in plain text', 'It only works on phones', 'It needs a VPN'], answer: 1 },
  { q: 'Before clicking a link in an email, you should…', choices: ['Click it fast', 'Hover to check where it really goes', 'Forward it to everyone', 'Reply with your password'], answer: 1 },
  { q: "Your friend's account messages you a weird link. Most likely…", choices: ['Their account was hacked', 'It is a gift', 'Your Wi-Fi is broken', 'A software update'], answer: 0 },
];

export type ChallengeKind = 'trivia' | 'caesar' | 'binary';

export interface Challenge {
  kind: ChallengeKind;
  /** The big line: the question, the scrambled word, or the bits. */
  prompt: string;
  /** Small helper line, e.g. 'SHIFT BACK 3'. '' for trivia. */
  detail: string;
  choices: string[];
  /** Index of the right choice. */
  answer: number;
  seconds: number;
}

export const TRIVIA_SECONDS = 10;
export const DECODE_SECONDS = 15;
export const DECODE_SHARE = 0.3;
export const CAESAR_WORDS = ['VIRUS', 'PATCH', 'CYBER', 'LOGIN', 'TOKEN', 'ROUTER', 'HACKER', 'SECRET', 'BACKUP', 'SHIELD', 'PIXEL', 'CODE', 'WORM', 'LOCK', 'DATA'];

const A = 'A'.charCodeAt(0);

/** Shifts each A–Z letter forward by `shift` (wrapping Z→A). */
export function caesar(word: string, shift: number): string {
  return word.replace(/[A-Z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - A + shift + 26) % 26) + A));
}

/** Puts `answer` among `others` in a random slot. */
function withAnswer(answer: string, others: string[], rng: Rng): { choices: string[]; answer: number } {
  const choices = shuffle([answer, ...others], rng);
  return { choices, answer: choices.indexOf(answer) };
}

export function makeCaesar(rng: Rng = Math.random): Challenge {
  const word = pick(CAESAR_WORDS, rng);
  const shift = 1 + Math.floor(rng() * 3);
  // Distractors share the answer's length, so letter-counting can't give it away.
  const others = shuffle(CAESAR_WORDS.filter((w) => w !== word && w.length === word.length), rng).slice(0, 3);
  return { kind: 'caesar', prompt: caesar(word, shift), detail: `SHIFT BACK ${shift}`, seconds: DECODE_SECONDS, ...withAnswer(word, others, rng) };
}

export const bits = (n: number) => n.toString(2).padStart(8, '0');

export function makeBinary(rng: Rng = Math.random): Challenge {
  const n = 1 + Math.floor(rng() * 255);
  // Distractors differ by exactly one bit, so every bit has to be read.
  const others = shuffle([0, 1, 2, 3, 4, 5, 6, 7].map((k) => n ^ (1 << k)).filter((m) => m >= 1), rng).slice(0, 3);
  return { kind: 'binary', prompt: bits(n), detail: '128 64 32 16 8 4 2 1', seconds: DECODE_SECONDS, ...withAnswer(String(n), others.map(String), rng) };
}

function fromTrivia(t: Trivia, rng: Rng): Challenge {
  const right = t.choices[t.answer];
  const others = t.choices.filter((_, i) => i !== t.answer);
  return { kind: 'trivia', prompt: t.q, detail: '', seconds: TRIVIA_SECONDS, ...withAnswer(right, others, rng) };
}

/** Endless challenge source: about 30% decodes, the rest trivia with no repeats until the bank runs out. */
export function createChallenges(rng: Rng = Math.random): () => Challenge {
  let deck: Trivia[] = [];
  return () => {
    if (rng() < DECODE_SHARE) return rng() < 0.5 ? makeCaesar(rng) : makeBinary(rng);
    if (deck.length === 0) deck = shuffle(TRIVIA, rng);
    return fromTrivia(deck.pop()!, rng);
  };
}

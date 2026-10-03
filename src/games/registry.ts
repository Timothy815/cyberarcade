import type { Cabinet, GameCabinet } from '../core/types';

// Hub order. Each game plan adds a `load` line to its cabinet when the game ships.
export const CABINETS: Cabinet[] = [
  {
    kind: 'game',
    id: 'invaders',
    title: 'Malware Invaders',
    tagline: 'Viruses, worms and trojans are swarming the network. Blast them before they land.',
    category: 'arcade',
    controls: [['← →', 'Move'], ['SPACE', 'Fire']],
  },
  {
    kind: 'game',
    id: 'phish',
    title: 'Phish or Legit',
    tagline: 'Emails, texts and links fly in fast. Can you spot the scam before the clock runs out?',
    category: 'learn',
    controls: [['←', 'Phish'], ['→', 'Legit']],
    load: () => import('./phish/index').then((m) => m.createGame()),
  },
  {
    kind: 'game',
    id: 'runner',
    title: 'Packet Runner',
    tagline: 'Race a data packet through the network. Dodge DDoS floods and take the right route.',
    category: 'arcade',
    controls: [['← →', 'Switch lane']],
  },
  {
    kind: 'game',
    id: 'password',
    title: 'Password Smash',
    tagline: 'Build a password and watch the cracking rig try to break it. How long will it last?',
    category: 'learn',
    controls: [['TYPE', 'Password'], ['ENTER', 'Crack it']],
  },
  {
    kind: 'game',
    id: 'defense',
    title: 'Firewall Defense',
    tagline: 'Place firewalls, IDS sensors and honeypots. Stop the botnet before it hits the server.',
    category: 'arcade',
    controls: [['MOUSE', 'Place & upgrade']],
  },
  {
    kind: 'game',
    id: 'port',
    title: 'Port Guardian',
    tagline: 'You are the firewall. Check each packet against the rulebook: allow or deny?',
    category: 'learn',
    controls: [['←', 'Allow'], ['→', 'Deny']],
  },
  {
    kind: 'game',
    id: 'bughunt',
    title: 'Bug Hunt',
    tagline: 'Every Python snippet hides one bug. Find the broken line before time runs out.',
    category: 'learn',
    controls: [['↑ ↓', 'Pick line'], ['ENTER', 'Squash']],
  },
  {
    kind: 'link',
    id: 'classic',
    title: "Classic '25",
    tagline: "Last year's Mini-Arcade. See how far we've come.",
    category: 'classic',
    href: 'https://timothy815.github.io/Mini-Arcade/',
    note: 'Press Alt+← to return',
  },
];

// Hidden test cabinet used by the Playwright suite (?selftest in the URL).
export const SELFTEST: GameCabinet = {
  kind: 'game',
  id: 'selftest',
  title: 'Self Test',
  tagline: 'Diagnostics cabinet for automated tests.',
  category: 'arcade',
  controls: [['CLICK', 'Buttons']],
  load: () => import('./selftest/index').then((m) => m.createGame()),
};

export function getCabinets(params: URLSearchParams = new URLSearchParams(location.search)): Cabinet[] {
  return params.has('selftest') ? [SELFTEST, ...CABINETS] : CABINETS;
}

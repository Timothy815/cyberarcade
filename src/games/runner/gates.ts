import { pick, shuffle, type Rng } from '../../core/random';
import { inNet, ipIn } from '../port/logic';

export type Tier = 'prefix' | 'cidr' | 'near';
export type Lane = 0 | 1 | 2;

export interface Gate {
  /** The address the packet is carrying, e.g. 192.168.4.17. */
  dest: string;
  /** One subnet label per lane, left to right. */
  labels: [string, string, string];
  /** The lane whose label contains `dest`. */
  correct: Lane;
  tier: Tier;
}

/** First two octets of the networks gates are drawn from. */
const BASES = ['10.0', '10.8', '172.16', '172.20', '192.168', '100.64'];

/** Gates 1–3 teach prefix matching, 4–6 introduce /24 notation, 7+ use look-alike networks. */
export function tierFor(n: number): Tier {
  return n <= 3 ? 'prefix' : n <= 6 ? 'cidr' : 'near';
}

/** The CIDR network a label stands for: a prefix label `a.b.c.x` means `a.b.c.0/24`. */
export function labelNet(label: string): string {
  return label.endsWith('.x') ? `${label.slice(0, -2)}.0/24` : label;
}

export function labelMatches(dest: string, label: string): boolean {
  return inNet(dest, labelNet(label));
}

const octet = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

/** Builds gate number `n`: a destination and three /24 labels of which exactly one contains it. */
export function makeGate(n: number, rng: Rng): Gate {
  const tier = tierFor(n);
  let nets: string[]; // three distinct "a.b.c" prefixes; nets[0] is the right one
  if (tier === 'near') {
    const base = pick(BASES, rng);
    const c = octet(rng, 1, 199);
    const lookAlikes = [...new Set([c - 1, c + 1, c + 10, c - 10, c * 10, c + 100])].filter((x) => x >= 0 && x <= 255 && x !== c);
    nets = [c, ...shuffle(lookAlikes, rng).slice(0, 2)].map((x) => `${base}.${x}`);
  } else {
    nets = shuffle(BASES, rng)
      .slice(0, 3)
      .map((b) => `${b}.${octet(rng, 0, 255)}`);
  }
  const dest = ipIn(`${nets[0]}.0/24`, rng);
  const correct = Math.floor(rng() * 3) as Lane;
  const wrong = nets.slice(1);
  const labels = [0, 1, 2].map((lane) => {
    const net = lane === correct ? nets[0] : wrong.shift()!;
    return tier === 'prefix' ? `${net}.x` : `${net}.0/24`;
  }) as [string, string, string];
  return { dest, labels, correct, tier };
}

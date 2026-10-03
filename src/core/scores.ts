import { safeLocalStorage, type KeyValueStore } from './storage';

export interface ScoreEntry {
  initials: string;
  score: number;
  date: string; // ISO timestamp
}

export interface Scores {
  top(gameId: string): ScoreEntry[];
  qualifies(gameId: string, score: number): boolean;
  /** Inserts the score; returns its 0-based rank, or -1 if it did not make the board. */
  add(gameId: string, initials: string, score: number, date?: Date): number;
  clearAll(): void;
}

export const SCORES_KEY = 'cyberarcade.scores.v1';
export const MAX_ENTRIES = 10;

// Three-letter combos that are rejected as initials. Kept short on purpose.
export const BLOCKLIST: ReadonlySet<string> = new Set([
  'ASS', 'CUM', 'COK', 'DIC', 'DIK', 'FAG', 'FCK', 'FKU', 'FUC', 'FUK', 'FUQ', 'HOE', 'JIZ',
  'KKK', 'KYS', 'NAZ', 'NGR', 'NIG', 'PNS', 'PUS', 'SEX', 'SHT', 'STD', 'TIT', 'VAG', 'WTF',
]);

export function sanitizeInitials(raw: string): string {
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (letters.length !== 3 || BLOCKLIST.has(letters)) return '???';
  return letters;
}

export function formatScore(n: number): string {
  return Math.max(0, Math.floor(n)).toLocaleString('en-US');
}

type Boards = Record<string, ScoreEntry[]>;

export function createScores(store: KeyValueStore | null = safeLocalStorage()): Scores {
  let memory: Boards = {}; // used when storage is unavailable or broken
  // Set once a write fails. Storage may still be readable but is now stale/out of sync with
  // memory (e.g. quota exceeded), so from then on we stop trusting it and only serve memory.
  let broken = false;

  const read = (): Boards => {
    if (!store || broken) return memory;
    try {
      const parsed: unknown = JSON.parse(store.getItem(SCORES_KEY) ?? '{}');
      return parsed && typeof parsed === 'object' ? (parsed as Boards) : {};
    } catch {
      return memory;
    }
  };

  const write = (boards: Boards) => {
    memory = boards;
    if (!store || broken) return;
    try {
      store.setItem(SCORES_KEY, JSON.stringify(boards));
    } catch {
      // Storage full or blocked: keep the in-memory copy, never crash the game.
      broken = true;
    }
  };

  const top = (gameId: string): ScoreEntry[] => {
    const list = read()[gameId];
    return Array.isArray(list) ? list.slice(0, MAX_ENTRIES) : [];
  };

  return {
    top,
    qualifies(gameId, score) {
      if (!(score > 0)) return false;
      const list = top(gameId);
      return list.length < MAX_ENTRIES || score > list[list.length - 1].score;
    },
    add(gameId, initials, score, date = new Date()) {
      if (!(score > 0)) return -1;
      const boards = read();
      const list = top(gameId);
      // Ties rank below existing equal scores: first to reach a score keeps the spot.
      let rank = list.findIndex((e) => score > e.score);
      if (rank === -1) rank = list.length;
      if (rank >= MAX_ENTRIES) return -1;
      list.splice(rank, 0, { initials: sanitizeInitials(initials), score: Math.floor(score), date: date.toISOString() });
      boards[gameId] = list.slice(0, MAX_ENTRIES);
      write(boards);
      return rank;
    },
    clearAll() {
      memory = {};
      if (!store) return;
      try {
        store.removeItem(SCORES_KEY);
      } catch {
        // ignore
      }
    },
  };
}

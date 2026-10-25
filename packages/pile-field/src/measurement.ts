import type { Pair } from '@buildkit/survey';
import type { Pile } from './field';

/**
 * One tape measurement between two piles. The tape is often hooked on a point behind one of
 * the piles (a peg, a rebar), which adds a fixed length to every reading from that pile:
 * that is the `correction`, and `correctionEnd` says which end it belongs to.
 */
export interface Measurement {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  /** Tape reading, mm; null while not measured yet. */
  readonly reading: number | null;
  /** Fixed extra length to subtract, mm. */
  readonly correction: number | null;
  readonly correctionEnd: 'a' | 'b';
}

/** Distance between the two nails: reading minus correction. */
export function correctedLength(m: Measurement): number | null {
  return m.reading == null ? null : m.reading - (m.correction ?? 0);
}

/** The pile the correction belongs to. */
export const correctionPile = (m: Measurement): string => (m.correctionEnd === 'a' ? m.a : m.b);

/**
 * Recommended measuring order for a two-row field: chains along the rows, full row lengths and
 * long diagonals (checks), cross ties, then both diagonals of every bay.
 */
export function recommendedPairs(piles: readonly Pile[]): Pair[] {
  const ys = [...new Set(piles.map((p) => p.y))].sort((a, b) => a - b);
  if (!ys.length) return [];
  const row = (y: number) => piles.filter((p) => p.y === y).sort((a, b) => a.x - b.x);
  const bot = row(ys[0]!);
  const top = ys.length > 1 ? piles.filter((p) => p.y !== ys[0]).sort((a, b) => a.x - b.x) : [];
  const pairs: Pair[] = [];
  const add = (p?: Pile, q?: Pile) => p && q && pairs.push({ a: p.id, b: q.id });
  for (const r of [bot, top]) for (let i = 0; i + 1 < r.length; i++) add(r[i], r[i + 1]);
  for (const r of [bot, top]) if (r.length > 2) add(r[0], r[r.length - 1]);
  if (bot.length > 2) {
    add(bot[0], top[top.length - 1]);
    add(bot[bot.length - 1], top[0]);
  }
  for (let i = 0; i < bot.length; i++) add(bot[i], top[i]);
  for (let i = 0; i + 1 < bot.length; i++) {
    add(bot[i], top[i + 1]);
    add(bot[i + 1], top[i]);
  }
  return pairs;
}

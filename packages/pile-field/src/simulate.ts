import { distance, type Vec2 } from '@buildkit/geometry';
import type { Pair } from '@buildkit/survey';
import type { Pile } from './field';

/** Deterministic PRNG (Park–Miller) for demos and tests. */
export function rng(seed = 1): () => number {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Actual stake positions with random set-out errors of `min..max` mm. */
export function scatter(piles: readonly Pile[], random: () => number, min = 2, max = 24): Map<string, Vec2> {
  return new Map(
    piles.map((p) => {
      const a = random() * 2 * Math.PI;
      const m = min + random() * (max - min);
      return [p.id, { x: p.x + m * Math.cos(a), y: p.y + m * Math.sin(a) }];
    }),
  );
}

/** Exact tape readings between actual positions (plus each pair's hook correction, if any). */
export function readings(actual: ReadonlyMap<string, Vec2>, pairs: readonly (Pair & { correction?: number | null })[]): number[] {
  return pairs.map((p) => distance(actual.get(p.a)!, actual.get(p.b)!) + (p.correction ?? 0));
}

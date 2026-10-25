import { distance } from '@buildkit/geometry';
import { requiredRank, rigidityRank } from './rigidity';
import { pairKey, type Pair, type Station } from './types';

export type NextObservation =
  | { readonly kind: 'fix'; readonly pair: Pair; readonly progress: Progress }
  | { readonly kind: 'check'; readonly pair: Pair; readonly progress: Progress }
  | { readonly kind: 'done'; readonly progress: Progress };

export interface Progress {
  /** Independent unknowns fixed so far / needed. */
  readonly rank: number;
  readonly need: number;
  /** Redundant (check) readings so far. */
  readonly checks: number;
  /** Recommended pairs measured / total. */
  readonly recommendedDone: number;
  readonly recommendedTotal: number;
}

export interface AdvisorInput {
  readonly stations: readonly Station[];
  /** Pairs that already have a reading. */
  readonly observed: readonly Pair[];
  /** Pairs listed but not read yet — preferred when they help. */
  readonly pending: readonly Pair[];
  /** The recommended measuring order for this kind of network. */
  readonly recommended: readonly Pair[];
}

/**
 * The single most useful next distance: until the network is rigid, the first candidate
 * (pending rows, then the recommended order, then any pair by length) that raises the rank —
 * i.e. actually adds information; afterwards the rest of the recommended set as checks.
 */
export function nextObservation({ stations, observed, pending, recommended }: AdvisorInput): NextObservation {
  const need = requiredRank(stations.length);
  const rank = observed.length ? rigidityRank(stations, observed) : 0;
  const done = new Set(observed.map((p) => pairKey(p.a, p.b)));
  const recommendedDone = recommended.filter((p) => done.has(pairKey(p.a, p.b))).length;
  const progress: Progress = {
    rank,
    need,
    checks: observed.length - rank,
    recommendedDone,
    recommendedTotal: recommended.length,
  };

  if (rank < need) {
    const all: (Pair & { d: number })[] = [];
    for (let i = 0; i < stations.length; i++)
      for (let j = i + 1; j < stations.length; j++)
        all.push({ a: stations[i]!.id, b: stations[j]!.id, d: distance(stations[i]!, stations[j]!) });
    all.sort((x, y) => x.d - y.d);
    const seen = new Set<string>();
    for (const c of [...pending, ...recommended, ...all]) {
      const k = pairKey(c.a, c.b);
      if (c.a === c.b || done.has(k) || seen.has(k)) continue;
      seen.add(k);
      if (rigidityRank(stations, [...observed, c]) > rank)
        return { kind: 'fix', pair: { a: c.a, b: c.b }, progress };
    }
  }
  const next = recommended.find((p) => !done.has(pairKey(p.a, p.b)));
  if (next) return { kind: 'check', pair: { a: next.a, b: next.b }, progress };
  return { kind: 'done', progress };
}

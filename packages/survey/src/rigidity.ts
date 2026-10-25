import { rank, zeros } from '@buildkit/geometry';
import type { Pair, Station } from './types';

/**
 * Independent unknowns of a planar network of `n` points measured only by distances:
 * 2 per point minus 3 for the rigid motion (shift + rotation) that distances cannot see.
 */
export const requiredRank = (n: number): number => Math.max(0, 2 * n - 3);

/**
 * Rank of the linearised distance equations at the design positions — how many independent
 * unknowns the given pairs fix. The network is rigid when this reaches {@link requiredRank}.
 * Collinear chains add no rank across the line (first order), which is exactly right: a middle
 * point pushed sideways changes its two distances only to second order.
 */
export function rigidityRank(stations: readonly Station[], pairs: readonly Pair[]): number {
  const n = stations.length;
  const idx = new Map(stations.map((s, i) => [s.id, i]));
  const A = zeros(2 * n);
  for (const { a, b } of pairs) {
    const i = idx.get(a);
    const j = idx.get(b);
    if (i == null || j == null || i === j) continue;
    const si = stations[i]!;
    const sj = stations[j]!;
    const dx = si.x - sj.x;
    const dy = si.y - sj.y;
    const d0 = Math.hypot(dx, dy);
    if (d0 < 1e-9) continue;
    addOuter(A, [
      [2 * i, dx / d0],
      [2 * i + 1, dy / d0],
      [2 * j, -dx / d0],
      [2 * j + 1, -dy / d0],
    ]);
  }
  return rank(A, 1e-6);
}

/** A += vᵀv for a sparse row v given as [column, value] entries. */
export function addOuter(A: number[][], row: readonly (readonly [number, number])[]): void {
  for (const [r1, c1] of row) {
    const target = A[r1]!;
    for (const [r2, c2] of row) target[r2]! += c1 * c2;
  }
}

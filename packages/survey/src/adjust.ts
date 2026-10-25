import { distance, inverse, solve, zeros, type Vec2 } from '@buildkit/geometry';
import { addOuter } from './rigidity';
import type { DistanceObservation, Station } from './types';

export interface Residual {
  readonly a: string;
  readonly b: string;
  readonly ref?: string;
  /** Observed (corrected) length. */
  readonly observed: number;
  /** Length between the adjusted positions. */
  readonly fitted: number;
  /** Length between the design positions. */
  readonly design: number;
  /** observed − fitted: what the adjustment could not absorb. */
  readonly misfit: number;
  /**
   * Redundancy number r ∈ [0, 1]: the share of this reading's own error that shows up in its
   * misfit. 0 = nothing else checks it; 1 = fully checked by the other readings.
   */
  readonly redundancy: number;
  /** Standardised residual (Baarda data snooping): misfit / (σ·√r); 0 when unchecked. */
  readonly w: number;
  /** Estimated error of this reading if it alone were wrong: misfit / r. */
  readonly blunder: number;
}

export interface Adjustment {
  /** Adjusted positions, in the frame of the design positions (gauge fixed by regularisation). */
  readonly positions: ReadonlyMap<string, Vec2>;
  readonly residuals: readonly Residual[];
  readonly rms: number;
  readonly used: readonly DistanceObservation[];
}

export interface AdjustOptions {
  /** Assumed precision of one reading, mm (1σ). */
  readonly sigma?: number;
  readonly iterations?: number;
}

/** Tiny Tikhonov term that fixes the free rigid motion (gauge) and keeps the normal matrix invertible. */
const GAUGE = 1e-3;

/** Observations that can be used: both ends known, distinct, positive length. */
export function usableObservations(
  stations: readonly Station[],
  obs: readonly DistanceObservation[],
): DistanceObservation[] {
  const ids = new Set(stations.map((s) => s.id));
  return obs.filter((o) => ids.has(o.a) && ids.has(o.b) && o.a !== o.b && o.length > 0);
}

/**
 * Non-linear least-squares adjustment of a distance network (Gauss–Newton from the design
 * positions). Returns null when there is nothing to adjust.
 */
export function adjustDistances(
  stations: readonly Station[],
  observations: readonly DistanceObservation[],
  { sigma = 1, iterations = 6 }: AdjustOptions = {},
): Adjustment | null {
  const n = stations.length;
  if (!n) return null;
  const used = usableObservations(stations, observations);
  if (!used.length) return null;
  const idx = new Map(stations.map((s, i) => [s.id, i]));
  const pos = stations.map((s) => [s.x, s.y] as [number, number]);
  const I = (id: string): number => idx.get(id)!;

  const jacobianRow = (o: DistanceObservation): [number, number][] | null => {
    const i = I(o.a);
    const j = I(o.b);
    const dx = pos[i]![0] - pos[j]![0];
    const dy = pos[i]![1] - pos[j]![1];
    const d0 = Math.hypot(dx, dy);
    if (d0 < 1e-9) return null;
    return [
      [2 * i, dx / d0],
      [2 * i + 1, dy / d0],
      [2 * j, -dx / d0],
      [2 * j + 1, -dy / d0],
    ];
  };
  const fittedLength = (o: DistanceObservation): number => {
    const i = I(o.a);
    const j = I(o.b);
    return Math.hypot(pos[i]![0] - pos[j]![0], pos[i]![1] - pos[j]![1]);
  };

  for (let iter = 0; iter < iterations; iter++) {
    const A = zeros(2 * n);
    const b = new Array<number>(2 * n).fill(0);
    for (const o of used) {
      const row = jacobianRow(o);
      if (!row) continue;
      const r = o.length - fittedLength(o);
      addOuter(A, row);
      for (const [ri, ci] of row) b[ri]! += ci * r;
    }
    for (let k = 0; k < 2 * n; k++) A[k]![k]! += GAUGE;
    const delta = solve(A, b);
    let step = 0;
    for (let i = 0; i < n; i++) {
      pos[i]![0] += delta[2 * i]!;
      pos[i]![1] += delta[2 * i + 1]!;
      step = Math.max(step, Math.hypot(delta[2 * i]!, delta[2 * i + 1]!));
    }
    if (step < 1e-7) break;
  }

  // redundancy numbers r = 1 − J_k N⁻¹ J_kᵀ at the solution
  const rows = used.map(jacobianRow);
  const N = zeros(2 * n);
  for (const row of rows) if (row) addOuter(N, row);
  for (let k = 0; k < 2 * n; k++) N[k]![k]! += GAUGE;
  const Ninv = inverse(N);

  const residuals: Residual[] = used.map((o, k) => {
    const row = rows[k];
    let h = 0;
    if (row) for (const [p, cp] of row) for (const [q, cq] of row) h += cp * Ninv[p]![q]! * cq;
    const r = Math.min(1, Math.max(0, 1 - h));
    const fitted = fittedLength(o);
    const misfit = o.length - fitted;
    const sa = stations[I(o.a)]!;
    const sb = stations[I(o.b)]!;
    return {
      a: o.a,
      b: o.b,
      ...(o.ref != null ? { ref: o.ref } : {}),
      observed: o.length,
      fitted,
      design: distance(sa, sb),
      misfit,
      redundancy: r,
      w: r > 0.02 ? misfit / (sigma * Math.sqrt(r)) : 0,
      blunder: r > 0.02 ? misfit / r : misfit,
    };
  });
  const rms = Math.sqrt(residuals.reduce((s, r) => s + r.misfit * r.misfit, 0) / residuals.length);
  const positions = new Map(stations.map((s, i) => [s.id, { x: pos[i]![0], y: pos[i]![1] }]));
  return { positions, residuals, rms, used };
}

export interface BlunderOptions {
  /** Standardised-residual threshold (|w| above it is suspicious). */
  readonly threshold?: number;
  /** Ignore implied errors smaller than this, mm (they don't matter for the result). */
  readonly minError: number;
  /** Additional "misclosure" limits kept from the simple tests. */
  readonly maxRms: number;
  readonly maxMisfit: number;
}

export interface BlunderReport {
  readonly suspect: boolean;
  /** The most suspicious reading (largest |w|), if any. */
  readonly worst?: Residual;
  /** Readings indistinguishable from the worst one (few checks → can't tell which is wrong). */
  readonly alike: readonly Residual[];
}

/**
 * Data snooping: flags a reading whose standardised residual is far beyond tape precision and
 * whose implied error on its own is large enough to matter; also the plain misclosure limits.
 */
export function findBlunders(adj: Adjustment, opts: BlunderOptions): BlunderReport {
  const threshold = opts.threshold ?? 5;
  const res = adj.residuals;
  const suspect =
    adj.rms > opts.maxRms ||
    res.some((r) => Math.abs(r.misfit) > opts.maxMisfit) ||
    res.some((r) => Math.abs(r.w) > threshold && Math.abs(r.blunder) > opts.minError);
  if (!suspect) return { suspect: false, alike: [] };
  const checked = res.filter((r) => r.redundancy > 0.02);
  const pool = checked.length ? checked : [...res];
  const worst = [...pool].sort(
    (x, y) => Math.abs(y.w) - Math.abs(x.w) || Math.abs(y.misfit) - Math.abs(x.misfit),
  )[0];
  const alike = worst
    ? checked.filter((r) => Math.abs(Math.abs(r.w) - Math.abs(worst.w)) < 0.05 * Math.abs(worst.w))
    : [];
  return { suspect: true, ...(worst ? { worst } : {}), alike };
}

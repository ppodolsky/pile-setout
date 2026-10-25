import { centroid, type RigidTransform, type Vec2 } from '@buildkit/geometry';
import type { Station } from '@buildkit/survey';

/** Extra working radius on top of the tolerance, mm — shared by the search and {@link needsMove}. */
const SLACK = 0.05;

/** The single "this pile must move" predicate — the same threshold the coverage search uses. */
export const needsMove = (offset: number, tolerance: number): boolean => offset > tolerance + SLACK + 1e-9;

/** Where to move one pile: from its actual position to its design position (field frame). */
export interface Correction {
  readonly id: string;
  readonly dx: number;
  readonly dy: number;
  readonly offset: number;
}

export interface Placement {
  /** Rigid placement of the design field over the actual one. */
  readonly transform: RigidTransform;
  readonly corrections: readonly Correction[];
  /** Piles already within tolerance (−1 when a pinned pile would have to move). */
  readonly score: number;
  readonly pinConflict: boolean;
  /** True when the angle branch-and-bound proved no placement needs fewer moves. */
  readonly proven: boolean;
}

/**
 * Measurements between piles cannot see a rigid motion of the whole field, so we choose the
 * rigid placement of the design field (rotation + shift, never scale) that leaves the most piles
 * within tolerance — that is the minimum number of moves.
 *
 * For a fixed angle, "a shift inside the most tolerance circles" is solved exactly (candidates
 * are circle centres and pairwise intersections). Angles: a grid around 0 and around pair
 * directions, local refinement, then a proof by branch-and-bound over the angle — for [lo, hi]
 * an upper bound on coverage is the exact answer with circles inflated by Lmax·(hi−lo)/2.
 * Running out of budget is reported honestly as `proven: false`.
 */
export function bestPlacement(
  design: readonly Station[],
  actual: readonly Vec2[],
  tolerance: number,
  pinned: ReadonlySet<string>,
  budget = defaultBudget(design.length),
): Placement | null {
  const n = design.length;
  if (!n) return null;
  const r = tolerance + SLACK;
  const c = centroid(design);
  const Lmax = Math.max(...design.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));

  // tolerance circle centres in shift space: q_i = F_i − C − R(θ)(D_i − C)
  const centres = (a: number): Vec2[] => {
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    return actual.map((f, i) => {
      const d = design[i]!;
      return {
        x: f.x - c.x - (cs * (d.x - c.x) - sn * (d.y - c.y)),
        y: f.y - c.y - (sn * (d.x - c.x) + cs * (d.y - c.y)),
      };
    });
  };

  const candidates = (q: readonly Vec2[], rr: number): Vec2[] => {
    const ts: Vec2[] = q.map((p) => ({ x: p.x, y: p.y }));
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const qi = q[i]!;
        const qj = q[j]!;
        const dx = qj.x - qi.x;
        const dy = qj.y - qi.y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-9 || d > 2 * rr) continue;
        const a0 = d / 2;
        const h = Math.sqrt(Math.max(0, rr * rr - a0 * a0));
        const ux = dx / d;
        const uy = dy / d;
        const mx = qi.x + ux * a0;
        const my = qi.y + uy * a0;
        ts.push({ x: mx - uy * h, y: my + ux * h }, { x: mx + uy * h, y: my - ux * h });
      }
    return ts;
  };

  let best: { a: number; t: Vec2; score: number; msq: number; pinBad: boolean } | null = null;
  const evalAngle = (a: number): void => {
    const q = centres(a);
    for (const t of candidates(q, r)) {
      let out = 0;
      let msq = 0;
      let pinBad = false;
      for (let i = 0; i < n; i++) {
        const m = Math.hypot(q[i]!.x - t.x, q[i]!.y - t.y);
        // +1e-9: intersection candidates sit on circle boundaries — fp noise must not drop them
        if (m > r + 1e-9) {
          out++;
          msq += m * m;
          if (pinned.has(design[i]!.id)) pinBad = true;
        }
      }
      const score = pinBad ? -1 : n - out;
      if (!best || score > best.score || (score === best.score && msq < best.msq)) best = { a, t, score, msq, pinBad };
    }
  };

  // stage 1: grid around 0 and around pair directions
  const base = [0];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a1 = Math.atan2(design[j]!.y - design[i]!.y, design[j]!.x - design[i]!.x);
      const a2 = Math.atan2(actual[j]!.y - actual[i]!.y, actual[j]!.x - actual[i]!.x);
      base.push(a2 - a1);
    }
  const step0 = (0.05 * Math.PI) / 180;
  const thetas = new Set<number>();
  for (const b of base) for (let d = -6; d <= 6; d++) thetas.add(Math.round((b + d * step0) / 1e-9) * 1e-9);
  for (const a of thetas) evalAngle(a);

  // stage 2: local refinement, halving the step while it improves
  let step = step0;
  for (let round = 0; round < 6 && step > 4e-5 && best; round++) {
    step /= 2;
    let improved = false;
    for (const d of [-2, -1, 1, 2]) {
      const prev = best;
      evalAngle((best as { a: number }).a + d * step);
      if (best !== prev) improved = true;
    }
    if (!improved) break;
  }

  // stage 3: proof of optimality by branch-and-bound over the angle
  const verify = (): boolean => {
    const stack: [number, number][] = [[-Math.PI, Math.PI]];
    let left = budget;
    while (stack.length) {
      if (left-- <= 0) return false;
      const [lo, hi] = stack.pop()!;
      const mid = (lo + hi) / 2;
      evalAngle(mid);
      const q = centres(mid);
      const rr = r + (Lmax * (hi - lo)) / 2;
      const rrB = rr + Math.max(1e-6, rr * 1e-9); // rounded outward: the bound can only overestimate
      let bound = 0;
      for (const t of candidates(q, rrB)) {
        let cov = 0;
        for (let i = 0; i < n; i++) if (Math.hypot(q[i]!.x - t.x, q[i]!.y - t.y) <= rrB + 1e-9) cov++;
        if (cov > bound) bound = cov;
      }
      if (bound <= best!.score) continue;
      if (hi - lo < 1e-7) return false;
      stack.push([lo, mid], [mid, hi]);
    }
    return true;
  };
  const proven = verify();
  const b = best as { a: number; t: Vec2; score: number; pinBad: boolean } | null;
  if (!b) return null;

  // corrections from the same q and t as the score, so the move list and the count agree bit for bit
  const q = centres(b.a);
  const corrections = q.map((qi, i) => ({
    id: design[i]!.id,
    dx: b.t.x - qi.x,
    dy: b.t.y - qi.y,
    offset: Math.hypot(qi.x - b.t.x, qi.y - b.t.y),
  }));
  return {
    transform: { angle: b.a, pivot: c, t: b.t },
    corrections,
    score: b.score,
    pinConflict: b.pinBad,
    proven,
  };
}

const defaultBudget = (n: number): number => Math.round(Math.min(5000, Math.max(800, 300000 / (n * n))));

/**
 * Lower bound on the number of moves: a pair whose actual distance differs from the design by
 * more than 2r forces at least one of its piles to move, so moves ≥ minimum vertex cover of the
 * conflict graph. Returns null for fields too large to enumerate.
 */
export function moveLowerBound(
  ids: readonly string[],
  pairs: readonly { a: string; b: string; actual: number; design: number }[],
  tolerance: number,
): number | null {
  const r = tolerance + SLACK;
  const idx = new Map(ids.map((id, i) => [id, i]));
  const edges = pairs
    .filter((p) => Math.abs(p.actual - p.design) > 2 * r)
    .map((p) => [idx.get(p.a)!, idx.get(p.b)!] as const);
  const n = ids.length;
  if (!edges.length) return 0;
  if (n > 20) return null;
  for (let k = 1; k < n; k++) {
    const cover = (start: number, chosen: number[]): boolean => {
      if (chosen.length === k) {
        const s = new Set(chosen);
        return edges.every(([a, b]) => s.has(a) || s.has(b));
      }
      for (let v = start; v < n; v++) {
        chosen.push(v);
        if (cover(v + 1, chosen)) return true;
        chosen.pop();
      }
      return false;
    };
    if (cover(0, [])) return k;
  }
  return n;
}

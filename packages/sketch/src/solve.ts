import { solve as linsolve, type Vec2 } from '@buildkit/geometry';
import { constraintPoints, equationCount, residuals, type Constraint } from './constraints';

export interface SketchPoint extends Vec2 {
  readonly id: string;
}

export interface SolveOptions {
  /** Drag a point to a target: it goes there as far as the constraints allow, the rest follows. */
  readonly drag?: { readonly id: string; readonly to: Vec2 };
  readonly iterations?: number;
  /** Residual above which a constraint counts as not satisfied, mm. */
  readonly tolerance?: number;
}

export interface SketchSolution {
  readonly positions: ReadonlyMap<string, Vec2>;
  /** Constraints that could not be satisfied (over-constrained and inconsistent). */
  readonly conflicts: readonly string[];
  /** Remaining degrees of freedom of the whole sketch (rigid motions included). */
  readonly dof: number;
  /** Points whose position is fully determined by the constraints. */
  readonly determined: ReadonlySet<string>;
  readonly converged: boolean;
}

/** Step damping per coordinate: tiny for ordinary points (they move as little as possible). */
const STAY = 1e-9;
/** A dragged point is much "heavier": the others give way around it, unless they are fixed. */
const HELD = 1e-2;

/**
 * Solves a sketch by Levenberg–Marquardt from the current positions. The damping is weighted per
 * coordinate, so directions the constraints leave free don't move at all (an under-constrained
 * sketch stays where it is) and satisfied constraints are met exactly. A dragged point starts at
 * the cursor and is the heaviest, so the rest of the sketch follows it as far as constraints allow.
 * Jacobians are central differences — robust for every constraint type; sketches here are small.
 * Also reports degrees of freedom and which points are fully determined.
 */
export function solveSketch(points: readonly SketchPoint[], constraints: readonly Constraint[], opts: SolveOptions = {}): SketchSolution {
  const n = points.length;
  const idx = new Map(points.map((p, i) => [p.id, i]));
  const valid = constraints.filter((c) => pointsOf(c).every((id) => idx.has(id)));
  const x = points.flatMap((p) => [p.x, p.y]);
  const weight = new Array<number>(2 * n).fill(STAY);
  const dragI = opts.drag ? idx.get(opts.drag.id) : undefined;
  if (dragI != null && opts.drag) {
    x[2 * dragI] = opts.drag.to.x;
    x[2 * dragI + 1] = opts.drag.to.y;
    weight[2 * dragI] = weight[2 * dragI + 1] = HELD;
  }
  const at = (v: number[]) => (id: string) => {
    const i = idx.get(id)!;
    return { x: v[2 * i]!, y: v[2 * i + 1]! };
  };
  const resid = (v: number[]): number[] => valid.flatMap((c) => residuals(c, at(v)));
  const cost = (r: number[]) => r.reduce((s, v) => s + v * v, 0);

  let lambda = 1e-3;
  let converged = false;
  let r = resid(x);
  let fx = cost(r);
  const m = 2 * n;
  for (let iter = 0; iter < (opts.iterations ?? 100) && n; iter++) {
    if (Math.max(0, ...r.map(Math.abs)) < 1e-10) {
      converged = true;
      break;
    }
    // Jacobian by central differences
    const J = r.map(() => new Array<number>(m).fill(0));
    const w = [...x];
    for (let k = 0; k < m; k++) {
      const h = 1e-6 * Math.max(1, Math.abs(x[k]!));
      w[k] = x[k]! + h;
      const rp = resid(w);
      w[k] = x[k]! - h;
      const rm = resid(w);
      w[k] = x[k]!;
      for (let e = 0; e < r.length; e++) J[e]![k] = (rp[e]! - rm[e]!) / (2 * h);
    }
    const A = Array.from({ length: m }, () => new Array<number>(m).fill(0));
    const g = new Array<number>(m).fill(0);
    for (let e = 0; e < r.length; e++) {
      const row = J[e]!;
      for (let i = 0; i < m; i++) {
        const ji = row[i]!;
        if (!ji) continue;
        g[i]! += ji * r[e]!;
        for (let j = 0; j < m; j++) if (row[j]) A[i]![j]! += ji * row[j]!;
      }
    }
    for (let i = 0; i < m; i++) A[i]![i]! += weight[i]! + lambda * A[i]![i]!;
    const step = linsolve(
      A,
      g.map((v) => -v),
    );
    const xn = x.map((v, i) => v + step[i]!);
    const rn = resid(xn);
    const fn = cost(rn);
    if (fn < fx) {
      for (let i = 0; i < m; i++) x[i] = xn[i]!;
      r = rn;
      fx = fn;
      lambda = Math.max(lambda / 3, 1e-12);
      if (Math.max(...step.map(Math.abs)) < 1e-12) {
        converged = true;
        break;
      }
    } else {
      lambda *= 4;
      if (lambda > 1e10) break;
    }
  }

  const positions = new Map(points.map((p, i) => [p.id, { x: x[2 * i]!, y: x[2 * i + 1]! }]));
  const tol = opts.tolerance ?? 1e-3;
  const conflicts = valid.filter((c) => residuals(c, at(x)).some((v) => Math.abs(v) > tol)).map((c) => c.id);
  const { dof, determined } = freedom(points, valid, x);
  return { positions, conflicts, dof, determined, converged: converged || conflicts.length === 0 };
}

const pointsOf = (c: Constraint): string[] => constraintPoints(c);

/**
 * Degrees of freedom from the rank of the constraint Jacobian; a point is determined when no
 * remaining free motion (null-space direction) moves it.
 */
export function freedom(points: readonly SketchPoint[], constraints: readonly Constraint[], x?: number[]) {
  const n = points.length;
  const v = x ?? points.flatMap((p) => [p.x, p.y]);
  const idx = new Map(points.map((p, i) => [p.id, i]));
  const at = (w: number[]) => (id: string) => {
    const i = idx.get(id)!;
    return { x: w[2 * i]!, y: w[2 * i + 1]! };
  };
  const rows: number[][] = [];
  const w = [...v];
  const scaleOf = (c: Constraint) => equationCount(c);
  for (const c of constraints) {
    const cols = pointsOf(c).flatMap((id) => [2 * idx.get(id)!, 2 * idx.get(id)! + 1]);
    const block = Array.from({ length: scaleOf(c) }, () => new Array<number>(2 * n).fill(0));
    for (const k of new Set(cols)) {
      const h = 1e-6 * Math.max(1, Math.abs(v[k]!));
      w[k] = v[k]! + h;
      const rp = residuals(c, at(w));
      w[k] = v[k]! - h;
      const rm = residuals(c, at(w));
      w[k] = v[k]!;
      for (let e = 0; e < block.length; e++) block[e]![k] = (rp[e]! - rm[e]!) / (2 * h);
    }
    rows.push(...block);
  }
  // reduced row echelon form → pivot columns; free columns span the null space
  const M = rows.map((r) => [...r]);
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < 2 * n && r < M.length; c++) {
    let p = r;
    for (let i = r + 1; i < M.length; i++) if (Math.abs(M[i]![c]!) > Math.abs(M[p]![c]!)) p = i;
    if (Math.abs(M[p]![c]!) < 1e-7) continue;
    [M[r], M[p]] = [M[p]!, M[r]!];
    const pr = M[r]!;
    const d = pr[c]!;
    for (let k = c; k < 2 * n; k++) pr[k]! /= d;
    for (let i = 0; i < M.length; i++) {
      if (i === r) continue;
      const f = M[i]![c]!;
      if (f) for (let k = c; k < 2 * n; k++) M[i]![k]! -= f * pr[k]!;
    }
    pivots.push(c);
    r++;
  }
  const free = Array.from({ length: 2 * n }, (_, c) => c).filter((c) => !pivots.includes(c));
  // null-space basis vector for each free column f: x_f = 1, x_pivot = −M[row][f]
  const moves = new Array<boolean>(2 * n).fill(false);
  for (const f of free) {
    moves[f] = true;
    pivots.forEach((pc, row) => {
      if (Math.abs(M[row]![f]!) > 1e-7) moves[pc] = true;
    });
  }
  const determined = new Set(points.filter((_, i) => !moves[2 * i] && !moves[2 * i + 1]).map((p) => p.id));
  return { dof: free.length, determined };
}

import type { Vec2 } from '@buildkit/geometry';

/**
 * Geometric constraints between points of a 2D sketch (CAD-style). Lengths in mm, angles in
 * degrees counter-clockwise, Y up. Every constraint is a set of scalar equations r(x) = 0.
 */
export type Constraint =
  /** Point pinned at (x, y). */
  | { readonly id: string; readonly kind: 'fix'; readonly p: string; readonly x: number; readonly y: number }
  /** |b − a| = d. */
  | { readonly id: string; readonly kind: 'distance'; readonly a: string; readonly b: string; readonly d: number }
  /** b.x − a.x = d (signed). */
  | { readonly id: string; readonly kind: 'dx'; readonly a: string; readonly b: string; readonly d: number }
  /** b.y − a.y = d (signed). */
  | { readonly id: string; readonly kind: 'dy'; readonly a: string; readonly b: string; readonly d: number }
  /** a and b on one horizontal line (same Y). */
  | { readonly id: string; readonly kind: 'horizontal'; readonly a: string; readonly b: string }
  /** a and b on one vertical line (same X). */
  | { readonly id: string; readonly kind: 'vertical'; readonly a: string; readonly b: string }
  /** Direction a → b at `angle` from the X axis, or from the direction a → `ref`. */
  | {
      readonly id: string;
      readonly kind: 'angle';
      readonly a: string;
      readonly b: string;
      readonly angle: number;
      readonly ref: string | null;
    }
  /** p = a + t·(b − a). */
  | { readonly id: string; readonly kind: 'ratio'; readonly p: string; readonly a: string; readonly b: string; readonly t: number }
  /** p on the line through a and b. */
  | { readonly id: string; readonly kind: 'onLine'; readonly p: string; readonly a: string; readonly b: string }
  /** a and b at the same place. */
  | { readonly id: string; readonly kind: 'coincident'; readonly a: string; readonly b: string }
  /** Line a–b parallel to line c–d. */
  | { readonly id: string; readonly kind: 'parallel'; readonly a: string; readonly b: string; readonly c: string; readonly d: string }
  /** Line a–b perpendicular to line c–d. */
  | { readonly id: string; readonly kind: 'perpendicular'; readonly a: string; readonly b: string; readonly c: string; readonly d: string }
  /** |a–b| = |c–d|. */
  | { readonly id: string; readonly kind: 'equal'; readonly a: string; readonly b: string; readonly c: string; readonly d: string };

export type ConstraintKind = Constraint['kind'];

/** Points a constraint involves. */
export function constraintPoints(c: Constraint): string[] {
  switch (c.kind) {
    case 'fix':
      return [c.p];
    case 'ratio':
    case 'onLine':
      return [c.p, c.a, c.b];
    case 'angle':
      return c.ref ? [c.a, c.b, c.ref] : [c.a, c.b];
    case 'parallel':
    case 'perpendicular':
    case 'equal':
      return [c.a, c.b, c.c, c.d];
    default:
      return [c.a, c.b];
  }
}

/** Number of scalar equations of a constraint. */
export const equationCount = (c: Constraint): number => (c.kind === 'fix' || c.kind === 'ratio' || c.kind === 'coincident' ? 2 : 1);

const RAD = Math.PI / 180;

/** Residuals of one constraint (mm), given point positions. */
export function residuals(c: Constraint, at: (id: string) => Vec2): number[] {
  switch (c.kind) {
    case 'fix': {
      const p = at(c.p);
      return [p.x - c.x, p.y - c.y];
    }
    case 'distance': {
      const a = at(c.a);
      const b = at(c.b);
      return [Math.hypot(b.x - a.x, b.y - a.y) - c.d];
    }
    case 'dx':
      return [at(c.b).x - at(c.a).x - c.d];
    case 'dy':
      return [at(c.b).y - at(c.a).y - c.d];
    case 'horizontal':
      return [at(c.b).y - at(c.a).y];
    case 'vertical':
      return [at(c.b).x - at(c.a).x];
    case 'angle': {
      const a = at(c.a);
      const b = at(c.b);
      let phi = c.angle * RAD;
      if (c.ref) {
        const r = at(c.ref);
        phi += Math.atan2(r.y - a.y, r.x - a.x);
      }
      // perpendicular offset of b from the ray (mm) — linear near the solution, scale-aware
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const cross = -vx * Math.sin(phi) + vy * Math.cos(phi);
      const along = vx * Math.cos(phi) + vy * Math.sin(phi);
      // pointing backwards is wrong too: penalise by the full length
      return [along >= 0 ? cross : Math.hypot(vx, vy) * Math.sign(cross || 1)];
    }
    case 'ratio': {
      const p = at(c.p);
      const a = at(c.a);
      const b = at(c.b);
      return [p.x - (a.x + c.t * (b.x - a.x)), p.y - (a.y + c.t * (b.y - a.y))];
    }
    case 'onLine': {
      const p = at(c.p);
      const a = at(c.a);
      const b = at(c.b);
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return [((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / L];
    }
    case 'coincident': {
      const a = at(c.a);
      const b = at(c.b);
      return [b.x - a.x, b.y - a.y];
    }
    case 'parallel':
    case 'perpendicular': {
      const u = unit(at(c.a), at(c.b));
      const w = unit(at(c.c), at(c.d));
      // sine (parallel) or cosine (perpendicular) of the angle, scaled by the second line's length → mm
      const L = Math.hypot(at(c.d).x - at(c.c).x, at(c.d).y - at(c.c).y);
      return [(c.kind === 'parallel' ? u.x * w.y - u.y * w.x : u.x * w.x + u.y * w.y) * L];
    }
    case 'equal': {
      const a = at(c.a);
      const b = at(c.b);
      const p = at(c.c);
      const q = at(c.d);
      return [Math.hypot(b.x - a.x, b.y - a.y) - Math.hypot(q.x - p.x, q.y - p.y)];
    }
  }
}

function unit(a: Vec2, b: Vec2): Vec2 {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
}

/** The value a dimensional constraint would have at the current positions (to create it "as is"). */
export function measure(kind: 'distance' | 'dx' | 'dy' | 'angle', a: Vec2, b: Vec2, ref?: Vec2): number {
  switch (kind) {
    case 'distance':
      return Math.hypot(b.x - a.x, b.y - a.y);
    case 'dx':
      return b.x - a.x;
    case 'dy':
      return b.y - a.y;
    case 'angle': {
      let deg = Math.atan2(b.y - a.y, b.x - a.x) / RAD;
      if (ref) deg -= Math.atan2(ref.y - a.y, ref.x - a.x) / RAD;
      return ((((deg + 180) % 360) + 360) % 360) - 180;
    }
  }
}

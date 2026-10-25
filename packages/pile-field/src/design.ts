import { solveSketch, type Constraint } from '@buildkit/sketch';
import type { Vec2 } from '@buildkit/geometry';

/**
 * In field work a pile is either measured and corrected with the tape network (`measure`), or set
 * out afterwards from piles already in place (`derive`) — e.g. a middle support on the string
 * between two corners.
 */
export type SetoutRole = 'measure' | 'derive';

/**
 * A pile of the design: a point of a constraint sketch. `x, y` are its current (solved) position
 * in mm — X along the containers, Y across, Y up. `id` is stable; `label` may be renamed.
 */
export interface Pile extends Vec2 {
  readonly id: string;
  readonly label: string;
  readonly setout: SetoutRole;
  /** One pile carrying the corner castings of two neighbouring containers. */
  readonly shared?: boolean;
}

/** A pile plan: piles plus the geometric constraints between them (CAD sketch). */
export interface PileDesign {
  readonly piles: readonly Pile[];
  readonly constraints: readonly Constraint[];
}

export interface DesignStatus {
  /** Constraints that cannot all hold together (shown in red). */
  readonly conflicts: ReadonlySet<string>;
  /** Piles fully determined by the constraints. */
  readonly determined: ReadonlySet<string>;
  /** Free degrees of freedom left in the sketch. */
  readonly dof: number;
}

/** Re-solves a design from its current positions; returns piles at the solved positions. */
export function solveDesign(design: PileDesign, drag?: { id: string; to: Vec2 }): { piles: Pile[]; status: DesignStatus } {
  const sol = solveSketch(design.piles, design.constraints, drag ? { drag } : {});
  const piles = design.piles.map((p) => {
    const q = sol.positions.get(p.id)!;
    return q.x === p.x && q.y === p.y ? p : { ...p, x: q.x, y: q.y };
  });
  return { piles, status: { conflicts: new Set(sol.conflicts), determined: sol.determined, dof: sol.dof } };
}

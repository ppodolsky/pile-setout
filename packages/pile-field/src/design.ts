import type { CadDocument, Element } from '@buildkit/cad';
import type { Vec2 } from '@buildkit/geometry';

/**
 * In field work a pile is either measured and corrected with the tape network (`measure`), or set
 * out afterwards from piles already in place (`derive`) — e.g. a middle support on the string
 * between two corners.
 */
export type SetoutRole = 'measure' | 'derive';

/** A pile: a CAD element on a point, with its physical properties. */
export interface PileElement extends Element {
  readonly type: 'pile';
  /** Square head side, mm. */
  readonly head: number;
  /** Shaft diameter, mm. */
  readonly diameter?: number;
  /** Depth below ground, mm. */
  readonly depth?: number;
  readonly setout: SetoutRole;
  /** One pile carrying the corner castings of two neighbouring containers. */
  readonly shared?: boolean;
}

/** A pile plan: the generic CAD document whose elements are piles. */
export type PileDesign = CadDocument<PileElement>;

/** A pile with its current position — what field work and drawings use. */
export interface Pile extends PileElement, Vec2 {}

export const isPile = (e: Element): e is PileElement => e.type === 'pile';

/** All piles of a design with their positions (from their points). */
export function pilesOf(doc: PileDesign): Pile[] {
  const at = new Map(doc.points.map((p) => [p.id, p]));
  return doc.elements.filter(isPile).flatMap((e) => {
    const p = at.get(e.point);
    return p ? [{ ...e, x: p.x, y: p.y }] : [];
  });
}

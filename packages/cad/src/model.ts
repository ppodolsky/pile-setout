import type { Vec2 } from '@buildkit/geometry';
import type { Constraint } from '@buildkit/sketch';

/** A point of the drawing (mm, Y up). Points carry no meaning by themselves. */
export interface Point extends Vec2 {
  readonly id: string;
}

/** A straight segment between two points. Construction lines are helpers (axes, string lines). */
export interface Line {
  readonly id: string;
  readonly a: string;
  readonly b: string;
  readonly construction?: boolean;
}

/**
 * Something real placed on a point — a pile, a column, a survey mark … Domains extend this with
 * their own `type` and properties; the CAD layer only knows it sits on `point` and has a label.
 */
export interface Element {
  readonly id: string;
  readonly type: string;
  readonly point: string;
  readonly label: string;
}

/** A constraint plus the entities it was made from (e.g. a line), so deleting them cascades. */
export type CadConstraint = Constraint & { readonly via?: readonly string[] };

/** A constraint before it gets an id. */
export type ConstraintDraft = CadConstraint extends infer C ? (C extends { id: string } ? Omit<C, 'id'> : never) : never;

/** A parametric 2D drawing: geometry, constraints between it, and domain elements on its points. */
export interface CadDocument<E extends Element = Element> {
  readonly points: readonly Point[];
  readonly lines: readonly Line[];
  readonly constraints: readonly CadConstraint[];
  readonly elements: readonly E[];
}

export const emptyDocument = <E extends Element = Element>(): CadDocument<E> => ({ points: [], lines: [], constraints: [], elements: [] });

/** What can be selected / referenced. */
export type EntityRef = { readonly kind: 'point'; readonly id: string } | { readonly kind: 'line'; readonly id: string };

import type { Vec2 } from '@buildkit/geometry';
import type { CadDocument, ConstraintDraft, DocumentStatus, Element, Removal, SelectionAction, SelectionContext } from '@buildkit/cad';

/**
 * What a CAD view needs from its owner (a tool's store). The view is generic; the owner decides
 * what a new point is (bare point, pile, …) and records changes (undo, persistence).
 */
export interface CadOps {
  movePoint(id: string, to: Vec2): void;
  setPointPosition(id: string, to: Vec2): void;
  /** A new point for a drawing tool (`tool` = 'point' or a domain tool id) with auto-constraints. */
  place(tool: string, at: Vec2, infer: (id: string) => ConstraintDraft[]): string;
  addLine(a: string, b: string): string;
  addConstraints(drafts: readonly ConstraintDraft[]): { added: string[]; redundant: number };
  updateConstraint(id: string, patch: Record<string, unknown>): void;
  remove(r: Removal): void;
  /** Runs a "create" selection action: a new point (what goes on it is the owner's call). */
  create(action: SelectionAction, ctx: SelectionContext): string;
}

export interface CadModel<E extends Element = Element> {
  readonly doc: CadDocument<E>;
  readonly status: DocumentStatus;
  /** Human label of a point (e.g. its pile's label), for lists and readouts. */
  readonly labelOf: (pointId: string) => string;
}

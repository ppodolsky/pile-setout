import { distance, type Vec2 } from '@buildkit/geometry';
import { constraintPoints, freedom, measure, solveSketch, type Constraint } from '@buildkit/sketch';
import type { CadConstraint, CadDocument, ConstraintDraft, Element, Point } from './model';

export interface DocumentStatus {
  /** Constraints that cannot all hold together. */
  readonly conflicts: ReadonlySet<string>;
  /** Points fully determined by the constraints. */
  readonly determined: ReadonlySet<string>;
  /** Free degrees of freedom left. */
  readonly dof: number;
}

const withPositions = <E extends Element>(doc: CadDocument<E>, pos: ReadonlyMap<string, Vec2>): CadDocument<E> => ({
  ...doc,
  points: doc.points.map((p) => {
    const q = pos.get(p.id)!;
    return q.x === p.x && q.y === p.y ? p : { ...p, x: q.x, y: q.y };
  }),
});

/** Re-solves the document from its current positions (points end up satisfying the constraints). */
export function solveDocument<E extends Element>(doc: CadDocument<E>): { doc: CadDocument<E>; status: DocumentStatus } {
  const sol = solveSketch(doc.points, doc.constraints);
  return {
    doc: withPositions(doc, sol.positions),
    status: { conflicts: new Set(sol.conflicts), determined: sol.determined, dof: sol.dof },
  };
}

/** Constraints whose value a drag may change: dimensions and anchors (not geometric relations). */
const DRIVEN = new Set<Constraint['kind']>(['fix', 'distance', 'dx', 'dy', 'angle']);

/** The same constraint re-measured at new positions. */
function remeasure(c: CadConstraint, at: (id: string) => Vec2): CadConstraint {
  switch (c.kind) {
    case 'fix':
      return { ...c, x: at(c.p).x, y: at(c.p).y };
    case 'distance':
    case 'dx':
    case 'dy':
      return { ...c, d: measure(c.kind, at(c.a), at(c.b)) };
    case 'angle':
      return { ...c, angle: measure('angle', at(c.a), at(c.b), c.ref ? at(c.ref) : undefined) };
    default:
      return c;
  }
}

/**
 * Drags a point towards `to`. Free geometry simply follows (others give way as constraints allow).
 * If the point is held by dimensions, those dimensions are driven by the drag — re-measured at the
 * new position — while geometric relations (horizontal, on line, midpoint, parallel …) still hold.
 */
export function dragPoint<E extends Element>(doc: CadDocument<E>, id: string, to: Vec2): CadDocument<E> {
  const first = solveSketch(doc.points, doc.constraints, { drag: { id, to } });
  if (distance(first.positions.get(id) ?? to, to) < 0.05) return withPositions(doc, first.positions);
  const driven = new Set(doc.constraints.filter((c) => DRIVEN.has(c.kind) && constraintPoints(c).includes(id)).map((c) => c.id));
  if (!driven.size) return withPositions(doc, first.positions);
  const relaxed = solveSketch(
    doc.points,
    doc.constraints.filter((c) => !driven.has(c.id)),
    { drag: { id, to } },
  );
  const at = (pid: string) => relaxed.positions.get(pid)!;
  return {
    ...withPositions(doc, relaxed.positions),
    constraints: doc.constraints.map((c) => (driven.has(c.id) ? remeasure(c, at) : c)),
  };
}

/** Moves a point exactly (typed coordinates): its anchor moves along, then everything re-solves. */
export function setPointPosition<E extends Element>(doc: CadDocument<E>, id: string, to: Vec2): CadDocument<E> {
  const constraints = doc.constraints.map((c) => (c.kind === 'fix' && c.p === id ? { ...c, x: to.x, y: to.y } : c));
  return dragPoint({ ...doc, constraints }, id, to);
}

/**
 * Adds constraints that actually remove freedom (one by one, in order) and re-solves. Redundant
 * ones — already implied by others — are skipped and counted, so the sketch never gets
 * over-constrained by a click.
 */
export function addConstraints<E extends Element>(
  doc: CadDocument<E>,
  drafts: readonly ConstraintDraft[],
  newId: () => string,
): { doc: CadDocument<E>; added: string[]; redundant: number } {
  let constraints = [...doc.constraints];
  let dof = freedom(doc.points, constraints).dof;
  const added: string[] = [];
  let redundant = 0;
  for (const d of drafts) {
    const c = { ...d, id: newId() } as CadConstraint;
    const next = freedom(doc.points, [...constraints, c]).dof;
    if (next < dof) {
      constraints = [...constraints, c];
      added.push(c.id);
      dof = next;
    } else redundant++;
  }
  if (!added.length) return { doc, added, redundant };
  return { doc: solveDocument({ ...doc, constraints }).doc, added, redundant };
}

export interface Removal {
  readonly points?: readonly string[];
  readonly lines?: readonly string[];
  readonly elements?: readonly string[];
  readonly constraints?: readonly string[];
}

/**
 * Removes entities with cascade: a point takes its lines, constraints and elements with it; a line
 * takes the constraints made from it; an element takes its point when nothing else uses that point.
 */
export function removeEntities<E extends Element>(doc: CadDocument<E>, r: Removal): CadDocument<E> {
  const elements = new Set(r.elements ?? []);
  const points = new Set(r.points ?? []);
  for (const e of doc.elements)
    if (elements.has(e.id) && !doc.elements.some((o) => o.point === e.point && !elements.has(o.id))) points.add(e.point);
  const lines = new Set(r.lines ?? []);
  for (const l of doc.lines) if (points.has(l.a) || points.has(l.b)) lines.add(l.id);
  const constraints = new Set(r.constraints ?? []);
  for (const c of doc.constraints)
    if (constraintPoints(c).some((p) => points.has(p)) || c.via?.some((v) => lines.has(v))) constraints.add(c.id);
  return {
    points: doc.points.filter((p) => !points.has(p.id)),
    lines: doc.lines.filter((l) => !lines.has(l.id)),
    constraints: doc.constraints.filter((c) => !constraints.has(c.id)),
    elements: doc.elements.filter((e) => !elements.has(e.id) && !points.has(e.point)),
  };
}

export const pointOf = (doc: CadDocument, id: string): Point | undefined => doc.points.find((p) => p.id === id);

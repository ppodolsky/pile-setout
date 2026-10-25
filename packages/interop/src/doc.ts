import { constraintPoints, type Constraint } from '@buildkit/sketch';
import type { InteropDocument, InteropLine, InteropPile, InteropPoint } from './model';

/** Thrown by exporters for a document that references missing points or has non-finite numbers. */
export class InteropError extends Error {
  override readonly name = 'InteropError';
}

/**
 * Checks that every id a line, pile or constraint uses exists, ids are unique and coordinates
 * finite. Exporters call it first so they never write a dangling reference.
 *
 * @throws InteropError listing every problem found.
 */
export function checkDocument(doc: InteropDocument): void {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const p of doc.points) {
    if (ids.has(p.id)) problems.push(`duplicate point id "${p.id}"`);
    ids.add(p.id);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) problems.push(`point "${p.id}" has a non-finite coordinate`);
  }
  const need = (id: string, what: string) => {
    if (!ids.has(id)) problems.push(`${what} references missing point "${id}"`);
  };
  for (const l of doc.lines) [l.a, l.b].forEach((id) => need(id, `line "${l.id}"`));
  for (const pile of doc.piles) need(pile.point, 'pile');
  for (const c of doc.constraints) constraintPoints(c).forEach((id) => need(id, `constraint "${c.id}"`));
  if (problems.length) throw new InteropError(`Invalid document: ${problems.join('; ')}`);
}

export const byId = <T extends { id: string }>(items: readonly T[]): Map<string, T> => new Map(items.map((i) => [i.id, i]));

/** Unordered key of a point pair. */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** The first line (construction or not) joining a and b in either direction, if any. */
export function lineBetween(lines: readonly InteropLine[], a: string, b: string): InteropLine | undefined {
  return lines.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
}

/** Pile at each point id (the first one wins if a document has two). */
export function pilesByPoint(piles: readonly InteropPile[]): Map<string, InteropPile> {
  const m = new Map<string, InteropPile>();
  for (const p of piles) if (!m.has(p.point)) m.set(p.point, p);
  return m;
}

/** The text shown next to a point: its own label, else its pile's label. */
export const pointText = (p: InteropPoint, pile: InteropPile | undefined): string | undefined => p.label ?? pile?.label;

/** Formats keep one label per point: a pile label that differs from its point's label is lost. */
export function labelWarnings(doc: InteropDocument): string[] {
  const pts = byId(doc.points);
  const lost = doc.piles.filter((p) => p.label && pts.get(p.point)?.label && p.label !== pts.get(p.point)?.label);
  return lost.length ? [`${lost.length} pile label(s) differ from their point's label — the point label is kept`] : [];
}

/** Warning for a constraint kind a format has no mapping for (keeps new kinds from vanishing silently). */
export const unsupportedConstraint = (c: Constraint | { id: string; kind: string }, format: string): string =>
  `constraint "${c.id}" (${c.kind}) has no ${format} equivalent — dropped`;

/** Bounding box of the points, or null for an empty document. */
export function bounds(points: readonly { x: number; y: number }[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Half the footprint of a pile (head square or shaft circle), mm. */
export const pileRadius = (pile: InteropPile | undefined): number => Math.max((pile?.head ?? 0) / 2, (pile?.diameter ?? 0) / 2);

/** Normalises an angle in degrees to (−180, 180]. */
export function normalizeDeg(deg: number): number {
  const r = ((((deg + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}

/** Positive, finite number or undefined (for optional pile sizes read from files). */
export const positive = (v: number | undefined): number | undefined => (v != null && Number.isFinite(v) && v > 0 ? v : undefined);

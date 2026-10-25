import { distance, projectT } from '@buildkit/geometry';
import { CONTAINER_WIDTH, CONTAINERS, type ContainerType } from './containers';

/** A pile of the design field. `id` is stable; `label` is what people see and may be renamed. */
export interface Pile {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  /** One pile carrying the corner castings of two neighbouring containers. */
  readonly shared?: boolean;
  /** Middle support: lies on the line between these two piles (ids) of the same row. */
  readonly mid?: { readonly a: string; readonly b: string };
}

export interface ContainerOutline {
  readonly type: ContainerType;
  readonly x0: number;
  readonly length: number;
  readonly width: number;
}

export interface FieldSpec {
  readonly containers: readonly ContainerType[];
  /** Square pile head side, mm. */
  readonly head: number;
  /** Container outer edge (string line) → outer side of the head, mm; 0 = flush. */
  readonly inset: number;
}

export const HEAD_RANGE = [50, 1000] as const;
export const INSET_RANGE = [0, 500] as const;

export interface Field {
  readonly piles: Pile[];
  readonly outlines: ContainerOutline[];
}

/**
 * Builds the pile field for containers joined end to end (short sides touching).
 * Corner piles sit `inset + head/2` in from the end and from the long side; every joint carries
 * ONE shared pile centred on the joint line; middle supports remember their two corner piles.
 */
export function buildField({ containers, head, inset }: FieldSpec): Field {
  const outlines: ContainerOutline[] = [];
  const cols: { x: number; shared?: boolean }[] = [];
  const spans: { xs: number; xe: number; mids: number[] }[] = [];
  const e = inset + head / 2;
  let x0 = 0;
  containers.forEach((type, k) => {
    const c = CONTAINERS[type];
    const hasNext = k + 1 < containers.length;
    const xs = k === 0 ? e : x0;
    const xe = hasNext ? x0 + c.length : x0 + c.length - e;
    const mids = c.mids.map((m) => x0 + m);
    spans.push({ xs, xe, mids });
    if (k === 0) cols.push({ x: e });
    for (const m of mids) cols.push({ x: m });
    cols.push(hasNext ? { x: x0 + c.length, shared: true } : { x: x0 + c.length - e });
    outlines.push({ type, x0, length: c.length, width: CONTAINER_WIDTH });
    x0 += c.length;
  });
  cols.sort((a, b) => a.x - b.x);
  const rows = [e, CONTAINER_WIDTH - e];
  const piles: Pile[] = [];
  for (const y of rows) for (const col of cols) piles.push({ id: '', label: '', x: col.x, y, ...(col.shared ? { shared: true } : {}) });
  const labelled = piles.map((p, i) => ({ ...p, id: `p${i + 1}`, label: `C${i + 1}` }));
  const at = (x: number, y: number) => labelled.findIndex((p) => p.x === x && p.y === y);
  for (const sp of spans)
    for (const y of rows)
      for (const xm of sp.mids) {
        const i = at(xm, y);
        labelled[i] = { ...labelled[i]!, mid: { a: labelled[at(sp.xs, y)]!.id, b: labelled[at(sp.xe, y)]!.id } };
      }
  return { piles: labelled, outlines };
}

/** How middle supports are handled: set from their corners (not measured) or measured like any pile. */
export type MidMode = 'derived' | 'measured';

/** True when the pile is set from its corners in this mode (and both corners still exist). */
export function isDerived(p: Pile, piles: readonly Pile[], mode: MidMode): boolean {
  return mode === 'derived' && !!p.mid && piles.some((q) => q.id === p.mid!.a) && piles.some((q) => q.id === p.mid!.b);
}

export interface DerivedPlacement {
  readonly from: Pile;
  readonly to: Pile;
  /** Fraction along from → to. */
  readonly t: number;
  /** Distance from `from`, mm (design). */
  readonly offset: number;
  readonly span: number;
}

/** Where a derived pile goes on the string between its corners. */
export function derivedPlacement(p: Pile, piles: readonly Pile[]): DerivedPlacement | null {
  if (!p.mid) return null;
  const from = piles.find((q) => q.id === p.mid!.a);
  const to = piles.find((q) => q.id === p.mid!.b);
  if (!from || !to) return null;
  const span = distance(from, to);
  const t = projectT(p, from, to);
  return { from, to, t, offset: t * span, span };
}

import type { CadConstraint, Line, Point } from '@buildkit/cad';
import { CONTAINER_WIDTH, CONTAINERS, type ContainerType } from './containers';
import type { PileDesign, PileElement } from './design';

export interface ContainerOutline {
  readonly type: ContainerType;
  readonly x0: number;
  readonly length: number;
  readonly width: number;
}

/** Parameters of the container template that generates a pile design. */
export interface TemplateSpec {
  readonly containers: readonly ContainerType[];
  /** Square pile head side, mm. */
  readonly head: number;
  /** Container outer edge (string line) → outer side of the head, mm; 0 = flush. */
  readonly inset: number;
}

export const HEAD_RANGE = [50, 1000] as const;
export const INSET_RANGE = [0, 500] as const;

export function containerOutlines(containers: readonly ContainerType[]): ContainerOutline[] {
  let x0 = 0;
  return containers.map((type) => {
    const o = { type, x0, length: CONTAINERS[type].length, width: CONTAINER_WIDTH };
    x0 += o.length;
    return o;
  });
}

/**
 * Generates a fully constrained pile design for containers joined end to end (short sides
 * touching): corner piles `inset + head/2` in from the end and the long side, ONE shared pile per
 * joint, intermediate supports on the line between their container's end piles.
 *
 * Geometry: a point per pile, and construction axis lines — one per row (the string line along the
 * containers) and one per main column (across). Constraints: the first point fixed; row and column
 * axes horizontal / vertical; ΔX between neighbouring main piles along the bottom row and ΔY across;
 * intermediate supports at the midpoint (20′) or on the row axis at their ΔX from the corner (40′).
 * Intermediate supports are set out from their corners in field work.
 */
export function generateDesign({ containers, head, inset }: TemplateSpec): PileDesign {
  const e = inset + head / 2;
  const rows = [e, CONTAINER_WIDTH - e];
  type Col = { x: number; shared?: boolean; mid?: { xs: number; xe: number } };
  const cols: Col[] = [];
  let x0 = 0;
  containers.forEach((type, k) => {
    const c = CONTAINERS[type];
    const hasNext = k + 1 < containers.length;
    const xs = k === 0 ? e : x0;
    const xe = hasNext ? x0 + c.length : x0 + c.length - e;
    if (k === 0) cols.push({ x: e });
    for (const m of c.mids) cols.push({ x: x0 + m, mid: { xs, xe } });
    cols.push(hasNext ? { x: x0 + c.length, shared: true } : { x: x0 + c.length - e });
    x0 += c.length;
  });
  cols.sort((a, b) => a.x - b.x);
  const n = cols.length;
  const idx = (row: number, col: number) => row * n + col + 1;
  const pt = (row: number, col: number) => `pt${idx(row, col)}`;

  const points: Point[] = [];
  const elements: PileElement[] = [];
  rows.forEach((y, r) =>
    cols.forEach((col, ci) => {
      points.push({ id: pt(r, ci), x: col.x, y });
      elements.push({
        id: `p${idx(r, ci)}`,
        type: 'pile',
        point: pt(r, ci),
        label: `C${idx(r, ci)}`,
        head,
        setout: col.mid ? 'derive' : 'measure',
        ...(col.shared ? { shared: true } : {}),
      });
    }),
  );

  const main = cols.map((c, i) => ({ c, i })).filter(({ c }) => !c.mid);
  const first = main[0]!.i;
  const last = main[main.length - 1]!.i;
  const lines: Line[] = [
    { id: 'row1', a: pt(0, first), b: pt(0, last), construction: true },
    { id: 'row2', a: pt(1, first), b: pt(1, last), construction: true },
    ...main.map(({ i }) => ({ id: `col${i + 1}`, a: pt(0, i), b: pt(1, i), construction: true })),
  ];

  let k = 0;
  const cid = () => `k${++k}`;
  const constraints: CadConstraint[] = [{ id: cid(), kind: 'fix', p: pt(0, first), x: main[0]!.c.x, y: rows[0]! }];
  constraints.push({ id: cid(), kind: 'horizontal', a: pt(0, first), b: pt(0, last), via: ['row1'] });
  for (let j = 1; j < main.length; j++) {
    const a = pt(0, main[j - 1]!.i);
    const b = pt(0, main[j]!.i);
    if (j < main.length - 1) constraints.push({ id: cid(), kind: 'onLine', p: b, a: pt(0, first), b: pt(0, last), via: ['row1'] });
    constraints.push({ id: cid(), kind: 'dx', a, b, d: main[j]!.c.x - main[j - 1]!.c.x });
  }
  for (const { i } of main) {
    constraints.push({ id: cid(), kind: 'vertical', a: pt(0, i), b: pt(1, i), via: [`col${i + 1}`] });
    constraints.push({ id: cid(), kind: 'dy', a: pt(0, i), b: pt(1, i), d: rows[1]! - rows[0]! });
  }
  cols.forEach((col, ci) => {
    if (!col.mid) return;
    const cs = cols.findIndex((c) => c.x === col.mid!.xs && !c.mid);
    const ce = cols.findIndex((c) => c.x === col.mid!.xe && !c.mid);
    for (const r of [0, 1]) {
      const p = pt(r, ci);
      if (Math.abs(2 * col.x - col.mid.xs - col.mid.xe) < 1e-9)
        constraints.push({ id: cid(), kind: 'ratio', p, a: pt(r, cs), b: pt(r, ce), t: 0.5 });
      else
        constraints.push(
          { id: cid(), kind: 'onLine', p, a: pt(r, first), b: pt(r, last), via: [`row${r + 1}`] },
          { id: cid(), kind: 'dx', a: pt(r, cs), b: p, d: col.x - col.mid.xs },
        );
    }
  });
  return { points, lines, constraints, elements };
}

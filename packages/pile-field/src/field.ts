import type { Constraint } from '@buildkit/sketch';
import { CONTAINER_WIDTH, CONTAINERS, type ContainerType } from './containers';
import type { Pile, PileDesign } from './design';

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
 * Generates a fully constrained pile sketch for containers joined end to end (short sides
 * touching): corner piles `inset + head/2` in from the end and the long side, ONE shared pile per
 * joint, intermediate supports on the line between their container's end piles.
 *
 * Constraints: the first pile is fixed; along the bottom row each next corner/joint pile is
 * horizontal with the previous one at its ΔX; every top pile is vertical above its bottom pile at
 * ΔY; intermediate supports are the midpoint (20′) or at their ΔX from the corner on the line (40′).
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
  const id = (row: number, col: number) => `p${row * n + col + 1}`;
  const piles: Pile[] = [];
  rows.forEach((y, r) =>
    cols.forEach((col, ci) =>
      piles.push({
        id: id(r, ci),
        label: `C${r * n + ci + 1}`,
        x: col.x,
        y,
        setout: col.mid ? 'derive' : 'measure',
        ...(col.shared ? { shared: true } : {}),
      }),
    ),
  );

  const constraints: Constraint[] = [];
  let k = 0;
  const cid = () => `k${++k}`;
  const main = cols.map((c, i) => ({ c, i })).filter(({ c }) => !c.mid);
  const colOf = (x: number) => cols.findIndex((c) => c.x === x && !c.mid);
  constraints.push({ id: cid(), kind: 'fix', p: id(0, main[0]!.i), x: main[0]!.c.x, y: rows[0]! });
  for (let j = 1; j < main.length; j++) {
    const a = id(0, main[j - 1]!.i);
    const b = id(0, main[j]!.i);
    constraints.push({ id: cid(), kind: 'horizontal', a, b }, { id: cid(), kind: 'dx', a, b, d: main[j]!.c.x - main[j - 1]!.c.x });
  }
  for (const { i } of main)
    constraints.push(
      { id: cid(), kind: 'vertical', a: id(0, i), b: id(1, i) },
      { id: cid(), kind: 'dy', a: id(0, i), b: id(1, i), d: rows[1]! - rows[0]! },
    );
  cols.forEach((col, ci) => {
    if (!col.mid) return;
    for (const r of [0, 1]) {
      const a = id(r, colOf(col.mid.xs));
      const b = id(r, colOf(col.mid.xe));
      const p = id(r, ci);
      if (Math.abs(2 * col.x - col.mid.xs - col.mid.xe) < 1e-9) constraints.push({ id: cid(), kind: 'ratio', p, a, b, t: 0.5 });
      else constraints.push({ id: cid(), kind: 'onLine', p, a, b }, { id: cid(), kind: 'dx', a, b: p, d: col.x - col.mid.xs });
    }
  });
  return { piles, constraints };
}

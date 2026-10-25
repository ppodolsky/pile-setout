import { CONTAINER_WIDTH, CONTAINERS, type ContainerType } from './containers';
import type { PileSpec } from './design';

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
 * Generates the pile design for containers joined end to end (short sides touching).
 * Corner piles are fixed `inset + head/2` in from the end and from the long side; every joint has
 * ONE shared fixed pile on the joint line; intermediate supports are parametric — between the
 * container's two end piles of the same row (20′: the middle; 40′: at their distance from the corner).
 */
export function generatePiles({ containers, head, inset }: TemplateSpec): PileSpec[] {
  const e = inset + head / 2;
  const rows = [e, CONTAINER_WIDTH - e];
  type Col = { x: number; shared?: boolean; mid?: { xs: number; xe: number; ratio?: number } };
  const cols: Col[] = [];
  let x0 = 0;
  containers.forEach((type, k) => {
    const c = CONTAINERS[type];
    const hasNext = k + 1 < containers.length;
    const xs = k === 0 ? e : x0;
    const xe = hasNext ? x0 + c.length : x0 + c.length - e;
    if (k === 0) cols.push({ x: e });
    for (const m of c.mids) {
      const x = x0 + m;
      // the middle of its two end piles → ratio 0.5; otherwise its distance from the first corner
      cols.push({ x, mid: { xs, xe, ...(Math.abs(2 * x - xs - xe) < 1e-9 ? { ratio: 0.5 } : {}) } });
    }
    cols.push(hasNext ? { x: x0 + c.length, shared: true } : { x: x0 + c.length - e });
    x0 += c.length;
  });
  cols.sort((a, b) => a.x - b.x);
  const n = cols.length;
  const id = (row: number, col: number) => `p${row * n + col + 1}`;
  const colOf = (x: number) => cols.findIndex((c) => c.x === x && !c.mid);
  const specs: PileSpec[] = [];
  rows.forEach((y, r) =>
    cols.forEach((col, ci) => {
      const base = { id: id(r, ci), label: `C${r * n + ci + 1}`, ...(col.shared ? { shared: true } : {}) };
      if (!col.mid) {
        specs.push({ ...base, def: { kind: 'fixed', x: col.x, y } });
        return;
      }
      const from = id(r, colOf(col.mid.xs));
      const to = id(r, colOf(col.mid.xe));
      specs.push({
        ...base,
        def:
          col.mid.ratio != null
            ? { kind: 'between', from, to, by: 'ratio', t: col.mid.ratio }
            : { kind: 'between', from, to, by: 'distance', distance: col.x - col.mid.xs },
      });
    }),
  );
  return specs;
}

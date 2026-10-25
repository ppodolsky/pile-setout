import type { Constraint } from '@buildkit/sketch';
import type { InteropDocument } from './model';

/**
 * Test documents (not part of the public API). `sampleDocument` is fully constrained (0 DOF) with
 * every constraint kind, positions already solved: a 6 × 2.4 m rectangle of piles A–D with a
 * midpoint M, a quarter point R, N on the top edge, E coincident with B, F/G placed by distance +
 * angle, H by vertical + equal length.
 */
export function sampleDocument(): InteropDocument {
  const rad = Math.PI / 180;
  return {
    units: 'mm',
    name: 'Sample',
    points: [
      { id: 'A', x: 0, y: 0, label: 'P1' },
      { id: 'B', x: 6000, y: 0, label: 'P2' },
      { id: 'C', x: 6000, y: 2400, label: 'P3' },
      { id: 'D', x: 0, y: 2400, label: 'P4' },
      { id: 'M', x: 3000, y: 0, label: 'M1' },
      { id: 'N', x: 3000, y: 2400 },
      { id: 'R', x: 1500, y: 0 },
      { id: 'E', x: 6000, y: 0 },
      { id: 'F', x: 1000 * Math.cos(45 * rad), y: 1000 * Math.sin(45 * rad) },
      { id: 'G', x: 1000 * Math.cos(120 * rad), y: 1000 * Math.sin(120 * rad) },
      { id: 'H', x: 6000, y: -2400 },
    ],
    lines: [
      { id: 'ab', a: 'A', b: 'B' },
      { id: 'bc', a: 'B', b: 'C' },
      { id: 'cd', a: 'C', b: 'D' },
      { id: 'da', a: 'D', b: 'A' },
      { id: 'ac', a: 'A', b: 'C', construction: true },
    ],
    constraints: [
      { id: 'c1', kind: 'fix', p: 'A', x: 0, y: 0 },
      { id: 'c2', kind: 'dx', a: 'A', b: 'B', d: 6000 },
      { id: 'c3', kind: 'horizontal', a: 'A', b: 'B' },
      { id: 'c4', kind: 'vertical', a: 'A', b: 'D' },
      { id: 'c5', kind: 'dy', a: 'A', b: 'D', d: 2400 },
      { id: 'c6', kind: 'parallel', a: 'D', b: 'C', c: 'A', d: 'B' },
      { id: 'c7', kind: 'perpendicular', a: 'B', b: 'C', c: 'A', d: 'B' },
      { id: 'c8', kind: 'ratio', p: 'M', a: 'A', b: 'B', t: 0.5 },
      { id: 'c9', kind: 'onLine', p: 'N', a: 'D', b: 'C' },
      { id: 'c10', kind: 'dx', a: 'D', b: 'N', d: 3000 },
      { id: 'c11', kind: 'ratio', p: 'R', a: 'A', b: 'B', t: 0.25 },
      { id: 'c12', kind: 'coincident', a: 'E', b: 'B' },
      { id: 'c13', kind: 'distance', a: 'A', b: 'F', d: 1000 },
      { id: 'c14', kind: 'angle', a: 'A', b: 'F', angle: 45, ref: null },
      { id: 'c15', kind: 'distance', a: 'A', b: 'G', d: 1000 },
      { id: 'c16', kind: 'angle', a: 'A', b: 'G', angle: 30, ref: 'D' },
      { id: 'c17', kind: 'vertical', a: 'B', b: 'H' },
      { id: 'c18', kind: 'equal', a: 'B', b: 'H', c: 'A', d: 'D' },
    ],
    piles: [
      { point: 'A', label: 'P1', head: 400, diameter: 300, depth: 2000 },
      { point: 'B', label: 'P2', head: 400, diameter: 300, depth: 2000 },
      { point: 'C', label: 'P3', head: 400, diameter: 300, depth: 2000 },
      { point: 'D', label: 'P4', head: 400, diameter: 300, depth: 2000 },
      { point: 'M', label: 'M1', head: 400 },
    ],
  };
}

type Pair = readonly [string, string];
const unordered = (p: Pair): Pair => (p[0] < p[1] ? p : [p[1], p[0]]);
const pairs = (a: Pair, b: Pair): [Pair, Pair] => [unordered(a), unordered(b)];

/**
 * A constraint with ids renamed through `rename` and symmetric point pairs sorted, without its own id —
 * equal for constraints that mean the same thing (for round-trip assertions).
 */
export function canonical(c: Constraint, rename: (id: string) => string): unknown {
  const r = rename;
  const val = (v: number) => Math.round(v * 1e6) / 1e6;
  switch (c.kind) {
    case 'fix':
      return [c.kind, r(c.p), val(c.x), val(c.y)];
    case 'distance':
      return [c.kind, unordered([r(c.a), r(c.b)]), val(c.d)];
    case 'dx':
    case 'dy':
      return [c.kind, r(c.a), r(c.b), val(c.d)];
    case 'horizontal':
    case 'vertical':
    case 'coincident':
      return [c.kind, unordered([r(c.a), r(c.b)])];
    case 'angle':
      return [c.kind, r(c.a), r(c.b), c.ref ? r(c.ref) : null, val(c.angle)];
    case 'ratio':
      return c.t === 0.5 ? [c.kind, r(c.p), unordered([r(c.a), r(c.b)]), 0.5] : [c.kind, r(c.p), r(c.a), r(c.b), val(c.t)];
    case 'onLine':
      return [c.kind, r(c.p), unordered([r(c.a), r(c.b)])];
    case 'parallel':
    case 'perpendicular':
    case 'equal':
      return [c.kind, ...pairs([r(c.a), r(c.b)], [r(c.c), r(c.d)])];
    default:
      return c;
  }
}

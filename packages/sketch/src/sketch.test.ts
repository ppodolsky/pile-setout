import { describe, expect, it } from 'vitest';
import { measure, solveSketch, type Constraint, type SketchPoint } from './index';

const pts = (...p: [string, number, number][]): SketchPoint[] => p.map(([id, x, y]) => ({ id, x, y }));
const near = (a: { x: number; y: number } | undefined, x: number, y: number, d = 1e-4) => {
  expect(a!.x).toBeCloseTo(x, -Math.log10(d));
  expect(a!.y).toBeCloseTo(y, -Math.log10(d));
};

describe('solveSketch', () => {
  it('solves a fully constrained rectangle', () => {
    const p = pts(['A', 3, -2], ['B', 5800, 30], ['C', 5810, 2200], ['D', -20, 2250]);
    const c: Constraint[] = [
      { id: '1', kind: 'fix', p: 'A', x: 0, y: 0 },
      { id: '2', kind: 'horizontal', a: 'A', b: 'B' },
      { id: '3', kind: 'dx', a: 'A', b: 'B', d: 5858 },
      { id: '4', kind: 'vertical', a: 'A', b: 'D' },
      { id: '5', kind: 'dy', a: 'A', b: 'D', d: 2238 },
      { id: '6', kind: 'vertical', a: 'B', b: 'C' },
      { id: '7', kind: 'horizontal', a: 'D', b: 'C' },
    ];
    const s = solveSketch(p, c);
    expect(s.conflicts).toEqual([]);
    expect(s.dof).toBe(0);
    expect(s.determined.size).toBe(4);
    near(s.positions.get('C'), 5858, 2238);
  });

  it('places a point by distance + angle, relative to a direction', () => {
    const p = pts(['A', 0, 0], ['B', 4000, 0], ['P', 10, 10]);
    const c: Constraint[] = [
      { id: '1', kind: 'fix', p: 'A', x: 0, y: 0 },
      { id: '2', kind: 'fix', p: 'B', x: 4000, y: 0 },
      { id: '3', kind: 'distance', a: 'A', b: 'P', d: 1000 },
      { id: '4', kind: 'angle', a: 'A', b: 'P', angle: 90, ref: 'B' },
    ];
    const s = solveSketch(p, c);
    near(s.positions.get('P'), 0, 1000);
    expect(s.determined.has('P')).toBe(true);
  });

  it('intersects two distances (multiple constraints on one point)', () => {
    const p = pts(['A', 0, 0], ['B', 3000, 0], ['P', 1500, 1500]);
    const c: Constraint[] = [
      { id: '1', kind: 'fix', p: 'A', x: 0, y: 0 },
      { id: '2', kind: 'fix', p: 'B', x: 3000, y: 0 },
      { id: '3', kind: 'distance', a: 'A', b: 'P', d: 2500 },
      { id: '4', kind: 'distance', a: 'B', b: 'P', d: 2500 },
    ];
    const s = solveSketch(p, c);
    near(s.positions.get('P'), 1500, 2000, 1e-3); // stays on the side it started
    expect(s.dof).toBe(0);
  });

  it('keeps a midpoint in the middle and reports freedom', () => {
    const p = pts(['A', 0, 0], ['B', 1000, 0], ['M', 400, 40]);
    const s = solveSketch(p, [{ id: '1', kind: 'ratio', p: 'M', a: 'A', b: 'B', t: 0.5 }]);
    const m = s.positions.get('M')!;
    const a = s.positions.get('A')!;
    const b = s.positions.get('B')!;
    expect(m.x).toBeCloseTo((a.x + b.x) / 2, 6);
    expect(s.dof).toBe(4); // A and B free; M follows
    expect(s.determined.size).toBe(0);
  });

  it('reports conflicting constraints', () => {
    const p = pts(['A', 0, 0], ['B', 1000, 0]);
    const s = solveSketch(p, [
      { id: '1', kind: 'fix', p: 'A', x: 0, y: 0 },
      { id: '2', kind: 'dx', a: 'A', b: 'B', d: 1000 },
      { id: '3', kind: 'distance', a: 'A', b: 'B', d: 900 },
    ]);
    expect(s.conflicts.length).toBeGreaterThan(0);
  });

  it('drags a point only as far as constraints allow', () => {
    const p = pts(['A', 0, 0], ['B', 1000, 0]);
    const c: Constraint[] = [
      { id: '1', kind: 'fix', p: 'A', x: 0, y: 0 },
      { id: '2', kind: 'distance', a: 'A', b: 'B', d: 1000 },
    ];
    const s = solveSketch(p, c, { drag: { id: 'B', to: { x: 0, y: 2000 } } });
    near(s.positions.get('B'), 0, 1000, 1e-1); // swings around A
  });

  it('makes lines parallel, perpendicular and equal; merges coincident points', () => {
    const p = pts(['A', 0, 0], ['B', 1000, 0], ['C', 0, 500], ['D', 900, 700], ['E', 0, 0], ['F', 300, 900], ['G', 5, 5]);
    const c: Constraint[] = [
      { id: '1', kind: 'fix', p: 'A', x: 0, y: 0 },
      { id: '2', kind: 'fix', p: 'B', x: 1000, y: 0 },
      { id: '3', kind: 'fix', p: 'C', x: 0, y: 500 },
      { id: '4', kind: 'parallel', a: 'A', b: 'B', c: 'C', d: 'D' },
      { id: '5', kind: 'equal', a: 'A', b: 'B', c: 'C', d: 'D' },
      { id: '6', kind: 'coincident', a: 'A', b: 'E' },
      { id: '7', kind: 'perpendicular', a: 'A', b: 'B', c: 'E', d: 'F' },
      { id: '8', kind: 'distance', a: 'E', b: 'F', d: 800 },
      { id: '9', kind: 'coincident', a: 'G', b: 'C' },
    ];
    const s = solveSketch(p, c);
    expect(s.conflicts).toEqual([]);
    near(s.positions.get('D'), 1000, 500, 1e-3);
    near(s.positions.get('E'), 0, 0, 1e-3);
    near(s.positions.get('F'), 0, 800, 1e-3);
    near(s.positions.get('G'), 0, 500, 1e-3);
    expect(s.dof).toBe(0);
  });

  it('measures current values for new constraints', () => {
    expect(measure('angle', { x: 0, y: 0 }, { x: 0, y: 5 })).toBeCloseTo(90);
    expect(measure('angle', { x: 0, y: 0 }, { x: 0, y: 5 }, { x: 5, y: 5 })).toBeCloseTo(45);
    expect(measure('dx', { x: 1, y: 0 }, { x: 4, y: 9 })).toBe(3);
  });
});

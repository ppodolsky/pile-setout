import { describe, expect, it } from 'vitest';
import {
  addConstraints,
  dragPoint,
  removeEntities,
  selectionActions,
  setPointPosition,
  snapPoint,
  solveDocument,
  type CadDocument,
} from './index';

let n = 0;
const id = () => `c${++n}`;

/** A 6000 × 2000 rectangle: A fixed, B horizontal at ΔX, D vertical at ΔY, C closing it. */
function rect(): CadDocument {
  return {
    points: [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 6000, y: 0 },
      { id: 'C', x: 6000, y: 2000 },
      { id: 'D', x: 0, y: 2000 },
    ],
    lines: [{ id: 'AB', a: 'A', b: 'B', construction: true }],
    constraints: [
      { id: 'k1', kind: 'fix', p: 'A', x: 0, y: 0 },
      { id: 'k2', kind: 'horizontal', a: 'A', b: 'B', via: ['AB'] },
      { id: 'k3', kind: 'dx', a: 'A', b: 'B', d: 6000 },
      { id: 'k4', kind: 'vertical', a: 'A', b: 'D' },
      { id: 'k5', kind: 'dy', a: 'A', b: 'D', d: 2000 },
      { id: 'k6', kind: 'vertical', a: 'B', b: 'C' },
      { id: 'k7', kind: 'horizontal', a: 'D', b: 'C' },
    ],
    elements: [{ id: 'e1', type: 'pile', point: 'B', label: 'C3' }],
  };
}
const at = (doc: CadDocument, pid: string) => doc.points.find((p) => p.id === pid)!;

describe('editing', () => {
  it('a fully constrained sketch is fully determined', () => {
    const { status } = solveDocument(rect());
    expect(status.dof).toBe(0);
    expect(status.conflicts.size).toBe(0);
  });

  it('dragging a dimensioned point drives its dimensions; relations still hold', () => {
    const doc = dragPoint(rect(), 'B', { x: 6500, y: 300 });
    expect(at(doc, 'B').x).toBeCloseTo(6500, 2);
    expect(at(doc, 'B').y).toBeCloseTo(0, 6); // stays horizontal with A
    expect(at(doc, 'C').x).toBeCloseTo(at(doc, 'B').x, 6); // vertical above B
    expect((doc.constraints.find((c) => c.id === 'k3') as { d: number }).d).toBeCloseTo(6500, 2);
  });

  it('dragging a free point just moves it', () => {
    const doc: CadDocument = { ...rect(), points: [...rect().points, { id: 'F', x: 100, y: 100 }] };
    expect(at(dragPoint(doc, 'F', { x: 300, y: 450 }), 'F')).toMatchObject({ x: 300, y: 450 });
  });

  it('typing coordinates moves an anchored point with its anchor', () => {
    const doc = setPointPosition(rect(), 'A', { x: 100, y: 50 });
    expect(at(doc, 'C').x).toBeCloseTo(6100, 6);
    expect(at(doc, 'C').y).toBeCloseTo(2050, 6);
  });

  it('skips constraints that add nothing', () => {
    const r = addConstraints(rect(), [{ kind: 'horizontal', a: 'A', b: 'B' }], id);
    expect(r.added).toHaveLength(0);
    expect(r.redundant).toBe(1);
  });

  it('cascades deletes', () => {
    const doc = removeEntities(rect(), { lines: ['AB'] });
    expect(doc.constraints.some((c) => c.id === 'k2')).toBe(false);
    const doc2 = removeEntities(rect(), { elements: ['e1'] });
    expect(doc2.points.some((p) => p.id === 'B')).toBe(false); // its point goes too
    expect(doc2.constraints.some((c) => c.id === 'k3' || c.id === 'k6')).toBe(false);
  });
});

describe('snapping', () => {
  const doc = rect();
  const ctx = { points: doc.points, lines: [{ id: 'L', a: 'A', b: 'B' }], scale: 0.1 };

  it('sticks to points and midpoints', () => {
    expect(snapPoint({ x: 6040, y: 30 }, ctx).point).toBe('B');
    const mid = snapPoint({ x: 3050, y: 40 }, ctx);
    expect(mid.at).toEqual({ x: 3000, y: 0 });
    expect(mid.infer('N')).toEqual([{ kind: 'ratio', p: 'N', a: 'A', b: 'B', t: 0.5, via: ['L'] }]);
  });

  it('snaps to 90° and a round distance from the anchor, inferring vertical', () => {
    const s = snapPoint({ x: 6080, y: 3333 }, { ...ctx, anchor: at(doc, 'B') });
    expect(s.at.x).toBeCloseTo(6000, 6);
    expect(s.at.y % 100).toBeCloseTo(0, 6);
    expect(s.label).toMatch(/^90°/);
    expect(s.infer('N')).toEqual([{ kind: 'vertical', a: 'B', b: 'N' }]);
  });

  it('aligns with other points and rounds the rest', () => {
    const s = snapPoint({ x: 2973, y: 2040 }, ctx);
    expect(s.at.y).toBe(2000);
    expect(s.at.x % 50).toBe(0);
    expect(s.infer('N')).toEqual([{ kind: 'horizontal', a: 'D', b: 'N' }]);
  });
});

describe('selection actions', () => {
  it('offers what fits the selection', () => {
    expect(selectionActions(2, 0).map((a) => a.id)).toContain('distance-angle');
    expect(selectionActions(0, 2).map((a) => a.id)).toEqual(['parallel', 'perpendicular', 'equal']);
    expect(selectionActions(1, 1).map((a) => a.id)).toContain('on-line');
  });
});

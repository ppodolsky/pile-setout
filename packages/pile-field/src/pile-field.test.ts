import { describe, expect, it } from 'vitest';
import {
  CASTING,
  computePlan,
  correctedLength,
  generatePiles,
  isDerived,
  knownCorrection,
  readings,
  recommendedPairs,
  resolveDesign,
  rng,
  scatter,
  setoutInstruction,
  suggestNext,
  type ContainerType,
  type Measurement,
  type ParametricMode,
  type Pile,
  type PileSpec,
} from './index';

const build = (containers: ContainerType[], head = 200, inset = 0) => resolveDesign(generatePiles({ containers, head, inset }));
const field20 = (head = 200, inset = 0) => build(['20'], head, inset);
let seq = 0;
const meas = (
  a: string,
  b: string,
  reading: number | null = null,
  correctionA: number | null = null,
  correctionB: number | null = null,
): Measurement => ({
  id: `m${++seq}`,
  a,
  b,
  reading,
  correctionA,
  correctionB,
});

/** Follows the advisor with exact readings from a scattered field; returns the steps taken. */
function followAdvisor(piles: Pile[], parametric: ParametricMode, seed = 11) {
  const actual = scatter(piles, rng(seed), 2, 22);
  const ms: Measurement[] = [];
  const kinds: string[] = [];
  for (let k = 0; k < 60; k++) {
    const plan = computePlan({ piles, measurements: ms, tolerance: 3, pinned: new Set(), parametric });
    const s = suggestNext(plan, ms);
    if (!s || s.kind === 'done' || s.kind === 'remeasure') {
      kinds.push(s?.kind ?? 'none');
      break;
    }
    kinds.push(s.kind);
    const [r] = readings(actual, [{ a: s.a, b: s.b }]);
    ms.push(meas(s.a, s.b, Math.round(r! * 2) / 2));
  }
  return { kinds, ms, actual };
}

describe('generatePiles', () => {
  it('puts flush 200 mm heads 100 mm from the edges of a 20′', () => {
    const { piles } = field20();
    expect(piles.map((p) => [p.label, p.x, p.y])).toEqual([
      ['C1', 100, 100],
      ['C2', 3029, 100],
      ['C3', 5958, 100],
      ['C4', 100, 2338],
      ['C5', 3029, 2338],
      ['C6', 5958, 2338],
    ]);
  });

  it('honours head size and inset', () => {
    const { piles } = field20(300, 50);
    expect(piles[0]).toMatchObject({ x: 200, y: 200 });
    expect(piles[2]).toMatchObject({ x: 5858, y: 200 });
  });

  it('shares one pile per joint in a combination', () => {
    const { piles } = build(['10', '20']);
    expect(piles).toHaveLength(8);
    const joint = piles.filter((p) => p.shared);
    expect(joint.map((p) => p.x)).toEqual([2991, 2991]);
    // the 20′ middle support stays at 3029 from its own start even though its end piles are asymmetric
    expect(piles.find((p) => p.label === 'C3')).toMatchObject({ x: 2991 + 3029 });
    expect(piles.find((p) => p.label === 'C3')!.def).toMatchObject({ kind: 'between', by: 'distance' });
  });

  it('keeps corner castings on the heads', () => {
    const { piles } = field20();
    const c1 = piles[0]!;
    // casting aperture centre (102.5, 89.5) lies inside the 200 mm head centred at (100, 100)
    expect(Math.abs(c1.x - 102.5)).toBeLessThan(100);
    expect(Math.abs(c1.y - CASTING.sideOffset)).toBeLessThan(100);
  });

  it('makes middle supports parametric and tells how to set them out', () => {
    const { piles } = field20();
    const c2 = piles[1]!;
    expect(c2.def).toMatchObject({ kind: 'between', by: 'ratio', t: 0.5 });
    expect(isDerived(c2, piles, 'derived')).toBe(true);
    expect(isDerived(c2, piles, 'measured')).toBe(false);
    const ins = setoutInstruction(c2, piles)!;
    expect(ins.kind).toBe('string');
    if (ins.kind === 'string') {
      expect(ins.from.label).toBe('C1');
      expect(ins.to.label).toBe('C3');
      expect(ins.offset).toBeCloseTo(2929);
    }
  });

  it('places 40′ intermediates at their distance from the corner', () => {
    const { piles } = build(['40']);
    expect(piles.filter((p) => p.def.kind === 'between').map((p) => p.x)).toEqual([3048, 9144, 3048, 9144]);
  });
});

describe('parametric design', () => {
  const specs: PileSpec[] = [
    { id: 'a', label: 'A', def: { kind: 'fixed', x: 0, y: 0 } },
    { id: 'b', label: 'B', def: { kind: 'fixed', x: 4000, y: 0 } },
    { id: 'm', label: 'M', def: { kind: 'between', from: 'a', to: 'b', by: 'ratio', t: 0.25 } },
    { id: 'p', label: 'P', def: { kind: 'polar', from: 'a', distance: 1000, angle: 90, ref: 'b' } },
    { id: 'q', label: 'Q', def: { kind: 'polar', from: 'm', distance: 500, angle: 0, ref: null } },
  ];

  it('resolves between and polar definitions, in dependency order', () => {
    const r = resolveDesign(specs);
    const at = (id: string) => r.piles.find((p) => p.id === id)!;
    expect(at('m')).toMatchObject({ x: 1000, y: 0 });
    expect(at('p').x).toBeCloseTo(0);
    expect(at('p').y).toBeCloseTo(1000); // 90° counter-clockwise from a → b (+X) is +Y
    expect(at('q')).toMatchObject({ x: 1500, y: 0 });
    expect(r.order.indexOf('m')).toBeLessThan(r.order.indexOf('q'));
  });

  it('reports cycles and missing references', () => {
    const r = resolveDesign([
      { id: 'x', label: 'X', def: { kind: 'polar', from: 'y', distance: 1, angle: 0, ref: null } },
      { id: 'y', label: 'Y', def: { kind: 'polar', from: 'x', distance: 1, angle: 0, ref: null } },
      { id: 'z', label: 'Z', def: { kind: 'between', from: 'x', to: 'nope', by: 'ratio', t: 0.5 } },
    ]);
    expect(r.piles).toHaveLength(0);
    expect(r.issues.get('x')).toBe('cycle');
    expect(r.issues.get('z')).toBe('missing-reference');
  });

  it('sets an angled pile by swinging two tapes', () => {
    const { piles } = resolveDesign(specs);
    const ins = setoutInstruction(
      piles.find((p) => p.id === 'p')!,
      piles,
    )!;
    expect(ins.kind).toBe('swing');
    if (ins.kind === 'swing') {
      expect(ins.a.id).toBe('a');
      expect(ins.da).toBeCloseTo(1000);
      expect(ins.b.id).toBe('b');
      expect(ins.db).toBeCloseTo(Math.hypot(4000, 1000));
      expect(ins.side).toBe('left');
    }
  });
});

describe('measurements', () => {
  it('subtracts the corrections at both ends', () => {
    expect(correctedLength(meas('p1', 'p2', 3048.9, 120))).toBeCloseTo(2928.9);
    expect(correctedLength(meas('p1', 'p2', 3048.9, 120, 20))).toBeCloseTo(2908.9);
    expect(correctedLength(meas('p1', 'p2', 3048.9))).toBeCloseTo(3048.9);
    expect(correctedLength(meas('p1', 'p2'))).toBeNull();
  });

  it('remembers a pile’s correction at either end', () => {
    const ms = [meas('p1', 'p2', 3000, 120), meas('p3', 'p4', 3000, null, 35)];
    expect(knownCorrection(ms, 'p1')).toBe(120);
    expect(knownCorrection(ms, 'p4')).toBe(35);
    expect(knownCorrection(ms, 'p3')).toBeNull();
  });

  it('recommends 15 pairs for a 20′ and 6 for four corners', () => {
    const { piles } = field20();
    expect(recommendedPairs(piles)).toHaveLength(15);
    expect(recommendedPairs(piles.filter((p) => p.def.kind === 'fixed'))).toHaveLength(6);
  });
});

describe('advisor + plan', () => {
  it('20′ with middle supports set from corners: 5 to fix, 1 check', () => {
    const { kinds } = followAdvisor(field20().piles, 'derived');
    expect(kinds.filter((k) => k === 'fix')).toHaveLength(5);
    expect(kinds.filter((k) => k === 'check')).toHaveLength(1);
    expect(kinds.at(-1)).toBe('done');
  });

  it('20′ measuring every pile: 9 to fix, 6 checks', () => {
    const { kinds } = followAdvisor(field20().piles, 'measured');
    expect(kinds.filter((k) => k === 'fix')).toHaveLength(9);
    expect(kinds.filter((k) => k === 'check')).toHaveLength(6);
  });

  it('produces a minimal move plan once the field is fixed', () => {
    const { piles } = field20();
    const { ms } = followAdvisor(piles, 'measured');
    const plan = computePlan({ piles, measurements: ms, tolerance: 3, pinned: new Set(), parametric: 'measured' });
    expect(plan.status).toBe('ok');
    if (plan.status !== 'ok') return;
    expect(plan.moves.length).toBeGreaterThan(0);
    expect(plan.lowerBound).not.toBeNull();
    expect(plan.moves.length).toBeGreaterThanOrEqual(plan.lowerBound!);
    expect(plan.placement.proven || plan.moves.length === plan.lowerBound).toBe(true);
  });

  it('points at a misread tape', () => {
    const { piles } = field20();
    const { ms } = followAdvisor(piles, 'measured');
    const bad = ms.map((m, i) => (i === 2 ? { ...m, reading: m.reading! + 40 } : m));
    const plan = computePlan({ piles, measurements: bad, tolerance: 3, pinned: new Set(), parametric: 'measured' });
    expect(plan.status).toBe('contradictory');
    const s = suggestNext(plan, bad);
    expect(s?.kind).toBe('remeasure');
    if (s?.kind === 'remeasure') {
      expect(s.measurementId).toBe(bad[2]!.id);
      expect(s.error).toBeCloseTo(40, -1);
    }
  });

  it('says when measurements do not fix the field yet', () => {
    const { piles } = field20();
    const plan = computePlan({
      piles,
      measurements: [meas('p1', 'p3', 5858)],
      tolerance: 3,
      pinned: new Set(),
      parametric: 'derived',
    });
    expect(plan.status).toBe('under');
  });
});

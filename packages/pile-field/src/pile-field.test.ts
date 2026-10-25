import { describe, expect, it } from 'vitest';
import type { Constraint } from '@buildkit/sketch';
import {
  CASTING,
  computePlan,
  correctedLength,
  generateDesign,
  knownCorrection,
  readings,
  recommendedPairs,
  rng,
  scatter,
  setoutPlan,
  solveDesign,
  suggestNext,
  type ContainerType,
  type Measurement,
  type ParametricMode,
  type Pile,
} from './index';

const build = (containers: ContainerType[], head = 200, inset = 0) => {
  const design = generateDesign({ containers, head, inset });
  return { ...design, ...solveDesign(design) };
};
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

describe('generateDesign', () => {
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

  it('is a fully constrained sketch', () => {
    for (const c of [['10'], ['20'], ['40'], ['10', '20', '40']] as ContainerType[][]) {
      const { status, piles } = build(c);
      expect(status.conflicts.size).toBe(0);
      expect(status.dof).toBe(0);
      expect(status.determined.size).toBe(piles.length);
    }
  });

  it('honours head size and inset', () => {
    const { piles } = field20(300, 50);
    expect(piles[0]).toMatchObject({ x: 200, y: 200 });
    expect(piles[2]).toMatchObject({ x: 5858, y: 200 });
  });

  it('shares one pile per joint in a combination', () => {
    const { piles } = build(['10', '20']);
    expect(piles).toHaveLength(8);
    expect(piles.filter((p) => p.shared).map((p) => p.x)).toEqual([2991, 2991]);
    // the 20′ middle support stays at 3029 from its own start even though its end piles are asymmetric
    expect(piles.find((p) => p.label === 'C3')!.x).toBeCloseTo(2991 + 3029, 6);
  });

  it('places 40′ intermediates at their distance from the corner', () => {
    const { piles } = build(['40']);
    expect(piles.filter((p) => p.setout === 'derive').map((p) => Math.round(p.x))).toEqual([3048, 9144, 3048, 9144]);
  });

  it('keeps corner castings on the heads', () => {
    const c1 = field20().piles[0]!;
    expect(Math.abs(c1.x - 102.5)).toBeLessThan(100);
    expect(Math.abs(c1.y - CASTING.sideOffset)).toBeLessThan(100);
  });

  it('follows its constraints when a dimension changes', () => {
    const d = generateDesign({ containers: ['20'], head: 200, inset: 0 });
    const dx = d.constraints.find((c) => c.kind === 'dx')!;
    const edited = { ...d, constraints: d.constraints.map((c) => (c.id === dx.id ? { ...c, d: 6000 } : c)) as Constraint[] };
    const { piles } = solveDesign(edited);
    const at = (l: string) => piles.find((p) => p.label === l)!;
    expect(at('C3').x).toBeCloseTo(6100, 6);
    expect(at('C6').x).toBeCloseTo(6100, 6); // vertical above C3
    expect(at('C2').x).toBeCloseTo(3100, 6); // stays the midpoint
  });
});

describe('set-out of derived piles', () => {
  it('sets middle supports on the string between corrected corners', () => {
    const { piles, constraints } = field20();
    const steps = setoutPlan(
      piles.filter((p) => p.setout === 'derive'),
      piles.filter((p) => p.setout === 'measure'),
      constraints,
    );
    expect(steps).toHaveLength(2);
    const ins = steps[0]!.instruction!;
    expect(ins.kind).toBe('string');
    if (ins.kind === 'string') {
      expect(ins.from.label).toBe('C1');
      expect(ins.to.label).toBe('C3');
      expect(ins.offset).toBeCloseTo(2929);
    }
  });

  it('never refers to a pile that is not in place yet', () => {
    // C1 is derived from C4 (distance + angle) and C2 sits between C1 and C3: C1 must come first,
    // and its tapes must not come from C2 (derived) even though C2 is nearer
    const { piles, constraints } = field20();
    const derive = new Set(['C1', 'C2', 'C5']);
    const ps = piles.map((p) => ({ ...p, setout: derive.has(p.label) ? 'derive' : 'measure' }) as Pile);
    const id = (l: string) => ps.find((p) => p.label === l)!.id;
    const cs: Constraint[] = [
      ...constraints.filter((c) => !('p' in c && c.p === id('C1')) || c.kind === 'ratio'),
      { id: 'x1', kind: 'distance', a: id('C4'), b: id('C1'), d: 2238 },
      { id: 'x2', kind: 'angle', a: id('C4'), b: id('C1'), angle: -90, ref: null },
    ];
    const steps = setoutPlan(
      ps.filter((p) => p.setout === 'derive'),
      ps.filter((p) => p.setout === 'measure'),
      cs,
    );
    const placed = new Set(ps.filter((p) => p.setout === 'measure').map((p) => p.id));
    for (const s of steps) {
      expect(s.instruction).not.toBeNull();
      const refs = s.instruction!.kind === 'string' ? [s.instruction!.from, s.instruction!.to] : [s.instruction!.a, s.instruction!.b];
      for (const r of refs) expect(placed.has(r.id)).toBe(true);
      placed.add(s.pile.id);
    }
    expect(steps.map((s) => s.pile.label).indexOf('C1')).toBeLessThan(steps.map((s) => s.pile.label).indexOf('C2'));
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
    expect(recommendedPairs(piles.filter((p) => p.setout === 'measure'))).toHaveLength(6);
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

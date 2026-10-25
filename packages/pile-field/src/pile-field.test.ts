import { describe, expect, it } from 'vitest';
import {
  buildField,
  CASTING,
  computePlan,
  correctedLength,
  derivedPlacement,
  isDerived,
  knownCorrection,
  readings,
  recommendedPairs,
  rng,
  scatter,
  suggestNext,
  type Measurement,
  type MidMode,
  type Pile,
} from './index';

const field20 = (head = 200, inset = 0) => buildField({ containers: ['20'], head, inset });
let seq = 0;
const meas = (a: string, b: string, reading: number | null = null, correction: number | null = null): Measurement => ({
  id: `m${++seq}`,
  a,
  b,
  reading,
  correction,
  correctionEnd: 'a',
});

/** Follows the advisor with exact readings from a scattered field; returns the steps taken. */
function followAdvisor(piles: Pile[], midMode: MidMode, seed = 11) {
  const actual = scatter(piles, rng(seed), 2, 22);
  const ms: Measurement[] = [];
  const kinds: string[] = [];
  for (let k = 0; k < 60; k++) {
    const plan = computePlan({ piles, measurements: ms, tolerance: 3, pinned: new Set(), midMode });
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

describe('buildField', () => {
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
    const { piles } = buildField({ containers: ['10', '20'], head: 200, inset: 0 });
    expect(piles).toHaveLength(8);
    const joint = piles.filter((p) => p.shared);
    expect(joint.map((p) => p.x)).toEqual([2991, 2991]);
  });

  it('keeps corner castings on the heads', () => {
    const { piles } = field20();
    const c1 = piles[0]!;
    // casting aperture centre (102.5, 89.5) lies inside the 200 mm head centred at (100, 100)
    expect(Math.abs(c1.x - 102.5)).toBeLessThan(100);
    expect(Math.abs(c1.y - CASTING.sideOffset)).toBeLessThan(100);
  });

  it('knows where middle supports go', () => {
    const { piles } = field20();
    const c2 = piles[1]!;
    expect(isDerived(c2, piles, 'derived')).toBe(true);
    expect(isDerived(c2, piles, 'measured')).toBe(false);
    const place = derivedPlacement(c2, piles)!;
    expect(place.from.label).toBe('C1');
    expect(place.to.label).toBe('C3');
    expect(place.t).toBeCloseTo(0.5);
    expect(place.offset).toBeCloseTo(2929);
  });
});

describe('measurements', () => {
  it('subtracts the hook correction', () => {
    expect(correctedLength(meas('p1', 'p2', 3048.9, 120))).toBeCloseTo(2928.9);
    expect(correctedLength(meas('p1', 'p2'))).toBeNull();
  });

  it('remembers a pile’s correction', () => {
    const ms = [meas('p1', 'p2', 3000, 120), meas('p3', 'p4', 3000)];
    expect(knownCorrection(ms, 'p1')).toBe(120);
    expect(knownCorrection(ms, 'p3')).toBeNull();
  });

  it('recommends 15 pairs for a 20′ and 6 for four corners', () => {
    const { piles } = field20();
    expect(recommendedPairs(piles)).toHaveLength(15);
    expect(recommendedPairs(piles.filter((p) => !p.mid))).toHaveLength(6);
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
    const plan = computePlan({ piles, measurements: ms, tolerance: 3, pinned: new Set(), midMode: 'measured' });
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
    const plan = computePlan({ piles, measurements: bad, tolerance: 3, pinned: new Set(), midMode: 'measured' });
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
      midMode: 'derived',
    });
    expect(plan.status).toBe('under');
  });
});

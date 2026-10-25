import { distance } from '@buildkit/geometry';
import { describe, expect, it } from 'vitest';
import {
  adjustDistances,
  findBlunders,
  nextObservation,
  pairKey,
  requiredRank,
  rigidityRank,
  type DistanceObservation,
  type Pair,
  type Station,
} from './index';

// 2 × 3 grid like a 20' container field
const design: Station[] = [
  { id: 'A', x: 0, y: 0 },
  { id: 'B', x: 3000, y: 0 },
  { id: 'C', x: 6000, y: 0 },
  { id: 'D', x: 0, y: 2300 },
  { id: 'E', x: 3000, y: 2300 },
  { id: 'F', x: 6000, y: 2300 },
];
const truth = new Map(design.map((s, i) => [s.id, { x: s.x + 7 * Math.sin(i), y: s.y + 5 * Math.cos(2 * i) }]));
const allPairs: Pair[] = [];
for (let i = 0; i < design.length; i++) for (let j = i + 1; j < design.length; j++) allPairs.push({ a: design[i]!.id, b: design[j]!.id });
const observe = (pairs: Pair[], bias: Record<string, number> = {}): DistanceObservation[] =>
  pairs.map((p) => ({
    ...p,
    length: distance(truth.get(p.a)!, truth.get(p.b)!) + (bias[pairKey(p.a, p.b)] ?? 0),
  }));

describe('adjustDistances', () => {
  it('recovers the true shape from exact distances', () => {
    const adj = adjustDistances(design, observe(allPairs))!;
    expect(adj.rms).toBeLessThan(1e-6);
    for (const p of allPairs) {
      const d = distance(adj.positions.get(p.a)!, adj.positions.get(p.b)!);
      expect(d).toBeCloseTo(distance(truth.get(p.a)!, truth.get(p.b)!), 6);
    }
  });

  it('redundancy numbers add up to the number of checks', () => {
    const adj = adjustDistances(design, observe(allPairs))!;
    const total = adj.residuals.reduce((s, r) => s + r.redundancy, 0);
    expect(total).toBeCloseTo(allPairs.length - requiredRank(design.length), 2);
  });

  it('flags and sizes a misread tape', () => {
    const adj = adjustDistances(design, observe(allPairs, { 'D|E': 40 }))!;
    const rep = findBlunders(adj, { minError: 6, maxRms: 3, maxMisfit: 9 });
    expect(rep.suspect).toBe(true);
    expect(pairKey(rep.worst!.a, rep.worst!.b)).toBe('D|E');
    expect(rep.worst!.blunder).toBeCloseTo(40, 0);
  });

  it('does not flag clean readings', () => {
    const adj = adjustDistances(design, observe(allPairs))!;
    expect(findBlunders(adj, { minError: 6, maxRms: 3, maxMisfit: 9 }).suspect).toBe(false);
  });
});

describe('rigidity', () => {
  it('needs 2n − 3 independent distances', () => {
    expect(requiredRank(6)).toBe(9);
    expect(rigidityRank(design, allPairs)).toBe(9);
  });

  it('a collinear chain gives nothing across the line', () => {
    const chain: Pair[] = [
      { a: 'A', b: 'B' },
      { a: 'B', b: 'C' },
    ];
    const withTotal = [...chain, { a: 'A', b: 'C' }];
    expect(rigidityRank(design, withTotal)).toBe(rigidityRank(design, chain));
  });
});

describe('nextObservation', () => {
  it('reaches rigidity in exactly 2n − 3 steps', () => {
    const observed: Pair[] = [];
    for (let k = 0; k < 20; k++) {
      const s = nextObservation({ stations: design, observed, pending: [], recommended: [] });
      if (s.kind !== 'fix') break;
      observed.push(s.pair);
    }
    expect(observed.length).toBe(9);
    expect(rigidityRank(design, observed)).toBe(9);
  });
});

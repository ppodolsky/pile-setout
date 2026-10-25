import { describe, expect, it } from 'vitest';
import { applyRigid, inverse, projectT, rank, rigidMatrix, solve, vec } from './index';

describe('linalg', () => {
  it('solves a linear system', () => {
    const x = solve(
      [
        [2, 1],
        [1, 3],
      ],
      [3, 5],
    );
    expect(x[0]).toBeCloseTo(0.8);
    expect(x[1]).toBeCloseTo(1.4);
  });

  it('inverts a matrix', () => {
    const A = [
      [4, 7],
      [2, 6],
    ];
    const I = inverse(A);
    expect(I[0]![0]).toBeCloseTo(0.6);
    expect(I[0]![1]).toBeCloseTo(-0.7);
    expect(I[1]![0]).toBeCloseTo(-0.2);
    expect(I[1]![1]).toBeCloseTo(0.4);
  });

  it('computes numerical rank', () => {
    expect(
      rank([
        [1, 2],
        [2, 4],
      ]),
    ).toBe(1);
    expect(
      rank([
        [1, 0],
        [0, 1],
      ]),
    ).toBe(2);
  });
});

describe('rigid transforms', () => {
  it('matrix form agrees with point form', () => {
    const T = { angle: 0.3, pivot: vec(10, 20), t: vec(5, -7) };
    const p = vec(123, -45);
    const q = applyRigid(T, p);
    const [a, b, c, d, e, f] = rigidMatrix(T);
    expect(a * p.x + c * p.y + e).toBeCloseTo(q.x, 9);
    expect(b * p.x + d * p.y + f).toBeCloseTo(q.y, 9);
  });

  it('projects onto a segment', () => {
    expect(projectT(vec(5, 3), vec(0, 0), vec(10, 0))).toBeCloseTo(0.5);
  });
});

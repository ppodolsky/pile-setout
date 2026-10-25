/** Dense square matrix, row-major. Sizes here are tiny (2 × points), so plain arrays are fine. */
export type Matrix = number[][];

export function zeros(n: number, m = n): Matrix {
  return Array.from({ length: n }, () => new Array<number>(m).fill(0));
}

const at = (M: Matrix, r: number, c: number): number => M[r]![c]!;

/**
 * Solves A·x = b by Gaussian elimination with partial pivoting.
 * Near-singular pivots are clamped (callers regularise their systems), so it never throws.
 */
export function solve(A: Matrix, b: readonly number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(at(M, r, col)) > Math.abs(at(M, piv, col))) piv = r;
    if (Math.abs(at(M, piv, col)) < 1e-12) M[piv]![col] = 1e-12;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    const pivRow = M[col]!;
    for (let r = col + 1; r < n; r++) {
      const row = M[r]!;
      const f = row[col]! / pivRow[col]!;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) row[c]! -= f * pivRow[c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    const row = M[r]!;
    let s = row[n]!;
    for (let c = r + 1; c < n; c++) s -= row[c]! * x[c]!;
    x[r] = s / row[r]!;
  }
  return x;
}

/** Inverse of a (well-conditioned or regularised) square matrix, column by column. */
export function inverse(A: Matrix): Matrix {
  const n = A.length;
  const cols = Array.from({ length: n }, (_, k) =>
    solve(
      A,
      Array.from({ length: n }, (_, q) => (q === k ? 1 : 0)),
    ),
  );
  // cols[k] is column k; transpose into row-major
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => cols[c]![r]!));
}

/** Numerical rank by elimination with pivots below `eps` treated as zero. */
export function rank(A: Matrix, eps = 1e-6): number {
  const n = A.length;
  const M = A.map((r) => [...r]);
  let rk = 0;
  let row = 0;
  for (let col = 0; col < n && row < n; col++) {
    let piv = -1;
    let best = -1;
    for (let r = row; r < n; r++) {
      const v = Math.abs(at(M, r, col));
      if (v > best) {
        best = v;
        piv = r;
      }
    }
    if (piv < 0 || best < eps) continue;
    [M[row], M[piv]] = [M[piv]!, M[row]!];
    const pivRow = M[row]!;
    for (let r = row + 1; r < n; r++) {
      const cur = M[r]!;
      const f = cur[col]! / pivRow[col]!;
      if (f !== 0) for (let c = col; c < n; c++) cur[c]! -= f * pivRow[c]!;
    }
    row++;
    rk++;
  }
  return rk;
}

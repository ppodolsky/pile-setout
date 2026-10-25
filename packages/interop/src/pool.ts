import type { InteropPoint } from './model';

/**
 * Collects points, merging any that land within `tol` mm of one already collected (the first one
 * keeps its coordinates). A hash grid with cell = tol makes it O(1) per point.
 */
export class PointPool {
  readonly points: InteropPoint[] = [];
  private readonly grid = new Map<string, InteropPoint[]>();

  constructor(
    private readonly tol = 0.01,
    private readonly prefix = 'p',
  ) {}

  /** Id of the point at (x, y): an existing one within tolerance, else a new one. */
  add(x: number, y: number): string {
    const near = this.find(x, y);
    if (near) return near.id;
    const p: InteropPoint = { id: `${this.prefix}${this.points.length + 1}`, x, y };
    this.points.push(p);
    const key = this.key(Math.floor(x / this.tol), Math.floor(y / this.tol));
    const cell = this.grid.get(key);
    if (cell) cell.push(p);
    else this.grid.set(key, [p]);
    return p.id;
  }

  /** The collected point within tolerance of (x, y), if any. */
  find(x: number, y: number): InteropPoint | undefined {
    const i = Math.floor(x / this.tol);
    const j = Math.floor(y / this.tol);
    let best: InteropPoint | undefined;
    let bestD = this.tol;
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (const p of this.grid.get(this.key(i + di, j + dj)) ?? []) {
          const d = Math.hypot(p.x - x, p.y - y);
          if (d <= bestD) {
            best = p;
            bestD = d;
          }
        }
    return best;
  }

  private key(i: number, j: number): string {
    return `${i},${j}`;
  }
}

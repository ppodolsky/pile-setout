import type { Vec2 } from '@buildkit/geometry';
import type { ConstraintDraft, Line, Point } from './model';

/** What a snap lined up with — drawn as guides, and turned into constraints if wanted. */
export type Guide =
  | { readonly kind: 'point'; readonly at: Vec2 }
  | { readonly kind: 'align-x'; readonly from: Vec2; readonly to: Vec2 }
  | { readonly kind: 'align-y'; readonly from: Vec2; readonly to: Vec2 }
  | { readonly kind: 'polar'; readonly from: Vec2; readonly to: Vec2; readonly angle: number }
  | { readonly kind: 'line'; readonly from: Vec2; readonly to: Vec2 };

export interface SnapResult {
  readonly at: Vec2;
  readonly guides: readonly Guide[];
  /** Short readout, e.g. "90° · 2,500" or "midpoint". */
  readonly label: string | null;
  /** An existing point the cursor is on (pick it instead of creating one). */
  readonly point?: string;
  /** Geometric constraints implied by the snap, for the new point `id` (auto-constraints). */
  readonly infer: (id: string) => ConstraintDraft[];
}

export interface SnapContext {
  readonly points: readonly Point[];
  readonly lines: readonly Line[];
  /** Screen pixels per mm (snap radii are in pixels, so they feel the same at any zoom). */
  readonly scale: number;
  /** Polar snapping origin (e.g. the selected point). */
  readonly anchor?: Point | null;
  /** Points to ignore (e.g. the one being dragged). */
  readonly exclude?: ReadonlySet<string>;
  /**
   * Reference geometry to snap to without tying anything to it (e.g. background drawings): its
   * points and edges attract the cursor, but no constraint is inferred from them.
   */
  readonly reference?: { readonly points: readonly Vec2[]; readonly segments: readonly (readonly [Vec2, Vec2])[] };
}

const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
/** A round step that is at least `px` pixels on screen. */
export const roundStep = (scale: number, px: number): number => NICE.find((s) => s * scale >= px) ?? 1000;
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

/**
 * Magnetic snapping, in priority order: onto an existing point → a line's midpoint → round angle
 * from the anchor (90° stickiest, then 45°, 15°) at a round distance → alignment with other
 * points' X / Y → onto a line → a zoom-adaptive round grid. Returns guides to draw and the
 * geometric constraints it implies (horizontal / vertical / on line / midpoint).
 */
export function snapPoint(p: Vec2, ctx: SnapContext): SnapResult {
  const { scale } = ctx;
  const px = (mm: number) => mm * scale;
  const pts = ctx.points.filter((q) => !ctx.exclude?.has(q.id));
  const at = (id: string) => ctx.points.find((q) => q.id === id)!;

  // 1. existing point
  const hit = pts.map((q) => ({ q, d: px(Math.hypot(q.x - p.x, q.y - p.y)) })).sort((a, b) => a.d - b.d)[0];
  if (hit && hit.d < 10)
    return { at: { x: hit.q.x, y: hit.q.y }, guides: [{ kind: 'point', at: hit.q }], label: null, point: hit.q.id, infer: () => [] };

  // 1b. a corner / vertex of reference geometry
  const ref = ctx.reference;
  if (ref) {
    const r = ref.points.map((q) => ({ q, d: px(Math.hypot(q.x - p.x, q.y - p.y)) })).sort((a, b) => a.d - b.d)[0];
    if (r && r.d < 10) return { at: { x: r.q.x, y: r.q.y }, guides: [{ kind: 'point', at: r.q }], label: null, infer: () => [] };
  }

  // 2. line midpoint
  for (const l of ctx.lines) {
    if (ctx.exclude?.has(l.a) || ctx.exclude?.has(l.b)) continue;
    const a = at(l.a);
    const b = at(l.b);
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (px(Math.hypot(m.x - p.x, m.y - p.y)) < 10)
      return {
        at: m,
        guides: [
          { kind: 'line', from: a, to: b },
          { kind: 'point', at: m },
        ],
        label: 'midpoint',
        infer: (id) => [{ kind: 'ratio', p: id, a: l.a, b: l.b, t: 0.5, via: [l.id] }],
      };
  }

  const guides: Guide[] = [];
  const infer: ((id: string) => ConstraintDraft[])[] = [];
  let x = p.x;
  let y = p.y;
  let label: string | null = null;
  let polar = false;

  // 3. round angle + round distance from the anchor
  const A = ctx.anchor && !ctx.exclude?.has(ctx.anchor.id) ? ctx.anchor : null;
  if (A) {
    const d = Math.hypot(p.x - A.x, p.y - A.y);
    const deg = (Math.atan2(p.y - A.y, p.x - A.x) * 180) / Math.PI;
    for (const [step, tolPx] of [
      [90, 14],
      [45, 9],
      [15, 6],
    ] as const) {
      const snapDeg = roundTo(deg, step);
      const off = px(d * Math.abs(Math.sin(((deg - snapDeg) * Math.PI) / 180)));
      if (d * scale > 20 && off < tolPx) {
        const r = roundTo(d, roundStep(scale, 6));
        const th = (snapDeg * Math.PI) / 180;
        x = A.x + r * Math.cos(th);
        y = A.y + r * Math.sin(th);
        const norm = ((snapDeg % 360) + 360) % 360;
        guides.push({ kind: 'polar', from: A, to: { x, y }, angle: norm });
        label = `${norm}° · ${r.toLocaleString('en-US')}`;
        polar = true;
        if (norm % 180 === 0) infer.push((id) => [{ kind: 'horizontal', a: A.id, b: id }]);
        else if (norm % 90 === 0) infer.push((id) => [{ kind: 'vertical', a: A.id, b: id }]);
        break;
      }
    }
  }

  // 4. alignment with other points' axes (if not already locked by a polar snap)
  if (!polar) {
    // the closest axis wins; among points on the same axis, the nearest point
    const near = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y);
    const gx = pts
      .filter((q) => px(Math.abs(q.x - p.x)) < 8)
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x) || near(a) - near(b))[0];
    const gy = pts
      .filter((q) => px(Math.abs(q.y - p.y)) < 8)
      .sort((a, b) => Math.abs(a.y - p.y) - Math.abs(b.y - p.y) || near(a) - near(b))[0];
    if (gx) {
      x = gx.x;
      infer.push((id) => [{ kind: 'vertical', a: gx.id, b: id }]);
    }
    if (gy) {
      y = gy.y;
      infer.push((id) => [{ kind: 'horizontal', a: gy.id, b: id }]);
    }
    if (gx) guides.push({ kind: 'align-x', from: gx, to: { x, y } });
    if (gy) guides.push({ kind: 'align-y', from: gy, to: { x, y } });

    // 5. onto a line
    if (!gx && !gy)
      for (const l of ctx.lines) {
        if (ctx.exclude?.has(l.a) || ctx.exclude?.has(l.b)) continue;
        const a = at(l.a);
        const b = at(l.b);
        const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
        if (!L2) continue;
        const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2;
        const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        if (t > -0.25 && t < 1.25 && px(Math.hypot(q.x - p.x, q.y - p.y)) < 8) {
          x = q.x;
          y = q.y;
          guides.push({ kind: 'line', from: a, to: b });
          label = 'on line';
          infer.push((id) => [{ kind: 'onLine', p: id, a: l.a, b: l.b, via: [l.id] }]);
          break;
        }
      }

    // 5b. onto an edge of reference geometry (no constraint)
    if (!gx && !gy && !guides.some((h) => h.kind === 'line') && ref)
      for (const [a, b] of ref.segments) {
        const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
        if (!L2) continue;
        const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2;
        if (t < 0 || t > 1) continue;
        const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
        if (px(Math.hypot(q.x - p.x, q.y - p.y)) < 8) {
          x = q.x;
          y = q.y;
          guides.push({ kind: 'line', from: a, to: b });
          break;
        }
      }

    // 6. round grid for what is still free
    const g = roundStep(scale, 6);
    if (!gx && !guides.some((h) => h.kind === 'line')) x = roundTo(x, g);
    if (!gy && !guides.some((h) => h.kind === 'line')) y = roundTo(y, g);
  }

  return { at: { x, y }, guides, label, infer: (id) => infer.flatMap((f) => f(id)) };
}

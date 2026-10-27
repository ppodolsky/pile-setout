import { applyRigid, type RigidTransform, type Vec2 } from '@buildkit/geometry';

/** How a background object is drawn: an outline, a fine detail line, or a light filled area. */
export type ShapeStyle = 'outline' | 'detail' | 'fill';

/**
 * A plain drawing object (no constraints), in the drawing's own coordinates, mm, Y up.
 * `title` is shown as a tooltip (e.g. "Corner casting").
 */
export type Shape =
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly style: ShapeStyle;
      readonly title?: string;
    }
  | {
      readonly kind: 'polyline';
      readonly points: readonly Vec2[];
      readonly closed: boolean;
      readonly style: ShapeStyle;
      readonly title?: string;
    }
  | {
      readonly kind: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly style: ShapeStyle;
      readonly title?: string;
    }
  | { readonly kind: 'text'; readonly x: number; readonly y: number; readonly text: string; readonly size: number };

/**
 * A background drawing: reference geometry that is shown but not set out — container outlines,
 * an existing building, a site plan. Placed by `offset` and `rotation` (degrees, CCW); can be
 * hidden or locked; points and edges of its shapes are snap targets.
 */
export interface BackgroundDrawing {
  readonly id: string;
  readonly name: string;
  readonly shapes: readonly Shape[];
  readonly offset: Vec2;
  readonly rotation: number;
  readonly visible: boolean;
  readonly locked: boolean;
}

/** The drawing's placement as a rigid transform (rotation about its own origin, then the offset). */
export const drawingTransform = (d: BackgroundDrawing): RigidTransform => ({
  angle: (d.rotation * Math.PI) / 180,
  pivot: { x: 0, y: 0 },
  t: d.offset,
});

/** Outline of a shape as world points (closed for rectangles; circles as 32-gons). */
export function shapeOutline(s: Shape, T: RigidTransform): { points: Vec2[]; closed: boolean } {
  const W = (p: Vec2) => applyRigid(T, p);
  switch (s.kind) {
    case 'rect':
      return {
        points: [
          { x: s.x, y: s.y },
          { x: s.x + s.w, y: s.y },
          { x: s.x + s.w, y: s.y + s.h },
          { x: s.x, y: s.y + s.h },
        ].map(W),
        closed: true,
      };
    case 'polyline':
      return { points: s.points.map(W), closed: s.closed };
    case 'circle':
      return {
        points: Array.from({ length: 32 }, (_, i) =>
          W({ x: s.cx + s.r * Math.cos((i * Math.PI) / 16), y: s.cy + s.r * Math.sin((i * Math.PI) / 16) }),
        ),
        closed: true,
      };
    case 'text':
      return { points: [W({ x: s.x, y: s.y })], closed: false };
  }
}

/** Snap targets of visible drawings: corners / vertices and edges (circles: their centres). */
export function drawingSnapGeometry(drawings: readonly BackgroundDrawing[]): { points: Vec2[]; segments: [Vec2, Vec2][] } {
  const points: Vec2[] = [];
  const segments: [Vec2, Vec2][] = [];
  for (const d of drawings) {
    if (!d.visible) continue;
    const T = drawingTransform(d);
    for (const s of d.shapes) {
      if (s.kind === 'text') continue;
      if (s.kind === 'circle') {
        points.push(applyRigid(T, { x: s.cx, y: s.cy }));
        continue;
      }
      const { points: pts, closed } = shapeOutline(s, T);
      points.push(...pts);
      for (let i = 0; i + 1 < pts.length; i++) segments.push([pts[i]!, pts[i + 1]!]);
      if (closed && pts.length > 2) segments.push([pts[pts.length - 1]!, pts[0]!]);
    }
  }
  return { points, segments };
}

/** World bounds of visible drawings (for fitting views). */
export function drawingExtent(drawings: readonly BackgroundDrawing[]): Vec2[] {
  return drawings.filter((d) => d.visible).flatMap((d) => d.shapes.flatMap((s) => shapeOutline(s, drawingTransform(d)).points));
}

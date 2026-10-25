import type { Vec2 } from './vec';

/**
 * A rigid motion of the plane (rotation by `angle` about `pivot`, then translation by `t`).
 * Never scales — what measurements between points cannot see is exactly this group.
 */
export interface RigidTransform {
  readonly angle: number;
  readonly pivot: Vec2;
  readonly t: Vec2;
}

export const IDENTITY: RigidTransform = { angle: 0, pivot: { x: 0, y: 0 }, t: { x: 0, y: 0 } };

export function applyRigid(T: RigidTransform, p: Vec2): Vec2 {
  const c = Math.cos(T.angle);
  const s = Math.sin(T.angle);
  const dx = p.x - T.pivot.x;
  const dy = p.y - T.pivot.y;
  return { x: T.pivot.x + c * dx - s * dy + T.t.x, y: T.pivot.y + s * dx + c * dy + T.t.y };
}

/** The same motion as an affine matrix [a b c d e f] (SVG `matrix()` order). */
export function rigidMatrix(T: RigidTransform): [number, number, number, number, number, number] {
  const a = Math.cos(T.angle);
  const b = Math.sin(T.angle);
  const e = T.pivot.x - a * T.pivot.x + b * T.pivot.y + T.t.x;
  const f = T.pivot.y - b * T.pivot.x - a * T.pivot.y + T.t.y;
  return [a, b, -b, a, e, f];
}

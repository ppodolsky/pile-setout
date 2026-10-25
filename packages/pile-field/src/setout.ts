import { distance, type Vec2 } from '@buildkit/geometry';
import { references, type Pile } from './design';

/** Parametric piles are either set out from their references or measured like fixed ones. */
export type ParametricMode = 'derived' | 'measured';

/** True when this pile is set out from its references (not measured) in this mode. */
export function isDerived(p: Pile, piles: readonly Pile[], mode: ParametricMode): boolean {
  if (mode !== 'derived' || p.def.kind === 'fixed') return false;
  return references(p.def).every((r) => piles.some((q) => q.id === r));
}

/**
 * How to set out a parametric pile on site once its references are in place:
 * - `string`: on the string line from → to, at `offset` from `from` (and `rest` from `to`);
 * - `swing`: swing two tapes — `da` from `a` and `db` from `b` — and take the intersection on the
 *   given side of the line a → b (as seen on the plan).
 */
export type SetoutInstruction =
  | { readonly kind: 'string'; readonly from: Pile; readonly to: Pile; readonly offset: number; readonly rest: number; readonly t: number }
  | {
      readonly kind: 'swing';
      readonly a: Pile;
      readonly da: number;
      readonly b: Pile;
      readonly db: number;
      readonly side: 'left' | 'right' | 'on';
    };

const byId = (piles: readonly Pile[], id: string) => piles.find((q) => q.id === id);

export function setoutInstruction(p: Pile, piles: readonly Pile[]): SetoutInstruction | null {
  const def = p.def;
  if (def.kind === 'between') {
    const from = byId(piles, def.from);
    const to = byId(piles, def.to);
    if (!from || !to) return null;
    const L = distance(from, to);
    const offset = distance(from, p);
    return { kind: 'string', from, to, offset, rest: L - offset, t: L > 0 ? offset / L : 0 };
  }
  if (def.kind === 'polar') {
    const a = byId(piles, def.from);
    if (!a) return null;
    // second tape from the angle reference if any, else from the nearest other pile that is not
    // (nearly) in line with a → p, so the two arcs cross at a clear angle
    const candidates = (def.ref ? [byId(piles, def.ref)] : [])
      .concat(piles.filter((q) => q.id !== a.id && q.id !== p.id).sort((x, y) => distance(x, p) - distance(y, p)))
      .filter((q): q is Pile => !!q && crossing(a, q, p) > 0.25);
    const b = candidates[0];
    if (!b) return null;
    return { kind: 'swing', a, da: distance(a, p), b, db: distance(b, p), side: side(a, b, p) };
  }
  return null;
}

/** |sin| of the angle between the two tapes at p (0 = tangent arcs, bad; 1 = right angle, best). */
function crossing(a: Vec2, b: Vec2, p: Vec2): number {
  const ux = a.x - p.x,
    uy = a.y - p.y,
    vx = b.x - p.x,
    vy = b.y - p.y;
  const lu = Math.hypot(ux, uy),
    lv = Math.hypot(vx, vy);
  return lu && lv ? Math.abs(ux * vy - uy * vx) / (lu * lv) : 0;
}

/** Side of p relative to the directed line a → b, Y up (left = counter-clockwise). */
function side(a: Vec2, b: Vec2, p: Vec2): 'left' | 'right' | 'on' {
  const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return Math.abs(c) < 1e-6 * distance(a, b) ? 'on' : c > 0 ? 'left' : 'right';
}

export function fractionWords(t: number): string | null {
  const known: [number, string][] = [
    [0.5, 'half'],
    [0.25, 'a quarter'],
    [0.75, 'three quarters'],
    [1 / 3, 'a third'],
    [2 / 3, 'two thirds'],
  ];
  return known.find(([v]) => Math.abs(v - t) < 0.002)?.[1] ?? null;
}

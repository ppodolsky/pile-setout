import { distance, type Vec2 } from '@buildkit/geometry';
import { constraintPoints, type Constraint } from '@buildkit/sketch';
import type { Pile } from './design';

/** In field work, piles marked `derive` are set out from others — or everything is measured. */
export type ParametricMode = 'derived' | 'measured';

export const isDerived = (p: Pile, mode: ParametricMode): boolean => mode === 'derived' && p.setout === 'derive';

/**
 * How to set out a pile from piles already in place:
 * - `string`: on the string line from → to, at `offset` from `from` (and `rest` from `to`);
 * - `swing`: swing two tapes — `da` from `a` and `db` from `b` — and take the crossing on the given
 *   side of the line a → b (as seen on the plan, Y up).
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

export interface SetoutStep {
  readonly pile: Pile;
  /** 1-based order: a pile is set only from piles measured or set before it. */
  readonly order: number;
  readonly instruction: SetoutInstruction | null;
}

/**
 * Orders the piles to set out and says how: measured piles are in place first; then each derived
 * pile is set from piles already placed — its own constraint partners first (the string between
 * the two ends it sits between, or tapes from the piles it is dimensioned from), else the nearest
 * placed piles whose tapes cross at a clear angle. Never from a pile that isn't placed yet.
 */
export function setoutPlan(derived: readonly Pile[], measured: readonly Pile[], constraints: readonly Constraint[]): SetoutStep[] {
  // constraints tie points; piles stand on points
  const placed = new Map(measured.map((p) => [p.point, p]));
  const waiting = [...derived];
  const steps: SetoutStep[] = [];
  while (waiting.length) {
    let progress = false;
    for (let i = 0; i < waiting.length; i++) {
      const p = waiting[i]!;
      const ins = instruction(p, placed, constraints);
      if (!ins) continue;
      steps.push({ pile: p, order: steps.length + 1, instruction: ins });
      placed.set(p.point, p);
      waiting.splice(i--, 1);
      progress = true;
    }
    if (!progress) break;
  }
  for (const p of waiting) steps.push({ pile: p, order: steps.length + 1, instruction: null });
  return steps;
}

function instruction(p: Pile, placed: ReadonlyMap<string, Pile>, constraints: readonly Constraint[]): SetoutInstruction | null {
  const mine = constraints.filter((c) => constraintPoints(c).includes(p.point));
  // on a line between two placed piles → the string
  for (const c of mine)
    if ((c.kind === 'ratio' || c.kind === 'onLine') && c.p === p.point) {
      const from = placed.get(c.a);
      const to = placed.get(c.b);
      if (from && to) {
        const L = distance(from, to);
        const offset = distance(from, p);
        return { kind: 'string', from, to, offset, rest: L - offset, t: L > 0 ? offset / L : 0 };
      }
    }
  // two tapes: partners from its own constraints first, then the nearest placed piles
  const partners = mine.flatMap((c) => constraintPoints(c)).filter((id) => id !== p.point);
  const candidates = [
    ...new Set([
      ...partners.filter((id) => placed.has(id)),
      ...[...placed.values()].sort((x, y) => distance(x, p) - distance(y, p)).map((q) => q.id),
    ]),
  ].map((id) => placed.get(id)!);
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (crossing(a, b, p) > 0.25) return { kind: 'swing', a, da: distance(a, p), b, db: distance(b, p), side: side(a, b, p) };
    }
  return null;
}

/** |sin| of the angle between the two tapes at p (0 = arcs touch, bad; 1 = right angle, best). */
function crossing(a: Vec2, b: Vec2, p: Vec2): number {
  const ux = a.x - p.x;
  const uy = a.y - p.y;
  const vx = b.x - p.x;
  const vy = b.y - p.y;
  const lu = Math.hypot(ux, uy);
  const lv = Math.hypot(vx, vy);
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

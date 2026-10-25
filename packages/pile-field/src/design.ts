import { distance, lerp, type Vec2 } from '@buildkit/geometry';

/**
 * How a pile's position is defined — fixed coordinates, or parametric from other piles (CAD-style).
 * Coordinates are millimetres in the design frame: X along the containers, Y across, Y up;
 * angles are degrees, counter-clockwise positive.
 */
export type PileDef =
  | { readonly kind: 'fixed'; readonly x: number; readonly y: number }
  /** On the line from → to: by ratio (0 = from, 1 = to) or by distance from `from`. */
  | { readonly kind: 'between'; readonly from: string; readonly to: string; readonly by: 'ratio'; readonly t: number }
  | { readonly kind: 'between'; readonly from: string; readonly to: string; readonly by: 'distance'; readonly distance: number }
  /** At `distance` from `from`, turned `angle` from the X axis, or from the direction from → `ref`. */
  | {
      readonly kind: 'polar';
      readonly from: string;
      readonly distance: number;
      readonly angle: number;
      readonly ref: string | null;
    };

export type PileKind = PileDef['kind'];

/** A pile as stored in a design. `id` is stable; `label` is what people see and may be renamed. */
export interface PileSpec {
  readonly id: string;
  readonly label: string;
  readonly def: PileDef;
  /** One pile carrying the corner castings of two neighbouring containers. */
  readonly shared?: boolean;
}

/** A pile with its resolved design position. */
export interface Pile extends PileSpec, Vec2 {}

/** Piles a definition depends on. */
export function references(def: PileDef): string[] {
  switch (def.kind) {
    case 'fixed':
      return [];
    case 'between':
      return [def.from, def.to];
    case 'polar':
      return def.ref ? [def.from, def.ref] : [def.from];
  }
}

export type DesignIssue = 'missing-reference' | 'cycle' | 'degenerate';

export interface ResolvedDesign {
  /** Resolved piles in the original order (piles with issues are left out). */
  readonly piles: Pile[];
  /** Ids in an order where every pile comes after the piles it depends on. */
  readonly order: string[];
  readonly issues: ReadonlyMap<string, DesignIssue>;
}

/** Evaluates all definitions in dependency order; reports missing references and cycles. */
export function resolveDesign(specs: readonly PileSpec[]): ResolvedDesign {
  const byId = new Map(specs.map((s) => [s.id, s]));
  const pos = new Map<string, Vec2>();
  const issues = new Map<string, DesignIssue>();
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (id: string): Vec2 | null => {
    if (pos.has(id)) return pos.get(id)!;
    if (issues.has(id)) return null;
    const spec = byId.get(id);
    if (!spec) return null;
    if (state.get(id) === 'visiting') {
      issues.set(id, 'cycle');
      return null;
    }
    if (references(spec.def).some((r) => !byId.has(r))) {
      issues.set(id, 'missing-reference');
      return null;
    }
    state.set(id, 'visiting');
    const refs = new Map<string, Vec2>();
    for (const r of references(spec.def)) {
      const p = byId.has(r) ? visit(r) : null;
      if (!p) {
        if (!issues.has(id)) issues.set(id, issues.get(r) === 'cycle' ? 'cycle' : 'missing-reference');
        state.set(id, 'done');
        return null;
      }
      refs.set(r, p);
    }
    const p = evaluate(spec.def, refs);
    state.set(id, 'done');
    if (!p) {
      issues.set(id, 'degenerate');
      return null;
    }
    pos.set(id, p);
    order.push(id);
    return p;
  };
  for (const s of specs) visit(s.id);
  const piles = specs.filter((s) => pos.has(s.id)).map((s) => ({ ...s, ...pos.get(s.id)! }));
  return { piles, order, issues };
}

function evaluate(def: PileDef, refs: ReadonlyMap<string, Vec2>): Vec2 | null {
  switch (def.kind) {
    case 'fixed':
      return { x: def.x, y: def.y };
    case 'between': {
      const a = refs.get(def.from)!;
      const b = refs.get(def.to)!;
      const L = distance(a, b);
      if (L < 1e-9) return null;
      return lerp(a, b, def.by === 'ratio' ? def.t : def.distance / L);
    }
    case 'polar': {
      const a = refs.get(def.from)!;
      let base = 0;
      if (def.ref) {
        const r = refs.get(def.ref)!;
        if (distance(a, r) < 1e-9) return null;
        base = Math.atan2(r.y - a.y, r.x - a.x);
      }
      const th = base + (def.angle * Math.PI) / 180;
      return { x: a.x + def.distance * Math.cos(th), y: a.y + def.distance * Math.sin(th) };
    }
  }
}

/** Makes a pile fixed at its current resolved position (keeps it where it is). */
export function freeze(p: Pile): PileSpec {
  return { id: p.id, label: p.label, def: { kind: 'fixed', x: p.x, y: p.y }, ...(p.shared ? { shared: true } : {}) };
}

import { distance, type Vec2 } from '@buildkit/geometry';
import {
  adjustDistances,
  findBlunders,
  requiredRank,
  rigidityRank,
  type Adjustment,
  type DistanceObservation,
  type Residual,
} from '@buildkit/survey';
import type { Pile } from './design';
import { isDerived, type ParametricMode } from './setout';
import { correctedLength, type Measurement } from './measurement';
import { bestPlacement, moveLowerBound, needsMove, type Correction, type Placement } from './placement';

export interface PlanInput {
  readonly piles: readonly Pile[];
  readonly measurements: readonly Measurement[];
  /** Allowed offset of a pile from its design position, mm. */
  readonly tolerance: number;
  /** Pile ids treated as exact references. */
  readonly pinned: ReadonlySet<string>;
  /** Piles marked “set out from neighbours”: set out after the others, or measured like them. */
  readonly parametric: ParametricMode;
  /** Assumed precision of one tape reading, mm (1σ). */
  readonly sigma?: number;
}

interface PlanBase {
  /** Piles solved from measurements. */
  readonly measured: readonly Pile[];
  /** Piles set out from others after the measured ones are corrected (not measured). */
  readonly derived: readonly Pile[];
  /** Actual positions of measured piles (field frame), when measurements allow. */
  readonly positions: ReadonlyMap<string, Vec2>;
}

export type Plan =
  | (PlanBase & { readonly status: 'empty' })
  | (PlanBase & { readonly status: 'under'; readonly adjustment: Adjustment; readonly rank: number; readonly need: number })
  | (PlanBase & {
      readonly status: 'contradictory';
      readonly adjustment: Adjustment;
      readonly worst: Residual;
      /** Readings equally suspect as `worst` (few checks). */
      readonly alike: readonly Residual[];
    })
  | (PlanBase & { readonly status: 'pinconflict'; readonly adjustment: Adjustment; readonly placement: Placement })
  | (PlanBase & {
      readonly status: 'ok';
      readonly adjustment: Adjustment;
      readonly placement: Placement;
      /** Piles to move, largest first. */
      readonly moves: readonly Correction[];
      /** Move order by pile id (1-based). */
      readonly steps: ReadonlyMap<string, number>;
      /** Proven minimum from conflicting pairs (null for very large fields). */
      readonly lowerBound: number | null;
      /** Extra moves caused by pinned piles. */
      readonly extraMovesFromPins: number;
    });

export type PlanStatus = Plan['status'];

/** Measurements usable for the adjustment, as distance observations. */
export function observations(measurements: readonly Measurement[]): DistanceObservation[] {
  const out: DistanceObservation[] = [];
  for (const m of measurements) {
    const length = correctedLength(m);
    if (length != null) out.push({ a: m.a, b: m.b, length, ref: m.id });
  }
  return out;
}

/** The whole calculation: adjustment → rigidity → blunder test → minimum-moves placement. */
export function computePlan(input: PlanInput): Plan {
  const { piles, tolerance, pinned, parametric } = input;
  const measured = piles.filter((p) => !isDerived(p, parametric));
  const derived = piles.filter((p) => isDerived(p, parametric));
  const base = { measured, derived, positions: new Map<string, Vec2>() };
  const adjustment = adjustDistances(measured, observations(input.measurements), { sigma: input.sigma ?? 1 });
  if (!adjustment) return { ...base, status: 'empty' };
  const withPositions = { ...base, positions: adjustment.positions };

  const need = requiredRank(measured.length);
  const rank = rigidityRank(measured, adjustment.used);
  if (rank < need) return { ...withPositions, status: 'under', adjustment, rank, need };

  const blunders = findBlunders(adjustment, {
    minError: 2 * tolerance,
    maxRms: Math.max(1.5, tolerance),
    maxMisfit: Math.max(3 * tolerance, 5),
  });
  if (blunders.suspect && blunders.worst)
    return { ...withPositions, status: 'contradictory', adjustment, worst: blunders.worst, alike: blunders.alike };

  const actual = measured.map((p) => adjustment.positions.get(p.id)!);
  const placement = bestPlacement(measured, actual, tolerance, pinned);
  if (!placement) return { ...base, status: 'empty' };
  if (placement.pinConflict) return { ...withPositions, status: 'pinconflict', adjustment, placement };

  const moves = placement.corrections.filter((c) => needsMove(c.offset, tolerance)).sort((a, b) => b.offset - a.offset);
  const steps = new Map(moves.map((m, i) => [m.id, i + 1]));
  let extraMovesFromPins = 0;
  if (pinned.size) {
    const free = bestPlacement(measured, actual, tolerance, new Set());
    if (free) extraMovesFromPins = moves.length - free.corrections.filter((c) => needsMove(c.offset, tolerance)).length;
  }
  const lowerBound = moveLowerBound(
    measured.map((p) => p.id),
    adjustment.residuals.map((r) => ({ a: r.a, b: r.b, actual: r.fitted, design: distance(byId(piles, r.a), byId(piles, r.b)) })),
    tolerance,
  );
  return { ...withPositions, status: 'ok', adjustment, placement, moves, steps, lowerBound, extraMovesFromPins };
}

const byId = (piles: readonly Pile[], id: string): Pile => piles.find((p) => p.id === id)!;

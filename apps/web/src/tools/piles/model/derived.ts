import { useMemo } from 'react';
import {
  computePlan,
  containerOutlines,
  setoutPlan,
  solveDesign,
  suggestNext,
  type DesignStatus,
  type Pile,
  type Plan,
  type SetoutStep,
  type Suggestion,
} from './deps';
import { useProject } from './store';

export interface DesignView {
  readonly piles: readonly Pile[];
  readonly status: DesignStatus;
}

/** The sketch with its solver status (conflicts, which piles are fully determined). */
export function useDesign(): DesignView {
  const piles = useProject((s) => s.design.piles);
  const constraints = useProject((s) => s.design.constraints);
  return useMemo(() => {
    const { status } = solveDesign({ piles, constraints });
    return { piles, status };
  }, [piles, constraints]);
}

export function useOutlines() {
  const containers = useProject((s) => s.design.template.containers);
  return useMemo(() => containerOutlines(containers), [containers]);
}

export interface FieldworkView {
  readonly piles: readonly Pile[];
  readonly plan: Plan;
  readonly next: Suggestion | null;
  /** How and in which order to set out the piles that are not measured. */
  readonly setout: readonly SetoutStep[];
}

/** The field-work calculation for the current design and measurements. */
export function useFieldwork(): FieldworkView {
  const piles = useProject((s) => s.design.piles);
  const constraints = useProject((s) => s.design.constraints);
  const fw = useProject((s) => s.fieldwork);
  return useMemo(() => {
    const plan = computePlan({
      piles,
      measurements: fw.measurements,
      tolerance: fw.tolerance,
      pinned: new Set(fw.pinned),
      parametric: fw.parametric,
    });
    return { piles, plan, next: suggestNext(plan, fw.measurements), setout: setoutPlan(plan.derived, plan.measured, constraints) };
  }, [piles, constraints, fw]);
}

export const pileLabel = (piles: readonly { id: string; label: string }[], id: string): string =>
  piles.find((p) => p.id === id)?.label ?? '?';

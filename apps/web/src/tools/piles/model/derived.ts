import { useMemo } from 'react';
import {
  computePlan,
  containerOutlines,
  pilesOf,
  setoutPlan,
  solveDocument,
  suggestNext,
  type DocumentStatus,
  type Pile,
  type PileDesign,
  type Plan,
  type SetoutStep,
  type Suggestion,
} from './deps';
import { useProject } from './store';

export interface DesignView {
  readonly doc: PileDesign;
  readonly piles: readonly Pile[];
  readonly status: DocumentStatus;
  /** Label of a point: its pile's label, or empty for a bare point. */
  readonly labelOf: (pointId: string) => string;
}

/** The plan with its solver status (conflicts, which points are fully determined). */
export function useDesign(): DesignView {
  const doc = useProject((s) => s.design.doc);
  return useMemo(() => {
    const { status } = solveDocument(doc);
    const piles = pilesOf(doc);
    const byPoint = new Map(piles.map((p) => [p.point, p.label]));
    return { doc, piles, status, labelOf: (id: string) => byPoint.get(id) ?? '' };
  }, [doc]);
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
  const doc = useProject((s) => s.design.doc);
  const fw = useProject((s) => s.fieldwork);
  return useMemo(() => {
    const piles = pilesOf(doc);
    const plan = computePlan({
      piles,
      measurements: fw.measurements,
      tolerance: fw.tolerance,
      pinned: new Set(fw.pinned),
      parametric: fw.parametric,
    });
    return { piles, plan, next: suggestNext(plan, fw.measurements), setout: setoutPlan(plan.derived, plan.measured, doc.constraints) };
  }, [doc, fw]);
}

export const pileLabel = (piles: readonly { id: string; label: string }[], id: string): string =>
  piles.find((p) => p.id === id)?.label ?? '?';

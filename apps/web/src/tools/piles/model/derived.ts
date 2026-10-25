import { useMemo } from 'react';
import {
  computePlan,
  containerOutlines,
  resolveDesign,
  suggestNext,
  type Pile,
  type Plan,
  type ResolvedDesign,
  type Suggestion,
} from './deps';
import { useProject } from './store';

/** Resolved design (positions of all piles, issues), recomputed only when the piles change. */
export function useResolved(): ResolvedDesign {
  const specs = useProject((s) => s.design.piles);
  return useMemo(() => resolveDesign(specs), [specs]);
}

export function useOutlines() {
  const containers = useProject((s) => s.design.template.containers);
  return useMemo(() => containerOutlines(containers), [containers]);
}

export interface FieldworkView {
  readonly piles: readonly Pile[];
  readonly plan: Plan;
  readonly next: Suggestion | null;
}

/** The field-work calculation for the current design and measurements. */
export function useFieldwork(): FieldworkView {
  const { piles } = useResolved();
  const fw = useProject((s) => s.fieldwork);
  return useMemo(() => {
    const plan = computePlan({
      piles,
      measurements: fw.measurements,
      tolerance: fw.tolerance,
      pinned: new Set(fw.pinned),
      parametric: fw.parametric,
    });
    return { piles, plan, next: suggestNext(plan, fw.measurements) };
  }, [piles, fw]);
}

export const pileLabel = (piles: readonly { id: string; label: string }[], id: string): string =>
  piles.find((p) => p.id === id)?.label ?? '?';

import { useMemo } from 'react';
import type { CadOps } from '@/cad';
import { useProject } from './store';

/**
 * The pile tool's answer to what a CAD view asks for: new points from the pile tool carry a pile;
 * points created from a selection action (midpoint, distance + angle …) get a pile that is set out
 * from its neighbours in field work.
 */
export function usePileOps(): CadOps {
  return useMemo(() => {
    const s = () => useProject.getState();
    return {
      movePoint: (id, to) => s().movePoint(id, to),
      setPointPosition: (id, to) => s().setPointPosition(id, to),
      place: (tool, at, infer) => s().place(tool === 'pile' ? 'pile' : 'point', at, infer),
      addLine: (a, b) => s().addLine(a, b),
      addConstraints: (drafts) => s().addConstraints(drafts),
      updateConstraint: (id, patch) => s().updateConstraint(id, patch),
      remove: (r) => s().remove(r),
      create: (action, ctx) => {
        const { at, constraints } = action.create!(ctx);
        return s().place('pile', at, constraints, 'derive');
      },
    } satisfies CadOps;
  }, []);
}

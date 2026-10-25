import {
  Anchor,
  ArrowLeftRight,
  ArrowUpDown,
  Diameter,
  GitCommitHorizontal,
  Minus,
  MoveDiagonal,
  Ruler,
  Spline,
  TriangleRight,
} from 'lucide-react';
import type { Constraint, ConstraintKind } from '@buildkit/sketch';
import { fmt } from '@/lib/format';

/** How each constraint kind is named and shown. */
export const CONSTRAINT_META: Record<ConstraintKind, { name: string; icon: typeof Ruler; unit?: 'mm' | '°' | '' }> = {
  fix: { name: 'Fixed', icon: Anchor },
  distance: { name: 'Distance', icon: Ruler, unit: 'mm' },
  dx: { name: 'ΔX', icon: ArrowLeftRight, unit: 'mm' },
  dy: { name: 'ΔY', icon: ArrowUpDown, unit: 'mm' },
  horizontal: { name: 'Horizontal', icon: Minus },
  vertical: { name: 'Vertical', icon: Diameter },
  angle: { name: 'Angle', icon: TriangleRight, unit: '°' },
  ratio: { name: 'On line at ratio', icon: GitCommitHorizontal, unit: '' },
  onLine: { name: 'On line', icon: Spline },
};

export const ACTION_ICON: Record<string, typeof Ruler> = {
  fix: Anchor,
  'polar-pile': MoveDiagonal,
  distance: Ruler,
  'distance-angle': TriangleRight,
  horizontal: Minus,
  vertical: Diameter,
  dx: ArrowLeftRight,
  dy: ArrowUpDown,
  'mid-pile': GitCommitHorizontal,
  midpoint: GitCommitHorizontal,
  ratio: GitCommitHorizontal,
  online: Spline,
  'angle-ref': TriangleRight,
};

/** The editable number of a constraint, if any. */
export function constraintValue(c: Constraint): { key: 'd' | 'angle' | 't'; value: number } | null {
  if (c.kind === 'distance' || c.kind === 'dx' || c.kind === 'dy') return { key: 'd', value: c.d };
  if (c.kind === 'angle') return { key: 'angle', value: c.angle };
  if (c.kind === 'ratio') return { key: 't', value: c.t };
  return null;
}

/** "C1 → C3", "C2 on C1–C3", … */
export function constraintSubject(c: Constraint, L: (id: string) => string): string {
  switch (c.kind) {
    case 'fix':
      return `${L(c.p)} at ${fmt(c.x, 0)}, ${fmt(c.y, 0)}`;
    case 'ratio':
    case 'onLine':
      return `${L(c.p)} on ${L(c.a)}–${L(c.b)}`;
    case 'angle':
      return `${L(c.a)} → ${L(c.b)}${c.ref ? ` from →${L(c.ref)}` : ''}`;
    default:
      return `${L(c.a)} → ${L(c.b)}`;
  }
}

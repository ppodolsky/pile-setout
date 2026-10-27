import {
  Anchor,
  ArrowLeftRight,
  ArrowUpDown,
  CircleDot,
  Diameter,
  Equal,
  GitCommitHorizontal,
  Minus,
  MoveDiagonal,
  Ruler,
  Spline,
  SquareDot,
  TriangleRight,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import type { SelectionAction } from '@buildkit/cad';
import type { Constraint, ConstraintKind } from '@buildkit/sketch';
import type { cad as cadEn } from '@/i18n/locales/en/cad';
import { fmt } from '@/lib/format';

/** How each constraint kind is shown; its name is `constraintName()` (translated). */
export const CONSTRAINT_META: Record<ConstraintKind, { icon: typeof Ruler; unit?: 'mm' | '°' | '' }> = {
  fix: { icon: Anchor },
  distance: { icon: Ruler, unit: 'mm' },
  dx: { icon: ArrowLeftRight, unit: 'mm' },
  dy: { icon: ArrowUpDown, unit: 'mm' },
  horizontal: { icon: Minus },
  vertical: { icon: Diameter },
  angle: { icon: TriangleRight, unit: '°' },
  ratio: { icon: GitCommitHorizontal, unit: '' },
  onLine: { icon: Spline },
  coincident: { icon: CircleDot },
  parallel: { icon: Equal },
  perpendicular: { icon: SquareDot },
  equal: { icon: Equal },
};

/** The translator of the `cad` namespace (from `useTranslation('cad')`). */
export type CadT = TFunction<'cad'>;

/** Display name of a constraint kind ("Distance", "On line" …) in the current language. */
export const constraintName = (kind: ConstraintKind, t: CadT): string => t(`constraints.${kind}`);

type ActionId = keyof (typeof cadEn)['actions'];

/** Name and hint of a selection action in the current language; the package's English if unknown. */
export function actionText(a: SelectionAction, t: CadT): { name: string; hint: string } {
  const id = a.id as ActionId;
  return {
    name: t(`actions.${id}.name`, { defaultValue: a.name }),
    hint: t(`actions.${id}.hint`, { defaultValue: a.hint }),
  };
}

/** Icons for selection actions (by action id). */
export const ACTION_ICON: Record<string, typeof Ruler> = {
  fix: Anchor,
  'polar-point': MoveDiagonal,
  distance: Ruler,
  'distance-angle': TriangleRight,
  horizontal: Minus,
  vertical: Diameter,
  'line-horizontal': Minus,
  'line-vertical': Diameter,
  dx: ArrowLeftRight,
  dy: ArrowUpDown,
  coincident: CircleDot,
  'mid-point': GitCommitHorizontal,
  'line-mid-point': GitCommitHorizontal,
  midpoint: GitCommitHorizontal,
  'line-midpoint': GitCommitHorizontal,
  ratio: GitCommitHorizontal,
  online: Spline,
  'on-line': Spline,
  'angle-ref': TriangleRight,
  length: Ruler,
  parallel: Equal,
  perpendicular: SquareDot,
  equal: Equal,
};

/** The editable number of a constraint, if any. */
export function constraintValue(c: Constraint): { key: 'd' | 'angle' | 't'; value: number } | null {
  if (c.kind === 'distance' || c.kind === 'dx' || c.kind === 'dy') return { key: 'd', value: c.d };
  if (c.kind === 'angle') return { key: 'angle', value: c.angle };
  if (c.kind === 'ratio') return { key: 't', value: c.t };
  return null;
}

/** "C1 → C3", "C2 on C1–C3", … in the current language. */
export function constraintSubject(c: Constraint, L: (id: string) => string, t: CadT): string {
  switch (c.kind) {
    case 'fix':
      return t('subject.fix', { p: L(c.p), x: fmt(c.x, 0), y: fmt(c.y, 0) });
    case 'ratio':
    case 'onLine':
      return t('subject.onLine', { p: L(c.p), a: L(c.a), b: L(c.b) });
    case 'angle':
      return c.ref ? t('subject.angleFrom', { a: L(c.a), b: L(c.b), ref: L(c.ref) }) : `${L(c.a)} → ${L(c.b)}`;
    case 'parallel':
    case 'perpendicular':
    case 'equal':
      return t('subject.pair', { a: L(c.a), b: L(c.b), c: L(c.c), d: L(c.d) });
    default:
      return `${L(c.a)} → ${L(c.b)}`;
  }
}

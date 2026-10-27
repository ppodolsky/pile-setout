import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CadConstraint, Point } from '@buildkit/cad';
import { NativeSelect } from '@/components/native-select';
import { NumberInput } from '@/components/number-input';
import { cn } from '@/lib/utils';
import { useCadEditor } from './editor';
import { CONSTRAINT_META, constraintName, constraintSubject, constraintValue } from './meta';
import type { CadOps } from './ops';

/** One constraint: what it ties, its value (editable), angle reference, delete. */
export function ConstraintRow({
  c,
  points,
  labelOf,
  ops,
  conflict,
}: {
  c: CadConstraint;
  points: readonly Point[];
  labelOf: (id: string) => string;
  ops: CadOps;
  conflict: boolean;
}) {
  const { t } = useTranslation(['cad', 'common']);
  const selected = useCadEditor((s) => s.constraint === c.id);
  const selectConstraint = useCadEditor((s) => s.selectConstraint);
  const meta = CONSTRAINT_META[c.kind];
  const Icon = meta.icon;
  const name = constraintName(c.kind, t);
  const value = constraintValue(c);
  const L = (id: string) => labelOf(id) || '·';
  return (
    <li
      className={cn(
        'rounded-md border px-2 py-1.5',
        selected ? 'border-[var(--draw-select)] bg-[color-mix(in_oklch,var(--draw-select)_8%,transparent)]' : 'border-transparent',
        conflict && 'border-err/60 bg-err/5',
      )}
      onClick={() => selectConstraint(c.id)}
    >
      <div className="flex items-center gap-2 text-sm">
        <Icon className={cn('size-3.5 shrink-0', conflict ? 'text-err' : 'text-primary')} />
        <span className="font-medium">{name}</span>
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{constraintSubject(c, L, t)}</span>
        <button
          className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={t('row.delete', { name })}
          onClick={(e) => {
            e.stopPropagation();
            ops.remove({ constraints: [c.id] });
          }}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {(value || c.kind === 'angle' || c.kind === 'fix') && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-5.5">
          {value && (
            <>
              <NumberInput
                className="h-7 w-28 text-xs"
                value={value.value}
                digits={value.key === 't' ? 4 : 2}
                aria-label={t('row.value', { name })}
                onValue={(v) => v != null && ops.updateConstraint(c.id, { [value.key]: v })}
              />
              <span className="text-xs text-muted-foreground">
                {meta.unit === '' ? t('row.ratioHint') : meta.unit === 'mm' ? t('common:mm') : meta.unit}
              </span>
            </>
          )}
          {c.kind === 'fix' && (
            <>
              <NumberInput
                className="h-7 w-24 text-xs"
                value={c.x}
                aria-label={t('row.fixedX')}
                onValue={(x) => x != null && ops.setPointPosition(c.p, { x, y: c.y })}
              />
              <NumberInput
                className="h-7 w-24 text-xs"
                value={c.y}
                aria-label={t('row.fixedY')}
                onValue={(y) => y != null && ops.setPointPosition(c.p, { x: c.x, y })}
              />
            </>
          )}
          {c.kind === 'angle' && (
            <NativeSelect
              className="w-full"
              value={c.ref ?? ''}
              onChange={(e) => ops.updateConstraint(c.id, { ref: e.target.value || null })}
              aria-label={t('row.angleFrom')}
            >
              <option value="">{t('row.fromXAxis')}</option>
              {points
                .filter((p) => p.id !== c.a && p.id !== c.b)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {t('row.fromDirection', { a: L(c.a), b: L(p.id) })}
                  </option>
                ))}
            </NativeSelect>
          )}
        </div>
      )}
    </li>
  );
}

import { Trash2 } from 'lucide-react';
import type { Pile } from '@buildkit/pile-field';
import type { Constraint } from '@buildkit/sketch';
import { NativeSelect } from '@/components/native-select';
import { NumberInput } from '@/components/number-input';
import { cn } from '@/lib/utils';
import { pileLabel } from '../model/derived';
import { useEditor } from '../model/editor';
import { useProject } from '../model/store';
import { CONSTRAINT_META, constraintSubject, constraintValue } from './meta';

/** One constraint: what it ties, its value (editable), angle reference, delete. */
export function ConstraintRow({ c, piles, conflict }: { c: Constraint; piles: readonly Pile[]; conflict: boolean }) {
  const { updateConstraint, deleteConstraint } = useProject.getState();
  const selected = useEditor((s) => s.constraint === c.id);
  const selectConstraint = useEditor((s) => s.selectConstraint);
  const meta = CONSTRAINT_META[c.kind];
  const Icon = meta.icon;
  const value = constraintValue(c);
  const L = (id: string) => pileLabel(piles, id);
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
        <span className="font-medium">{meta.name}</span>
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{constraintSubject(c, L)}</span>
        <button
          className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={`Delete ${meta.name} constraint`}
          onClick={(e) => {
            e.stopPropagation();
            deleteConstraint(c.id);
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
                aria-label={`${meta.name} value`}
                onValue={(v) => v != null && updateConstraint(c.id, { [value.key]: v } as Partial<Constraint>)}
              />
              <span className="text-xs text-muted-foreground">
                {meta.unit === '' ? '(0 = first, 1 = second, 0.5 = middle)' : meta.unit}
              </span>
            </>
          )}
          {c.kind === 'fix' && (
            <>
              <NumberInput
                className="h-7 w-24 text-xs"
                value={c.x}
                aria-label="Fixed X"
                onValue={(x) => x != null && useProject.getState().movePile(c.p, { x, y: c.y }, { moveFix: true })}
              />
              <NumberInput
                className="h-7 w-24 text-xs"
                value={c.y}
                aria-label="Fixed Y"
                onValue={(y) => y != null && useProject.getState().movePile(c.p, { x: c.x, y }, { moveFix: true })}
              />
            </>
          )}
          {c.kind === 'angle' && (
            <NativeSelect
              className="w-full"
              value={c.ref ?? ''}
              onChange={(e) => updateConstraint(c.id, { ref: e.target.value || null } as Partial<Constraint>)}
              aria-label="Angle measured from"
            >
              <option value="">from the X axis</option>
              {piles
                .filter((p) => p.id !== c.a && p.id !== c.b)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    from direction {L(c.a)} → {p.label}
                  </option>
                ))}
            </NativeSelect>
          )}
        </div>
      )}
    </li>
  );
}

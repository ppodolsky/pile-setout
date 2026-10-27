import { CirclePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { selectionActions, type Element } from '@buildkit/cad';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCadEditor } from './editor';
import { ACTION_ICON, actionText } from './meta';
import type { CadModel, CadOps } from './ops';

/** Constraint / create buttons for the current selection (points and lines, in pick order). */
export function SelectionToolbar<E extends Element>({ model, ops }: { model: CadModel<E>; ops: CadOps }) {
  const { t } = useTranslation('cad');
  const { selection, select, say } = useCadEditor();
  const points = selection.flatMap((r) => (r.kind === 'point' ? model.doc.points.filter((p) => p.id === r.id) : []));
  const lines = selection.flatMap((r) => (r.kind === 'line' ? model.doc.lines.filter((l) => l.id === r.id) : []));
  const actions = selectionActions(points.length, lines.length);
  if (!actions.length) return null;
  const ctx = { points, lines, at: (id: string) => model.doc.points.find((p) => p.id === id)! };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {actions.map((a) => {
        const Icon = ACTION_ICON[a.id] ?? CirclePlus;
        const text = actionText(a, t);
        return (
          <Tooltip key={a.id}>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={() => {
                  if (a.create) {
                    select([{ kind: 'point', id: ops.create(a, ctx) }]);
                    return;
                  }
                  const { added, redundant } = ops.addConstraints(a.constraints!(ctx));
                  say(
                    !added.length
                      ? t('added.nothing')
                      : redundant
                        ? t('added.someRedundant', { added: String(added.length), redundant: String(redundant) })
                        : null,
                  );
                }}
              >
                <Icon className="size-3.5" />
                {text.name}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-60">{text.hint}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

import { CircleCheck, CircleDashed, Crosshair, Ruler } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCadEditor, isSelected } from '@/cad';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDesign } from '../model/derived';

/** All piles: constraint status, field-work role, position. Click to select, Shift-click to add. */
export function PileList() {
  const { t } = useTranslation(['design', 'cad']);
  const { piles, status } = useDesign();
  const selection = useCadEditor((s) => s.selection);
  const { select, toggle } = useCadEditor.getState();
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle>{t('list.title', { n: String(piles.length) })}</CardTitle>
      </CardHeader>
      <CardContent className="px-2">
        <ul className="divide-y">
          {piles.map((p) => {
            const ref = { kind: 'point' as const, id: p.point };
            const done = status.determined.has(p.point);
            return (
              <li key={p.id}>
                <button
                  className={cn(
                    'grid w-full grid-cols-[1rem_2.5rem_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                    isSelected(selection, ref) && 'bg-accent text-accent-foreground hover:bg-accent',
                  )}
                  onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? toggle(ref) : select([ref]))}
                >
                  {done ? <CircleCheck className="size-3.5 text-ok" /> : <CircleDashed className="size-3.5 text-[var(--draw-free)]" />}
                  <span className="font-mono font-semibold">{p.label}</span>
                  <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    {p.setout === 'derive' ? <Crosshair className="size-3 text-primary" /> : <Ruler className="size-3" />}
                    {p.setout === 'derive' ? t('list.derive') : t('list.measure')}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{t('cad:coords', { x: fmt(p.x, 0), y: fmt(p.y, 0) })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

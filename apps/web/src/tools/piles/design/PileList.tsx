import { AlertTriangle } from 'lucide-react';
import type { PileSpec } from '@buildkit/pile-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { pileLabel, useResolved } from '../model/derived';
import { useEditor } from '../model/editor';
import { useProject } from '../model/store';
import { KIND_ICON } from './kinds';

function describe(p: PileSpec, specs: readonly PileSpec[]): string {
  const d = p.def;
  const L = (id: string) => pileLabel(specs, id);
  if (d.kind === 'fixed') return 'fixed';
  if (d.kind === 'between') return `${L(d.from)}→${L(d.to)} · ${d.by === 'ratio' ? `${fmt(d.t, 3)}` : `${fmt(d.distance, 0)} mm`}`;
  return `${L(d.from)} · ${fmt(d.distance, 0)} @ ${fmt(d.angle, 1)}°${d.ref ? ` from →${L(d.ref)}` : ''}`;
}

/** All piles with how each is defined; click to select. */
export function PileList() {
  const specs = useProject((s) => s.design.piles);
  const { piles, issues } = useResolved();
  const selected = useEditor((s) => s.selected);
  const select = useEditor((s) => s.select);
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle>Piles ({specs.length})</CardTitle>
      </CardHeader>
      <CardContent className="px-2">
        <ul className="divide-y">
          {specs.map((s) => {
            const p = piles.find((q) => q.id === s.id);
            const Icon = KIND_ICON[s.def.kind];
            return (
              <li key={s.id}>
                <button
                  className={cn(
                    'grid w-full grid-cols-[1rem_2.5rem_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                    s.id === selected && 'bg-accent text-accent-foreground hover:bg-accent',
                  )}
                  onClick={() => select(s.id)}
                >
                  <Icon className={cn('size-3.5', s.def.kind === 'fixed' ? 'text-muted-foreground' : 'text-primary')} />
                  <span className="font-mono font-semibold">{s.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{describe(s, specs)}</span>
                  {issues.has(s.id) ? (
                    <AlertTriangle className="size-4 text-destructive" />
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">{p ? `${fmt(p.x, 0)}, ${fmt(p.y, 0)}` : ''}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

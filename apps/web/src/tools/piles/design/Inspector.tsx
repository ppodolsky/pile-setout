import { CircleCheck, CircleDashed, Trash2 } from 'lucide-react';
import { constraintPoints } from '@buildkit/sketch';
import { NumberInput } from '@/components/number-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { plural } from '@/lib/format';
import { useDesign } from '../model/derived';
import { useEditor } from '../model/editor';
import { useProject } from '../model/store';
import { ConstraintRow } from './ConstraintRow';

/** Properties of the selection — pile(s) and their constraints — or of a selected constraint. */
export function Inspector() {
  const { piles, status } = useDesign();
  const constraints = useProject((s) => s.design.constraints);
  const { selected, constraint, select } = useEditor();
  const { updatePile, deletePiles, movePile } = useProject.getState();

  const sel = selected.map((id) => piles.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const picked = constraint ? constraints.find((c) => c.id === constraint) : undefined;

  if (!sel.length && picked)
    return (
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>Constraint</CardTitle>
        </CardHeader>
        <CardContent className="px-3">
          <ul>
            <ConstraintRow c={picked} piles={piles} conflict={status.conflicts.has(picked.id)} />
          </ul>
        </CardContent>
      </Card>
    );

  if (!sel.length)
    return (
      <Card className="gap-2 py-4">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2">
            Sketch
            {status.conflicts.size ? (
              <Badge variant="destructive">{status.conflicts.size} conflicting</Badge>
            ) : status.dof === 0 ? (
              <Badge className="bg-ok/15 text-ok">fully constrained</Badge>
            ) : (
              <Badge className="bg-[color-mix(in_oklch,var(--draw-free)_15%,transparent)] text-[var(--draw-free)]">{status.dof} free</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Click a pile to select it — Shift-click or drag a box to select several, then add constraints from the toolbar. Click a value on
            the drawing to edit that constraint. Blue piles can still move; black ones are fully constrained.
          </CardDescription>
        </CardHeader>
      </Card>
    );

  const ids = new Set(sel.map((p) => p.id));
  const related = constraints.filter((c) => {
    const pts = constraintPoints(c);
    return sel.length === 1 ? pts.includes(sel[0]!.id) : pts.every((p) => ids.has(p));
  });
  const one = sel.length === 1 ? sel[0]! : null;

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex flex-wrap items-center gap-2">
          {one ? (
            <>
              Pile <span className="font-mono">{one.label}</span>
            </>
          ) : (
            `${sel.length} piles`
          )}
          {one?.shared && <Badge variant="secondary">shared joint</Badge>}
          {one &&
            (status.determined.has(one.id) ? (
              <span className="flex items-center gap-1 text-xs font-normal text-ok">
                <CircleCheck className="size-3.5" /> fully constrained
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-normal text-[var(--draw-free)]">
                <CircleDashed className="size-3.5" /> can still move
              </span>
            ))}
        </CardTitle>
        {!one && <CardDescription>Picked in this order: {sel.map((p) => p.label).join(', ')}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        {one && (
          <>
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="pile-label">Label</Label>
                <Input
                  id="pile-label"
                  value={one.label}
                  className="font-mono"
                  onChange={(e) => updatePile(one.id, { label: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>X, mm</Label>
                <NumberInput value={one.x} onValue={(x) => x != null && movePile(one.id, { x, y: one.y }, { moveFix: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Y, mm</Label>
                <NumberInput value={one.y} onValue={(y) => y != null && movePile(one.id, { x: one.x, y }, { moveFix: true })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>In field work</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                className="w-full"
                value={one.setout}
                onValueChange={(v) => v && updatePile(one.id, { setout: v as 'measure' | 'derive' })}
              >
                <ToggleGroupItem value="measure" className="flex-1 text-xs">
                  Measure it
                </ToggleGroupItem>
                <ToggleGroupItem value="derive" className="flex-1 text-xs">
                  Set out from neighbours
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label>
            {related.length} {plural(related.length, 'constraint')}
            {one ? '' : ' between them'}
          </Label>
          {related.length ? (
            <ul className="space-y-1">
              {related.map((c) => (
                <ConstraintRow key={c.id} c={c} piles={piles} conflict={status.conflicts.has(c.id)} />
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">None yet — use the toolbar above the drawing.</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => {
            deletePiles(sel.map((p) => p.id));
            select([]);
          }}
        >
          <Trash2 /> Delete {one ? 'pile' : `${sel.length} piles`} with {one ? 'its' : 'their'} constraints
        </Button>
      </CardContent>
    </Card>
  );
}

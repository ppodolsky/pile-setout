import { CircleCheck, CircleDashed, LandPlot, Trash2 } from 'lucide-react';
import { constraintPoints } from '@buildkit/sketch';
import { ConstraintRow, useCadEditor, type CadOps } from '@/cad';
import { NumberInput } from '@/components/number-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { fmt, plural } from '@/lib/format';
import { useDesign } from '../model/derived';
import { useProject } from '../model/store';

/** Properties of the selection — pile, point or line, and their constraints — or of a constraint. */
export function Inspector({ ops }: { ops: CadOps }) {
  const { doc, piles, status, labelOf } = useDesign();
  const { selection, constraint, select } = useCadEditor();
  const { updatePile, addPileOn } = useProject.getState();
  const row = (c: (typeof doc.constraints)[number]) => (
    <ConstraintRow key={c.id} c={c} points={doc.points} labelOf={labelOf} ops={ops} conflict={status.conflicts.has(c.id)} />
  );

  const picked = constraint ? doc.constraints.find((c) => c.id === constraint) : undefined;
  if (!selection.length && picked)
    return (
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle>Constraint</CardTitle>
        </CardHeader>
        <CardContent className="px-3">
          <ul>{row(picked)}</ul>
        </CardContent>
      </Card>
    );

  if (!selection.length)
    return (
      <Card className="gap-2 py-4">
        <CardHeader className="px-4">
          <CardTitle className="flex items-center gap-2">
            Plan
            {status.conflicts.size ? (
              <Badge variant="destructive">{status.conflicts.size} conflicting</Badge>
            ) : status.dof === 0 ? (
              <Badge className="bg-ok/15 text-ok">fully constrained</Badge>
            ) : (
              <Badge className="bg-[color-mix(in_oklch,var(--draw-free)_15%,transparent)] text-[var(--draw-free)]">{status.dof} free</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Click a pile, point or line to select it — Shift-click or drag a box for more, then constrain from the toolbar. Drag to move:
            dimensions follow. Click a value on the drawing to edit it. Blue = can still move; black = fully constrained.
          </CardDescription>
        </CardHeader>
      </Card>
    );

  const pointIds = selection.filter((r) => r.kind === 'point').map((r) => r.id);
  const lineIds = selection.filter((r) => r.kind === 'line').map((r) => r.id);
  const touched = new Set([...pointIds, ...doc.lines.filter((l) => lineIds.includes(l.id)).flatMap((l) => [l.a, l.b])]);
  const related = doc.constraints.filter((c) => {
    const pts = constraintPoints(c);
    if (c.via?.some((v) => lineIds.includes(v))) return true;
    return selection.length === 1 && pointIds.length === 1 ? pts.includes(pointIds[0]!) : pts.every((p) => touched.has(p));
  });
  const onePoint = selection.length === 1 && pointIds.length === 1 ? doc.points.find((p) => p.id === pointIds[0]) : undefined;
  const oneLine = selection.length === 1 && lineIds.length === 1 ? doc.lines.find((l) => l.id === lineIds[0]) : undefined;
  const pile = onePoint ? piles.find((p) => p.point === onePoint.id) : undefined;
  const title = pile ? `Pile ${pile.label}` : onePoint ? 'Point' : oneLine ? 'Line' : `${selection.length} selected`;

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex flex-wrap items-center gap-2">
          {title}
          {pile?.shared && <Badge variant="secondary">shared joint</Badge>}
          {onePoint &&
            (status.determined.has(onePoint.id) ? (
              <span className="flex items-center gap-1 text-xs font-normal text-ok">
                <CircleCheck className="size-3.5" /> fully constrained
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-normal text-[var(--draw-free)]">
                <CircleDashed className="size-3.5" /> can still move
              </span>
            ))}
        </CardTitle>
        {selection.length > 1 && (
          <CardDescription>
            Picked in this order: {selection.map((r) => (r.kind === 'point' ? labelOf(r.id) || 'point' : 'line')).join(', ')}
          </CardDescription>
        )}
        {oneLine && (
          <CardDescription className="font-mono">
            {labelOf(oneLine.a) || 'point'} → {labelOf(oneLine.b) || 'point'} ·{' '}
            {fmt(
              Math.hypot(
                ...(['x', 'y'] as const).map(
                  (k) => doc.points.find((p) => p.id === oneLine.b)![k] - doc.points.find((p) => p.id === oneLine.a)![k],
                ),
              ),
              0,
            )}{' '}
            mm
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        {onePoint && (
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="pile-label">Label</Label>
              {pile ? (
                <Input
                  id="pile-label"
                  value={pile.label}
                  className="font-mono"
                  onChange={(e) => updatePile(pile.id, { label: e.target.value })}
                />
              ) : (
                <Input id="pile-label" value="—" disabled />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>X, mm</Label>
              <NumberInput value={onePoint.x} onValue={(x) => x != null && ops.setPointPosition(onePoint.id, { x, y: onePoint.y })} />
            </div>
            <div className="space-y-1.5">
              <Label>Y, mm</Label>
              <NumberInput value={onePoint.y} onValue={(y) => y != null && ops.setPointPosition(onePoint.id, { x: onePoint.x, y })} />
            </div>
          </div>
        )}
        {pile && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label>Head, mm</Label>
                <NumberInput value={pile.head} min={10} onValue={(head) => head != null && updatePile(pile.id, { head })} />
              </div>
              <div className="space-y-1.5">
                <Label>Diameter, mm</Label>
                <NumberInput
                  value={pile.diameter ?? null}
                  allowEmpty
                  min={1}
                  placeholder="—"
                  onValue={(d) => updatePile(pile.id, { diameter: d ?? undefined })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Depth, mm</Label>
                <NumberInput
                  value={pile.depth ?? null}
                  allowEmpty
                  min={1}
                  placeholder="—"
                  onValue={(d) => updatePile(pile.id, { depth: d ?? undefined })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>In field work</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                className="w-full"
                value={pile.setout}
                onValueChange={(v) => v && updatePile(pile.id, { setout: v as 'measure' | 'derive' })}
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
        {onePoint && !pile && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => addPileOn(onePoint.id)}>
            <LandPlot /> Put a pile on this point
          </Button>
        )}
        <div className="space-y-1.5">
          <Label>
            {related.length} {plural(related.length, 'constraint')}
            {selection.length > 1 ? ' between them' : ''}
          </Label>
          {related.length ? (
            <ul className="space-y-1">{related.map(row)}</ul>
          ) : (
            <p className="text-xs text-muted-foreground">None yet — use the toolbar above the drawing.</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => {
            const elements = piles.filter((p) => pointIds.includes(p.point)).map((p) => p.id);
            ops.remove({ points: pointIds, lines: lineIds, elements });
            select([]);
          }}
        >
          <Trash2 /> Delete {selection.length === 1 ? (pile ? 'pile' : onePoint ? 'point' : 'line') : `${selection.length} items`}
        </Button>
      </CardContent>
    </Card>
  );
}

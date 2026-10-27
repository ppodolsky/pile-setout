import { CircleCheck, CircleDashed, LandPlot, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { constraintPoints } from '@buildkit/sketch';
import { ConstraintRow, useCadEditor, type CadOps } from '@/cad';
import { Field, FieldRow } from '@/components/field';
import { NumberInput } from '@/components/number-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { fmt } from '@/lib/format';
import { useDesign } from '../model/derived';
import { useProject } from '../model/store';

/** Properties of the selection — pile, point or line, and their constraints — or of a constraint. */
export function Inspector({ ops }: { ops: CadOps }) {
  const { t } = useTranslation(['design', 'common']);
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
          <CardTitle>{t('inspector.constraint')}</CardTitle>
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
            {t('inspector.plan')}
            {status.conflicts.size ? (
              <Badge variant="destructive">{t('inspector.conflicting', { count: status.conflicts.size })}</Badge>
            ) : status.dof === 0 ? (
              <Badge className="bg-ok/15 text-ok">{t('inspector.fullyConstrained')}</Badge>
            ) : (
              <Badge className="bg-[color-mix(in_oklch,var(--draw-free)_15%,transparent)] text-[var(--draw-free)]">
                {t('inspector.free', { count: status.dof })}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{t('inspector.planHelp')}</CardDescription>
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
  const title = pile
    ? t('inspector.pile', { label: pile.label })
    : onePoint
      ? t('inspector.point')
      : oneLine
        ? t('inspector.line')
        : t('inspector.selected', { n: String(selection.length) });
  const pointName = (id: string) => labelOf(id) || t('inspector.pointItem');

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex flex-wrap items-center gap-2">
          {title}
          {pile?.shared && <Badge variant="secondary">{t('inspector.sharedJoint')}</Badge>}
          {onePoint &&
            (status.determined.has(onePoint.id) ? (
              <span className="flex items-center gap-1 text-xs font-normal text-ok">
                <CircleCheck className="size-3.5" /> {t('inspector.fullyConstrained')}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs font-normal text-[var(--draw-free)]">
                <CircleDashed className="size-3.5" /> {t('inspector.canStillMove')}
              </span>
            ))}
        </CardTitle>
        {selection.length > 1 && (
          <CardDescription>
            {t('inspector.pickedOrder', {
              list: selection.map((r) => (r.kind === 'point' ? pointName(r.id) : t('inspector.lineItem'))).join(', '),
            })}
          </CardDescription>
        )}
        {oneLine && (
          <CardDescription className="font-mono">
            {pointName(oneLine.a)} → {pointName(oneLine.b)} ·{' '}
            {fmt(
              Math.hypot(
                ...(['x', 'y'] as const).map(
                  (k) => doc.points.find((p) => p.id === oneLine.b)![k] - doc.points.find((p) => p.id === oneLine.a)![k],
                ),
              ),
              0,
            )}{' '}
            {t('common:mm')}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        {onePoint && (
          <FieldRow cols={3}>
            <Field label={t('inspector.label')} htmlFor="pile-label">
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
            </Field>
            <Field label={t('inspector.x')}>
              <NumberInput value={onePoint.x} onValue={(x) => x != null && ops.setPointPosition(onePoint.id, { x, y: onePoint.y })} />
            </Field>
            <Field label={t('inspector.y')}>
              <NumberInput value={onePoint.y} onValue={(y) => y != null && ops.setPointPosition(onePoint.id, { x: onePoint.x, y })} />
            </Field>
          </FieldRow>
        )}
        {pile && (
          <>
            <FieldRow cols={3}>
              <Field label={t('inspector.head')}>
                <NumberInput value={pile.head} min={10} onValue={(head) => head != null && updatePile(pile.id, { head })} />
              </Field>
              <Field label={t('inspector.diameter')}>
                <NumberInput
                  value={pile.diameter ?? null}
                  allowEmpty
                  min={1}
                  placeholder="—"
                  onValue={(d) => updatePile(pile.id, { diameter: d ?? undefined })}
                />
              </Field>
              <Field label={t('inspector.depth')}>
                <NumberInput
                  value={pile.depth ?? null}
                  allowEmpty
                  min={1}
                  placeholder="—"
                  onValue={(d) => updatePile(pile.id, { depth: d ?? undefined })}
                />
              </Field>
            </FieldRow>
            <div className="space-y-1.5">
              <Label>{t('inspector.inFieldWork')}</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                className="w-full"
                value={pile.setout}
                onValueChange={(v) => v && updatePile(pile.id, { setout: v as 'measure' | 'derive' })}
              >
                <ToggleGroupItem value="measure" className="flex-1 text-xs">
                  {t('inspector.measure')}
                </ToggleGroupItem>
                <ToggleGroupItem value="derive" className="flex-1 text-xs">
                  {t('inspector.derive')}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </>
        )}
        {onePoint && !pile && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => addPileOn(onePoint.id)}>
            <LandPlot /> {t('inspector.putPile')}
          </Button>
        )}
        <div className="space-y-1.5">
          <Label>
            {selection.length > 1
              ? t('inspector.constraintsBetween', { count: related.length })
              : t('inspector.constraints', { count: related.length })}
          </Label>
          {related.length ? (
            <ul className="space-y-1">{related.map(row)}</ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t('inspector.noConstraints')}</p>
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
          <Trash2 />{' '}
          {selection.length === 1
            ? pile
              ? t('inspector.deletePile')
              : onePoint
                ? t('inspector.deletePoint')
                : t('inspector.deleteLine')
            : t('inspector.deleteItems', { count: selection.length })}
        </Button>
      </CardContent>
    </Card>
  );
}

import { useMemo } from 'react';
import { applyRigid, bounds, expandBox, type Vec2 } from '@buildkit/geometry';
import { needsMove, type Pile } from '@buildkit/pile-field';
import { Badge, Grid, Label, ScreenArrow, Seg, toScreen, useView, Viewport } from '@/drawing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { fmt } from '@/lib/format';
import { SetoutLines } from '../drawing/constraints';
import { Containers, PileHead, PileMark } from '../drawing/layers';
import { useFieldwork, useOutlines } from '../model/derived';
import { useEditor } from '../model/editor';
import { useProject } from '../model/store';

/** The field as measured: actual stakes, arrows to their design positions, move order. */
function PlanLayers() {
  const v = useView();
  const { plan, piles, setout } = useFieldwork();
  const outlines = useOutlines();
  const head = useProject((s) => s.design.template.head);
  const { exaggeration, showLines } = useProject((s) => s.view);
  const tol = useProject((s) => s.fieldwork.tolerance);
  const hovered = useEditor((s) => s.hovered);
  const frame = plan.status === 'ok' ? plan.placement.transform : undefined;
  const map = (p: Vec2) => (frame ? applyRigid(frame, p) : p);
  const derived = new Set(plan.derived.map((p) => p.id));
  const corrections = plan.status === 'ok' ? new Map(plan.placement.corrections.map((c) => [c.id, c])) : null;
  const dim = (id: string) => (hovered && hovered !== id ? 0.25 : 1);

  return (
    <g>
      <Containers outlines={outlines} frame={frame} />
      {showLines && plan.status !== 'empty' && (
        <g opacity={hovered ? 0.15 : 0.55}>
          {plan.adjustment.residuals.map((r) => {
            const a = plan.positions.get(r.a);
            const b = plan.positions.get(r.b);
            if (!a || !b) return null;
            const d = Math.abs(r.observed - r.design);
            const c = d <= tol ? 'var(--ok)' : d <= 3 * tol ? 'var(--warn)' : 'var(--err)';
            return <Seg key={r.ref ?? r.a + r.b} a={a} b={b} stroke={c} strokeWidth={1.6} />;
          })}
        </g>
      )}
      <SetoutLines steps={setout} map={map} />
      {piles.map((p: Pile) => {
        const isDerived = derived.has(p.id);
        const design = map(p);
        const actual = plan.positions.get(p.id);
        const c = corrections?.get(p.id);
        const moving = c ? needsMove(c.offset, tol) : false;
        const D = toScreen(v, design);
        const A = actual ? toScreen(v, actual) : null;
        const tip = A ? { x: A.x + (D.x - A.x) * exaggeration, y: A.y + (D.y - A.y) * exaggeration } : null;
        const step = plan.status === 'ok' ? plan.steps.get(p.id) : undefined;
        return (
          <g key={p.id} opacity={dim(p.id)}>
            <PileHead pile={p} head={head} frame={frame} tone={isDerived ? 'param' : p.shared ? 'shared' : 'fixed'} />
            {A && !isDerived && <circle cx={A.x} cy={A.y} r={4.5} fill="var(--move)" />}
            {moving && A && tip && (
              <>
                <ScreenArrow from={A} to={tip} color="var(--move)" />
                <text
                  x={tip.x + (tip.x >= A.x ? 8 : -8)}
                  y={tip.y - 6}
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--move)"
                  textAnchor={tip.x >= A.x ? 'start' : 'end'}
                  className="font-mono"
                >
                  {fmt(c!.offset)}
                </text>
              </>
            )}
            <PileMark pile={p} frame={frame} color={isDerived ? 'var(--draw-param)' : 'var(--draw-ink)'} />
            {step != null && (
              <Badge at={design} dx={20} dy={-17} fill="var(--move)">
                {step}
              </Badge>
            )}
            {plan.status === 'ok' && !isDerived && !moving && (
              <Badge at={design} dx={20} dy={-17} r={7.5} fill="var(--ok)">
                ✓
              </Badge>
            )}
            {isDerived && (
              <Label at={design} dx={20} dy={-13} size={10} fill="var(--draw-param)" fontWeight={600}>
                set
              </Label>
            )}
          </g>
        );
      })}
    </g>
  );
}

export function PlanCard() {
  const { piles } = useFieldwork();
  const outlines = useOutlines();
  const view = useProject((s) => s.view);
  const setView = useProject.getState().setView;
  const content = useMemo(() => {
    const pts = [
      ...piles,
      ...outlines.flatMap((o) => [
        { x: o.x0, y: 0 },
        { x: o.x0 + o.length, y: o.width },
      ]),
    ];
    return expandBox(pts.length ? bounds(pts) : { minX: 0, minY: 0, maxX: 6000, maxY: 2400 }, 300);
  }, [piles, outlines]);
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 px-4">
        <CardTitle>Field plan</CardTitle>
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <label className="flex items-center gap-2">
            Arrows ×<span className="w-5 font-mono font-semibold text-foreground">{view.exaggeration}</span>
            <Slider
              className="w-28"
              min={1}
              max={50}
              step={1}
              value={[view.exaggeration]}
              onValueChange={([e]) => setView({ exaggeration: e! })}
            />
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={view.showLines} onCheckedChange={(showLines) => setView({ showLines })} /> measurement lines
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-3">
        <Viewport label="Field plan" content={content} className="h-[clamp(240px,42vw,520px)] border">
          <Grid />
          <PlanLayers />
        </Viewport>
        <p className="px-1 text-xs text-muted-foreground">
          Orange dot: stake now. Cross: design position. Arrows are drawn ×{view.exaggeration} longer so the direction is visible; numbers
          are the real offsets in mm. Teal dashed: parametric piles, set from their references.
        </p>
      </CardContent>
    </Card>
  );
}

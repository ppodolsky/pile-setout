import { ChevronDown } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { fractionWords, needsMove, type Correction, type Pile, type Plan, type SetoutStep } from '@buildkit/pile-field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { fmt, plural, sfmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MiniMap, MoveDiagram, StringDiagram, SwingDiagram } from '../drawing/cards';
import { pileLabel, useFieldwork } from '../model/derived';
import { useCadEditor } from '@/cad';
import { useProject } from '../model/store';
import { sideNames } from './helpers';

function Note({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'warn' | 'err'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-r-md border-l-[3px] px-3.5 py-2.5 text-sm',
        tone === 'info' && 'border-primary bg-primary/6',
        tone === 'ok' && 'border-ok bg-ok/8',
        tone === 'warn' && 'border-warn bg-warn/10',
        tone === 'err' && 'border-err bg-err/8',
      )}
    >
      {children}
    </div>
  );
}

function Summary({ plan, piles }: { plan: Plan; piles: readonly Pile[] }) {
  const L = (id: string) => pileLabel(piles, id);
  switch (plan.status) {
    case 'empty':
      return <Note>Enter tape measurements between the piles — the move plan appears here.</Note>;
    case 'under':
      return (
        <Note tone="warn">
          <b>Not enough measurements yet:</b> {plan.rank} of {plan.need} independent ones. Follow “Next to measure”.
        </Note>
      );
    case 'contradictory':
      return (
        <Note tone="err">
          <b>The readings contradict each other.</b> Check {L(plan.worst.a)}–{L(plan.worst.b)} first (looks about {sfmt(plan.worst.blunder)}{' '}
          mm off)
          {plan.alike.length > 1 ? `; ${plan.alike.length} readings are equally suspect with this few checks` : ''}. No move plan until they
          agree.
        </Note>
      );
    case 'pinconflict':
      return (
        <Note tone="warn">
          <b>Pinned piles disagree with the measurements</b> — check the readings involving them or unpin them.
        </Note>
      );
    case 'ok': {
      const n = plan.moves.length;
      if (!n)
        return (
          <Note tone="ok">
            <b>All measured piles are within tolerance.</b>
            {plan.derived.length ? ' Then set out the others from them, in the numbered order.' : ' No moves needed.'}
          </Note>
        );
      return (
        <Note>
          <b>
            {n} {plural(n, 'move')}
          </b>{' '}
          out of {plan.measured.length} measured piles — move each orange pile once, onto the cross, in the numbered order (largest first).
          {plan.derived.length
            ? ` Then set out the other ${plan.derived.length} ${plural(plan.derived.length, 'pile')} in their numbered order, from piles already in place.`
            : ''}
        </Note>
      );
    }
  }
}

function MoveCard({
  pile,
  c,
  step,
  piles,
  measured,
  tol,
}: {
  pile: Pile;
  c: Correction | undefined;
  step?: number;
  piles: readonly Pile[];
  measured: readonly Pile[];
  tol: number;
}) {
  const pinned = useProject((s) => s.fieldwork.pinned.includes(pile.id));
  const togglePin = useProject.getState().togglePin;
  const moving = c ? needsMove(c.offset, tol) : false;
  // sides are named after the measured piles at the field's edges (not a pile set out beyond them)
  const sides = sideNames(measured);
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-card p-2.5',
        moving ? 'border-move/45 shadow-[inset_0_3px_0_var(--move)]' : c ? 'shadow-[inset_0_3px_0_var(--ok)]' : '',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {step != null && <span className="grid size-6 place-items-center rounded-full bg-move text-xs font-bold text-white">{step}</span>}
        <span className="font-mono font-bold">{pile.label}</span>
        <MiniMap piles={piles} highlight={[pile.id]} tone={moving ? 'var(--move)' : 'var(--ok)'} className="ml-auto" />
        {c && (
          <span
            className={cn('w-full font-mono text-xs font-semibold', moving ? (c.offset <= 3 * tol ? 'text-warn' : 'text-err') : 'text-ok')}
          >
            {moving ? `${fmt(c.offset)} mm` : `✓ ${fmt(c.offset)} mm`}
          </span>
        )}
      </div>
      {c ? (
        <>
          <MoveDiagram dx={c.dx} dy={c.dy} offset={c.offset} tolerance={tol} moving={moving} />
          <div className="min-h-[2.6em] space-y-0.5 text-sm">
            {!moving && <div className="text-ok">within tolerance — leave it</div>}
            {moving && Math.abs(c.dx) >= 0.5 && (
              <div>
                <span className="inline-block w-5 font-bold text-move">{c.dx > 0 ? '→' : '←'}</span>
                <b className="font-mono">{fmt(Math.abs(c.dx))}</b> mm{' '}
                <span className="text-xs text-muted-foreground">toward {sides[c.dx > 0 ? 'x+' : 'x-']}</span>
              </div>
            )}
            {moving && Math.abs(c.dy) >= 0.5 && (
              <div>
                <span className="inline-block w-5 font-bold text-move">{c.dy > 0 ? '↑' : '↓'}</span>
                <b className="font-mono">{fmt(Math.abs(c.dy))}</b> mm{' '}
                <span className="text-xs text-muted-foreground">toward {sides[c.dy > 0 ? 'y+' : 'y-']}</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="py-6 text-center text-sm text-muted-foreground">no plan yet</div>
      )}
      {pile.shared && <div className="text-xs font-semibold text-primary">shared joint pile</div>}
      <button
        className={cn(
          'mt-auto rounded-full border px-2 py-0.5 text-xs',
          pinned ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:border-primary hover:text-primary',
        )}
        onClick={() => togglePin(pile.id)}
        title="Pinned piles are treated as exact references"
      >
        {pinned ? 'pinned' : 'pin'}
      </button>
    </div>
  );
}

function SetoutCard({ step, piles }: { step: SetoutStep; piles: readonly Pile[] }) {
  const { pile, instruction: ins, order } = step;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-card p-2.5 shadow-[inset_0_3px_0_var(--primary)]">
      <div className="flex items-center gap-2">
        <span
          className="grid size-6 place-items-center rounded-full border border-primary text-xs font-bold text-primary"
          title="Set-out order"
        >
          {order}
        </span>
        <span className="font-mono font-bold">{pile.label}</span>
        <MiniMap piles={piles} highlight={[pile.id]} className="ml-auto" />
        <span className="text-xs font-semibold text-primary">set</span>
      </div>
      {ins?.kind === 'string' && (
        <>
          <StringDiagram from={ins.from.label} to={ins.to.label} offset={ins.offset} t={ins.t} />
          <div className="text-sm">
            On the string{' '}
            <b className="font-mono">
              {ins.from.label} → {ins.to.label}
            </b>
            , <b className="font-mono">{fmt(ins.offset, 0)}</b> mm from {ins.from.label}
            <span className="text-xs text-muted-foreground">
              {' '}
              {fractionWords(ins.t)
                ? `(${fractionWords(ins.t)} of ${ins.from.label}–${ins.to.label})`
                : `(${fmt(ins.rest, 0)} mm from ${ins.to.label})`}
            </span>
          </div>
        </>
      )}
      {ins?.kind === 'swing' && (
        <>
          <SwingDiagram a={ins.a} b={ins.b} p={pile} da={ins.da} db={ins.db} labels={[ins.a.label, ins.b.label, pile.label]} />
          <div className="text-sm">
            Swing two tapes: <b className="font-mono">{fmt(ins.da, 0)}</b> mm from {ins.a.label} and{' '}
            <b className="font-mono">{fmt(ins.db, 0)}</b> mm from {ins.b.label}
            <span className="text-xs text-muted-foreground">
              {' '}
              — the crossing on the {ins.side} of {ins.a.label} → {ins.b.label}
            </span>
          </div>
        </>
      )}
      {!ins && (
        <div className="py-4 text-sm text-muted-foreground">
          No two piles in place to set it from yet — mark it “Measure it” in Design, or tie it to measured piles.
        </div>
      )}
      <div className="mt-auto text-xs font-semibold text-primary">after the moves, from piles already in place</div>
    </div>
  );
}

/** Cards in the field's own arrangement (rows × columns) when it fits, otherwise in move order. */
function CardsGrid({ plan, piles, setout }: { plan: Plan; piles: readonly Pile[]; setout: readonly SetoutStep[] }) {
  const tol = useProject((s) => s.fieldwork.tolerance);
  const hover = useCadEditor((s) => s.hover);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const xs = [...new Set(piles.map((p) => Math.round(p.x)))].sort((a, b) => a - b);
  const ys = [...new Set(piles.map((p) => Math.round(p.y)))].sort((a, b) => b - a); // top row first (Y up)
  const cells = new Set(piles.map((p) => `${Math.round(p.x)}:${Math.round(p.y)}`));
  const spatial =
    xs.length <= 14 &&
    ys.length <= 6 &&
    cells.size === piles.length &&
    xs.length * ys.length <= piles.length + 1 &&
    xs.length * 160 + (xs.length - 1) * 12 <= width;
  const corrections = plan.status === 'ok' ? new Map(plan.placement.corrections.map((c) => [c.id, c])) : new Map<string, Correction>();
  const setoutOf = new Map(setout.map((s) => [s.pile.id, s]));
  const steps = plan.status === 'ok' ? plan.steps : new Map<string, number>();

  return (
    <div ref={host} onMouseLeave={() => hover(null)}>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: spatial ? `repeat(${xs.length}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(165px, 1fr))' }}
      >
        {piles.map((p, i) => {
          const so = setoutOf.get(p.id);
          const order = so ? 60 + so.order : (steps.get(p.id) ?? 100 + i);
          const style = spatial ? { gridColumn: xs.indexOf(Math.round(p.x)) + 1, gridRow: ys.indexOf(Math.round(p.y)) + 1 } : { order };
          return (
            <div key={p.id} style={style} onMouseEnter={() => hover(p.id)} className="flex">
              <div className="w-full [&>div]:h-full">
                {so ? (
                  <SetoutCard step={so} piles={piles} />
                ) : (
                  <MoveCard pile={p} c={corrections.get(p.id)} step={steps.get(p.id)} piles={piles} measured={plan.measured} tol={tol} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Notes({ plan, piles }: { plan: Plan; piles: readonly Pile[] }) {
  const measurements = useProject((s) => s.fieldwork.measurements);
  const tol = useProject((s) => s.fieldwork.tolerance);
  if (plan.status !== 'ok') return null;
  const L = (id: string) => pileLabel(piles, id);
  const first = plan.moves[0];
  const affected = first ? measurements.filter((m) => m.a === first.id || m.b === first.id).map((m) => `${L(m.a)}–${L(m.b)}`) : [];
  const shift = Math.hypot(plan.placement.transform.t.x, plan.placement.transform.t.y);
  return (
    <div className="space-y-2.5">
      {first && affected.length > 0 && (
        <Note>
          <b>After moving {L(first.id)}</b>, re-measure <span className="font-mono">{affected.join(', ')}</span> and update the readings —
          the plan recalculates.
        </Note>
      )}
      {plan.moves.length > 0 &&
        (plan.moves.length === plan.lowerBound ? (
          <Note tone="ok">
            Minimality proven: the conflicting pairs need at least {plan.lowerBound} {plural(plan.lowerBound, 'move')} — no shorter plan
            exists.
          </Note>
        ) : plan.placement.proven ? (
          <Note tone="ok">Minimality proven by an exhaustive search over the field’s rotation.</Note>
        ) : (
          <Note>The optimality check did not finish: the plan may not be the shortest. Re-check the readings.</Note>
        ))}
      {shift > 3 * tol && (
        <Note>
          The plan is computed in the field’s own frame: a shift or turn of the whole field is invisible to pile-to-pile measurements and
          needs no correction. If the position relative to the string lines matters, pin two piles set exactly on the axes.
        </Note>
      )}
      {plan.extraMovesFromPins > 0 && (
        <Note tone="warn">
          Pinned piles add {plan.extraMovesFromPins} {plural(plan.extraMovesFromPins, 'move')} — make sure they really are exact.
        </Note>
      )}
    </div>
  );
}

function NumbersTable({ plan, piles }: { plan: Plan; piles: readonly Pile[] }) {
  if (plan.status !== 'ok') return null;
  const tol = useProject.getState().fieldwork.tolerance;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" /> Numbers
      </CollapsibleTrigger>
      <CollapsibleContent>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground uppercase">
            <tr>
              <th className="py-1 font-medium">Pile</th>
              <th className="font-medium">ΔX</th>
              <th className="font-medium">ΔY</th>
              <th className="font-medium">Offset</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {[...plan.placement.corrections]
              .sort((a, b) => b.offset - a.offset)
              .map((c) => (
                <tr key={c.id} className={cn('border-t', needsMove(c.offset, tol) ? 'text-move' : 'text-ok')}>
                  <td className="py-1.5 font-sans font-semibold text-foreground">{pileLabel(piles, c.id)}</td>
                  <td>{sfmt(c.dx)}</td>
                  <td>{sfmt(c.dy)}</td>
                  <td className="font-semibold">{fmt(c.offset)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function MovePlanCard() {
  const { plan, piles, setout } = useFieldwork();
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle>Move plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <Summary plan={plan} piles={piles} />
        {plan.status === 'ok' && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-move" /> stake now
            </span>
            <span>+ design position</span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full border border-dashed border-ok bg-ok/10" /> tolerance
            </span>
            <span>Diagrams use the plan’s orientation (Y up).</span>
          </div>
        )}
        <CardsGrid plan={plan} piles={piles} setout={setout} />
        <Notes plan={plan} piles={piles} />
        <NumbersTable plan={plan} piles={piles} />
      </CardContent>
    </Card>
  );
}

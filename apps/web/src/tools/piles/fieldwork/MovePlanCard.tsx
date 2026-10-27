import { ArrowRight, Check, ChevronDown } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { awaitsRemeasure, fractionWords, needsMove, type Correction, type Pile, type Plan, type SetoutStep } from '@buildkit/pile-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { fmt, sfmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MiniMap, MoveDiagram, StringDiagram, SwingDiagram } from '../drawing/cards';
import { pileLabel, useFieldwork } from '../model/derived';
import { useCadEditor } from '@/cad';
import { useProject } from '../model/store';
import { focusReading, sideNames } from './helpers';

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

const bold = { b: <b /> };
const mono = { b: <b className="font-mono" /> };

/** `fractionWords` (English words from the domain package) → its key under `movePlan.setout.fractions`. */
const FRACTION_KEYS = {
  half: 'half',
  'a quarter': 'quarter',
  'three quarters': 'threeQuarters',
  'a third': 'third',
  'two thirds': 'twoThirds',
} as const;

function fractionKey(t: number): (typeof FRACTION_KEYS)[keyof typeof FRACTION_KEYS] | null {
  const words = fractionWords(t);
  return words && words in FRACTION_KEYS ? FRACTION_KEYS[words as keyof typeof FRACTION_KEYS] : null;
}

function Summary({ plan, piles }: { plan: Plan; piles: readonly Pile[] }) {
  const { t } = useTranslation('fieldwork');
  const L = (id: string) => pileLabel(piles, id);
  switch (plan.status) {
    case 'empty':
      return <Note>{t('movePlan.summary.empty')}</Note>;
    case 'under':
      return (
        <Note tone="warn">
          <Trans t={t} i18nKey="movePlan.summary.under" values={{ rank: plan.rank, need: plan.need }} components={bold} />
        </Note>
      );
    case 'contradictory':
      return (
        <Note tone="err">
          <Trans
            t={t}
            i18nKey="movePlan.summary.contradictory"
            values={{
              a: L(plan.worst.a),
              b: L(plan.worst.b),
              error: sfmt(plan.worst.blunder),
              alike: plan.alike.length > 1 ? t('movePlan.summary.alike', { count: plan.alike.length }) : '',
            }}
            components={bold}
          />
        </Note>
      );
    case 'pinconflict':
      return (
        <Note tone="warn">
          <Trans t={t} i18nKey="movePlan.summary.pinConflict" components={bold} />
        </Note>
      );
    case 'ok': {
      const n = plan.moves.length;
      if (!n)
        return (
          <Note tone="ok">
            <b>{t('movePlan.summary.allWithin')}</b>
            {plan.derived.length ? t('movePlan.summary.thenOthers') : t('movePlan.summary.noMoves')}
          </Note>
        );
      return (
        <Note>
          <Trans t={t} i18nKey="movePlan.summary.moves" count={n} values={{ measured: plan.measured.length }} components={bold} />
          {plan.derived.length ? t('movePlan.summary.thenDerived', { count: plan.derived.length }) : ''}
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
  const { t } = useTranslation(['fieldwork', 'common']);
  const pinned = useProject((s) => s.fieldwork.pinned.includes(pile.id));
  // stays "moved" (with its re-measure button) until its readings are taken again
  const moved = useProject((s) => s.fieldwork.moved?.includes(pile.id) ?? false);
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
            {moving ? '' : '✓ '}
            {fmt(c.offset)} {t('common:mm')}
          </span>
        )}
      </div>
      {c ? (
        <>
          <MoveDiagram dx={c.dx} dy={c.dy} offset={c.offset} tolerance={tol} moving={moving} />
          <div className="min-h-[2.6em] space-y-0.5 text-sm">
            {!moving && <div className="text-ok">{t('movePlan.move.within')}</div>}
            {moving && Math.abs(c.dx) >= 0.5 && (
              <div>
                <span className="inline-block w-5 font-bold text-move">{c.dx > 0 ? '→' : '←'}</span>
                <b className="font-mono">{fmt(Math.abs(c.dx))}</b> {t('common:mm')}{' '}
                <span className="text-xs text-muted-foreground">{t('movePlan.move.toward', { side: sides[c.dx > 0 ? 'x+' : 'x-'] })}</span>
              </div>
            )}
            {moving && Math.abs(c.dy) >= 0.5 && (
              <div>
                <span className="inline-block w-5 font-bold text-move">{c.dy > 0 ? '↑' : '↓'}</span>
                <b className="font-mono">{fmt(Math.abs(c.dy))}</b> {t('common:mm')}{' '}
                <span className="text-xs text-muted-foreground">{t('movePlan.move.toward', { side: sides[c.dy > 0 ? 'y+' : 'y-'] })}</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="py-6 text-center text-sm text-muted-foreground">{t('movePlan.move.noPlan')}</div>
      )}
      {pile.shared && <div className="text-xs font-semibold text-primary">{t('movePlan.move.shared')}</div>}
      {(moving || moved) && <MovedActions pileId={pile.id} />}
      <button
        className={cn(
          'mt-auto rounded-full border px-2 py-0.5 text-xs',
          pinned ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:border-primary hover:text-primary',
        )}
        onClick={() => togglePin(pile.id)}
        title={t('movePlan.move.pinTitle')}
      >
        {pinned ? t('movePlan.move.pinned') : t('movePlan.move.pin')}
      </button>
    </div>
  );
}

/**
 * After moving a pile on site: "I moved it" turns its readings into "to re-measure"; then a button
 * jumps straight to them (switching to the Measure panel on phones).
 */
function MovedActions({ pileId }: { pileId: string }) {
  const { t } = useTranslation('fieldwork');
  const moved = useProject((s) => s.fieldwork.moved?.includes(pileId) ?? false);
  const measurements = useProject((s) => s.fieldwork.measurements);
  const waiting = measurements.filter((m) => (m.a === pileId || m.b === pileId) && awaitsRemeasure(m));
  if (!moved)
    return (
      <Button size="sm" className="w-full" onClick={() => useProject.getState().markMoved(pileId)}>
        <Check /> {t('movePlan.move.movedIt')}
      </Button>
    );
  return (
    <Button
      size="sm"
      variant="outline"
      className="w-full border-warn/60 text-warn"
      onClick={() => waiting[0] && focusReading(waiting[0].id)}
      disabled={!waiting.length}
    >
      {t('movePlan.move.remeasure', { count: waiting.length })} <ArrowRight />
    </Button>
  );
}

function SetoutCard({ step, piles }: { step: SetoutStep; piles: readonly Pile[] }) {
  const { t } = useTranslation('fieldwork');
  const { pile, instruction: ins, order } = step;
  const fraction = ins?.kind === 'string' ? fractionKey(ins.t) : null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-card p-2.5 shadow-[inset_0_3px_0_var(--primary)]">
      <div className="flex items-center gap-2">
        <span
          className="grid size-6 place-items-center rounded-full border border-primary text-xs font-bold text-primary"
          title={t('movePlan.setout.orderTitle')}
        >
          {order}
        </span>
        <span className="font-mono font-bold">{pile.label}</span>
        <MiniMap piles={piles} highlight={[pile.id]} className="ml-auto" />
        <span className="text-xs font-semibold text-primary">{t('setTag')}</span>
      </div>
      {ins?.kind === 'string' && (
        <>
          <StringDiagram from={ins.from.label} to={ins.to.label} offset={ins.offset} t={ins.t} />
          <div className="text-sm">
            <Trans
              t={t}
              i18nKey="movePlan.setout.onString"
              values={{ from: ins.from.label, to: ins.to.label, offset: fmt(ins.offset, 0) }}
              components={mono}
            />
            <span className="text-xs text-muted-foreground">
              {' '}
              {fraction
                ? t('movePlan.setout.fraction', {
                    fraction: t(`movePlan.setout.fractions.${fraction}`),
                    from: ins.from.label,
                    to: ins.to.label,
                  })
                : t('movePlan.setout.rest', { rest: fmt(ins.rest, 0), to: ins.to.label })}
            </span>
          </div>
        </>
      )}
      {ins?.kind === 'swing' && (
        <>
          <SwingDiagram a={ins.a} b={ins.b} p={pile} da={ins.da} db={ins.db} labels={[ins.a.label, ins.b.label, pile.label]} />
          <div className="text-sm">
            <Trans
              t={t}
              i18nKey="movePlan.setout.swing"
              values={{ da: fmt(ins.da, 0), a: ins.a.label, db: fmt(ins.db, 0), b: ins.b.label }}
              components={mono}
            />
            <span className="text-xs text-muted-foreground">
              {' '}
              {t(`movePlan.setout.crossing.${ins.side}`, { a: ins.a.label, b: ins.b.label })}
            </span>
          </div>
        </>
      )}
      {!ins && <div className="py-4 text-sm text-muted-foreground">{t('movePlan.setout.noRefs')}</div>}
      <div className="mt-auto text-xs font-semibold text-primary">{t('movePlan.setout.after')}</div>
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
  const { t } = useTranslation('fieldwork');
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
          <Trans
            t={t}
            i18nKey="movePlan.notes.afterMoving"
            values={{ pile: L(first.id), pairs: affected.join(', ') }}
            components={{ b: <b />, mono: <span className="font-mono" /> }}
          />
        </Note>
      )}
      {plan.moves.length > 0 &&
        (plan.moves.length === plan.lowerBound ? (
          <Note tone="ok">{t('movePlan.notes.lowerBound', { count: plan.lowerBound })}</Note>
        ) : plan.placement.proven ? (
          <Note tone="ok">{t('movePlan.notes.proven')}</Note>
        ) : (
          <Note>{t('movePlan.notes.notFinished')}</Note>
        ))}
      {shift > 3 * tol && <Note>{t('movePlan.notes.ownFrame')}</Note>}
      {plan.extraMovesFromPins > 0 && <Note tone="warn">{t('movePlan.notes.pinsAdd', { count: plan.extraMovesFromPins })}</Note>}
    </div>
  );
}

function NumbersTable({ plan, piles }: { plan: Plan; piles: readonly Pile[] }) {
  const { t } = useTranslation('fieldwork');
  if (plan.status !== 'ok') return null;
  const tol = useProject.getState().fieldwork.tolerance;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground">
        <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" /> {t('movePlan.numbers.title')}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground uppercase">
            <tr>
              <th className="py-1 font-medium">{t('movePlan.numbers.pile')}</th>
              <th className="font-medium">ΔX</th>
              <th className="font-medium">ΔY</th>
              <th className="font-medium">{t('movePlan.numbers.offset')}</th>
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
  const { t } = useTranslation('fieldwork');
  const { plan, piles, setout } = useFieldwork();
  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle>{t('movePlan.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <Summary plan={plan} piles={piles} />
        {plan.status === 'ok' && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-move" /> {t('movePlan.legend.stakeNow')}
            </span>
            <span>{t('movePlan.legend.design')}</span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full border border-dashed border-ok bg-ok/10" /> {t('movePlan.legend.tolerance')}
            </span>
            <span>{t('movePlan.legend.orientation')}</span>
          </div>
        )}
        <CardsGrid plan={plan} piles={piles} setout={setout} />
        <Notes plan={plan} piles={piles} />
        <NumbersTable plan={plan} piles={piles} />
      </CardContent>
    </Card>
  );
}

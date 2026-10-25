import { distance } from '@buildkit/geometry';
import { awaitsRemeasure } from '@buildkit/pile-field';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fmt, plural, sfmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MiniMap } from '../drawing/cards';
import { pileLabel, useFieldwork } from '../model/derived';
import { useProject } from '../model/store';
import { focusReading, pairKind } from './helpers';

/** "What to measure next": one pair at a time, why, and progress. */
export function NextCard() {
  const { piles, plan, next } = useFieldwork();
  const measurements = useProject((s) => s.fieldwork.measurements);
  const waiting = measurements.filter(awaitsRemeasure);
  if (waiting.length) return <AfterMoveCard piles={piles} waiting={waiting} />;
  if (!next) return null;
  const derived = plan.derived.length;
  const tone = next.kind === 'remeasure' ? 'err' : next.kind === 'done' ? 'ok' : 'primary';
  const progress = next.kind === 'remeasure' ? null : next.progress;

  const action = () => {
    if (next.kind === 'done') return;
    if (next.measurementId) return focusReading(next.measurementId);
    focusReading(useProject.getState().addMeasurement(next.a, next.b));
  };

  return (
    <Card
      className={cn(
        'gap-3 border p-3.5',
        tone === 'err' && 'border-err/50 bg-err/5',
        tone === 'ok' && 'border-ok/40 bg-ok/5',
        tone === 'primary' && 'border-primary/40 bg-primary/5',
      )}
    >
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span
          className={cn('font-bold tracking-wider uppercase', tone === 'err' ? 'text-err' : tone === 'ok' ? 'text-ok' : 'text-primary')}
        >
          {next.kind === 'remeasure' ? 'Re-measure' : 'Next to measure'}
        </span>
        {progress &&
          (progress.rank < progress.need ? (
            <span className="text-muted-foreground">
              Field fixed: <b className="text-foreground">{progress.rank}</b> / {progress.need}
            </span>
          ) : (
            <span className="text-ok">
              Field fixed ✓ · {progress.checks} {plural(progress.checks, 'check')}
            </span>
          ))}
      </div>
      {progress && (
        <div className="h-1 overflow-hidden rounded bg-border">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${Math.min(100, (100 * progress.rank) / Math.max(1, progress.need))}%` }}
          />
        </div>
      )}
      {next.kind !== 'done' ? (
        <div className="flex items-center gap-3">
          <MiniMap piles={piles} highlight={[next.a, next.b]} line={[next.a, next.b]} width={110} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-lg font-semibold whitespace-nowrap">
              {pileLabel(piles, next.a)} ↔ {pileLabel(piles, next.b)}
            </div>
            <div className="text-xs text-muted-foreground">{pairKind(piles, next.a, next.b)}</div>
            <div className="text-xs text-muted-foreground">
              design ≈{' '}
              {fmt(
                distance(
                  piles.find((p) => p.id === next.a)!,
                  piles.find((p) => p.id === next.b)!,
                ),
                0,
              )}{' '}
              mm
            </div>
          </div>
          <Button onClick={action} variant={next.kind === 'remeasure' ? 'destructive' : 'default'}>
            {next.measurementId ? 'Go to row' : 'Add'}
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {next.kind === 'remeasure'
          ? next.alike > 1
            ? `The readings don't agree — about ${sfmt(next.error)} mm off somewhere. With this few checks ${next.alike} readings are equally suspect; start with this one, then the ones tied to it. More measurements pin it down.`
            : `This reading doesn't fit the others — it looks about ${sfmt(next.error)} mm off, probably misread or mistyped. Measure it again before moving any pile.`
          : next.kind === 'fix'
            ? `Adds new information about the field. ${next.progress.need - next.progress.rank} more independent ${plural(next.progress.need - next.progress.rank, 'measurement')} before the move plan can be computed.`
            : next.kind === 'check'
              ? `The field is fixed. Optional check — extra readings let the app catch a misread tape (recommended ${next.progress.recommendedDone} / ${next.progress.recommendedTotal}).`
              : `All ${next.progress.recommendedTotal} recommended measurements are in. Follow the move plan; after moving a pile, re-measure its pairs.${derived ? ' Then set the parametric piles from their corrected references.' : ''}`}
      </p>
    </Card>
  );
}

/** After piles were moved on site: their readings come first, one at a time. */
function AfterMoveCard({
  piles,
  waiting,
}: {
  piles: ReturnType<typeof useFieldwork>['piles'];
  waiting: ReturnType<typeof useProject.getState>['fieldwork']['measurements'];
}) {
  const m = waiting[0]!;
  const a = piles.find((p) => p.id === m.a);
  const b = piles.find((p) => p.id === m.b);
  return (
    <Card className="gap-3 border border-warn/50 bg-warn/8 p-3.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-bold tracking-wider text-warn uppercase">Re-measure after moving</span>
        <span className="text-muted-foreground">
          {waiting.length} {plural(waiting.length, 'reading')} left
        </span>
      </div>
      <div className="flex items-center gap-3">
        <MiniMap piles={piles} highlight={[m.a, m.b]} line={[m.a, m.b]} tone="var(--warn)" width={110} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-lg font-semibold whitespace-nowrap">
            {pileLabel(piles, m.a)} ↔ {pileLabel(piles, m.b)}
          </div>
          <div className="text-xs text-muted-foreground">was {fmt(m.previous!)} mm</div>
          {a && b && <div className="text-xs text-muted-foreground">design ≈ {fmt(distance(a, b), 0)} mm</div>}
        </div>
        <Button onClick={() => focusReading(m.id)}>Go to row</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Measure it again and type the new reading — the plan updates and shows whether the pile is in place now.
      </p>
    </Card>
  );
}

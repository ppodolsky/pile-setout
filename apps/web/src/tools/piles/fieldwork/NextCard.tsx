import { useTranslation } from 'react-i18next';
import { distance } from '@buildkit/geometry';
import { awaitsRemeasure } from '@buildkit/pile-field';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fmt, sfmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MiniMap } from '../drawing/cards';
import { pileLabel, useFieldwork } from '../model/derived';
import { useProject } from '../model/store';
import { focusReading, pairKind } from './helpers';

/** "What to measure next": one pair at a time, why, and progress. */
export function NextCard() {
  const { t } = useTranslation('fieldwork');
  const { piles, plan, next } = useFieldwork();
  const measurements = useProject((s) => s.fieldwork.measurements);
  const waiting = measurements.filter(awaitsRemeasure);
  if (waiting.length) return <AfterMoveCard piles={piles} waiting={waiting} />;
  if (!next) return null;
  const derived = plan.derived.length;
  const tone = next.kind === 'remeasure' ? 'err' : next.kind === 'done' ? 'ok' : 'primary';
  const progress = next.kind === 'remeasure' ? null : next.progress;
  const kind = next.kind === 'done' ? null : pairKind(piles, next.a, next.b);

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
          {next.kind === 'remeasure' ? t('next.remeasure') : t('next.title')}
        </span>
        {progress &&
          (progress.rank < progress.need ? (
            <span className="text-muted-foreground">
              {t('next.fieldFixed')} <b className="text-foreground">{progress.rank}</b> / {progress.need}
            </span>
          ) : (
            <span className="text-ok">{t('next.fieldFixedChecks', { count: progress.checks })}</span>
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
            <div className="text-xs text-muted-foreground">{kind && t(`pair.${kind}`)}</div>
            <div className="text-xs text-muted-foreground">
              {t('designApprox', {
                value: fmt(
                  distance(
                    piles.find((p) => p.id === next.a)!,
                    piles.find((p) => p.id === next.b)!,
                  ),
                  0,
                ),
              })}
            </div>
          </div>
          <Button onClick={action} variant={next.kind === 'remeasure' ? 'destructive' : 'default'}>
            {next.measurementId ? t('next.goToRow') : t('next.add')}
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {next.kind === 'remeasure'
          ? next.alike > 1
            ? t('next.suspectSeveral', { error: sfmt(next.error), count: next.alike })
            : t('next.suspectOne', { error: sfmt(next.error) })
          : next.kind === 'fix'
            ? t('next.fix', { count: next.progress.need - next.progress.rank })
            : next.kind === 'check'
              ? t('next.check', { done: fmt(next.progress.recommendedDone, 0), total: fmt(next.progress.recommendedTotal, 0) })
              : t('next.done', { total: fmt(next.progress.recommendedTotal, 0) }) + (derived ? t('next.doneDerived') : '')}
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
  const { t } = useTranslation('fieldwork');
  const m = waiting[0]!;
  const a = piles.find((p) => p.id === m.a);
  const b = piles.find((p) => p.id === m.b);
  return (
    <Card className="gap-3 border border-warn/50 bg-warn/8 p-3.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-bold tracking-wider text-warn uppercase">{t('afterMove.title')}</span>
        <span className="text-muted-foreground">{t('afterMove.left', { count: waiting.length })}</span>
      </div>
      <div className="flex items-center gap-3">
        <MiniMap piles={piles} highlight={[m.a, m.b]} line={[m.a, m.b]} tone="var(--warn)" width={110} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-lg font-semibold whitespace-nowrap">
            {pileLabel(piles, m.a)} ↔ {pileLabel(piles, m.b)}
          </div>
          <div className="text-xs text-muted-foreground">{t('afterMove.was', { value: fmt(m.previous!) })}</div>
          {a && b && <div className="text-xs text-muted-foreground">{t('designApprox', { value: fmt(distance(a, b), 0) })}</div>}
        </div>
        <Button onClick={() => focusReading(m.id)}>{t('next.goToRow')}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('afterMove.hint')}</p>
    </Card>
  );
}

import { Plus, X } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { distance } from '@buildkit/geometry';
import { awaitsRemeasure, correctedLength, knownCorrection, type Measurement, type Pile } from '@buildkit/pile-field';
import { NativeSelect } from '@/components/native-select';
import { NumberInput } from '@/components/number-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt, sfmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useFieldwork } from '../model/derived';
import { useProject } from '../model/store';
import { MiniMap } from '../drawing/cards';
import { focusReading } from './helpers';
import { useFieldworkUi } from './ui';

function deltaClass(d: number, tol: number) {
  return Math.abs(d) <= tol ? 'text-ok' : Math.abs(d) <= 3 * tol ? 'text-warn' : 'text-err';
}

/** Correction at one end: fixed extra length when the tape is hooked behind that pile. Empty = 0. */
function CorrectionField({ m, end, pile }: { m: Measurement; end: 'A' | 'B'; pile: Pile | undefined }) {
  const { t } = useTranslation('fieldwork');
  const key = end === 'A' ? 'correctionA' : 'correctionB';
  const value = m[key];
  const measurements = useProject((s) => s.fieldwork.measurements);
  const suggestion = value == null && pile ? knownCorrection(measurements, pile.id, m.id) : null;
  const set = (v: number | null) => useProject.getState().updateMeasurement(m.id, { [key]: v });
  return (
    <span className="inline-flex items-center gap-1">
      {t('measurements.correction.at')} <span className="font-mono font-semibold text-foreground">{pile?.label ?? '?'}</span>
      <NumberInput
        className="h-7 w-16 px-2 text-xs"
        value={value}
        allowEmpty
        min={0}
        digits={1}
        placeholder="0"
        aria-label={t('measurements.correction.label', { pile: pile?.label ?? t('measurements.correction.end') })}
        onValue={set}
      />
      {suggestion != null && (
        <button
          className="rounded border border-dashed px-1.5 py-0.5 font-mono hover:border-primary hover:text-primary"
          onClick={() => set(suggestion)}
          title={t('measurements.correction.sameAs', { pile: pile?.label ?? '?' })}
        >
          {t('measurements.correction.use', { value: fmt(suggestion) })}
        </button>
      )}
    </span>
  );
}

function Row({ m, piles, unused, tol }: { m: Measurement; piles: readonly Pile[]; unused: boolean; tol: number }) {
  const { t } = useTranslation('fieldwork');
  const { updateMeasurement, deleteMeasurement } = useProject.getState();
  const a = piles.find((p) => p.id === m.a);
  const b = piles.find((p) => p.id === m.b);
  const len = correctedLength(m);
  const delta = a && b && len != null ? len - distance(a, b) : null;
  const options = piles.map((p) => (
    <option key={p.id} value={p.id}>
      {p.label}
    </option>
  ));
  const stale = awaitsRemeasure(m);
  const setFocused = useFieldworkUi((s) => s.setFocused);
  return (
    <li
      className={cn(
        'border-b py-2.5 first:pt-0 last:border-0',
        unused && 'opacity-45',
        stale && '-mx-2 rounded-md border-warn/50 bg-warn/8 px-2',
      )}
      title={unused ? t('measurements.unused') : undefined}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_3.2rem_1.5rem] items-center gap-1.5">
        <NativeSelect value={m.a} onChange={(e) => updateMeasurement(m.id, { a: e.target.value })} aria-label={t('measurements.firstPile')}>
          {options}
        </NativeSelect>
        <NativeSelect
          value={m.b}
          onChange={(e) => updateMeasurement(m.id, { b: e.target.value })}
          aria-label={t('measurements.secondPile')}
        >
          {options}
        </NativeSelect>
        <NumberInput
          data-reading={m.id}
          value={m.reading}
          allowEmpty
          min={0}
          digits={1}
          placeholder={
            stale ? t('measurements.wasPlaceholder', { value: String(Math.round(m.previous!)) }) : t('measurements.readingPlaceholder')
          }
          aria-label={t('measurements.readingLabel')}
          onFocus={() => setFocused(m.id)}
          onValue={(reading) => updateMeasurement(m.id, { reading })}
        />
        <span className={cn('text-right font-mono text-xs', delta != null && deltaClass(delta, tol))}>
          {delta != null ? sfmt(delta) : ''}
        </span>
        <button
          className="justify-self-center text-muted-foreground hover:text-destructive"
          aria-label={t('measurements.delete')}
          onClick={() => deleteMeasurement(m.id)}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <MiniMap piles={piles} highlight={[m.a, m.b]} line={[m.a, m.b]} width={52} className="shrink-0" />
        {stale && <span className="font-semibold text-warn">{t('measurements.remeasure')}</span>}
        <span className="hidden sm:inline">{t('measurements.corrections')}</span>
        <CorrectionField m={m} end="A" pile={a} />
        <CorrectionField m={m} end="B" pile={b} />
        {m.correctionA || m.correctionB ? <span className="font-mono">= {len != null ? fmt(len) : '—'}</span> : null}
      </div>
    </li>
  );
}

/** Tape measurements between piles, with hook corrections. */
export function MeasurementsCard() {
  const { t } = useTranslation('fieldwork');
  const { piles, plan, next } = useFieldwork();
  const measurements = useProject((s) => s.fieldwork.measurements);
  const tol = useProject((s) => s.fieldwork.tolerance);
  const derived = new Set(plan.derived.map((p) => p.id));
  const add = () => {
    const pair =
      next && (next.kind === 'fix' || next.kind === 'check') && !next.measurementId
        ? next
        : { a: plan.measured[0]?.id ?? piles[0]!.id, b: plan.measured[1]?.id ?? piles[1]!.id };
    focusReading(useProject.getState().addMeasurement(pair.a, pair.b));
  };
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle>{t('measurements.title')}</CardTitle>
        <CardDescription>{t('measurements.description')}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        {measurements.length ? (
          <ul>
            {measurements.map((m) => (
              <Row key={m.id} m={m} piles={piles} tol={tol} unused={derived.has(m.a) || derived.has(m.b)} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('measurements.empty')}</p>
        )}
        <Button variant="outline" className="mt-3 w-full border-dashed" onClick={add} disabled={piles.length < 2}>
          <Plus /> {t('measurements.add')}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          <Trans t={t} i18nKey="measurements.help" components={{ b: <b className="font-medium text-foreground" /> }} />
        </p>
      </CardContent>
    </Card>
  );
}

import { Plus, X } from 'lucide-react';
import { distance } from '@buildkit/geometry';
import { correctedLength, knownCorrection, type Measurement, type Pile } from '@buildkit/pile-field';
import { NativeSelect } from '@/components/native-select';
import { NumberInput } from '@/components/number-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fmt, sfmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useFieldwork } from '../model/derived';
import { useProject } from '../model/store';
import { focusReading } from './helpers';

function deltaClass(d: number, tol: number) {
  return Math.abs(d) <= tol ? 'text-ok' : Math.abs(d) <= 3 * tol ? 'text-warn' : 'text-err';
}

/** Correction at one end: fixed extra length when the tape is hooked behind that pile. Empty = 0. */
function CorrectionField({ m, end, pile }: { m: Measurement; end: 'A' | 'B'; pile: Pile | undefined }) {
  const key = end === 'A' ? 'correctionA' : 'correctionB';
  const value = m[key];
  const measurements = useProject((s) => s.fieldwork.measurements);
  const suggestion = value == null && pile ? knownCorrection(measurements, pile.id, m.id) : null;
  const set = (v: number | null) => useProject.getState().updateMeasurement(m.id, { [key]: v });
  return (
    <span className="inline-flex items-center gap-1">
      − at <span className="font-mono font-semibold text-foreground">{pile?.label ?? '?'}</span>
      <NumberInput
        className="h-7 w-16 px-2 text-xs"
        value={value}
        allowEmpty
        min={0}
        digits={1}
        placeholder="0"
        aria-label={`Correction at ${pile?.label ?? 'end'}, mm`}
        onValue={set}
      />
      {suggestion != null && (
        <button
          className="rounded border border-dashed px-1.5 py-0.5 font-mono hover:border-primary hover:text-primary"
          onClick={() => set(suggestion)}
          title={`Same as other readings from ${pile?.label}`}
        >
          use {fmt(suggestion)}
        </button>
      )}
    </span>
  );
}

function Row({ m, piles, unused, tol }: { m: Measurement; piles: readonly Pile[]; unused: boolean; tol: number }) {
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
  return (
    <li
      className={cn('border-b py-2.5 first:pt-0 last:border-0', unused && 'opacity-45')}
      title={unused ? 'Not used: this pile is set out from its references (switch parametric piles to “Measure” to use it)' : undefined}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_3.2rem_1.5rem] items-center gap-1.5">
        <NativeSelect value={m.a} onChange={(e) => updateMeasurement(m.id, { a: e.target.value })} aria-label="First pile">
          {options}
        </NativeSelect>
        <NativeSelect value={m.b} onChange={(e) => updateMeasurement(m.id, { b: e.target.value })} aria-label="Second pile">
          {options}
        </NativeSelect>
        <NumberInput
          data-reading={m.id}
          value={m.reading}
          allowEmpty
          min={0}
          digits={1}
          placeholder="reading"
          aria-label="Tape reading, mm"
          onValue={(reading) => updateMeasurement(m.id, { reading })}
        />
        <span className={cn('text-right font-mono text-xs', delta != null && deltaClass(delta, tol))}>
          {delta != null ? sfmt(delta) : ''}
        </span>
        <button
          className="justify-self-center text-muted-foreground hover:text-destructive"
          aria-label="Delete measurement"
          onClick={() => deleteMeasurement(m.id)}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="hidden sm:inline">Corrections</span>
        <CorrectionField m={m} end="A" pile={a} />
        <CorrectionField m={m} end="B" pile={b} />
        {m.correctionA || m.correctionB ? <span className="font-mono">= {len != null ? fmt(len) : '—'}</span> : null}
      </div>
    </li>
  );
}

/** Tape measurements between piles, with hook corrections. */
export function MeasurementsCard() {
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
        <CardTitle>Measurements</CardTitle>
        <CardDescription>Between the nails on the stakes, not along the strings. Read at the centre of the graduation.</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        {measurements.length ? (
          <ul>
            {measurements.map((m) => (
              <Row key={m.id} m={m} piles={piles} tol={tol} unused={derived.has(m.a) || derived.has(m.b)} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No measurements yet. Start with the suggestion above, or add one.</p>
        )}
        <Button variant="outline" className="mt-3 w-full border-dashed" onClick={add} disabled={piles.length < 2}>
          <Plus /> Add measurement
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          <b className="font-medium text-foreground">Corrections:</b> if the tape is hooked on a point behind a pile (a peg, a rebar), the
          reading is longer by a fixed amount. Enter it at that pile’s end — both ends can have one; empty means 0. Both are subtracted from
          the reading.
        </p>
      </CardContent>
    </Card>
  );
}

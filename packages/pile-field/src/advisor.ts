import { nextObservation, pairKey, type Progress } from '@buildkit/survey';
import { correctedLength, recommendedPairs, type Measurement } from './measurement';
import type { Plan } from './plan';

export type Suggestion =
  | {
      readonly kind: 'remeasure';
      readonly a: string;
      readonly b: string;
      readonly measurementId?: string;
      /** Estimated error of the reading, mm. */
      readonly error: number;
      /** How many readings are equally suspect. */
      readonly alike: number;
    }
  | {
      readonly kind: 'fix' | 'check';
      readonly a: string;
      readonly b: string;
      /** Existing row without a reading for this pair, if any. */
      readonly measurementId?: string;
      readonly progress: Progress;
    }
  | { readonly kind: 'done'; readonly progress: Progress };

/** What to measure next, given the current plan. */
export function suggestNext(plan: Plan, measurements: readonly Measurement[]): Suggestion | null {
  const stations = plan.measured;
  if (stations.length < 2) return null;
  if (plan.status === 'contradictory') {
    const w = plan.worst;
    return {
      kind: 'remeasure',
      a: w.a,
      b: w.b,
      ...(w.ref ? { measurementId: w.ref } : {}),
      error: w.blunder,
      alike: plan.alike.length,
    };
  }
  const ids = new Set(stations.map((s) => s.id));
  const relevant = measurements.filter((m) => ids.has(m.a) && ids.has(m.b) && m.a !== m.b);
  const observed = relevant.filter((m) => (correctedLength(m) ?? 0) > 0);
  const pending = relevant.filter((m) => m.reading == null);
  const s = nextObservation({ stations, observed, pending, recommended: recommendedPairs(stations) });
  if (s.kind === 'done') return s;
  const row = pending.find((m) => pairKey(m.a, m.b) === pairKey(s.pair.a, s.pair.b));
  return { kind: s.kind, a: s.pair.a, b: s.pair.b, ...(row ? { measurementId: row.id } : {}), progress: s.progress };
}

/** The last correction used at a pile's end in another measurement, if any (to offer it again). */
export function knownCorrection(measurements: readonly Measurement[], pileId: string, exceptId?: string): number | null {
  for (let k = measurements.length - 1; k >= 0; k--) {
    const m = measurements[k]!;
    if (m.id === exceptId) continue;
    if (m.a === pileId && m.correctionA != null) return m.correctionA;
    if (m.b === pileId && m.correctionB != null) return m.correctionB;
  }
  return null;
}

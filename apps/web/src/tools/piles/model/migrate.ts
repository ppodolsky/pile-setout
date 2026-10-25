import { isContainerType, projectT, type ContainerType, type Measurement, type PileSpec } from './deps';
import { newProject, type ProjectData } from './project';

/** Key used by the first, single-file version of the app. */
export const V1_KEY = 'pile-setout/v1';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Converts a session saved by the single-file app (labels as references, "mid" piles, presets)
 * into a project. Returns null if there is nothing usable.
 */
export function migrateV1(raw: string | null): ProjectData | null {
  if (!raw) return null;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const piles = Array.isArray(d.piles) ? (d.piles as Record<string, unknown>[]) : null;
  if (!piles?.length || !piles.every((p) => typeof p.label === 'string' && num(p.x) && num(p.y))) return null;

  const presetTypes: Record<string, ContainerType[]> = { c10: ['10'], c20: ['20'], c40: ['40'] };
  const containers =
    presetTypes[String(d.preset)] ??
    (Array.isArray(d.containers) ? (d.containers as unknown[]).filter(isContainerType) : ['20' as ContainerType]);

  const idOf = new Map(piles.map((p, i) => [p.label as string, `p${i + 1}`]));
  const specs: PileSpec[] = piles.map((p, i) => {
    const base = { id: `p${i + 1}`, label: p.label as string, ...(p.shared ? { shared: true } : {}) };
    const mid = p.mid as { a?: unknown; b?: unknown } | undefined;
    const A = mid && piles.find((q) => q.label === mid.a);
    const B = mid && piles.find((q) => q.label === mid.b);
    if (A && B) {
      const t = projectT(p as { x: number; y: number }, A as { x: number; y: number }, B as { x: number; y: number });
      return { ...base, def: { kind: 'between', from: idOf.get(A.label as string)!, to: idOf.get(B.label as string)!, by: 'ratio', t } };
    }
    return { ...base, def: { kind: 'fixed', x: p.x as number, y: p.y as number } };
  });

  const measurements: Measurement[] = (Array.isArray(d.meas) ? (d.meas as Record<string, unknown>[]) : [])
    .filter((m) => idOf.has(m.a as string) && idOf.has(m.b as string))
    .map((m, i) => ({
      id: `m${i + 1}`,
      a: idOf.get(m.a as string)!,
      b: idOf.get(m.b as string)!,
      reading: num(m.value) ? m.value : null,
      correctionA: num(m.corr) && m.end !== 'b' ? m.corr : null,
      correctionB: num(m.corr) && m.end === 'b' ? m.corr : null,
    }));

  const base = newProject();
  return {
    design: {
      template: {
        containers: containers.length ? containers : ['20'],
        head: num(d.head) ? d.head : 200,
        inset: num(d.inset) ? d.inset : 0,
      },
      piles: specs,
      edited: true,
    },
    fieldwork: {
      measurements,
      tolerance: num(d.tol) && d.tol >= 0.5 ? d.tol : 3,
      pinned: (Array.isArray(d.pinned) ? (d.pinned as unknown[]) : []).flatMap((l) =>
        idOf.has(l as string) ? [idOf.get(l as string)!] : [],
      ),
      parametric: d.midMode === 'measured' ? 'measured' : 'derived',
    },
    view: { exaggeration: num(d.exagg) ? d.exagg : base.view.exaggeration, showLines: d.showEdges !== false },
  };
}

import {
  isContainerType,
  projectT,
  type CadConstraint,
  type ContainerType,
  type Measurement,
  type PileDesign,
  type TemplateSpec,
} from './deps';
import { DEFAULT_TEMPLATE, designFromV4, newProject, type DesignState, type ProjectData } from './project';

/** Version-3 pile (piles were points themselves). */
interface V3Pile {
  id: string;
  label: string;
  x: number;
  y: number;
  setout: 'measure' | 'derive';
  shared?: boolean;
}

/** Version 3 → 4: each pile becomes a point plus a pile element on it (same ids). */
function upgradeDesign(piles: readonly V3Pile[], constraints: readonly CadConstraint[], head: number): PileDesign {
  return {
    points: piles.map((p) => ({ id: p.id, x: p.x, y: p.y })),
    lines: [],
    constraints: [...constraints],
    elements: piles.map((p) => ({
      id: p.id,
      type: 'pile',
      point: p.id,
      label: p.label,
      head,
      setout: p.setout,
      ...(p.shared ? { shared: true } : {}),
    })),
  };
}

/** Persisted version 3 → current. */
export function migrateV3(state: Raw): ProjectData {
  const base = newProject();
  const d = (state.design ?? {}) as Raw;
  const template = (d.template as TemplateSpec | undefined) ?? DEFAULT_TEMPLATE;
  if (!d.edited)
    return {
      ...base,
      ...(state as object),
      design: designFromV4({ template, edited: false }),
      view: { ...base.view, ...((state.view as object) ?? {}) },
    } as ProjectData;
  return {
    ...base,
    ...(state as object),
    design: designFromV4({
      template,
      doc: upgradeDesign((d.piles as V3Pile[]) ?? [], (d.constraints as CadConstraint[]) ?? [], template.head),
      edited: true,
    }),
    view: { ...base.view, ...((state.view as object) ?? {}) },
  } as ProjectData;
}

/** Key used by the first, single-file version of the app. */
export const V1_KEY = 'pile-setout/v1';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
type Raw = Record<string, unknown>;

/**
 * Converts a session saved by the single-file app (labels as references, "mid" piles, presets)
 * into a project. Unedited layouts get the template's constraints; others keep their piles where
 * they are (fixed) with middle supports between their corners.
 */
export function migrateV1(raw: string | null): ProjectData | null {
  if (!raw) return null;
  let d: Raw;
  try {
    d = JSON.parse(raw) as Raw;
  } catch {
    return null;
  }
  const piles = Array.isArray(d.piles) ? (d.piles as Raw[]) : null;
  if (!piles?.length || !piles.every((p) => typeof p.label === 'string' && num(p.x) && num(p.y))) return null;

  const presetTypes: Record<string, ContainerType[]> = { c10: ['10'], c20: ['20'], c40: ['40'] };
  const containers =
    presetTypes[String(d.preset)] ?? (Array.isArray(d.containers) ? (d.containers as unknown[]).filter(isContainerType) : []);
  const template = {
    containers: containers.length ? containers : (['20'] as ContainerType[]),
    head: num(d.head) ? d.head : 200,
    inset: num(d.inset) ? d.inset : 0,
  };

  const idOf = new Map(piles.map((p, i) => [p.label as string, `p${i + 1}`]));
  const ps: V3Pile[] = piles.map((p, i) => ({
    id: `p${i + 1}`,
    label: p.label as string,
    x: p.x as number,
    y: p.y as number,
    setout: p.mid ? 'derive' : 'measure',
    ...(p.shared ? { shared: true } : {}),
  }));
  const constraints: CadConstraint[] = [];
  piles.forEach((p, i) => {
    const mid = p.mid as { a?: unknown; b?: unknown } | undefined;
    const A = mid && piles.find((q) => q.label === mid.a);
    const B = mid && piles.find((q) => q.label === mid.b);
    if (A && B) {
      const t = projectT(p as never, A as never, B as never);
      constraints.push({
        id: `k${i + 1}`,
        kind: 'ratio',
        p: `p${i + 1}`,
        a: idOf.get(A.label as string)!,
        b: idOf.get(B.label as string)!,
        t,
      });
    } else constraints.push({ id: `k${i + 1}`, kind: 'fix', p: `p${i + 1}`, x: p.x as number, y: p.y as number });
  });
  // a layout that is exactly the template's gets the template's (nicer) constraints
  const generated = designFromV4({ template, edited: false });
  const gp = generated.doc.elements.map((e) => generated.doc.points.find((p) => p.id === e.point)!);
  const same = gp.length === ps.length && gp.every((g, i) => Math.abs(g.x - ps[i]!.x) < 0.01 && Math.abs(g.y - ps[i]!.y) < 0.01);
  const design: DesignState = same
    ? { ...generated, doc: { ...generated.doc, elements: generated.doc.elements.map((e, i) => ({ ...e, label: ps[i]!.label })) } }
    : designFromV4({ template, doc: upgradeDesign(ps, constraints, template.head), edited: true });

  const measurements: Measurement[] = (Array.isArray(d.meas) ? (d.meas as Raw[]) : [])
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
    design,
    fieldwork: {
      measurements,
      tolerance: num(d.tol) && d.tol >= 0.5 ? d.tol : 3,
      pinned: (Array.isArray(d.pinned) ? (d.pinned as unknown[]) : []).flatMap((l) =>
        idOf.has(l as string) ? [idOf.get(l as string)!] : [],
      ),
      parametric: d.midMode === 'measured' ? 'measured' : 'derived',
    },
    view: { ...base.view, exaggeration: num(d.exagg) ? d.exagg : base.view.exaggeration, showLines: d.showEdges !== false },
  };
}

/**
 * Converts a version-2 project (each pile had one definition: fixed / between / polar) into the
 * constraint sketch: fixed → fix, between → ratio (or on-line + distance), polar → distance + angle.
 */
export function migrateV2(state: Raw): ProjectData {
  const base = newProject();
  const design = (state.design ?? {}) as Raw;
  const specs = (Array.isArray(design.piles) ? design.piles : []) as Raw[];
  const template = (design.template as TemplateSpec | undefined) ?? DEFAULT_TEMPLATE;
  if (!design.edited) {
    return {
      ...base,
      ...(state as object),
      design: designFromV4({ template, edited: false }),
      view: { ...base.view, ...((state.view as object) ?? {}) },
    } as ProjectData;
  }
  // evaluate positions in dependency order (as version 2 did)
  const pos = new Map<string, { x: number; y: number }>();
  const byId = new Map(specs.map((s) => [s.id as string, s]));
  const visit = (id: string, depth = 0): { x: number; y: number } | null => {
    if (pos.has(id)) return pos.get(id)!;
    const s = byId.get(id);
    if (!s || depth > 50) return null;
    const def = s.def as Raw;
    let p: { x: number; y: number } | null = null;
    if (def.kind === 'fixed') p = { x: def.x as number, y: def.y as number };
    else if (def.kind === 'between') {
      const a = visit(def.from as string, depth + 1);
      const b = visit(def.to as string, depth + 1);
      const L = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
      const t = def.by === 'ratio' ? (def.t as number) : L ? (def.distance as number) / L : 0;
      if (a && b) p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    } else if (def.kind === 'polar') {
      const a = visit(def.from as string, depth + 1);
      const r = def.ref ? visit(def.ref as string, depth + 1) : null;
      if (a) {
        const th = (r ? Math.atan2(r.y - a.y, r.x - a.x) : 0) + ((def.angle as number) * Math.PI) / 180;
        p = { x: a.x + (def.distance as number) * Math.cos(th), y: a.y + (def.distance as number) * Math.sin(th) };
      }
    }
    if (p) pos.set(id, p);
    return p;
  };
  const piles: V3Pile[] = specs.flatMap((s) => {
    const p = visit(s.id as string);
    return p
      ? [
          {
            id: s.id as string,
            label: s.label as string,
            ...p,
            setout: (s.def as Raw).kind === 'fixed' ? 'measure' : 'derive',
            ...(s.shared ? { shared: true } : {}),
          } as V3Pile,
        ]
      : [];
  });
  const constraints: CadConstraint[] = [];
  let k = 0;
  for (const s of specs) {
    const def = s.def as Raw;
    const id = s.id as string;
    if (!pos.has(id)) continue;
    if (def.kind === 'fixed') constraints.push({ id: `k${++k}`, kind: 'fix', p: id, x: def.x as number, y: def.y as number });
    else if (def.kind === 'between') {
      if (def.by === 'ratio')
        constraints.push({ id: `k${++k}`, kind: 'ratio', p: id, a: def.from as string, b: def.to as string, t: def.t as number });
      else
        constraints.push(
          { id: `k${++k}`, kind: 'onLine', p: id, a: def.from as string, b: def.to as string },
          { id: `k${++k}`, kind: 'distance', a: def.from as string, b: id, d: def.distance as number },
        );
    } else if (def.kind === 'polar')
      constraints.push(
        { id: `k${++k}`, kind: 'distance', a: def.from as string, b: id, d: def.distance as number },
        { id: `k${++k}`, kind: 'angle', a: def.from as string, b: id, angle: def.angle as number, ref: (def.ref as string | null) ?? null },
      );
  }
  const fw = (state.fieldwork ?? base.fieldwork) as ProjectData['fieldwork'];
  return {
    design: designFromV4({ template, doc: upgradeDesign(piles, constraints, template.head), edited: true }),
    fieldwork: fw,
    view: { ...base.view, ...((state.view as object) ?? {}) },
  };
}

/** Persisted version 4 (template + plan) → current (background drawings + pile field). */
export function migrateV4(state: Raw): ProjectData {
  const base = newProject();
  const d = (state.design ?? {}) as { template?: TemplateSpec; doc?: PileDesign; edited?: boolean };
  return {
    ...base,
    ...(state as object),
    design: designFromV4({ template: d.template ?? DEFAULT_TEMPLATE, ...(d.doc ? { doc: d.doc } : {}), edited: !!d.edited }),
    view: { ...base.view, ...((state.view as object) ?? {}) },
  } as ProjectData;
}

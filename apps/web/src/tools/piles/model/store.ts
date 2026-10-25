import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { temporal } from 'zundo';
import { uid } from '@/lib/id';
import type { ConstraintDraft } from './actions';
import {
  computePlan,
  constraintPoints,
  distance,
  emptyMeasurement,
  freedom,
  pairKey,
  readings,
  recommendedPairs,
  rng,
  scatter,
  solveDesign,
  type Constraint,
  type Measurement,
  type ParametricMode,
  type Pile,
  type TemplateSpec,
  type Vec2,
} from './deps';
import { migrateV1, migrateV2, V1_KEY } from './migrate';
import { designFromTemplate, newProject, type DesignState, type ProjectData } from './project';

export interface ProjectActions {
  // ---- design ----
  setTemplate(patch: Partial<TemplateSpec>): void;
  /** Replaces the sketch with the one generated from the template. */
  regenerate(): void;
  /** A free pile (no constraints) at a point. */
  addPile(at: Vec2): string;
  /** A new pile with constraints to existing piles (e.g. a midpoint). */
  addPileWith(at: Vec2, constraints: (id: string) => ConstraintDraft[]): string;
  updatePile(id: string, patch: Partial<Pick<Pile, 'label' | 'setout'>>): void;
  /** Moves a pile as far as its constraints allow (others follow); a fixed pile's fix moves with it. */
  movePile(id: string, to: Vec2, opts?: { moveFix?: boolean }): void;
  deletePiles(ids: readonly string[]): void;
  /** Adds the constraints that actually remove freedom; returns how many were redundant. */
  addConstraints(drafts: readonly ConstraintDraft[]): { added: string[]; redundant: number };
  updateConstraint(id: string, patch: Partial<Constraint>): void;
  deleteConstraint(id: string): void;
  // ---- field work ----
  addMeasurement(a: string, b: string): string;
  updateMeasurement(id: string, patch: Partial<Omit<Measurement, 'id'>>): void;
  deleteMeasurement(id: string): void;
  togglePin(id: string): void;
  setTolerance(mm: number): void;
  setParametric(mode: ParametricMode): void;
  /** Test helpers: readings equal to the design, or to a randomly mis-set field. */
  fillDesignReadings(): void;
  fillDemoReadings(): void;
  // ---- view / project ----
  setView(patch: Partial<ProjectData['view']>): void;
  reset(): void;
}

export type ProjectStore = ProjectData & ProjectActions;

const KEY = 'buildkit/pile-field/v2';
/**
 * First run of this version: start from a session saved by the single-file app, if any.
 * Read before the store exists — persist writes its own key while hydrating.
 */
function initialProject(): ProjectData {
  try {
    if (localStorage.getItem(KEY) == null) return migrateV1(localStorage.getItem(V1_KEY)) ?? newProject();
  } catch {
    /* storage unavailable */
  }
  return newProject();
}

/** Re-solves the sketch so stored positions always satisfy the constraints. */
function settle(design: DesignState): DesignState {
  return { ...design, piles: solveDesign(design).piles };
}

const nextLabel = (piles: readonly Pile[]): string => {
  const used = new Set(piles.map((p) => p.label));
  for (let n = piles.length + 1; ; n++) if (!used.has(`C${n}`)) return `C${n}`;
};

/** Drops measurements and pins that refer to piles that no longer exist. */
function prune(fw: ProjectData['fieldwork'], piles: readonly Pile[]): ProjectData['fieldwork'] {
  const ids = new Set(piles.map((p) => p.id));
  return {
    ...fw,
    measurements: fw.measurements.filter((m) => ids.has(m.a) && ids.has(m.b)),
    pinned: fw.pinned.filter((id) => ids.has(id)),
  };
}

/** Existing rows plus any missing pair of the recommended set (for the test helpers). */
function ensureRows(s: ProjectStore): Measurement[] {
  const piles = s.design.piles;
  const plan = computePlan({
    piles,
    measurements: [],
    tolerance: s.fieldwork.tolerance,
    pinned: new Set(),
    parametric: s.fieldwork.parametric,
  });
  const have = new Set(s.fieldwork.measurements.map((m) => pairKey(m.a, m.b)));
  const missing = recommendedPairs(plan.measured).filter((p) => !have.has(pairKey(p.a, p.b)));
  return [...s.fieldwork.measurements, ...missing.map((p) => emptyMeasurement(uid('m'), p.a, p.b))];
}

export const useProject = create<ProjectStore>()(
  persist(
    temporal(
      (set) => ({
        ...initialProject(),

        setTemplate: (patch) =>
          set((s) => {
            const template = { ...s.design.template, ...patch };
            if (s.design.edited) return { design: { ...s.design, template } };
            const design = designFromTemplate(template);
            return { design, fieldwork: prune(s.fieldwork, design.piles) };
          }),

        regenerate: () =>
          set((s) => {
            const design = designFromTemplate(s.design.template);
            return { design, fieldwork: prune(s.fieldwork, design.piles) };
          }),

        addPile: (at) => {
          const id = uid('p');
          set((s) => ({
            design: {
              ...s.design,
              piles: [...s.design.piles, { id, label: nextLabel(s.design.piles), x: at.x, y: at.y, setout: 'measure' }],
              edited: true,
            },
          }));
          return id;
        },

        addPileWith: (at, make) => {
          const id = uid('p');
          set((s) => {
            const piles = [...s.design.piles, { id, label: nextLabel(s.design.piles), x: at.x, y: at.y, setout: 'derive' as const }];
            const constraints = [...s.design.constraints, ...make(id).map((d) => ({ ...d, id: uid('k') }) as Constraint)];
            return { design: settle({ ...s.design, piles, constraints, edited: true }) };
          });
          return id;
        },

        updatePile: (id, patch) =>
          set((s) => ({ design: { ...s.design, piles: s.design.piles.map((p) => (p.id === id ? { ...p, ...patch } : p)), edited: true } })),

        movePile: (id, to, opts) =>
          set((s) => {
            // a fixed pile's fix moves with it when asked (typing coordinates / dragging the anchor)
            const constraints = opts?.moveFix
              ? s.design.constraints.map((c) => (c.kind === 'fix' && c.p === id ? { ...c, x: to.x, y: to.y } : c))
              : s.design.constraints;
            const { piles } = solveDesign({ piles: s.design.piles, constraints }, { id, to });
            return { design: { ...s.design, piles, constraints, edited: true } };
          }),

        deletePiles: (ids) =>
          set((s) => {
            const gone = new Set(ids);
            const piles = s.design.piles.filter((p) => !gone.has(p.id));
            const constraints = s.design.constraints.filter((c) => !constraintPoints(c).some((p) => gone.has(p)));
            return { design: { ...s.design, piles, constraints, edited: true }, fieldwork: prune(s.fieldwork, piles) };
          }),

        addConstraints: (drafts) => {
          const added: string[] = [];
          let redundant = 0;
          set((s) => {
            let constraints = [...s.design.constraints];
            let dof = freedom(s.design.piles, constraints).dof;
            for (const d of drafts) {
              const c = { ...d, id: uid('k') } as Constraint;
              const next = freedom(s.design.piles, [...constraints, c]).dof;
              if (next < dof) {
                constraints = [...constraints, c];
                added.push(c.id);
                dof = next;
              } else redundant++;
            }
            if (!added.length) return {};
            return { design: settle({ ...s.design, constraints, edited: true }) };
          });
          return { added, redundant };
        },

        updateConstraint: (id, patch) =>
          set((s) => ({
            design: settle({
              ...s.design,
              constraints: s.design.constraints.map((c) => (c.id === id ? ({ ...c, ...patch } as Constraint) : c)),
              edited: true,
            }),
          })),

        deleteConstraint: (id) =>
          set((s) => ({ design: { ...s.design, constraints: s.design.constraints.filter((c) => c.id !== id), edited: true } })),

        addMeasurement: (a, b) => {
          const id = uid('m');
          set((s) => ({
            fieldwork: {
              ...s.fieldwork,
              measurements: [...s.fieldwork.measurements, emptyMeasurement(id, a, b)],
            },
          }));
          return id;
        },

        updateMeasurement: (id, patch) =>
          set((s) => ({
            fieldwork: {
              ...s.fieldwork,
              measurements: s.fieldwork.measurements.map((m) => (m.id === id ? { ...m, ...patch } : m)),
            },
          })),

        deleteMeasurement: (id) =>
          set((s) => ({ fieldwork: { ...s.fieldwork, measurements: s.fieldwork.measurements.filter((m) => m.id !== id) } })),

        togglePin: (id) =>
          set((s) => ({
            fieldwork: {
              ...s.fieldwork,
              pinned: s.fieldwork.pinned.includes(id) ? s.fieldwork.pinned.filter((p) => p !== id) : [...s.fieldwork.pinned, id],
            },
          })),

        setTolerance: (tolerance) => set((s) => ({ fieldwork: { ...s.fieldwork, tolerance } })),
        setParametric: (parametric) => set((s) => ({ fieldwork: { ...s.fieldwork, parametric } })),

        fillDesignReadings: () =>
          set((s) => {
            const at = new Map(s.design.piles.map((p) => [p.id, p]));
            const measurements = ensureRows(s).map((m) =>
              at.has(m.a) && at.has(m.b)
                ? { ...m, reading: distance(at.get(m.a)!, at.get(m.b)!) + (m.correctionA ?? 0) + (m.correctionB ?? 0) }
                : m,
            );
            return { fieldwork: { ...s.fieldwork, measurements } };
          }),

        fillDemoReadings: () =>
          set((s) => {
            const actual = scatter(s.design.piles, rng(Date.now() % 2147483647));
            const rows = ensureRows(s).filter((m) => actual.has(m.a) && actual.has(m.b));
            const values = readings(actual, rows);
            return { fieldwork: { ...s.fieldwork, measurements: rows.map((m, i) => ({ ...m, reading: values[i]! })) } };
          }),

        setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),

        reset: () => {
          set(newProject());
          useProject.temporal.getState().clear();
        },
      }),
      {
        // undo/redo covers the design and the field work, not view settings
        partialize: (s) => ({ design: s.design, fieldwork: s.fieldwork }),
        limit: 200,
        equality: (a, b) => a.design === b.design && a.fieldwork === b.fieldwork,
        handleSet: (handleSet) => throttle(handleSet, 400),
      },
    ),
    {
      name: KEY,
      version: 3,
      migrate: (persisted, version) => (version < 3 ? migrateV2(persisted as Record<string, unknown>) : persisted) as ProjectData,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ design: s.design, fieldwork: s.fieldwork, view: s.view }),
    },
  ),
);

/** Groups rapid changes (typing) into one undo step. */
function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let last = 0;
  return (...args: A) => {
    const now = Date.now();
    if (now - last >= ms) fn(...args);
    last = now;
  };
}

export const useUndo = () => useProject.temporal;

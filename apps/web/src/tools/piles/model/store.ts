import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { temporal } from 'zundo';
import { uid } from '@/lib/id';
import {
  computePlan,
  distance,
  freeze,
  generatePiles,
  emptyMeasurement,
  pairKey,
  readings,
  recommendedPairs,
  references,
  resolveDesign,
  rng,
  scatter,
  type Measurement,
  type ParametricMode,
  type PileDef,
  type PileSpec,
  type TemplateSpec,
} from './deps';
import { migrateV1, V1_KEY } from './migrate';
import { newProject, type ProjectData } from './project';

export interface ProjectActions {
  // ---- design ----
  setTemplate(patch: Partial<TemplateSpec>): void;
  /** Replaces the piles with the ones generated from the template. */
  regenerate(): void;
  addPile(def: PileDef): string;
  updatePile(id: string, patch: Partial<Pick<PileSpec, 'label' | 'def'>>): void;
  /** Deletes a pile; piles defined from it are frozen where they are. */
  deletePile(id: string): void;
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

const nextLabel = (piles: readonly PileSpec[]): string => {
  const used = new Set(piles.map((p) => p.label));
  for (let n = piles.length + 1; ; n++) if (!used.has(`C${n}`)) return `C${n}`;
};

/** Drops measurements and pins that refer to piles that no longer exist. */
function prune(fw: ProjectData['fieldwork'], piles: readonly PileSpec[]): ProjectData['fieldwork'] {
  const ids = new Set(piles.map((p) => p.id));
  return {
    ...fw,
    measurements: fw.measurements.filter((m) => ids.has(m.a) && ids.has(m.b)),
    pinned: fw.pinned.filter((id) => ids.has(id)),
  };
}

/** Existing rows plus any missing pair of the recommended set (for the test helpers). */
function ensureRows(s: ProjectStore): Measurement[] {
  const { piles } = resolveDesign(s.design.piles);
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
            const piles = generatePiles(template);
            return { design: { template, piles, edited: false }, fieldwork: prune(s.fieldwork, piles) };
          }),

        regenerate: () =>
          set((s) => {
            const piles = generatePiles(s.design.template);
            return { design: { ...s.design, piles, edited: false }, fieldwork: prune(s.fieldwork, piles) };
          }),

        addPile: (def) => {
          const id = uid('p');
          set((s) => ({
            design: { ...s.design, piles: [...s.design.piles, { id, label: nextLabel(s.design.piles), def }], edited: true },
          }));
          return id;
        },

        updatePile: (id, patch) =>
          set((s) => ({
            design: { ...s.design, piles: s.design.piles.map((p) => (p.id === id ? { ...p, ...patch } : p)), edited: true },
          })),

        deletePile: (id) =>
          set((s) => {
            const { piles: resolved } = resolveDesign(s.design.piles);
            const piles = s.design.piles
              .filter((p) => p.id !== id)
              .map((p) => {
                if (!references(p.def).includes(id)) return p;
                const r = resolved.find((q) => q.id === p.id);
                return r ? freeze(r) : p;
              });
            return { design: { ...s.design, piles, edited: true }, fieldwork: prune(s.fieldwork, piles) };
          }),

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
            const { piles } = resolveDesign(s.design.piles);
            const at = new Map(piles.map((p) => [p.id, p]));
            const measurements = ensureRows(s).map((m) =>
              at.has(m.a) && at.has(m.b)
                ? { ...m, reading: distance(at.get(m.a)!, at.get(m.b)!) + (m.correctionA ?? 0) + (m.correctionB ?? 0) }
                : m,
            );
            return { fieldwork: { ...s.fieldwork, measurements } };
          }),

        fillDemoReadings: () =>
          set((s) => {
            const { piles } = resolveDesign(s.design.piles);
            const actual = scatter(piles, rng(Date.now() % 2147483647));
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
      version: 2,
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

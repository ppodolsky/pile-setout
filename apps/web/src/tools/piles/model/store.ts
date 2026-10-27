import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { temporal } from 'zundo';
import i18n from '@/i18n';
import { uid } from '@/lib/id';
import {
  addConstraints as addDocConstraints,
  computePlan,
  distance,
  dragPoint,
  emptyMeasurement,
  pairKey,
  pilesOf,
  readings,
  recommendedPairs,
  removeEntities,
  rng,
  scatter,
  setPointPosition,
  solveDocument,
  type CadConstraint,
  type ConstraintDraft,
  type Measurement,
  type ParametricMode,
  type PileDesign,
  type PileElement,
  type Removal,
  type TemplateSpec,
  type Vec2,
} from './deps';
import { migrateV1, migrateV2, migrateV3, V1_KEY } from './migrate';
import { designFromTemplate, newProject, type DesignState, type ProjectData } from './project';

export interface ProjectActions {
  // ---- design (a CAD document whose elements are piles) ----
  setTemplate(patch: Partial<TemplateSpec>): void;
  /** Replaces the plan with the one generated from the template. */
  regenerate(): void;
  /** A new point (bare, or with a pile on it) plus auto-constraints from snapping. */
  place(kind: 'point' | 'pile', at: Vec2, infer?: (id: string) => ConstraintDraft[], setout?: PileElement['setout']): string;
  addLine(a: string, b: string): string;
  /** Puts a pile on an existing bare point. */
  addPileOn(point: string): string;
  updatePile(id: string, patch: Partial<Pick<PileElement, 'label' | 'setout' | 'head' | 'diameter' | 'depth'>>): void;
  movePoint(id: string, to: Vec2): void;
  setPointPosition(id: string, to: Vec2): void;
  addConstraints(drafts: readonly ConstraintDraft[]): { added: string[]; redundant: number };
  updateConstraint(id: string, patch: Record<string, unknown>): void;
  remove(r: Removal): void;
  // ---- field work ----
  addMeasurement(a: string, b: string): string;
  updateMeasurement(id: string, patch: Partial<Omit<Measurement, 'id'>>): void;
  deleteMeasurement(id: string): void;
  togglePin(id: string): void;
  /** The pile was moved on site: its readings become "to re-measure" (old values kept for reference). */
  markMoved(pileId: string): void;
  setTolerance(mm: number): void;
  setParametric(mode: ParametricMode): void;
  /** Test helpers: readings equal to the design, or to a randomly mis-set field. */
  fillDesignReadings(): void;
  fillDemoReadings(): void;
  // ---- view / project ----
  setView(patch: Partial<ProjectData['view']>): void;
  /** Replaces the whole project (open a saved sketch / a file). */
  load(data: ProjectData): void;
  reset(): void;
}

/** Which library sketch this is. */
export interface SketchIdentity {
  readonly id: string;
  readonly name: string;
}

export const newIdentity = (name: string = i18n.t('project:sketch.untitled')): SketchIdentity => ({ id: uid('s'), name });

export type ProjectStore = ProjectData &
  ProjectActions & { readonly sketch: SketchIdentity; rename(name: string): void; open(id: SketchIdentity, data: ProjectData): void };

export const PROJECT_KEY = 'buildkit/pile-field/v2';

/**
 * First run of this version: start from a session saved by the single-file app, if any.
 * Read before the store exists — persist writes its own key while hydrating.
 */
function initialProject(): ProjectData {
  try {
    if (localStorage.getItem(PROJECT_KEY) == null) return migrateV1(localStorage.getItem(V1_KEY)) ?? newProject();
  } catch {
    /* storage unavailable */
  }
  return newProject();
}

const nextLabel = (doc: PileDesign): string => {
  const used = new Set(doc.elements.map((e) => e.label));
  for (let n = doc.elements.length + 1; ; n++) if (!used.has(`C${n}`)) return `C${n}`;
};

/** Drops measurements and pins of piles that no longer exist. */
function prune(fw: ProjectData['fieldwork'], doc: PileDesign): ProjectData['fieldwork'] {
  const ids = new Set(doc.elements.map((e) => e.id));
  return {
    ...fw,
    measurements: fw.measurements.filter((m) => ids.has(m.a) && ids.has(m.b)),
    pinned: fw.pinned.filter((id) => ids.has(id)),
  };
}

/** Existing rows plus any missing pair of the recommended set (for the test helpers). */
function ensureRows(s: ProjectStore): Measurement[] {
  const piles = pilesOf(s.design.doc);
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

/** Updates the design document (marks it edited). */
const edit = (s: ProjectStore, doc: PileDesign): Pick<ProjectData, 'design' | 'fieldwork'> => ({
  design: { ...s.design, doc, edited: true },
  fieldwork: prune(s.fieldwork, doc),
});

export const useProject = create<ProjectStore>()(
  persist(
    temporal(
      (set, get) => ({
        ...initialProject(),
        sketch: newIdentity(),

        rename: (name) => set((s) => ({ sketch: { ...s.sketch, name } })),

        open: (sketch, data) => {
          set({ sketch, design: data.design, fieldwork: data.fieldwork, view: { ...newProject().view, ...data.view } });
          useProject.temporal.getState().clear();
        },

        setTemplate: (patch) =>
          set((s) => {
            const template = { ...s.design.template, ...patch };
            if (s.design.edited) return { design: { ...s.design, template } };
            const design = designFromTemplate(template);
            return { design, fieldwork: prune(s.fieldwork, design.doc) };
          }),

        regenerate: () =>
          set((s) => {
            const design: DesignState = designFromTemplate(s.design.template);
            return { design, fieldwork: prune(s.fieldwork, design.doc) };
          }),

        place: (kind, at, infer, setout = 'measure') => {
          const point = uid('pt');
          set((s) => {
            const d = s.design.doc;
            let doc: PileDesign = { ...d, points: [...d.points, { id: point, x: at.x, y: at.y }] };
            if (kind === 'pile')
              doc = {
                ...doc,
                elements: [
                  ...doc.elements,
                  { id: uid('p'), type: 'pile', point, label: nextLabel(d), head: s.design.template.head, setout },
                ],
              };
            if (infer) doc = addDocConstraints(doc, infer(point), () => uid('k')).doc;
            return edit(s, doc);
          });
          return point;
        },

        addLine: (a, b) => {
          const id = uid('l');
          set((s) => edit(s, { ...s.design.doc, lines: [...s.design.doc.lines, { id, a, b, construction: true }] }));
          return id;
        },

        addPileOn: (point) => {
          const id = uid('p');
          set((s) => {
            const d = s.design.doc;
            if (d.elements.some((e) => e.point === point)) return {};
            return edit(s, {
              ...d,
              elements: [...d.elements, { id, type: 'pile', point, label: nextLabel(d), head: s.design.template.head, setout: 'measure' }],
            });
          });
          return id;
        },

        updatePile: (id, patch) =>
          set((s) => edit(s, { ...s.design.doc, elements: s.design.doc.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),

        movePoint: (id, to) => set((s) => edit(s, dragPoint(s.design.doc, id, to))),
        setPointPosition: (id, to) => set((s) => edit(s, setPointPosition(s.design.doc, id, to))),

        addConstraints: (drafts) => {
          const r = addDocConstraints(get().design.doc, drafts, () => uid('k'));
          if (r.added.length) set((s) => edit(s, r.doc));
          return { added: r.added, redundant: r.redundant };
        },

        updateConstraint: (id, patch) =>
          set((s) =>
            edit(
              s,
              solveDocument({
                ...s.design.doc,
                constraints: s.design.doc.constraints.map((c) => (c.id === id ? ({ ...c, ...patch } as CadConstraint) : c)),
              }).doc,
            ),
          ),

        remove: (r) => set((s) => edit(s, removeEntities(s.design.doc, r))),

        addMeasurement: (a, b) => {
          const id = uid('m');
          set((s) => ({ fieldwork: { ...s.fieldwork, measurements: [...s.fieldwork.measurements, emptyMeasurement(id, a, b)] } }));
          return id;
        },

        updateMeasurement: (id, patch) =>
          set((s) => {
            // a fresh reading replaces the one taken before the pile moved
            const measurements = s.fieldwork.measurements.map((m) =>
              m.id !== id ? m : patch.reading != null ? { ...m, ...patch, previous: null } : { ...m, ...patch },
            );
            // a pile stops being "moved" once none of its readings wait to be re-measured
            const moved = (s.fieldwork.moved ?? []).filter((p) =>
              measurements.some((m) => (m.a === p || m.b === p) && m.reading == null && m.previous != null),
            );
            return { fieldwork: { ...s.fieldwork, measurements, moved } };
          }),

        deleteMeasurement: (id) =>
          set((s) => ({ fieldwork: { ...s.fieldwork, measurements: s.fieldwork.measurements.filter((m) => m.id !== id) } })),

        togglePin: (id) =>
          set((s) => ({
            fieldwork: {
              ...s.fieldwork,
              pinned: s.fieldwork.pinned.includes(id) ? s.fieldwork.pinned.filter((p) => p !== id) : [...s.fieldwork.pinned, id],
            },
          })),

        markMoved: (pileId) =>
          set((s) => ({
            fieldwork: {
              ...s.fieldwork,
              moved: [...new Set([...(s.fieldwork.moved ?? []), pileId])],
              measurements: s.fieldwork.measurements.map((m) =>
                (m.a === pileId || m.b === pileId) && m.reading != null ? { ...m, previous: m.reading, reading: null } : m,
              ),
            },
          })),

        setTolerance: (tolerance) => set((s) => ({ fieldwork: { ...s.fieldwork, tolerance } })),
        setParametric: (parametric) => set((s) => ({ fieldwork: { ...s.fieldwork, parametric } })),

        fillDesignReadings: () =>
          set((s) => {
            const at = new Map(pilesOf(s.design.doc).map((p) => [p.id, p]));
            const measurements = ensureRows(s).map((m) =>
              at.has(m.a) && at.has(m.b)
                ? { ...m, reading: distance(at.get(m.a)!, at.get(m.b)!) + (m.correctionA ?? 0) + (m.correctionB ?? 0) }
                : m,
            );
            return { fieldwork: { ...s.fieldwork, measurements } };
          }),

        fillDemoReadings: () =>
          set((s) => {
            const actual = scatter(pilesOf(s.design.doc), rng(Date.now() % 2147483647));
            const rows = ensureRows(s).filter((m) => actual.has(m.a) && actual.has(m.b));
            const values = readings(actual, rows);
            return { fieldwork: { ...s.fieldwork, measurements: rows.map((m, i) => ({ ...m, reading: values[i]! })) } };
          }),

        setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),

        load: (data) => {
          set({ design: data.design, fieldwork: data.fieldwork, view: { ...newProject().view, ...data.view } });
          useProject.temporal.getState().clear();
        },

        reset: () => {
          set({ ...newProject(), sketch: newIdentity() });
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
      name: PROJECT_KEY,
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ design: s.design, fieldwork: s.fieldwork, view: s.view, sketch: s.sketch }),
      migrate: (persisted, version) => {
        const raw = persisted as Record<string, unknown>;
        if (version < 3) return migrateV2(raw);
        if (version < 4) return migrateV3(raw);
        return raw as unknown as ProjectData;
      },
    },
  ),
);

/** Groups rapid changes (typing, dragging) into one undo step. */
function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let last = 0;
  return (...args: A) => {
    const now = Date.now();
    if (now - last >= ms) fn(...args);
    last = now;
  };
}

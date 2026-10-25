import { localSketchStore, type SketchStore } from '@/app/library';
import { pilesOf } from './deps';
import type { ProjectData } from './project';
import { useProject, type SketchIdentity } from './store';

export const TOOL_ID = 'piles';

/** The library backend in use (local for now; a cloud one can be swapped in here). */
export const sketches: SketchStore = localSketchStore;

const summary = (d: ProjectData) => {
  const piles = pilesOf(d.design.doc).length;
  const readings = d.fieldwork.measurements.filter((m) => m.reading != null).length;
  return `${piles} piles · ${readings} readings`;
};

/** Writes the current sketch to the library. */
export function saveCurrent(): Promise<void> {
  const { sketch, design, fieldwork, view } = useProject.getState();
  const data: ProjectData = { design, fieldwork, view };
  return sketches.save({ id: sketch.id, tool: TOOL_ID, name: sketch.name, updatedAt: Date.now(), summary: summary(data), data });
}

/** Keeps the library copy of the current sketch up to date (debounced). Call once at start-up. */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  void saveCurrent();
  const unsubscribe = useProject.subscribe((s, prev) => {
    if (s.design === prev.design && s.fieldwork === prev.fieldwork && s.view === prev.view && s.sketch === prev.sketch) return;
    clearTimeout(timer);
    timer = setTimeout(() => void saveCurrent(), 400);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}

export async function openSketch(id: string): Promise<boolean> {
  const stored = await sketches.load<ProjectData>(id);
  if (!stored) return false;
  await saveCurrent();
  const identity: SketchIdentity = { id: stored.id, name: stored.name };
  useProject.getState().open(identity, stored.data);
  return true;
}

export async function duplicateSketch(id: string, newId: string): Promise<void> {
  const stored = await sketches.load<ProjectData>(id);
  if (!stored) return;
  await sketches.save({ ...stored, id: newId, name: `${stored.name} (copy)`, updatedAt: Date.now() });
}

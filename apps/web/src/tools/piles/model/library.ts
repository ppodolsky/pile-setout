import { useAuth } from '@/app/backend/auth';
import { supabase } from '@/app/backend/supabase';
import { cloudSketchStore, localSketchStore, syncedSketchStore, type SketchStore } from '@/app/library';
import { pilesOf } from './deps';
import type { ProjectData } from './project';
import { useProject, type SketchIdentity } from './store';

export const TOOL_ID = 'piles';

let synced: ReturnType<typeof syncedSketchStore> | null = null;

/** The library in use: this device, plus the cloud while signed in. */
export function sketchStore(): SketchStore {
  if (!supabase || !useAuth.getState().account) return localSketchStore;
  synced ??= syncedSketchStore(localSketchStore, cloudSketchStore(supabase), (e) => console.warn('cloud sync:', e));
  return synced;
}

// signing in brings this device and the account in step
useAuth.subscribe((s, prev) => {
  if (s.account?.id === prev.account?.id) return;
  synced = null;
  if (s.account) void saveCurrent().then(() => (sketchStore() as ReturnType<typeof syncedSketchStore>).sync(TOOL_ID));
});

const summary = (d: ProjectData) => {
  const piles = pilesOf(d.design.doc).length;
  const readings = d.fieldwork.measurements.filter((m) => m.reading != null).length;
  return `${piles} piles · ${readings} readings`;
};

/** Writes the current sketch to the library. */
export function saveCurrent(): Promise<void> {
  const { sketch, design, fieldwork, view } = useProject.getState();
  const data: ProjectData = { design, fieldwork, view };
  return sketchStore().save({ id: sketch.id, tool: TOOL_ID, name: sketch.name, updatedAt: Date.now(), summary: summary(data), data });
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
  const stored = await sketchStore().load<ProjectData>(id);
  if (!stored) return false;
  await saveCurrent();
  const identity: SketchIdentity = { id: stored.id, name: stored.name };
  useProject.getState().open(identity, stored.data);
  return true;
}

export async function duplicateSketch(id: string, newId: string): Promise<void> {
  const stored = await sketchStore().load<ProjectData>(id);
  if (!stored) return;
  await sketchStore().save({ ...stored, id: newId, name: `${stored.name} (copy)`, updatedAt: Date.now() });
}

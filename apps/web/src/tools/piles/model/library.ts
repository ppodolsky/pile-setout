import { useAuth } from '@/app/backend/auth';
import { supabase } from '@/app/backend/supabase';
import i18n from '@/i18n';
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
  if (s.account)
    void saveCurrent().then(async () => {
      const store = sketchStore() as ReturnType<typeof syncedSketchStore>;
      await store.sync(TOOL_ID);
      await store.sync('piles-template'); // the user's design templates travel too
    });
});

/** What a sketch's list entry shows, stored language-neutral (JSON) and translated when shown. */
export interface SketchCounts {
  readonly piles: number;
  readonly readings: number;
}

const summary = (d: ProjectData): string =>
  JSON.stringify({
    piles: pilesOf(d.design.doc).length,
    readings: d.fieldwork.measurements.filter((m) => m.reading != null).length,
  } satisfies SketchCounts);

/** The counts in a stored summary (also understands the earlier "6 piles · 9 readings" text), or null. */
export function summaryCounts(text: string | undefined): SketchCounts | null {
  try {
    const c = JSON.parse(text ?? '') as Partial<SketchCounts>;
    if (typeof c.piles === 'number' && typeof c.readings === 'number') return { piles: c.piles, readings: c.readings };
  } catch {
    /* not JSON — maybe the older English form */
  }
  const m = /^(\d+) piles · (\d+) readings$/.exec(text ?? '');
  return m ? { piles: Number(m[1]), readings: Number(m[2]) } : null;
}

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
  await sketchStore().save({ ...stored, id: newId, name: i18n.t('project:sketch.copyName', { name: stored.name }), updatedAt: Date.now() });
}

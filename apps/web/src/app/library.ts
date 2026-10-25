import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The sketch library: every sketch of a tool, saved by name. Storage is behind `SketchStore` —
 * on the device, in the cloud, or both kept in step (`syncedSketchStore`) — so tools never care.
 */
export interface SketchMeta {
  readonly id: string;
  readonly tool: string;
  readonly name: string;
  readonly updatedAt: number;
  /** One line shown in lists, e.g. "6 piles · 9 readings". */
  readonly summary?: string;
}

export interface StoredSketch<T = unknown> extends SketchMeta {
  readonly data: T;
}

/** Asynchronous so a cloud backend can implement it the same way. */
export interface SketchStore {
  list(tool: string): Promise<SketchMeta[]>;
  load<T>(id: string): Promise<StoredSketch<T> | null>;
  save<T>(sketch: StoredSketch<T>): Promise<void>;
  remove(id: string): Promise<void>;
}

const INDEX = 'buildkit/library/v1';
const ITEM = (id: string) => `buildkit/library/v1/${id}`;

/** Library in this browser's localStorage (an index plus one entry per sketch). */
export const localSketchStore: SketchStore = {
  async list(tool) {
    return readIndex()
      .filter((m) => m.tool === tool)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async load<T>(id: string) {
    try {
      const raw = localStorage.getItem(ITEM(id));
      return raw ? (JSON.parse(raw) as StoredSketch<T>) : null;
    } catch {
      return null;
    }
  },
  async save(sketch) {
    const { data: _data, ...meta } = sketch;
    localStorage.setItem(ITEM(sketch.id), JSON.stringify(sketch));
    writeIndex([...readIndex().filter((m) => m.id !== sketch.id), meta]);
  },
  async remove(id) {
    localStorage.removeItem(ITEM(id));
    writeIndex(readIndex().filter((m) => m.id !== id));
  },
};

function readIndex(): SketchMeta[] {
  try {
    return (JSON.parse(localStorage.getItem(INDEX) ?? '[]') as SketchMeta[]).filter((m) => m && typeof m.id === 'string');
  } catch {
    return [];
  }
}

function writeIndex(index: SketchMeta[]): void {
  localStorage.setItem(INDEX, JSON.stringify(index));
}

interface SketchRow {
  id: string;
  tool: string;
  name: string;
  summary: string | null;
  updated_at: string;
  data?: unknown;
}

const metaOf = (r: SketchRow): SketchMeta => ({
  id: r.id,
  tool: r.tool,
  name: r.name,
  updatedAt: Date.parse(r.updated_at),
  ...(r.summary ? { summary: r.summary } : {}),
});

/** The signed-in user's sketches in the `sketches` table (row-level security keeps them private). */
export function cloudSketchStore(db: SupabaseClient): SketchStore {
  const table = () => db.from('sketches');
  return {
    async list(tool) {
      const { data, error } = await table()
        .select('id, tool, name, summary, updated_at')
        .eq('tool', tool)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data as SketchRow[]).map(metaOf);
    },
    async load<T>(id: string) {
      const { data, error } = await table().select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? ({ ...metaOf(data as SketchRow), data: (data as SketchRow).data } as StoredSketch<T>) : null;
    },
    async save(s) {
      const row = {
        id: s.id,
        tool: s.tool,
        name: s.name,
        summary: s.summary ?? null,
        data: s.data,
        updated_at: new Date(s.updatedAt).toISOString(),
      };
      const { error } = await table().upsert(row, { onConflict: 'owner,id' });
      if (error) throw error;
    },
    async remove(id) {
      const { error } = await table().delete().eq('id', id);
      if (error) throw error;
    },
  };
}

/**
 * The device and the cloud kept in step: the device always has a copy (works offline, instant);
 * the cloud gets every save and wins when its copy is newer. Cloud failures never block the user.
 */
export function syncedSketchStore(
  local: SketchStore,
  cloud: SketchStore,
  onError: (e: unknown) => void = () => {},
): SketchStore & { sync(tool: string): Promise<void> } {
  const quiet = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (e) {
      onError(e);
      return fallback;
    }
  };
  return {
    async list(tool) {
      const [mine, theirs] = await Promise.all([local.list(tool), quiet(cloud.list(tool), [])]);
      const all = new Map<string, SketchMeta>();
      for (const m of [...mine, ...theirs]) {
        const prev = all.get(m.id);
        if (!prev || m.updatedAt > prev.updatedAt) all.set(m.id, m);
      }
      return [...all.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async load<T>(id: string) {
      const [mine, theirs] = await Promise.all([local.load<T>(id), quiet(cloud.load<T>(id), null)]);
      if (theirs && (!mine || theirs.updatedAt > mine.updatedAt)) {
        await local.save(theirs);
        return theirs;
      }
      return mine;
    },
    async save(s) {
      await local.save(s);
      await quiet(cloud.save(s), undefined);
    },
    async remove(id) {
      await local.remove(id);
      await quiet(cloud.remove(id), undefined);
    },
    /** Uploads what only (or newer) on this device, downloads what only (or newer) in the cloud. */
    async sync(tool) {
      const [mine, theirs] = await Promise.all([local.list(tool), quiet(cloud.list(tool), null)]);
      if (!theirs) return;
      const cloudBy = new Map(theirs.map((m) => [m.id, m]));
      const localBy = new Map(mine.map((m) => [m.id, m]));
      for (const m of mine) {
        const c = cloudBy.get(m.id);
        if (!c || m.updatedAt > c.updatedAt) {
          const s = await local.load(m.id);
          if (s) await quiet(cloud.save(s), undefined);
        }
      }
      for (const c of theirs) {
        const l = localBy.get(c.id);
        if (!l || c.updatedAt > l.updatedAt) {
          const s = await quiet(cloud.load(c.id), null);
          if (s) await local.save(s);
        }
      }
    },
  };
}

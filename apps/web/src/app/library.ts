/**
 * The sketch library: every sketch of a tool, saved by name. Storage is behind `SketchStore`, so a
 * cloud backend (accounts, sync) can replace the local one without touching the tools.
 */
export interface SketchMeta {
  readonly id: string;
  readonly tool: string;
  readonly name: string;
  readonly updatedAt: number;
  /** One line shown in lists, e.g. "6 piles · 9 measurements". */
  readonly summary?: string;
}

export interface StoredSketch<T = unknown> extends SketchMeta {
  readonly data: T;
}

export interface SketchStore {
  list(tool: string): SketchMeta[];
  load<T>(id: string): StoredSketch<T> | null;
  save<T>(sketch: StoredSketch<T>): void;
  remove(id: string): void;
}

const INDEX = 'buildkit/library/v1';
const ITEM = (id: string) => `buildkit/library/v1/${id}`;

/** Library in this browser's localStorage (an index plus one entry per sketch). */
export const localSketchStore: SketchStore = {
  list(tool) {
    return readIndex()
      .filter((m) => m.tool === tool)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
  load<T>(id: string) {
    try {
      const raw = localStorage.getItem(ITEM(id));
      return raw ? (JSON.parse(raw) as StoredSketch<T>) : null;
    } catch {
      return null;
    }
  },
  save(sketch) {
    const { data: _data, ...meta } = sketch;
    localStorage.setItem(ITEM(sketch.id), JSON.stringify(sketch));
    writeIndex([...readIndex().filter((m) => m.id !== sketch.id), meta]);
  },
  remove(id) {
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

import { describe, expect, it } from 'vitest';
import { syncedSketchStore, type SketchMeta, type SketchStore, type StoredSketch } from './library';

function memory(): SketchStore & { items: Map<string, StoredSketch> } {
  const items = new Map<string, StoredSketch>();
  return {
    items,
    async list(tool) {
      return [...items.values()].filter((s) => s.tool === tool).map(({ data: _d, ...m }) => m as SketchMeta);
    },
    async load<T>(id: string) {
      return (items.get(id) as StoredSketch<T>) ?? null;
    },
    async save(s) {
      items.set(s.id, s);
    },
    async remove(id) {
      items.delete(id);
    },
  };
}
const sk = (id: string, updatedAt: number, name = id): StoredSketch => ({ id, tool: 'piles', name, updatedAt, data: { v: updatedAt } });

describe('syncedSketchStore', () => {
  it('saves to both and lists the newest copy of each sketch', async () => {
    const local = memory();
    const cloud = memory();
    const s = syncedSketchStore(local, cloud);
    await s.save(sk('a', 1));
    cloud.items.set('a', sk('a', 5, 'renamed elsewhere'));
    cloud.items.set('b', sk('b', 3));
    const list = await s.list('piles');
    expect(list.map((m) => [m.id, m.name])).toEqual([
      ['a', 'renamed elsewhere'],
      ['b', 'b'],
    ]);
  });

  it('loads the newer copy and keeps it on the device', async () => {
    const local = memory();
    const cloud = memory();
    local.items.set('a', sk('a', 1));
    cloud.items.set('a', sk('a', 9));
    const s = syncedSketchStore(local, cloud);
    expect((await s.load('a'))?.updatedAt).toBe(9);
    expect(local.items.get('a')?.updatedAt).toBe(9);
  });

  it('sync uploads device-only sketches and downloads cloud-only ones', async () => {
    const local = memory();
    const cloud = memory();
    local.items.set('mine', sk('mine', 2));
    cloud.items.set('theirs', sk('theirs', 4));
    await syncedSketchStore(local, cloud).sync('piles');
    expect(cloud.items.has('mine')).toBe(true);
    expect(local.items.has('theirs')).toBe(true);
  });

  it('keeps working when the cloud fails', async () => {
    const local = memory();
    const broken: SketchStore = {
      list: () => Promise.reject(new Error('offline')),
      load: () => Promise.reject(new Error('offline')),
      save: () => Promise.reject(new Error('offline')),
      remove: () => Promise.reject(new Error('offline')),
    };
    const errors: unknown[] = [];
    const s = syncedSketchStore(local, broken, (e) => errors.push(e));
    await s.save(sk('a', 1));
    expect((await s.list('piles')).map((m) => m.id)).toEqual(['a']);
    expect(errors.length).toBeGreaterThan(0);
  });
});

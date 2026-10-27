import { describe, expect, it } from 'vitest';
import { en } from './locales/en';
import { ru } from './locales/ru';

type Tree = { readonly [k: string]: string | Tree };

function leaves(t: Tree, prefix = ''): string[] {
  return Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : leaves(v, `${prefix}${k}.`)));
}

const PLURAL = /_(zero|one|two|few|many|other)$/;
const base = (k: string) => k.replace(PLURAL, '');

describe('translations', () => {
  const source = leaves(en as unknown as Tree);

  it('Russian has every English string (and nothing stale)', () => {
    const target = leaves(ru as unknown as Tree);
    const missing = source.filter((k) => !PLURAL.test(k) && !target.includes(k));
    const stale = target.filter((k) => !PLURAL.test(k) && !source.includes(k));
    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('Russian has all four plural forms where English has a plural', () => {
    const target = new Set(leaves(ru as unknown as Tree));
    const plurals = [...new Set(source.filter((k) => PLURAL.test(k)).map(base))];
    const incomplete = plurals.filter((b) => !['one', 'few', 'many', 'other'].every((f) => target.has(`${b}_${f}`)));
    expect(incomplete).toEqual([]);
  });

  it('keeps the same {{placeholders}} in every translation', () => {
    const get = (t: Tree, path: string) =>
      path.split('.').reduce<string | Tree | undefined>((n, k) => (n && typeof n !== 'string' ? n[k] : undefined), t);
    const vars = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
    const bad = source.filter((k) => {
      const e = get(en as unknown as Tree, k);
      const r = get(ru as unknown as Tree, PLURAL.test(k) ? `${base(k)}_other` : k) ?? get(ru as unknown as Tree, k);
      return (
        typeof e === 'string' &&
        typeof r === 'string' &&
        vars(e)
          .filter((v) => v !== 'count')
          .join() !==
          vars(r)
            .filter((v) => v !== 'count')
            .join()
      );
    });
    expect(bad).toEqual([]);
  });
});

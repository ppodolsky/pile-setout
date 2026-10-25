import { distance, projectT, references, type Pile, type PileDef, type PileKind } from './deps';

/** Piles that (directly or through others) depend on `id` — they can't be its references. */
export function dependents(piles: readonly Pile[], id: string): Set<string> {
  const out = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of piles)
      if (!out.has(p.id) && references(p.def).some((r) => r === id || out.has(r))) {
        out.add(p.id);
        grew = true;
      }
  }
  return out;
}

/** Piles that may serve as references for `p` (not itself, not anything that depends on it). */
export function referenceCandidates(piles: readonly Pile[], p: Pile): Pile[] {
  const deps = dependents(piles, p.id);
  return piles.filter((q) => q.id !== p.id && !deps.has(q.id)).sort((a, b) => distance(a, p) - distance(b, p));
}

/** A definition of the given kind that keeps the pile exactly where it is now. */
export function convertDef(p: Pile, kind: PileKind, piles: readonly Pile[]): PileDef | null {
  if (kind === 'fixed') return { kind: 'fixed', x: p.x, y: p.y };
  const refs = referenceCandidates(piles, p);
  if (kind === 'polar') {
    const from = refs[0];
    if (!from) return null;
    return {
      kind: 'polar',
      from: from.id,
      distance: distance(from, p),
      angle: (Math.atan2(p.y - from.y, p.x - from.x) * 180) / Math.PI,
      ref: null,
    };
  }
  // between: the pair whose line passes closest to the pile
  let best: { from: Pile; to: Pile; off: number } | null = null;
  for (let i = 0; i < refs.length; i++)
    for (let j = i + 1; j < refs.length; j++) {
      const a = refs[i]!;
      const b = refs[j]!;
      const t = projectT(p, a, b);
      const off = Math.hypot(a.x + (b.x - a.x) * t - p.x, a.y + (b.y - a.y) * t - p.y);
      if (!best || off < best.off) best = { from: a, to: b, off };
    }
  if (!best) return null;
  return { kind: 'between', from: best.from.id, to: best.to.id, by: 'ratio', t: projectT(p, best.from, best.to) };
}

/** Re-expresses a definition with different references so the pile does not move. */
export function rebase(p: Pile, def: PileDef, piles: readonly Pile[]): PileDef {
  const at = (id: string) => piles.find((q) => q.id === id);
  if (def.kind === 'between') {
    const a = at(def.from);
    const b = at(def.to);
    if (!a || !b) return def;
    const t = projectT(p, a, b);
    return def.by === 'ratio' ? { ...def, t } : { ...def, distance: t * distance(a, b) };
  }
  if (def.kind === 'polar') {
    const a = at(def.from);
    if (!a) return def;
    const r = def.ref ? at(def.ref) : null;
    const base = r ? Math.atan2(r.y - a.y, r.x - a.x) : 0;
    let angle = ((Math.atan2(p.y - a.y, p.x - a.x) - base) * 180) / Math.PI;
    angle = ((((angle + 180) % 360) + 360) % 360) - 180;
    return { ...def, distance: distance(a, p), angle };
  }
  return def;
}

import { useFieldworkUi } from './ui';
import type { Pile } from '@buildkit/pile-field';

/** Along the row / across / diagonal, from the design positions. */
export function pairKind(piles: readonly Pile[], a: string, b: string): string {
  const pa = piles.find((p) => p.id === a);
  const pb = piles.find((p) => p.id === b);
  if (!pa || !pb) return '';
  if (Math.abs(pa.y - pb.y) < 0.6) return 'along the row';
  if (Math.abs(pa.x - pb.x) < 0.6) return 'across';
  return 'diagonal';
}

/** Names of the four field sides by the piles on them (as seen on the plan, Y up). */
export function sideNames(piles: readonly Pile[]): Record<'x+' | 'x-' | 'y+' | 'y-', string> {
  if (!piles.length) return { 'x+': '', 'x-': '', 'y+': '', 'y-': '' };
  const xs = piles.map((p) => p.x);
  const ys = piles.map((p) => p.y);
  const col = (x: number) =>
    piles
      .filter((p) => Math.abs(p.x - x) < 0.6)
      .sort((a, b) => b.y - a.y)
      .map((p) => p.label);
  const row = (y: number) =>
    piles
      .filter((p) => Math.abs(p.y - y) < 0.6)
      .sort((a, b) => a.x - b.x)
      .map((p) => p.label);
  const name = (arr: string[]) => (arr.length > 2 ? `${arr[0]}–${arr[arr.length - 1]}` : arr.join('/'));
  return {
    'x+': name(col(Math.max(...xs))),
    'x-': name(col(Math.min(...xs))),
    'y+': name(row(Math.max(...ys))),
    'y-': name(row(Math.min(...ys))),
  };
}

/** Moves the focus to a measurement's reading field (switching to the Measure panel on phones). */
export function focusReading(id: string): void {
  useFieldworkUi.getState().setTab('measure');
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>(`[data-reading="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    el.select();
  });
}

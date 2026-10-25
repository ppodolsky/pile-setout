import { distance } from '@buildkit/geometry';
import { fmt } from '@/lib/format';
import { MiniMap } from '../drawing/cards';
import { pileLabel, useFieldwork } from '../model/derived';
import { useProject } from '../model/store';
import { pairKind } from './helpers';
import { useFieldworkUi } from './ui';

/**
 * Phones: while a reading is typed, a strip pinned under the header shows which pair it is — the
 * field with that tape drawn on it, the labels and the design distance.
 */
export function MeasuringStrip() {
  const focused = useFieldworkUi((s) => s.focused);
  const m = useProject((s) => s.fieldwork.measurements.find((x) => x.id === focused));
  const { piles } = useFieldwork();
  if (!m) return null;
  const a = piles.find((p) => p.id === m.a);
  const b = piles.find((p) => p.id === m.b);
  if (!a || !b) return null;
  return (
    <div className="sticky top-[6.75rem] z-10 -mx-3 flex items-center gap-3 border-b bg-background/95 px-3 py-2 backdrop-blur lg:hidden">
      <MiniMap piles={piles} highlight={[m.a, m.b]} line={[m.a, m.b]} width={140} />
      <div className="min-w-0">
        <div className="font-mono text-lg font-semibold">
          {pileLabel(piles, m.a)} ↔ {pileLabel(piles, m.b)}
        </div>
        <div className="text-xs text-muted-foreground">
          {pairKind(piles, m.a, m.b)} · design ≈ {fmt(distance(a, b), 0)} mm
        </div>
      </div>
    </div>
  );
}

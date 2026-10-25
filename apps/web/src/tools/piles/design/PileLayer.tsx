import { toScreen, useView } from '@/drawing';
import { isSelected, useCadEditor } from '@/cad';
import { PileHead, PileMark } from '../drawing/layers';
import { useDesign } from '../model/derived';

/** Piles on their points: square heads (own size), crosshair and label; styled by state. */
export function PileLayer() {
  const v = useView();
  const { piles, status } = useDesign();
  const selection = useCadEditor((s) => s.selection);
  return (
    <g>
      {piles.map((p) => {
        const on = isSelected(selection, { kind: 'point', id: p.point });
        const tone = on
          ? 'selected'
          : p.setout === 'derive'
            ? 'param'
            : !status.determined.has(p.point)
              ? 'free'
              : p.shared
                ? 'shared'
                : 'fixed';
        return <PileHead key={p.id} pile={p} head={p.head} tone={tone} />;
      })}
      {piles.map((p) => (
        <PileMark key={p.id} pile={p} color={status.determined.has(p.point) ? 'var(--draw-ink)' : 'var(--draw-free)'} />
      ))}
      {piles
        .filter((p) => p.diameter)
        .map((p) => {
          const s = toScreen(v, p);
          return (
            <circle
              key={`d${p.id}`}
              cx={s.x}
              cy={s.y}
              r={(p.diameter! * v.s) / 2}
              fill="none"
              stroke="var(--draw-muted)"
              strokeDasharray="2 2"
            />
          );
        })}
    </g>
  );
}

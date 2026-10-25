import type { Vec2 } from '@buildkit/geometry';
import type { Pile } from '@buildkit/pile-field';
import { toScreen, useView } from '@/drawing';

/** Field work: the strings and tapes used to set out the piles that aren't measured. */
export function SetoutLines({
  steps,
  map,
}: {
  steps: readonly { pile: Pile; instruction: { kind: 'string'; from: Pile; to: Pile } | { kind: 'swing'; a: Pile; b: Pile } | null }[];
  map: (p: Vec2) => Vec2;
}) {
  const v = useView();
  const S = (p: Vec2) => toScreen(v, map(p));
  return (
    <g stroke="var(--draw-param)" fill="none" opacity={0.85}>
      {steps.map(({ pile, instruction: ins }) => {
        if (!ins) return null;
        const P = S(pile);
        if (ins.kind === 'string') {
          const a = S(ins.from);
          const b = S(ins.to);
          return <line key={pile.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={1} strokeDasharray="6 4" />;
        }
        const a = S(ins.a);
        const b = S(ins.b);
        return (
          <g key={pile.id} strokeWidth={0.9} strokeDasharray="3 3">
            <line x1={a.x} y1={a.y} x2={P.x} y2={P.y} />
            <line x1={b.x} y1={b.y} x2={P.x} y2={P.y} />
          </g>
        );
      })}
    </g>
  );
}

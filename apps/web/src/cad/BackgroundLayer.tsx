import { useTranslation } from 'react-i18next';
import { drawingTransform, shapeOutline, type BackgroundDrawing, type Shape } from '@buildkit/cad';
import { applyRigid, type RigidTransform, type Vec2 } from '@buildkit/geometry';
import { Label, toScreen, useView } from '@/drawing';

const STYLE = {
  outline: { fill: 'var(--draw-container)', stroke: 'var(--draw-container-stroke)', width: 1.5, dash: undefined, opacity: 1 },
  detail: {
    fill: 'color-mix(in oklch, var(--draw-container-stroke) 10%, transparent)',
    stroke: 'var(--draw-container-stroke)',
    width: 0.8,
    dash: '3 2',
    opacity: 0.8,
  },
  fill: { fill: 'var(--draw-container-stroke)', stroke: 'none', width: 0, dash: undefined, opacity: 0.15 },
} as const;

/**
 * Background drawings (reference geometry such as container outlines), drawn muted under
 * everything else. `frame` places them in the field's frame in field work (identity in design).
 */
export function BackgroundLayer({ drawings, frame }: { drawings: readonly BackgroundDrawing[]; frame?: RigidTransform }) {
  const v = useView();
  const { t } = useTranslation('cad');
  const title = (s: string | undefined) =>
    s ? t(`background.titles.${s}` as 'background.titles.Corner casting', { defaultValue: s }) : undefined;
  return (
    <g pointerEvents="none">
      {drawings
        .filter((d) => d.visible)
        .map((d) => {
          const T = drawingTransform(d);
          const place = (p: Vec2) => toScreen(v, frame ? applyRigid(frame, p) : p);
          const shape = (s: Shape, i: number) => {
            if (s.kind === 'text') {
              const at = applyRigid(T, { x: s.x, y: s.y });
              return (
                <Label
                  key={i}
                  at={frame ? applyRigid(frame, at) : at}
                  dy={4}
                  textAnchor="middle"
                  size={s.size}
                  fill="var(--draw-muted)"
                  opacity={0.6}
                >
                  {s.text}
                </Label>
              );
            }
            const { points, closed } = shapeOutline(s, T);
            const st = STYLE[s.style];
            const pts = points
              .map((p) => place(p))
              .map((q) => `${q.x},${q.y}`)
              .join(' ');
            const common = {
              fill: closed ? st.fill : 'none',
              stroke: st.stroke,
              strokeWidth: st.width,
              strokeDasharray: st.dash,
              opacity: st.opacity,
            };
            const tt = 'title' in s ? title(s.title) : undefined;
            return closed ? (
              <polygon key={i} points={pts} {...common}>
                {tt && <title>{tt}</title>}
              </polygon>
            ) : (
              <polyline key={i} points={pts} {...common}>
                {tt && <title>{tt}</title>}
              </polyline>
            );
          };
          return <g key={d.id}>{d.shapes.map(shape)}</g>;
        })}
    </g>
  );
}
